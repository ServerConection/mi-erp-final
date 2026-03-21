// src/models/notificaciones.js
// Crea la tabla si no existe y expone helpers CRUD
const pool = require('../config/db');

const crearTabla = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.notificaciones_alertas (
      id            SERIAL PRIMARY KEY,
      tipo          VARCHAR(20)  NOT NULL,  -- 'ERP' | 'EMAIL' | 'WHATSAPP'
      canal         VARCHAR(20)  NOT NULL,
      supervisor    VARCHAR(200),
      asesor        VARCHAR(200),
      condicion     VARCHAR(100),           -- 'gestion_diaria' | 'contacto_nuevo' | 'sin_ventas'
      mensaje       TEXT,
      enviado_ok    BOOLEAN DEFAULT true,
      error_detalle TEXT,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('[DB] Tabla notificaciones_alertas lista');
};

const registrar = async ({ tipo, canal, supervisor, asesor, condicion, mensaje, enviado_ok = true, error_detalle = null }) => {
  try {
    await pool.query(
      `INSERT INTO public.notificaciones_alertas
        (tipo, canal, supervisor, asesor, condicion, mensaje, enviado_ok, error_detalle)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [tipo, canal, supervisor, asesor, condicion, mensaje, enviado_ok, error_detalle]
    );
  } catch (e) {
    console.error('[NOTIF] Error registrando notificación:', e.message);
  }
};

const getResumen = async () => {
  const { rows } = await pool.query(`
    SELECT
      canal,
      COUNT(*)::int                                              AS total,
      COUNT(*) FILTER (WHERE enviado_ok)::int                   AS exitosas,
      COUNT(*) FILTER (WHERE NOT enviado_ok)::int               AS fallidas,
      COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24h')::int AS ultimas_24h,
      COUNT(*) FILTER (WHERE created_at >= DATE_TRUNC('month', NOW()))::int AS este_mes
    FROM public.notificaciones_alertas
    GROUP BY canal
    ORDER BY canal
  `);
  return rows;
};

const getHistorial = async (limit = 50) => {
  const { rows } = await pool.query(`
    SELECT id, tipo, canal, supervisor, asesor, condicion, mensaje,
           enviado_ok, error_detalle, created_at
    FROM public.notificaciones_alertas
    ORDER BY created_at DESC
    LIMIT $1
  `, [limit]);
  return rows;
};

const getConteosPorCondicion = async () => {
  const { rows } = await pool.query(`
    SELECT
      condicion,
      COUNT(*)::int AS total,
      MAX(created_at) AS ultima_vez
    FROM public.notificaciones_alertas
    WHERE created_at >= DATE_TRUNC('month', NOW())
    GROUP BY condicion
    ORDER BY total DESC
  `);
  return rows;
};

module.exports = { crearTabla, registrar, getResumen, getHistorial, getConteosPorCondicion };