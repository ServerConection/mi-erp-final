/**
 * BITRIX24 SERVICE — cliente API + sincronización con PostgreSQL
 * Categoría principal: 8 (VELSA VENTAS NETLIFE)
 */

const pool = require('../config/db');

const WEBHOOK         = process.env.BITRIX_WEBHOOK;
// Cuenta NOVONET — usada SOLO por el módulo de llamadas (Automarcador).
// Las tablas bitrix_usuarios/bitrix_deals (sin sufijo) son SOLO VELSA; no tocar.
const WEBHOOK_NOVONET = (process.env.BITRIX_NOVONET_URL || 'https://novonet.bitrix24.es/rest/87387/vcca209sfcjflxp8').replace(/\/$/, '');
const CAT_VELSA = [8];   // pipelines a sincronizar; agregar más si se necesita

// ── Cliente HTTP con reintentos ───────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));

const bitrixCallBase = async (webhook, method, params = {}, intento = 1) => {
  if (!webhook) throw new Error('Webhook de Bitrix no configurado');

  const qs = new URLSearchParams();
  const flatten = (obj, prefix = '') => {
    for (const [k, v] of Object.entries(obj)) {
      const key = prefix ? `${prefix}[${k}]` : k;
      if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
        flatten(v, key);
      } else if (Array.isArray(v)) {
        v.forEach((item, i) => qs.append(`${key}[${i}]`, item));
      } else {
        qs.append(key, v);
      }
    }
  };
  flatten(params);

  const url = `${webhook}/${method}.json?${qs.toString()}`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    const json = await res.json();
    if (json.error) throw new Error(`Bitrix [${method}]: ${json.error} — ${json.error_description}`);
    return json;
  } catch (err) {
    const reintentable = err.code === 'ECONNRESET' || err.name === 'AbortError' ||
                         err.message.includes('ECONNRESET') || err.message.includes('fetch');
    if (reintentable && intento < 4) {
      const espera = intento * 2000;
      console.log(`   ⟳ Reintento ${intento}/3 para [${method}] (espera ${espera/1000}s)...`);
      await sleep(espera);
      return bitrixCallBase(webhook, method, params, intento + 1);
    }
    throw err;
  }
};

const bitrixCall = (method, params = {}, intento = 1) =>
  bitrixCallBase(WEBHOOK, method, params, intento);

// ── Paginación automática ─────────────────────────────────────────────────────
const bitrixListAllBase = async (webhook, method, params = {}, maxPages = 400) => {
  let all   = [];
  let start = 0;
  let page  = 0;

  while (page < maxPages) {
    const json = await bitrixCallBase(webhook, method, { ...params, start });
    const batch = json.result || [];
    all = all.concat(batch);
    if (batch.length > 0) {
      process.stdout.write(`\r   📦 Página ${page + 1} — ${all.length} registros traídos`);
    }
    if (!json.next || batch.length < 50) break;
    start = json.next;
    page++;
    await sleep(700); // Respetar rate limit Bitrix (2 req/s)
  }
  if (all.length > 0) console.log(''); // nueva línea tras el progreso
  return all;
};

const bitrixListAll = (method, params = {}, maxPages = 400) =>
  bitrixListAllBase(WEBHOOK, method, params, maxPages);

// ── Mapeo de campos UF_CRM a nombres amigables ────────────────────────────────
// Ejecuta:  node bitrix-discover-fields.js
// para ver los nombres UF_CRM_XXXXXX reales de tu instalación y actualizar este mapa.
//
// INSTRUCCIÓN: después del primer sync corre en psql / pgAdmin:
//   SELECT DISTINCT jsonb_object_keys(campos_custom) FROM bitrix_deals LIMIT 50;
// para ver qué campos llegaron realmente.
const MAPA_UF = {
  // ── Completa con los nombres que salgan del discover-fields ─────────────────
  // 'UF_CRM_XXXXXXX': 'nombre_amigable',

  // Nombres típicos en instalaciones Bitrix (ajustar con los reales):
  UF_CRM_1_CIUDAD:            'ciudad',
  UF_CRM_1_PROVINCIA:         'provincia',
  UF_CRM_1_NOMBRE_ASESOR:     'nombre_asesor',
  UF_CRM_1_CEDULA:            'cedula',
  UF_CRM_1_FORMA_PAGO:        'forma_pago',
  UF_CRM_1_MEGAS_PLAN:        'megas_plan',
  UF_CRM_1_MOTIVO_ATC:        'motivo_atc',
  UF_CRM_1_REGULARIZADO:      'regularizado',
  UF_CRM_1_VOLVER_LLAMAR:     'volver_llamar',
  UF_CRM_1_FECHA_VENTA:       'fecha_venta_subida',
  UF_CRM_1_DEUDA:             'deuda',
  UF_CRM_1_CONTRATO:          'contrato',
  UF_CRM_1_LOGIN:             'login',
  UF_CRM_1_PAGADO_INST:       'pagado_instalacion',
  UF_CRM_1_DESISTE:           'desiste_compra',
  UF_CRM_1_INNEGOCIABLE:      'innegociable',
};

const mapearCamposCustom = (deal) => {
  const custom = {};

  for (const [k, v] of Object.entries(deal)) {
    if (!k.startsWith('UF_')) continue;
    const val = Array.isArray(v) ? v.join(', ') : v;
    if (val === null || val === '' || val === undefined) continue;

    // Guardar con nombre UF_ original (siempre)
    custom[k] = val;

    // Agregar alias amigable si está en el mapa
    const alias = MAPA_UF[k];
    if (alias) custom[alias] = val;
  }

  return Object.keys(custom).length > 0 ? custom : null;
};

// ── SYNC PRINCIPAL ────────────────────────────────────────────────────────────
const syncBitrix = async ({ desde = null, hasta = null, categorias = CAT_VELSA } = {}) => {
  const logId = await iniciarLog('incremental');
  let procesados = 0, nuevos = 0, actualizados = 0;

  try {
    // 1. Actualizar catálogo de usuarios
    await syncUsuarios();

    // 2. Sincronizar deals de cada categoría
    for (const catId of categorias) {
      const filter = { CATEGORY_ID: catId };
      if (desde) filter['>=DATE_CREATE'] = desde;
      if (hasta) filter['<=DATE_CREATE'] = hasta;

      const deals = await bitrixListAll('crm.deal.list', {
        filter,
        order: { DATE_CREATE: 'DESC' },
        // Campos estándar + TODOS los campos custom UF_*
        select: [
          'ID','TITLE','CATEGORY_ID','STAGE_ID','ASSIGNED_BY_ID',
          'SOURCE_ID','DATE_CREATE','DATE_MODIFY','CLOSEDATE',
          'CLOSED','STAGE_SEMANTIC_ID','OPPORTUNITY','CURRENCY_ID',
          'CONTACT_ID',
          'UF_*',
        ],
      });

      for (const d of deals) {
        const ganado  = d.STAGE_SEMANTIC_ID === 'S'; // Success
        const perdido = d.STAGE_SEMANTIC_ID === 'F'; // Failure
        const cerrado = d.CLOSED === 'Y';
        const camposCustom = mapearCamposCustom(d);

        const res = await pool.query(
          `INSERT INTO bitrix_deals
             (id, titulo, category_id, stage_id, asesor_id, source_id,
              fecha_creacion, fecha_modificacion, fecha_cierre,
              cerrado, ganado, perdido, monto, moneda, campos_custom, contact_id, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NOW())
           ON CONFLICT (id) DO UPDATE SET
             titulo             = EXCLUDED.titulo,
             stage_id           = EXCLUDED.stage_id,
             asesor_id          = EXCLUDED.asesor_id,
             fecha_modificacion = EXCLUDED.fecha_modificacion,
             fecha_cierre       = EXCLUDED.fecha_cierre,
             cerrado            = EXCLUDED.cerrado,
             ganado             = EXCLUDED.ganado,
             perdido            = EXCLUDED.perdido,
             monto              = EXCLUDED.monto,
             campos_custom      = EXCLUDED.campos_custom,
             contact_id         = EXCLUDED.contact_id,
             updated_at         = NOW()
           RETURNING (xmax = 0) AS es_nuevo`,
          [
            parseInt(d.ID),
            d.TITLE || '',
            parseInt(d.CATEGORY_ID),
            d.STAGE_ID,
            d.ASSIGNED_BY_ID ? parseInt(d.ASSIGNED_BY_ID) : null,
            d.SOURCE_ID || null,
            d.DATE_CREATE   ? new Date(d.DATE_CREATE)   : null,
            d.DATE_MODIFY   ? new Date(d.DATE_MODIFY)   : null,
            d.CLOSEDATE     ? new Date(d.CLOSEDATE)     : null,
            cerrado, ganado, perdido,
            parseFloat(d.OPPORTUNITY) || 0,
            d.CURRENCY_ID || 'USD',
            camposCustom ? JSON.stringify(camposCustom) : '{}',
            d.CONTACT_ID ? parseInt(d.CONTACT_ID) : null,
          ]
        );

        procesados++;
        if (res.rows[0]?.es_nuevo) nuevos++; else actualizados++;
      }
    }

    await completarLog(logId, { procesados, nuevos, actualizados, exito: true });
    return { ok: true, procesados, nuevos, actualizados };

  } catch (err) {
    await completarLog(logId, { procesados, nuevos, actualizados, error: err.message, exito: false });
    throw err;
  }
};

// ── Sync de usuarios ──────────────────────────────────────────────────────────
const syncUsuarios = async () => {
  const users = await bitrixListAll('user.get', { ACTIVE: true }, 10);
  for (const u of users) {
    await pool.query(
      `INSERT INTO bitrix_usuarios (id, nombre_completo, email, departamentos, activo, updated_at)
       VALUES ($1,$2,$3,$4,true,NOW())
       ON CONFLICT (id) DO UPDATE SET
         nombre_completo = EXCLUDED.nombre_completo,
         email           = EXCLUDED.email,
         departamentos   = EXCLUDED.departamentos,
         updated_at      = NOW()`,
      [
        parseInt(u.ID),
        `${u.NAME || ''} ${u.LAST_NAME || ''}`.trim(),
        u.EMAIL || null,
        JSON.stringify(u.UF_DEPARTMENT || []),
      ]
    );
  }
};

// ── SYNC NOVONET (cuenta Bitrix distinta — solo para módulo de llamadas) ──────
// Tablas propias (bitrix_*_novonet) para no mezclar con los datos de VELSA.
const syncNovonet = async ({ desde = null, hasta = null } = {}) => {
  const logId = await iniciarLog('novonet');
  let procesados = 0, nuevos = 0, actualizados = 0;

  try {
    // 1. Usuarios
    const users = await bitrixListAllBase(WEBHOOK_NOVONET, 'user.get', { ACTIVE: true }, 10);
    for (const u of users) {
      await pool.query(
        `INSERT INTO bitrix_usuarios_novonet (id, nombre_completo, activo, updated_at)
         VALUES ($1,$2,true,NOW())
         ON CONFLICT (id) DO UPDATE SET
           nombre_completo = EXCLUDED.nombre_completo,
           updated_at      = NOW()`,
        [parseInt(u.ID), `${u.NAME || ''} ${u.LAST_NAME || ''}`.trim() || `ID-${u.ID}`]
      );
    }

    // 2. Categorías (pipelines)
    const catJson = await bitrixCallBase(WEBHOOK_NOVONET, 'crm.dealcategory.list');
    const categorias = catJson.result || [];
    for (const c of [{ ID: 0, NAME: 'General' }, ...categorias]) {
      await pool.query(
        `INSERT INTO bitrix_categorias_novonet (id, nombre, sort, updated_at)
         VALUES ($1,$2,$3,NOW())
         ON CONFLICT (id) DO UPDATE SET nombre = EXCLUDED.nombre, updated_at = NOW()`,
        [parseInt(c.ID), c.NAME || `Pipeline ${c.ID}`, parseInt(c.SORT) || 0]
      );
    }

    // 3. Etapas por categoría
    for (const c of [{ ID: 0 }, ...categorias]) {
      const stJson = await bitrixCallBase(WEBHOOK_NOVONET, 'crm.dealcategory.stage.list', { id: c.ID });
      for (const s of (stJson.result || [])) {
        await pool.query(
          `INSERT INTO bitrix_etapas_novonet (status_id, category_id, nombre, sort, updated_at)
           VALUES ($1,$2,$3,$4,NOW())
           ON CONFLICT (status_id) DO UPDATE SET nombre = EXCLUDED.nombre, updated_at = NOW()`,
          [s.STATUS_ID, parseInt(c.ID), s.NAME || s.STATUS_ID, parseInt(s.SORT) || 0]
        );
      }
      await sleep(300);
    }

    // 4. Deals (todas las categorías de la cuenta NOVONET)
    const filter = {};
    if (desde) filter['>=DATE_CREATE'] = desde;
    if (hasta) filter['<=DATE_CREATE'] = hasta;

    const deals = await bitrixListAllBase(WEBHOOK_NOVONET, 'crm.deal.list', {
      filter,
      order: { DATE_CREATE: 'DESC' },
      select: [
        'ID','TITLE','CATEGORY_ID','STAGE_ID','ASSIGNED_BY_ID',
        'DATE_CREATE','DATE_MODIFY','CLOSEDATE','CLOSED',
        'STAGE_SEMANTIC_ID','OPPORTUNITY','CURRENCY_ID','CONTACT_ID',
      ],
    });

    for (const d of deals) {
      const ganado  = d.STAGE_SEMANTIC_ID === 'S';
      const perdido = d.STAGE_SEMANTIC_ID === 'F';
      const cerrado = d.CLOSED === 'Y';

      const res = await pool.query(
        `INSERT INTO bitrix_deals_novonet
           (id, titulo, category_id, stage_id, asesor_id, contact_id,
            fecha_creacion, fecha_modificacion, fecha_cierre,
            cerrado, ganado, perdido, monto, moneda, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW())
         ON CONFLICT (id) DO UPDATE SET
           titulo             = EXCLUDED.titulo,
           stage_id           = EXCLUDED.stage_id,
           asesor_id          = EXCLUDED.asesor_id,
           contact_id         = EXCLUDED.contact_id,
           fecha_modificacion = EXCLUDED.fecha_modificacion,
           fecha_cierre       = EXCLUDED.fecha_cierre,
           cerrado            = EXCLUDED.cerrado,
           ganado             = EXCLUDED.ganado,
           perdido            = EXCLUDED.perdido,
           monto              = EXCLUDED.monto,
           updated_at         = NOW()
         RETURNING (xmax = 0) AS es_nuevo`,
        [
          parseInt(d.ID),
          d.TITLE || '',
          parseInt(d.CATEGORY_ID) || 0,
          d.STAGE_ID,
          d.ASSIGNED_BY_ID ? parseInt(d.ASSIGNED_BY_ID) : null,
          d.CONTACT_ID ? parseInt(d.CONTACT_ID) : null,
          d.DATE_CREATE ? new Date(d.DATE_CREATE) : null,
          d.DATE_MODIFY ? new Date(d.DATE_MODIFY) : null,
          d.CLOSEDATE   ? new Date(d.CLOSEDATE)   : null,
          cerrado, ganado, perdido,
          parseFloat(d.OPPORTUNITY) || 0,
          d.CURRENCY_ID || 'USD',
        ]
      );

      procesados++;
      if (res.rows[0]?.es_nuevo) nuevos++; else actualizados++;
    }

    await completarLog(logId, { procesados, nuevos, actualizados, exito: true });
    return { ok: true, procesados, nuevos, actualizados };

  } catch (err) {
    await completarLog(logId, { procesados, nuevos, actualizados, error: err.message, exito: false });
    throw err;
  }
};

// ── Log helpers ───────────────────────────────────────────────────────────────
const iniciarLog = async (tipo) => {
  const r = await pool.query(
    `INSERT INTO bitrix_sync_log (tipo) VALUES ($1) RETURNING id`, [tipo]
  );
  return r.rows[0].id;
};
const completarLog = async (id, { procesados, nuevos, actualizados, error, exito }) => {
  await pool.query(
    `UPDATE bitrix_sync_log SET
       completado_en      = NOW(),
       deals_procesados   = $2,
       deals_nuevos       = $3,
       deals_actualizados = $4,
       error              = $5,
       exito              = $6
     WHERE id = $1`,
    [id, procesados, nuevos, actualizados, error || null, exito]
  );
};

module.exports = { syncBitrix, syncUsuarios, bitrixCall, bitrixListAll, syncNovonet };
