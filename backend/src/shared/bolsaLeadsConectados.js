/**
 * BOLSA LEADS — ¿quién está conectado en cada empresa?
 *
 * Solo mide CONEXIÓN (no cupos ni disponibilidad para recibir). Reutiliza
 * Bitrix Live (bitrixSesiones.controller → recolectar), igual que el reparto
 * de gestionables:
 *   - Conectado = jornada ABIERTA en Bitrix (en pausa no). Si ese portal no
 *     usa jornada laboral, se usa "en línea en Bitrix".
 *   - Solo cuentan los ASESORES (usuarios activos del ERP con perfil ASESOR o
 *     USUARIO), clasificados por su empresa del ERP: NOVONET, VELSA o SEMILLERO.
 *     Si no se puede leer la tabla de usuarios, se usa la empresa que ya
 *     asigna Bitrix Live a cada persona.
 * Si Bitrix Live no responde se usa el último estado bueno guardado (igual que
 * el bot de gestionables). Si nunca hubo uno, la Bolsa no redirige.
 * Se refresca cada minuto (initConexionBolsaLeads).
 */
const db = require('../config/db');
const poolErp = require('../config/dbErp');
const { normalizarNombre } = require('./repartoGestionables');

const EMPRESA_DE = { NOVONET: 'novonet', VELSA: 'velsa', SEMILLERO: 'semillero' };
const PERFILES_ASESOR = ['ASESOR', 'USUARIO'];

let cacheAsesores = { ts: 0, mapa: null };
/**
 * Mapa nombre normalizado → empresa.
 *  1) PRIMERO, la misma lista que usa el repartidor de gestionables: los asesores
 *     con cupo cargado (gestionables_asesores = NOVONET, velsa_gestionables_asesores
 *     = VELSA), en los últimos 7 días. Ese nombre ES el de Bitrix, así que el cruce
 *     con Bitrix Live es exacto — igual que en el repartidor.
 *  2) Después, los usuarios activos del ERP (perfil ASESOR/USUARIO) para quien no
 *     tenga cupo (por ejemplo SEMILLERO, que no tiene repartidor).
 */
const asesoresPorNombre = async () => {
  if (cacheAsesores.mapa && Date.now() - cacheAsesores.ts < 2 * 60 * 1000) return cacheAsesores.mapa;
  const mapa = new Map();
  let algo = false;
  // 2) usuarios del ERP (se cargan primero y la lista de cupos los pisa)
  try {
    const { rows } = await db.query(
      `SELECT empresa, usuario, nombres, apellidos FROM public.usuarios
        WHERE activo = 'SI'
          AND UPPER(BTRIM(COALESCE(perfil, ''))) = ANY($1)
          AND UPPER(BTRIM(COALESCE(empresa, ''))) IN ('NOVONET', 'VELSA', 'SEMILLERO')`,
      [PERFILES_ASESOR]
    );
    for (const r of rows) {
      const emp = EMPRESA_DE[String(r.empresa).trim().toUpperCase()];
      const nombre = normalizarNombre(`${r.nombres || ''} ${r.apellidos || ''}`);
      if (nombre) mapa.set(nombre, emp);
      if (r.usuario) mapa.set(normalizarNombre(r.usuario), emp);
    }
    algo = true;
  } catch (e) {
    console.warn('[bolsaLeads] No se pudo leer usuarios del ERP:', e.message);
  }
  // 1) lista de cupos del repartidor (manda sobre la de usuarios)
  for (const [emp, tabla] of [['semillero', 'semillero_gestionables_asesores'], ['novonet', 'gestionables_asesores'], ['velsa', 'velsa_gestionables_asesores']]) {
    try {
      const { rows } = await poolErp.query(
        `SELECT DISTINCT nombre_bitrix_asesor AS nombre FROM ${tabla}
          WHERE fecha_carga >= (NOW() AT TIME ZONE 'America/Guayaquil')::date - 7`
      );
      for (const r of rows) mapa.set(normalizarNombre(r.nombre), emp);
      algo = true;
    } catch (e) {
      console.warn(`[bolsaLeads] No se pudo leer ${tabla}:`, e.message);
    }
  }
  if (!algo) return null;
  // Las estaciones (donde esperan los leads) no son asesores: no cuentan como conectados
  const { EMPRESAS } = require('./repartoEmpresas');
  for (const E of Object.values(EMPRESAS)) if (E.estacion) mapa.delete(normalizarNombre(E.estacion));
  cacheAsesores = { ts: Date.now(), mapa };
  return mapa;
};

/**
 * Cuenta conectados por empresa a partir de los datos de Bitrix Live.
 * Pura (sin red) para poder probarla.
 */
const contarConectados = (data, asesores) => {
  const out = { novonet: [], velsa: [], semillero: [] };
  const vistos = new Set();
  for (const u of data?.usuarios || []) {
    const nombre = normalizarNombre(u.nombre);
    const emp = asesores ? asesores.get(nombre) : EMPRESA_DE[String(u.cuenta || '').toUpperCase()];
    if (!emp || vistos.has(`${emp}:${nombre}`)) continue;
    const conJornada = !!data.fuentes?.[u.portalCuenta || u.cuenta]?.timeman;
    const conectado = conJornada ? u.jornada === 'OPENED' : !!u.online;
    if (!conectado) continue;
    vistos.add(`${emp}:${nombre}`);
    out[emp].push(u.nombre);
  }
  return Object.fromEntries(Object.entries(out).map(([e, nombres]) => [e, { conectados: nombres.length, nombres }]));
};

// Mismo criterio que el bot de gestionables: leerEnLinea() de repartoEstado
// (jornada abierta; si el portal no usa jornada, "en línea"). Esa lectura ya
// guarda el último estado bueno de Bitrix Live y lo usa si Bitrix no responde.
// Se usa la vista de VELSA porque abarca los dos portales (NOVONET y VELSA).
const contarDesdeMapa = (mapa, asesores) => {
  const out = { novonet: [], velsa: [], semillero: [] };
  for (const [nombre, emp] of asesores) {
    if (mapa.get(nombre)?.enLinea && !out[emp].includes(nombre)) out[emp].push(nombre);
  }
  return Object.fromEntries(Object.entries(out).map(([e, nombres]) => [e, { conectados: nombres.length, nombres }]));
};

// Último resultado bueno de la Bolsa (por si falla también la lista de asesores)
let ultimo = null;

/**
 * { novonet:{conectados,nombres}, velsa:{…}, semillero:{…}, generado, respaldo, motivo? }
 * o { sinDatos: true, motivo } si nunca se pudo leer.
 * respaldo = true → es el último estado conocido (Bitrix no respondió ahora).
 */
const conectadosPorEmpresa = async ({ forzar = false } = {}) => {
  try {
    const { leerEnLinea } = require('./repartoEstado');
    const [enLinea, asesores] = await Promise.all([leerEnLinea({ forzar, empresa: 'velsa' }), asesoresPorNombre()]);
    if (!enLinea) throw new Error('Bitrix Live no respondió y todavía no hay un estado guardado');
    if (!asesores) throw new Error('No se pudo leer la lista de asesores del ERP');
    const out = {
      ...contarDesdeMapa(enLinea.mapa, asesores),
      generado: enLinea.generado || new Date().toISOString(),
      criterio: enLinea.criterio,
      respaldo: !!enLinea.respaldo,
      motivo: enLinea.respaldo ? enLinea.motivo_respaldo : undefined,
    };
    if (!out.respaldo) ultimo = out;
    return out;
  } catch (e) {
    console.warn('[bolsaLeads] Conectados:', e.message);
    if (ultimo) return { ...ultimo, respaldo: true, motivo: e.message };
    return { sinDatos: true, motivo: e.message };
  }
};

// Cada minuto: mantiene fresco el estado de conexión (y el último estado bueno).
const initConexionBolsaLeads = () => {
  if (String(process.env.BOLSA_LEADS_CONEXION_WORKER || 'true').toLowerCase() === 'false') return null;
  const cron = require('node-cron');
  return cron.schedule('* * * * *', () => {
    conectadosPorEmpresa().catch((e) => console.warn('[bolsaLeads] cron conexión:', e.message));
  }, { timezone: 'America/Guayaquil' });
};

module.exports = { conectadosPorEmpresa, contarConectados, contarDesdeMapa, initConexionBolsaLeads, asesoresPorNombre };
