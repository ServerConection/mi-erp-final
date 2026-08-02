/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * SERVICIO: Notificaciones del módulo de Tareas
 * ═══════════════════════════════════════════════════════════════════════════════
 * Inserta en tar_notificaciones y emite por socket.io a la sala `user:{id}`
 * (esa sala ya existe en config/socket.js, no hubo que tocar nada).
 *
 * Las inserciones aceptan un cliente de transacción para que la notificación
 * viva o muera junto con el cambio que la originó.
 */

const pool = require('../config/db');
const { TIPOS_NOTIFICACION, ETIQUETAS_ESTADO } = require('../config/tareas.config');

/** Emite por socket sin tumbar la request si el socket no está listo. */
function emitirSocket(usuarioId, payload) {
  try {
    const { getIO } = require('../config/socket');
    getIO().to('user:' + usuarioId).emit('tarea_notificacion', payload);
  } catch (e) {
    // Socket no inicializado (tests, workers, cron): no es un error fatal.
  }
}

/**
 * Crea notificaciones para varios destinatarios.
 *
 * @param {object}   db          pool o cliente de transacción
 * @param {number[]} destinatarios
 * @param {object}   opts        { tareaId, tipo, mensaje, excluirUsuarioId }
 */
async function notificar(db, destinatarios, { tareaId, tipo, mensaje, excluirUsuarioId = null }) {
  const unicos = [...new Set(
    (destinatarios || []).filter(id => id && id !== excluirUsuarioId)
  )];
  if (unicos.length === 0) return [];

  const texto = String(mensaje).slice(0, 300);

  const { rows } = await db.query(
    `INSERT INTO public.tar_notificaciones (usuario_id, tarea_id, tipo, mensaje)
     SELECT x.uid, $2, $3, $4 FROM unnest($1::int[]) AS x(uid)
     RETURNING id, usuario_id, tarea_id, tipo, mensaje, leida, created_at`,
    [unicos, tareaId, tipo, texto]
  );

  for (const n of rows) {
    emitirSocket(n.usuario_id, n);
  }

  return rows;
}

// ── Atajos por evento ─────────────────────────────────────────────────────────

async function notificarAsignacion(db, tarea, actorNombre) {
  return notificar(db, [tarea.responsable_id], {
    tareaId: tarea.id,
    tipo: TIPOS_NOTIFICACION.ASIGNACION,
    mensaje: `${actorNombre} te asignó "${tarea.titulo}" (${tarea.codigo}). Vence el ${formatearFecha(tarea.fecha_limite)}.`,
    excluirUsuarioId: tarea.__actorId,
  });
}

async function notificarComentario(db, tarea, actorId, actorNombre) {
  return notificar(db, [tarea.responsable_id, tarea.solicitante_id], {
    tareaId: tarea.id,
    tipo: TIPOS_NOTIFICACION.COMENTARIO,
    mensaje: `${actorNombre} comentó en "${tarea.titulo}" (${tarea.codigo}).`,
    excluirUsuarioId: actorId,
  });
}

async function notificarCambioEstado(db, tarea, estadoNuevo, actorId, actorNombre) {
  let tipo    = TIPOS_NOTIFICACION.CAMBIO_ESTADO;
  let mensaje = `${actorNombre} cambió "${tarea.titulo}" (${tarea.codigo}) a ${ETIQUETAS_ESTADO[estadoNuevo] || estadoNuevo}.`;
  let destinatarios = [tarea.responsable_id, tarea.solicitante_id];

  if (estadoNuevo === 'EN_REVISION') {
    tipo    = TIPOS_NOTIFICACION.ENVIADA_REVISION;
    mensaje = `${actorNombre} envió a revisión "${tarea.titulo}" (${tarea.codigo}). Necesita tu aprobación.`;
    destinatarios = [tarea.solicitante_id];
  } else if (estadoNuevo === 'COMPLETADA') {
    tipo    = TIPOS_NOTIFICACION.APROBADA;
    mensaje = `${actorNombre} aprobó y completó "${tarea.titulo}" (${tarea.codigo}).`;
  } else if (estadoNuevo === 'EN_PROCESO' && tarea.estado === 'EN_REVISION') {
    tipo    = TIPOS_NOTIFICACION.DEVUELTA;
    mensaje = `${actorNombre} devolvió "${tarea.titulo}" (${tarea.codigo}) para corregir.`;
    destinatarios = [tarea.responsable_id];
  }

  return notificar(db, destinatarios, {
    tareaId: tarea.id, tipo, mensaje, excluirUsuarioId: actorId,
  });
}

async function notificarReasignacion(db, tarea, responsableAnterior, actorId, actorNombre) {
  return notificar(db, [tarea.responsable_id, responsableAnterior, tarea.solicitante_id], {
    tareaId: tarea.id,
    tipo: TIPOS_NOTIFICACION.ASIGNACION,
    mensaje: `${actorNombre} reasignó "${tarea.titulo}" (${tarea.codigo}).`,
    excluirUsuarioId: actorId,
  });
}

// ── Lectura ───────────────────────────────────────────────────────────────────

async function listarNotificaciones(usuarioId, { soloNoLeidas = false, limit = 50 } = {}) {
  const { rows } = await pool.query(
    `SELECT n.id, n.tarea_id, n.tipo, n.mensaje, n.leida, n.created_at,
            t.codigo AS tarea_codigo, t.titulo AS tarea_titulo
       FROM public.tar_notificaciones n
       JOIN public.tar_tareas t ON t.id = n.tarea_id
      WHERE n.usuario_id = $1
        AND ($2::boolean = false OR n.leida = false)
      ORDER BY n.created_at DESC
      LIMIT $3`,
    [usuarioId, soloNoLeidas, Math.min(limit, 200)]
  );
  return rows;
}

async function contarNoLeidas(usuarioId) {
  const { rows } = await pool.query(
    `SELECT count(*)::int AS total
       FROM public.tar_notificaciones
      WHERE usuario_id = $1 AND leida = false`,
    [usuarioId]
  );
  return rows[0].total;
}

async function marcarLeida(usuarioId, notificacionId) {
  const { rowCount } = await pool.query(
    `UPDATE public.tar_notificaciones SET leida = true
      WHERE id = $1 AND usuario_id = $2 AND leida = false`,
    [notificacionId, usuarioId]
  );
  return rowCount > 0;
}

async function marcarTodasLeidas(usuarioId) {
  const { rowCount } = await pool.query(
    `UPDATE public.tar_notificaciones SET leida = true
      WHERE usuario_id = $1 AND leida = false`,
    [usuarioId]
  );
  return rowCount;
}

// ── Utilidad ──────────────────────────────────────────────────────────────────
function formatearFecha(f) {
  if (!f) return 'sin fecha';
  const d = new Date(f);
  if (Number.isNaN(d.getTime())) return String(f);
  return d.toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' });
}

module.exports = {
  notificar,
  notificarAsignacion,
  notificarComentario,
  notificarCambioEstado,
  notificarReasignacion,
  listarNotificaciones,
  contarNoLeidas,
  marcarLeida,
  marcarTodasLeidas,
};
