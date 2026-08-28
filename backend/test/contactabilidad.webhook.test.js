const test = require('node:test');
const assert = require('node:assert/strict');

const {
  crearManejadorWebhook, extraerEvento, huellaEvento, tokenValido,
} = require('../src/contactabilidad/contactabilidad.webhook');

const CUERPO_BITRIX = {
  event: 'ONIMOPENLINESMESSAGEADD',
  data: { PARAMS: { CHAT_ID: '900', MESSAGE_ID: '5512', DIALOG_ID: 'chat900' } },
  ts: '1787900000',
};

function poolFalso({ insertaria = true } = {}) {
  const escrituras = [];
  return {
    escrituras,
    query: async (sql, params) => {
      escrituras.push({ sql, params });
      if (sql.includes('INSERT INTO contactabilidad_eventos_inbox')) {
        return insertaria
          ? { rows: [{ id: 1, empresa: params[0], chat_id: params[3], id_bitrix: params[4] }] }
          : { rows: [] };
      }
      return { rows: [] };
    },
  };
}

const inline = (fn) => fn();

test('extrae chat y mensaje del formato anidado de Bitrix', () => {
  const datos = extraerEvento(CUERPO_BITRIX);
  assert.equal(datos.evento, 'ONIMOPENLINESMESSAGEADD');
  assert.equal(datos.chat_id, '900');
  assert.equal(datos.mensaje_id, '5512');
});

test('deduce el chat desde DIALOG_ID cuando falta CHAT_ID', () => {
  const datos = extraerEvento({ event: 'ONIMOPENLINESMESSAGEADD', data: { PARAMS: { DIALOG_ID: 'chat741' } } });
  assert.equal(datos.chat_id, '741');
});

test('sin ids usa un hash estable del cuerpo como huella', () => {
  const body = { event: 'X', data: {} };
  assert.equal(huellaEvento(extraerEvento(body), body), huellaEvento(extraerEvento(body), body));
  assert.notEqual(huellaEvento(extraerEvento(body), body),
    huellaEvento(extraerEvento({ event: 'X', data: { a: 1 } }), { event: 'X', data: { a: 1 } }));
});

test('token invalido o de otra longitud no pasa', () => {
  assert.equal(tokenValido('secreto', 'secreto'), true);
  assert.equal(tokenValido('secretoX', 'secreto'), false);
  assert.equal(tokenValido('', 'secreto'), false);
  assert.equal(tokenValido('secreto', ''), false);
});

test('rechaza empresa desconocida y token equivocado', async () => {
  const manejador = crearManejadorWebhook({
    pool: poolFalso(), refrescador: {}, secretos: { NOVONET: 'abc' },
    logger: { warn() {}, error() {} },
  });

  assert.equal((await manejador.recibir({ empresa: 'OTRA', token: 'abc', body: CUERPO_BITRIX })).estado, 404);
  assert.equal((await manejador.recibir({ empresa: 'NOVONET', token: 'zzz', body: CUERPO_BITRIX })).estado, 401);
});

test('acepta el evento, responde 202 y refresca el chat', async () => {
  const pool = poolFalso();
  const refrescos = [];
  const manejador = crearManejadorWebhook({
    pool,
    refrescador: {
      refrescarChat: async (empresa, chatId, opciones) => {
        refrescos.push({ empresa, chatId, opciones });
        return { mensajes_nuevos: 1 };
      },
    },
    secretos: { NOVONET: 'abc' },
    enSegundoPlano: inline,
  });

  const res = await manejador.recibir({ empresa: 'novonet', token: 'abc', body: CUERPO_BITRIX });

  assert.equal(res.estado, 202);
  assert.deepEqual(refrescos, [{ empresa: 'NOVONET', chatId: '900', opciones: { origen: 'WEBHOOK' } }]);
  assert.ok(pool.escrituras.some((e) => e.sql.includes("SET estado = $2") && e.params[1] === 'PROCESADO'));
});

test('un reenvio del mismo evento no vuelve a procesar nada', async () => {
  let refrescos = 0;
  const manejador = crearManejadorWebhook({
    pool: poolFalso({ insertaria: false }),
    refrescador: { refrescarChat: async () => { refrescos += 1; return {}; } },
    secretos: { NOVONET: 'abc' },
    enSegundoPlano: inline,
  });

  const res = await manejador.recibir({ empresa: 'NOVONET', token: 'abc', body: CUERPO_BITRIX });
  assert.deepEqual(res.cuerpo, { success: true, duplicado: true });
  assert.equal(refrescos, 0);
});

test('un evento no relevante se registra como IGNORADO y no dispara Bitrix', async () => {
  const pool = poolFalso();
  let refrescos = 0;
  const manejador = crearManejadorWebhook({
    pool,
    refrescador: { refrescarChat: async () => { refrescos += 1; return {}; } },
    secretos: { NOVONET: 'abc' },
    enSegundoPlano: inline,
  });

  const res = await manejador.recibir({
    empresa: 'NOVONET', token: 'abc', body: { event: 'ONCRMCONTACTUPDATE', data: { FIELDS: { ID: '3' } } },
  });

  assert.equal(res.cuerpo.ignorado, 'ONCRMCONTACTUPDATE');
  assert.equal(refrescos, 0);
  const insert = pool.escrituras.find((e) => e.sql.includes('INSERT INTO contactabilidad_eventos_inbox'));
  assert.equal(insert.params[5], 'IGNORADO');
});

test('si Bitrix falla el evento queda FALLIDO para reintento, no se pierde', async () => {
  const pool = poolFalso();
  const manejador = crearManejadorWebhook({
    pool,
    refrescador: { refrescarChat: async () => { throw new Error('Bitrix 503'); } },
    secretos: { NOVONET: 'abc' },
    enSegundoPlano: inline,
    logger: { error() {}, warn() {} },
  });

  await manejador.recibir({ empresa: 'NOVONET', token: 'abc', body: CUERPO_BITRIX });

  const marca = pool.escrituras.find((e) => e.sql.includes('SET estado = $2'));
  assert.equal(marca.params[1], 'FALLIDO');
  assert.match(marca.params[2], /Bitrix 503/);
});

test('un lead aun no ingerido se marca IGNORADO y no entra en bucle de reintentos', async () => {
  const pool = poolFalso();
  const manejador = crearManejadorWebhook({
    pool,
    refrescador: { refrescarChat: async () => ({ sin_lead: true }) },
    secretos: { NOVONET: 'abc' },
    enSegundoPlano: inline,
  });

  await manejador.recibir({ empresa: 'NOVONET', token: 'abc', body: CUERPO_BITRIX });
  const marca = pool.escrituras.find((e) => e.sql.includes('SET estado = $2'));
  assert.equal(marca.params[1], 'IGNORADO');
});
