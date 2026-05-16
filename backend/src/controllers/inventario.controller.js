/**
 * Inventario Controller
 * Trabaja sobre public.equipos
 * Columnas: id, codigo, seriepc, seriepantalla, serieteclado,
 *           mouse, headset, imagen, asesor, fecharegistro,
 *           fechamodificacion, observacion, firma, archivo, correos, opcion
 */

const pool = require('../config/db');
const path = require('path');
const fs   = require('fs');

// ── Helpers ───────────────────────────────────────────────────────────────────
const IMAGES_DIR = path.join(process.cwd(), 'uploads', 'equipos_Images');
if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });

// ════════════════════════════════════════════════════════════════════════════════
// GET /api/inventario/equipos
// ════════════════════════════════════════════════════════════════════════════════
exports.getEquipos = async (req, res) => {
  try {
    const { buscar, asesor } = req.query;

    let q = `
      SELECT id, codigo, seriepc, seriepantalla, serieteclado,
             mouse, headset, imagen, asesor,
             fecharegistro, fechamodificacion, observacion,
             firma, archivo, correos, opcion
      FROM public.equipos
      WHERE 1=1
    `;
    const params = [];

    if (buscar) {
      params.push(`%${buscar}%`);
      q += ` AND (
        codigo        ILIKE $${params.length} OR
        seriepc       ILIKE $${params.length} OR
        seriepantalla ILIKE $${params.length} OR
        asesor        ILIKE $${params.length}
      )`;
    }

    if (asesor) {
      params.push(`%${asesor}%`);
      q += ` AND asesor ILIKE $${params.length}`;
    }

    q += ' ORDER BY id ASC';

    const result = await pool.query(q, params);
    res.json({ ok: true, data: result.rows });
  } catch (e) {
    console.error('[Inventario] getEquipos:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
};

// ════════════════════════════════════════════════════════════════════════════════
// GET /api/inventario/equipos/:id
// ════════════════════════════════════════════════════════════════════════════════
exports.getEquipo = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM public.equipos WHERE id = $1',
      [req.params.id]
    );
    if (!result.rows.length)
      return res.status(404).json({ ok: false, error: 'Equipo no encontrado' });
    res.json({ ok: true, data: result.rows[0] });
  } catch (e) {
    console.error('[Inventario] getEquipo:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
};

// ════════════════════════════════════════════════════════════════════════════════
// POST /api/inventario/equipos
// ════════════════════════════════════════════════════════════════════════════════
exports.createEquipo = async (req, res) => {
  try {
    const {
      codigo, seriepc, seriepantalla, serieteclado,
      mouse, headset, asesor, observacion,
      firma, archivo, correos, opcion
    } = req.body;

    if (!codigo?.trim())
      return res.status(400).json({ ok: false, error: 'El código es requerido' });

    // Si viene imagen adjunta
    let imagenPath = null;
    if (req.file) {
      imagenPath = `equipos_Images/${req.file.filename}`;
    }

    const result = await pool.query(
      `INSERT INTO public.equipos
        (codigo, seriepc, seriepantalla, serieteclado, mouse, headset,
         imagen, asesor, observacion, firma, archivo, correos, opcion,
         fecharegistro, fechamodificacion)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW(),NOW())
       RETURNING *`,
      [
        codigo.trim(),
        seriepc   || null, seriepantalla || null, serieteclado || null,
        mouse     || null, headset       || null,
        imagenPath,
        asesor    || 'Sin asignar',
        observacion || null,
        firma     || null, archivo || null, correos || null, opcion || null
      ]
    );

    res.status(201).json({ ok: true, data: result.rows[0] });
  } catch (e) {
    console.error('[Inventario] createEquipo:', e.message);
    if (e.code === '23505')
      return res.status(409).json({ ok: false, error: `El código ya existe` });
    res.status(500).json({ ok: false, error: e.message });
  }
};

// ════════════════════════════════════════════════════════════════════════════════
// PUT /api/inventario/equipos/:id
// ════════════════════════════════════════════════════════════════════════════════
exports.updateEquipo = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      codigo, seriepc, seriepantalla, serieteclado,
      mouse, headset, asesor, observacion,
      firma, archivo, correos, opcion
    } = req.body;

    // Recuperar imagen actual para no pisarla si no viene una nueva
    const cur = await pool.query('SELECT imagen FROM public.equipos WHERE id=$1', [id]);
    if (!cur.rows.length)
      return res.status(404).json({ ok: false, error: 'Equipo no encontrado' });

    let imagenPath = cur.rows[0].imagen;
    if (req.file) {
      imagenPath = `equipos_Images/${req.file.filename}`;
    }

    const result = await pool.query(
      `UPDATE public.equipos
       SET codigo=$1, seriepc=$2, seriepantalla=$3, serieteclado=$4,
           mouse=$5, headset=$6, imagen=$7, asesor=$8,
           observacion=$9, firma=$10, archivo=$11, correos=$12, opcion=$13,
           fechamodificacion=NOW()
       WHERE id=$14
       RETURNING *`,
      [
        codigo, seriepc, seriepantalla, serieteclado,
        mouse, headset, imagenPath,
        asesor || 'Sin asignar',
        observacion, firma, archivo, correos, opcion,
        id
      ]
    );

    res.json({ ok: true, data: result.rows[0] });
  } catch (e) {
    console.error('[Inventario] updateEquipo:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
};

// ════════════════════════════════════════════════════════════════════════════════
// DELETE /api/inventario/equipos/:id
// ════════════════════════════════════════════════════════════════════════════════
exports.deleteEquipo = async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM public.equipos WHERE id=$1', [id]);
    res.json({ ok: true });
  } catch (e) {
    console.error('[Inventario] deleteEquipo:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
};

// ════════════════════════════════════════════════════════════════════════════════
// GET /api/inventario/dashboard
// ════════════════════════════════════════════════════════════════════════════════
exports.getDashboard = async (req, res) => {
  try {
    const [resumen, porAsesor] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*)                                          AS total,
          COUNT(*) FILTER (WHERE asesor = 'Sin asignar' OR asesor IS NULL) AS sin_asignar,
          COUNT(*) FILTER (WHERE asesor != 'Sin asignar' AND asesor IS NOT NULL) AS asignados,
          COUNT(*) FILTER (WHERE imagen IS NOT NULL)       AS con_imagen
        FROM public.equipos
      `),
      pool.query(`
        SELECT asesor, COUNT(*) AS total
        FROM public.equipos
        WHERE asesor IS NOT NULL AND asesor != 'Sin asignar'
        GROUP BY asesor
        ORDER BY total DESC
        LIMIT 10
      `)
    ]);

    res.json({
      ok: true,
      resumen: resumen.rows[0],
      porAsesor: porAsesor.rows
    });
  } catch (e) {
    console.error('[Inventario] getDashboard:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
};
