/**
 * Backfill puntual del pipeline VELSA (categoría 51) en el Bitrix compartido.
 *
 * Ventana (America/Guayaquil):
 *   2026-10-01 00:00:00 hasta 2026-10-03 12:00:00, inclusive.
 *
 * Uso:
 *   node scripts/backfill_velsa_pipeline_51_oct_1_3_2026.js
 *   node scripts/backfill_velsa_pipeline_51_oct_1_3_2026.js --aplicar
 *
 * Sin --aplicar solo consulta Bitrix, compara contra el ERP y muestra LIMIT 10.
 * Con --aplicar hace UPSERT por ID; se puede ejecutar nuevamente sin duplicar.
 */

require('dotenv').config();

const pool = require('../src/config/db');

const CATEGORIA_VELSA = 51;
const DESDE = '2026-10-01T00:00:00-05:00';
const HASTA = '2026-10-03T12:00:00-05:00';
const APLICAR = process.argv.includes('--aplicar');
const WEBHOOK = String(
  process.env.BITRIX_NOVONET_URL ||
  process.env.NOVONET_WEBHOOK ||
  process.env.BITRIX_WEBHOOK ||
  ''
).replace(/\/+$/, '');

const esperar = ms => new Promise(resolve => setTimeout(resolve, ms));
const slugify = (valor = '') => String(valor)
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .trim().toLowerCase()
  .replace(/[\/]+/g, ' ')
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '');

async function llamarBitrix(metodo, parametros = {}) {
  if (!WEBHOOK) {
    throw new Error(
      'Falta BITRIX_NOVONET_URL (o NOVONET_WEBHOOK/BITRIX_WEBHOOK) para el Bitrix compartido.'
    );
  }

  const qs = new URLSearchParams();
  const agregar = (valor, prefijo = '') => {
    for (const [clave, dato] of Object.entries(valor)) {
      const nombre = prefijo ? `${prefijo}[${clave}]` : clave;
      if (Array.isArray(dato)) {
        dato.forEach((item, indice) => qs.append(`${nombre}[${indice}]`, item));
      } else if (dato && typeof dato === 'object') {
        agregar(dato, nombre);
      } else if (dato !== null && dato !== undefined) {
        qs.append(nombre, String(dato));
      }
    }
  };
  agregar(parametros);

  const respuesta = await fetch(`${WEBHOOK}/${metodo}.json?${qs.toString()}`);
  const json = await respuesta.json();
  if (!respuesta.ok || json.error) {
    throw new Error(
      `Bitrix [${metodo}]: ${json.error || respuesta.status} — ${json.error_description || respuesta.statusText}`
    );
  }
  return json;
}

async function listarTodo(metodo, parametros) {
  const filas = [];
  let start = 0;
  do {
    const pagina = await llamarBitrix(metodo, { ...parametros, start });
    filas.push(...(pagina.result || []));
    start = pagina.next ?? null;
    if (start !== null) await esperar(550);
  } while (start !== null);
  return filas;
}

async function cargarCatalogos() {
  // Secuencial para respetar el límite usual de 2 solicitudes/s de Bitrix.
  const categorias = await llamarBitrix('crm.dealcategory.list');
  await esperar(550);
  const etapas = await llamarBitrix('crm.dealcategory.stage.list', { id: CATEGORIA_VELSA });
  await esperar(550);
  const fuentes = await llamarBitrix('crm.status.list', { filter: { ENTITY_ID: 'SOURCE' } });
  await esperar(550);
  const usuarios = await listarTodo('user.get', {});

  const categoria = (categorias.result || []).find(c => Number(c.ID) === CATEGORIA_VELSA);
  if (!categoria) throw new Error('La categoría 51 no existe en el webhook configurado. No se modificó la base.');

  return {
    categoria,
    etapas: Object.fromEntries((etapas.result || []).map(e => [String(e.STATUS_ID), e.NAME])),
    fuentes: Object.fromEntries((fuentes.result || []).map(f => [String(f.STATUS_ID), f.NAME])),
    usuarios: Object.fromEntries((usuarios || []).map(u => [
      String(u.ID),
      [u.NAME, u.LAST_NAME].filter(Boolean).join(' ').trim() || `ID-${u.ID}`,
    ])),
  };
}

async function cargarDeals() {
  return listarTodo('crm.deal.list', {
    filter: {
      CATEGORY_ID: CATEGORIA_VELSA,
      '>=DATE_CREATE': DESDE,
      '<=DATE_CREATE': HASTA,
    },
    order: { DATE_CREATE: 'ASC', ID: 'ASC' },
    select: [
      'ID', 'TITLE', 'TYPE_ID', 'CATEGORY_ID', 'STAGE_ID', 'STAGE_SEMANTIC_ID',
      'ASSIGNED_BY_ID', 'CREATED_BY_ID', 'MODIFY_BY_ID', 'MOVED_BY_ID',
      'SOURCE_ID', 'SOURCE_DESCRIPTION', 'DATE_CREATE', 'DATE_MODIFY',
      'BEGINDATE', 'CLOSEDATE', 'MOVED_TIME', 'LAST_ACTIVITY_TIME',
      'CLOSED', 'OPENED', 'IS_NEW', 'IS_RECURRING', 'IS_RETURN_CUSTOMER',
      'IS_REPEATED_APPROACH', 'OPPORTUNITY', 'CURRENCY_ID', 'LEAD_ID',
      'COMPANY_ID', 'CONTACT_ID', 'COMMENTS', 'ADDITIONAL_INFO',
      'UTM_SOURCE', 'UTM_MEDIUM', 'UTM_CAMPAIGN', 'UTM_CONTENT', 'UTM_TERM',
    ],
  });
}

const entero = valor => (valor === '' || valor === null || valor === undefined ? null : Number(valor));

async function guardarDeal(client, deal, catalogos) {
  const etapa = catalogos.etapas[String(deal.STAGE_ID)] || deal.STAGE_ID || null;
  const responsable = catalogos.usuarios[String(deal.ASSIGNED_BY_ID)] ||
    (deal.ASSIGNED_BY_ID ? `ID-${deal.ASSIGNED_BY_ID}` : null);
  const fuente = catalogos.fuentes[String(deal.SOURCE_ID)] || deal.SOURCE_ID || null;

  await client.query(`
    INSERT INTO public.negociaciones_reporteria (
      id, titulo, tipo, etapa, moneda, monto, lead_id, empresa_id, contacto_id,
      fecha_inicio, fecha_cierre, responsable_id, creado_por_id, modificado_por_id,
      creado_en, modificado_en, abierto, cerrado, comentarios, info_adicional,
      categoria_id, etapa_nombre, es_nuevo, es_recurrente, es_cliente_recurrente,
      es_enfoque_repetido, fuente, descripcion_fuente, movido_por_id, tiempo_movido,
      tiempo_ultima_actividad, utm_source, utm_medium, utm_campaign, utm_content,
      utm_term, responsable_nombre, sincronizado_en
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,
      $10::timestamptz AT TIME ZONE 'America/Guayaquil',
      $11::timestamptz AT TIME ZONE 'America/Guayaquil',
      $12,$13,$14,
      $15::timestamptz AT TIME ZONE 'America/Guayaquil',
      $16::timestamptz AT TIME ZONE 'America/Guayaquil',
      $17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,
      $30::timestamptz AT TIME ZONE 'America/Guayaquil',
      $31::timestamptz AT TIME ZONE 'America/Guayaquil',
      $32,$33,$34,$35,$36,$37,NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      titulo = EXCLUDED.titulo,
      tipo = EXCLUDED.tipo,
      etapa = EXCLUDED.etapa,
      moneda = EXCLUDED.moneda,
      monto = EXCLUDED.monto,
      lead_id = EXCLUDED.lead_id,
      empresa_id = EXCLUDED.empresa_id,
      contacto_id = EXCLUDED.contacto_id,
      fecha_inicio = EXCLUDED.fecha_inicio,
      fecha_cierre = EXCLUDED.fecha_cierre,
      responsable_id = EXCLUDED.responsable_id,
      creado_por_id = EXCLUDED.creado_por_id,
      modificado_por_id = EXCLUDED.modificado_por_id,
      creado_en = EXCLUDED.creado_en,
      modificado_en = EXCLUDED.modificado_en,
      abierto = EXCLUDED.abierto,
      cerrado = EXCLUDED.cerrado,
      comentarios = EXCLUDED.comentarios,
      info_adicional = EXCLUDED.info_adicional,
      categoria_id = EXCLUDED.categoria_id,
      etapa_nombre = EXCLUDED.etapa_nombre,
      es_nuevo = EXCLUDED.es_nuevo,
      es_recurrente = EXCLUDED.es_recurrente,
      es_cliente_recurrente = EXCLUDED.es_cliente_recurrente,
      es_enfoque_repetido = EXCLUDED.es_enfoque_repetido,
      fuente = EXCLUDED.fuente,
      descripcion_fuente = EXCLUDED.descripcion_fuente,
      movido_por_id = EXCLUDED.movido_por_id,
      tiempo_movido = EXCLUDED.tiempo_movido,
      tiempo_ultima_actividad = EXCLUDED.tiempo_ultima_actividad,
      utm_source = EXCLUDED.utm_source,
      utm_medium = EXCLUDED.utm_medium,
      utm_campaign = EXCLUDED.utm_campaign,
      utm_content = EXCLUDED.utm_content,
      utm_term = EXCLUDED.utm_term,
      responsable_nombre = EXCLUDED.responsable_nombre,
      sincronizado_en = NOW()
  `, [
    Number(deal.ID), deal.TITLE || '', deal.TYPE_ID || 'SALE', etapa,
    deal.CURRENCY_ID || 'USD', Number(deal.OPPORTUNITY || 0), entero(deal.LEAD_ID),
    entero(deal.COMPANY_ID), entero(deal.CONTACT_ID), deal.BEGINDATE || null,
    deal.CLOSEDATE || null, entero(deal.ASSIGNED_BY_ID), entero(deal.CREATED_BY_ID),
    entero(deal.MODIFY_BY_ID), deal.DATE_CREATE || null, deal.DATE_MODIFY || null,
    deal.OPENED || null, deal.CLOSED || null, deal.COMMENTS || null,
    deal.ADDITIONAL_INFO || null, CATEGORIA_VELSA, deal.STAGE_SEMANTIC_ID || null,
    deal.IS_NEW || null, deal.IS_RECURRING || null, deal.IS_RETURN_CUSTOMER || null,
    deal.IS_REPEATED_APPROACH || null, fuente, deal.SOURCE_DESCRIPTION || null,
    entero(deal.MOVED_BY_ID), deal.MOVED_TIME || null, deal.LAST_ACTIVITY_TIME || null,
    deal.UTM_SOURCE || null, deal.UTM_MEDIUM || null, deal.UTM_CAMPAIGN || null,
    deal.UTM_CONTENT || null, deal.UTM_TERM || null, responsable,
  ]);
}

// "Detalle base Jotform" nace de envios_ventas y obtiene sus columnas Bitrix
// mediante este estado actual. No depende de mv_indicadores_velsa_completo.
async function guardarEstadoWebhook(client, deal, catalogos) {
  const etapaVisible = catalogos.etapas[String(deal.STAGE_ID)] || deal.STAGE_ID || '';
  const responsable = catalogos.usuarios[String(deal.ASSIGNED_BY_ID)] ||
    (deal.ASSIGNED_BY_ID ? `ID-${deal.ASSIGNED_BY_ID}` : null);
  const fuente = catalogos.fuentes[String(deal.SOURCE_ID)] || deal.SOURCE_ID || null;
  const raw = JSON.stringify({
    origen: 'backfill_velsa_pipeline_51_oct_1_3_2026',
    ejecutado: new Date().toISOString(),
    stage_id: deal.STAGE_ID,
    category_id: deal.CATEGORY_ID,
    date_modify: deal.DATE_MODIFY,
  });

  await client.query(`
    INSERT INTO public.bitrix_webhook_leads (
      bitrix_id, empresa, etapa, event, etapa_bitrix, source, repeated,
      responsible, iniciado_el, raw_query, created_at, categoria_id
    ) VALUES (
      $1, 'velsa', $2, 'backfill', $3, $4, $5, $6, $7::text, $8,
      COALESCE($7::timestamptz, NOW()), $9
    )
    ON CONFLICT (empresa, bitrix_id) DO UPDATE SET
      etapa = EXCLUDED.etapa,
      etapa_bitrix = EXCLUDED.etapa_bitrix,
      source = COALESCE(NULLIF(BTRIM(EXCLUDED.source), ''), bitrix_webhook_leads.source),
      repeated = EXCLUDED.repeated,
      responsible = COALESCE(NULLIF(BTRIM(EXCLUDED.responsible), ''), bitrix_webhook_leads.responsible),
      iniciado_el = EXCLUDED.iniciado_el,
      created_at = EXCLUDED.created_at,
      categoria_id = EXCLUDED.categoria_id,
      raw_query = EXCLUDED.raw_query,
      updated_at = NOW()
  `, [
    String(deal.ID), slugify(etapaVisible), String(etapaVisible).toUpperCase(), fuente,
    deal.IS_REPEATED_APPROACH === 'Y' ? 'Y' : 'N', responsable,
    deal.DATE_CREATE || null, raw, String(CATEGORIA_VELSA),
  ]);
}

async function main() {
  console.log(`Modo: ${APLICAR ? 'APLICAR' : 'SOLO CONSULTA (dry-run)'}`);
  console.log(`Ventana: ${DESDE} → ${HASTA}; categoría: ${CATEGORIA_VELSA}`);

  const catalogos = await cargarCatalogos();
  console.log(`Pipeline confirmado: ${catalogos.categoria.ID} — ${catalogos.categoria.NAME}`);

  const deals = await cargarDeals();
  const ids = deals.map(d => Number(d.ID));
  const existentes = ids.length
    ? await pool.query('SELECT id FROM public.negociaciones_reporteria WHERE id = ANY($1::int[])', [ids])
    : { rows: [] };
  const existentesWebhook = ids.length
    ? await pool.query(
      `SELECT bitrix_id FROM public.bitrix_webhook_leads
        WHERE empresa = 'velsa' AND bitrix_id = ANY($1::text[])`,
      [ids.map(String)]
    )
    : { rows: [] };
  const idsExistentes = new Set(existentes.rows.map(f => Number(f.id)));
  const idsWebhook = new Set(existentesWebhook.rows.map(f => String(f.bitrix_id)));
  const nuevos = deals.filter(d => !idsExistentes.has(Number(d.ID))).length;
  const nuevosWebhook = deals.filter(d => !idsWebhook.has(String(d.ID))).length;

  console.log(`Base CRM: ${deals.length}; existentes: ${deals.length - nuevos}; faltantes: ${nuevos}`);
  console.log(`Cruce Jotform/Bitrix: ${deals.length}; existentes: ${deals.length - nuevosWebhook}; faltantes: ${nuevosWebhook}`);
  console.table(deals.slice(0, 10).map(d => ({
    id: d.ID,
    fecha: d.DATE_CREATE,
    etapa: catalogos.etapas[String(d.STAGE_ID)] || d.STAGE_ID,
    responsable: catalogos.usuarios[String(d.ASSIGNED_BY_ID)] || d.ASSIGNED_BY_ID,
    origen: catalogos.fuentes[String(d.SOURCE_ID)] || d.SOURCE_ID,
  })));

  if (!APLICAR) {
    console.log('Dry-run terminado. Para cargar: agregue --aplicar.');
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const deal of deals) {
      await guardarDeal(client, deal, catalogos);
      await guardarEstadoWebhook(client, deal, catalogos);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  const vista = await pool.query(`
    SELECT c.relkind
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'mv_indicadores_velsa_completo'
  `);
  if (vista.rows[0]?.relkind === 'm') {
    await pool.query('REFRESH MATERIALIZED VIEW public.mv_indicadores_velsa_completo');
    console.log('Vista mv_indicadores_velsa_completo actualizada.');
  }

  console.log(
    `Carga terminada: ${deals.length} procesados; ` +
    `CRM ${nuevos} nuevos/${deals.length - nuevos} actualizados; ` +
    `cruce Jotform ${nuevosWebhook} nuevos/${deals.length - nuevosWebhook} actualizados.`
  );
}

main()
  .catch(error => {
    console.error(`ERROR: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
