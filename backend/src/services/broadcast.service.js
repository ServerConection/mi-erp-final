// src/services/broadcast.service.js
const pool = require('../config/db');

const getFechaEcuador = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'America/Guayaquil' });

// Asesores con más ingresos Jot hoy
const getTopAsesores = async (limit = 5) => {
  const { rows } = await pool.query(`
    SELECT
      mb.b_persona_responsable AS nombre,
      COUNT(*)::int             AS ingresos
    FROM public.mestra_bitrix mb
    WHERE mb.j_fecha_registro_sistema::date = $1::date
    GROUP BY mb.b_persona_responsable
    ORDER BY ingresos DESC
    LIMIT $2
  `, [getFechaEcuador(), limit]);
  return rows;
};

// Asesores sin ventas hoy
const getAsesoresSinVentas = async () => {
  const { rows: todos } = await pool.query(`
    SELECT DISTINCT ON (nombre_completo) nombre_completo AS nombre
    FROM public.empleados WHERE supervisor IS NOT NULL
    ORDER BY nombre_completo
  `);
  const { rows: conVentas } = await pool.query(`
    SELECT DISTINCT mb.b_persona_responsable AS nombre
    FROM public.mestra_bitrix mb
    WHERE mb.j_fecha_registro_sistema::date = $1::date
  `, [getFechaEcuador()]);
  const set = new Set(conVentas.map(r => r.nombre));
  return todos.filter(r => !set.has(r.nombre)).map(r => r.nombre);
};

// Asesores con leads en Gestión Diaria hoy
const getAsesoresGestionDiaria = async () => {
  const { rows } = await pool.query(`
    SELECT mb.b_persona_responsable AS nombre, COUNT(*)::int AS cantidad
    FROM public.mestra_bitrix mb
    WHERE mb.b_etapa_de_la_negociacion ILIKE '%GESTI%N DIARIA%'
      AND mb.b_creado_el_fecha::date = $1::date
    GROUP BY mb.b_persona_responsable
    ORDER BY cantidad DESC
  `, [getFechaEcuador()]);
  return rows;
};

// Asesores con más activas del mes
const getTopActivas = async (limit = 5) => {
  const primerDia = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Guayaquil' }).slice(0,7) + '-01';
  const { rows } = await pool.query(`
    SELECT
      mb.b_persona_responsable AS nombre,
      COUNT(*)::int             AS activas
    FROM public.mestra_bitrix mb
    WHERE mb.j_netlife_estatus_real = 'ACTIVO'
      AND mb.j_fecha_registro_sistema::date >= $1::date
    GROUP BY mb.b_persona_responsable
    ORDER BY activas DESC
    LIMIT $2
  `, [primerDia, limit]);
  return rows;
};

// Resumen general del día
const getResumenDia = async () => {
  const hoy = getFechaEcuador();
  const { rows } = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE mb.j_fecha_registro_sistema::date = $1::date)::int AS ingresos_hoy,
      COUNT(*) FILTER (WHERE mb.j_netlife_estatus_real = 'ACTIVO' AND mb.j_fecha_registro_sistema::date = $1::date)::int AS activas_hoy,
      COUNT(*) FILTER (WHERE mb.b_etapa_de_la_negociacion ILIKE '%GESTI%N DIARIA%' AND mb.b_creado_el_fecha::date = $1::date)::int AS gestion_diaria
    FROM public.mestra_bitrix mb
  `, [hoy]);
  return rows[0] || {};
};

module.exports = { getTopAsesores, getAsesoresSinVentas, getAsesoresGestionDiaria, getTopActivas, getResumenDia };