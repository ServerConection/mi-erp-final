/**
 * RECONCILIACIÓN BITRIX ⇄ bitrix_webhook_leads
 * ---------------------------------------------------------------------------
 * POR QUÉ EXISTE (2026-09-01, caso deal 570189):
 *   bitrix_webhook_leads se alimenta ÚNICAMENTE del webhook de etapas
 *   (bitrix_webhook.php), que dispara desde las automatizaciones de Bitrix.
 *   Ese diseño no tiene red de seguridad: si el robot de la etapa no dispara,
 *   el evento no existe y el lead NUNCA entra a la tabla. No hay reintento,
 *   no hay error, no queda rastro — el lead simplemente no está.
 *
 *   Casos reales en que el robot no dispara:
 *     · el deal ya pasó antes por esa etapa (Bitrix no re-ejecuta el robot);
 *     · negociaciones repetidas / creadas por robot o por importación de base;
 *     · el deal se movió por REST o por otra automatización;
 *     · el backend estaba dormido o caído en ese instante (cold start Render);
 *     · alguien editó/duplicó la automatización y quedó sin el webhook.
 *
 *   Este servicio le PREGUNTA a Bitrix qué deals existen y rellena lo que
 *   falte. Es la fuente de verdad de respaldo: mientras corra programado,
 *   ningún lead puede quedar fuera de la tabla más de un ciclo.
 *
 * Es idempotente: correrlo N veces deja el mismo resultado.
 */

const pool = require('../config/db');
const { bitrixCallNovonet } = require('./bitrix.service');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Mismo slugify que bitrixWebhook.controller.js — la etapa DEBE quedar escrita
// igual que la que escribe el webhook o los reportes agrupan la misma etapa dos veces.
const slugify = (valor = '') =>
  String(valor)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .trim().toLowerCase()
    .replace(/[\/]+/g, ' ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

// Catálogo STAGE_ID (ej. "C5:UC_XXXX") → nombre visible de la etapa.
const cargarEtapas = async () => {
  const mapa = {};
  const cats = (await bitrixCallNovonet('crm.dealcategory.list')).result || [];
  for (const c of [{ ID: 0 }, ...cats]) {
    try {
      const st = (await bitrixCallNovonet('crm.dealcategory.stage.list', { id: c.ID })).result || [];
      st.forEach((s) => { mapa[s.STATUS_ID] = s.NAME; });
      await sleep(400); // rate limit Bitrix (2 req/s)
    } catch (_) { /* categoría sin etapas */ }
  }
  return mapa;
};

const listarDeals = async (filter, onProgreso) => {
  const select = ['ID', 'TITLE', 'STAGE_ID', 'CATEGORY_ID', 'SOURCE_ID',
    'ASSIGNED_BY_ID', 'DATE_CREATE', 'DATE_MODIFY', 'IS_REPEATED_APPROACH'];
  let todos = [], start = 0, page = 0;
  while (page < 400) {
    const json = await bitrixCallNovonet('crm.deal.list', { filter, select, order: { ID: 'ASC' }, start });
    const lote = json.result || [];
    todos = todos.concat(lote);
    if (onProgreso) onProgreso(todos.length);
    if (!json.next || lote.length < 50) break;
    start = json.next; page++;
    await sleep(700);
  }
  return todos;
};

/**
 * @param {object} o
 * @param {string} [o.empresa='novonet']
 * @param {string} [o.desde]      YYYY-MM-DD (por defecto: hace 7 días)
 * @param {string} [o.hasta]      YYYY-MM-DD (por defecto: mañana)
 * @param {string} [o.soloId]     reconciliar un único deal
 * @param {boolean}[o.aplicar]    false = dry-run (no escribe)
 * @param {function}[o.log]
 */
const reconciliarLeads = async ({
  empresa = 'novonet', desde, hasta, soloId = null, aplicar = false, log = console.log,
} = {}) => {
  const hoy = new Date();
  const _desde = desde || new Date(hoy.getTime() - 7 * 864e5).toISOString().slice(0, 10);
  const _hasta = hasta || new Date(hoy.getTime() + 864e5).toISOString().slice(0, 10);

  const stageName = await cargarEtapas();

  const filter = soloId
    ? { ID: soloId }
    : { '>=DATE_MODIFY': _desde, '<=DATE_MODIFY': _hasta };

  const deals = await listarDeals(filter, (n) => {
    if (n % 200 === 0) log(`   📦 ${n} deals traídos de Bitrix...`);
  });

  if (!deals.length) {
    return { deals: 0, faltantes: [], desfasados: [], escritos: 0, errores: 0, aplicar };
  }

  const ids = deals.map((d) => String(d.ID));
  const { rows } = await pool.query(
    `SELECT bitrix_id, etapa FROM bitrix_webhook_leads
      WHERE empresa = $1 AND bitrix_id = ANY($2::text[])`,
    [empresa, ids]
  );
  const enTabla = new Map(rows.map((r) => [String(r.bitrix_id), r.etapa]));

  const faltantes = [], desfasados = [];
  for (const d of deals) {
    const id = String(d.ID);
    const etapa = slugify(stageName[d.STAGE_ID] || d.STAGE_ID || '');
    if (!enTabla.has(id)) faltantes.push({ d, etapa });
    else if (enTabla.get(id) !== etapa) desfasados.push({ d, etapa, etapaTabla: enTabla.get(id) });
  }

  if (!aplicar) {
    return { deals: deals.length, faltantes, desfasados, escritos: 0, errores: 0, aplicar };
  }

  let escritos = 0, errores = 0;
  for (const { d, etapa } of [...faltantes, ...desfasados]) {
    const id = String(d.ID);
    const etapaBitrix = String(stageName[d.STAGE_ID] || d.STAGE_ID || '').toUpperCase();
    // raw_query marca el origen: así se distingue después qué fila entró por
    // reconciliación y cuál llegó realmente por webhook.
    const raw = JSON.stringify({
      origen: 'reconciliacion', ejecutado: new Date().toISOString(),
      stage_id: d.STAGE_ID, category_id: d.CATEGORY_ID, date_modify: d.DATE_MODIFY,
    });
    try {
      await pool.query(
        `INSERT INTO bitrix_webhook_leads
           (bitrix_id, empresa, etapa, event, etapa_bitrix, source, repeated, iniciado_el, raw_query)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (empresa, bitrix_id) DO UPDATE
           SET etapa = EXCLUDED.etapa,
               etapa_bitrix = EXCLUDED.etapa_bitrix,
               raw_query = EXCLUDED.raw_query,
               updated_at = NOW()`,
        [id, empresa, etapa, 'reconciliacion', etapaBitrix,
         d.SOURCE_ID || '', d.IS_REPEATED_APPROACH === 'Y' ? 'Y' : 'N',
         d.DATE_CREATE || null, raw]
      );
      await pool.query(
        `INSERT INTO bitrix_webhook_leads_historial
           (bitrix_id, empresa, etapa, event, etapa_bitrix, raw_query)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [id, empresa, etapa, 'reconciliacion', etapaBitrix, raw]
      );
      escritos++;
    } catch (e) {
      errores++;
      log(`   ✗ ${id}: ${e.message}`);
    }
  }

  return { deals: deals.length, faltantes, desfasados, escritos, errores, aplicar };
};

module.exports = { reconciliarLeads, slugify };
