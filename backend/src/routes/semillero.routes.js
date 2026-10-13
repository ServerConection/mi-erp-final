const router = require('express').Router();
const pool = require('../config/db');
const { verificarToken } = require('../middleware/auth');
const { fechaValida } = require('../shared/gestionablesCarga');
const { fechaWebhookExpr } = require('../shared/webhookRedes');
const { esGestionableExpr, esDescarteExactoExpr } = require('../shared/etapas');

const etapa = `UPPER(REPLACE(COALESCE(NULLIF(BTRIM(w.etapa_bitrix), ''), NULLIF(BTRIM(w.etapa), ''), 'SIN ETAPA'), '_', ' '))`;
const origen = `COALESCE(NULLIF(BTRIM(w.source), ''), 'SIN ORIGEN')`;
const responsable = `COALESCE(NULLIF(BTRIM(w.responsible), ''), 'SIN RESPONSABLE')`;
const fecha = fechaWebhookExpr('w');
const esSemillero = `LOWER(BTRIM(w.empresa)) = 'semillero'`;

router.use(verificarToken);

function rango(req, res) {
  const desde = req.query.fechaDesde || req.query.desde;
  const hasta = req.query.fechaHasta || req.query.hasta;
  if (!fechaValida(desde) || !fechaValida(hasta) || desde > hasta || (Date.parse(hasta) - Date.parse(desde)) / 86400000 > 366) {
    res.status(400).json({ success: false, error: 'Seleccione un período válido de hasta 367 días' });
    return null;
  }
  return { desde, hasta };
}

function filtrosDashboard(req, desde, hasta) {
  const values = [desde, hasta];
  let where = `${esSemillero} AND ${fecha} BETWEEN $1::date AND $2::date`;
  const asesorSolicitado = Array.isArray(req.query.asesor) ? req.query.asesor[0] : String(req.query.asesor || '').split(',')[0];
  const asesor = String(req.user.perfil || '').toUpperCase() === 'ASESOR'
    ? (req.user.nombreCompleto || '__SIN_NOMBRE__')
    : asesorSolicitado;
  if (asesor) { values.push(asesor); where += ` AND UPPER(${responsable}) = UPPER($${values.length})`; }
  if (req.query.etapaCRM) { values.push(req.query.etapaCRM); where += ` AND UPPER(${etapa}) = UPPER($${values.length})`; }
  if (req.query.canal || req.query.origen) { values.push(req.query.canal || req.query.origen); where += ` AND UPPER(${origen}) = UPPER($${values.length})`; }
  return { values, where };
}

router.get('/dashboard', async (req, res) => {
  const periodo = rango(req, res);
  if (!periodo) return;
  const { values, where } = filtrosDashboard(req, periodo.desde, periodo.hasta);
  const base = `FROM public.bitrix_webhook_leads w WHERE ${where}`;
  try {
    const [asesores, embudo, embudoDia, barrasDia, origenesDia, detalle] = await Promise.all([
      pool.query(`SELECT ${responsable} AS nombre_grupo,
        COUNT(*) FILTER (WHERE ${esGestionableExpr(etapa)})::int AS gestionables,
        COUNT(*) FILTER (WHERE ${etapa} = 'VENTA SUBIDA')::int AS ventas_crm,
        COUNT(*) FILTER (WHERE ${etapa} = 'VENTA SUBIDA')::int AS ingresos_reales,
        COUNT(*) FILTER (WHERE ${etapa} = 'VENTA SUBIDA' AND ${fecha} = CURRENT_DATE)::int AS ventas_del_dia,
        COUNT(*) FILTER (WHERE ${esDescarteExactoExpr(etapa)})::int AS descarte_count,
        COUNT(*) FILTER (WHERE ${esGestionableExpr(etapa)})::int AS descarte_base, 0::int AS real_mes, 0::int AS backlog,
        0::int AS regularizacion, 0::int AS tarjeta_credito,
        CASE WHEN COUNT(*) FILTER (WHERE ${esGestionableExpr(etapa)}) > 0
          THEN ROUND(COUNT(*) FILTER (WHERE ${etapa} = 'VENTA SUBIDA') * 100.0 / COUNT(*) FILTER (WHERE ${esGestionableExpr(etapa)}), 2)
          ELSE 0 END AS eficiencia
        ${base} GROUP BY 1 ORDER BY ingresos_reales DESC, nombre_grupo`, values),
      pool.query(`SELECT ${etapa} AS etapa, COUNT(*)::int AS total ${base} GROUP BY 1 ORDER BY total DESC`, values),
      pool.query(`SELECT ${fecha}::text AS fecha, ${etapa} AS etapa, COUNT(*)::int AS total ${base} GROUP BY 1,2 ORDER BY 1,3 DESC`, values),
      pool.query(`SELECT ${fecha}::text AS fecha, COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE ${etapa} = 'VENTA SUBIDA')::int AS ventas,
        0::int AS activos ${base} GROUP BY 1 ORDER BY 1`, values),
      pool.query(`SELECT ${origen} AS origen, ${etapa} AS etapa, ${fecha}::text AS fecha, COUNT(*)::int AS total ${base} GROUP BY 1,2,3 ORDER BY 3,1,2`, values),
      pool.query(`SELECT w.bitrix_id AS "ID_BITRIX", ${responsable} AS "ASESOR_RESPONSABLE_BITRIX",
        ${responsable} AS "ASESOR", ${origen} AS "ORIGEN", ${etapa} AS "ESTADO_NETLIFE",
        ${etapa} AS "ETAPA_CRM", ${fecha}::text AS "FECHA_REGISTRO", w.phone AS "TELEFONO",
        w.city AS "CIUDAD", w.comentario AS "COMENTARIO", 'SEMILLERO'::text AS "SUPERVISOR_ASIGNADO"
        ${base} ORDER BY w.created_at DESC`, values),
    ]);
    const rows = asesores.rows;
    const supervisores = rows.length ? [{
      nombre_grupo: 'SEMILLERO',
      gestionables: rows.reduce((s, r) => s + Number(r.gestionables), 0),
      ventas_crm: rows.reduce((s, r) => s + Number(r.ventas_crm), 0),
      ingresos_reales: rows.reduce((s, r) => s + Number(r.ingresos_reales), 0),
      descarte_count: rows.reduce((s, r) => s + Number(r.descarte_count), 0),
      descarte_base: rows.reduce((s, r) => s + Number(r.descarte_base), 0),
      real_mes: 0, backlog: 0, eficiencia: 0,
    }] : [];
    const etapas = embudo.rows.map(r => r.etapa);
    const origenes = [...new Set(origenesDia.rows.map(r => r.origen))];
    res.json({
      success: true, supervisores, asesores: rows,
      dataCRM: detalle.rows, dataNetlife: detalle.rows,
      estadosNetlife: embudo.rows.map(r => ({ estado: r.etapa, total: r.total })),
      graficoEmbudo: embudo.rows, graficoEmbudoPorDia: embudoDia.rows,
      origenesEtapasDia: origenesDia.rows, periodoOrigenes: periodo,
      graficoBarrasDia: barrasDia.rows, graficoActivacionesDia: [],
      etapasCRM: etapas, etapasJotform: etapas, canales: origenes, origenes,
      porcentajeTerceraEdad: 0, porcentajeTerceraEdadProyectada: 0,
      totalTerceraEdadProyectada: 0, totalBaseTerceraEdadProyectada: 0,
      porcentajeTarjeta: 0, porcentajePlanesHasta600: 0, totalPlanesHasta600: 0,
      planesPorCategoria: {}, ventasActivas: [], ventasActivasTotal: 0,
      regularizaciones: [], backlogDetalle: [], backlogDetalleTotal: 0,
    });
  } catch (e) {
    console.error('[semillero/dashboard]', e.message);
    res.status(500).json({ success: false, error: 'No se pudieron consultar los indicadores de Semillero' });
  }
});

router.get('/activaciones-dia', (_req, res) => res.json({ success: true, rows: [] }));
router.get('/monitoreo-diario', (_req, res) => res.json({ success: true, supervisores: [], asesores: [], dataCRM: [], dataNetlife: [] }));
router.get('/reporte180', (_req, res) => res.json({ success: true, supervisores: [], asesores: [], data: [] }));
router.get('/consulta-descarga', (_req, res) => res.json({ success: true, rows: [], total: 0 }));
router.post('/force-refresh', (_req, res) => res.json({ success: true, message: 'Semillero consulta datos en tiempo real' }));

module.exports = router;
