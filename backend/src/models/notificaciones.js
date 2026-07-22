// src/models/notificaciones.js
// Crea la tabla si no existe y expone helpers CRUD
const pool = require('../config/db');

const crearTabla = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.notificaciones_alertas (
      id            SERIAL PRIMARY KEY,
      tipo          VARCHAR(20)  NOT NULL,  -- 'ERP' | 'EMAIL' | 'WHATSAPP'
      canal         VARCHAR(20)  NOT NULL,
      supervisor    TEXT,
      asesor        TEXT,
      condicion     TEXT,                   -- 'gestion_diaria' | 'contacto_nuevo' | 'sin_ventas'
      mensaje       TEXT,
      enviado_ok    BOOLEAN DEFAULT true,
      error_detalle TEXT,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  // FIX (2026-07-22): en instalaciones existentes supervisor/asesor/condicion
  // eran VARCHAR(200)/(100). El cron de alertas concatena TODOS los asesores en
  // un solo string ("A, B, C, ...") y superaba el límite:
  //   "value too long for type character varying(200)" → la notificación se
  // perdía silenciosamente. Ampliar a TEXT es solo cambio de metadato (no
  // reescribe la tabla) e idempotente.
  try {
    await pool.query(`
      ALTER TABLE public.notificaciones_alertas
        ALTER COLUMN supervisor TYPE text,
        ALTER COLUMN asesor     TYPE text,
        ALTER COLUMN condicion  TYPE text;
    `);
  } catch (e) {
    console.warn('[NOTIF] No se pudieron ampliar columnas (continuando):', e.message);
  }
  console.log('[DB] Tabla notificaciones_alertas lista');
};

// Truncado defensivo: aunque las columnas ya son TEXT, tipo/canal siguen
// siendo VARCHAR(20). Evita que un valor inesperado vuelva a tirar el INSERT.
const _trunc = (v, max) => (typeof v === 'string' && v.length > max ? v.slice(0, max) : v);

const registrar = async ({ tipo, canal, supervisor, asesor, condicion, mensaje, enviado_ok = true, error_detalle = null }) => {
  try {
    await pool.query(
      `INSERT INTO public.notificaciones_alertas
        (tipo, canal, supervisor, asesor, condicion, mensaje, enviado_ok, error_detalle)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [_trunc(tipo, 20), _trunc(canal, 20), supervisor, asesor, condicion, mensaje, enviado_ok, error_detalle]
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