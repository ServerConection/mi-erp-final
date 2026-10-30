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

// Regla de efectividad: cada lead tiene 3 horas desde que se le entregó al
// asesor para pasar a "Venta Subida". Meta = 30% de sus gestionables del día,
// redondeado SIEMPRE hacia arriba (7 → 2,1 → 3; 5 → 1,5 → 2).
// Deja de recibir si ya tiene tantos leads vencidos (+3 h sin subir) como su
// meta Y todavía no llega a la meta de Ventas Subidas. Si cubre la meta, sigue
// recibiendo aunque tenga leads vencidos.
// Plazo por empresa (Novonet 3 h, Velsa 8 h) en shared/repartoEmpresas.js
const PLAZO_VENTA_HORAS = Number(process.env.GESTIONABLES_PLAZO_VENTA_HORAS) || 3;
const plazoVentaHoras = (empresa) => getEmpresa(empresa).plazoVentaHoras || PLAZO_VENTA_HORAS;
const PCT_SIN_VENTA_MAX = Number(process.env.GESTIONABLES_PCT_SIN_VENTA) || 30;
const normEtapa = (etapa) => String(etapa || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/_/g, ' ').trim().replace(/\s+/g, ' ').toUpperCase();
const esVentaSubida = (etapa) => normEtapa(etapa) === 'VENTA SUBIDA';
// Etapas que NO cuentan en el total de leads del asesor (se muestran aparte
// para detectar si alguien mueve leads ahí para seguir recibiendo).
const ETAPAS_FUERA_DEL_TOTAL = new Set(['DUPLICADO', 'DUPLLICADO', 'REGULARIZACION', 'REMARKETING']);
const esEtapaFueraDelTotal = (etapa) => ETAPAS_FUERA_DEL_TOTAL.has(normEtapa(etapa));
const metaVentaSubida = (gestionables, pct = PCT_SIN_VENTA_MAX) =>
  Math.ceil(Math.round((Number(gestionables) || 0) * pct) / 100);
const bloqueadoPorEfectividad = ({ gestionables, vencidos, venta = 0, pct = PCT_SIN_VENTA_MAX }) => {
  const meta = metaVentaSubida(gestionables, pct);
  if (!meta || !vencidos) return false;
  if ((Number(venta) || 0) >= meta) return false;   // cubrió su 30%: habilitado
  return vencidos >= meta;
};

// ¿La etapa es ATC? (ATC, ATC/SOPORTE, ATC SOPORTE, atc…)
const esEtapaAtc = (etapa) => /^ATC([ /-]?SOPORTE)?$/.test(
  String(etapa || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toUpperCase()
);

/**
 * ¿Bloqueado por ATC? El tope de ATC es un % de sus PERMITIDOS del día
 * (10 permitidos y 50% → máximo 5 ATC). Al llegar al tope no recibe más.
 * 100 = sin límite.
 */
// El % de ATC lo define SISTEMAS en código (no se edita desde el panel).
const ATC_MAX_PCT = Number(process.env.GESTIONABLES_ATC_MAX_PCT) || 50;
const topeAtc = ({ permitidos, maxPct = ATC_MAX_PCT }) => {
  const max = Number.isInteger(maxPct) ? maxPct : ATC_MAX_PCT;
  if (max >= 100) return null;
  return (Number(permitidos) || 0) * max / 100;
};
const bloqueadoPorAtc = ({ permitidos, atc, maxPct = ATC_MAX_PCT }) => {
  const tope = topeAtc({ permitidos, maxPct });
  if (tope === null || !permitidos) return false;
  return (Number(atc) || 0) >= tope;
};

const conteoGestionablesHoy = async (erpDb, empresa) => {
  const E = getEmpresa(empresa);
  const asig = await erpDb.query(
    `SELECT asesor_asignado, bitrix_deal_id, creado_en, origen FROM ${E.tablas.asignaciones}
      WHERE fecha = ${HOY_EC} AND vigente`
  );
  const m = new Map();
  if (!asig.rows.length) return m;
  const ids = [...new Set(asig.rows.map((r) => String(r.bitrix_deal_id)))];
  const etapas = new Map();
  const sinConteo = new Set();   // deals de orígenes que se reparten pero no cuentan
  const origenesSinConteo = new Set((E.origenesSinConteo || []).map(normalizarNombre));
  try {
    const r = await db.query(
      `SELECT bitrix_id::text AS id, COALESCE(NULLIF(BTRIM(etapa_bitrix), ''), REPLACE(etapa, '_', ' ')) AS etapa,
              source
         FROM public.bitrix_webhook_leads
        WHERE empresa = $2 AND bitrix_id::text = ANY($1::text[])`,
      [ids, E.clave]
    );
    r.rows.forEach((x) => {
      etapas.set(x.id, x.etapa);
      if (origenesSinConteo.has(normalizarNombre(x.source))) sinConteo.add(x.id);
    });
  } catch (e) {
    console.error('[gestionables] No se pudo leer la etapa de los leads (se cuenta todo como consumido):', e.message);
    return null;
  }
  for (const a of asig.rows) {
    const k = normalizarNombre(a.asesor_asignado);
    const x = m.get(k) || { total: 0, gestionables: 0, atc: 0, venta: 0, vencidos: 0, sin_conteo: 0, sin_conteo_humano: 0, dup_reg_rmk: 0, dup_reg_rmk_humano: 0 };
    // Origen "FB Messenger - Novo" (y otros configurados): se entregó en orden,
    // pero no suma al total de leads, ni ATC, ni gestionables, ni efectividad.
    if (sinConteo.has(String(a.bitrix_deal_id))) {
      x.sin_conteo += 1;
      if (a.origen === 'humano') x.sin_conteo_humano += 1;
      m.set(k, x);
      continue;
    }
    const etapa = etapas.get(String(a.bitrix_deal_id));
    // Duplicado / Regularización / Remarketing: no suman al total de leads (cupo)
    if (etapa && esEtapaFueraDelTotal(etapa)) {
      x.dup_reg_rmk += 1;
      if (a.origen === 'humano') x.dup_reg_rmk_humano += 1;
      m.set(k, x);
      continue;
    }
    x.total += 1;
    const gestionable = !etapa || esEtapaGestionable(etapa);
    if (gestionable) x.gestionables += 1;
    if (etapa && esEtapaAtc(etapa)) x.atc += 1;
    if (etapa && esVentaSubida(etapa)) x.venta += 1;
    // Gestionable con más de 3 h desde la entrega y todavía sin Venta Subida
    else if (gestionable && a.creado_en && Date.now() - new Date(a.creado_en).getTime() >= plazoVentaHoras(empresa) * 3600 * 1000) x.vencidos += 1;
    m.set(k, x);
  }
  return m;
};

module.exports = { conteoGestionablesHoy, esEtapaAtc, bloqueadoPorAtc, topeAtc, esVentaSubida, esEtapaFueraDelTotal, ATC_MAX_PCT, bloqueadoPorEfectividad, metaVentaSubida, PLAZO_VENTA_HORAS, plazoVentaHoras, PCT_SIN_VENTA_MAX };
