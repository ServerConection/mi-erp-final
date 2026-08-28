// =============================================================================
// Contactabilidad — Webhook de eventos Bitrix (tiempo real)
// Bitrix empuja cada mensaje de Open Lines; aqui se registra el evento de forma
// idempotente y se refresca SOLO el lead afectado.
//
// Reglas de fiabilidad:
//  1. Token obligatorio, comparado en tiempo constante.
//  2. Todo evento se registra ANTES de procesarse: si el proceso falla, queda
//     en el inbox como FALLIDO y el cron corto lo vuelve a intentar.
//  3. La unicidad (empresa, evento, huella) hace que un reenvio de Bitrix
//     no duplique nada.
//  4. Se responde 202 de inmediato: Bitrix desactiva los handlers lentos.
// =============================================================================

const crypto = require('crypto');

const EVENTOS_MENSAJE = new Set([
  'ONIMOPENLINESMESSAGEADD',
  'ONIMOPENLINESMESSAGEUPDATE',
  'ONIMBOTMESSAGEADD',
  'ONIMOPENLINESSESSIONSTART',
  'ONIMOPENLINESSESSIONFINISH',
]);
const EVENTOS_DEAL = new Set(['ONCRMDEALUPDATE', 'ONCRMDEALADD']);
const MAX_INTENTOS = 3;

/** Compara tokens sin filtrar informacion por el tiempo de respuesta. */
function tokenValido(recibido, esperado) {
  if (!esperado) return false;
  const a = Buffer.from(String(recibido || ''), 'utf8');
  const b = Buffer.from(String(esperado), 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

const primero = (...valores) => valores.find((v) => v !== undefined && v !== null && String(v).trim() !== '');

/**
 * Bitrix envia el cuerpo como formulario anidado y cambia las claves segun el
 * evento. Se leen todas las variantes conocidas en lugar de asumir una sola.
 */
function extraerEvento(body = {}) {
  const data = body.data || body.DATA || {};
  const params = data.PARAMS || data.params || {};
  const fields = data.FIELDS || data.fields || {};
  const evento = String(body.event || body.EVENT || '').toUpperCase();

  const dialogo = String(primero(params.DIALOG_ID, params.dialog_id, '') || '');
  const chatId = primero(
    params.CHAT_ID, params.chat_id, data.CHAT_ID,
    dialogo.startsWith('chat') ? dialogo.slice(4) : undefined,
  );

  return {
    evento,
    chat_id: chatId ? String(chatId) : null,
    mensaje_id: primero(params.MESSAGE_ID, params.message_id, params.ID, data.MESSAGE_ID),
    id_bitrix: primero(fields.ID, fields.id, data.ID, params.CRM_ENTITY_ID, params.ENTITY_ID),
    ts: primero(body.ts, body.TS),
  };
}

/** Huella estable del evento; si Bitrix no da ids, se usa el hash del cuerpo. */
function huellaEvento(datos, body) {
  const partes = [datos.chat_id, datos.mensaje_id, datos.id_bitrix].filter(Boolean);
  if (partes.length) return partes.join(':').slice(0, 200);
  return crypto.createHash('sha256').update(JSON.stringify(body || {})).digest('hex').slice(0, 64);
}

function crearManejadorWebhook({
  pool,
  refrescador,
  secretos = {},
  logger = console,
  enSegundoPlano = setImmediate,
}) {
  if (!pool) throw new TypeError('pool es requerido');
  if (!refrescador) throw new TypeError('refrescador es requerido');

  const tokens = new Map(Object.entries(secretos)
    .filter(([, token]) => Boolean(token))
    .map(([empresa, token]) => [String(empresa).toUpperCase(), String(token)]));

  async function marcar(id, estado, detalle) {
    if (!id) return;
    await pool.query(`
      UPDATE contactabilidad_eventos_inbox
      SET estado = $2, procesado_at = NOW(), intentos = intentos + 1,
          error_detalle = $3
      WHERE id = $1
    `, [id, estado, detalle || null]).catch((error) =>
      logger.error(`[contactabilidad:webhook] no se pudo marcar ${id}: ${error.message}`));
  }

  /** Ejecuta el refresco de un evento ya registrado en el inbox. */
  async function procesarEvento(fila) {
    const { id, empresa, chat_id: chatId, id_bitrix: idBitrix } = fila;
    try {
      let resultado;
      if (chatId) resultado = await refrescador.refrescarChat(empresa, chatId, { origen: 'WEBHOOK' });
      else if (idBitrix) resultado = await refrescador.refrescarLead(empresa, idBitrix, { origen: 'WEBHOOK' });
      else return marcar(id, 'IGNORADO', 'Evento sin chat ni negociacion');

      if (resultado?.sin_lead) {
        // El chat existe en Bitrix pero el lead aun no fue ingerido: lo tomara
        // el ciclo largo. No es un fallo, no debe reintentarse en bucle.
        return marcar(id, 'IGNORADO', 'Lead todavia no ingerido');
      }
      return marcar(id, 'PROCESADO', null);
    } catch (error) {
      logger.error(`[contactabilidad:webhook:${empresa}] ${error.message}`);
      return marcar(id, 'FALLIDO', error.message.slice(0, 500));
    }
  }

  /**
   * Punto de entrada del endpoint. Valida, registra y agenda el procesamiento.
   * Nunca lanza por un evento malformado: responde y deja rastro.
   */
  async function recibir({ empresa, token, body }) {
    const nombre = String(empresa || '').toUpperCase();
    if (!tokens.has(nombre)) return { estado: 404, cuerpo: { success: false, error: 'Empresa no configurada' } };
    if (!tokenValido(token, tokens.get(nombre))) {
      logger.warn(`[contactabilidad:webhook:${nombre}] token invalido`);
      return { estado: 401, cuerpo: { success: false, error: 'Token invalido' } };
    }

    const datos = extraerEvento(body);
    if (!datos.evento) return { estado: 400, cuerpo: { success: false, error: 'Evento ausente' } };

    const relevante = EVENTOS_MENSAJE.has(datos.evento) || EVENTOS_DEAL.has(datos.evento);
    const huella = huellaEvento(datos, body);

    const { rows } = await pool.query(`
      INSERT INTO contactabilidad_eventos_inbox
        (empresa, evento, huella, chat_id, id_bitrix, estado, payload)
      VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
      ON CONFLICT (empresa, evento, huella) DO NOTHING
      RETURNING id, empresa, chat_id, id_bitrix
    `, [nombre, datos.evento, huella, datos.chat_id, datos.id_bitrix,
      relevante ? 'PENDIENTE' : 'IGNORADO', JSON.stringify(body || {})]);

    if (!rows.length) return { estado: 200, cuerpo: { success: true, duplicado: true } };
    if (!relevante) return { estado: 200, cuerpo: { success: true, ignorado: datos.evento } };

    // Respuesta inmediata: Bitrix corta los handlers que tardan.
    enSegundoPlano(() => { procesarEvento(rows[0]).catch(() => {}); });
    return { estado: 202, cuerpo: { success: true, evento: datos.evento, encolado: true } };
  }

  /**
   * Reintenta lo que quedo pendiente o fallido. Lo llama el cron corto, de modo
   * que una caida momentanea de Bitrix no deja huecos en el dato.
   */
  async function drenarPendientes({ limite = 50 } = {}) {
    const { rows } = await pool.query(`
      SELECT id, empresa, chat_id, id_bitrix
      FROM contactabilidad_eventos_inbox
      WHERE estado IN ('PENDIENTE','FALLIDO')
        AND intentos < $2
        AND recibido_at >= NOW() - INTERVAL '24 hours'
      ORDER BY recibido_at
      LIMIT $1
    `, [Math.max(1, Number(limite) || 50), MAX_INTENTOS]);

    for (const fila of rows) await procesarEvento(fila);
    return { procesados: rows.length };
  }

  return { recibir, drenarPendientes, procesarEvento };
}

module.exports = {
  crearManejadorWebhook,
  extraerEvento,
  huellaEvento,
  tokenValido,
  EVENTOS_MENSAJE,
  EVENTOS_DEAL,
  MAX_INTENTOS,
};
