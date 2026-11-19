/**
 * REPARTO DE GESTIONABLES — CONEXIÓN EN NOVONET ACCESS / VELSA ACCESS
 *
 * Condición adicional para recibir leads: el asesor debe estar CONECTADO en
 * NOVONET ACCESS (tabla control_asistencia, base bddgeneral). Conectado = su
 * última marcación de HOY es "INGRESO" o "INGRESO ALMUERZO". Sin marcación,
 * con "SALIDA ALMUERZO" (pausa) o con "SALIDA" → no recibe.
 *
 * El nombre del reparto (el de Bitrix) se cruza con el usuario del ERP por su
 * nombre completo, por el nombre vinculado en usuarios_bitrix y sin importar
 * tildes, mayúsculas ni el orden de las palabras.
 *
 * Si la consulta falla se usa el último estado bueno; si nunca hubo uno, NO se
 * filtra (igual que con Bitrix Live), para no frenar el reparto por una caída.
 * Se puede apagar con GESTIONABLES_EXIGIR_ACCESS=false.
 */
const db = require('../config/db');
const { claveNombre } = require('../services/asesorMatcher.service');
const { quitarRepeticionCompleta } = require('../services/usuarioBitrixIdentity.service');

const CONECTADO = new Set(['INGRESO', 'INGRESO ALMUERZO']);
const CACHE_MS = 30 * 1000;
const exigeAccess = () => String(process.env.GESTIONABLES_EXIGIR_ACCESS || 'true').toLowerCase() !== 'false';

// Misma persona aunque cambien tildes, mayúsculas u orden de nombres y apellidos
const claveAccess = (nombre) => quitarRepeticionCompleta(claveNombre(nombre)).sort().join(' ');

let cache = { ts: 0, data: null };
let ultimoBueno = null;

const consultar = async () => {
  const base = `
    WITH hoy AS (
      SELECT DISTINCT ON (ca.usuario_id)
             ca.usuario_id, ca.nombre_completo, UPPER(BTRIM(ca.actividad)) AS actividad,
             COALESCE(ca.fecha_hora, ca.created_at) AS momento
        FROM public.control_asistencia ca
       WHERE ca.fecha = (NOW() AT TIME ZONE 'America/Guayaquil')::date
       ORDER BY ca.usuario_id, COALESCE(ca.fecha_hora, ca.created_at) DESC, ca.id DESC
    )`;
  try {
    return (await db.query(`${base}
      SELECT h.*, CONCAT_WS(' ', u.nombres, u.apellidos) AS nombre_erp,
             (SELECT STRING_AGG(ub.bitrix_nombre, '|') FROM public.usuarios_bitrix ub WHERE ub.usuario_id = h.usuario_id) AS nombres_bitrix
        FROM hoy h LEFT JOIN public.usuarios u ON u.id = h.usuario_id`)).rows;
  } catch (e) {
    // Sin la tabla usuarios_bitrix: solo con los nombres del ERP
    if (!/usuarios_bitrix/.test(e.message)) throw e;
    return (await db.query(`${base}
      SELECT h.*, CONCAT_WS(' ', u.nombres, u.apellidos) AS nombre_erp, NULL AS nombres_bitrix
        FROM hoy h LEFT JOIN public.usuarios u ON u.id = h.usuario_id`)).rows;
  }
};

// { mapa: Map(clave → { conectado, actividad, momento }), generado, respaldo? } | null
const leerAccess = async ({ forzar = false } = {}) => {
  if (!exigeAccess()) return null;
  if (!forzar && cache.data && Date.now() - cache.ts < CACHE_MS) return cache.data;
  try {
    const rows = await consultar();
    const mapa = new Map();
    for (const r of rows) {
      const estado = { conectado: CONECTADO.has(r.actividad), actividad: r.actividad, momento: r.momento };
      const nombres = [r.nombre_completo, r.nombre_erp, ...String(r.nombres_bitrix || '').split('|')];
      for (const n of nombres) {
        const k = claveAccess(n);
        if (!k) continue;
        const prev = mapa.get(k);
        // Dos cuentas con el mismo nombre: manda la que esté conectada
        if (!prev || (!prev.conectado && estado.conectado)) mapa.set(k, estado);
      }
    }
    const data = { mapa, generado: new Date().toISOString() };
    cache = { ts: Date.now(), data };
    ultimoBueno = data;
    return data;
  } catch (e) {
    console.warn('[reparto] NOVONET ACCESS no respondió:', e.message);
    if (ultimoBueno) return { ...ultimoBueno, respaldo: true };
    return null;   // nunca hubo dato: no se filtra
  }
};

// Estado de un asesor (por su nombre de Bitrix). null = no se exige / sin dato
const estadoAccess = (access, nombre) => {
  if (!access) return null;
  return access.mapa.get(claveAccess(nombre)) || { conectado: false, actividad: null, momento: null };
};

module.exports = { leerAccess, estadoAccess, claveAccess, exigeAccess };
