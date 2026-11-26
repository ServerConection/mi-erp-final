// src/routes/botAtc.routes.js
// ============================================================
// BOT ATC (piloto) — configuracion desde el ERP (solo ADMINISTRADOR).
//
// GET  /api/bot-atc/config        mensajes, segundos y etapas
// PUT  /api/bot-atc/config        { pregunta, repregunta, plantilla, confirmacion_ventas, segundos, reinicio_horas, etapa_atc, etapa_no_detectado }
// GET  /api/bot-atc/etapas        etapas del pipeline NOVONET en Bitrix
// GET  /api/bot-atc/lineas        lineas de WABOT y si el bot ATC esta activo
// PUT  /api/bot-atc/lineas/:id    { activo, horario_inicio, horario_fin }
// GET  /api/bot-atc/sesiones      chats filtrados (?dias=7&estado=ATC) + resumen
// GET  /api/bot-atc/sesiones/:id/mensajes   mensajes del chat
// ============================================================
'use strict';

const express = require('express');
const pool = require('../config/db');
const { verificarToken, soloAdmin } = require('../middleware/auth');
const atc = require('../services/botAtc.service');
const bot = require('../services/botVendedor.service');

const router = express.Router();
router.use(verificarToken, soloAdmin);

const ok = (res, data) => res.json({ success: true, data });
const fallo = (res, e, status = 500) => {
  if (status >= 500) console.error('[BOT-ATC]', e?.message || e);
  res.status(status).json({ success: false, error: e?.message || String(e) });
};

router.get('/config', async (_req, res) => {
  try {
    const cfg = await atc.leerConfig(true);
    const datos = {};
    for (const k of Object.keys(atc.DEFECTOS)) datos[k] = cfg[k];
    ok(res, datos);
  } catch (e) { fallo(res, e); }
});

router.put('/config', async (req, res) => {
  try {
    const b = req.body || {};
    const valores = {};
    for (const k of Object.keys(atc.DEFECTOS)) if (b[k] !== undefined) valores[k] = String(b[k]).slice(0, 4000);
    for (const k of ['pregunta', 'plantilla']) if (valores[k] !== undefined && !valores[k].trim()) return fallo(res, new Error(`El mensaje "${k}" no puede quedar vacío`), 400);
    if (valores.segundos !== undefined) {
      const n = parseInt(valores.segundos, 10);
      if (!(n >= 30 && n <= 600)) return fallo(res, new Error('Los segundos deben estar entre 30 y 600'), 400);
      valores.segundos = String(n);
    }
    if (valores.reinicio_horas !== undefined) {
      const n = parseInt(valores.reinicio_horas, 10);
      if (!(n >= 1 && n <= 720)) return fallo(res, new Error('Las horas deben estar entre 1 y 720'), 400);
      valores.reinicio_horas = String(n);
    }
    await atc.guardarConfig(valores, req.user?.usuario);
    ok(res, { guardado: true });
  } catch (e) { fallo(res, e); }
});

router.get('/etapas', async (_req, res) => {
  try { ok(res, (await atc.etapasBitrix()).sort((a, b) => a.orden - b.orden)); }
  catch (e) { fallo(res, e); }
});

router.get('/lineas', async (_req, res) => {
  try {
    await atc.asegurarTablas();
    const { rows } = await pool.query(
      `SELECT l.id, l.name, l.phone_number, l.status,
              COALESCE(a.activo, FALSE) AS bot_activo, a.horario_inicio, a.horario_fin, a.actualizado_por, a.actualizado_en
         FROM lines l LEFT JOIN public.batc_lineas a ON a.line_id = l.id
        ORDER BY COALESCE(a.activo, FALSE) DESC, l.name`);
    ok(res, rows);
  } catch (e) { fallo(res, e); }
});

router.put('/lineas/:id', async (req, res) => {
  try {
    const id = String(req.params.id || '');
    if (!/^[0-9a-f-]{36}$/i.test(id)) return fallo(res, new Error('Línea inválida'), 400);
    const existe = await pool.query('SELECT 1 FROM lines WHERE id = $1', [id]);
    if (!existe.rows.length) return fallo(res, new Error('La línea no existe'), 404);
    const hora = (v) => {
      const t = String(v ?? '').trim();
      if (!t) return null;
      if (bot.aMinutos(t) === null || bot.aMinutos(t) >= 24 * 60) throw Object.assign(new Error('Hora inválida, usa HH:MM'), { status: 400 });
      return t.padStart(5, '0');
    };
    const inicio = hora(req.body?.horario_inicio);
    const fin = hora(req.body?.horario_fin);
    if ((inicio && !fin) || (!inicio && fin)) return fallo(res, new Error('Indica hora de inicio y de fin, o deja ambas vacías'), 400);
    await atc.asegurarTablas();
    await pool.query(
      `INSERT INTO public.batc_lineas (line_id, activo, horario_inicio, horario_fin, actualizado_por, actualizado_en)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (line_id) DO UPDATE SET activo = EXCLUDED.activo, horario_inicio = EXCLUDED.horario_inicio,
         horario_fin = EXCLUDED.horario_fin, actualizado_por = EXCLUDED.actualizado_por, actualizado_en = NOW()`,
      [id, req.body?.activo === true || req.body?.activo === 'true', inicio, fin, req.user?.usuario || null]);
    atc.invalidarLineas();
    ok(res, { actualizado: true });
  } catch (e) { fallo(res, e, e.status || 500); }
});

router.get('/sesiones', async (req, res) => {
  try {
    await atc.asegurarTablas();
    const dias = Math.min(90, Math.max(1, parseInt(req.query.dias, 10) || 7));
    const estado = ['PENDIENTE', 'ATC', 'VENTAS', 'NO_DETECTADO'].includes(req.query.estado) ? req.query.estado : null;
    const filas = await pool.query(
      `SELECT s.id, s.conversation_id, s.estado, s.metodo, s.respuesta, s.telefono, s.bitrix_id,
              s.etapa_objetivo, s.etapa_anterior, s.etapa_estado, s.etapa_detalle, s.inicio, s.resuelto_en,
              EXTRACT(EPOCH FROM (s.resuelto_en - s.inicio))::int AS segundos,
              l.name AS linea, COALESCE(c.name, '') AS cliente
         FROM public.batc_sesiones s
         LEFT JOIN lines l ON l.id = s.line_id
         LEFT JOIN conversations cv ON cv.id = s.conversation_id
         LEFT JOIN contacts c ON c.id = cv.contact_id
        WHERE s.inicio > NOW() - ($1 || ' days')::interval AND ($2::text IS NULL OR s.estado = $2)
        ORDER BY s.inicio DESC LIMIT 500`, [String(dias), estado]);
    const resumen = await pool.query(
      `SELECT estado, COUNT(*)::int AS n FROM public.batc_sesiones
        WHERE inicio > NOW() - ($1 || ' days')::interval GROUP BY estado`, [String(dias)]);
    const r = { total: 0, ATC: 0, VENTAS: 0, NO_DETECTADO: 0, PENDIENTE: 0 };
    for (const x of resumen.rows) { r[x.estado] = x.n; r.total += x.n; }
    ok(res, { resumen: r, sesiones: filas.rows });
  } catch (e) { fallo(res, e); }
});

router.get('/sesiones/:id/mensajes', async (req, res) => {
  try {
    const { rows: s } = await pool.query('SELECT conversation_id, inicio FROM public.batc_sesiones WHERE id = $1', [Number(req.params.id) || 0]);
    if (!s.length) return fallo(res, new Error('No existe'), 404);
    const { rows } = await pool.query(
      `SELECT direction, type, content, timestamp, COALESCE(metadata->>'bot_atc', '') = 'true' AS bot_atc,
              COALESCE(metadata->>'bot_vendedor', '') = 'true' AS bot_vendedor
         FROM messages WHERE conversation_id = $1 AND timestamp > $2::timestamptz - INTERVAL '1 minute'
        ORDER BY timestamp LIMIT 60`, [s[0].conversation_id, s[0].inicio]);
    ok(res, rows);
  } catch (e) { fallo(res, e); }
});

module.exports = router;
