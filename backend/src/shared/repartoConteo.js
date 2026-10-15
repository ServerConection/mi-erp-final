/**
 * CUPO DEL REPARTO = GESTIONABLES (no el total entregado).
 *
 * Para cada asesor, de los leads que recibió HOY (bot + humano, vigentes):
 *   - total:        cuántos se le entregaron
 *   - gestionables: cuántos siguen en una etapa gestionable (regla única de
 *                   shared/etapas.js; ATC, Duplicado, Fuera de cobertura, etc.
 *                   NO cuentan)
 * El permitido se compara contra `gestionables`: si un lead pasa a ATC, le
 * libera el cupo al asesor.
 *
 * La etapa actual sale de bitrix_webhook_leads (bddgeneral), que se actualiza
 * con cada cambio de etapa. Un lead sin registro de etapa todavía está en
 * Contacto nuevo → cuenta como gestionable. Si esa consulta falla se devuelve
 * null y quien llama cuenta TODO como consumido (lo más conservador).
 */
const db = require('../config/db');
const { esEtapaGestionable } = require('./etapas');
const { normalizarNombre } = require('./repartoGestionables');
const { getEmpresa } = require('./repartoEmpresas');

const HOY_EC = `(NOW() AT TIME ZONE 'America/Guayaquil')::date`;

// ¿La etapa es ATC? (ATC, ATC/SOPORTE, ATC SOPORTE, atc…)
const esEtapaAtc = (etapa) => /^ATC([ /-]?SOPORTE)?$/.test(
  String(etapa || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toUpperCase()
);

/**
 * ¿Bloqueado por ATC? El tope de ATC es un % de sus PERMITIDOS del día
 * (10 permitidos y 50% → máximo 5 ATC). Al llegar al tope no recibe más.
 * 100 = sin límite.
 */
const topeAtc = ({ permitidos, maxPct }) => {
  const max = Number.isInteger(maxPct) ? maxPct : 50;
  if (max >= 100) return null;
  return (Number(permitidos) || 0) * max / 100;
};
const bloqueadoPorAtc = ({ permitidos, atc, maxPct }) => {
  const tope = topeAtc({ permitidos, maxPct });
  if (tope === null || !permitidos) return false;
  return (Number(atc) || 0) >= tope;
};

const conteoGestionablesHoy = async (erpDb, empresa) => {
  const E = getEmpresa(empresa);
  const asig = await erpDb.query(
    `SELECT asesor_asignado, bitrix_deal_id FROM ${E.tablas.asignaciones}
      WHERE fecha = ${HOY_EC} AND vigente`
  );
  const m = new Map();
  if (!asig.rows.length) return m;
  const ids = [...new Set(asig.rows.map((r) => String(r.bitrix_deal_id)))];
  const etapas = new Map();
  try {
    const r = await db.query(
      `SELECT bitrix_id::text AS id, COALESCE(NULLIF(BTRIM(etapa_bitrix), ''), REPLACE(etapa, '_', ' ')) AS etapa
         FROM public.bitrix_webhook_leads
        WHERE empresa = $2 AND bitrix_id::text = ANY($1::text[])`,
      [ids, E.clave]
    );
    r.rows.forEach((x) => etapas.set(x.id, x.etapa));
  } catch (e) {
    console.error('[gestionables] No se pudo leer la etapa de los leads (se cuenta todo como consumido):', e.message);
    return null;
  }
  for (const a of asig.rows) {
    const k = normalizarNombre(a.asesor_asignado);
    const x = m.get(k) || { total: 0, gestionables: 0, atc: 0 };
    const etapa = etapas.get(String(a.bitrix_deal_id));
    x.total += 1;
    if (!etapa || esEtapaGestionable(etapa)) x.gestionables += 1;
    if (etapa && esEtapaAtc(etapa)) x.atc += 1;
    m.set(k, x);
  }
  return m;
};

module.exports = { conteoGestionablesHoy, esEtapaAtc, bloqueadoPorAtc, topeAtc };
