const pool = require('../config/db');

// ─────────────────────────────────────────────────────────────────────────────
// VENTA DE SERVICIO: misma condición de "venta activa" (estatus = ACTIVO) PERO
// solo cuenta si al menos uno de los campos de "plan" tiene datos reales.
// Si ninguna columna de plan tiene dato, es un servicio adicional (no una venta
// de producto como tal) y por lo tanto NO se cuenta como venta_servicio.
// ─────────────────────────────────────────────────────────────────────────────
const HAS_PLAN_NOVONET = `(
  (plan_casa IS NOT NULL AND TRIM(plan_casa::text) <> '') OR
  (plan_profesional IS NOT NULL AND TRIM(plan_profesional::text) <> '') OR
  (plan_pyme IS NOT NULL AND TRIM(plan_pyme::text) <> '') OR
  (plan_pyme_corp IS NOT NULL AND TRIM(plan_pyme_corp::text) <> '') OR
  (plan_hogar_adulto_mayor IS NOT NULL AND TRIM(plan_hogar_adulto_mayor::text) <> '') OR
  (plan_centro_comercial IS NOT NULL AND TRIM(plan_centro_comercial::text) <> '')
)`;
const VENTA_SERVICIO_NOVONET = `(UPPER(TRIM(estatus_netlife)) = 'ACTIVO' AND ${HAS_PLAN_NOVONET})`;

const HAS_PLAN_VELSA = `(
  (plan_casa IS NOT NULL AND TRIM(plan_casa::text) <> '') OR
  (plan_pyme IS NOT NULL AND TRIM(plan_pyme::text) <> '') OR
  (plan_profesional IS NOT NULL AND TRIM(plan_profesional::text) <> '') OR
  (plan_hogar_adulto_mayor IS NOT NULL AND TRIM(plan_hogar_adulto_mayor::text) <> '') OR
  (plan_pyme_corp IS NOT NULL AND TRIM(plan_pyme_corp::text) <> '') OR
  (plan_centro_red_comercial IS NOT NULL AND TRIM(plan_centro_red_comercial::text) <> '')
)`;
const VENTA_SERVICIO_VELSA = `(UPPER(TRIM(estado_venta_netlife)) = 'ACTIVO' AND ${HAS_PLAN_VELSA})`;

const getFechaEcuador = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'America/Guayaquil' });

const getPrimerDiaMes = () => {
  const ahora = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Guayaquil' }));
  return `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-01`;
};

// ─────────────────────────────────────────────────────────────────────────────
// RESUMEN NOVONET — vista_analisis_novonet
// Columnas confirmadas:
//   created_at, codigo_asesor, estatus_netlife, estado_regularizacion,
//   forma_pago, plan_casa, plan_profesional, plan_pyme, plan_hogar_adulto_mayor,
//   novedades_atc, provincia, ciudad
// ─────────────────────────────────────────────────────────────────────────────
const getResumenNovonet = async (req, res) => {
  try {
    const hoy = getFechaEcuador();
    const primerDia = getPrimerDiaMes();
    const { desde = primerDia, hasta = hoy } = req.query;

    const [
      totalRes, estatusRes, regularizRes, formasPagoRes,
      planesRes, asesoresRes, tendenciaRes, provinciaRes,
    ] = await Promise.all([

      // 1. Total
      pool.query(
        `SELECT
           COUNT(*) AS total,
           COUNT(*) FILTER (WHERE ${VENTA_SERVICIO_NOVONET}) AS total_venta_servicio
         FROM vista_analisis_novonet
         WHERE created_at::date BETWEEN $1::date AND $2::date`,
        [desde, hasta]
      ),

      // 2. Estatus Netlife (equivalente calidad de venta)
      pool.query(
        `SELECT COALESCE(UPPER(TRIM(estatus_netlife)), 'SIN DATO') AS categoria,
                COUNT(*) AS cantidad
         FROM vista_analisis_novonet
         WHERE created_at::date BETWEEN $1::date AND $2::date
         GROUP BY categoria ORDER BY cantidad DESC`,
        [desde, hasta]
      ),

      // 3. Estado regularización
      pool.query(
        `SELECT COALESCE(UPPER(TRIM(estado_regularizacion)), 'SIN DATO') AS categoria,
                COUNT(*) AS cantidad
         FROM vista_analisis_novonet
         WHERE created_at::date BETWEEN $1::date AND $2::date
         GROUP BY categoria ORDER BY cantidad DESC`,
        [desde, hasta]
      ),

      // 4. Formas de pago
      pool.query(
        `SELECT COALESCE(UPPER(TRIM(forma_pago)), 'SIN DATO') AS categoria,
                COUNT(*) AS cantidad
         FROM vista_analisis_novonet
         WHERE created_at::date BETWEEN $1::date AND $2::date
         GROUP BY categoria ORDER BY cantidad DESC`,
        [desde, hasta]
      ),

      // 5. Planes
      pool.query(
        `SELECT
           SUM(CASE WHEN plan_casa IS NOT NULL AND TRIM(plan_casa::text) <> '' THEN 1 ELSE 0 END)::int AS plan_casa,
           SUM(CASE WHEN plan_pyme IS NOT NULL AND TRIM(plan_pyme::text) <> '' THEN 1 ELSE 0 END)::int AS plan_pyme,
           SUM(CASE WHEN plan_hogar_adulto_mayor IS NOT NULL AND TRIM(plan_hogar_adulto_mayor::text) <> '' THEN 1 ELSE 0 END)::int AS plan_hogar,
           SUM(CASE WHEN plan_profesional IS NOT NULL AND TRIM(plan_profesional::text) <> '' THEN 1 ELSE 0 END)::int AS plan_profesional
         FROM vista_analisis_novonet
         WHERE created_at::date BETWEEN $1::date AND $2::date`,
        [desde, hasta]
      ),

      // 6. Top 15 asesores — scatter data (total + activos)
      pool.query(
        `SELECT
           COALESCE(codigo_asesor, 'Sin código') AS asesor,
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE UPPER(TRIM(estatus_netlife)) = 'ACTIVO')::int AS activos,
           COUNT(*) FILTER (WHERE ${VENTA_SERVICIO_NOVONET})::int AS venta_servicio,
           COUNT(*) FILTER (WHERE UPPER(TRIM(estado_regularizacion)) = 'REGULARIZADO')::int AS regularizados,
           ROUND(
             COUNT(*) FILTER (WHERE UPPER(TRIM(estatus_netlife)) = 'ACTIVO') * 100.0
             / NULLIF(COUNT(*), 0), 1
           ) AS pct_activo,
           ROUND(
             COUNT(*) FILTER (WHERE ${VENTA_SERVICIO_NOVONET}) * 100.0
             / NULLIF(COUNT(*), 0), 1
           ) AS pct_venta_servicio
         FROM vista_analisis_novonet
         WHERE created_at::date BETWEEN $1::date AND $2::date
         GROUP BY codigo_asesor
         ORDER BY total DESC
         LIMIT 20`,
        [desde, hasta]
      ),

      // 7. Tendencia diaria
      pool.query(
        `SELECT
           created_at::date AS fecha,
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE UPPER(TRIM(estatus_netlife)) = 'ACTIVO')::int AS activos,
           COUNT(*) FILTER (WHERE ${VENTA_SERVICIO_NOVONET})::int AS venta_servicio
         FROM vista_analisis_novonet
         WHERE created_at::date BETWEEN $1::date AND $2::date
         GROUP BY created_at::date
         ORDER BY fecha ASC`,
        [desde, hasta]
      ),

      // 8. Por provincia (top 8)
      pool.query(
        `SELECT
           COALESCE(UPPER(TRIM(provincia)), 'SIN DATO') AS provincia,
           COUNT(*)::int AS total
         FROM vista_analisis_novonet
         WHERE created_at::date BETWEEN $1::date AND $2::date
           AND provincia IS NOT NULL AND TRIM(provincia) <> ''
         GROUP BY provincia
         ORDER BY total DESC
         LIMIT 8`,
        [desde, hasta]
      ),
    ]);

    const p = planesRes.rows[0] || {};
    const planes = [
      { name: 'Casa', value: p.plan_casa || 0 },
      { name: 'Pyme', value: p.plan_pyme || 0 },
      { name: 'Adulto Mayor', value: p.plan_hogar || 0 },
      { name: 'Profesional', value: p.plan_profesional || 0 },
    ].filter(x => x.value > 0);

    return res.json({
      success: true, desde, hasta,
      total: parseInt(totalRes.rows[0]?.total) || 0,
      totalVentaServicio: parseInt(totalRes.rows[0]?.total_venta_servicio) || 0,
      calidadVenta:        estatusRes.rows.map(r => ({ name: r.categoria, value: parseInt(r.cantidad) })),
      estadoRegularizacion: regularizRes.rows.map(r => ({ name: r.categoria, value: parseInt(r.cantidad) })),
      formasPago:          formasPagoRes.rows.map(r => ({ name: r.categoria, value: parseInt(r.cantidad) })),
      planes,
      asesores: asesoresRes.rows.map(r => ({
        asesor:          r.asesor,
        total:           r.total,
        activos:         r.activos,
        ventaServicio:   r.venta_servicio,
        regularizados:   r.regularizados,
        pctActivo:       parseFloat(r.pct_activo) || 0,
        pctVentaServicio: parseFloat(r.pct_venta_servicio) || 0,
      })),
      tendencia: tendenciaRes.rows.map(r => ({
        fecha:         String(r.fecha).substring(5, 10),
        total:         r.total,
        activos:       r.activos,
        ventaServicio: r.venta_servicio,
      })),
      provincias: provinciaRes.rows.map(r => ({ name: r.provincia, value: r.total })),
    });
  } catch (error) {
    console.error('[analista] getResumenNovonet:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// RESUMEN VELSA — vw_jotform_velsa_netlife_completo
// Columnas confirmadas:
//   created_at, codigo_asesor, estado_venta_netlife, estado_regularizacion_novo,
//   forma_pago, plan_casa, plan_profesional, plan_pyme, plan_hogar_adulto_mayor,
//   provincia, ciudad
// ─────────────────────────────────────────────────────────────────────────────
const getResumenVelsa = async (req, res) => {
  try {
    const hoy = getFechaEcuador();
    const primerDia = getPrimerDiaMes();
    const { desde = primerDia, hasta = hoy } = req.query;

    const [
      totalRes, estatusRes, regularizRes, formasPagoRes,
      planesRes, asesoresRes, tendenciaRes, provinciaRes,
    ] = await Promise.all([

      // 1. Total
      pool.query(
        `SELECT
           COUNT(*) AS total,
           COUNT(*) FILTER (WHERE ${VENTA_SERVICIO_VELSA}) AS total_venta_servicio
         FROM vw_jotform_velsa_netlife_completo
         WHERE created_at::date BETWEEN $1::date AND $2::date`,
        [desde, hasta]
      ),

      // 2. Estado venta Netlife (calidad de venta)
      pool.query(
        `SELECT COALESCE(UPPER(TRIM(estado_venta_netlife)), 'SIN DATO') AS categoria,
                COUNT(*) AS cantidad
         FROM vw_jotform_velsa_netlife_completo
         WHERE created_at::date BETWEEN $1::date AND $2::date
         GROUP BY categoria ORDER BY cantidad DESC`,
        [desde, hasta]
      ),

      // 3. Estado regularización
      pool.query(
        `SELECT COALESCE(UPPER(TRIM(estado_regularizacion_novo)), 'SIN DATO') AS categoria,
                COUNT(*) AS cantidad
         FROM vw_jotform_velsa_netlife_completo
         WHERE created_at::date BETWEEN $1::date AND $2::date
         GROUP BY categoria ORDER BY cantidad DESC`,
        [desde, hasta]
      ),

      // 4. Formas de pago
      pool.query(
        `SELECT COALESCE(UPPER(TRIM(forma_pago)), 'SIN DATO') AS categoria,
                COUNT(*) AS cantidad
         FROM vw_jotform_velsa_netlife_completo
         WHERE created_at::date BETWEEN $1::date AND $2::date
         GROUP BY categoria ORDER BY cantidad DESC`,
        [desde, hasta]
      ),

      // 5. Planes
      pool.query(
        `SELECT
           SUM(CASE WHEN plan_casa IS NOT NULL AND TRIM(plan_casa::text) <> '' THEN 1 ELSE 0 END)::int AS plan_casa,
           SUM(CASE WHEN plan_pyme IS NOT NULL AND TRIM(plan_pyme::text) <> '' THEN 1 ELSE 0 END)::int AS plan_pyme,
           SUM(CASE WHEN plan_hogar_adulto_mayor IS NOT NULL AND TRIM(plan_hogar_adulto_mayor::text) <> '' THEN 1 ELSE 0 END)::int AS plan_hogar,
           SUM(CASE WHEN plan_profesional IS NOT NULL AND TRIM(plan_profesional::text) <> '' THEN 1 ELSE 0 END)::int AS plan_profesional
         FROM vw_jotform_velsa_netlife_completo
         WHERE created_at::date BETWEEN $1::date AND $2::date`,
        [desde, hasta]
      ),

      // 6. Top 20 asesores — scatter data
      pool.query(
        `SELECT
           COALESCE(codigo_asesor, 'Sin código') AS asesor,
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE UPPER(TRIM(estado_venta_netlife)) = 'ACTIVO')::int AS activos,
           COUNT(*) FILTER (WHERE ${VENTA_SERVICIO_VELSA})::int AS venta_servicio,
           ROUND(
             COUNT(*) FILTER (WHERE UPPER(TRIM(estado_venta_netlife)) = 'ACTIVO') * 100.0
             / NULLIF(COUNT(*), 0), 1
           ) AS pct_activo,
           ROUND(
             COUNT(*) FILTER (WHERE ${VENTA_SERVICIO_VELSA}) * 100.0
             / NULLIF(COUNT(*), 0), 1
           ) AS pct_venta_servicio
         FROM vw_jotform_velsa_netlife_completo
         WHERE created_at::date BETWEEN $1::date AND $2::date
         GROUP BY codigo_asesor
         ORDER BY total DESC
         LIMIT 20`,
        [desde, hasta]
      ),

      // 7. Tendencia diaria
      pool.query(
        `SELECT
           created_at::date AS fecha,
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE UPPER(TRIM(estado_venta_netlife)) = 'ACTIVO')::int AS activos,
           COUNT(*) FILTER (WHERE ${VENTA_SERVICIO_VELSA})::int AS venta_servicio
         FROM vw_jotform_velsa_netlife_completo
         WHERE created_at::date BETWEEN $1::date AND $2::date
         GROUP BY created_at::date
         ORDER BY fecha ASC`,
        [desde, hasta]
      ),

      // 8. Por provincia (top 8)
      pool.query(
        `SELECT
           COALESCE(UPPER(TRIM(provincia)), 'SIN DATO') AS provincia,
           COUNT(*)::int AS total
         FROM vw_jotform_velsa_netlife_completo
         WHERE created_at::date BETWEEN $1::date AND $2::date
           AND provincia IS NOT NULL AND TRIM(provincia) <> ''
         GROUP BY provincia
         ORDER BY total DESC
         LIMIT 8`,
        [desde, hasta]
      ),
    ]);

    const p = planesRes.rows[0] || {};
    const planes = [
      { name: 'Casa', value: p.plan_casa || 0 },
      { name: 'Pyme', value: p.plan_pyme || 0 },
      { name: 'Adulto Mayor', value: p.plan_hogar || 0 },
      { name: 'Profesional', value: p.plan_profesional || 0 },
    ].filter(x => x.value > 0);

    return res.json({
      success: true, desde, hasta,
      total: parseInt(totalRes.rows[0]?.total) || 0,
      totalVentaServicio: parseInt(totalRes.rows[0]?.total_venta_servicio) || 0,
      calidadVenta:         estatusRes.rows.map(r => ({ name: r.categoria, value: parseInt(r.cantidad) })),
      estadoRegularizacion: regularizRes.rows.map(r => ({ name: r.categoria, value: parseInt(r.cantidad) })),
      formasPago:           formasPagoRes.rows.map(r => ({ name: r.categoria, value: parseInt(r.cantidad) })),
      planes,
      asesores: asesoresRes.rows.map(r => ({
        asesor:           r.asesor,
        total:            r.total,
        activos:          r.activos,
        ventaServicio:    r.venta_servicio,
        pctActivo:        parseFloat(r.pct_activo) || 0,
        pctVentaServicio: parseFloat(r.pct_venta_servicio) || 0,
      })),
      tendencia: tendenciaRes.rows.map(r => ({
        fecha:         String(r.fecha).substring(5, 10),
        total:         r.total,
        activos:       r.activos,
        ventaServicio: r.venta_servicio,
      })),
      provincias: provinciaRes.rows.map(r => ({ name: r.provincia, value: r.total })),
    });
  } catch (error) {
    console.error('[analista] getResumenVelsa:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = { getResumenNovonet, getResumenVelsa };
