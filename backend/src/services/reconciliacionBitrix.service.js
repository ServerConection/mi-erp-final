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

// Catálogo SOURCE_ID (ej. "33") → nombre visible del origen
// (ej. "BASE API 593963463480"). El webhook guarda el NOMBRE, así que la
// reconciliación debe escribir lo mismo o Redes no lo reconoce.
const cargarOrigenes = async () => {
  const mapa = {};
  const r = (await bitrixCallNovonet('crm.status.list', { filter: { ENTITY_ID: 'SOURCE' } })).result || [];
  r.forEach((s) => { mapa[s.STATUS_ID] = s.NAME; });
  return mapa;
};

const normOrigen = (v) => String(v || '').trim().replace(/\s+/g, ' ').toUpperCase();

// Columna con la categoría (embudo) real del deal en Bitrix. Si un deal se
// mueve fuera de la 19 (ej. a la 15), Redes debe dejar de contarlo; no se
// borra la fila porque otros módulos pueden necesitar su recorrido.
let columnaCategoriaLista = false;
const asegurarColumnaCategoria = async () => {
  if (columnaCategoriaLista) return;
  await pool.query('ALTER TABLE bitrix_webhook_leads ADD COLUMN IF NOT EXISTS categoria_id text');
  columnaCategoriaLista = true;
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
  // Solo el embudo de Redes (categoría 19). Sin esto se meterían deals de
  // otros embudos a bitrix_webhook_leads e inflarían los totales.
  categoria = process.env.RECONCILIACION_BITRIX_CATEGORIA ?? '19',
} = {}) => {
  const hoy = new Date();
  const _desde = desde || new Date(hoy.getTime() - 7 * 864e5).toISOString().slice(0, 10);
  const _hasta = hasta || new Date(hoy.getTime() + 864e5).toISOString().slice(0, 10);

  const stageName = await cargarEtapas();
  const sourceName = await cargarOrigenes();

  const filter = soloId
    ? { ID: soloId }
    : { '>=DATE_MODIFY': _desde, '<=DATE_MODIFY': _hasta };
  // OJO: se traen deals de TODAS las categorías para detectar los que salieron
  // de la 19; solo se INSERTAN los faltantes que sí son de la 19.
  const enCategoria = (d) => categoria === '' || categoria == null || String(d.CATEGORY_ID) === String(categoria);
  await asegurarColumnaCategoria();

  const deals = await listarDeals(filter, (n) => {
    if (n % 200 === 0) log(`   📦 ${n} deals traídos de Bitrix...`);
  });

  if (!deals.length) {
    return { deals: 0, faltantes: [], desfasados: [], escritos: 0, errores: 0, aplicar };
  }

  const ids = deals.map((d) => String(d.ID));
  const { rows } = await pool.query(
    `SELECT bitrix_id, etapa, source, categoria_id,
            (created_at AT TIME ZONE 'America/Guayaquil')::date::text AS fecha
       FROM bitrix_webhook_leads
      WHERE empresa = $1 AND bitrix_id = ANY($2::text[])`,
    [empresa, ids]
  );
  const enTabla = new Map(rows.map((r) => [String(r.bitrix_id), r]));

  // Desfasado = etapa distinta O origen distinto. El origen puede cambiar en
  // Bitrix sin que se mueva la etapa (ej. Wazzup reasigna la línea) y el
  // webhook de etapas nunca se entera: así se descuadraba Redes vs Bitrix.
  const faltantes = [], desfasados = [];
  for (const d of deals) {
    const id = String(d.ID);
    const etapa = slugify(stageName[d.STAGE_ID] || d.STAGE_ID || '');
    const origen = sourceName[d.SOURCE_ID] || d.SOURCE_ID || '';
    const fila = enTabla.get(id);
    // Fecha real de creación en Bitrix (día en Ecuador). El webhook guarda
    // created_at = cuando LLEGÓ el primer evento: un deal de enero que se
    // movió en septiembre quedaba contado en septiembre.
    const fechaBx = d.DATE_CREATE
      ? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guayaquil' }).format(new Date(d.DATE_CREATE))
      : null;
    if (!fila) { if (enCategoria(d)) faltantes.push({ d, etapa, origen }); }
    else if (fila.etapa !== etapa
      || (origen && normOrigen(fila.source) !== normOrigen(origen))
      || String(fila.categoria_id || '') !== String(d.CATEGORY_ID)
      || (fechaBx && fila.fecha !== fechaBx)) {
      desfasados.push({ d, etapa, origen, etapaTabla: fila.etapa, origenTabla: fila.source, cambioEtapa: fila.etapa !== etapa });
    }
  }

  if (!aplicar) {
    return { deals: deals.length, faltantes, desfasados, escritos: 0, errores: 0, aplicar };
  }

  let escritos = 0, errores = 0;
  for (const { d, etapa, origen, cambioEtapa = true } of [...faltantes, ...desfasados]) {
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
           (bitrix_id, empresa, etapa, event, etapa_bitrix, source, repeated, iniciado_el, raw_query, created_at, categoria_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, COALESCE($8::timestamptz, NOW()), $10)
         ON CONFLICT (empresa, bitrix_id) DO UPDATE
           SET etapa = EXCLUDED.etapa,
               etapa_bitrix = EXCLUDED.etapa_bitrix,
               source = COALESCE(NULLIF(BTRIM(EXCLUDED.source), ''), bitrix_webhook_leads.source),
               categoria_id = EXCLUDED.categoria_id,
               created_at = COALESCE($8::timestamptz, bitrix_webhook_leads.created_at),
               raw_query = EXCLUDED.raw_query,
               updated_at = NOW()`,
        [id, empresa, etapa, 'reconciliacion', etapaBitrix,
         origen, d.IS_REPEATED_APPROACH === 'Y' ? 'Y' : 'N',
         d.DATE_CREATE || null, raw, String(d.CATEGORY_ID ?? '')]
      );
      // Historial solo si cambió la etapa: un cambio de origen no es un paso
      // del recorrido y ensuciaría el historial.
      if (cambioEtapa) await pool.query(
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

module.exports = { reconciliarLeads, slugify, asegurarColumnaCategoria };
