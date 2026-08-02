/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * SERVICIO: Tareas y Acuerdos · lógica de negocio
 * ═══════════════════════════════════════════════════════════════════════════════
 * Los controladores solo traducen HTTP. Toda la regla vive aquí.
 * Todo lo que muta datos usa transacción + escribe historial + notifica.
 */

const pool = require('../config/db');
const cfg  = require('../config/tareas.config');
const vis  = require('./tareasVisibilidad.service');
const noti = require('./tareasNotificaciones.service');

const VISTA = 'public.v_tar_tareas';

// ══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════════════

class ErrorNegocio extends Error {
  constructor(mensaje, status = 400, codigo = null) {
    super(mensaje);
    this.status = status;
    this.codigo = codigo;
  }
}

/** Trae la tarea cruda + sus áreas involucradas. Null si no existe. */
async function cargarTarea(db, id) {
  const { rows } = await db.query(
    `SELECT * FROM public.tar_tareas WHERE id = $1`, [id]
  );
  if (rows.length === 0) return null;

  const { rows: areas } = await db.query(
    `SELECT area_id FROM public.tar_tarea_areas WHERE tarea_id = $1`, [id]
  );

  return { tarea: rows[0], areasInvolucradas: areas.map(a => a.area_id) };
}

/** Nombre legible del usuario para los mensajes de notificación. */
async function nombreUsuario(db, id) {
  const { rows } = await db.query(
    `SELECT btrim(COALESCE(nombres,'') || ' ' || COALESCE(apellidos,'')) AS n, usuario
       FROM public.usuarios WHERE id = $1`, [id]
  );
  if (rows.length === 0) return 'Alguien';
  return rows[0].n || rows[0].usuario || 'Alguien';
}

async function registrarHistorial(db, tareaId, usuarioId, accion, campo, anterior, nuevo) {
  await db.query(
    `INSERT INTO public.tar_historial
       (tarea_id, usuario_id, accion, campo, valor_anterior, valor_nuevo)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [tareaId, usuarioId, accion, campo,
     anterior == null ? null : String(anterior),
     nuevo    == null ? null : String(nuevo)]
  );
}

/** Verifica que el usuario destino exista, esté activo, sea de la misma empresa y tenga acceso. */
async function validarResponsable(db, responsableId, empresa) {
  const { rows } = await db.query(
    `SELECT u.id, u.empresa, u.activo, u.area_id, u.cargo_id,
            btrim(COALESCE(u.nombres,'') || ' ' || COALESCE(u.apellidos,'')) AS nombre
       FROM public.usuarios u WHERE u.id = $1`,
    [responsableId]
  );
  if (rows.length === 0) throw new ErrorNegocio('El responsable indicado no existe', 400);

  const r = rows[0];
  if (r.activo !== 'SI') throw new ErrorNegocio('El responsable está desactivado', 400);
  if ((r.empresa || '').toUpperCase() !== empresa) {
    throw new ErrorNegocio('No puedes asignar tareas a usuarios de otra empresa', 400);
  }
  if (!r.area_id || !r.cargo_id) {
    throw new ErrorNegocio(
      'Ese usuario no tiene acceso al módulo de Tareas (le falta área o cargo)', 400
    );
  }
  return r;
}

// ══════════════════════════════════════════════════════════════════════════════
// LECTURA
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Lista paginada con filtros. Respeta visibilidad.
 */
async function listarTareas(u, f = {}) {
  const params = [];
  let where = 'WHERE ' + vis.construirFiltroVisibilidad(u, params, 't');

  if (f.estado) {
    const estados = String(f.estado).split(',').map(s => s.trim().toUpperCase());
    params.push(estados);
    where += ` AND t.estado = ANY($${params.length})`;
  }
  if (f.tipo) {
    params.push(String(f.tipo).toUpperCase());
    where += ` AND t.tipo = $${params.length}`;
  }
  if (f.prioridad) {
    const p = String(f.prioridad).split(',').map(s => s.trim().toUpperCase());
    params.push(p);
    where += ` AND t.prioridad = ANY($${params.length})`;
  }
  if (f.area_id) {
    params.push(Number(f.area_id));
    where += ` AND (t.area_responsable_id = $${params.length}
                    OR EXISTS (SELECT 1 FROM public.tar_tarea_areas ta
                                WHERE ta.tarea_id = t.id AND ta.area_id = $${params.length}))`;
  }
  if (f.responsable_id) {
    params.push(Number(f.responsable_id));
    where += ` AND t.responsable_id = $${params.length}`;
  }
  if (f.solicitante_id) {
    params.push(Number(f.solicitante_id));
    where += ` AND t.solicitante_id = $${params.length}`;
  }
  if (f.proyecto_id) {
    params.push(Number(f.proyecto_id));
    where += ` AND t.proyecto_id = $${params.length}`;
  }
  if (f.desde) {
    params.push(f.desde);
    where += ` AND t.fecha_limite >= $${params.length}`;
  }
  if (f.hasta) {
    params.push(f.hasta);
    where += ` AND t.fecha_limite <= $${params.length}`;
  }
  if (f.vencidas === '1' || f.vencidas === true) {
    where += ` AND t.esta_vencida = true`;
  }
  if (f.solo_principales === '1' || f.solo_principales === true) {
    where += ` AND t.tarea_padre_id IS NULL`;
  }
  if (f.q && String(f.q).trim()) {
    params.push(`%${String(f.q).trim()}%`);
    where += ` AND (t.titulo ILIKE $${params.length}
                    OR t.descripcion ILIKE $${params.length}
                    OR t.codigo ILIKE $${params.length})`;
  }

  // Orden seguro (lista blanca, nunca interpolar entrada del usuario)
  const ORDENES = {
    fecha_limite:  't.fecha_limite',
    prioridad:     `CASE t.prioridad WHEN 'URGENTE' THEN 1 WHEN 'ALTA' THEN 2
                                     WHEN 'MEDIA' THEN 3 ELSE 4 END`,
    estado:        't.estado',
    created_at:    't.created_at',
    titulo:        't.titulo',
  };
  const campoOrden = ORDENES[f.orden_por] || 't.fecha_limite';
  const dir        = String(f.orden_dir).toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

  const limit  = Math.min(Math.max(parseInt(f.limit, 10) || 50, 1), 200);
  const page   = Math.max(parseInt(f.page, 10) || 1, 1);
  const offset = (page - 1) * limit;

  const { rows: cnt } = await pool.query(
    `SELECT count(*)::int AS total FROM ${VISTA} t ${where}`, params
  );

  params.push(limit, offset);
  const { rows } = await pool.query(
    `SELECT * FROM ${VISTA} t
     ${where}
     ORDER BY ${campoOrden} ${dir}, t.id DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return {
    tareas: rows,
    paginacion: {
      total: cnt[0].total,
      page,
      limit,
      paginas: Math.ceil(cnt[0].total / limit) || 1,
    },
  };
}

/**
 * Bandeja personal, agrupada por urgencia. La pantalla de entrada del módulo.
 */
async function misTareas(u, { rol = 'responsable' } = {}) {
  const params = [u.empresa, u.id];
  const campo  = rol === 'solicitante' ? 'solicitante_id' : 'responsable_id';

  const { rows } = await pool.query(
    `SELECT * FROM ${VISTA} t
      WHERE t.empresa = $1 AND t.${campo} = $2
      ORDER BY
        CASE t.grupo_vencimiento
          WHEN 'VENCIDA' THEN 1 WHEN 'HOY' THEN 2
          WHEN 'SEMANA'  THEN 3 WHEN 'DESPUES' THEN 4 ELSE 5 END,
        CASE t.prioridad
          WHEN 'URGENTE' THEN 1 WHEN 'ALTA' THEN 2
          WHEN 'MEDIA' THEN 3 ELSE 4 END,
        t.fecha_limite ASC`,
    params
  );

  const grupos = { vencidas: [], hoy: [], semana: [], despues: [], cerradas: [] };
  const mapa = { VENCIDA: 'vencidas', HOY: 'hoy', SEMANA: 'semana', DESPUES: 'despues', CERRADA: 'cerradas' };
  for (const t of rows) {
    (grupos[mapa[t.grupo_vencimiento]] || grupos.despues).push(t);
  }

  return {
    grupos,
    contadores: {
      vencidas: grupos.vencidas.length,
      hoy:      grupos.hoy.length,
      semana:   grupos.semana.length,
      abiertas: grupos.vencidas.length + grupos.hoy.length + grupos.semana.length + grupos.despues.length,
      total:    rows.length,
    },
  };
}

/** Detalle completo: tarea + subtareas + comentarios + historial + acciones. */
async function detalleTarea(u, id) {
  const ctx = await cargarTarea(pool, id);
  if (!ctx) throw new ErrorNegocio('Tarea no encontrada', 404);
  if (!vis.puedeVerTarea(u, ctx.tarea, ctx.areasInvolucradas)) {
    throw new ErrorNegocio('No tienes permiso para ver esta tarea', 403);
  }

  const [vista, subtareas, comentarios, historial] = await Promise.all([
    pool.query(`SELECT * FROM ${VISTA} WHERE id = $1`, [id]),
    pool.query(`SELECT * FROM ${VISTA} WHERE tarea_padre_id = $1 ORDER BY orden, id`, [id]),
    pool.query(
      `SELECT c.id, c.comentario, c.created_at, c.editado_at, c.usuario_id,
              btrim(COALESCE(us.nombres,'') || ' ' || COALESCE(us.apellidos,'')) AS usuario_nombre,
              us.usuario AS usuario_login
         FROM public.tar_comentarios c
         JOIN public.usuarios us ON us.id = c.usuario_id
        WHERE c.tarea_id = $1 AND c.eliminado = false
        ORDER BY c.created_at ASC`, [id]),
    pool.query(
      `SELECT h.id, h.accion, h.campo, h.valor_anterior, h.valor_nuevo, h.created_at,
              btrim(COALESCE(us.nombres,'') || ' ' || COALESCE(us.apellidos,'')) AS usuario_nombre
         FROM public.tar_historial h
         LEFT JOIN public.usuarios us ON us.id = h.usuario_id
        WHERE h.tarea_id = $1
        ORDER BY h.created_at DESC, h.id DESC`, [id]),
  ]);

  const roles = vis.rolesSobreTarea(u, ctx.tarea, ctx.areasInvolucradas);

  return {
    tarea:       vista.rows[0],
    subtareas:   subtareas.rows,
    comentarios: comentarios.rows,
    historial:   historial.rows,
    permisos: {
      roles,
      puede_editar:    vis.puedeEditarTarea(u, ctx.tarea, ctx.areasInvolucradas),
      puede_reasignar: vis.puedeReasignar(u, ctx.tarea, ctx.areasInvolucradas),
      puede_comentar:  true,
      transiciones:    cfg.transicionesDisponibles(ctx.tarea.estado, roles),
    },
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// ESCRITURA
// ══════════════════════════════════════════════════════════════════════════════

async function crearTarea(u, d) {
  if (!d.titulo || !String(d.titulo).trim()) {
    throw new ErrorNegocio('El título es obligatorio', 400);
  }
  if (!d.fecha_limite) {
    throw new ErrorNegocio('La fecha límite es obligatoria', 400);
  }
  if (d.tipo && !cfg.TIPOS.includes(String(d.tipo).toUpperCase())) {
    throw new ErrorNegocio(`Tipo inválido. Válidos: ${cfg.TIPOS.join(', ')}`, 400);
  }
  if (d.prioridad && !cfg.PRIORIDADES.includes(String(d.prioridad).toUpperCase())) {
    throw new ErrorNegocio(`Prioridad inválida. Válidas: ${cfg.PRIORIDADES.join(', ')}`, 400);
  }

  const responsableId  = Number(d.responsable_id) || u.id;
  const fechaSolicitud = d.fecha_solicitud || new Date().toISOString().slice(0, 10);

  if (new Date(d.fecha_limite) < new Date(fechaSolicitud)) {
    throw new ErrorNegocio(
      'La fecha límite no puede ser anterior a la de solicitud. ' +
      'Si registras un acuerdo retroactivo, ajusta también la fecha de solicitud.', 400
    );
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await validarResponsable(client, responsableId, u.empresa);

    // Subtarea: el padre debe existir y ser visible
    if (d.tarea_padre_id) {
      const padre = await cargarTarea(client, Number(d.tarea_padre_id));
      if (!padre) throw new ErrorNegocio('La tarea padre no existe', 400);
      if (!vis.puedeVerTarea(u, padre.tarea, padre.areasInvolucradas)) {
        throw new ErrorNegocio('No tienes permiso sobre la tarea padre', 403);
      }
    }

    const { rows } = await client.query(
      `INSERT INTO public.tar_tareas
         (tipo, proyecto_id, tarea_padre_id, titulo, descripcion, empresa,
          solicitante_id, responsable_id, prioridad,
          fecha_solicitud, fecha_inicio, fecha_limite,
          creado_por, actualizado_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13)
       RETURNING *`,
      [
        (d.tipo || 'TAREA').toUpperCase(),
        d.proyecto_id    || null,
        d.tarea_padre_id || null,
        String(d.titulo).trim(),
        d.descripcion    || null,
        u.empresa,
        u.id,
        responsableId,
        (d.prioridad || 'MEDIA').toUpperCase(),
        fechaSolicitud,
        d.fecha_inicio || null,
        d.fecha_limite,
        u.id,
      ]
    );

    const tarea = rows[0];

    // Áreas involucradas
    const areas = Array.isArray(d.areas_involucradas)
      ? d.areas_involucradas.map(Number).filter(Boolean)
      : [];
    if (areas.length > 0) {
      await client.query(
        `INSERT INTO public.tar_tarea_areas (tarea_id, area_id)
         SELECT $1, x FROM unnest($2::int[]) AS x
         ON CONFLICT DO NOTHING`,
        [tarea.id, areas]
      );
    }

    await registrarHistorial(client, tarea.id, u.id, cfg.ACCIONES_HISTORIAL.CREACION,
      null, null, `${tarea.codigo} · ${tarea.titulo}`);

    if (responsableId !== u.id) {
      const actor = await nombreUsuario(client, u.id);
      await noti.notificarAsignacion(client, { ...tarea, __actorId: u.id }, actor);
    }

    await client.query('COMMIT');

    const { rows: v } = await pool.query(`SELECT * FROM ${VISTA} WHERE id = $1`, [tarea.id]);
    return v[0];

  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function editarTarea(u, id, cambios) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const ctx = await cargarTarea(client, id);
    if (!ctx) throw new ErrorNegocio('Tarea no encontrada', 404);
    if (!vis.puedeVerTarea(u, ctx.tarea, ctx.areasInvolucradas)) {
      throw new ErrorNegocio('No tienes permiso para ver esta tarea', 403);
    }
    if (!vis.puedeEditarTarea(u, ctx.tarea, ctx.areasInvolucradas)) {
      throw new ErrorNegocio('No tienes permiso para editar esta tarea', 403);
    }

    const sets = [];
    const params = [];
    const auditoria = [];

    for (const campo of cfg.CAMPOS_EDITABLES) {
      if (!(campo in cambios)) continue;

      let nuevo = cambios[campo];
      if (nuevo === '') nuevo = null;

      if (campo === 'tipo' && nuevo && !cfg.TIPOS.includes(String(nuevo).toUpperCase())) {
        throw new ErrorNegocio(`Tipo inválido. Válidos: ${cfg.TIPOS.join(', ')}`, 400);
      }
      if (campo === 'prioridad' && nuevo && !cfg.PRIORIDADES.includes(String(nuevo).toUpperCase())) {
        throw new ErrorNegocio(`Prioridad inválida. Válidas: ${cfg.PRIORIDADES.join(', ')}`, 400);
      }
      if (campo === 'progreso') {
        nuevo = Math.max(0, Math.min(100, parseInt(nuevo, 10) || 0));
      }
      if ((campo === 'tipo' || campo === 'prioridad') && nuevo) {
        nuevo = String(nuevo).toUpperCase();
      }

      const anterior = ctx.tarea[campo];
      const iguales = String(anterior ?? '') === String(nuevo ?? '');
      if (iguales) continue;

      params.push(nuevo);
      sets.push(`${campo} = $${params.length}`);
      auditoria.push({ campo, anterior, nuevo });
    }

    // Validación cruzada de fechas con los valores finales
    const limiteFinal    = 'fecha_limite'    in cambios ? cambios.fecha_limite    : ctx.tarea.fecha_limite;
    const solicitudFinal = ctx.tarea.fecha_solicitud;
    if (limiteFinal && new Date(limiteFinal) < new Date(solicitudFinal)) {
      throw new ErrorNegocio('La fecha límite no puede ser anterior a la de solicitud', 400);
    }

    // Áreas involucradas (se reemplaza el conjunto completo)
    let cambioAreas = false;
    if (Array.isArray(cambios.areas_involucradas)) {
      const nuevas = cambios.areas_involucradas.map(Number).filter(Boolean).sort();
      const viejas = [...ctx.areasInvolucradas].sort();
      if (JSON.stringify(nuevas) !== JSON.stringify(viejas)) {
        await client.query(`DELETE FROM public.tar_tarea_areas WHERE tarea_id = $1`, [id]);
        if (nuevas.length > 0) {
          await client.query(
            `INSERT INTO public.tar_tarea_areas (tarea_id, area_id)
             SELECT $1, x FROM unnest($2::int[]) AS x ON CONFLICT DO NOTHING`,
            [id, nuevas]
          );
        }
        cambioAreas = true;
        await registrarHistorial(client, id, u.id, cfg.ACCIONES_HISTORIAL.EDICION,
          'areas_involucradas', viejas.join(','), nuevas.join(','));
      }
    }

    if (sets.length === 0 && !cambioAreas) {
      await client.query('ROLLBACK');
      throw new ErrorNegocio('No hay cambios que guardar', 400);
    }

    if (sets.length > 0) {
      params.push(u.id);
      sets.push(`actualizado_por = $${params.length}`);
      params.push(id);
      await client.query(
        `UPDATE public.tar_tareas SET ${sets.join(', ')} WHERE id = $${params.length}`,
        params
      );

      for (const a of auditoria) {
        const accion = cfg.CAMPOS_FECHA.includes(a.campo)
          ? cfg.ACCIONES_HISTORIAL.CAMBIO_FECHA
          : cfg.ACCIONES_HISTORIAL.EDICION;
        await registrarHistorial(client, id, u.id, accion, a.campo, a.anterior, a.nuevo);
      }
    }

    await client.query('COMMIT');

    const { rows } = await pool.query(`SELECT * FROM ${VISTA} WHERE id = $1`, [id]);
    return rows[0];

  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function cambiarEstado(u, id, estadoNuevo, comentario = null) {
  const nuevo = String(estadoNuevo || '').toUpperCase();
  if (!Object.values(cfg.ESTADOS).includes(nuevo)) {
    throw new ErrorNegocio(`Estado inválido: ${estadoNuevo}`, 400);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const ctx = await cargarTarea(client, id);
    if (!ctx) throw new ErrorNegocio('Tarea no encontrada', 404);
    if (!vis.puedeVerTarea(u, ctx.tarea, ctx.areasInvolucradas)) {
      throw new ErrorNegocio('No tienes permiso para ver esta tarea', 403);
    }

    const roles = vis.rolesSobreTarea(u, ctx.tarea, ctx.areasInvolucradas);
    const check = cfg.validarTransicion(ctx.tarea.estado, nuevo, roles);
    if (!check.ok) throw new ErrorNegocio(check.error, 409);

    // Una tarea padre no se completa con subtareas abiertas
    if (nuevo === cfg.ESTADOS.COMPLETADA) {
      const { rows: pend } = await client.query(
        `SELECT codigo, titulo FROM public.tar_tareas
          WHERE tarea_padre_id = $1 AND estado NOT IN ('COMPLETADA','CANCELADA')`,
        [id]
      );
      if (pend.length > 0) {
        throw new ErrorNegocio(
          `No puedes completar esta tarea: tiene ${pend.length} subtarea(s) abierta(s): ` +
          pend.map(p => p.codigo).join(', '), 409
        );
      }
    }

    await client.query(
      `UPDATE public.tar_tareas SET estado = $1, actualizado_por = $2 WHERE id = $3`,
      [nuevo, u.id, id]
    );

    let accion = cfg.ACCIONES_HISTORIAL.CAMBIO_ESTADO;
    if (nuevo === cfg.ESTADOS.CANCELADA) accion = cfg.ACCIONES_HISTORIAL.CANCELACION;
    if (ctx.tarea.estado === cfg.ESTADOS.COMPLETADA) accion = cfg.ACCIONES_HISTORIAL.REAPERTURA;

    await registrarHistorial(client, id, u.id, accion, 'estado', ctx.tarea.estado, nuevo);

    if (comentario && String(comentario).trim()) {
      await client.query(
        `INSERT INTO public.tar_comentarios (tarea_id, usuario_id, comentario)
         VALUES ($1,$2,$3)`,
        [id, u.id, String(comentario).trim()]
      );
    }

    const actor = await nombreUsuario(client, u.id);
    await noti.notificarCambioEstado(client, ctx.tarea, nuevo, u.id, actor);

    await client.query('COMMIT');

    const { rows } = await pool.query(`SELECT * FROM ${VISTA} WHERE id = $1`, [id]);
    return rows[0];

  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function reasignar(u, id, nuevoResponsableId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const ctx = await cargarTarea(client, id);
    if (!ctx) throw new ErrorNegocio('Tarea no encontrada', 404);
    if (!vis.puedeVerTarea(u, ctx.tarea, ctx.areasInvolucradas)) {
      throw new ErrorNegocio('No tienes permiso para ver esta tarea', 403);
    }
    if (!vis.puedeReasignar(u, ctx.tarea, ctx.areasInvolucradas)) {
      throw new ErrorNegocio(
        'Solo el solicitante, la jefatura del área o un administrador pueden reasignar', 403
      );
    }

    const nuevoId = Number(nuevoResponsableId);
    if (nuevoId === ctx.tarea.responsable_id) {
      throw new ErrorNegocio('Esa persona ya es la responsable', 400);
    }

    const nuevoResp = await validarResponsable(client, nuevoId, u.empresa);
    const anteriorNombre = await nombreUsuario(client, ctx.tarea.responsable_id);

    // area_responsable_id se recalcula solo (trigger tar_asigna_area_responsable)
    await client.query(
      `UPDATE public.tar_tareas
          SET responsable_id = $1, area_responsable_id = NULL, actualizado_por = $2
        WHERE id = $3`,
      [nuevoId, u.id, id]
    );

    await registrarHistorial(client, id, u.id, cfg.ACCIONES_HISTORIAL.REASIGNACION,
      'responsable_id', anteriorNombre, nuevoResp.nombre);

    const actor = await nombreUsuario(client, u.id);
    await noti.notificarReasignacion(
      client, { ...ctx.tarea, responsable_id: nuevoId }, ctx.tarea.responsable_id, u.id, actor
    );

    await client.query('COMMIT');

    const { rows } = await pool.query(`SELECT * FROM ${VISTA} WHERE id = $1`, [id]);
    return rows[0];

  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// COMENTARIOS
// ══════════════════════════════════════════════════════════════════════════════

async function agregarComentario(u, id, texto) {
  if (!texto || !String(texto).trim()) {
    throw new ErrorNegocio('El comentario no puede estar vacío', 400);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const ctx = await cargarTarea(client, id);
    if (!ctx) throw new ErrorNegocio('Tarea no encontrada', 404);
    if (!vis.puedeVerTarea(u, ctx.tarea, ctx.areasInvolucradas)) {
      throw new ErrorNegocio('No tienes permiso para comentar esta tarea', 403);
    }

    const { rows } = await client.query(
      `INSERT INTO public.tar_comentarios (tarea_id, usuario_id, comentario)
       VALUES ($1,$2,$3) RETURNING *`,
      [id, u.id, String(texto).trim()]
    );

    await registrarHistorial(client, id, u.id, cfg.ACCIONES_HISTORIAL.COMENTARIO, null, null, null);

    const actor = await nombreUsuario(client, u.id);
    await noti.notificarComentario(client, ctx.tarea, u.id, actor);

    await client.query('COMMIT');

    return {
      ...rows[0],
      usuario_nombre: actor,
    };

  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function editarComentario(u, comentarioId, texto) {
  if (!texto || !String(texto).trim()) {
    throw new ErrorNegocio('El comentario no puede estar vacío', 400);
  }
  const { rows } = await pool.query(
    `SELECT * FROM public.tar_comentarios WHERE id = $1 AND eliminado = false`, [comentarioId]
  );
  if (rows.length === 0) throw new ErrorNegocio('Comentario no encontrado', 404);
  if (rows[0].usuario_id !== u.id && !u.esAdmin) {
    throw new ErrorNegocio('Solo puedes editar tus propios comentarios', 403);
  }

  const { rows: upd } = await pool.query(
    `UPDATE public.tar_comentarios SET comentario = $1, editado_at = now()
      WHERE id = $2 RETURNING *`,
    [String(texto).trim(), comentarioId]
  );
  return upd[0];
}

async function eliminarComentario(u, comentarioId) {
  const { rows } = await pool.query(
    `SELECT * FROM public.tar_comentarios WHERE id = $1 AND eliminado = false`, [comentarioId]
  );
  if (rows.length === 0) throw new ErrorNegocio('Comentario no encontrado', 404);
  if (rows[0].usuario_id !== u.id && !u.esAdmin) {
    throw new ErrorNegocio('Solo puedes eliminar tus propios comentarios', 403);
  }
  await pool.query(`UPDATE public.tar_comentarios SET eliminado = true WHERE id = $1`, [comentarioId]);
  return true;
}

// ══════════════════════════════════════════════════════════════════════════════
// CATÁLOGOS
// ══════════════════════════════════════════════════════════════════════════════

/** Todo lo que la interfaz necesita para pintar los selects, en una sola llamada. */
async function catalogos(u) {
  const [areas, cargos, usuarios, proyectos] = await Promise.all([
    pool.query(`SELECT id, codigo, nombre, color FROM public.tar_areas
                 WHERE activo = true ORDER BY orden`),
    pool.query(`SELECT id, codigo, nombre, nivel, es_jefatura FROM public.tar_cargos
                 WHERE activo = true ORDER BY nivel, nombre`),
    pool.query(
      `SELECT u.id,
              btrim(COALESCE(u.nombres,'') || ' ' || COALESCE(u.apellidos,'')) AS nombre,
              u.usuario, u.area_id, a.nombre AS area_nombre, a.color AS area_color,
              c.nombre AS cargo_nombre, c.es_jefatura
         FROM public.usuarios u
         JOIN public.tar_areas  a ON a.id = u.area_id
         JOIN public.tar_cargos c ON c.id = u.cargo_id
        WHERE u.activo = 'SI' AND UPPER(u.empresa) = $1
        ORDER BY a.orden, c.nivel, nombre`,
      [u.empresa]
    ),
    pool.query(
      `SELECT p.id, p.nombre, p.color, p.area_id, a.nombre AS area_nombre
         FROM public.tar_proyectos p
         LEFT JOIN public.tar_areas a ON a.id = p.area_id
        WHERE p.estado = 'ACTIVO' AND UPPER(p.empresa) = $1
        ORDER BY p.nombre`,
      [u.empresa]
    ),
  ]);

  return {
    areas:     areas.rows,
    cargos:    cargos.rows,
    usuarios:  usuarios.rows,
    proyectos: proyectos.rows,
    estados: Object.values(cfg.ESTADOS).map(e => ({ valor: e, etiqueta: cfg.ETIQUETAS_ESTADO[e] })),
    tipos:    cfg.TIPOS.map(t => ({ valor: t, etiqueta: cfg.ETIQUETAS_TIPO[t] })),
    prioridades: cfg.PRIORIDADES.map(p => ({ valor: p, etiqueta: cfg.ETIQUETAS_PRIORIDAD[p] })),
    yo: {
      id: u.id, nombre: u.usuario, area_id: u.areaId, area_nombre: u.areaNombre,
      cargo_nombre: u.cargoNombre, es_jefatura: u.esJefatura, es_admin: u.esAdmin,
    },
  };
}

module.exports = {
  ErrorNegocio,
  listarTareas,
  misTareas,
  detalleTarea,
  crearTarea,
  editarTarea,
  cambiarEstado,
  reasignar,
  agregarComentario,
  editarComentario,
  eliminarComentario,
  catalogos,
  cargarTarea,
};
