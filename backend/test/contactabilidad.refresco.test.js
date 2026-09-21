const test = require('node:test');
const assert = require('node:assert/strict');

const { crearRefrescador, enLotes } = require('../src/contactabilidad/contactabilidad.refresco');

const CRM = { empresa: 'NOVONET', webhook: 'https://x/rest/1/abc', categoryId: '19' };

function poolFalso({ lead = { etapa_id: 'C19:NEW' }, porChat = [{ id_bitrix: '77' }], activos = [] } = {}) {
  const consultas = [];
  return {
    consultas,
    query: async (sql, params) => {
      consultas.push({ sql, params });
      if (sql.includes('SELECT etapa_id')) return { rows: lead ? [lead] : [] };
      if (sql.includes('chat_id = $2')) return { rows: porChat };
      if (sql.includes('pendiente_por = \'ASESOR\'')) return { rows: activos };
      return { rows: [] };
    },
    transaction: async (fn) => fn({ query: async () => ({ rowCount: 1 }) }),
  };
}

test('refresca un lead, guarda mensajes nuevos y recalcula solo ese lead', async () => {
  const pool = poolFalso();
  const recalculados = [];
  const refrescador = crearRefrescador({
    pool, crms: [CRM],
    bitrix: {
      resolverChatLead: async () => ({
        chatId: '900',
        users: [{ id: '5', connector: true }, { id: '9' }],
        messages: [
          { id: '1', author_id: '5', text: 'hola', date: '2026-08-28T10:00:00Z' },
          { id: '2', author_id: '9', text: 'buenas', date: '2026-08-28T10:05:00Z' },
        ],
      }),
    },
    repository: { insertarMensaje: async () => ({ rowCount: 1 }) },
    recalcular: async (_pool, empresa, ids, origen) => recalculados.push({ empresa, ids, origen }),
  });

  const res = await refrescador.refrescarLead('novonet', 77, { origen: 'WEBHOOK' });

  assert.equal(res.mensajes_leidos, 2);
  assert.equal(res.chat_id, '900');
  assert.deepEqual(recalculados, [{ empresa: 'NOVONET', ids: ['77'], origen: 'WEBHOOK' }]);
});

test('recalcula aunque no lleguen mensajes nuevos: la espera depende del reloj', async () => {
  const pool = poolFalso();
  let recalculos = 0;
  const refrescador = crearRefrescador({
    pool, crms: [CRM],
    bitrix: { resolverChatLead: async () => ({ chatId: '900', users: [], messages: [] }) },
    repository: { insertarMensaje: async () => ({ rowCount: 0 }) },
    recalcular: async () => { recalculos += 1; },
  });

  await refrescador.refrescarLead('NOVONET', '77');
  assert.equal(recalculos, 1);
});

test('consulta y persiste la etapa vigente antes de refrescar los mensajes', async () => {
  const pool = poolFalso();
  const actualizados = [];
  const etapasMensaje = [];
  const refrescador = crearRefrescador({
    pool, crms: [CRM],
    bitrix: {
      obtenerDeal: async () => ({ ID: '77', STAGE_ID: 'C19:CALLBACK', SOURCE_ID: '8', ASSIGNED_BY_ID: '20' }),
      listarEtapas: async () => [{ STATUS_ID: 'C19:CALLBACK', NAME: 'Volver a llamar' }],
      listarOrigenes: async () => [{ STATUS_ID: '8', NAME: 'Base' }],
      obtenerUsuario: async () => ({ NAME: 'Ana', LAST_NAME: 'Paz' }),
      resolverChatLead: async () => ({ chatId: '900', users: [{ id: '5', connector: true }], messages: [
        { id: '1', author_id: '5', text: 'hola', date: '2026-08-28T10:00:00Z' },
      ] }),
    },
    repository: {
      actualizarDatosCrm: async (_client, lead) => actualizados.push(lead),
      insertarMensaje: async (_client, mensaje) => { etapasMensaje.push(mensaje.etapa_id); return { rowCount: 1 }; },
    },
    recalcular: async () => {},
  });

  const res = await refrescador.refrescarLead('NOVONET', '77');

  assert.equal(actualizados[0].etapa_nombre, 'Volver a llamar');
  assert.equal(actualizados[0].asesor_nombre, 'Ana Paz');
  assert.deepEqual(etapasMensaje, ['C19:CALLBACK']);
  assert.equal(res.etapa_id, 'C19:CALLBACK');
});

test('un chat sin lead ingerido no explota ni recalcula', async () => {
  const pool = poolFalso({ porChat: [] });
  let recalculos = 0;
  const refrescador = crearRefrescador({
    pool, crms: [CRM],
    bitrix: { resolverChatLead: async () => ({ chatId: '900', users: [], messages: [] }) },
    repository: { insertarMensaje: async () => ({ rowCount: 0 }) },
    recalcular: async () => { recalculos += 1; },
  });

  const res = await refrescador.refrescarChat('NOVONET', '900');
  assert.equal(res.sin_lead, true);
  assert.equal(recalculos, 0);
});

test('una empresa no habilitada se rechaza con mensaje claro', async () => {
  const refrescador = crearRefrescador({
    pool: poolFalso(), crms: [CRM],
    bitrix: { resolverChatLead: async () => null },
    repository: { insertarMensaje: async () => ({}) },
  });
  await assert.rejects(() => refrescador.refrescarLead('VELSA', '1'), /no habilitada/);
});

test('un lead con error no detiene al resto del ciclo', async () => {
  const pool = poolFalso({ activos: [{ id_bitrix: 'a' }, { id_bitrix: 'b' }, { id_bitrix: 'c' }] });
  let intentos = 0;
  const refrescador = crearRefrescador({
    pool, crms: [CRM],
    bitrix: {
      resolverChatLead: async () => {
        intentos += 1;
        if (intentos === 2) throw new Error('Bitrix 503');
        return { chatId: '900', users: [], messages: [] };
      },
    },
    repository: { insertarMensaje: async () => ({ rowCount: 0 }) },
    recalcular: async () => {},
    logger: { error() {}, warn() {}, log() {} },
  });

  const res = await refrescador.refrescarActivos('NOVONET');
  assert.equal(res.leads, 3);
  assert.equal(res.errores, 1);
});

test('enLotes respeta la concurrencia pedida', async () => {
  let enVuelo = 0;
  let pico = 0;
  await enLotes([1, 2, 3, 4, 5, 6, 7], 3, async () => {
    enVuelo += 1; pico = Math.max(pico, enVuelo);
    await new Promise((r) => setTimeout(r, 5));
    enVuelo -= 1;
  });
  assert.equal(pico, 3);
});
