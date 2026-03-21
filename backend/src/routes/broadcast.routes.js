// src/routes/broadcast.routes.js
// Montar en app.js: app.use('/api/broadcast', require('./routes/broadcast.routes'));

const router   = require('express').Router();
const { getIO } = require('../config/socket');
const broadcastSvc = require('../services/broadcast.service');
const pool     = require('../config/db');
const cron     = require('node-cron');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');

// ── Almacenamiento de imágenes ────────────────────────────────────────────────
const uploadDir = path.join(process.cwd(), 'uploads', 'broadcast');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename:    (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } }); // 5MB

// ── Tabla de mensajes programados ────────────────────────────────────────────
const crearTabla = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.broadcast_mensajes (
      id          SERIAL PRIMARY KEY,
      tipo        VARCHAR(30)  NOT NULL, -- 'urgente'|'info'|'logro'|'prevencion'|'personalizado'
      titulo      VARCHAR(300),
      mensaje     TEXT,
      imagen_url  VARCHAR(500),
      efecto      VARCHAR(50),           -- 'confeti'|'fuego'|'alertaroja'|'ninguno'
      sonido      VARCHAR(50),           -- 'chime'|'alerta'|'victoria'|'ninguno'
      duracion    INT DEFAULT 30,        -- segundos
      programado_para TIMESTAMPTZ,
      enviado     BOOLEAN DEFAULT false,
      datos_vivos VARCHAR(50),           -- 'top_asesores'|'sin_ventas'|'gestion_diaria'|'top_activas'|null
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );
  `);
};
crearTabla().catch(console.error);

// Mapa de jobs programados en memoria
const jobsActivos = {};

// ── Emitir broadcast a todos los clientes conectados ─────────────────────────
const emitirBroadcast = async (mensaje) => {
  const io = getIO();

  // Si tiene datos_vivos, enriquece con info de BD
  let datosVivos = null;
  if (mensaje.datos_vivos) {
    try {
      switch (mensaje.datos_vivos) {
        case 'top_asesores':    datosVivos = await broadcastSvc.getTopAsesores(); break;
        case 'sin_ventas':      datosVivos = await broadcastSvc.getAsesoresSinVentas(); break;
        case 'gestion_diaria':  datosVivos = await broadcastSvc.getAsesoresGestionDiaria(); break;
        case 'top_activas':     datosVivos = await broadcastSvc.getTopActivas(); break;
        case 'resumen_dia':     datosVivos = await broadcastSvc.getResumenDia(); break;
      }
    } catch (e) { console.error('[BROADCAST] Error datos vivos:', e.message); }
  }

  io.emit('broadcast_mensaje', { ...mensaje, datosVivos, timestamp: new Date().toISOString() });

  // Marcar como enviado en BD
  if (mensaje.id) {
    await pool.query('UPDATE public.broadcast_mensajes SET enviado = true WHERE id = $1', [mensaje.id]);
  }
};

// ── POST /api/broadcast/enviar — envío inmediato ──────────────────────────────
router.post('/enviar', upload.single('imagen'), async (req, res) => {
  try {
    const { tipo, titulo, mensaje, efecto, sonido, duracion, datos_vivos } = req.body;
    const imagen_url = req.file ? `/uploads/broadcast/${req.file.filename}` : req.body.imagen_url || null;

    const { rows } = await pool.query(`
      INSERT INTO public.broadcast_mensajes (tipo, titulo, mensaje, imagen_url, efecto, sonido, duracion, datos_vivos, enviado)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true) RETURNING *
    `, [tipo, titulo, mensaje, imagen_url, efecto, sonido, parseInt(duracion) || 30, datos_vivos || null]);

    await emitirBroadcast(rows[0]);
    res.json({ success: true, mensaje: 'Broadcast enviado', data: rows[0] });
  } catch (e) {
    console.error('[BROADCAST] Error envío:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── POST /api/broadcast/programar — programar para una hora ──────────────────
router.post('/programar', upload.single('imagen'), async (req, res) => {
  try {
    const { tipo, titulo, mensaje, efecto, sonido, duracion, datos_vivos, programado_para } = req.body;
    const imagen_url = req.file ? `/uploads/broadcast/${req.file.filename}` : req.body.imagen_url || null;

    const { rows } = await pool.query(`
      INSERT INTO public.broadcast_mensajes (tipo, titulo, mensaje, imagen_url, efecto, sonido, duracion, datos_vivos, programado_para)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *
    `, [tipo, titulo, mensaje, imagen_url, efecto, sonido, parseInt(duracion) || 30, datos_vivos || null, programado_para]);

    const msgData = rows[0];
    const fechaEnvio = new Date(programado_para);
    const ahora = new Date();
    const msHasta = fechaEnvio - ahora;

    if (msHasta > 0) {
      const timer = setTimeout(async () => {
        await emitirBroadcast(msgData);
        delete jobsActivos[msgData.id];
      }, msHasta);
      jobsActivos[msgData.id] = timer;
    }

    res.json({ success: true, mensaje: 'Broadcast programado', data: msgData });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── GET /api/broadcast/historial — últimos 30 mensajes ───────────────────────
router.get('/historial', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT * FROM public.broadcast_mensajes
      ORDER BY created_at DESC LIMIT 30
    `);
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── GET /api/broadcast/datos-vivos — preview de datos disponibles ─────────────
router.get('/datos-vivos', async (req, res) => {
  try {
    const [topAsesores, sinVentas, gestionDiaria, topActivas, resumen] = await Promise.all([
      broadcastSvc.getTopAsesores(),
      broadcastSvc.getAsesoresSinVentas(),
      broadcastSvc.getAsesoresGestionDiaria(),
      broadcastSvc.getTopActivas(),
      broadcastSvc.getResumenDia(),
    ]);
    res.json({ success: true, topAsesores, sinVentas, gestionDiaria, topActivas, resumen });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── DELETE /api/broadcast/:id — cancelar programado ──────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (jobsActivos[id]) { clearTimeout(jobsActivos[id]); delete jobsActivos[id]; }
    await pool.query('DELETE FROM public.broadcast_mensajes WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Servir imágenes subidas
const express = require('express');
router.use('/imagenes', express.static(uploadDir));

module.exports = router;