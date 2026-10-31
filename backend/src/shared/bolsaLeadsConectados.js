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
 * Si Bitrix Live no responde, devuelve null y la Bolsa no redirige (entrega
 * según el ciclo, como siempre).
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

const conectadosPorEmpresa = async ({ forzar = false } = {}) => {
  try {
    const { recolectar } = require('../controllers/bitrixSesiones.controller');
    const [data, asesores] = await Promise.all([recolectar({ forzar }), asesoresPorNombre()]);
    const algunaFuente = Object.values(data?.fuentes || {}).some((f) => f && !f.error && f.usuarios);
    if (!algunaFuente) return null;
    return { ...contarConectados(data, asesores), generado: data.generado };
  } catch (e) {
    console.warn('[bolsaLeads] Bitrix Live no respondió; se entrega según el ciclo:', e.message);
    return null;
  }
};

module.exports = { conectadosPorEmpresa, contarConectados };
