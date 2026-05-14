// src/routes/broadcast.routes.js

const router       = require('express').Router();
const express      = require('express');
const { getIO }    = require('../config/socket');
const broadcastSvc = require('../services/broadcast.service');
const pool         = require('../config/db');
const multer       = require('multer');
const path         = require('path');
const fs           = require('fs');

// Almacenamiento de archivos
const uploadDir = path.join(process.cwd(), 'uploads', 'broadcast');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename:    (req, file, cb) => cb(null, Date.now() + '-' + file.originalname),
});

const upload = multer({ storage, limits: { fileSize: 30 * 1024 * 1024 } });
const uploadFields = upload.fields([
  { name: 'imagen',        maxCount: 1 },
  { name: 'audio_archivo', maxCount: 1 },
]);

// Tabla de mensajes
const crearTabla = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.broadcast_mensajes (
      id              SERIAL PRIMARY KEY,
      tipo            VARCHAR(30)  NOT NULL DEFAULT 'info',
      titulo          VARCHAR(300),
      mensaje         TEXT,
      imagen_url      VARCHAR(500),
      audio_url       VARCHAR(500),
      efecto          VARCHAR(50),
      sonido          VARCHAR(50),
      duracion        INT DEFAULT 30,
      canal           VARCHAR(30),
      color_fondo     VARCHAR(20) DEFAULT '#0f172a',
      color_texto     VARCHAR(20) DEFAULT '#ffffff',
      datos_vivos     VARCHAR(50),
      programado_para TIMESTAMPTZ,
      enviado         BOOLEAN DEFAULT false,
      created_at      TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  const alters = [
    "ALTER TABLE public.broadcast_mensajes ADD COLUMN IF NOT EXISTS canal       VARCHAR(30)",
    "ALTER TABLE public.broadcast_mensajes ADD COLUMN IF NOT EXISTS audio_url   VARCHAR(500)",
    "ALTER TABLE public.broadcast_mensajes ADD COLUMN IF NOT EXISTS color_fondo VARCHAR(20) DEFAULT '#0f172a'",
    "ALTER TABLE public.broadcast_mensajes ADD COLUMN IF NOT EXISTS color_texto VARCHAR(20) DEFAULT '#ffffff'",
  ];
  for (const sql of alters) {
    await pool.query(sql).catch(() => {});
  }
};
crearTabla().catch(console.error);

const jobsActivos = {};

// Emitir broadcast filtrando por canal/empresa
// Rooms:
//   ADMINISTRADOR -> broadcast:all   (todos los canales)
//   TV sin login  -> tv:all          (todos los canales)
//   ANALISTA/GER  -> empresa:NOVONET | empresa:VELSA
//
// Emision:
//   canal=novonet -> empresa:NOVONET + broadcast:all + tv:all
//   canal=velsa   -> empresa:VELSA   + broadcast:all + tv:all
//   sin canal     -> broadcast:all + tv:all
const emitirBroadcast = async (mensaje) => {
  const io = getIO();

  let datosVivos = null;
  if (mensaje.datos_vivos) {
    try {
      switch (mensaje.datos_vivos) {
        case 'top_asesores':    datosVivos = await broadcastSvc.getTopAsesores();           break;
        case 'sin_ventas':      datosVivos = await broadcastSvc.getAsesoresSinVentas();     break;
        case 'gestion_diaria':  datosVivos = await broadcastSvc.getAsesoresGestionDiaria(); break;
        case 'top_activas':     datosVivos = await broadcastSvc.getTopActivas();            break;
        case 'resumen_dia':     datosVivos = await broadcastSvc.getResumenDia();            break;
      }
    } catch (e) { console.error('[BROADCAST] Error datos vivos:', e.message); }
  }

  const payload = Object.assign({}, mensaje, { datosVivos: datosVivos, timestamp: new Date().toISOString() });
  const canal   = (mensaje.canal || '').toLowerCase().trim();

  if (canal === 'novonet') {
    io.to('empresa:NOVONET').to('broadcast:all').to('tv:all').emit('broadcast_mensaje', payload);
    console.log('[BROADCAST] -> empresa:NOVONET + broadcast:all + tv:all');
  } else if (canal === 'velsa') {
    io.to('empresa:VELSA').to('broadcast:all').to('tv:all').emit('broadcast_mensaje', payload);
    console.log('[BROADCAST] -> empresa:VELSA + broadcast:all + tv:all');
  } else {
    io.to('broadcast:all').to('tv:all').emit('broadcast_mensaje', payload);
    console.log('[BROADCAST] -> broadcast:all + tv:all (sin canal especifico)');
  }

  if (mensaje.id) {
    await pool.query(
      'UPDATE public.broadcast_mensajes SET enviado = true WHERE id = $1',
      [mensaje.id]
    );
  }
};

// POST /api/broadcast/enviar
router.post('/enviar', uploadFields, async (req, res) => {
  try {
    const {
      tipo, titulo, mensaje, efecto, sonido, duracion,
      datos_vivos, canal,
      color_fondo, color_texto,
      audio_url: audioUrlBody,
    } = req.body;

    const imagen_url = req.files && req.files.imagen && req.files.imagen[0]
      ? '/uploads/broadcast/' + req.files.imagen[0].filename
      : req.body.imagen_url || null;

    const audio_url = req.files && req.files.audio_archivo && req.files.audio_archivo[0]
      ? '/uploads/broadcast/' + req.files.audio_archivo[0].filename
      : audioUrlBody || null;

    const { rows } = await pool.query(`
      INSERT INTO public.broadcast_mensajes
        (tipo, titulo, mensaje, imagen_url, audio_url, efecto, sonido, duracion,
         datos_vivos, canal, color_fondo, color_texto, enviado)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,true) RETURNING *
    `, [
      tipo || 'info', titulo, mensaje,
      imagen_url, audio_url,
      efecto, sonido,
      parseInt(duracion) || 30,
      datos_vivos || null,
      canal        || null,
      color_fondo  || '#0f172a',
      color_texto  || '#ffffff',
    ]);

    await emitirBroadcast(rows[0]);
    res.json({ success: true, mensaje: 'Broadcast enviado', data: rows[0] });
  } catch (e) {
    console.error('[BROADCAST] Error envio:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/broadcast/programar
router.post('/programar', uploadFields, async (req, res) => {
  try {
    const {
      tipo, titulo, mensaje, efecto, sonido, duracion,
      datos_vivos, canal, programado_para,
      color_fondo, color_texto,
      audio_url: audioUrlBody,
    } = req.body;

    const imagen_url = req.files && req.files.imagen && req.files.imagen[0]
      ? '/uploads/broadcast/' + req.files.imagen[0].filename
      : req.body.imagen_url || null;

    const audio_url = req.files && req.files.audio_archivo && req.files.audio_archivo[0]
      ? '/uploads/broadcast/' + req.files.audio_archivo[0].filename
      : audioUrlBody || null;

    const { rows } = await pool.query(`
      INSERT INTO public.broadcast_mensajes
        (tipo, titulo, mensaje, imagen_url, audio_url, efecto, sonido, duracion,
         datos_vivos, canal, color_fondo, color_texto, programado_para)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *
    `, [
      tipo || 'info', titulo, mensaje,
      imagen_url, audio_url,
      efecto, sonido,
      parseInt(duracion) || 30,
      datos_vivos  || null,
      canal        || null,
      color_fondo  || '#0f172a',
      color_texto  || '#ffffff',
      programado_para,
    ]);

    const msgData = rows[0];
    const msHasta = new Date(programado_para) - new Date();
    if (msHasta > 0) {
      const timer = setTimeout(async () => {
        await emitirBroadcast(msgData);
        delete jobsActivos[msgData.id];
      }, msHasta);
      jobsActivos[msgData.id] = timer;
    }

    res.json({ success: true, mensaje: 'Broadcast programado', data: msgData });
  } catch (e) {
    console.error('[BROADCAST] Error programar:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/broadcast/historial
router.get('/historial', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM public.broadcast_mensajes ORDER BY created_at DESC LIMIT 50'
    );
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/broadcast/datos-vivos
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

// DELETE /api/broadcast/:id
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

router.use('/archivos', express.static(uploadDir));

module.exports = router;
