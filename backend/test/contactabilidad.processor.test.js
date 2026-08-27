const test = require('node:test');
const assert = require('node:assert/strict');

const { crearProcesadorCrm } = require('../src/contactabilidad/contactabilidad.processor');

test('procesa un lead y persiste solo mensajes reales dentro de una transaccion', async () => {
  const guardados = [];
  const client = {};
  const bitrix = {
    listarEtapas: async () => [{ STATUS_ID: 'NUEVO', NAME: 'Negociación nueva' }],
    listarOrigenes: async () => [{ STATUS_ID: 'WEB', NAME: 'Formulario web' }],
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
    actualizarNombresOrigen: async (_pool, empresa, origenes) => guardados.push(['origenes', { empresa, origenes }]),
  };
  const pool = { transaction: async (fn) => fn(client) };
  const procesar = crearProcesadorCrm({ bitrix, repository, pool });

  const resultado = await procesar({ empresa: 'NOVONET', categoryId: '19' }, { desde: '2026-08-24', hasta: '2026-08-25' });

  assert.equal(resultado.leads, 1);
  assert.equal(resultado.mensajes, 2);
  assert.equal(guardados.filter(([tipo]) => tipo === 'mensaje').length, 2);
  assert.equal(guardados[0][1].nombre_cliente, 'Cliente Prueba');
  assert.equal(guardados[0][1].etapa_nombre, 'Negociación nueva');
  assert.equal(guardados[0][1].asesor_nombre, 'Asesor');
  assert.equal(guardados[0][1].origen_id, 'WEB');
  assert.equal(guardados[0][1].origen_nombre, 'Formulario web');
  assert.deepEqual(guardados.find(([tipo]) => tipo === 'origenes')[1], {
    empresa: 'NOVONET',
    origenes: [{ id: 'WEB', nombre: 'Formulario web' }],
  });
});

test('continua con los demas leads cuando uno falla', async () => {
  const guardados = [];
  const bitrix = {
    listarEtapas: async () => [],
    listarDeals: async () => ({ result: [
      { ID: '1', CONTACT_ID: '1', STAGE_ID: 'NUEVO' },
      { ID: '2', CONTACT_ID: '2', STAGE_ID: 'NUEVO' },
    ], total: 2 }),
    obtenerContacto: async (_crm, id) => {
      if (id === '1') throw new Error('Bitrix temporal');
      return { result: { NAME: 'Cliente dos' } };
    },
    resolverChatLead: async () => null,
  };
  const repository = { upsertLead: async (_client, lead) => guardados.push(lead), insertarMensaje: async () => {} };
  const pool = { transaction: async (fn) => fn({}) };
  const procesar = crearProcesadorCrm({ bitrix, repository, pool, logger: { error() {} } });

  const resultado = await procesar({ empresa: 'NOVONET' }, { desde: '2026-07-01' });

  assert.equal(resultado.leads, 1);
  assert.equal(resultado.errores, 1);
  assert.equal(guardados[0].id_bitrix, '2');
});

test('en historico omite leads que ya fueron auditados', async () => {
  let contactos = 0;
  const bitrix = {
    listarEtapas: async () => [],
    listarDeals: async () => ({ result: [{ ID: '1', CONTACT_ID: '1' }], total: 1 }),
    obtenerContacto: async () => { contactos += 1; return { result: {} }; },
    resolverChatLead: async () => null,
  };
  const pool = {
    query: async () => ({ rows: [{ id_bitrix: '1' }] }),
    transaction: async (fn) => fn({}),
  };
  const procesar = crearProcesadorCrm({ bitrix, repository: {}, pool, logger: { error() {} } });

  const resultado = await procesar({ empresa: 'NOVONET' }, { desde: '2026-07-01', soloNuevos: true });

  assert.equal(contactos, 0);
  assert.equal(resultado.omitidos, 1);
});
