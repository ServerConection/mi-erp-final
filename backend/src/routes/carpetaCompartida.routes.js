// src/routes/carpetaCompartida.routes.js
// ============================================================
// CARPETA COMPARTIDA — drive interno del ERP (manuales, instructivos, etc.)
//
//   Lectura y descarga: CUALQUIER usuario autenticado.
//   Crear carpetas / subir / eliminar: SOLO perfil ADMINISTRADOR.
//
// Los binarios van al servidor de almacenamiento local (carpeta física
// "carpeta_compartida"); la jerarquía que ve el usuario vive en la BD
// (cc_carpetas / cc_archivos). Formatos: PDF e imágenes (lo que acepta el
// servidor de almacenamiento), máx. 20 MB.
//
// GET    /api/carpeta-compartida/carpetas?padre_id=
// GET    /api/carpeta-compartida/carpetas/:id
// POST   /api/carpeta-compartida/carpetas                (admin)
// DELETE /api/carpeta-compartida/carpetas/:id            (admin)
// GET    /api/carpeta-compartida/archivos?carpeta_id=
// POST   /api/carpeta-compartida/archivos/upload         (admin)
// GET    /api/carpeta-compartida/archivos/:id/descargar
// DELETE /api/carpeta-compartida/archivos/:id            (admin)
// ============================================================
'use strict';

const express = require('express');
const fs      = require('fs');
const path    = require('path');
const multer  = require('multer');
const pool    = require('../config/db');
const { verificarToken, soloAdmin } = require('../middleware/auth');
const { subirArchivo, obtenerArchivo, configurado } = require('../utils/storageClient');

const router = express.Router();
const CARPETA_STORAGE = 'carpeta_compartida';

// ─── Tablas: se crean solas (idempotente) ────────────────────────────────────
let listo = null;
function asegurarTablas() {
  if (!listo) {
    const sql = fs.readFileSync(path.join(__dirname, '../migrations/carpeta_compartida.sql'), 'utf8');
    listo = pool.query(sql).catch((e) => { listo = null; throw e; });
  }
  return listo;
}
asegurarTablas().catch((e) => console.error('[CARPETA-COMPARTIDA] no se pudieron crear tablas:', e.message));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.mimetype.startsWith('image/')) cb(null, true);
    else cb(Object.assign(new Error('Formato no permitido. Sube PDF o imagen (JPG, PNG, WEBP).'), { status: 400 }));
  },
});

const idONull = (v) => {
  const n = parseInt(v, 10);
  return Number.isInteger(n) && n > 0 ? n : null;
};
const fallo = (res, e, ctx) => {
  console.error(`[CARPETA-COMPARTIDA] ${ctx}:`, e.message);
  res.status(e.status || 500).json({ success: false, error: e.publico || e.message });
};

router.use(verificarToken, async (req, res, next) => {
  try { await asegurarTablas(); next(); } catch (e) { fallo(res, e, 'tablas'); }
});

// ─── Carpetas ────────────────────────────────────────────────────────────────
router.get('/carpetas', async (req, res) => {
  try {
    const padreId = idONull(req.query.padre_id);
    const { rows } = await pool.query(
      padreId
        ? `SELECT * FROM public.cc_carpetas WHERE carpeta_padre_id = $1 ORDER BY nombre`
        : `SELECT * FROM public.cc_carpetas WHERE carpeta_padre_id IS NULL ORDER BY nombre`,
      padreId ? [padreId] : []
    );
    res.json({ success: true, data: rows });
  } catch (e) { fallo(res, e, 'carpetas GET'); }
});

router.get('/carpetas/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM public.cc_carpetas WHERE id = $1`, [idONull(req.params.id)]);
    if (!rows.length) return res.status(404).json({ success: false, error: 'Carpeta no encontrada' });
    res.json({ success: true, data: rows[0] });
  } catch (e) { fallo(res, e, 'carpeta GET'); }
});

router.post('/carpetas', soloAdmin, async (req, res) => {
  try {
    const nombre = String(req.body?.nombre || '').trim().slice(0, 150);
    if (!nombre) return res.status(400).json({ success: false, error: 'El nombre es requerido' });
    const { rows } = await pool.query(
      `INSERT INTO public.cc_carpetas (nombre, carpeta_padre_id, creado_por) VALUES ($1, $2, $3) RETURNING *`,
      [nombre, idONull(req.body?.carpeta_padre_id), req.user.usuario]
    );
    res.status(201).json({ success: true, data: rows[0] });
  } catch (e) { fallo(res, e, 'carpetas POST'); }
});

router.delete('/carpetas/:id', soloAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(`DELETE FROM public.cc_carpetas WHERE id = $1 RETURNING id`, [idONull(req.params.id)]);
    if (!rows.length) return res.status(404).json({ success: false, error: 'Carpeta no encontrada' });
    res.json({ success: true, mensaje: 'Carpeta eliminada' });
  } catch (e) { fallo(res, e, 'carpetas DELETE'); }
});

// ─── Archivos ────────────────────────────────────────────────────────────────
const COLS = `id, carpeta_id, nombre_original, tipo_mime, tamano_bytes, subido_por, fecha_subida`;

router.get('/archivos', async (req, res) => {
  try {
    const carpetaId = idONull(req.query.carpeta_id);
    const { rows } = await pool.query(
      carpetaId
        ? `SELECT ${COLS} FROM public.cc_archivos WHERE carpeta_id = $1 ORDER BY nombre_original`
        : `SELECT ${COLS} FROM public.cc_archivos WHERE carpeta_id IS NULL ORDER BY nombre_original`,
      carpetaId ? [carpetaId] : []
    );
    res.json({ success: true, data: rows });
  } catch (e) { fallo(res, e, 'archivos GET'); }
});

router.post('/archivos/upload', soloAdmin, (req, res, next) => {
  upload.single('archivo')(req, res, (err) => {
    if (!err) return next();
    const msg = err.code === 'LIMIT_FILE_SIZE' ? 'El archivo supera 20 MB.' : err.message;
    res.status(400).json({ success: false, error: msg });
  });
}, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'No se recibió ningún archivo' });
    if (!configurado()) {
      return res.status(503).json({ success: false, error: 'El servidor de almacenamiento no está configurado.' });
    }
    const nombre = Buffer.from(req.file.originalname, 'latin1').toString('utf8').slice(0, 255);
    const r = await subirArchivo({
      buffer: req.file.buffer,
      originalname: nombre,
      mimetype: req.file.mimetype,
      carpeta: CARPETA_STORAGE,
    });
    const { rows } = await pool.query(
      `INSERT INTO public.cc_archivos
         (carpeta_id, nombre_original, storage_carpeta, storage_archivo, tipo_mime, tamano_bytes, subido_por)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING ${COLS}`,
      [idONull(req.body.carpeta_id), nombre, r.carpeta || CARPETA_STORAGE, r.archivo,
       req.file.mimetype, req.file.size, req.user.usuario]
    );
    res.status(201).json({ success: true, data: rows[0] });
  } catch (e) { fallo(res, e, 'archivos upload'); }
});

router.get('/archivos/:id/descargar', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM public.cc_archivos WHERE id = $1`, [idONull(req.params.id)]);
    if (!rows.length) return res.status(404).json({ success: false, error: 'Archivo no encontrado' });
    const a = rows[0];
    const { buffer, contentType } = await obtenerArchivo(a.storage_carpeta, a.storage_archivo);
    res.set('Content-Type', a.tipo_mime || contentType);
    res.set('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(a.nombre_original)}`);
    res.set('Cache-Control', 'private, max-age=0, no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    res.send(buffer);
  } catch (e) { fallo(res, e, 'descargar'); }
});

router.delete('/archivos/:id', soloAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(`DELETE FROM public.cc_archivos WHERE id = $1 RETURNING id`, [idONull(req.params.id)]);
    if (!rows.length) return res.status(404).json({ success: false, error: 'Archivo no encontrado' });
    res.json({ success: true, mensaje: 'Archivo eliminado' });
  } catch (e) { fallo(res, e, 'archivos DELETE'); }
});

module.exports = router;
