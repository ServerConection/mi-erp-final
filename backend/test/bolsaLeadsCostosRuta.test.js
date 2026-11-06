// Prueba el endpoint GET /costos de punta a punta con bases simuladas.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const src = (p) => require.resolve(path.join(__dirname, '../src', p));
const mock = (p, exports) => { require.cache[src(p)] = { id: src(p), filename: src(p), loaded: true, exports }; };

const sqls = [];
mock('middleware/auth.js', { verificarToken: (req, res, next) => { req.user = { perfil: 'GERENCIA' }; next(); } });
// Bitrix: el lead 11 (VELSA) tiene origen en Bitrix aunque el webhook no lo guardó
mock('controllers/bolsaLeads.controller.js', {
  origenesDesdeBitrix: async (ids) => {
    assert.deepEqual(ids, ['11']);
    return new Map([['11', { id: '7|OPENLINE', nombre: 'Formulario Velsa 1' }]]);
  },
  infoDealsBitrix: async () => new Map([['10', { etapa: 'ATC', asesor: 'ANA' }], ['11', { etapa: 'VENTA SUBIDA', asesor: 'ROSA' }]]),
  leerConfig: async () => ({ categoria_origen: 43 }),
  historialEtapas: async () => new Map([['11', [
    { etapa: 'CONTACTO NUEVO', categoria: '51', t: '2026-11-01T20:00:05Z' },
    { etapa: 'VENTA SUBIDA', categoria: '51', t: '2026-11-01T22:00:00Z' },
  ]]]),
  leadsPorPipeline: async (desde) => (desde < '2026-11-01' ? { novonet: 20, velsa: 10, semillero: 0 } : { novonet: 25, velsa: 10, semillero: 5 }),
});
mock('config/dbErp.js', { query: async (sql) => {
  sqls.push(sql);
  if (/MIN\(/.test(sql)) return { rows: [{ desde: '2026-11-01', hoy: '2026-11-03' }] };
  if (/estado = 'en_espera'/.test(sql)) return { rows: [{ n: 4 }] };
  if (/origen_lead/.test(sql)) return { rows: [{ deal: '10', id: 'CALL', nombre: 'Base 593-111' }] };
  return { rows: [
    { deal: '10', empresa: 'novonet', fecha: '2026-11-01', hora: 9, dow: 7, via: 'pendientes', detalle: 'Movido — casilla 7 era SEMILLERO sin asesores conectados' },
    { deal: '11', empresa: 'velsa', fecha: '2026-11-01', hora: 15, dow: 7, via: 'webhook', detalle: 'Movido', entregado_en: '2026-11-01T20:00:00Z' },
  ] };
} });
mock('config/db.js', { query: async (sql, p) => {
  sqls.push(sql);
  if (/SUM\(monto_usd\) FROM public.novonet_inversion_redes/.test(sql)) return { rows: [{ total: p[0] < '2026-11-01' ? 90 : 60 }] };
  if (/novonet_inversion_redes/.test(sql)) return { rows: [{ fecha: '2026-11-01', origen: '__WINTRACKER_ARTS__', monto: 40 }] };
  if (/velsa_inversion_redes/.test(sql)) return { rows: [{ fecha: '2026-11-01', origen: '__WINTRACKER_VELSA__', monto: 20 }] };
  if (/bitrix_webhook_leads/.test(sql)) throw new Error('no debería consultar el webhook si Bitrix respondió');
  if (/novonet_lineas_canal/.test(sql)) return { rows: [{ origen: 'BASE 593-111', agencia: 'ARST' }] };
  if (/velsa_lineas_canal/.test(sql)) return { rows: [{ origen: 'formulario velsa 1', agencia: 'VELSA' }] };
  if (/distribuidor_autorizado/.test(sql)) return { rows: p[0] < '2026-11-01' ? [{ empresa: 'NOVONET', n: 3 }] : [{ empresa: 'NOVONET', n: 2 }, { empresa: 'VELSA', n: 2 }] };
  if (/envios_ventas/.test(sql)) { assert.deepEqual(p[0], ['10', '11']); return { rows: [{ deal: '11', ventas: 1, activas: 1 }] }; }
  return { rows: [] };
} });

const router = require('../src/routes/bolsaLeads.routes');
const correrEn = (ruta) => (req) => new Promise((resolve) => {
  const capa = router.stack.find((l) => l.route?.path === ruta);
  const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(b) { resolve({ code: this.statusCode, body: b }); } };
  capa.route.stack[0].handle(req, res);
});
const correr = correrEn('/costos');

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

test('GET /analisis: embudo, asesores, hora, saltos y antes vs piloto', async () => {
  const { code, body } = await correrEn('/analisis')({ query: {} });
  assert.equal(code, 200, JSON.stringify(body));
  assert.equal(body._entregas, undefined);
  const nov = body.embudo.porEmpresa.find((x) => x.empresa === 'novonet');
  assert.deepEqual([nov.leads, nov.gestionables], [1, 0]);                        // ATC no es gestionable
  const vel = body.embudo.porEmpresa.find((x) => x.empresa === 'velsa');
  assert.deepEqual([vel.venta_subida, vel.ingresos], [1, 1]);
  assert.equal(body.asesores.find((x) => x.empresa === 'velsa').asesores[0].asesor, 'ROSA');
  assert.deepEqual(body.tiempo.porHora.map((h) => h.etiqueta), ['09:00', '15:00']);
  assert.equal(body.tiempo.enEspera, 4);
  assert.equal(body.tiempo.viaCola.leads, 1);
  assert.equal(body.tiempo.saltos.find((x) => x.empresa === 'semillero').cedidos, 1);
  const c = body.comparacion;
  assert.deepEqual([c.antes.dias, c.antes.desde, c.antes.hasta], [3, '2026-10-29', '2026-10-31']);
  assert.deepEqual([c.antes.cpl, c.piloto.cpl, c.antes.cpa, c.piloto.cpa], [3, 1.5, 30, 15]);
  assert.equal(c.cambios.cpa, -50);
  const tv = body.tiempos.porEmpresa.find((x) => x.empresa === 'velsa');
  assert.deepEqual([tv.venta_subida.mediana, tv.plazo_venta_subida_h], [2, 5]);
});

test('GET /costos no devuelve los campos internos', async () => {
  const { body } = await correr({ query: {} });
  assert.equal(body._entregas, undefined);
  assert.equal(body._db, undefined);
});
