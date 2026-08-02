/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * CONTROLADOR: Tareas y Acuerdos
 * ═══════════════════════════════════════════════════════════════════════════════
 * Solo traduce HTTP ↔ servicio. Cero lógica de negocio aquí.
 * Formato de respuesta consistente con el resto del ERP:
 *   { success: true, data }  /  { success: false, error }
 */

const svc  = require('../services/tareas.service');
const noti = require('../services/tareasNotificaciones.service');

/** Envuelve un handler async y traduce ErrorNegocio a la respuesta HTTP. */
function manejar(fn, contexto) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (e) {
      if (e instanceof svc.ErrorNegocio) {
        return res.status(e.status).json({ success: false, error: e.message, codigo: e.codigo });
      }
      console.error(`[tareas.controller:${contexto}]`, e.message);
      return res.status(500).json({ success: false, error: 'Error interno del servidor' });
    }
  };
}

// ── Lectura ───────────────────────────────────────────────────────────────────

exports.listar = manejar(async (req, res) => {
  const data = await svc.listarTareas(req.tareasUser, req.query);
  res.json({ success: true, ...data });
}, 'listar');

exports.misTareas = manejar(async (req, res) => {
  const data = await svc.misTareas(req.tareasUser, { rol: req.query.rol });
  res.json({ success: true, ...data });
}, 'misTareas');

exports.detalle = manejar(async (req, res) => {
  const data = await svc.detalleTarea(req.tareasUser, Number(req.params.id));
  res.json({ success: true, ...data });
}, 'detalle');

exports.catalogos = manejar(async (req, res) => {
  const data = await svc.catalogos(req.tareasUser);
  res.json({ success: true, data });
}, 'catalogos');

// ── Escritura ─────────────────────────────────────────────────────────────────

exports.crear = manejar(async (req, res) => {
  const tarea = await svc.crearTarea(req.tareasUser, req.body);
  res.status(201).json({ success: true, data: tarea });
}, 'crear');

exports.editar = manejar(async (req, res) => {
  const tarea = await svc.editarTarea(req.tareasUser, Number(req.params.id), req.body);
  res.json({ success: true, data: tarea });
}, 'editar');

exports.cambiarEstado = manejar(async (req, res) => {
  const tarea = await svc.cambiarEstado(
    req.tareasUser, Number(req.params.id), req.body.estado, req.body.comentario
  );
  res.json({ success: true, data: tarea });
}, 'cambiarEstado');

exports.reasignar = manejar(async (req, res) => {
  const tarea = await svc.reasignar(
    req.tareasUser, Number(req.params.id), req.body.responsable_id
  );
  res.json({ success: true, data: tarea });
}, 'reasignar');

exports.cancelar = manejar(async (req, res) => {
  const tarea = await svc.cambiarEstado(
    req.tareasUser, Number(req.params.id), 'CANCELADA', req.body?.motivo
  );
  res.json({ success: true, data: tarea });
}, 'cancelar');

// ── Comentarios ───────────────────────────────────────────────────────────────

exports.comentar = manejar(async (req, res) => {
  const c = await svc.agregarComentario(req.tareasUser, Number(req.params.id), req.body.comentario);
  res.status(201).json({ success: true, data: c });
}, 'comentar');

exports.editarComentario = manejar(async (req, res) => {
  const c = await svc.editarComentario(
    req.tareasUser, Number(req.params.comentarioId), req.body.comentario
  );
  res.json({ success: true, data: c });
}, 'editarComentario');

exports.eliminarComentario = manejar(async (req, res) => {
  await svc.eliminarComentario(req.tareasUser, Number(req.params.comentarioId));
  res.json({ success: true });
}, 'eliminarComentario');

// ── Notificaciones ────────────────────────────────────────────────────────────

exports.listarNotificaciones = manejar(async (req, res) => {
  const [items, noLeidas] = await Promise.all([
    noti.listarNotificaciones(req.tareasUser.id, {
      soloNoLeidas: req.query.no_leidas === '1',
      limit: parseInt(req.query.limit, 10) || 50,
    }),
    noti.contarNoLeidas(req.tareasUser.id),
  ]);
  res.json({ success: true, data: items, no_leidas: noLeidas });
}, 'listarNotificaciones');

exports.marcarNotificacionLeida = manejar(async (req, res) => {
  await noti.marcarLeida(req.tareasUser.id, Number(req.params.id));
  const noLeidas = await noti.contarNoLeidas(req.tareasUser.id);
  res.json({ success: true, no_leidas: noLeidas });
}, 'marcarNotificacionLeida');

exports.marcarTodasLeidas = manejar(async (req, res) => {
  const n = await noti.marcarTodasLeidas(req.tareasUser.id);
  res.json({ success: true, marcadas: n, no_leidas: 0 });
}, 'marcarTodasLeidas');
