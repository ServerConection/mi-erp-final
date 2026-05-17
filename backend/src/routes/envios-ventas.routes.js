// src/routes/envios-ventas.routes.js
// ============================================================
// POST /api/envios-ventas  — Ingreso de nueva venta
// Solo ADMINISTRADOR puede acceder
// Inserta las 15 primeras columnas de public.envios_ventas
// Las columnas de fecha e IP se auto-computan en el servidor
// ============================================================

const express = require('express');
const router  = express.Router();
const pool    = require('../config/db');
const { verificarToken, noAsesor } = require('../middleware/auth');

// Todas las rutas requieren token válido — bloqueado solo para ASESOR
router.use(verificarToken, noAsesor);


// ─── GET /api/envios-ventas/opciones ────────────────────────────────────────
// Devuelve listas únicas de distribuidores y supervisores de la tabla
router.get('/opciones', async (req, res) => {
  try {
    const [dist, sup] = await Promise.all([
      pool.query(`SELECT DISTINCT distribuidor_autorizado FROM public.envios_ventas WHERE distribuidor_autorizado IS NOT NULL ORDER BY 1`),
      pool.query(`SELECT DISTINCT supervisor FROM public.envios_ventas WHERE supervisor IS NOT NULL ORDER BY 1`),
    ]);
    res.json({
      success: true,
      distribuidores: dist.rows.map(r => r.distribuidor_autorizado),
      supervisores:   sup.rows.map(r => r.supervisor),
    });
  } catch (e) {
    console.error('[ENVIOS-VENTAS] opciones:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ─── GET /api/envios-ventas ──────────────────────────────────────────────────
// Listado paginado, solo admin
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT id, estatus_envio, ip_origen, fecha_registro_sistema,
             codigo_asesor, id_bitrix, distribuidor_autorizado, supervisor,
             origen_venta, venta_nueva_o_reingreso, turno
      FROM public.envios_ventas
      ORDER BY id DESC
      LIMIT 200
    `);
    res.json({ success: true, data: rows });
  } catch (e) {
    console.error('[ENVIOS-VENTAS] listado:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ─── POST /api/envios-ventas ─────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const {
      estatus_envio,
      codigo_asesor,
      id_bitrix,
      distribuidor_autorizado,
      supervisor,
      origen_venta,
      venta_nueva_o_reingreso,
      turno,
    } = req.body;

    // Validaciones básicas
    if (!estatus_envio)           return res.status(400).json({ success: false, error: 'estatus_envio es requerido' });
    if (!codigo_asesor)           return res.status(400).json({ success: false, error: 'codigo_asesor es requerido' });
    if (!origen_venta)            return res.status(400).json({ success: false, error: 'origen_venta es requerido' });
    if (!venta_nueva_o_reingreso) return res.status(400).json({ success: false, error: 'venta_nueva_o_reingreso es requerido' });
    if (!turno)                   return res.status(400).json({ success: false, error: 'turno es requerido' });

    // Auto-computo de IP
    const ip_origen =
      (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
      req.socket?.remoteAddress || '0.0.0.0';

    // fecha_registro_sistema — las columnas año/mes/dia son GENERATED ALWAYS AS
    // en la tabla, por lo que Postgres las deriva solo; no se insertan manualmente
    const fecha_registro_sistema = new Date();

    const { rows } = await pool.query(`
      INSERT INTO public.envios_ventas (
        estatus_envio,
        ip_origen,
        fecha_registro_sistema,
        codigo_asesor,
        id_bitrix,
        distribuidor_autorizado,
        supervisor,
        origen_venta,
        venta_nueva_o_reingreso,
        turno
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING id, estatus_envio, fecha_registro_sistema, codigo_asesor, id_bitrix
    `, [
      estatus_envio?.trim()            || null,
      ip_origen,
      fecha_registro_sistema,
      codigo_asesor?.trim()            || null,
      id_bitrix?.trim()                || null,
      distribuidor_autorizado?.trim()  || null,
      supervisor?.trim()               || null,
      origen_venta?.trim()             || null,
      venta_nueva_o_reingreso?.trim()  || null,
      turno?.trim()                    || null,
    ]);

    console.log(`[ENVIOS-VENTAS] Nueva venta registrada id=${rows[0].id} por admin ${req.user.usuario}`);
    res.status(201).json({ success: true, data: rows[0], mensaje: 'Venta registrada correctamente' });

  } catch (e) {
    console.error('[ENVIOS-VENTAS] insert:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
