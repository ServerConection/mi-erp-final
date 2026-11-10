// src/routes/soporte.routes.js
// ============================================================
// SOPORTE DESARROLLO — mesa de ayuda del área de desarrollo.
//
// Cualquier usuario autenticado reporta una incidencia (herramienta caída),
// pide creación o eliminación de usuario, y puede pegar capturas de pantalla.
// El área de desarrollo (SOPORTE_DESARROLLO_USUARIOS, por defecto
// kchala,bpineda) ve el tablero kanban, mueve los tickets
// SIN_ATENDER → EN_PROCESO → ATENDIDO y responde; el usuario recibe el aviso
// en la burbuja de soporte.
//
// GET   /api/soporte/me
// GET   /api/soporte/tickets?alcance=mios|todos
// POST  /api/soporte/tickets                 (multipart, campo "capturas" ≤5 imágenes)
// PATCH /api/soporte/tickets/:id/estado      (desarrollo)
// POST  /api/soporte/tickets/:id/visto       (dueño: marca leído el aviso)
// GET   /api/soporte/avisos                  (dueño: atendidos sin leer · desarrollo: sin atender)
// GET   /api/soporte/adjuntos/:id            (dueño o desarrollo)
// GET   /api/soporte/metricas?desde=&hasta=  (desarrollo)
// ============================================================
'use strict';

const express = require('express');
const fs      = require('fs');
const path    = require('path');
const multer  = require('multer');
const pool    = require('../config/db');
const { verificarToken } = require('../middleware/auth');
const { subirArchivo, obtenerArchivo, configurado } = require('../utils/storageClient');

const router = express.Router();
const CARPETA_STORAGE = 'soporte_desarrollo';

const DESARROLLO = new Set(
  String(process.env.SOPORTE_DESARROLLO_USUARIOS || 'kchala,bpineda')
    .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
);
const esDesarrollo = (u) => DESARROLLO.has(String(u?.usuario || '').toLowerCase());

const TIPOS   = ['INCIDENCIA', 'CREACION_USUARIO', 'ELIMINACION_USUARIO'];
const ESTADOS = ['SIN_ATENDER', 'EN_PROCESO', 'ATENDIDO'];

// ─── Tablas (idempotente) ────────────────────────────────────────────────────
let listo = null;
function asegurarTablas() {
  if (!listo) {
    const sql = fs.readFileSync(path.join(__dirname, '../migrations/soporte_desarrollo.sql'), 'utf8');
    listo = pool.query(sql).catch((e) => { listo = null; throw e; });
  }
  return listo;
}
asegurarTablas().catch((e) => console.error('[SOPORTE] no se pudieron crear tablas:', e.message));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 5 },
  fileFilter: (req, file, cb) => {
    if (/^image\/(png|jpe?g|webp|gif)$/i.test(file.mimetype)) cb(null, true);
    else cb(Object.assign(new Error('Las capturas deben ser imágenes PNG, JPG o WEBP.'), { status: 400 }));
  },
});

const fallo = (res, e, ctx) => {
  console.error(`[SOPORTE] ${ctx}:`, e.message);
  res.status(e.status || 500).json({ success: false, error: e.publico || e.message });
};
const texto = (v, max) => String(v ?? '').trim().slice(0, max);
const idValido = (v) => { const n = parseInt(v, 10); return Number.isInteger(n) && n > 0 ? n : null; };

router.use(verificarToken, async (req, res, next) => {
  try { await asegurarTablas(); next(); } catch (e) { fallo(res, e, 'tablas'); }
});

router.get('/me', (req, res) => {
  res.json({ success: true, data: { usuario: req.user.usuario, esDesarrollo: esDesarrollo(req.user) } });
});

// ─── Listado ─────────────────────────────────────────────────────────────────
const SELECT_TICKET = `
  SELECT t.*,
         COALESCE(
           (SELECT json_agg(json_build_object('id', a.id, 'nombre', a.nombre, 'tipo_mime', a.tipo_mime) ORDER BY a.id)
              FROM public.sop_adjuntos a WHERE a.ticket_id = t.id), '[]'::json) AS adjuntos
    FROM public.sop_tickets t`;

router.get('/tickets', async (req, res) => {
  try {
    const todos = req.query.alcance === 'todos';
    if (todos && !esDesarrollo(req.user)) {
      return res.status(403).json({ success: false, error: 'Solo el área de desarrollo ve todos los tickets.' });
    }
    const { rows } = todos
      // Tablero: los más antiguos primero, y los atendidos de los últimos 30 días.
      ? await pool.query(`${SELECT_TICKET}
          WHERE t.estado <> 'ATENDIDO' OR t.atendido_en >= NOW() - INTERVAL '30 days'
          ORDER BY t.creado_en ASC`)
      : await pool.query(`${SELECT_TICKET} WHERE t.creado_por = $1 ORDER BY t.creado_en DESC LIMIT 200`, [req.user.usuario]);
    res.json({ success: true, data: rows });
  } catch (e) { fallo(res, e, 'tickets GET'); }
});

// ─── Crear ───────────────────────────────────────────────────────────────────
router.post('/tickets', (req, res, next) => {
  upload.array('capturas', 5)(req, res, (err) => {
    if (!err) return next();
    const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Cada captura debe pesar máximo 5 MB.'
      : err.code === 'LIMIT_FILE_COUNT' ? 'Máximo 5 capturas por reporte.' : err.message;
    res.status(400).json({ success: false, error: msg });
  });
}, async (req, res) => {
  try {
    const tipo = texto(req.body.tipo, 30).toUpperCase();
    if (!TIPOS.includes(tipo)) return res.status(400).json({ success: false, error: 'Tipo de solicitud no válido.' });

    const descripcion = texto(req.body.descripcion, 5000);
    if (descripcion.length < 5) return res.status(400).json({ success: false, error: 'Describe el problema o la solicitud.' });

    const modulo = tipo === 'INCIDENCIA' ? texto(req.body.modulo, 80) : null;
    if (tipo === 'INCIDENCIA' && !modulo) return res.status(400).json({ success: false, error: 'Selecciona el módulo o herramienta.' });

    let datos = {};
    try { datos = JSON.parse(req.body.datos || '{}'); } catch { datos = {}; }
    const limpio = {};
    for (const [k, v] of Object.entries(datos || {}).slice(0, 15)) {
      if (/^[a-z_]{1,30}$/.test(k)) limpio[k] = texto(v, 200);
    }

    const titulo = tipo === 'INCIDENCIA'
      ? `Falla en ${modulo}`
      : tipo === 'CREACION_USUARIO'
        ? `Crear usuario: ${limpio.nombres || 'sin nombre'}`
        : `Eliminar usuario: ${limpio.usuario || limpio.nombres || 'sin dato'}`;

    const { rows } = await pool.query(
      `INSERT INTO public.sop_tickets
         (tipo, modulo, titulo, descripcion, datos, creado_por, creado_por_nombre, empresa, perfil)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [tipo, modulo, texto(titulo, 150), descripcion, limpio, req.user.usuario,
       req.user.nombreCompleto || req.user.usuario, req.user.empresa || null, req.user.perfil || null]
    );
    const ticket = rows[0];

    // Capturas: si el almacenamiento falla, el ticket igual queda registrado.
    let aviso = null;
    const files = req.files || [];
    if (files.length) {
      if (!configurado()) {
        aviso = 'El reporte se guardó, pero las capturas no (almacenamiento no configurado).';
      } else {
        let fallidas = 0;
        for (const f of files) {
          try {
            const r = await subirArchivo({ buffer: f.buffer, originalname: f.originalname, mimetype: f.mimetype, carpeta: CARPETA_STORAGE });
            await pool.query(
              `INSERT INTO public.sop_adjuntos (ticket_id, nombre, storage_carpeta, storage_archivo, tipo_mime, tamano_bytes)
               VALUES ($1,$2,$3,$4,$5,$6)`,
              [ticket.id, texto(f.originalname, 255), r.carpeta || CARPETA_STORAGE, r.archivo, f.mimetype, f.size]
            );
          } catch (e) {
            fallidas++;
            console.error(`[SOPORTE] captura ticket ${ticket.id}:`, e.message);
          }
        }
        if (fallidas) aviso = `El reporte se guardó, pero ${fallidas} captura(s) no se pudieron subir.`;
      }
    }

    console.log(`[SOPORTE] ticket #${ticket.id} ${tipo} por ${req.user.usuario}`);
    res.status(201).json({ success: true, data: ticket, aviso });
  } catch (e) { fallo(res, e, 'tickets POST'); }
});

// ─── Cambiar estado (desarrollo) ─────────────────────────────────────────────
router.patch('/tickets/:id/estado', async (req, res) => {
  try {
    if (!esDesarrollo(req.user)) return res.status(403).json({ success: false, error: 'Solo el área de desarrollo atiende tickets.' });
    const id = idValido(req.params.id);
    const estado = texto(req.body?.estado, 20).toUpperCase();
    if (!id || !ESTADOS.includes(estado)) return res.status(400).json({ success: false, error: 'Estado no válido.' });
    const respuesta = req.body?.respuesta !== undefined ? texto(req.body.respuesta, 3000) : null;
    if (estado === 'ATENDIDO' && !respuesta) {
      return res.status(400).json({ success: false, error: 'Escribe una respuesta para el usuario antes de marcar como atendido.' });
    }

    const { rows } = await pool.query(
      `UPDATE public.sop_tickets SET
          estado = $2::text,
          tomado_por    = CASE WHEN $2::text IN ('EN_PROCESO','ATENDIDO') THEN COALESCE(tomado_por, $3::text) ELSE NULL END,
          en_proceso_en = CASE WHEN $2::text IN ('EN_PROCESO','ATENDIDO') THEN COALESCE(en_proceso_en, NOW()) ELSE NULL END,
          atendido_por  = CASE WHEN $2::text = 'ATENDIDO' THEN $3::text ELSE NULL END,
          atendido_en   = CASE WHEN $2::text = 'ATENDIDO' THEN COALESCE(atendido_en, NOW()) ELSE NULL END,
          respuesta     = CASE WHEN $2::text = 'ATENDIDO' THEN $4::text ELSE respuesta END,
          visto_por_usuario = CASE WHEN $2::text = 'ATENDIDO' THEN FALSE ELSE TRUE END,
          actualizado_en = NOW()
        WHERE id = $1
        RETURNING *`,
      [id, estado, req.user.usuario, respuesta]
    );
    if (!rows.length) return res.status(404).json({ success: false, error: 'Ticket no encontrado.' });
    res.json({ success: true, data: rows[0] });
  } catch (e) { fallo(res, e, 'estado PATCH'); }
});

router.post('/tickets/:id/visto', async (req, res) => {
  try {
    await pool.query(
      `UPDATE public.sop_tickets SET visto_por_usuario = TRUE WHERE id = $1 AND creado_por = $2`,
      [idValido(req.params.id), req.user.usuario]
    );
    res.json({ success: true });
  } catch (e) { fallo(res, e, 'visto'); }
});

// ─── Avisos para la burbuja ──────────────────────────────────────────────────
router.get('/avisos', async (req, res) => {
  try {
    const { rows: atendidos } = await pool.query(
      `SELECT id, titulo, respuesta, atendido_por, atendido_en FROM public.sop_tickets
        WHERE creado_por = $1 AND estado = 'ATENDIDO' AND visto_por_usuario = FALSE
        ORDER BY atendido_en DESC LIMIT 20`,
      [req.user.usuario]
    );
    let sinAtender = 0;
    if (esDesarrollo(req.user)) {
      const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM public.sop_tickets WHERE estado = 'SIN_ATENDER'`);
      sinAtender = rows[0].n;
    }
    res.json({ success: true, data: { atendidos, sinAtender, esDesarrollo: esDesarrollo(req.user) } });
  } catch (e) { fallo(res, e, 'avisos'); }
});

// ─── Capturas ────────────────────────────────────────────────────────────────
router.get('/adjuntos/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT a.*, t.creado_por FROM public.sop_adjuntos a JOIN public.sop_tickets t ON t.id = a.ticket_id WHERE a.id = $1`,
      [idValido(req.params.id)]
    );
    if (!rows.length) return res.status(404).json({ success: false, error: 'Captura no encontrada.' });
    const a = rows[0];
    if (a.creado_por !== req.user.usuario && !esDesarrollo(req.user)) {
      return res.status(403).json({ success: false, error: 'No tienes acceso a esta captura.' });
    }
    const { buffer, contentType } = await obtenerArchivo(a.storage_carpeta, a.storage_archivo);
    res.set('Content-Type', a.tipo_mime || contentType);
    res.set('Cache-Control', 'private, max-age=0, no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    res.send(buffer);
  } catch (e) { fallo(res, e, 'adjunto'); }
});

// ─── Métricas (desarrollo) ───────────────────────────────────────────────────
router.get('/metricas', async (req, res) => {
  try {
    if (!esDesarrollo(req.user)) return res.status(403).json({ success: false, error: 'Solo el área de desarrollo.' });
    const desde = /^\d{4}-\d{2}-\d{2}$/.test(req.query.desde || '') ? req.query.desde : null;
    const hasta = /^\d{4}-\d{2}-\d{2}$/.test(req.query.hasta || '') ? req.query.hasta : null;
    const filtro = `WHERE ($1::date IS NULL OR creado_en >= $1::date)
                      AND ($2::date IS NULL OR creado_en <  $2::date + 1)`;
    const p = [desde, hasta];

    const [resumen, porModulo, porTipo] = await Promise.all([
      pool.query(`
        SELECT COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE estado = 'SIN_ATENDER')::int AS sin_atender,
               COUNT(*) FILTER (WHERE estado = 'EN_PROCESO')::int  AS en_proceso,
               COUNT(*) FILTER (WHERE estado = 'ATENDIDO')::int    AS atendido,
               ROUND(AVG(EXTRACT(EPOCH FROM (en_proceso_en - creado_en)) / 60) FILTER (WHERE en_proceso_en IS NOT NULL))::int AS min_primera_respuesta,
               ROUND(AVG(EXTRACT(EPOCH FROM (atendido_en  - creado_en)) / 60) FILTER (WHERE atendido_en  IS NOT NULL))::int AS min_resolucion
          FROM public.sop_tickets ${filtro}`, p),
      pool.query(`
        SELECT modulo, COUNT(*)::int AS total,
               ROUND(AVG(EXTRACT(EPOCH FROM (atendido_en - creado_en)) / 60) FILTER (WHERE atendido_en IS NOT NULL))::int AS min_resolucion
          FROM public.sop_tickets ${filtro} AND tipo = 'INCIDENCIA'
         GROUP BY modulo ORDER BY total DESC LIMIT 10`, p),
      pool.query(`SELECT tipo, COUNT(*)::int AS total FROM public.sop_tickets ${filtro} GROUP BY tipo ORDER BY total DESC`, p),
    ]);
    res.json({ success: true, data: { resumen: resumen.rows[0], porModulo: porModulo.rows, porTipo: porTipo.rows } });
  } catch (e) { fallo(res, e, 'metricas'); }
});

module.exports = router;
