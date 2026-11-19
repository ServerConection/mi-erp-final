// src/routes/botVendedor.routes.js
// ============================================================
// BOT VENDEDOR IA — configuracion desde el ERP (solo ADMINISTRADOR).
//
// GET  /api/bot-vendedor/config                 prompt y reglas
// PUT  /api/bot-vendedor/config                 { prompt, reglas }
// GET  /api/bot-vendedor/conocimiento           lista (sin el texto completo)
// GET  /api/bot-vendedor/conocimiento/:id       documento completo
// POST /api/bot-vendedor/conocimiento/archivo   multipart: archivo (PDF/TXT/MD/CSV), siempre_incluir
// POST /api/bot-vendedor/conocimiento/texto     { nombre, contenido, siempre_incluir }
// PUT  /api/bot-vendedor/conocimiento/:id       { nombre?, contenido?, siempre_incluir?, activo? }
// GET  /api/bot-vendedor/lineas                 lineas de WABOT y si el bot esta activo en cada una
// PUT  /api/bot-vendedor/lineas/:id             { activo }  (WABOT lo toma en menos de 30 s)
// POST /api/bot-vendedor/probar                 { historial: [{role, content}] }
//
// No hay DELETE: los documentos se archivan (activo = false) y se pueden reactivar.
// ============================================================
'use strict';

const express = require('express');
const multer = require('multer');
const pool = require('../config/db');
const { verificarToken, soloAdmin } = require('../middleware/auth');
const bot = require('../services/botVendedor.service');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024, files: 1 } });

bot.asegurarTablas().catch((e) => console.error('[BOT-VENDEDOR] no se pudieron crear tablas:', e.message));

router.use(verificarToken, soloAdmin);

const ok = (res, data) => res.json({ success: true, data });
const fallo = (res, e, status = 500) => {
  console.error('[BOT-VENDEDOR]', e.message || e);
  res.status(status).json({ success: false, error: typeof e === 'string' ? e : (e.message || 'Error interno') });
};
const aBool = (v) => v === true || v === 'true' || v === '1' || v === 1;

// ─── Prompt y reglas ─────────────────────────────────────────────────────────
router.get('/config', async (_req, res) => {
  try {
    await bot.asegurarTablas();
    const { rows } = await pool.query(
      "SELECT clave, valor, actualizado_por, actualizado_en FROM public.bv_config WHERE clave IN ('prompt','reglas')");
    const porClave = Object.fromEntries(rows.map((r) => [r.clave, r]));
    ok(res, {
      prompt: porClave.prompt?.valor || '',
      reglas: porClave.reglas?.valor || '',
      actualizado_por: porClave.prompt?.actualizado_por || null,
      actualizado_en: porClave.prompt?.actualizado_en || null,
      modelo: bot.MODELO,
    });
  } catch (e) { fallo(res, e); }
});

router.put('/config', async (req, res) => {
  try {
    const prompt = String(req.body?.prompt ?? '');
    const reglas = String(req.body?.reglas ?? '');
    if (prompt.trim().length < 50) return fallo(res, 'El prompt es demasiado corto', 400);
    if (prompt.length > 30000 || reglas.length > 15000) return fallo(res, 'Texto demasiado largo', 400);
    await bot.asegurarTablas();
    for (const [clave, valor] of [['prompt', prompt], ['reglas', reglas]]) {
      await pool.query(
        `INSERT INTO public.bv_config (clave, valor, actualizado_por, actualizado_en) VALUES ($1, $2, $3, NOW())
         ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, actualizado_por = EXCLUDED.actualizado_por, actualizado_en = NOW()`,
        [clave, valor, req.user.usuario]);
    }
    bot.invalidarCache();
    ok(res, { guardado: true });
  } catch (e) { fallo(res, e); }
});

// ─── Conocimiento ────────────────────────────────────────────────────────────
router.get('/conocimiento', async (_req, res) => {
  try {
    await bot.asegurarTablas();
    const { rows } = await pool.query(
      `SELECT id, nombre, origen, siempre_incluir, activo, creado_por, creado_en, actualizado_en,
              LENGTH(contenido) AS caracteres, LEFT(contenido, 300) AS vista_previa
         FROM public.bv_conocimiento ORDER BY activo DESC, siempre_incluir DESC, id DESC`);
    ok(res, rows);
  } catch (e) { fallo(res, e); }
});

router.get('/conocimiento/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM public.bv_conocimiento WHERE id = $1', [parseInt(req.params.id, 10) || 0]);
    if (!rows.length) return fallo(res, 'No existe', 404);
    ok(res, rows[0]);
  } catch (e) { fallo(res, e); }
});

router.post('/conocimiento/archivo', upload.single('archivo'), async (req, res) => {
  try {
    const f = req.file;
    if (!f) return fallo(res, 'Falta el archivo', 400);
    if (!/\.(pdf|txt|md|csv)$/i.test(f.originalname)) return fallo(res, 'Solo PDF, TXT, MD o CSV', 400);
    const contenido = await bot.extraerTexto(f.buffer, f.originalname);
    if (contenido.length < 20) return fallo(res, 'No se pudo leer texto del archivo (¿es un PDF escaneado?)', 400);
    await bot.asegurarTablas();
    const { rows } = await pool.query(
      `INSERT INTO public.bv_conocimiento (nombre, origen, contenido, siempre_incluir, creado_por)
       VALUES ($1, 'archivo', $2, $3, $4) RETURNING id, nombre, LENGTH(contenido) AS caracteres`,
      [f.originalname.slice(0, 255), contenido, aBool(req.body?.siempre_incluir), req.user.usuario]);
    bot.invalidarCache();
    ok(res, rows[0]);
  } catch (e) { fallo(res, e); }
});

router.post('/conocimiento/texto', async (req, res) => {
  try {
    const nombre = String(req.body?.nombre || '').trim().slice(0, 255);
    const contenido = String(req.body?.contenido || '').trim();
    if (!nombre || contenido.length < 5) return fallo(res, 'Falta nombre o contenido', 400);
    await bot.asegurarTablas();
    const { rows } = await pool.query(
      `INSERT INTO public.bv_conocimiento (nombre, origen, contenido, siempre_incluir, creado_por)
       VALUES ($1, 'texto', $2, $3, $4) RETURNING id`,
      [nombre, contenido, aBool(req.body?.siempre_incluir), req.user.usuario]);
    bot.invalidarCache();
    ok(res, rows[0]);
  } catch (e) { fallo(res, e); }
});

router.put('/conocimiento/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10) || 0;
    const b = req.body || {};
    const sets = [];
    const vals = [];
    if (b.nombre !== undefined) { vals.push(String(b.nombre).trim().slice(0, 255)); sets.push(`nombre = $${vals.length}`); }
    if (b.contenido !== undefined) { vals.push(String(b.contenido)); sets.push(`contenido = $${vals.length}`); }
    if (b.siempre_incluir !== undefined) { vals.push(aBool(b.siempre_incluir)); sets.push(`siempre_incluir = $${vals.length}`); }
    if (b.activo !== undefined) { vals.push(aBool(b.activo)); sets.push(`activo = $${vals.length}`); }
    if (!sets.length) return fallo(res, 'Nada que actualizar', 400);
    vals.push(id);
    const { rowCount } = await pool.query(
      `UPDATE public.bv_conocimiento SET ${sets.join(', ')}, actualizado_en = NOW() WHERE id = $${vals.length}`, vals);
    if (!rowCount) return fallo(res, 'No existe', 404);
    bot.invalidarCache();
    ok(res, { actualizado: true });
  } catch (e) { fallo(res, e); }
});

// ─── Lineas de WABOT donde responde el bot ───────────────────────────────────
router.get('/lineas', async (_req, res) => {
  try {
    await bot.asegurarTablas();
    const { rows } = await pool.query(
      `SELECT l.id, l.name, l.phone_number, l.status,
              COALESCE(b.activo, FALSE) AS bot_activo, b.actualizado_por, b.actualizado_en
         FROM lines l
         LEFT JOIN public.bv_lineas b ON b.line_id = l.id
        ORDER BY COALESCE(b.activo, FALSE) DESC, l.name`);
    ok(res, rows);
  } catch (e) { fallo(res, e); }
});

router.put('/lineas/:id', async (req, res) => {
  try {
    const id = String(req.params.id || '');
    if (!/^[0-9a-f-]{36}$/i.test(id)) return fallo(res, 'Linea invalida', 400);
    const existe = await pool.query('SELECT 1 FROM lines WHERE id = $1', [id]);
    if (!existe.rows.length) return fallo(res, 'La linea no existe', 404);
    await bot.asegurarTablas();
    await pool.query(
      `INSERT INTO public.bv_lineas (line_id, activo, actualizado_por, actualizado_en) VALUES ($1, $2, $3, NOW())
       ON CONFLICT (line_id) DO UPDATE SET activo = EXCLUDED.activo, actualizado_por = EXCLUDED.actualizado_por, actualizado_en = NOW()`,
      [id, aBool(req.body?.activo), req.user.usuario]);
    ok(res, { actualizado: true });
  } catch (e) { fallo(res, e); }
});

// ─── Chat de prueba (usa la misma logica que el bot de WhatsApp) ─────────────
router.post('/probar', async (req, res) => {
  try {
    const historial = Array.isArray(req.body?.historial) ? req.body.historial : [];
    if (!historial.length || historial[historial.length - 1].role !== 'user') return fallo(res, 'Falta el mensaje del cliente', 400);
    ok(res, await bot.responder(historial));
  } catch (e) { fallo(res, e); }
});

module.exports = router;
