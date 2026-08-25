const test = require('node:test');
const assert = require('node:assert/strict');

const { crearProcesadorCrm } = require('../src/contactabilidad/contactabilidad.processor');

test('procesa un lead y persiste solo mensajes reales dentro de una transaccion', async () => {
  const guardados = [];
  const client = {};
  const bitrix = {
    listarDeals: async () => ({ result: [{
      ID: '77', TITLE: 'Lead', DATE_CREATE: '2026-08-24T09:00:00Z', STAGE_ID: 'NUEVO',
      ASSIGNED_BY_ID: '20', CONTACT_ID: '10', SOURCE_ID: 'WEB',
    }], total: 1 }),
    obtenerContacto: async () => ({ result: { NAME: 'Cliente', LAST_NAME: 'Prueba' } }),
    resolverChatLead: async () => ({ chatId: '99', messages: [
      { id: 0, author_id: 0, date: '2026-08-24T09:59:00Z', text: 'Sistema' },
      { id: 1, author_id: 10, date: '2026-08-24T10:00:00Z', text: 'Hola' },
      { id: 2, author_id: 20, date: '2026-08-24T10:05:00Z', text: 'Buenos días' },
    ], users: [
      { id: 10, name: 'Cliente Prueba', connector: true },
      { id: 20, name: 'Asesor', connector: false, extranet: false },
    ] }),
  };
  const repository = {
    upsertLead: async (_client, lead) => guardados.push(['lead', lead]),
    insertarMensaje: async (_client, message) => guardados.push(['mensaje', message]),
  };
  const pool = { transaction: async (fn) => fn(client) };
  const procesar = crearProcesadorCrm({ bitrix, repository, pool });

  const resultado = await procesar({ empresa: 'NOVONET', categoryId: '19' }, { desde: '2026-08-24', hasta: '2026-08-25' });

  assert.equal(resultado.leads, 1);
  assert.equal(resultado.mensajes, 2);
  assert.equal(guardados.filter(([tipo]) => tipo === 'mensaje').length, 2);
  assert.equal(guardados[0][1].nombre_cliente, 'Cliente Prueba');
  assert.equal(guardados[0][1].asesor_nombre, 'Asesor');
});
