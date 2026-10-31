// Simula Bitrix y Postgres para probar el flujo de Bolsa Leads sin tocar nada real.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const src = (p) => require.resolve(path.join(__dirname, '../src', p));
const mock = (p, exports) => { require.cache[src(p)] = { id: src(p), filename: src(p), loaded: true, exports }; };

// ── Base falsa ──────────────────────────────────────────────────────────────
const db = { config: null, entregas: [] };
const reset = (cfg = {}) => {
  db.config = { id: 1, activo: true, modo: 'proporcion', patron: 'NVNVNNVNVN', posicion: 0, encadenar_reparto: true, categoria_origen: 43, ...cfg };
  db.entregas = [];
};
const query = async (sql, p = []) => {
  if (/^(BEGIN|COMMIT|ROLLBACK)/.test(sql)) return { rows: [] };
  if (/FROM bolsa_leads_config/.test(sql)) return { rows: [{ ...db.config }] };
  if (/SELECT empresa FROM bolsa_leads_entregas/.test(sql)) return { rows: db.entregas.filter((e) => e.deal === p[0] && e.estado === 'entregado') };
  if (/UPDATE bolsa_leads_config SET posicion/.test(sql)) { db.config.posicion = p[0]; return { rows: [] }; }
  if (/INSERT INTO bolsa_leads_entregas/.test(sql)) {
    const estado = /'entregado'/.test(sql) ? 'entregado' : p[4];
    const e = { id: db.entregas.length + 1, deal: p[0], empresa: p[1], casilla: p[2], estado, detalle: p[4] };
    db.entregas.push(e); return { rows: [{ id: e.id }] };
  }
  if (/UPDATE bolsa_leads_entregas SET reparto_resultado/.test(sql)) {
    db.entregas.find((e) => e.id === p[0]).reparto = p[1]; return { rows: [] };
  }
  throw new Error('SQL no simulado: ' + sql);
};
mock('config/dbErp.js', { query, connect: async () => ({ query, release() {} }) });

// ── Bitrix falso: pipelines 43 (Bolsa), 7 (NETLIFE NUEVO), 51 (VELSA) ───────
const deals = {};
let fallarMovimiento = false;
mock('services/bitrix.service.js', {
  bitrixCallNovonet: async (method, params) => {
    if (method === 'crm.deal.get') return { result: deals[params.id] || null };
    if (method === 'crm.category.list') return { result: { categories: [{ id: 43, name: 'Bolsa Leads' }, { id: 7, name: 'NETLIFE NUEVO' }, { id: 51, name: 'VELSA' }, { id: 41, name: 'SEMILLERO' }] } };
    if (method === 'crm.dealcategory.stage.list') {
      // Semillero simulado sin etapa "Contacto nuevo": se usa la primera por SORT
      if (String(params.id) === '41') return { result: [{ NAME: 'Seguimiento', STATUS_ID: 'C41:PREPARATION', SORT: 20 }, { NAME: 'Nuevo', STATUS_ID: 'C41:NEW', SORT: 10 }] };
      return { result: [{ NAME: 'Contacto nuevo', STATUS_ID: `C${params.id}:NEW` }] };
    }
    if (method === 'crm.item.update') {
      if (fallarMovimiento) throw new Error('Bitrix caído');
      Object.assign(deals[params.id], { CATEGORY_ID: String(params.fields.categoryId), STAGE_ID: params.fields.stageId });
      return { result: { item: { categoryId: Number(params.fields.categoryId) } } };
    }
    throw new Error('Método no simulado: ' + method);
  },
});
const alRepartidor = [];
mock('controllers/gestionablesWebhook.controller.js', {
  reparto: (empresa) => ({ recibirGestionable: async (req, res) => { alRepartidor.push([empresa, req.query.id]); res.status(200).send('OK'); } }),
});
let conectadosSim = null;   // null = Bitrix Live sin respuesta (no redirige)
mock('shared/bolsaLeadsConectados.js', {
  conectadosPorEmpresa: async () => conectadosSim && Object.fromEntries(Object.entries(conectadosSim).map(([e, n]) => [e, { conectados: n, nombres: [] }])),
});
process.env.GESTIONABLES_CATEGORY_ID = '';
const { distribuir } = require('../src/controllers/bolsaLeads.controller');
const nuevoDeal = (id) => (deals[id] = { ID: String(id), CATEGORY_ID: '43', STAGE_ID: 'C43:NEW' });

test('20 leads: 12 Novonet / 8 Velsa en el orden del patrón, y pasan al repartidor', async () => {
  reset(); alRepartidor.length = 0;
  const orden = [];
  for (let i = 1; i <= 20; i++) {
    nuevoDeal(i);
    const r = await distribuir(String(i));
    assert.equal(r.estado, 'entregado');
    orden.push(r.empresa === 'novonet' ? 'N' : 'V');
  }
  assert.equal(orden.join(''), 'NVNVNNVNVN'.repeat(2));
  assert.equal(deals[1].CATEGORY_ID, '7');
  assert.equal(deals[2].CATEGORY_ID, '51');
  assert.equal(deals[2].STAGE_ID, 'C51:NEW');
  assert.equal(alRepartidor.length, 20);
  assert.deepEqual(alRepartidor[1], ['velsa', '2']);
});

test('el mismo lead no se entrega dos veces ni mueve el ciclo', async () => {
  reset();
  nuevoDeal(100);
  await distribuir('100');
  const r = await distribuir('100'); // ya está en Netlife → no está en Bolsa
  assert.equal(r.estado, 'omitido');
  assert.equal(db.config.posicion, 1);
});

test('si Bitrix falla, queda como error y el ciclo NO avanza', async () => {
  reset();
  nuevoDeal(200);
  fallarMovimiento = true;
  const r = await distribuir('200');
  fallarMovimiento = false;
  assert.equal(r.estado, 'error');
  assert.equal(db.config.posicion, 0);
  assert.equal(deals[200].CATEGORY_ID, '43');
});

test('apagada no toca el lead; modo solo Velsa entrega todo a Velsa', async () => {
  reset({ activo: false });
  nuevoDeal(300);
  assert.equal((await distribuir('300')).estado, 'omitido');
  assert.equal(deals[300].CATEGORY_ID, '43');
  reset({ modo: 'solo_velsa', posicion: 4 });
  for (const id of [301, 302, 303]) { nuevoDeal(id); assert.equal((await distribuir(String(id))).empresa, 'velsa'); }
  assert.equal(db.config.posicion, 4);
});

test('ciclo de 12 con SEMILLERO: 7 / 4 / 1, y Semillero no pasa por el repartidor', async () => {
  reset({ patron: 'NVNNVNSNVNNV' }); alRepartidor.length = 0;
  const cuenta = { novonet: 0, velsa: 0, semillero: 0 };
  for (let i = 400; i < 412; i++) {
    nuevoDeal(i);
    const r = await distribuir(String(i));
    assert.equal(r.estado, 'entregado');
    cuenta[r.empresa]++;
  }
  assert.deepEqual(cuenta, { novonet: 7, velsa: 4, semillero: 1 });
  assert.equal(deals[406].CATEGORY_ID, '41');          // casilla 7 = S
  assert.equal(deals[406].STAGE_ID, 'C41:NEW');
  assert.equal(alRepartidor.length, 11);                // los 11 de Novonet/Velsa
  assert.match(db.entregas.find((e) => e.deal === '406').reparto, /Sin repartidor/);
  assert.equal(db.config.posicion, 0);                  // volvió a la casilla 1
});

test('nadie conectado en SEMILLERO: su casilla pasa a NOVONET y queda anotado', async () => {
  reset({ patron: 'NVNNVNSNVNNV', posicion: 6 });
  conectadosSim = { novonet: 4, velsa: 2, semillero: 0 };
  nuevoDeal(500);
  const r = await distribuir('500');
  conectadosSim = null;
  assert.deepEqual([r.empresa, r.casilla], ['novonet', 8]);
  assert.equal(deals[500].CATEGORY_ID, '7');
  assert.equal(db.config.posicion, 8);
  assert.match(db.entregas.at(-1).detalle, /casilla 7 era SEMILLERO sin asesores conectados/);
});

test('opción de redirigir apagada: respeta la casilla aunque no haya nadie', async () => {
  reset({ patron: 'NVNNVNSNVNNV', posicion: 6, redirigir_sin_conectados: false });
  conectadosSim = { novonet: 4, velsa: 2, semillero: 0 };
  nuevoDeal(501);
  const r = await distribuir('501');
  conectadosSim = null;
  assert.equal(r.empresa, 'semillero');
});
