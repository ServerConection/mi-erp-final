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

// ── GET /api/bitrix/velsa/tabla ───────────────────────────────────────────────
// Tabla consumible completa: deals cruzados con etapas, usuarios y campos custom.
// Parámetros: ?desde=YYYY-MM-DD&hasta=YYYY-MM-DD&etapa=&asesor_id=&estado=&limit=&offset=
const getTablaBitrix = async (req, res) => {
  try {
    const hoy      = getFechaEcuador();
    const primerDia = getPrimerDiaMes();
    const {
      desde   = primerDia,
      hasta   = hoy,
      etapa   = null,
      asesor_id = null,
      estado  = null,   // 'ganado' | 'perdido' | 'proceso'
      limit   = 1000,
      offset  = 0,
    } = req.query;

    const CAT = 8;

    // Construir filtros dinámicos
    const conditions = [
      `d.category_id = ${CAT}`,
      `d.fecha_creacion::date BETWEEN '${desde}'::date AND '${hasta}'::date`,
    ];
    if (etapa)     conditions.push(`d.stage_id = '${etapa.replace(/'/g,"''")}'`);
    if (asesor_id) conditions.push(`d.asesor_id = ${parseInt(asesor_id)}`);
    if (estado === 'ganado')  conditions.push(`d.ganado = true`);
    if (estado === 'perdido') conditions.push(`d.perdido = true`);
    if (estado === 'proceso') conditions.push(`d.ganado = false AND d.perdido = false`);

    const WHERE = conditions.join(' AND ');

    const [rowsRes, countRes, camposRes] = await Promise.all([
      // Filas enriquecidas
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
          -- Campos custom mapeados
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
          COALESCE(d.campos_custom->>'innegociable',       '') AS innegociable
        FROM bitrix_deals d
        LEFT JOIN bitrix_categorias bc ON bc.id      = d.category_id
        LEFT JOIN bitrix_etapas     be ON be.status_id = d.stage_id
        LEFT JOIN bitrix_usuarios   u  ON u.id       = d.asesor_id
        WHERE ${WHERE}
        ORDER BY d.fecha_creacion DESC
        LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}
      `),

      // Total para paginación
      pool.query(`
        SELECT COUNT(*)::int AS total
        FROM bitrix_deals d
        WHERE ${WHERE}
      `),

      // Claves UF_ reales presentes en la DB (para diagnóstico)
      pool.query(`
        SELECT DISTINCT jsonb_object_keys(campos_custom) AS clave
        FROM bitrix_deals
        WHERE category_id = ${CAT}
          AND campos_custom != '{}'
        ORDER BY clave
        LIMIT 80
      `),
    ]);

    return res.json({
      success:     true,
      desde,
      hasta,
      total:       countRes.rows[0]?.total || 0,
      limit:       parseInt(limit),
      offset:      parseInt(offset),
      campos_uf:   camposRes.rows.map(r => r.clave),  // debug: campos UF presentes
      filas:       rowsRes.rows,
    });

  } catch (err) {
    console.error('[bitrix] getTablaBitrix:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
};

module.exports = { triggerSync, getSyncStatus, getResumenVelsaBitrix, getTablaBitrix };
