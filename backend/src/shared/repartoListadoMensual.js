/**
 * REPARTO DE GESTIONABLES — LISTADO MENSUAL DESDE LA CARGA DE METAS
 *
 * Al confirmar la carga de metas de un mes (metasCarga.controller), los asesores
 * de esa empresa quedan cargados en el reparto (tabla *_gestionables_asesores)
 * desde HOY (o el día 1 si el mes es futuro) hasta el último día del mes, con
 * 0 permitidos y 50% ATC. Los supervisores suben los permitidos a mano.
 *
 * Nunca borra ni modifica filas: si un asesor ya tiene ese día cargado (con
 * cualquier escritura del nombre), se respeta lo que haya.
 */
const poolErp = require('../config/dbErp');
const { EMPRESAS } = require('./repartoEmpresas');
const { normalizarNombre } = require('./repartoGestionables');

const ATC_INICIAL = 50;
const hoyEcuador = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guayaquil' }).format(new Date());

// Días (AAAA-MM-DD) que faltan del mes, desde hoy o desde el día 1 si el mes aún no empieza
function diasRestantes(anio, mes, hoy = hoyEcuador()) {
  const pad = (n) => String(n).padStart(2, '0');
  const ultimo = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  const dias = [];
  for (let d = 1; d <= ultimo; d++) {
    const f = `${anio}-${pad(mes)}-${pad(d)}`;
    if (f >= hoy) dias.push(f);
  }
  return dias;
}

async function cargarListadoReparto({ empresa, anio, mes, nombres, hoy, db = poolErp }) {
  const E = EMPRESAS[String(empresa || '').toLowerCase()];
  if (!E) return { omitido: `La empresa ${empresa} no tiene reparto de gestionables` };
  const T = E.tablas.asesores;

  // Un nombre por persona (sin repetir mayúsculas/tildes/espacios)
  const unicos = new Map();
  for (const n of nombres || []) {
    const limpio = String(n || '').replace(/\s+/g, ' ').trim();
    const k = normalizarNombre(limpio);
    if (k && !unicos.has(k)) unicos.set(k, limpio);
  }
  const dias = diasRestantes(Number(anio), Number(mes), hoy);
  if (!unicos.size || !dias.length) return { empresa: E.clave, asesores: unicos.size, dias: dias.length, insertados: 0, ya_existian: 0 };

  // Lo que ya está cargado esos días (con cualquier escritura del nombre) no se toca
  const { rows } = await db.query(
    `SELECT nombre_bitrix_asesor, fecha_carga::text AS fecha FROM ${T} WHERE fecha_carga BETWEEN $1 AND $2`,
    [dias[0], dias[dias.length - 1]]
  );
  const existe = new Set(rows.map((r) => `${r.fecha}|${normalizarNombre(r.nombre_bitrix_asesor)}`));
  // Si el asesor ya estuvo en el reparto, se usa la misma escritura de su nombre
  const previos = await db.query(
    `SELECT DISTINCT ON (UPPER(nombre_bitrix_asesor)) nombre_bitrix_asesor
       FROM ${T} WHERE fecha_carga >= $1::date - 60 ORDER BY UPPER(nombre_bitrix_asesor), fecha_carga DESC`,
    [dias[0]]
  );
  for (const r of previos.rows) {
    const k = normalizarNombre(r.nombre_bitrix_asesor);
    if (unicos.has(k)) unicos.set(k, r.nombre_bitrix_asesor);
  }
  const nom = [], fec = [];
  let yaExistian = 0;
  for (const f of dias) {
    for (const [k, n] of unicos) {
      if (existe.has(`${f}|${k}`)) { yaExistian += 1; continue; }
      nom.push(n); fec.push(f);
    }
  }
  if (!nom.length) return { empresa: E.clave, asesores: unicos.size, dias: dias.length, insertados: 0, ya_existian: yaExistian };

  // La carga por TXT usa IDs manuales: se alinea la secuencia para no chocar con ellos
  const seq = (await db.query('SELECT pg_get_serial_sequence($1, $2) AS s', [T, 'id'])).rows[0]?.s;
  if (seq && /^[\w."]+$/.test(seq)) {
    await db.query(`SELECT setval($1, GREATEST((SELECT COALESCE(MAX(id), 1) FROM ${T}), (SELECT last_value FROM ${seq})))`, [seq]);
  }
  const ins = await db.query(
    `INSERT INTO ${T} (nombre_bitrix_asesor, gestionables_permitidos, fecha_carga, porcentaje_atc_max)
     SELECT n, 0, f::date, $3 FROM unnest($1::text[], $2::text[]) AS x(n, f)
     ON CONFLICT DO NOTHING`,
    [nom, fec, ATC_INICIAL]
  );
  return { empresa: E.clave, asesores: unicos.size, dias: dias.length, desde: dias[0], hasta: dias[dias.length - 1],
    insertados: ins.rowCount, ya_existian: yaExistian };
}

module.exports = { cargarListadoReparto, diasRestantes };
