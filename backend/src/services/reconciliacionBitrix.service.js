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
const cargarEtapas = async (llamarBitrix) => {
  const mapa = {};
  const cats = (await llamarBitrix('crm.dealcategory.list')).result || [];
  for (const c of [{ ID: 0 }, ...cats]) {
    try {
      const st = (await llamarBitrix('crm.dealcategory.stage.list', { id: c.ID })).result || [];
      st.forEach((s) => { mapa[s.STATUS_ID] = s.NAME; });
      await sleep(400); // rate limit Bitrix (2 req/s)
    } catch (_) { /* categoría sin etapas */ }
  }
  return mapa;
};

// Ruta ligera para módulos que pertenecen a un único pipeline. Evita recorrer
// el catálogo completo de categorías en cada refresh (Semillero = categoría 41).
const cargarEtapasCategoria = async (llamarBitrix, categoria) => {
  const mapa = {};
  const etapas = (await llamarBitrix('crm.dealcategory.stage.list', { id: categoria })).result || [];
  etapas.forEach((etapa) => { mapa[etapa.STATUS_ID] = etapa.NAME; });
  return mapa;
};

// Catálogo SOURCE_ID (ej. "33") → nombre visible del origen
// (ej. "BASE API 593963463480"). El webhook guarda el NOMBRE, así que la
// reconciliación debe escribir lo mismo o Redes no lo reconoce.
const cargarOrigenes = async (llamarBitrix) => {
  const mapa = {};
  const r = (await llamarBitrix('crm.status.list', { filter: { ENTITY_ID: 'SOURCE' } })).result || [];
  r.forEach((s) => { mapa[s.STATUS_ID] = s.NAME; });
  return mapa;
};

const cargarUsuarios = async (llamarBitrix) => {
  const mapa = {};
  let start = 0;
  do {
    const r = await llamarBitrix('user.get', { ACTIVE: true, start });
    (r.result || []).forEach((u) => {
      mapa[String(u.ID)] = [u.NAME, u.LAST_NAME].filter(Boolean).join(' ').trim() || `ID-${u.ID}`;
    });
    start = r.next ?? null;
    if (start != null) await sleep(400);
  } while (start != null);
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

const listarDeals = async (llamarBitrix, filter, onProgreso, { cursorRapido = false } = {}) => {
  const select = ['ID', 'TITLE', 'STAGE_ID', 'CATEGORY_ID', 'SOURCE_ID',
    'ASSIGNED_BY_ID', 'DATE_CREATE', 'DATE_MODIFY', 'IS_REPEATED_APPROACH'];
  if (cursorRapido) {
    const selectLigero = ['ID', 'STAGE_ID', 'CATEGORY_ID', 'DATE_CREATE', 'DATE_MODIFY'];
    let todos = [];
    let ultimoId = 0;
    for (let pagina = 0; pagina < 400; pagina++) {
      const json = await llamarBitrix('crm.deal.list', {
        filter: { ...filter, '>ID': ultimoId },
        select: selectLigero,
        order: { ID: 'ASC' },
        start: -1,
      });
      const lote = json.result || [];
      todos = todos.concat(lote);
      if (onProgreso) onProgreso(todos.length);
      if (lote.length < 50) break;
      ultimoId = Math.max(...lote.map((deal) => Number(deal.ID) || 0));
      await sleep(550);
    }
    return todos;
  }
  let todos = [], start = 0, page = 0;
  while (page < 400) {
    const json = await llamarBitrix('crm.deal.list', { filter, select, order: { ID: 'ASC' }, start });
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
  categoria = null,
  filtrarPorCategoria = false,
  campoFecha = 'DATE_MODIFY',
  soloEtapas = false,
  depurarCategoria = false,
  cursorRapido = false,
} = {}) => {
  const hoy = new Date();
  const _desde = desde || new Date(hoy.getTime() - 7 * 864e5).toISOString().slice(0, 10);
  const _hasta = hasta || new Date(hoy.getTime() + 864e5).toISOString().slice(0, 10);

  const esVelsa = String(empresa).toLowerCase() === 'velsa';
  // NOVONET y VELSA viven en el mismo portal Bitrix. La separación no se hace
  // por credencial/cuenta, sino por pipeline: Novonet=19 y Velsa=51.
  const llamarBitrix = bitrixCallNovonet;
  const categoriaObjetivo = categoria ?? (esVelsa
    ? (process.env.RECONCILIACION_BITRIX_CATEGORIA_VELSA || '51')
    : (process.env.RECONCILIACION_BITRIX_CATEGORIA || '19'));
  // Secuencial para respetar el límite de 2 solicitudes por segundo de Bitrix.
  const stageName = filtrarPorCategoria
    ? await cargarEtapasCategoria(llamarBitrix, categoriaObjetivo)
    : await cargarEtapas(llamarBitrix);
  // Para cuadrar el Kanban solo se necesitan ID, etapa y categoría. Conservar
  // origen y responsable locales evita llamadas extra y no altera esos campos.
  const sourceName = soloEtapas ? {} : await cargarOrigenes(llamarBitrix);
  const userName = soloEtapas ? {} : await cargarUsuarios(llamarBitrix);

  const campoFechaSeguro = campoFecha === 'DATE_CREATE' ? 'DATE_CREATE' : 'DATE_MODIFY';
  const valorDesde = campoFechaSeguro === 'DATE_CREATE' ? `${_desde}T00:00:00-05:00` : _desde;
  const valorHasta = campoFechaSeguro === 'DATE_CREATE' ? `${_hasta}T23:59:59-05:00` : _hasta;
  const filter = soloId
    ? { ID: soloId }
    : {
        [`>=${campoFechaSeguro}`]: valorDesde,
        [`<=${campoFechaSeguro}`]: valorHasta,
        ...(filtrarPorCategoria ? { CATEGORY_ID: categoriaObjetivo } : {}),
      };
  // OJO: se traen deals de TODAS las categorías para detectar los que salieron
  // de la 19; solo se INSERTAN los faltantes que sí son de la 19.
  const enCategoria = (d) => categoriaObjetivo === '' || categoriaObjetivo == null || String(d.CATEGORY_ID) === String(categoriaObjetivo);
  await asegurarColumnaCategoria();

  const deals = await listarDeals(llamarBitrix, filter, (n) => {
    if (n % 200 === 0) log(`   📦 ${n} deals traídos de Bitrix...`);
  }, { cursorRapido });

  if (!deals.length) {
    return { deals: 0, faltantes: [], desfasados: [], escritos: 0, errores: 0, aplicar };
  }

  const ids = deals.map((d) => String(d.ID));
  const { rows } = await pool.query(
    `SELECT bitrix_id, etapa, source, categoria_id, responsible,
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
    const origen = soloEtapas ? '' : (sourceName[d.SOURCE_ID] || d.SOURCE_ID || '');
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
      || (userName[String(d.ASSIGNED_BY_ID)] && fila.responsible !== userName[String(d.ASSIGNED_BY_ID)])
      || String(fila.categoria_id || '') !== String(d.CATEGORY_ID)
      || (fechaBx && fila.fecha !== fechaBx)) {
      desfasados.push({ d, etapa, origen, etapaTabla: fila.etapa, origenTabla: fila.source, cambioEtapa: fila.etapa !== etapa });
    }
  }

  if (!aplicar) {
    return { deals: deals.length, faltantes, desfasados, escritos: 0, errores: 0, aplicar };
  }

  let escritos = 0, errores = 0;
  const cambios = [...faltantes, ...desfasados];

  if (soloEtapas && cambios.length > 0) {
    const ejecutado = new Date().toISOString();
    const payload = cambios.map(({ d, etapa, cambioEtapa = true }) => ({
      bitrix_id: String(d.ID),
      etapa,
      etapa_bitrix: String(stageName[d.STAGE_ID] || d.STAGE_ID || '').toUpperCase(),
      fecha: d.DATE_CREATE || null,
      categoria_id: String(d.CATEGORY_ID ?? ''),
      cambio_etapa: cambioEtapa,
      raw_query: {
        origen: 'reconciliacion', ejecutado,
        stage_id: d.STAGE_ID, category_id: d.CATEGORY_ID, date_modify: d.DATE_MODIFY,
      },
    }));
    try {
      await pool.transaction(async (client) => {
        await client.query(
          `WITH cambios AS (
             SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(
               bitrix_id text, etapa text, etapa_bitrix text, fecha timestamptz,
               categoria_id text, cambio_etapa boolean, raw_query jsonb
             )
           )
           INSERT INTO bitrix_webhook_leads
             (bitrix_id, empresa, etapa, event, etapa_bitrix, raw_query, created_at, categoria_id, pipeline)
           SELECT bitrix_id, $2::text, etapa, LOWER($2::text) || '_sync', etapa_bitrix, raw_query,
                  COALESCE(fecha, NOW()), $3,
                  UPPER($2::text)
             FROM cambios
           ON CONFLICT (empresa, bitrix_id) DO UPDATE
             SET etapa = EXCLUDED.etapa,
                 etapa_bitrix = EXCLUDED.etapa_bitrix,
                 categoria_id = EXCLUDED.categoria_id,
                 pipeline = UPPER(EXCLUDED.empresa),
                 created_at = EXCLUDED.created_at,
                 raw_query = EXCLUDED.raw_query,
                 updated_at = NOW()`,
          [JSON.stringify(payload), empresa, String(categoriaObjetivo)]
        );
        await client.query(
          `WITH cambios AS (
             SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(
               bitrix_id text, etapa text, etapa_bitrix text, fecha timestamptz,
               categoria_id text, cambio_etapa boolean, raw_query jsonb
             )
           )
           INSERT INTO bitrix_webhook_leads_historial
             (bitrix_id, empresa, etapa, event, etapa_bitrix, raw_query)
           SELECT bitrix_id, $2, etapa, 'reconciliacion', etapa_bitrix, raw_query
             FROM cambios
            WHERE cambio_etapa`,
          [JSON.stringify(payload), empresa]
        );
      });
      escritos = cambios.length;
    } catch (e) {
      errores = cambios.length;
      log(`   Error en actualización masiva de ${empresa}: ${e.message}`);
    }
  } else for (const { d, etapa, origen, cambioEtapa = true } of cambios) {
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
           (bitrix_id, empresa, etapa, event, etapa_bitrix, source, repeated, iniciado_el, raw_query, created_at, categoria_id, responsible)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, COALESCE($8::timestamptz, NOW()), $10, $11)
         ON CONFLICT (empresa, bitrix_id) DO UPDATE
           SET etapa = EXCLUDED.etapa,
               etapa_bitrix = EXCLUDED.etapa_bitrix,
               source = COALESCE(NULLIF(BTRIM(EXCLUDED.source), ''), bitrix_webhook_leads.source),
               categoria_id = EXCLUDED.categoria_id,
               responsible = COALESCE(NULLIF(BTRIM(EXCLUDED.responsible), ''), bitrix_webhook_leads.responsible),
               created_at = COALESCE($8::timestamptz, bitrix_webhook_leads.created_at),
               raw_query = EXCLUDED.raw_query,
               updated_at = NOW()`,
        [id, empresa, etapa, 'reconciliacion', etapaBitrix,
         origen, d.IS_REPEATED_APPROACH === 'Y' ? 'Y' : 'N',
         d.DATE_CREATE || null, raw, String(d.CATEGORY_ID ?? ''), userName[String(d.ASSIGNED_BY_ID)] || null]
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

  // Cuando Bitrix entregó correctamente una categoría completa, las filas
  // locales del mismo período que no aparecen en esa lista ya no pertenecen
  // al pipeline. Se marcan fuera en lugar de borrarlas para conservar historial.
  if (depurarCategoria && filtrarPorCategoria && !soloId && errores === 0) {
    const idsCategoria = deals.map((deal) => String(deal.ID));
    await pool.query(
      `UPDATE bitrix_webhook_leads
          SET categoria_id = $4,
              pipeline = 'FUERA_' || UPPER(empresa),
              updated_at = NOW()
        WHERE empresa = $1
          AND created_at >= $2::date
          AND created_at < ($3::date + INTERVAL '1 day')
          AND NOT (bitrix_id = ANY($5::text[]))`,
      [empresa, _desde, _hasta, `FUERA_${categoriaObjetivo}`, idsCategoria]
    );
  }

  return { deals: deals.length, faltantes, desfasados, escritos, errores, aplicar };
};

module.exports = { reconciliarLeads, slugify, asegurarColumnaCategoria };
