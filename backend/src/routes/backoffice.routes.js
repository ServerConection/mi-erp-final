// src/routes/backoffice.routes.js
// ============================================================
// Módulo BACKOFFICE — Auditoría de registros envios_ventas
// GET  /api/backoffice        → listar registros
// GET  /api/backoffice/:id    → detalle completo de un registro
// PUT  /api/backoffice/:id    → editar solo campos de auditoría
// Todos los perfiles excepto ASESOR
// ============================================================

const express = require('express');
const router  = express.Router();
const pool    = require('../config/db');
const { verificarToken, noAsesor } = require('../middleware/auth');

router.use(verificarToken, noAsesor);

// ─── Helpers fecha Ecuador ────────────────────────────────────────────────────
const MESES = {
  0:'ENERO',1:'FEBRERO',2:'MARZO',3:'ABRIL',4:'MAYO',5:'JUNIO',
  6:'JULIO',7:'AGOSTO',8:'SEPTIEMBRE',9:'OCTUBRE',10:'NOVIEMBRE',11:'DICIEMBRE'
};
const DIAS = {
  0:'DOMINGO',1:'LUNES',2:'MARTES',3:'MIÉRCOLES',
  4:'JUEVES',5:'VIERNES',6:'SÁBADO'
};

// ─── GET /api/backoffice ─────────────────────────────────────────────────────
// Lista todos los registros con columnas clave para la tabla
router.get('/', async (req, res) => {
  try {
    const { buscar = '', page = 1, limit = 100 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let whereClause = "WHERE estatus_envio != 'BORRADOR'";
    const params = [];

    if (buscar.trim()) {
      params.push(`%${buscar.trim()}%`);
      whereClause += ` AND (
        codigo_asesor            ILIKE $1 OR
        id_bitrix                ILIKE $1 OR
        nombre_cliente_completo  ILIKE $1 OR
        numero_identificacion    ILIKE $1 OR
        distribuidor_autorizado  ILIKE $1 OR
        supervisor               ILIKE $1
      )`;
    }

    const countParams = [...params];
    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*)::int AS total FROM public.envios_ventas ${whereClause}`,
      countParams
    );

    params.push(parseInt(limit), offset);
    // params.length es 2 (sin buscar) o 3 (con buscar)
    // El LIMIT es el penúltimo elemento → SQL param nº (length - 1)
    // El OFFSET es el último elemento   → SQL param nº (length)
    const limitParam  = params.length - 1;  // $1 o $2
    const offsetParam = params.length;      // $2 o $3

    const { rows } = await pool.query(`
      SELECT
        id,
        estatus_envio,
        fecha_registro_sistema,
        codigo_asesor,
        id_bitrix,
        distribuidor_autorizado,
        supervisor,
        origen_venta,
        venta_nueva_o_reingreso,
        turno,
        nombre_cliente_completo,
        numero_identificacion,
        plan_contratado_final,
        -- campos auditoría (resumen para tabla)
        venta_efectiva,
        calidad_venta_analista,
        auditoria_documentos,
        estatus_regularizacion,
        auditado_por
      FROM public.envios_ventas
      ${whereClause}
      ORDER BY id DESC
      LIMIT $${limitParam} OFFSET $${offsetParam}
    `, params);

    res.json({ success: true, data: rows, total: countRows[0].total });
  } catch (e) {
    console.error('[BACKOFFICE] GET list:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ─── GET /api/backoffice/:id ──────────────────────────────────────────────────
// Detalle completo de un registro
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM public.envios_ventas WHERE id = $1',
      [req.params.id]
    );
    if (rows.length === 0)
      return res.status(404).json({ success: false, error: 'Registro no encontrado' });
    res.json({ success: true, data: rows[0] });
  } catch (e) {
    console.error('[BACKOFFICE] GET detail:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ─── PUT /api/backoffice/:id ──────────────────────────────────────────────────
// Editar CUALQUIER campo del registro
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // 1. Verificar existencia
    const { rows: existing } = await pool.query(
      'SELECT id FROM public.envios_ventas WHERE id = $1',
      [id]
    );
    if (existing.length === 0) {
      return res.status(404).json({ success: false, error: 'Registro no encontrado' });
    }

    const payload = req.body;

    // 2. Si se proporciona fecha_regularizacion_atc, autocomputar campos de fecha
    if (payload.fecha_regularizacion_atc) {
      const d = new Date(payload.fecha_regularizacion_atc + 'T00:00:00');
      payload.año_regularizacion_atc = d.getFullYear();
      payload.mes_regularizacion_atc = MESES[d.getMonth()];
      payload.dia_num_regularizacion_atc = d.getDate();
      payload.dia_abc_regularizacion_atc = DIAS[d.getDay()];
    }

    // 3. Excluir campos sensibles/inmutables como 'id'
    delete payload.id;

    const fields = Object.keys(payload);
    if (fields.length === 0) {
      return res.status(400).json({ success: false, error: 'No se enviaron datos para actualizar' });
    }

    // 4. Construcción dinámica del SET en SQL
    const setClause = fields
      .map((field, idx) => `"${field}" = $${idx + 1}`)
      .join(', ');

    const values = fields.map((field) => {
      const val = payload[field];
      return val === '' ? null : val; // Convertir strings vacíos a null
    });

    // Añadir el ID como último parámetro
    values.push(id);
    const query = `
      UPDATE public.envios_ventas 
      SET ${setClause} 
      WHERE id = $${values.length} 
      RETURNING *
    `;

    const { rows } = await pool.query(query, values);

    console.log(`[BACKOFFICE] Registro id=${id} actualizado por ${req.user?.usuario || 'usuario'}`);
    res.json({ success: true, data: rows[0], mensaje: 'Registro actualizado correctamente' });
  } catch (e) {
    console.error('[BACKOFFICE] PUT update:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
