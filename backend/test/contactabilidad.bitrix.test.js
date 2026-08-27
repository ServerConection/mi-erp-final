const test = require('node:test');
const assert = require('node:assert/strict');

const { crearClienteBitrix } = require('../src/contactabilidad/contactabilidad.bitrix');

test('lista deals de todas las etapas con campos de contactabilidad', async () => {
  const llamadas = [];
  const bitrix = crearClienteBitrix({
    request: async (crm, method, params) => {
      llamadas.push({ crm, method, params });
      return { result: [], total: 0 };
    },
  });
  const crm = { empresa: 'NOVONET', categoryId: '19', campoChat: 'UF_CHAT' };

  await bitrix.listarDeals(crm, { desde: '2026-07-01', start: 0 });

  assert.equal(llamadas[0].method, 'crm.deal.list');
  assert.deepEqual(llamadas[0].params.filter, {
    CATEGORY_ID: '19',
    '>=DATE_CREATE': '2026-07-01',
  });
  assert.deepEqual(llamadas[0].params.select, [
    'ID', 'TITLE', 'DATE_CREATE', 'STAGE_ID', 'ASSIGNED_BY_ID',
    'CONTACT_ID', 'SOURCE_ID', 'UF_CHAT',
  ]);
  assert.equal(Object.hasOwn(llamadas[0].params.filter, 'STAGE_ID'), false);
});

test('consulta nombres de etapas del pipeline y datos del asesor', async () => {
  const llamadas = [];
  const bitrix = crearClienteBitrix({ request: async (_crm, method, params) => {
    llamadas.push({ method, params });
    return method === 'crm.status.list' ? { result: [{ STATUS_ID: 'C19:NEW', NAME: 'Nuevo' }] } : { result: [{ ID: '20', NAME: 'Ana', LAST_NAME: 'Paz' }] };
  } });
  const crm = { empresa: 'NOVONET', categoryId: '19' };

  const etapas = await bitrix.listarEtapas(crm);
  const asesor = await bitrix.obtenerUsuario(crm, '20');

  assert.equal(etapas[0].NAME, 'Nuevo');
  assert.equal(asesor.NAME, 'Ana');
  assert.deepEqual(llamadas, [
    { method: 'crm.status.list', params: { filter: { ENTITY_ID: 'DEAL_STAGE_19' }, order: { SORT: 'ASC' } } },
    { method: 'user.get', params: { ID: '20' } },
  ]);
});

test('consulta el catalogo de origenes con sus nombres visibles', async () => {
  const llamadas = [];
  const bitrix = crearClienteBitrix({ request: async (_crm, method, params) => {
    llamadas.push({ method, params });
    return { result: [{ STATUS_ID: '104', NAME: 'FB Messenger - Novo' }] };
  } });

  const origenes = await bitrix.listarOrigenes({ empresa: 'NOVONET' });

  assert.equal(origenes[0].NAME, 'FB Messenger - Novo');
  assert.deepEqual(llamadas, [{
    method: 'crm.status.list',
    params: { filter: { ENTITY_ID: 'SOURCE' }, order: { SORT: 'ASC' } },
  }]);
});

test('consulta contacto y mensajes sin exponer el webhook en parametros', async () => {
  const llamadas = [];
  const bitrix = crearClienteBitrix({ request: async (_crm, method, params) => {
    llamadas.push({ method, params });
    return { result: {} };
  } });
  const crm = { empresa: 'VELSA', webhook: 'https://secreto.example/rest/token' };

  await bitrix.obtenerContacto(crm, '88');
  await bitrix.obtenerChat(crm, '99');

  assert.deepEqual(llamadas, [
    { method: 'crm.contact.get', params: { id: '88' } },
    { method: 'im.dialog.messages.get', params: { DIALOG_ID: 'chat99', LIMIT: 200 } },
  ]);
});

test('usa fecha de modificacion para ciclos incrementales', async () => {
  const llamadas = [];
  const bitrix = crearClienteBitrix({ request: async (_crm, method, params) => {
    llamadas.push({ method, params });
    return { result: [], total: 0 };
  } });

  await bitrix.listarDeals({ categoryId: '19' }, { desde: '2026-08-23', hasta: '2026-08-25', campoFecha: 'DATE_MODIFY' });

  assert.equal(llamadas[0].params.filter['>=DATE_MODIFY'], '2026-08-23');
  assert.equal(llamadas[0].params.filter['<=DATE_MODIFY'], '2026-08-25T23:59:59');
  assert.equal(Object.hasOwn(llamadas[0].params.filter, '>=DATE_CREATE'), false);
});
