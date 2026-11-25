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
// GET  /api/bot-vendedor/planes                 planes (sin la imagen)
// GET  /api/bot-vendedor/planes/:id/imagen      imagen del plan
// POST /api/bot-vendedor/planes/:id/imagen      multipart: imagen (JPG/PNG/WEBP, max 3 MB)
// POST /api/bot-vendedor/planes                 { nombre, velocidad_mbps, segmento, descripcion }
// PUT  /api/bot-vendedor/planes/:id             { nombre?, velocidad_mbps?, segmento?, descripcion?, activo? }
// GET  /api/bot-vendedor/nocturno               config de atencion nocturna
// PUT  /api/bot-vendedor/nocturno               { activo, linea, inicio, fin, max, mensaje }
// GET  /api/bot-vendedor/nocturno/resumen       carrera bot vs asesor por deal (?dias=30)
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
              COALESCE(b.activo, FALSE) AS bot_activo, b.horario_inicio, b.horario_fin, b.actualizado_por, b.actualizado_en
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
    const hora = (v) => {
      const t = String(v ?? '').trim();
      if (!t) return null;
      if (bot.aMinutos(t) === null || bot.aMinutos(t) >= 24 * 60) throw Object.assign(new Error('Hora invalida, usa HH:MM'), { status: 400 });
      return t.padStart(5, '0');
    };
    const inicio = hora(req.body?.horario_inicio);
    const fin = hora(req.body?.horario_fin);
    if ((inicio && !fin) || (!inicio && fin)) return fallo(res, 'Indica hora de inicio y de fin, o deja ambas vacias', 400);
    await bot.asegurarTablas();
    await pool.query(
      `INSERT INTO public.bv_lineas (line_id, activo, horario_inicio, horario_fin, actualizado_por, actualizado_en)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (line_id) DO UPDATE SET activo = EXCLUDED.activo, horario_inicio = EXCLUDED.horario_inicio,
         horario_fin = EXCLUDED.horario_fin, actualizado_por = EXCLUDED.actualizado_por, actualizado_en = NOW()`,
      [id, aBool(req.body?.activo), inicio, fin, req.user.usuario]);
    ok(res, { actualizado: true });
  } catch (e) { fallo(res, e, e.status || 500); }
});

// ─── Atencion nocturna (deals nuevos de NOVONET) ─────────────────────────────
const nocturno = require('../services/botVendedorNocturno.service');

router.get('/nocturno', async (_req, res) => {
  try { ok(res, await nocturno.leerConfig()); } catch (e) { fallo(res, e); }
});

router.put('/nocturno', async (req, res) => {
  try {
    const b = req.body || {};
    const valores = {
      nocturno_activo: aBool(b.activo) ? 'true' : 'false',
      nocturno_linea: String(b.linea || ''),
      nocturno_inicio: String(b.inicio || '20:30').trim(),
      nocturno_fin: String(b.fin || '07:30').trim(),
      nocturno_max: String(Math.max(1, parseInt(b.max, 10) || 80)),
      nocturno_mensaje: String(b.mensaje || '').trim().slice(0, 1000),
    };
    if (bot.aMinutos(valores.nocturno_inicio) === null || bot.aMinutos(valores.nocturno_fin) === null) return fallo(res, 'Hora invalida, usa HH:MM', 400);
    if (valores.nocturno_mensaje.length < 10) return fallo(res, 'Escribe el mensaje de saludo', 400);
    if (valores.nocturno_activo === 'true') {
      if (!/^[0-9a-f-]{36}$/i.test(valores.nocturno_linea)) return fallo(res, 'Elige la linea desde la que escribe el bot', 400);
      const l = await pool.query('SELECT 1 FROM lines WHERE id = $1', [valores.nocturno_linea]);
      if (!l.rows.length) return fallo(res, 'La linea no existe', 400);
    }
    await bot.asegurarTablas();
    for (const [clave, valor] of Object.entries(valores)) {
      await pool.query(
        `INSERT INTO public.bv_config (clave, valor, actualizado_por, actualizado_en) VALUES ($1, $2, $3, NOW())
         ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, actualizado_por = EXCLUDED.actualizado_por, actualizado_en = NOW()`,
        [clave, valor, req.user.usuario]);
    }
    ok(res, { guardado: true });
  } catch (e) { fallo(res, e); }
});

// Carrera bot vs asesor: por cada deal nocturno, quien cerro primero.
//   Bot    = el cliente confirmo la venta con el bot (bv_nocturno.bot_venta_en).
//   Asesor = primera venta registrada en el ERP para ese deal (envios_ventas.fecha_registro_sistema).
router.get('/nocturno/resumen', async (req, res) => {
  try {
    await bot.asegurarTablas();
    const dias = Math.min(90, Math.max(1, parseInt(req.query.dias, 10) || 30));
    const { rows } = await pool.query(
      `SELECT n.bitrix_id, n.estado, n.detalle, n.deal_creado, n.enviado_en, n.bot_venta_en,
              EXISTS (SELECT 1 FROM messages m
                       WHERE m.line_id = n.line_id AND m.wa_number = n.telefono AND m.direction = 'in'
                         AND m.timestamp > n.enviado_en) AS respondio,
              (SELECT MIN(ev.fecha_registro_sistema) FROM public.envios_ventas ev
                WHERE BTRIM(ev.id_bitrix::text) = n.bitrix_id) AS asesor_venta_en,
              l.etapa_bitrix, l.responsible
         FROM public.bv_nocturno n
         LEFT JOIN bitrix_webhook_leads l ON l.empresa = n.empresa AND l.bitrix_id::text = n.bitrix_id
        WHERE n.creado_en > NOW() - ($1 || ' days')::interval
        ORDER BY n.creado_en DESC`,
      [String(dias)]);

    const ganador = (r) => {
      const b = r.bot_venta_en ? new Date(r.bot_venta_en).getTime() : null;
      const a = r.asesor_venta_en ? new Date(r.asesor_venta_en).getTime() : null;
      if (b && (!a || b <= a)) return 'BOT';
      if (a) return 'ASESOR';
      return null;
    };
    const minutos = (desde, hasta) => (desde && hasta ? Math.round((new Date(hasta) - new Date(desde)) / 60000) : null);
    const deals = rows.map((r) => ({
      ...r,
      ganador: ganador(r),
      min_bot: minutos(r.deal_creado, r.bot_venta_en),
      min_asesor: minutos(r.deal_creado, r.asesor_venta_en),
    }));
    const prom = (xs) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
    const totales = {
      deals: deals.length,
      enviados: deals.filter((d) => d.estado === 'enviado').length,
      respondieron: deals.filter((d) => d.respondio).length,
      errores: deals.filter((d) => d.estado === 'error').length,
      cierres_bot: deals.filter((d) => d.bot_venta_en).length,
      cierres_asesor: deals.filter((d) => d.asesor_venta_en).length,
      gana_bot: deals.filter((d) => d.ganador === 'BOT').length,
      gana_asesor: deals.filter((d) => d.ganador === 'ASESOR').length,
      prom_min_bot: prom(deals.map((d) => d.min_bot).filter((x) => x !== null)),
      prom_min_asesor: prom(deals.map((d) => d.min_asesor).filter((x) => x !== null)),
    };
    ok(res, { dias, totales, ultimos: deals.slice(0, 150) });
  } catch (e) { fallo(res, e); }
});

// ─── Planes con imagen ───────────────────────────────────────────────────────
const subirImagen = multer({ storage: multer.memoryStorage(), limits: { fileSize: 3 * 1024 * 1024, files: 1 } });

router.get('/planes', async (_req, res) => {
  try {
    await bot.asegurarTablas();
    const { rows } = await pool.query(
      `SELECT id, nombre, velocidad_mbps, segmento, descripcion, activo, orden, actualizado_por, actualizado_en,
              (imagen IS NOT NULL) AS tiene_imagen, imagen_mime, OCTET_LENGTH(imagen) AS imagen_bytes
         FROM public.bv_planes ORDER BY orden, id`);
    ok(res, rows);
  } catch (e) { fallo(res, e); }
});

router.get('/planes/:id/imagen', async (req, res) => {
  try {
    const img = await bot.imagenPlan(parseInt(req.params.id, 10) || 0);
    if (!img) return fallo(res, 'Sin imagen', 404);
    res.set('Content-Type', img.mime).set('Cache-Control', 'no-store').send(img.buffer);
  } catch (e) { fallo(res, e); }
});

router.post('/planes/:id/imagen', subirImagen.single('imagen'), async (req, res) => {
  try {
    const f = req.file;
    if (!f) return fallo(res, 'Falta la imagen', 400);
    if (!/^image\/(jpeg|png|webp)$/i.test(f.mimetype)) return fallo(res, 'Solo imagenes JPG, PNG o WEBP', 400);
    const id = parseInt(req.params.id, 10) || 0;
    const { rowCount } = await pool.query(
      `UPDATE public.bv_planes SET imagen = $1, imagen_mime = $2, actualizado_por = $3, actualizado_en = NOW() WHERE id = $4`,
      [f.buffer, f.mimetype, req.user.usuario, id]);
    if (!rowCount) return fallo(res, 'El plan no existe', 404);
    bot.invalidarImagen(id);
    ok(res, { actualizado: true });
  } catch (e) { fallo(res, e); }
});

router.post('/planes', async (req, res) => {
  try {
    const nombre = String(req.body?.nombre || '').trim().slice(0, 150);
    if (!nombre) return fallo(res, 'Falta el nombre del plan', 400);
    await bot.asegurarTablas();
    const { rows } = await pool.query(
      `INSERT INTO public.bv_planes (nombre, velocidad_mbps, segmento, descripcion, orden, actualizado_por)
       VALUES ($1, $2, $3, $4, (SELECT COALESCE(MAX(orden), 0) + 1 FROM public.bv_planes), $5) RETURNING id`,
      [nombre, parseInt(req.body?.velocidad_mbps, 10) || null, String(req.body?.segmento || 'HOME').slice(0, 50),
        String(req.body?.descripcion || '').slice(0, 500), req.user.usuario]);
    bot.invalidarCache();
    ok(res, rows[0]);
  } catch (e) { fallo(res, e); }
});

router.put('/planes/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10) || 0;
    const b = req.body || {};
    const sets = [];
    const vals = [];
    if (b.nombre !== undefined) { vals.push(String(b.nombre).trim().slice(0, 150)); sets.push(`nombre = $${vals.length}`); }
    if (b.velocidad_mbps !== undefined) { vals.push(parseInt(b.velocidad_mbps, 10) || null); sets.push(`velocidad_mbps = $${vals.length}`); }
    if (b.segmento !== undefined) { vals.push(String(b.segmento).slice(0, 50)); sets.push(`segmento = $${vals.length}`); }
    if (b.descripcion !== undefined) { vals.push(String(b.descripcion).slice(0, 500)); sets.push(`descripcion = $${vals.length}`); }
    if (b.activo !== undefined) { vals.push(aBool(b.activo)); sets.push(`activo = $${vals.length}`); }
    if (!sets.length) return fallo(res, 'Nada que actualizar', 400);
    vals.push(req.user.usuario); sets.push(`actualizado_por = $${vals.length}`);
    vals.push(id);
    const { rowCount } = await pool.query(
      `UPDATE public.bv_planes SET ${sets.join(', ')}, actualizado_en = NOW() WHERE id = $${vals.length}`, vals);
    if (!rowCount) return fallo(res, 'El plan no existe', 404);
    bot.invalidarImagen(id);
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
