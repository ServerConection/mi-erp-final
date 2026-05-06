/**
 * BITRIX24 SERVICE — cliente API + sincronización con PostgreSQL
 * Categoría principal: 8 (VELSA VENTAS NETLIFE)
 */

const pool = require('../config/db');

const WEBHOOK   = process.env.BITRIX_WEBHOOK; // https://aclopecuador.bitrix24.es/rest/34852/00em2r3oa8igj2yt
const CAT_VELSA = [8];   // pipelines a sincronizar; agregar más si se necesita

// ── Cliente HTTP con reintentos ───────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));

const bitrixCall = async (method, params = {}, intento = 1) => {
  if (!WEBHOOK) throw new Error('BITRIX_WEBHOOK no configurado en .env');

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

  const url = `${WEBHOOK}/${method}.json?${qs.toString()}`;

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
      return bitrixCall(method, params, intento + 1);
    }
    throw err;
  }
};

// ── Paginación automática ─────────────────────────────────────────────────────
const bitrixListAll = async (method, params = {}, maxPages = 400) => {
  let all   = [];
  let start = 0;
  let page  = 0;

  while (page < maxPages) {
    const json = await bitrixCall(method, { ...params, start });
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
        select: [
          'ID','TITLE','CATEGORY_ID','STAGE_ID','ASSIGNED_BY_ID',
          'SOURCE_ID','DATE_CREATE','DATE_MODIFY','CLOSEDATE',
          'CLOSED','STAGE_SEMANTIC_ID','OPPORTUNITY','CURRENCY_ID',
        ],
      });

      for (const d of deals) {
        const ganado  = d.STAGE_SEMANTIC_ID === 'S'; // Success
        const perdido = d.STAGE_SEMANTIC_ID === 'F'; // Failure
        const cerrado = d.CLOSED === 'Y';

        const res = await pool.query(
          `INSERT INTO bitrix_deals
             (id, titulo, category_id, stage_id, asesor_id, source_id,
              fecha_creacion, fecha_modificacion, fecha_cierre,
              cerrado, ganado, perdido, monto, moneda, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW())
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

module.exports = { syncBitrix, syncUsuarios, bitrixCall, bitrixListAll };
