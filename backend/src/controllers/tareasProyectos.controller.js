/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * CONTROLADOR: Proyectos del módulo de Tareas
 * ═══════════════════════════════════════════════════════════════════════════════
 * Los proyectos son agrupadores opcionales. Visibles para toda la empresa;
 * crear y editar queda limitado a jefaturas y administradores.
 */

const pool = require('../config/db');

function error500(res, ctx, e) {
  console.error(`[tareasProyectos:${ctx}]`, e.message);
  return res.status(500).json({ success: false, error: 'Error interno del servidor' });
}

// GET /api/tareas/proyectos
exports.listar = async (req, res) => {
  try {
    const incluirArchivados = req.query.archivados === '1';

    // Los proyectos son compartidos entre NOVONET y VELSA, igual que las tareas.
    const { rows } = await pool.query(
      `SELECT p.id, p.nombre, p.descripcion, p.empresa, p.area_id, p.color,
              p.estado, p.created_at,
              a.nombre AS area_nombre, a.color AS area_color,
              btrim(COALESCE(u.nombres,'') || ' ' || COALESCE(u.apellidos,'')) AS creado_por_nombre,
              (SELECT count(*)::int FROM public.tar_tareas t
                WHERE t.proyecto_id = p.id) AS total_tareas,
              (SELECT count(*)::int FROM public.tar_tareas t
                WHERE t.proyecto_id = p.id
                  AND t.estado NOT IN ('COMPLETADA','CANCELADA')) AS tareas_abiertas
         FROM public.tar_proyectos p
         LEFT JOIN public.tar_areas a ON a.id = p.area_id
         LEFT JOIN public.usuarios  u ON u.id = p.creado_por
        WHERE ($1::boolean = true OR p.estado = 'ACTIVO')
        ORDER BY p.estado, p.nombre`,
      [incluirArchivados]
    );

    res.json({ success: true, data: rows });
  } catch (e) { return error500(res, 'listar', e); }
};

// POST /api/tareas/proyectos
exports.crear = async (req, res) => {
  try {
    const u = req.tareasUser;
    const { nombre, descripcion, area_id, color, empresa } = req.body;

    if (!nombre || !String(nombre).trim()) {
      return res.status(400).json({ success: false, error: 'El nombre es obligatorio' });
    }

    const { rows } = await pool.query(
      `INSERT INTO public.tar_proyectos (nombre, descripcion, empresa, area_id, color, creado_por)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [
        String(nombre).trim(),
        descripcion || null,
        ['NOVONET', 'VELSA'].includes(String(empresa || '').toUpperCase())
          ? String(empresa).toUpperCase()
          : u.empresa,
        area_id || u.areaId,
        color || '#6B7280',
        u.id,
      ]
    );

    res.status(201).json({ success: true, data: rows[0] });
  } catch (e) { return error500(res, 'crear', e); }
};

// PATCH /api/tareas/proyectos/:id
exports.editar = async (req, res) => {
  try {
    const u = req.tareasUser;
    const id = Number(req.params.id);

    const { rows: existe } = await pool.query(
      `SELECT * FROM public.tar_proyectos WHERE id = $1`, [id]
    );
    if (existe.length === 0) {
      return res.status(404).json({ success: false, error: 'Proyecto no encontrado' });
    }

    const permitidos = ['nombre', 'descripcion', 'area_id', 'color', 'estado', 'empresa'];
    const sets = [];
    const params = [];

    for (const campo of permitidos) {
      if (!(campo in req.body)) continue;
      if (campo === 'estado' && !['ACTIVO', 'ARCHIVADO'].includes(req.body.estado)) {
        return res.status(400).json({ success: false, error: 'Estado inválido' });
      }
      params.push(req.body[campo] === '' ? null : req.body[campo]);
      sets.push(`${campo} = $${params.length}`);
    }

    if (sets.length === 0) {
      return res.status(400).json({ success: false, error: 'No hay cambios que guardar' });
    }

    params.push(id);
    const { rows } = await pool.query(
      `UPDATE public.tar_proyectos SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );

    res.json({ success: true, data: rows[0] });
  } catch (e) { return error500(res, 'editar', e); }
};

// PATCH /api/tareas/proyectos/:id/archivar
exports.archivar = async (req, res) => {
  try {
    const id = Number(req.params.id);

    const { rows } = await pool.query(
      `UPDATE public.tar_proyectos
          SET estado = CASE WHEN estado = 'ACTIVO' THEN 'ARCHIVADO' ELSE 'ACTIVO' END
        WHERE id = $1
        RETURNING *`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Proyecto no encontrado' });
    }

    res.json({ success: true, data: rows[0] });
  } catch (e) { return error500(res, 'archivar', e); }
};
