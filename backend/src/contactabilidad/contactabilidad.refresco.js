// =============================================================================
// Contactabilidad — Refresco puntual de leads
// Una sola pieza que sabe traer UN chat de Bitrix y dejar el lead al dia.
// La usan: el webhook (tiempo real), el cron corto (red de seguridad) y el
// boton de "forzar actualizacion" del tablero. Misma logica -> mismo resultado.
// =============================================================================

const { normalizarMensaje } = require('./contactabilidad.normalizer');
const { recalcularLeads } = require('./contactabilidad.recalculo');

const LIMITE_LEADS_CICLO = 120;   // tope duro por ciclo del cron corto
const CONCURRENCIA = 3;           // Bitrix tolera ~2 req/s: 3 chats en paralelo con backoff

/** Ejecuta las tareas con concurrencia limitada, sin dependencias externas. */
async function enLotes(items, tamano, tarea) {
  const resultados = [];
  for (let i = 0; i < items.length; i += tamano) {
    const lote = items.slice(i, i + tamano);
    resultados.push(...await Promise.all(lote.map(tarea)));
  }
  return resultados;
}

function crearRefrescador({
  pool,
  crms = [],
  bitrix,
  repository,
  recalcular = recalcularLeads,
  logger = console,
  limiteCiclo = LIMITE_LEADS_CICLO,
  concurrencia = CONCURRENCIA,
}) {
  if (!pool) throw new TypeError('pool es requerido');
  if (!bitrix) throw new TypeError('bitrix es requerido');
  if (!repository) throw new TypeError('repository es requerido');

  const porEmpresa = new Map(crms.map((crm) => [String(crm.empresa).toUpperCase(), crm]));

  const buscarCrm = (empresa) => {
    const crm = porEmpresa.get(String(empresa || '').toUpperCase());
    if (!crm) throw new Error(`Empresa ${empresa} no habilitada para Contactabilidad`);
    return crm;
  };

  /**
   * Trae el chat del lead desde Bitrix, guarda los mensajes nuevos y recalcula
   * SOLO ese lead. Devuelve cuantos mensajes entraron realmente.
   */
  async function refrescarLead(empresa, idBitrix, { origen = 'MANUAL' } = {}) {
    const crm = buscarCrm(empresa);
    const id = String(idBitrix);
    const inicio = Date.now();

    // La etapa vigente del lead viaja con cada mensaje: sin ella los contadores
    // "mensajes en esta etapa" quedarian en cero para lo que entra en vivo.
    const { rows: leadRows } = await pool.query(
      `SELECT etapa_id FROM contactabilidad_leads WHERE empresa = $1 AND id_bitrix = $2`,
      [crm.empresa, id]);
    if (!leadRows.length) {
      return { empresa: crm.empresa, id_bitrix: id, sin_lead: true, mensajes_nuevos: 0, ms: Date.now() - inicio };
    }
    const etapaId = leadRows[0].etapa_id || null;

    const chat = await bitrix.resolverChatLead(crm, { ID: id });
    if (!chat?.chatId) {
      return { empresa: crm.empresa, id_bitrix: id, mensajes_nuevos: 0, sin_chat: true, ms: Date.now() - inicio };
    }

    const normalizados = (chat.messages || [])
      .map((mensaje) => normalizarMensaje(mensaje, chat.users, {
        empresa: crm.empresa, idBitrix: id, chatId: chat.chatId, etapaId,
      }))
      .filter(Boolean);

    let insertados = 0;
    if (normalizados.length) {
      await pool.transaction(async (client) => {
        for (const mensaje of normalizados) {
          const res = await repository.insertarMensaje(client, mensaje);
          if (res?.rowCount) insertados += res.rowCount;
        }
      });
    }

    // Se recalcula siempre: aunque no haya mensajes nuevos, pendiente_por y
    // temperatura dependen del reloj y deben quedar frescos.
    await recalcular(pool, crm.empresa, [id], origen);

    return {
      empresa: crm.empresa,
      id_bitrix: id,
      chat_id: chat.chatId,
      mensajes_leidos: normalizados.length,
      mensajes_nuevos: insertados,
      ms: Date.now() - inicio,
    };
  }

  /** Resuelve el lead a partir del chat de Open Lines y lo refresca. */
  async function refrescarChat(empresa, chatId, opciones = {}) {
    const crm = buscarCrm(empresa);
    const { rows } = await pool.query(`
      SELECT id_bitrix FROM contactabilidad_leads
      WHERE empresa = $1 AND chat_id = $2
      ORDER BY actualizado_at DESC LIMIT 1
    `, [crm.empresa, String(chatId)]);

    if (!rows.length) return { empresa: crm.empresa, chat_id: String(chatId), sin_lead: true };
    return refrescarLead(crm.empresa, rows[0].id_bitrix, opciones);
  }

  /**
   * Cola del cron corto: leads "vivos" que mas valor tienen en refrescar.
   * Prioriza a quien tiene al cliente esperando, luego la actividad reciente.
   */
  async function listarActivos(empresa, { ventanaHoras = 48, limite = limiteCiclo } = {}) {
    const crm = buscarCrm(empresa);
    const tope = Math.min(limiteCiclo, Math.max(1, Number(limite) || limiteCiclo));
    const horas = Math.max(1, Number(ventanaHoras) || 48);
    const { rows } = await pool.query(`
      SELECT id_bitrix
      FROM contactabilidad_leads
      WHERE empresa = $1
        AND (
          pendiente_por = 'ASESOR'
          OR GREATEST(ultimo_mensaje_cliente_at, ultimo_mensaje_asesor_at) >= NOW() - ($2 || ' hours')::interval
          OR (fecha_creacion >= NOW() - ($2 || ' hours')::interval
              AND mensajes_cliente_total + mensajes_asesor_total = 0)
        )
      ORDER BY (pendiente_por = 'ASESOR') DESC,
               GREATEST(ultimo_mensaje_cliente_at, ultimo_mensaje_asesor_at) DESC NULLS LAST,
               fecha_creacion DESC NULLS LAST
      LIMIT $3
    `, [crm.empresa, String(horas), tope]);
    return rows.map((row) => row.id_bitrix);
  }

  /** Refresca los leads activos de una empresa con concurrencia acotada. */
  async function refrescarActivos(empresa, opciones = {}) {
    const crm = buscarCrm(empresa);
    const ids = await listarActivos(crm.empresa, opciones);
    if (!ids.length) return { empresa: crm.empresa, leads: 0, mensajes_nuevos: 0, errores: 0 };

    let mensajes = 0;
    let errores = 0;
    await enLotes(ids, concurrencia, async (id) => {
      try {
        const res = await refrescarLead(crm.empresa, id, { origen: opciones.origen || 'CRON_CORTO' });
        mensajes += res.mensajes_nuevos || 0;
      } catch (error) {
        errores += 1;
        logger.error(`[contactabilidad:refresco:${crm.empresa}:${id}] ${error.message}`);
      }
    });

    return { empresa: crm.empresa, leads: ids.length, mensajes_nuevos: mensajes, errores };
  }

  return { refrescarLead, refrescarChat, refrescarActivos, listarActivos, empresas: () => [...porEmpresa.keys()] };
}

module.exports = { crearRefrescador, enLotes, LIMITE_LEADS_CICLO, CONCURRENCIA };
