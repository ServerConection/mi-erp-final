/**
 * BITRIX24 CONTROLLER
 * Endpoints:
 *   POST /api/bitrix/sync          — dispara sincronización
 *   GET  /api/bitrix/sync/status   — último log
 *   GET  /api/bitrix/velsa         — datos CRM VELSA para ERP (?desde=&hasta=)
 */

const pool = require('../config/db');
const { syncBitrix } = require('../services/bitrix.service');

const getFechaEcuador = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'America/Guayaquil' });

const getPrimerDiaMes = () => {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Guayaquil' }));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
};

// ── POST /api/bitrix/sync ─────────────────────────────────────────────────────
const triggerSync = async (req, res) => {
  try {
    const { desde, hasta } = req.body || {};
    // Ejecuta en background para no bloquear la respuesta
    res.json({ success: true, mensaje: 'Sincronización iniciada en background' });
    // No await — corre en background
    syncBitrix({ desde, hasta }).catch(e =>
      console.error('[bitrix sync error]', e.message)
    );
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ── GET /api/bitrix/sync/status ───────────────────────────────────────────────
const getSyncStatus = async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT * FROM bitrix_sync_log ORDER BY iniciado_en DESC LIMIT 5`
    );
    res.json({ success: true, logs: r.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ── GET /api/bitrix/velsa ─────────────────────────────────────────────────────
const getResumenVelsaBitrix = async (req, res) => {
  try {
    const hoy      = getFechaEcuador();
    const primerDia = getPrimerDiaMes();
    const { desde = primerDia, hasta = hoy } = req.query;

    const CAT = 8; // VELSA VENTAS NETLIFE

    const [
      totalRes, embudoRes, wonRes, tendenciaRes,
      asesoresRes, fuenteRes, syncRes,
    ] = await Promise.all([

      // 1. Total deals en período
      pool.query(
        `SELECT COUNT(*) AS total
         FROM bitrix_deals
         WHERE category_id = $1
           AND fecha_creacion::date BETWEEN $2::date AND $3::date`,
        [CAT, desde, hasta]
      ),

      // 2. Embudo — conteo por etapa (ordenado por sort)
      pool.query(
        `SELECT
           d.stage_id,
           COALESCE(e.nombre, d.stage_id) AS etapa,
           COALESCE(e.sort, 9999)          AS sort,
           e.es_ganado,
           e.es_perdido,
           COUNT(*)::int                   AS total
         FROM bitrix_deals d
         LEFT JOIN bitrix_etapas e ON e.status_id = d.stage_id
         WHERE d.category_id = $1
           AND d.fecha_creacion::date BETWEEN $2::date AND $3::date
         GROUP BY d.stage_id, e.nombre, e.sort, e.es_ganado, e.es_perdido
         ORDER BY sort ASC`,
        [CAT, desde, hasta]
      ),

      // 3. KPIs de conversión
      pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE ganado)::int  AS ventas_subidas,
           COUNT(*) FILTER (WHERE perdido)::int AS descartes,
           COUNT(*) FILTER (WHERE NOT ganado AND NOT perdido)::int AS en_proceso
         FROM bitrix_deals
         WHERE category_id = $1
           AND fecha_creacion::date BETWEEN $2::date AND $3::date`,
        [CAT, desde, hasta]
      ),

      // 4. Tendencia diaria
      pool.query(
        `SELECT
           fecha_creacion::date AS fecha,
           COUNT(*)::int        AS total,
           COUNT(*) FILTER (WHERE ganado)::int AS ganados
         FROM bitrix_deals
         WHERE category_id = $1
           AND fecha_creacion::date BETWEEN $2::date AND $3::date
         GROUP BY fecha_creacion::date
         ORDER BY fecha ASC`,
        [CAT, desde, hasta]
      ),

      // 5. Ranking asesores
      pool.query(
        `SELECT
           d.asesor_id,
           COALESCE(u.nombre_completo, 'Asesor ' || d.asesor_id) AS asesor,
           COUNT(*)::int                                           AS total,
           COUNT(*) FILTER (WHERE d.ganado)::int                  AS ganados,
           COUNT(*) FILTER (WHERE d.perdido)::int                 AS perdidos,
           ROUND(
             COUNT(*) FILTER (WHERE d.ganado) * 100.0
             / NULLIF(COUNT(*), 0), 1
           ) AS pct_conversion
         FROM bitrix_deals d
         LEFT JOIN bitrix_usuarios u ON u.id = d.asesor_id
         WHERE d.category_id = $1
           AND d.fecha_creacion::date BETWEEN $2::date AND $3::date
         GROUP BY d.asesor_id, u.nombre_completo
         ORDER BY total DESC
         LIMIT 20`,
        [CAT, desde, hasta]
      ),

      // 6. Por fuente (SOURCE_ID)
      pool.query(
        `SELECT
           COALESCE(UPPER(TRIM(source_id)), 'SIN DATO') AS fuente,
           COUNT(*)::int AS total
         FROM bitrix_deals
         WHERE category_id = $1
           AND fecha_creacion::date BETWEEN $2::date AND $3::date
         GROUP BY fuente
         ORDER BY total DESC`,
        [CAT, desde, hasta]
      ),

      // 7. Info de última sync
      pool.query(
        `SELECT completado_en, deals_procesados, exito
         FROM bitrix_sync_log
         WHERE exito = true
         ORDER BY completado_en DESC LIMIT 1`
      ),
    ]);

    const total = parseInt(totalRes.rows[0]?.total) || 0;
    const kpi   = wonRes.rows[0] || {};

    // Embudo para el gráfico (formato compatible con GraficoEmbudo existente)
    const embudo = embudoRes.rows.map(r => ({
      stage_id: r.stage_id,
      etapa:    r.etapa,
      total:    r.total,
      value:    r.total,
      name:     r.etapa,
      es_ganado:  r.es_ganado,
      es_perdido: r.es_perdido,
    }));

    return res.json({
      success: true, desde, hasta,
      total,
      kpi: {
        ventas_subidas: parseInt(kpi.ventas_subidas) || 0,
        descartes:      parseInt(kpi.descartes)      || 0,
        en_proceso:     parseInt(kpi.en_proceso)     || 0,
        pct_conversion: total > 0
          ? ((parseInt(kpi.ventas_subidas) / total) * 100).toFixed(1)
          : '0.0',
      },
      embudo,
      tendencia: tendenciaRes.rows.map(r => ({
        fecha:   String(r.fecha).substring(5, 10),
        total:   r.total,
        ganados: r.ganados,
      })),
      asesores: asesoresRes.rows.map(r => ({
        asesor:         r.asesor,
        total:          r.total,
        ganados:        r.ganados,
        perdidos:       r.perdidos,
        pctConversion:  parseFloat(r.pct_conversion) || 0,
      })),
      fuentes: fuenteRes.rows.map(r => ({ name: r.fuente, value: r.total })),
      ultimaSync: syncRes.rows[0]?.completado_en || null,
    });

  } catch (err) {
    console.error('[bitrix] getResumenVelsaBitrix:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
};

// ── Detectar si columna campos_custom ya existe ───────────────────────────────
let _tieneCustom = null; // caché en memoria por proceso
const tieneCamposCustom = async () => {
  if (_tieneCustom !== null) return _tieneCustom;
  const r = await pool.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='bitrix_deals' AND column_name='campos_custom'`
  );
  _tieneCustom = r.rows.length > 0;
  return _tieneCustom;
};

// ── GET /api/bitrix/velsa/tabla ───────────────────────────────────────────────
const getTablaBitrix = async (req, res) => {
  try {
    const hoy       = getFechaEcuador();
    const primerDia = getPrimerDiaMes();
    const {
      desde     = primerDia,
      hasta     = hoy,
      etapa     = null,
      asesor_id = null,
      estado    = null,
      limit     = 1000,
      offset    = 0,
    } = req.query;

    const CAT = 8;

    // ── Filtros dinámicos con parámetros seguros ──────────────────────────────
    const params  = [CAT, desde, hasta];
    const conds   = [
      `d.category_id = $1`,
      `d.fecha_creacion::date BETWEEN $2::date AND $3::date`,
    ];
    if (etapa)     { params.push(etapa);          conds.push(`d.stage_id = $${params.length}`); }
    if (asesor_id) { params.push(parseInt(asesor_id)); conds.push(`d.asesor_id = $${params.length}`); }
    if (estado === 'ganado')  conds.push(`d.ganado = true`);
    if (estado === 'perdido') conds.push(`d.perdido = true`);
    if (estado === 'proceso') conds.push(`d.ganado = false AND d.perdido = false`);
    const WHERE = conds.join(' AND ');

    // ── Verificar si la columna campos_custom existe (sin ella usamos fallback) ─
    const conCustom = await tieneCamposCustom();

    // ── Bloque de campos custom (condicional) ─────────────────────────────────
    const customSelect = conCustom ? `
          COALESCE(d.campos_custom->>'ciudad',             '') AS ciudad,
          COALESCE(d.campos_custom->>'provincia',          '') AS provincia,
          COALESCE(d.campos_custom->>'nombre_asesor',      '') AS nombre_asesor_campo,
          COALESCE(d.campos_custom->>'cedula',             '') AS cedula,
          COALESCE(d.campos_custom->>'forma_pago',         '') AS forma_pago,
          COALESCE(d.campos_custom->>'megas_plan',         '') AS megas_plan,
          COALESCE(d.campos_custom->>'motivo_atc',         '') AS motivo_atc,
          COALESCE(d.campos_custom->>'regularizado',       '') AS regularizado,
          COALESCE(d.campos_custom->>'volver_llamar',      '') AS volver_llamar,
          COALESCE(d.campos_custom->>'fecha_venta_subida', '') AS fecha_venta_subida,
          COALESCE(d.campos_custom->>'deuda',              '') AS deuda,
          COALESCE(d.campos_custom->>'contrato',           '') AS contrato,
          COALESCE(d.campos_custom->>'login',              '') AS login,
          COALESCE(d.campos_custom->>'pagado_instalacion', '') AS pagado_instalacion,
          COALESCE(d.campos_custom->>'desiste_compra',     '') AS desiste_compra,
          COALESCE(d.campos_custom->>'innegociable',       '') AS innegociable,` : `
          '' AS ciudad, '' AS provincia, '' AS nombre_asesor_campo,
          '' AS cedula, '' AS forma_pago, '' AS megas_plan,
          '' AS motivo_atc, '' AS regularizado, '' AS volver_llamar,
          '' AS fecha_venta_subida, '' AS deuda, '' AS contrato,
          '' AS login, '' AS pagado_instalacion, '' AS desiste_compra,
          '' AS innegociable,`;

    const camposUfQuery = conCustom
      ? `SELECT DISTINCT jsonb_object_keys(campos_custom) AS clave
         FROM bitrix_deals
         WHERE category_id = ${CAT} AND campos_custom IS NOT NULL AND campos_custom != '{}'
         ORDER BY clave LIMIT 80`
      : `SELECT 'migration-v2 pendiente' AS clave`;

    const [rowsRes, countRes, camposRes] = await Promise.all([
      pool.query(`
        SELECT
          d.id,
          d.titulo                                              AS nombre,
          COALESCE(bc.nombre, 'Cat ' || d.category_id)        AS pipeline,
          COALESCE(be.nombre, d.stage_id)                      AS etapa,
          CASE
            WHEN d.ganado  THEN 'GANADO'
            WHEN d.perdido THEN 'PERDIDO'
            ELSE                'EN PROCESO'
          END                                                   AS estado,
          COALESCE(u.nombre_completo, 'ID ' || d.asesor_id)   AS asesor,
          COALESCE(UPPER(TRIM(d.source_id)), 'SIN DATO')       AS fuente,
          d.monto,
          d.moneda,
          d.fecha_creacion,
          d.fecha_modificacion,
          d.fecha_cierre,
          ${customSelect}
          d.updated_at
        FROM bitrix_deals d
        LEFT JOIN bitrix_categorias bc ON bc.id       = d.category_id
        LEFT JOIN bitrix_etapas     be ON be.status_id = d.stage_id
        LEFT JOIN bitrix_usuarios   u  ON u.id        = d.asesor_id
        WHERE ${WHERE}
        ORDER BY d.fecha_creacion DESC
        LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}
      `, params),

      pool.query(`SELECT COUNT(*)::int AS total FROM bitrix_deals d WHERE ${WHERE}`, params),

      pool.query(camposUfQuery),
    ]);

    return res.json({
      success:     true,
      desde,
      hasta,
      total:       countRes.rows[0]?.total || 0,
      limit:       parseInt(limit),
      offset:      parseInt(offset),
      tiene_custom: conCustom,
      campos_uf:   camposRes.rows.map(r => r.clave),
      filas:       rowsRes.rows,
    });

  } catch (err) {
    console.error('[bitrix] getTablaBitrix:', err);
    // Resetear caché si error de columna para que reintente en la próxima petición
    if (err.message?.includes('campos_custom')) _tieneCustom = null;
    return res.status(500).json({ success: false, error: err.message });
  }
};

// ── Configuración de APIs Bitrix24 ────────────────────────────────────────────
const BITRIX_APIS = {
  NOVONET: (process.env.BITRIX_NOVONET_URL || 'https://novonet.bitrix24.es/rest/87387/vcca209sfcjflxp8').replace(/\/$/, ''),
  VELSA:   (process.env.BITRIX_VELSA_URL   || 'https://aclopecuador.bitrix24.es/rest/34852/0sl0qc3ccg3agc9x').replace(/\/$/, ''),
};

// Campos de deals que pedimos a la API
const BITRIX_SELECT = ['ID', 'TITLE', 'STAGE_ID', 'ASSIGNED_BY_ID', 'OPPORTUNITY', 'CURRENCY_ID', 'DATE_MODIFY'];

// Tipos de actividad Bitrix24
const TIPO_ACT = { '1':'Reunión','2':'Email','4':'Tarea','6':'Llamada','12':'WhatsApp','13':'Notificación' };

// ── Caché de usuarios (TTL 10 min) ───────────────────────────────────────────
const _userCache  = { NOVONET: { mapa: null, expira: 0 }, VELSA: { mapa: null, expira: 0 } };
const USER_CACHE_TTL  = 10 * 60 * 1000;

// ── Caché de etapas (TTL 1 hora) ─────────────────────────────────────────────
const _stageCache = { NOVONET: { mapa: null, expira: 0 }, VELSA: { mapa: null, expira: 0 } };
const STAGE_CACHE_TTL = 60 * 60 * 1000;

/** Mapa { userId → "Nombre Apellido" } — cachea 10 min */
async function fetchUserMap(baseUrl, cuenta) {
  const cache = _userCache[cuenta];
  if (cache.mapa && Date.now() < cache.expira) return cache.mapa;
  const mapa = new Map();
  let start  = 0;
  while (true) {
    const params = new URLSearchParams();
    params.set('ACTIVE', 'Y');
    ['ID', 'NAME', 'LAST_NAME'].forEach((f, i) => params.set(`select[${i}]`, f));
    params.set('start', start);
    const resp = await fetch(`${baseUrl}/user.get.json?${params.toString()}`,
      { signal: AbortSignal.timeout(10_000) });
    if (!resp.ok) break;
    const json = await resp.json();
    if (json.error || !json.result) break;
    for (const u of json.result)
      mapa.set(String(u.ID), [u.NAME, u.LAST_NAME].filter(Boolean).join(' ').trim() || `ID-${u.ID}`);
    if (!json.next) break;
    start = json.next;
  }
  cache.mapa   = mapa;
  cache.expira = Date.now() + USER_CACHE_TTL;
  console.log(`[bitrix] Usuarios ${cuenta}: ${mapa.size}`);
  return mapa;
}

/** Mapa { STATUS_ID → "Nombre etapa" } — cachea 1 hora, fetch paralelo por categoría */
async function fetchStageMap(baseUrl, cuenta) {
  const cache = _stageCache[cuenta];
  if (cache.mapa && Date.now() < cache.expira) return cache.mapa;
  const mapa = new Map();
  try {
    // 1. Obtener todas las categorías (pipelines)
    const catResp = await fetch(`${baseUrl}/crm.dealcategory.list.json`,
      { signal: AbortSignal.timeout(10_000) });
    const catJson  = await catResp.json();
    const catIds   = [0, ...(catJson.result || []).map(c => Number(c.ID))];

    // 2. Traer etapas de todas las categorías en paralelo
    const stageResults = await Promise.all(
      catIds.map(catId =>
        fetch(`${baseUrl}/crm.dealcategory.stage.list.json?id=${catId}`,
          { signal: AbortSignal.timeout(10_000) })
          .then(r => r.json())
          .catch(() => ({ result: [] }))
      )
    );
    for (const stJson of stageResults)
      for (const s of (stJson.result || []))
        mapa.set(s.STATUS_ID, s.NAME);
  } catch (e) { console.error(`[bitrix] stageMap ${cuenta}:`, e.message); }
  cache.mapa   = mapa;
  cache.expira = Date.now() + STAGE_CACHE_TTL;
  console.log(`[bitrix] Etapas ${cuenta}: ${mapa.size}`);
  return mapa;
}

/**
 * Mapa { dealId → última actividad } para deals del período.
 * Trae llamadas, emails, WhatsApp, tareas, etc.
 */
async function fetchActividades(baseUrl, desde) {
  const mapa  = new Map();
  const fecha = desde.toISOString().slice(0, 10); // YYYY-MM-DD
  try {
    let start = 0;
    while (mapa.size <= 2000) {
      const params = new URLSearchParams();
      params.set('filter[OWNER_TYPE_ID]', '2'); // 2 = deals
      params.set('filter[>ADD_DATE]', fecha);
      params.set('order[ID]', 'DESC');
      ['ID','TYPE_ID','SUBJECT','DESCRIPTION','DURATION','DIRECTION','OWNER_ID','ADD_DATE']
        .forEach((f, i) => params.set(`select[${i}]`, f));
      params.set('start', start);
      const resp = await fetch(`${baseUrl}/crm.activity.list.json?${params.toString()}`,
        { signal: AbortSignal.timeout(15_000) });
      if (!resp.ok) break;
      const json = await resp.json();
      if (json.error || !json.result || json.result.length === 0) break;
      for (const act of json.result) {
        const did = String(act.OWNER_ID);
        if (!mapa.has(did)) { // primera = más reciente (orden DESC por ID)
          const durSeg = parseInt(act.DURATION || 0);
          mapa.set(did, {
            tipo:        TIPO_ACT[String(act.TYPE_ID)] || `Tipo ${act.TYPE_ID}`,
            esLlamada:   String(act.TYPE_ID) === '6',
            asunto:      act.SUBJECT || '',
            descripcion: (act.DESCRIPTION || '').replace(/<[^>]*>/g, '').substring(0, 250),
            duracion:    durSeg,
            durMinutos:  durSeg ? `${Math.floor(durSeg / 60)}:${String(durSeg % 60).padStart(2, '0')}` : null,
            direccion:   act.DIRECTION === '1' ? 'Entrante' : act.DIRECTION === '2' ? 'Saliente' : '',
            fecha:       act.ADD_DATE ? new Date(act.ADD_DATE) : null,
          });
        }
      }
      if (!json.next) break;
      start = json.next;
    }
  } catch (e) { console.error('[bitrix] fetchActividades:', e.message); }
  return mapa;
}

/** Deals de una cuenta en el período — users, etapas y deals en paralelo */
async function fetchBitrixDeals(baseUrl, cuenta, desde) {
  const [userMap, stageMap, rawDeals] = await Promise.all([
    fetchUserMap(baseUrl, cuenta).catch(() => new Map()),
    fetchStageMap(baseUrl, cuenta).catch(() => new Map()),
    (async () => {
      const list  = [];
      let   start = 0;
      const filtroFecha = desde.toISOString().slice(0, 19);
      while (list.length < 600) {
        const params = new URLSearchParams();
        params.set('filter[>DATE_MODIFY]', filtroFecha);
        params.set('order[DATE_MODIFY]', 'DESC');
        BITRIX_SELECT.forEach((f, i) => params.set(`select[${i}]`, f));
        params.set('start', start);
        const resp = await fetch(`${baseUrl}/crm.deal.list.json?${params.toString()}`,
          { signal: AbortSignal.timeout(15_000) });
        if (!resp.ok) throw new Error(`Bitrix ${cuenta} HTTP ${resp.status}`);
        const json = await resp.json();
        if (json.error) throw new Error(`Bitrix ${cuenta}: ${json.error_description || json.error}`);
        const page = json.result || [];
        list.push(...page);
        if (!json.next || page.length === 0) break;
        start = json.next;
      }
      return list;
    })(),
  ]);

  return rawDeals.map(d => ({
    dealId:     String(d.ID),
    asesor:     userMap.get(String(d.ASSIGNED_BY_ID))  || `Asesor ${d.ASSIGNED_BY_ID}`,
    negocio:    d.TITLE    || '—',
    etapa:      stageMap.get(d.STAGE_ID) || d.STAGE_ID || '—',
    monto:      parseFloat(d.OPPORTUNITY || 0),
    moneda:     d.CURRENCY_ID || '',
    dateModify: new Date(d.DATE_MODIFY),
    cuenta,
  }));
}

// ── GET /api/bitrix/live-actividad ────────────────────────────────────────────
const getLiveActividad = async (req, res) => {
  try {
    const horas = Math.min(parseInt(req.query.horas || '24', 10), 168);
    const desde = new Date(Date.now() - horas * 60 * 60 * 1000);

    // Deals y actividades en paralelo (4 fetches simultáneos)
    const [
      [dealsNovonet, dealsVelsa],
      [actsNovonet,  actsVelsa ],
    ] = await Promise.all([
      Promise.all([
        fetchBitrixDeals(BITRIX_APIS.NOVONET, 'NOVONET', desde)
          .catch(e => { console.error('[bitrix novonet]', e.message); return []; }),
        fetchBitrixDeals(BITRIX_APIS.VELSA, 'VELSA', desde)
          .catch(e => { console.error('[bitrix velsa]', e.message); return []; }),
      ]),
      Promise.all([
        fetchActividades(BITRIX_APIS.NOVONET, desde).catch(() => new Map()),
        fetchActividades(BITRIX_APIS.VELSA,   desde).catch(() => new Map()),
      ]),
    ]);

    // Combinar deals con su última actividad
    const todos = [
      ...dealsNovonet.map(d => ({ ...d, actDeal: actsNovonet.get(d.dealId) || null })),
      ...dealsVelsa.map(d =>   ({ ...d, actDeal: actsVelsa.get(d.dealId)   || null })),
    ];

    // Agrupar por asesor + cuenta
    const mapaAsesores = new Map();
    for (const deal of todos) {
      const key = `${deal.asesor}||${deal.cuenta}`;
      if (!mapaAsesores.has(key)) {
        mapaAsesores.set(key, {
          asesor:          deal.asesor,
          cuenta:          deal.cuenta,
          movimientos:     [],
          montoTotal:      0,
          ultimaActividad: deal.dateModify,
        });
      }
      const entry = mapaAsesores.get(key);
      entry.movimientos.push({
        dealId:    deal.dealId,
        negocio:   deal.negocio,
        etapa:     deal.etapa,
        monto:     deal.monto,
        fecha:     deal.dateModify,
        actividad: deal.actDeal,  // última actividad registrada en ese negocio
      });
      entry.montoTotal += deal.monto;
      if (deal.dateModify > entry.ultimaActividad) entry.ultimaActividad = deal.dateModify;
    }

    const ahora     = new Date();
    const resultado = Array.from(mapaAsesores.values())
      .map(r => {
        r.movimientos.sort((a, b) => b.fecha - a.fecha);
        const diff   = Math.floor((ahora - r.ultimaActividad) / 1000 / 60);
        const estado = diff < 30 ? 'activo' : diff < 120 ? 'reciente' : 'inactivo';
        return {
          asesor:           r.asesor,
          cuenta:           r.cuenta,
          totalMovimientos: r.movimientos.length,
          ultimaActividad:  r.ultimaActividad,
          minutosAtras:     diff,
          estado,
          montoTotal:       Math.round(r.montoTotal * 100) / 100,
          movimientos:      r.movimientos,   // TODOS — sin slice
        };
      })
      .sort((a, b) => b.ultimaActividad - a.ultimaActividad);

    res.json({
      success: true,
      horas,
      total:   resultado.length,
      fuentes: { novonet: dealsNovonet.length, velsa: dealsVelsa.length },
      data:    resultado,
    });
  } catch (err) {
    console.error("[live-actividad error]", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

module.exports = { triggerSync, getSyncStatus, getResumenVelsaBitrix, getTablaBitrix, getLiveActividad };
