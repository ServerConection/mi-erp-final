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
const { normalizarNombre } = require('./repartoGestionables');

const EMPRESA_DE = { NOVONET: 'novonet', VELSA: 'velsa', SEMILLERO: 'semillero' };
const PERFILES_ASESOR = ['ASESOR', 'USUARIO'];

let cacheAsesores = { ts: 0, mapa: null };
const asesoresPorNombre = async () => {
  if (cacheAsesores.mapa && Date.now() - cacheAsesores.ts < 10 * 60 * 1000) return cacheAsesores.mapa;
  try {
    const { rows } = await db.query(
      `SELECT empresa, usuario, nombres, apellidos FROM public.usuarios
        WHERE activo = 'SI'
          AND UPPER(BTRIM(COALESCE(perfil, ''))) = ANY($1)
          AND UPPER(BTRIM(COALESCE(empresa, ''))) IN ('NOVONET', 'VELSA', 'SEMILLERO')`,
      [PERFILES_ASESOR]
    );
    const mapa = new Map();
    for (const r of rows) {
      const emp = EMPRESA_DE[String(r.empresa).trim().toUpperCase()];
      const nombre = normalizarNombre(`${r.nombres || ''} ${r.apellidos || ''}`);
      if (nombre) mapa.set(nombre, emp);
      if (r.usuario) mapa.set(normalizarNombre(r.usuario), emp);
    }
    cacheAsesores = { ts: Date.now(), mapa };
    return mapa;
  } catch (e) {
    console.warn('[bolsaLeads] No se pudo leer usuarios del ERP; se usa la empresa de Bitrix Live:', e.message);
    return null;
  }
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

module.exports = { conectadosPorEmpresa, contarConectados, contarDesdeMapa, initConexionBolsaLeads };
