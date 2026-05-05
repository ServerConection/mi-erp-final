const pool = require('../config/db');

const getFechaEcuador = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'America/Guayaquil' });

const getPrimerDiaMes = () => {
  const ahora = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Guayaquil' }));
  return `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-01`;
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: ejecuta todas las queries en paralelo y devuelve objeto con KPIs
// ─────────────────────────────────────────────────────────────────────────────
const buildResumen = async (view, fechaDesde, fechaHasta) => {
  const dateFilter = `
    AND DATE(created_at) >= $1::date
    AND DATE(created_at) <= $2::date
  `;

  const [
    totalRes,
    calidadRes,
    estadoRegRes,
    auditoriaRes,
    formasPagoRes,
    planesRes,
    asesoresRes,
    tendenciaRes,
    supervisoresRes,
  ] = await Promise.all([
    // 1. Total de registros
    pool.query(
      `SELECT COUNT(*) AS total FROM ${view} WHERE 1=1 ${dateFilter}`,
      [fechaDesde, fechaHasta]
    ),
    // 2. Distribución por calidad_venta
    pool.query(
      `SELECT COALESCE(UPPER(TRIM(calidad_venta)), 'SIN DATO') AS categoria,
              COUNT(*) AS cantidad
       FROM ${view}
       WHERE 1=1 ${dateFilter}
       GROUP BY categoria ORDER BY cantidad DESC`,
      [fechaDesde, fechaHasta]
    ),
    // 3. Estado de regularización
    pool.query(
      `SELECT COALESCE(UPPER(TRIM(estado_regularizacion)), 'SIN DATO') AS categoria,
              COUNT(*) AS cantidad
       FROM ${view}
       WHERE 1=1 ${dateFilter}
       GROUP BY categoria ORDER BY cantidad DESC`,
      [fechaDesde, fechaHasta]
    ),
    // 4. Auditoría de documentos
    pool.query(
      `SELECT COALESCE(UPPER(TRIM(auditoria_documentos)), 'SIN DATO') AS categoria,
              COUNT(*) AS cantidad
       FROM ${view}
       WHERE 1=1 ${dateFilter}
       GROUP BY categoria ORDER BY cantidad DESC`,
      [fechaDesde, fechaHasta]
    ),
    // 5. Formas de pago
    pool.query(
      `SELECT COALESCE(UPPER(TRIM(forma_pago)), 'SIN DATO') AS categoria,
              COUNT(*) AS cantidad
       FROM ${view}
       WHERE 1=1 ${dateFilter}
       GROUP BY categoria ORDER BY cantidad DESC`,
      [fechaDesde, fechaHasta]
    ),
    // 6. Planes (dinámico: cuenta columnas de planes no nulas)
    pool.query(
      `SELECT
         SUM(CASE WHEN plan_casa IS NOT NULL AND TRIM(plan_casa::text) <> '' THEN 1 ELSE 0 END) AS plan_casa,
         SUM(CASE WHEN plan_pyme IS NOT NULL AND TRIM(plan_pyme::text) <> '' THEN 1 ELSE 0 END) AS plan_pyme,
         SUM(CASE WHEN plan_hogar_adulto_mayor IS NOT NULL AND TRIM(plan_hogar_adulto_mayor::text) <> '' THEN 1 ELSE 0 END) AS plan_hogar_adulto_mayor,
         SUM(CASE WHEN plan_profesional IS NOT NULL AND TRIM(plan_profesional::text) <> '' THEN 1 ELSE 0 END) AS plan_profesional
       FROM ${view}
       WHERE 1=1 ${dateFilter}`,
      [fechaDesde, fechaHasta]
    ),
    // 7. Top 15 asesores por número de ventas
    pool.query(
      `SELECT
         COALESCE(nombre_completo, codigo_asesor, 'Sin nombre') AS asesor,
         COUNT(*) AS total,
         SUM(CASE WHEN UPPER(TRIM(calidad_venta)) = 'APROBADO' THEN 1 ELSE 0 END) AS aprobadas,
         SUM(CASE WHEN UPPER(TRIM(calidad_venta)) = 'RECHAZADO' THEN 1 ELSE 0 END) AS rechazadas
       FROM ${view}
       WHERE 1=1 ${dateFilter}
       GROUP BY asesor
       ORDER BY total DESC
       LIMIT 15`,
      [fechaDesde, fechaHasta]
    ),
    // 8. Tendencia diaria (últimos 30 días o rango)
    pool.query(
      `SELECT
         DATE(created_at) AS fecha,
         COUNT(*) AS total,
         SUM(CASE WHEN UPPER(TRIM(calidad_venta)) = 'APROBADO' THEN 1 ELSE 0 END) AS aprobadas
       FROM ${view}
       WHERE 1=1 ${dateFilter}
       GROUP BY DATE(created_at)
       ORDER BY fecha ASC`,
      [fechaDesde, fechaHasta]
    ),
    // 9. Por supervisor
    pool.query(
      `SELECT
         COALESCE(UPPER(TRIM(supervisor)), 'SIN SUPERVISOR') AS supervisor,
         COUNT(*) AS total,
         SUM(CASE WHEN UPPER(TRIM(calidad_venta)) = 'APROBADO' THEN 1 ELSE 0 END) AS aprobadas
       FROM ${view}
       WHERE 1=1 ${dateFilter}
       GROUP BY supervisor
       ORDER BY total DESC
       LIMIT 12`,
      [fechaDesde, fechaHasta]
    ),
  ]);

  const planesRow = planesRes.rows[0] || {};
  const planesArr = [
    { name: 'Plan Casa', value: parseInt(planesRow.plan_casa) || 0 },
    { name: 'Plan Pyme', value: parseInt(planesRow.plan_pyme) || 0 },
    { name: 'Plan Adulto Mayor', value: parseInt(planesRow.plan_hogar_adulto_mayor) || 0 },
    { name: 'Plan Profesional', value: parseInt(planesRow.plan_profesional) || 0 },
  ].filter(p => p.value > 0);

  return {
    total: parseInt(totalRes.rows[0]?.total) || 0,
    calidadVenta: calidadRes.rows.map(r => ({ name: r.categoria, value: parseInt(r.cantidad) })),
    estadoRegularizacion: estadoRegRes.rows.map(r => ({ name: r.categoria, value: parseInt(r.cantidad) })),
    auditoria: auditoriaRes.rows.map(r => ({ name: r.categoria, value: parseInt(r.cantidad) })),
    formasPago: formasPagoRes.rows.map(r => ({ name: r.categoria, value: parseInt(r.cantidad) })),
    planes: planesArr,
    asesores: asesoresRes.rows.map(r => ({
      asesor: r.asesor,
      total: parseInt(r.total),
      aprobadas: parseInt(r.aprobadas),
      rechazadas: parseInt(r.rechazadas),
    })),
    tendencia: tendenciaRes.rows.map(r => ({
      fecha: r.fecha ? String(r.fecha).substring(5, 10) : '',
      total: parseInt(r.total),
      aprobadas: parseInt(r.aprobadas),
    })),
    supervisores: supervisoresRes.rows.map(r => ({
      supervisor: r.supervisor,
      total: parseInt(r.total),
      aprobadas: parseInt(r.aprobadas),
    })),
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/analista/novonet
// ─────────────────────────────────────────────────────────────────────────────
const getResumenNovonet = async (req, res) => {
  try {
    const hoy = getFechaEcuador();
    const primerDia = getPrimerDiaMes();
    const { desde = primerDia, hasta = hoy } = req.query;

    const data = await buildResumen('public.vista_analisis_novonet', desde, hasta);

    return res.json({ success: true, desde, hasta, ...data });
  } catch (error) {
    console.error('[analista.controller] getResumenNovonet:', error);
    return res.status(500).json({ success: false, error: 'Error obteniendo resumen NOVONET' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/analista/velsa
// ─────────────────────────────────────────────────────────────────────────────
const getResumenVelsa = async (req, res) => {
  try {
    const hoy = getFechaEcuador();
    const primerDia = getPrimerDiaMes();
    const { desde = primerDia, hasta = hoy } = req.query;

    const data = await buildResumen('public.vw_jotform_velsa_netlife_completo', desde, hasta);

    return res.json({ success: true, desde, hasta, ...data });
  } catch (error) {
    console.error('[analista.controller] getResumenVelsa:', error);
    return res.status(500).json({ success: false, error: 'Error obteniendo resumen VELSA' });
  }
};

module.exports = { getResumenNovonet, getResumenVelsa };
