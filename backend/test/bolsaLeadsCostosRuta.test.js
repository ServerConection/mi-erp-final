// Prueba el endpoint GET /costos de punta a punta con bases simuladas.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const src = (p) => require.resolve(path.join(__dirname, '../src', p));
const mock = (p, exports) => { require.cache[src(p)] = { id: src(p), filename: src(p), loaded: true, exports }; };

const sqls = [];
mock('middleware/auth.js', { verificarToken: (req, res, next) => { req.user = { perfil: 'GERENCIA' }; next(); } });
mock('controllers/bolsaLeads.controller.js', {});
mock('config/dbErp.js', { query: async (sql) => {
  sqls.push(sql);
  if (/MIN\(/.test(sql)) return { rows: [{ desde: '2026-11-01', hoy: '2026-11-03' }] };
  return { rows: [
    { deal: '10', empresa: 'novonet', fecha: '2026-11-01' },
    { deal: '11', empresa: 'velsa', fecha: '2026-11-01' },
  ] };
} });
mock('config/db.js', { query: async (sql, p) => {
  sqls.push(sql);
  if (/novonet_inversion_redes/.test(sql)) return { rows: [{ fecha: '2026-11-01', origen: '__WINTRACKER_ARTS__', monto: 40 }] };
  if (/velsa_inversion_redes/.test(sql)) return { rows: [{ fecha: '2026-11-01', origen: '__WINTRACKER_VELSA__', monto: 20 }] };
  if (/FROM public.bitrix_webhook_leads\b/.test(sql) && !/historial/.test(sql)) return { rows: [{ deal: '10', origen: 'Base 593-111' }] };
  if (/historial/.test(sql)) { assert.deepEqual(p[0], ['11']); return { rows: [{ deal: '11', origen: 'Formulario Velsa 1' }] }; }
  if (/novonet_lineas_canal/.test(sql)) return { rows: [{ origen: 'BASE 593-111', agencia: 'ARST' }] };
  if (/velsa_lineas_canal/.test(sql)) return { rows: [{ origen: 'formulario velsa 1', agencia: 'VELSA' }] };
  if (/envios_ventas/.test(sql)) { assert.deepEqual(p[0], ['10', '11']); return { rows: [{ deal: '11', ventas: 1, activas: 1 }] }; }
  return { rows: [] };
} });

const router = require('../src/routes/bolsaLeads.routes');
const capa = router.stack.find((l) => l.route?.path === '/costos');
const correr = (req) => new Promise((resolve) => {
  const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(b) { resolve({ code: this.statusCode, body: b }); } };
  capa.route.stack[0].handle(req, res);
});

test('GET /costos arma el reporte con inversión de las 2 tablas y ventas por ID de Bitrix', async () => {
  const { code, body } = await correr({ query: {} });
  assert.equal(code, 200);
  assert.equal(body.desde, '2026-11-01');
  assert.equal(body.totales.inversion, 60);
  const e = Object.fromEntries(body.porEmpresa.map((x) => [x.empresa, x]));
  assert.equal(e.novonet.costo, 30);
  assert.equal(e.velsa.costo, 30);
  assert.equal(e.velsa.cpa, 30);
  assert.equal(e.novonet.cpa, null);
  assert.deepEqual(body.avisos, []);
  const ag = Object.fromEntries(body.porAgencia.map((x) => [x.agencia, x]));
  assert.equal(ag.ARTS.novonet, 1);
  assert.equal(ag.VELSA.velsa, 1);
  assert.equal(ag.VELSA.ventas_velsa, 1);
  assert.equal(body.detalle.find((d) => d.deal === '10').origen, 'BASE 593-111');
});

test('GET /costos rechaza un rango al revés', async () => {
  const { code } = await correr({ query: { desde: '2026-11-05', hasta: '2026-11-01' } });
  assert.equal(code, 400);
});
