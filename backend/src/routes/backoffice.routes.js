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

    let whereClause = '';
    const params = [];

    if (buscar.trim()) {
      params.push(`%${buscar.trim()}%`);
      whereClause = `WHERE (
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
    const limitIdx  = params.length - 1;
    const offsetIdx = params.length;

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
      LIMIT $${limitIdx + 1} OFFSET $${offsetIdx}
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
// Editar SOLO los campos de auditoría
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar existencia
    const { rows: existing } = await pool.query(
      'SELECT id FROM public.envios_ventas WHERE id = $1', [id]
    );
    if (existing.length === 0)
      return res.status(404).json({ success: false, error: 'Registro no encontrado' });

    const {
      calidad_venta_analista,
      novedades_atc,
      venta_efectiva,
      auditoria_documentos,
      auditado_por,
      inconsistencia_documental,
      observacion_auditoria,
      errores_telcos,
      estatus_regularizacion,
      detalle_regularizacion,
      fecha_regularizacion_atc,
      mes_regularizacion,
      observacion_venta_original,
      observacion_gestion_cobranza,
    } = req.body;

    // Auto-computo de campos derivados de fecha_regularizacion_atc
    let año_reg = null, mes_reg_nom = null, dia_num_reg = null, dia_abc_reg = null;
    if (fecha_regularizacion_atc) {
      const d = new Date(fecha_regularizacion_atc + 'T00:00:00');
      año_reg     = d.getFullYear();
      mes_reg_nom = MESES[d.getMonth()];
      dia_num_reg = d.getDate();
      dia_abc_reg = DIAS[d.getDay()];
    }

    const { rows } = await pool.query(`
      UPDATE public.envios_ventas SET
        calidad_venta_analista    = COALESCE($1,  calidad_venta_analista),
        novedades_atc             = COALESCE($2,  novedades_atc),
        venta_efectiva            = COALESCE($3,  venta_efectiva),
        auditoria_documentos      = COALESCE($4,  auditoria_documentos),
        auditado_por              = COALESCE($5,  auditado_por),
        inconsistencia_documental = COALESCE($6,  inconsistencia_documental),
        observacion_auditoria     = COALESCE($7,  observacion_auditoria),
        errores_telcos            = COALESCE($8,  errores_telcos),
        estatus_regularizacion    = COALESCE($9,  estatus_regularizacion),
        detalle_regularizacion    = COALESCE($10, detalle_regularizacion),
        fecha_regularizacion_atc  = COALESCE($11, fecha_regularizacion_atc),
        año_regularizacion_atc    = COALESCE($12, año_regularizacion_atc),
        mes_regularizacion_atc    = COALESCE($13, mes_regularizacion_atc),
        dia_num_regularizacion_atc= COALESCE($14, dia_num_regularizacion_atc),
        dia_abc_regularizacion_atc= COALESCE($15, dia_abc_regularizacion_atc),
        mes_regularizacion        = COALESCE($16, mes_regularizacion),
        observacion_venta_original    = COALESCE($17, observacion_venta_original),
        observacion_gestion_cobranza  = COALESCE($18, observacion_gestion_cobranza)
      WHERE id = $19
      RETURNING *
    `, [
      calidad_venta_analista    || null,
      novedades_atc             || null,
      venta_efectiva            || null,
      auditoria_documentos      || null,
      auditado_por              || null,
      inconsistencia_documental || null,
      observacion_auditoria     || null,
      errores_telcos            || null,
      estatus_regularizacion    || null,
      detalle_regularizacion    || null,
      fecha_regularizacion_atc  || null,
      año_reg,
      mes_reg_nom,
      dia_num_reg,
      dia_abc_reg,
      mes_regularizacion        || null,
      observacion_venta_original    || null,
      observacion_gestion_cobranza  || null,
      id,
    ]);

    console.log(`[BACKOFFICE] Auditoría actualizada id=${id} por ${req.user.usuario}`);
    res.json({ success: true, data: rows[0], mensaje: 'Auditoría guardada correctamente' });
  } catch (e) {
    console.error('[BACKOFFICE] PUT audit:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
