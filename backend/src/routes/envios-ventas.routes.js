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
const { verificarToken, soloAdmin } = require('../middleware/auth');

// Todas las rutas requieren token válido + perfil ADMINISTRADOR
router.use(verificarToken, soloAdmin);

// ─── Helpers ────────────────────────────────────────────────────────────────
const MESES = {
  0:'ENERO', 1:'FEBRERO', 2:'MARZO', 3:'ABRIL', 4:'MAYO', 5:'JUNIO',
  6:'JULIO', 7:'AGOSTO', 8:'SEPTIEMBRE', 9:'OCTUBRE', 10:'NOVIEMBRE', 11:'DICIEMBRE'
};
const DIAS = {
  0:'DOMINGO', 1:'LUNES', 2:'MARTES', 3:'MIÉRCOLES',
  4:'JUEVES', 5:'VIERNES', 6:'SÁBADO'
};

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

    // Auto-computo de fecha (Ecuador UTC-5)
    const ahora = new Date();
    const fecha_registro_sistema   = ahora;
    const año_registro_sistema     = ahora.getFullYear();
    const mes_registro_sistema     = MESES[ahora.getMonth()];
    const dia_num_registro_sistema = ahora.getDate();
    const dia_abc_registro_sistema = DIAS[ahora.getDay()];

    const { rows } = await pool.query(`
      INSERT INTO public.envios_ventas (
        estatus_envio,
        ip_origen,
        fecha_registro_sistema,
        año_registro_sistema,
        mes_registro_sistema,
        dia_num_registro_sistema,
        dia_abc_registro_sistema,
        codigo_asesor,
        id_bitrix,
        distribuidor_autorizado,
        supervisor,
        origen_venta,
        venta_nueva_o_reingreso,
        turno
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      RETURNING id, estatus_envio, fecha_registro_sistema, codigo_asesor, id_bitrix
    `, [
      estatus_envio?.trim()            || null,
      ip_origen,
      fecha_registro_sistema,
      año_registro_sistema,
      mes_registro_sistema,
      dia_num_registro_sistema,
      dia_abc_registro_sistema,
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
