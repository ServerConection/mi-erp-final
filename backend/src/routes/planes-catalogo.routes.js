// src/routes/planes-catalogo.routes.js
// ============================================================
// Catálogo mensual de planes y precios (Excel "PRECIOS <MES> MATERIAL ASESORES")
//
//   POST /api/planes-catalogo/upload  — (noAsesor) sube el .xlsx del mes,
//                                       lo parsea y REEMPLAZA el catálogo.
//   GET  /api/planes-catalogo         — (autenticado) catálogo vigente,
//                                       agrupado para el formulario NuevaVenta.
//
// El parser busca los encabezados por nombre dentro de las primeras filas, no
// por letras/filas fijas. Así tolera que la plantilla mensual mueva columnas o
// coloque los encabezados en otra fila. Las cinco pestañas son obligatorias y
// la carga se rechaza antes del DELETE si alguna queda sin opciones.
//
// Cada fila del Excel se expande en 1..N registros (plan_base + empaquetado):
// los textos "X o Y" se separan en opciones únicas para que el asesor elija
// exactamente lo que lleva el cliente.
// ============================================================

const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const XLSX    = require('xlsx');
const pool    = require('../config/db');
const { verificarToken, noAsesor } = require('../middleware/auth');
const { parseWorkbook } = require('../services/planesCatalogoParser.service');

router.use(verificarToken);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /\.(xlsx|xlsm)$/i.test(file.originalname || '');
    ok ? cb(null, true) : cb(new Error('Solo se permiten archivos Excel (.xlsx)'));
  },
});

// ─── Tabla (se auto-crea si no existe) ───────────────────────────────────────
const DDL = `
  CREATE TABLE IF NOT EXISTS public.catalogo_planes (
    id              SERIAL PRIMARY KEY,
    tipo_plan       TEXT NOT NULL,
    plan_base       TEXT NOT NULL,
    empaquetado     TEXT NOT NULL,
    velocidad       TEXT,
    plan_promocion  TEXT,
    equipo          TEXT,
    precio_sin_iva  NUMERIC(10,2),
    precio_con_iva  NUMERIC(10,2),
    tc_dsto         NUMERIC(6,4),
    tc_facturas     INT,
    tc_pvp          NUMERIC(10,2),
    cta_dsto        NUMERIC(6,4),
    cta_facturas    INT,
    cta_pvp         NUMERIC(10,2),
    vigencia        TEXT,
    actualizado_en  TIMESTAMPTZ DEFAULT now()
  )`;

// ─── POST /api/planes-catalogo/upload ────────────────────────────────────────
router.post('/upload', noAsesor, upload.single('archivo'), async (req, res) => {
  const client = await pool.connect();
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'No se recibió ningún archivo' });

    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const { registros, resumen } = parseWorkbook(wb);

    if (registros.length === 0) {
      return res.status(422).json({ success: false, error: 'No se encontraron planes en el archivo. Verifica que sea el Excel de precios con las pestañas HOME, TERCERA EDAD, GAMER, PRO y PYME.', resumen });
    }

    const vigencia = (req.body.vigencia || req.file.originalname || '').trim();

    await client.query('BEGIN');
    await client.query(DDL);
    await client.query('DELETE FROM public.catalogo_planes'); // reemplazo mensual completo

    const cols = ['tipo_plan','plan_base','empaquetado','velocidad','plan_promocion','equipo',
                  'precio_sin_iva','precio_con_iva','tc_dsto','tc_facturas','tc_pvp',
                  'cta_dsto','cta_facturas','cta_pvp','vigencia'];
    for (const r of registros) {
      await client.query(
        `INSERT INTO public.catalogo_planes (${cols.join(',')})
         VALUES (${cols.map((_, i) => `$${i + 1}`).join(',')})`,
        [r.tipo_plan, r.plan_base, r.empaquetado, r.velocidad || null, r.plan_promocion || null, r.equipo || null,
         r.precio_sin_iva, r.precio_con_iva, r.tc_dsto ?? null, r.tc_facturas ?? null, r.tc_pvp ?? null,
         r.cta_dsto ?? null, r.cta_facturas ?? null, r.cta_pvp ?? null, vigencia]
      );
    }
    await client.query('COMMIT');

    console.log(`[CATALOGO-PLANES] Cargado "${vigencia}" — ${registros.length} opciones por ${req.user.usuario}`);
    res.json({ success: true, total: registros.length, resumen, vigencia });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[CATALOGO-PLANES] upload:', e.message);
    res.status(e.statusCode || 500).json({ success: false, error: e.message });
  } finally {
    client.release();
  }
});

// ─── GET /api/planes-catalogo ────────────────────────────────────────────────
// Catálogo completo para el formulario (cualquier usuario logueado)
router.get('/', async (req, res) => {
  try {
    await pool.query(DDL);
    const { rows } = await pool.query(`
      SELECT tipo_plan, plan_base, empaquetado, velocidad, plan_promocion, equipo,
             precio_sin_iva, precio_con_iva,
             tc_dsto, tc_facturas, tc_pvp,
             cta_dsto, cta_facturas, cta_pvp,
             vigencia, actualizado_en
      FROM public.catalogo_planes
      ORDER BY tipo_plan,
               NULLIF(regexp_replace(plan_base, '\\D', '', 'g'), '')::int NULLS LAST,
               plan_base, id
    `);
    res.json({ success: true, data: rows, vigencia: rows[0]?.vigencia || null });
  } catch (e) {
    console.error('[CATALOGO-PLANES] get:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
