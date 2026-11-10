// src/routes/carpetaCompartida.routes.js
// ============================================================
// CARPETA COMPARTIDA — drive interno del ERP (manuales, instructivos, etc.)
//
//   Lectura y descarga: CUALQUIER usuario autenticado.
//   Crear carpetas / subir / eliminar: SOLO perfil ADMINISTRADOR.
//
// Los binarios van al servidor de almacenamiento local (carpeta física
// "carpeta_compartida"); la jerarquía que ve el usuario vive en la BD
// (cc_carpetas / cc_archivos). Formatos: cualquiera, máx. 20 MB. Solo PDF e
// imágenes seguras se muestran en línea; el resto se descarga.

//
// GET    /api/carpeta-compartida/carpetas?padre_id=
// GET    /api/carpeta-compartida/carpetas/:id
// POST   /api/carpeta-compartida/carpetas                (admin)
// DELETE /api/carpeta-compartida/carpetas/:id            (admin)
// GET    /api/carpeta-compartida/archivos?carpeta_id=
// POST   /api/carpeta-compartida/archivos/upload         (admin)
// GET    /api/carpeta-compartida/archivos/:id/descargar
// DELETE /api/carpeta-compartida/archivos/:id            (admin)
// GET    /api/carpeta-compartida/zip?carpeta_id=         (todos: descarga la carpeta en .zip)
//
// Subir carpeta: el frontend manda cada archivo con `ruta` (subcarpetas
// relativas, ej. "Manuales/Ventas"); aquí se crean las que falten.
// ============================================================
'use strict';

const express = require('express');
const fs      = require('fs');
const path    = require('path');
const multer  = require('multer');
const AdmZip  = require('adm-zip');
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
});

// Tipos que el navegador puede mostrar sin riesgo. Cualquier otro (HTML, SVG,
// Office, ZIP…) se entrega como descarga binaria para que no se ejecute.
const MIME_EN_LINEA = /^(application\/pdf|image\/(png|jpeg|gif|webp))$/i;

const idONull = (v) => {
  const n = parseInt(v, 10);
  return Number.isInteger(n) && n > 0 ? n : null;
};
// Subcarpetas a partir de una ruta relativa ("A/B/C"): busca o crea cada nivel.
const MAX_PROFUNDIDAD = 10;
function segmentosRuta(ruta) {
  return String(ruta || '')
    .split(/[\\/]+/)
    .map((s) => s.trim().replace(/[\u0000-\u001f]/g, '').slice(0, 150))
    .filter((s) => s && s !== '.' && s !== '..')
    .slice(0, MAX_PROFUNDIDAD);
}
async function asegurarRuta(padreId, ruta, usuario) {
  let actual = padreId;
  for (const nombre of segmentosRuta(ruta)) {
    const { rows } = await pool.query(
      `SELECT id FROM public.cc_carpetas
        WHERE carpeta_padre_id IS NOT DISTINCT FROM $1 AND LOWER(nombre) = LOWER($2)
        ORDER BY id LIMIT 1`,
      [actual, nombre]
    );
    if (rows.length) { actual = rows[0].id; continue; }
    const ins = await pool.query(
      `INSERT INTO public.cc_carpetas (nombre, carpeta_padre_id, creado_por) VALUES ($1, $2, $3) RETURNING id`,
      [nombre, actual, usuario]
    );
    actual = ins.rows[0].id;
  }
  return actual;
}

// Límites del .zip (se arma en memoria del servidor).
const ZIP_MAX_ARCHIVOS = 500;
const ZIP_MAX_BYTES    = 300 * 1024 * 1024;
const nombreZipSeguro  = (s) => String(s || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim() || 'archivo';

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
    // Subida de carpeta: `ruta` trae las subcarpetas relativas del archivo.
    const carpetaDestino = req.body.ruta
      ? await asegurarRuta(idONull(req.body.carpeta_id), req.body.ruta, req.user.usuario)
      : idONull(req.body.carpeta_id);
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
      [carpetaDestino, nombre, r.carpeta || CARPETA_STORAGE, r.archivo,
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
    const enLinea = MIME_EN_LINEA.test(a.tipo_mime || '');
    res.set('Content-Type', enLinea ? a.tipo_mime : 'application/octet-stream');
    res.set('Content-Disposition', `${enLinea ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(a.nombre_original)}`);
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

// ─── Descargar carpeta completa en .zip ──────────────────────────────────────
// Sin carpeta_id = toda la Carpeta Compartida. Respeta la jerarquía.
router.get('/zip', async (req, res) => {
  try {
    const raizId = idONull(req.query.carpeta_id);
    let nombreRaiz = 'Carpeta Compartida';
    if (raizId) {
      const { rows } = await pool.query(`SELECT nombre FROM public.cc_carpetas WHERE id = $1`, [raizId]);
      if (!rows.length) return res.status(404).json({ success: false, error: 'Carpeta no encontrada' });
      nombreRaiz = rows[0].nombre;
    }

    // Árbol de carpetas bajo la raíz, con su ruta relativa.
    const { rows: carpetas } = await pool.query(
      `WITH RECURSIVE arbol AS (
         SELECT id, nombre::text AS ruta, 1 AS nivel FROM public.cc_carpetas
          WHERE carpeta_padre_id IS NOT DISTINCT FROM $1
         UNION ALL
         SELECT c.id, a.ruta || '/' || c.nombre, a.nivel + 1
           FROM public.cc_carpetas c JOIN arbol a ON c.carpeta_padre_id = a.id
          WHERE a.nivel < 30
       ) SELECT id, ruta FROM arbol`,
      [raizId]
    );
    const rutaPorId = new Map(carpetas.map((c) => [c.id, c.ruta]));
    const ids = carpetas.map((c) => c.id);

    const { rows: archivos } = await pool.query(
      `SELECT id, carpeta_id, nombre_original, storage_carpeta, storage_archivo, tamano_bytes
         FROM public.cc_archivos
        WHERE carpeta_id IS NOT DISTINCT FROM $1 OR carpeta_id = ANY($2::int[])
        ORDER BY carpeta_id NULLS FIRST, nombre_original`,
      [raizId, ids]
    );
    if (!archivos.length && !carpetas.length) {
      return res.status(400).json({ success: false, error: 'La carpeta está vacía.' });
    }
    if (archivos.length > ZIP_MAX_ARCHIVOS) {
      return res.status(413).json({ success: false, error: `La carpeta tiene ${archivos.length} archivos; el máximo para descargar en .zip es ${ZIP_MAX_ARCHIVOS}. Descarga una subcarpeta.` });
    }
    const total = archivos.reduce((s, a) => s + Number(a.tamano_bytes || 0), 0);
    if (total > ZIP_MAX_BYTES) {
      return res.status(413).json({ success: false, error: 'La carpeta pesa más de 300 MB. Descarga una subcarpeta.' });
    }

    const zip = new AdmZip();
    // Carpetas vacías también aparecen en el .zip.
    for (const c of carpetas) zip.addFile(c.ruta.split('/').map(nombreZipSeguro).join('/') + '/', Buffer.alloc(0));

    const usados = new Set();
    let fallidos = 0;
    for (const a of archivos) {
      const dir = a.carpeta_id && rutaPorId.has(a.carpeta_id)
        ? rutaPorId.get(a.carpeta_id).split('/').map(nombreZipSeguro).join('/') + '/'
        : '';
      // Nombres repetidos dentro de la misma carpeta: "x (2).pdf".
      let nombre = nombreZipSeguro(a.nombre_original);
      let destino = dir + nombre;
      for (let n = 2; usados.has(destino.toLowerCase()); n++) {
        const punto = nombre.lastIndexOf('.');
        destino = dir + (punto > 0 ? `${nombre.slice(0, punto)} (${n})${nombre.slice(punto)}` : `${nombre} (${n})`);
      }
      usados.add(destino.toLowerCase());
      try {
        const { buffer } = await obtenerArchivo(a.storage_carpeta, a.storage_archivo);
        zip.addFile(destino, buffer);
      } catch (e) {
        fallidos++;
        console.error(`[CARPETA-COMPARTIDA] zip: archivo ${a.id} no disponible:`, e.message);
      }
    }
    if (fallidos === archivos.length && archivos.length) {
      return res.status(503).json({ success: false, error: 'No se pudo leer ningún archivo del servidor de almacenamiento.' });
    }

    const nombreZip = `${nombreZipSeguro(nombreRaiz)}.zip`;
    res.set('Content-Type', 'application/zip');
    res.set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(nombreZip)}`);
    res.set('Cache-Control', 'private, max-age=0, no-store');
    if (fallidos) res.set('X-Archivos-Omitidos', String(fallidos));
    res.send(zip.toBuffer());
  } catch (e) { fallo(res, e, 'zip'); }
});

module.exports = router;
