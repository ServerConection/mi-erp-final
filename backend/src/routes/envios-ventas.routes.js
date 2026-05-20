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
// Acepta todos los campos que envía NuevaVenta.jsx
// Las columnas año/mes/dia_* son GENERATED ALWAYS AS en PostgreSQL → no se insertan
router.post('/', async (req, res) => {
  try {
    const b = req.body;

    // Validaciones básicas
    if (!b.estatus_envio)           return res.status(400).json({ success: false, error: 'estatus_envio es requerido' });
    if (!b.codigo_asesor)           return res.status(400).json({ success: false, error: 'codigo_asesor es requerido' });
    if (!b.origen_venta)            return res.status(400).json({ success: false, error: 'origen_venta es requerido' });
    if (!b.venta_nueva_o_reingreso) return res.status(400).json({ success: false, error: 'venta_nueva_o_reingreso es requerido' });
    if (!b.turno)                   return res.status(400).json({ success: false, error: 'turno es requerido' });

    // Auto-computo de IP y fecha
    const ip_origen =
      (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
      req.socket?.remoteAddress || '0.0.0.0';
    const fecha_registro_sistema = new Date();

    const t = (v) => (v && String(v).trim()) || null; // helper trim→null

    const { rows } = await pool.query(`
      INSERT INTO public.envios_ventas (
        -- Sistema (auto)
        estatus_envio, ip_origen, fecha_registro_sistema,
        -- Bloque 1 — Venta
        codigo_asesor, id_bitrix, distribuidor_autorizado, supervisor,
        origen_venta, venta_nueva_o_reingreso, turno,
        nombre_atc, clausulas, lider_comercial,
        -- Bloque 2 — Cliente
        tipo_cliente, genero_cliente, tipo_documento,
        numero_identificacion, nombre_cliente_completo,
        estado_civil, fecha_nacimiento,
        email_cliente, aplica_descuento_3ra_edad,
        telf_celular_pin, telf_celular_2, telf_fijo,
        -- Bloque 3 — Dirección
        provincia, ciudad, parroquia_barrio,
        direccion_calles, direccion_manzana_villa,
        referencia_ubicacion, coordenadas_gps,
        tipo_vivienda, regimen_vivienda,
        -- Bloque 4 — Plan / Pago
        plan_contratado_final, servicios_digitales,
        forma_pago, detalle_bancario_ahorros,
        valor_pago, tipo_contrato, links_documentos,
        -- Bloque 5 — Recaudación
        estado_recaudacion, fecha_recaudada,
        -- Bloque 6 — Netlife
        netlife_login, netlife_estatus_real, fecha_activacion_netlife,
        -- Bloque 7 — Auditoría
        calidad_venta_analista, novedades_atc, venta_efectiva,
        auditoria_documentos, auditado_por, inconsistencia_documental,
        observacion_auditoria, errores_telcos,
        -- Bloque 8 — Regularización
        estatus_regularizacion, detalle_regularizacion,
        fecha_regularizacion_atc, mes_regularizacion,
        observacion_venta_original, observacion_gestion_cobranza,
        -- Bloque 9 — Agenda
        turno_agendado, fecha_agenda
      ) VALUES (
        $1,$2,$3,
        $4,$5,$6,$7,$8,$9,$10,
        $11,$12,$13,
        $14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,
        $26,$27,$28,$29,$30,$31,$32,$33,$34,
        $35,$36,$37,$38,$39,$40,$41,
        $42,$43,
        $44,$45,$46,
        $47,$48,$49,$50,$51,$52,$53,$54,
        $55,$56,$57,$58,$59,$60,
        $61,$62
      )
      RETURNING id, estatus_envio, fecha_registro_sistema, codigo_asesor, id_bitrix
    `, [
      // Sistema
      t(b.estatus_envio), ip_origen, fecha_registro_sistema,
      // Bloque 1
      t(b.codigo_asesor), t(b.id_bitrix), t(b.distribuidor_autorizado), t(b.supervisor),
      t(b.origen_venta), t(b.venta_nueva_o_reingreso), t(b.turno),
      t(b.nombre_atc), t(b.clausulas), t(b.lider_comercial),
      // Bloque 2
      t(b.tipo_cliente), t(b.genero_cliente), t(b.tipo_documento),
      t(b.numero_identificacion), t(b.nombre_cliente_completo),
      t(b.estado_civil), t(b.fecha_nacimiento),
      t(b.email_cliente), t(b.aplica_descuento_3ra_edad),
      t(b.telf_celular_pin), t(b.telf_celular_2), t(b.telf_fijo),
      // Bloque 3
      t(b.provincia), t(b.ciudad), t(b.parroquia_barrio),
      t(b.direccion_calles), t(b.direccion_manzana_villa),
      t(b.referencia_ubicacion), t(b.coordenadas_gps),
      t(b.tipo_vivienda), t(b.regimen_vivienda),
      // Bloque 4
      t(b.plan_contratado_final), t(b.servicios_digitales),
      t(b.forma_pago), t(b.detalle_bancario_ahorros),
      t(b.valor_pago), t(b.tipo_contrato), t(b.links_documentos),
      // Bloque 5
      t(b.estado_recaudacion), t(b.fecha_recaudada),
      // Bloque 6
      t(b.netlife_login), t(b.netlife_estatus_real), t(b.fecha_activacion_netlife),
      // Bloque 7
      t(b.calidad_venta_analista), t(b.novedades_atc), t(b.venta_efectiva),
      t(b.auditoria_documentos), t(b.auditado_por), t(b.inconsistencia_documental),
      t(b.observacion_auditoria), t(b.errores_telcos),
      // Bloque 8
      t(b.estatus_regularizacion), t(b.detalle_regularizacion),
      t(b.fecha_regularizacion_atc), t(b.mes_regularizacion),
      t(b.observacion_venta_original), t(b.observacion_gestion_cobranza),
      // Bloque 9
      t(b.turno_agendado), t(b.fecha_agenda),
    ]);

    console.log(`[ENVIOS-VENTAS] Nueva venta registrada id=${rows[0].id} por ${req.user.usuario}`);
    res.status(201).json({ success: true, data: rows[0], mensaje: 'Venta registrada correctamente' });

  } catch (e) {
    console.error('[ENVIOS-VENTAS] insert:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
