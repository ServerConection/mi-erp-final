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

// Campos que pedimos a la API
const BITRIX_SELECT = ['ID', 'TITLE', 'STAGE_ID', 'ASSIGNED_BY_ID', 'ASSIGNED_BY_NAME', 'OPPORTUNITY', 'CURRENCY_ID', 'DATE_MODIFY'];

/**
 * Obtiene todos los deals de una cuenta Bitrix24 modificados desde `desde`.
 * Maneja paginación automáticamente (Bitrix devuelve max 50 por página).
 * Límite de seguridad: 600 deals (12 páginas) para evitar sobrecarga.
 */
async function fetchBitrixDeals(baseUrl, cuenta, desde) {
  const deals  = [];
  let   start  = 0;
  const limit  = 600; // techo de seguridad
  // Formato que acepta Bitrix: YYYY-MM-DDTHH:MM:SS
  const filtroFecha = desde.toISOString().slice(0, 19);

  while (deals.length < limit) {
    const params = new URLSearchParams();
    params.set('filter[>DATE_MODIFY]', filtroFecha);
    params.set('order[DATE_MODIFY]', 'DESC');
    BITRIX_SELECT.forEach((f, i) => params.set(`select[${i}]`, f));
    params.set('start', start);

    const url  = `${baseUrl}/crm.deal.list.json?${params.toString()}`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(15_000) });

    if (!resp.ok) throw new Error(`Bitrix ${cuenta} HTTP ${resp.status}`);
    const json = await resp.json();
    if (json.error) throw new Error(`Bitrix ${cuenta}: ${json.error_description || json.error}`);

    const page = json.result || [];
    deals.push(...page);

    // Sin más páginas o página vacía → terminar
    if (!json.next || page.length === 0) break;
    start = json.next;
  }

  return deals.map(d => ({
    asesor:     (d.ASSIGNED_BY_NAME || `ID-${d.ASSIGNED_BY_ID}` || 'Sin asignar').trim(),
    negocio:    d.TITLE   || '—',
    etapa:      d.STAGE_ID || '—',
    monto:      parseFloat(d.OPPORTUNITY || 0),
    moneda:     d.CURRENCY_ID || '',
    dateModify: new Date(d.DATE_MODIFY),
    cuenta,
  }));
}

// ── GET /api/bitrix/live-actividad ────────────────────────────────────────────
const getLiveActividad = async (req, res) => {
  try {
    const horas = Math.min(parseInt(req.query.horas || '24', 10), 168); // máx 7 días
    const desde = new Date(Date.now() - horas * 60 * 60 * 1000);

    // Llamadas paralelas a NOVONET y VELSA
    const [dealsNovonet, dealsVelsa] = await Promise.all([
      fetchBitrixDeals(BITRIX_APIS.NOVONET, 'NOVONET', desde).catch(e => {
        console.error('[bitrix novonet]', e.message);
        return [];
      }),
      fetchBitrixDeals(BITRIX_APIS.VELSA, 'VELSA', desde).catch(e => {
        console.error('[bitrix velsa]', e.message);
        return [];
      }),
    ]);

    const todos = [...dealsNovonet, ...dealsVelsa];

    // Agrupar por asesor + cuenta
    const mapa = new Map();
    for (const deal of todos) {
      const key = `${deal.asesor}||${deal.cuenta}`;
      if (!mapa.has(key)) {
        mapa.set(key, {
          asesor:          deal.asesor,
          cuenta:          deal.cuenta,
          movimientos:     [],
          montoTotal:      0,
          ultimaActividad: deal.dateModify,
        });
      }
      const entry = mapa.get(key);
      entry.movimientos.push({
        negocio: deal.negocio,
        etapa:   deal.etapa,
        monto:   deal.monto,
        fecha:   deal.dateModify,
      });
      entry.montoTotal += deal.monto;
      if (deal.dateModify > entry.ultimaActividad) {
        entry.ultimaActividad = deal.dateModify;
      }
    }

    const ahora = new Date();
    const resultado = Array.from(mapa.values())
      .map(r => {
        // Ordenar movimientos más recientes primero
        r.movimientos.sort((a, b) => b.fecha - a.fecha);
        const diff  = Math.floor((ahora - r.ultimaActividad) / 1000 / 60);
        const estado = diff < 30 ? 'activo' : diff < 120 ? 'reciente' : 'inactivo';
        return {
          asesor:             r.asesor,
          cuenta:             r.cuenta,
          totalMovimientos:   r.movimientos.length,
          ultimaActividad:    r.ultimaActividad,
          minutosAtras:       diff,
          estado,
          montoTotal:         Math.round(r.montoTotal * 100) / 100,
          ultimosMovimientos: r.movimientos.slice(0, 5),
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
    console.error('[live-actividad error]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

module.exports = { triggerSync, getSyncStatus, getResumenVelsaBitrix, getTablaBitrix, getLiveActividad };
