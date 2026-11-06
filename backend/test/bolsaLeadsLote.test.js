// Bitrix por lotes: pocas llamadas HTTP para muchos leads.
const test = require('node:test');
const assert = require('node:assert/strict');
process.env.BITRIX_NOVONET_URL = 'https://bitrix.test/rest/1/x';
const llamadas = [];
// Bitrix simulado: 120 leads; cada lead tiene 3 cambios de etapa; el lead 1 tiene 260 (para probar páginas extra)
const historialDe = (id) => Array.from({ length: id === '1' ? 260 : 3 }, (_, k) => ({ OWNER_ID: id, STAGE_ID: k ? 'C7:PREPARATION' : 'C7:NEW', CATEGORY_ID: 7, CREATED_TIME: new Date(Date.UTC(2026, 10, 1, 10, k)).toISOString() }));
global.fetch = async (url, opt) => {
  const { cmd } = JSON.parse(opt.body);
  llamadas.push(Object.keys(cmd).length);
  assert.ok(Object.keys(cmd).length <= 50);
  const result = {}, total = {};
  for (const [k, q] of Object.entries(cmd)) {
    const params = new URLSearchParams(q.split('?')[1]);
    const ids = [...params.entries()].filter(([key]) => /^filter\[(ID|OWNER_ID)\]\[\d+\]$/.test(key)).map(([, v]) => v);
    if (q.startsWith('crm.deal.list')) { result[k] = ids.map((id) => ({ ID: id, STAGE_ID: 'C7:NEW', CATEGORY_ID: '7', ASSIGNED_BY_ID: String(Number(id) % 3 + 1) })); }
    else if (q.startsWith('crm.dealcategory.stage.list')) result[k] = [{ STATUS_ID: 'C7:NEW', NAME: 'Contacto nuevo' }, { STATUS_ID: 'C7:PREPARATION', NAME: 'Seguimiento' }];
    else if (q.startsWith('user.get')) result[k] = [{ ID: params.get('ID'), NAME: 'Asesor', LAST_NAME: params.get('ID') }];
    else if (q.startsWith('crm.stagehistory.list')) {
      const todos = ids.flatMap(historialDe);
      const start = Number(params.get('start') || 0);
      result[k] = { items: todos.slice(start, start + 50) }; total[k] = todos.length;
    }
  }
  return { json: async () => ({ result: { result, result_total: total, result_error: {} } }) };
};
const { infoDealsBitrix, historialEtapas } = require('../src/controllers/bolsaLeads.controller');
const ids = Array.from({ length: 120 }, (_, i) => String(i + 1));

test('etapa y responsable de 120 leads en muy pocas llamadas', async () => {
  llamadas.length = 0;
  const r = await infoDealsBitrix(ids);
  assert.equal(r.size, 120);
  assert.deepEqual(r.get('5'), { etapa: 'Contacto nuevo', asesor: 'Asesor 3', categoria: '7' });
  assert.ok(llamadas.length <= 3, `llamadas: ${llamadas.length}`);   // deals + etapas + usuarios
});

test('historial completo (incluye un lead con 260 cambios) en pocas llamadas', async () => {
  llamadas.length = 0;
  const h = await historialEtapas(ids);
  assert.equal(h.get('2').length, 3);
  assert.equal(h.get('1').length, 260);
  assert.equal(h.get('2')[1].etapa, 'Seguimiento');
  assert.ok(llamadas.length <= 4, `llamadas: ${llamadas.length}`);
});
