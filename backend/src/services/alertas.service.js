// src/services/alertas.service.js
// Detecta las 3 condiciones y devuelve alertas agrupadas por supervisor

const pool = require('../config/db');

const getFechaEcuador = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'America/Guayaquil' });

// ── 1. Leads en etapa Gestión Diaria ─────────────────────────────────────────
const detectarGestionDiaria = async () => {
  const { rows } = await pool.query(`
    SELECT
      e.supervisor                          AS supervisor,
      mb.b_persona_responsable              AS asesor,
      COUNT(*)::int                         AS cantidad
    FROM public.mestra_bitrix mb
    LEFT JOIN (
      SELECT DISTINCT ON (nombre_completo) nombre_completo, supervisor
      FROM public.empleados ORDER BY nombre_completo
    ) e ON mb.b_persona_responsable = e.nombre_completo
    WHERE mb.b_etapa_de_la_negociacion ILIKE '%GESTI%N DIARIA%'
      AND mb.b_creado_el_fecha::date = $1::date
      AND e.supervisor IS NOT NULL
    GROUP BY e.supervisor, mb.b_persona_responsable
    ORDER BY e.supervisor, cantidad DESC
  `, [getFechaEcuador()]);

  return agruparPorSupervisor(rows, 'gestion_diaria');
};

// ── 2. Leads en Contacto Nuevo sin mover ─────────────────────────────────────
const detectarContactoNuevo = async () => {
  const { rows } = await pool.query(`
    SELECT
      e.supervisor                          AS supervisor,
      mb.b_persona_responsable              AS asesor,
      COUNT(*)::int                         AS cantidad
    FROM public.mestra_bitrix mb
    LEFT JOIN (
      SELECT DISTINCT ON (nombre_completo) nombre_completo, supervisor
      FROM public.empleados ORDER BY nombre_completo
    ) e ON mb.b_persona_responsable = e.nombre_completo
    WHERE mb.b_etapa_de_la_negociacion ILIKE '%CONTACTO NUEVO%'
      AND mb.b_creado_el_fecha::date <= (CURRENT_DATE - INTERVAL '1 day')
      AND e.supervisor IS NOT NULL
    GROUP BY e.supervisor, mb.b_persona_responsable
    ORDER BY e.supervisor, cantidad DESC
  `);

  return agruparPorSupervisor(rows, 'contacto_nuevo');
};

// ── 3. Asesores sin ventas hoy ────────────────────────────────────────────────
const detectarSinVentas = async () => {
  const hoy = getFechaEcuador();

  // Todos los asesores activos
  const { rows: todos } = await pool.query(`
    SELECT DISTINCT ON (nombre_completo)
      nombre_completo AS asesor,
      supervisor
    FROM public.empleados
    WHERE supervisor IS NOT NULL
    ORDER BY nombre_completo
  `);

  // Los que SÍ tienen ingresos Jot hoy
  const { rows: conVentas } = await pool.query(`
    SELECT DISTINCT mb.b_persona_responsable AS asesor
    FROM public.mestra_bitrix mb
    WHERE mb.j_fecha_registro_sistema::date = $1::date
  `, [hoy]);

  const conVentasSet = new Set(conVentas.map(r => r.asesor));
  const sinVentas    = todos.filter(r => !conVentasSet.has(r.asesor));

  // Agrupar por supervisor
  const porSupervisor = {};
  sinVentas.forEach(({ asesor, supervisor }) => {
    if (!porSupervisor[supervisor]) porSupervisor[supervisor] = [];
    porSupervisor[supervisor].push({ nombre: asesor, cantidad: 0, etapa: 'Sin ingresos hoy' });
  });

  return Object.entries(porSupervisor).map(([supervisor, asesores]) => ({
    supervisor,
    condicion: 'sin_ventas',
    asesores,
    total: asesores.length,
  }));
};

// ── Helper: agrupa filas por supervisor ───────────────────────────────────────
const agruparPorSupervisor = (rows, condicion) => {
  const map = {};
  rows.forEach(({ supervisor, asesor, cantidad }) => {
    if (!map[supervisor]) map[supervisor] = [];
    map[supervisor].push({ nombre: asesor, cantidad, etapa: condicion });
  });
  return Object.entries(map).map(([supervisor, asesores]) => ({
    supervisor,
    condicion,
    asesores,
    total: asesores.reduce((s, a) => s + (a.cantidad || 0), 0),
  }));
};

// ── Ejecuta las 3 detecciones juntas ─────────────────────────────────────────
const detectarTodo = async () => {
  const [gd, cn, sv] = await Promise.all([
    detectarGestionDiaria(),
    detectarContactoNuevo(),
    detectarSinVentas(),
  ]);
  return [...gd, ...cn, ...sv];
};

module.exports = { detectarTodo, detectarGestionDiaria, detectarContactoNuevo, detectarSinVentas };