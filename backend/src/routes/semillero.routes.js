const router = require('express').Router();
const pool = require('../config/db');
const { verificarToken } = require('../middleware/auth');
const { fechaValida } = require('../shared/gestionablesCarga');
const { fechaWebhookExpr } = require('../shared/webhookRedes');
const { esLeadTotalExpr, esGestionableExpr, esDescarteExactoExpr } = require('../shared/etapas');
const { reconciliarLeads } = require('../services/reconciliacionBitrix.service');
const { consultarDetalleJotform } = require('../shared/detalleJotformEnviosVentas');

const etapa = `UPPER(REPLACE(COALESCE(NULLIF(BTRIM(w.etapa_bitrix), ''), NULLIF(BTRIM(w.etapa), ''), 'SIN ETAPA'), '_', ' '))`;
const origen = `COALESCE(NULLIF(BTRIM(w.source), ''), 'SIN ORIGEN')`;
const responsable = `COALESCE(NULLIF(BTRIM(w.responsible), ''), 'SIN RESPONSABLE')`;
const fecha = fechaWebhookExpr('w');
const supervisor = `COALESCE((
  SELECT NULLIF(BTRIM(m.supervisor), '')
  FROM public.metas_asesor m
  WHERE m.empresa = 'SEMILLERO' AND m.activo
    AND m.anio = EXTRACT(YEAR FROM $2::date)::int
    AND m.mes = EXTRACT(MONTH FROM $2::date)::int
    AND UPPER(BTRIM(m.asesor)) = UPPER(BTRIM(w.responsible))
  ORDER BY m.actualizado_en DESC LIMIT 1
), (
  SELECT NULLIF(BTRIM(e.supervisor), '')
  FROM public.empleados e
  WHERE UPPER(BTRIM(e.nombre_completo)) = UPPER(BTRIM(w.responsible))
  ORDER BY
    CASE WHEN BTRIM(e.codigo) = EXTRACT(MONTH FROM $2::date)::text THEN 0 ELSE 1 END,
    CASE WHEN BTRIM(e.codigo) ~ '^\\d+$' THEN BTRIM(e.codigo)::int ELSE -1 END DESC
  LIMIT 1
), 'SIN SUPERVISOR')`;
const CATEGORIA_SEMILLERO = '41';
// Semillero corresponde exclusivamente al pipeline 41. Se conservan los datos
// históricos que aún no tienen categoría, salvo CONTACTO NUEVO: esos registros
// antiguos quedaron congelados aunque el negocio avanzó en Bitrix. Los eventos
// nuevos ya llegan marcados con categoría 41 y sí cuentan normalmente.
const esSemillero = `(LOWER(BTRIM(w.empresa)) = 'semillero'
  AND (
    BTRIM(COALESCE(w.categoria_id, '')) = '${CATEGORIA_SEMILLERO}'
    OR (
      NULLIF(BTRIM(w.categoria_id), '') IS NULL
      AND ${etapa} <> 'CONTACTO NUEVO'
    )
  ))`;

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

const normalizar = (valor) => String(valor || '').trim().toUpperCase().replace(/\s+/g, ' ');
const ESTADOS_JOT_EXCLUIDOS = new Set(['PRESERVICIO', 'FIN DE GESTION', 'FIN DE GESTIÓN', 'DESISTE DE SERVICIO', 'DESISTE DEL SERVICIO', 'DESCARTE DE SERVICIO', 'DESCARTE DEL SERVICIO', 'DUPLICADO', 'DUPLLICADO', 'SIN ASUNTO', 'SIN DATOS']);
const ESTADOS_JOT_ACIDOS = new Set(['ACTIVO', 'ASIGNADO', 'PREPLANIFICADO']);
const fechaIso = (valor) => {
  const texto = String(valor || '').trim();
  const dmy = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  return texto.match(/^\d{4}-\d{2}-\d{2}/)?.[0] || '';
};

function resumenJotform(filas, desde, hasta) {
  const porAsesor = new Map();
  const estados = new Map();
  const activaciones = new Map();
  const planes = {
    hogar: { ingresados: 0, activos: 0 },
    pymes: { ingresados: 0, activos: 0 },
    adulto_mayor: { ingresados: 0, activos: 0 },
  };
  let tarjetas = 0, terceraEdad = 0, terceraProyectada = 0, baseTerceraProyectada = 0, planesHasta600 = 0;
  const ventasActivas = [];
  const regularizaciones = [];
  for (const fila of filas) {
    const asesor = normalizar(fila.ASESOR) || 'SIN RESPONSABLE';
    if (!porAsesor.has(asesor)) porAsesor.set(asesor, {
      nombre: fila.ASESOR || 'SIN RESPONSABLE', supervisor: fila.SUPERVISOR_ASIGNADO || 'SIN SUPERVISOR',
      ingresos_reales: 0, ingresos_jot_efectivo: 0, ingresos_jot_acido: 0,
      real_mes: 0, activa_mes: 0, por_regularizar: 0, tarjeta_credito: 0,
      tercera_edad_n: 0, planes_150_200_n: 0,
    });
    const acc = porAsesor.get(asesor);
    const estado = normalizar(fila.ESTADO_NETLIFE) || 'SIN ESTADO';
    const fechaActivacion = fechaIso(fila.FECHA_ACTIVACION);
    const activaEnPeriodo = estado === 'ACTIVO' && fechaActivacion >= desde && fechaActivacion <= hasta;
    acc.ingresos_reales++;
    if (!ESTADOS_JOT_EXCLUIDOS.has(estado)) acc.ingresos_jot_efectivo++;
    if (ESTADOS_JOT_ACIDOS.has(estado)) acc.ingresos_jot_acido++;
    if (activaEnPeriodo) { acc.real_mes++; acc.activa_mes++; ventasActivas.push(fila); activaciones.set(fechaActivacion, (activaciones.get(fechaActivacion) || 0) + 1); }
    if (normalizar(fila.ESTADO_REGULARIZACION).replace(/^[\[\]"]+|[\[\]"]+$/g, '') === 'POR REGULARIZAR' && !['FUERA DE COBERTURA', 'DESISTE DEL SERVICIO', 'RECHAZADO'].includes(estado)) {
      acc.por_regularizar++; regularizaciones.push(fila);
    }
    if (normalizar(fila.FORMA_PAGO).includes('TARJETA DE CREDITO')) { acc.tarjeta_credito++; tarjetas++; }
    const aplicaTercera = normalizar(fila.APLICA_DESCUENTO).includes('TERCERA EDAD') || ['SI', 'SÍ'].includes(normalizar(fila.APLICA_DESCUENTO));
    if (aplicaTercera) { terceraEdad++; acc.tercera_edad_n++; }
    if (ESTADOS_JOT_ACIDOS.has(estado)) { baseTerceraProyectada++; if (aplicaTercera) terceraProyectada++; }
    const plan = normalizar(fila.TIPO_PLAN);
    const categoria = plan.includes('ADULTO') ? 'adulto_mayor' : plan.includes('PYME') || plan.includes('PROFESIONAL') || plan.includes('CORP') ? 'pymes' : 'hogar';
    planes[categoria].ingresados++;
    if (activaEnPeriodo) planes[categoria].activos++;
    const velocidadTexto = String(fila.VELOCIDAD || '');
    const velocidad = Number(velocidadTexto.match(/[0-9]+(?:[.,][0-9]+)?/)?.[0]?.replace(',', '.'));
    const mbps = /GBPS?/i.test(velocidadTexto) ? velocidad * 1000 : velocidad;
    if (estado === 'ACTIVO' && Number.isFinite(mbps) && mbps > 0 && mbps <= 600) planesHasta600++;
    if (Number.isFinite(mbps) && [150, 200].includes(mbps)) acc.planes_150_200_n++;
    estados.set(estado, (estados.get(estado) || 0) + 1);
  }
  const total = filas.length;
  return {
    porAsesor, planes, ventasActivas, regularizaciones,
    estadosNetlife: [...estados.entries()].map(([estado, cantidad]) => ({ estado, total: cantidad })).sort((a, b) => b.total - a.total),
    etapasJotform: [...estados.keys()],
    graficoActivacionesDia: [...activaciones.entries()].map(([fecha, activaciones]) => ({ fecha, activaciones })).sort((a, b) => a.fecha.localeCompare(b.fecha)),
    porcentajeTarjeta: total ? Number((tarjetas * 100 / total).toFixed(2)) : 0,
    porcentajeTerceraEdad: total ? Number((terceraEdad * 100 / total).toFixed(2)) : 0,
    porcentajeTerceraEdadProyectada: baseTerceraProyectada ? Number((terceraProyectada * 100 / baseTerceraProyectada).toFixed(2)) : 0,
    totalTerceraEdadProyectada: terceraProyectada, totalBaseTerceraEdadProyectada: baseTerceraProyectada,
    totalPlanesHasta600: planesHasta600,
    porcentajePlanesHasta600: total ? Number((planesHasta600 * 100 / total).toFixed(2)) : 0,
  };
}

router.get('/dashboard', async (req, res) => {
  const periodo = rango(req, res);
  if (!periodo) return;
  const { values, where } = filtrosDashboard(req, periodo.desde, periodo.hasta);
  const base = `FROM public.bitrix_webhook_leads w WHERE ${where}`;
  try {
    const [asesores, embudo, embudoDia, barrasDia, origenesDia, detalle, detalleJotform] = await Promise.all([
      pool.query(`SELECT ${responsable} AS nombre_grupo, ${supervisor} AS supervisor,
        COUNT(*) FILTER (WHERE ${esLeadTotalExpr(etapa)})::int AS leads_totales,
        COUNT(*) FILTER (WHERE ${esGestionableExpr(etapa)})::int AS gestionables,
        COUNT(*) FILTER (WHERE ${etapa} = 'VENTA SUBIDA')::int AS ventas_crm,
        COUNT(*) FILTER (WHERE ${etapa} = 'VENTA SUBIDA')::int AS ingresos_reales,
        COUNT(*) FILTER (WHERE ${etapa} = 'VENTA SUBIDA' AND ${fecha} = CURRENT_DATE)::int AS ventas_del_dia,
        COUNT(*) FILTER (WHERE ${esDescarteExactoExpr(etapa)})::int AS descarte_count,
        COUNT(*) FILTER (WHERE ${etapa} ~ '^ATC([ /-]?SOPORTE)?$')::int AS atc_n,
        COUNT(*) FILTER (WHERE ${etapa} = 'FUERA DE COBERTURA')::int AS fuera_cobertura_n,
        COUNT(*) FILTER (WHERE ${etapa} IN ('ZONA PELIGROSA', 'ZONAS PELIGROSAS'))::int AS zona_peligrosa_n,
        COUNT(*) FILTER (WHERE ${esGestionableExpr(etapa)})::int AS descarte_base, 0::int AS real_mes, 0::int AS backlog,
        0::int AS regularizacion, 0::int AS tarjeta_credito,
        CASE WHEN COUNT(*) FILTER (WHERE ${esGestionableExpr(etapa)}) > 0
          THEN ROUND(COUNT(*) FILTER (WHERE ${etapa} = 'VENTA SUBIDA') * 100.0 / COUNT(*) FILTER (WHERE ${esGestionableExpr(etapa)}), 2)
          ELSE 0 END AS eficiencia
        ${base} GROUP BY 1, 2 ORDER BY ingresos_reales DESC, nombre_grupo`, values),
      pool.query(`SELECT ${etapa} AS etapa, COUNT(*)::int AS total ${base} GROUP BY 1 ORDER BY total DESC`, values),
      pool.query(`SELECT ${fecha}::text AS fecha, ${etapa} AS etapa, COUNT(*)::int AS total ${base} GROUP BY 1,2 ORDER BY 1,3 DESC`, values),
      pool.query(`SELECT ${fecha}::text AS fecha, COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE ${etapa} = 'VENTA SUBIDA')::int AS ventas,
        0::int AS activos ${base} GROUP BY 1 ORDER BY 1`, values),
      pool.query(`SELECT ${origen} AS origen, ${etapa} AS etapa, ${fecha}::text AS fecha, COUNT(*)::int AS total ${base} GROUP BY 1,2,3 ORDER BY 3,1,2`, values),
      pool.query(`SELECT 'SEMILLERO'::text AS "DISTRIBUIDOR", w.bitrix_id AS "ID_BITRIX", ${responsable} AS "ASESOR_RESPONSABLE_BITRIX",
        ${responsable} AS "ASESOR", ${origen} AS "ORIGEN", ${etapa} AS "ESTADO_NETLIFE",
        ${etapa} AS "ETAPA_CRM", ${fecha}::text AS "FECHA_REGISTRO", w.phone AS "TELEFONO",
        w.city AS "CIUDAD", w.comentario AS "COMENTARIO", 'SEMILLERO'::text AS "SUPERVISOR_ASIGNADO"
        ${base} ORDER BY w.created_at DESC`, values),
      consultarDetalleJotform(pool, 'semillero', req.query),
    ]);
    const resumenJot = resumenJotform(detalleJotform, periodo.desde, periodo.hasta);
    const rows = asesores.rows.map((row) => {
      const jot = resumenJot.porAsesor.get(normalizar(row.nombre_grupo));
      const valoresJot = jot || { ingresos_reales: 0, ingresos_jot_efectivo: 0, ingresos_jot_acido: 0,
        real_mes: 0, activa_mes: 0, por_regularizar: 0, tarjeta_credito: 0,
        tercera_edad_n: 0, planes_150_200_n: 0 };
      return { ...row, ...valoresJot, nombre_grupo: row.nombre_grupo, supervisor: row.supervisor };
    });
    for (const [clave, jot] of resumenJot.porAsesor) {
      if (rows.some((row) => normalizar(row.nombre_grupo) === clave)) continue;
      rows.push({ nombre_grupo: jot.nombre, supervisor: jot.supervisor, leads_totales: 0, gestionables: 0,
        ventas_crm: 0, ventas_del_dia: 0, descarte_count: 0, descarte_base: 0,
        atc_n: 0, fuera_cobertura_n: 0, zona_peligrosa_n: 0, ...jot });
    }
    const porSupervisor = new Map();
    for (const row of rows) {
      const nombre = row.supervisor || 'SIN SUPERVISOR';
      if (!porSupervisor.has(nombre)) {
        porSupervisor.set(nombre, {
          nombre_grupo: nombre, supervisor: nombre,
          leads_totales: 0, gestionables: 0, ventas_crm: 0,
          ingresos_reales: 0, descarte_count: 0, descarte_base: 0,
          atc_n: 0, fuera_cobertura_n: 0, zona_peligrosa_n: 0,
          real_mes: 0, backlog: 0, eficiencia: 0,
        });
      }
      const grupo = porSupervisor.get(nombre);
      for (const campo of ['leads_totales', 'gestionables', 'ventas_crm', 'ingresos_reales', 'ingresos_jot_efectivo', 'ingresos_jot_acido', 'real_mes', 'activa_mes', 'por_regularizar', 'tarjeta_credito', 'tercera_edad_n', 'planes_150_200_n', 'descarte_count', 'descarte_base', 'atc_n', 'fuera_cobertura_n', 'zona_peligrosa_n']) {
        grupo[campo] = Number(grupo[campo] || 0) + Number(row[campo] || 0);
      }
    }
    const supervisores = [...porSupervisor.values()].sort((a, b) => b.leads_totales - a.leads_totales);
    const etapas = embudo.rows.map(r => r.etapa);
    const origenes = [...new Set(origenesDia.rows.map(r => r.origen))];
    res.json({
      success: true, supervisores, asesores: rows,
      dataCRM: detalle.rows, dataNetlife: detalleJotform,
      estadosNetlife: resumenJot.estadosNetlife,
      graficoEmbudo: embudo.rows, graficoEmbudoPorDia: embudoDia.rows,
      origenesEtapasDia: origenesDia.rows, periodoOrigenes: periodo,
      graficoBarrasDia: barrasDia.rows, graficoActivacionesDia: resumenJot.graficoActivacionesDia,
      etapasCRM: etapas, etapasJotform: resumenJot.etapasJotform, canales: origenes, origenes,
      porcentajeTerceraEdad: resumenJot.porcentajeTerceraEdad,
      porcentajeTerceraEdadProyectada: resumenJot.porcentajeTerceraEdadProyectada,
      totalTerceraEdadProyectada: resumenJot.totalTerceraEdadProyectada,
      totalBaseTerceraEdadProyectada: resumenJot.totalBaseTerceraEdadProyectada,
      porcentajeTarjeta: resumenJot.porcentajeTarjeta,
      porcentajePlanesHasta600: resumenJot.porcentajePlanesHasta600,
      totalPlanesHasta600: resumenJot.totalPlanesHasta600,
      planesPorCategoria: resumenJot.planes,
      ventasActivas: resumenJot.ventasActivas, ventasActivasTotal: resumenJot.ventasActivas.length,
      regularizaciones: resumenJot.regularizaciones, backlogDetalle: [], backlogDetalleTotal: 0,
    });
  } catch (e) {
    console.error('[semillero/dashboard]', e.message);
    res.status(500).json({ success: false, error: 'No se pudieron consultar los indicadores de Semillero' });
  }
});

router.get('/activaciones-dia', async (req, res) => {
  const desde = req.query.fechaDesde || req.query.desde;
  const hasta = req.query.fechaHasta || req.query.hasta;
  if (!fechaValida(desde) || !fechaValida(hasta) || desde > hasta) {
    return res.status(400).json({ success: false, error: 'Seleccione un período válido' });
  }
  const values = [desde, hasta];
  let filtroEstado = '';
  if (req.query.estado) { values.push(`%${req.query.estado}%`); filtroEstado = ` AND e.netlife_estatus_real ILIKE $${values.length}`; }
  try {
    const { rows } = await pool.query(`
      SELECT public.parse_fecha_flex(e.fecha_activacion_netlife::text)::text AS fecha, COUNT(*)::int AS activaciones
      FROM public.envios_ventas e
      WHERE UPPER(BTRIM(e.distribuidor_autorizado)) = 'SEMILLERO'
        AND e.estatus_envio IS DISTINCT FROM 'BORRADOR'
        AND public.parse_fecha_flex(e.fecha_activacion_netlife::text) BETWEEN $1::date AND $2::date
        ${filtroEstado}
      GROUP BY 1 ORDER BY 1`, values);
    return res.json({ success: true, rows });
  } catch (e) {
    console.error('[semillero/activaciones-dia]', e.message);
    return res.status(500).json({ success: false, error: 'No se pudieron consultar las activaciones de Semillero' });
  }
});
router.get('/monitoreo-diario', (_req, res) => res.json({ success: true, supervisores: [], asesores: [], dataCRM: [], dataNetlife: [] }));
router.get('/reporte180', (_req, res) => res.json({ success: true, supervisores: [], asesores: [], data: [] }));
router.get('/consulta-descarga', async (req, res) => {
  const periodo = rango(req, res);
  if (!periodo) return;
  const values = [periodo.desde, periodo.hasta];
  let where = `${esSemillero} AND ${fecha} BETWEEN $1::date AND $2::date`;
  const agregar = (valor, expresion) => {
    const limpio = String(valor || '').trim();
    if (!limpio) return;
    values.push(`%${limpio}%`);
    where += ` AND (${expresion}) ILIKE $${values.length}`;
  };
  agregar(req.query.asesor, `${responsable} || ' ' || COALESCE(w.responsible, '')`);
  agregar(req.query.loginNetlife, `''`);
  agregar(req.query.idBitrix, `COALESCE(w.bitrix_id::text, '')`);
  agregar(req.query.busquedaGeneral, `${responsable} || ' ' || COALESCE(w.bitrix_id::text, '') || ' ' || ${etapa}`);
  try {
    const { rows } = await pool.query(`
      SELECT
        'SEMILLERO'::text AS "DISTRIBUIDOR",
        w.bitrix_id AS "ID_CRM", w.bitrix_id AS "ID_JOT",
        ${etapa} AS "ETAPA", ${fecha}::text AS "FECHA_CREACION",
        ${responsable} AS "ASESOR", 'ADRIANA SALVATORE'::text AS "SUPERVISOR_ASIGNADO",
        ${origen} AS "ORIGEN", ${fecha}::text AS "FECHA_CREACION_JOT",
        NULL::text AS "FECHA_ASIGNACION", NULLIF(w.fecha_venta_subida, '') AS "FECHA_ACTIVACION",
        NULL::text AS "COD_ASESOR_JOT", ${responsable} AS "ASESOR_USUARIO",
        NULL::text AS "LOGIN", ${etapa} AS "ESTADO_NETLIFE",
        NULL::text AS "INGRESO_TELCOS", NULL::text AS "ESTADO_REGULARIZACION",
        NULL::text AS "OBSERV_REGULARIZACION", w.comentario AS "NOVEDADES_ATC",
        NULL::text AS "TIPO_PLAN", NULL::text AS "VELOCIDAD",
        NULL::text AS "EMPAQUETADO", NULL::text AS "SERVICIO_ADICIONAL_FACTURADO",
        NULL::text AS "FORMA_PAGO", NULL::text AS "APLICA_DESCUENTO",
        w.comentario AS "OBSERVACION"
      FROM public.bitrix_webhook_leads w
      WHERE ${where}
      ORDER BY w.created_at DESC
      LIMIT 100000
    `, values);
    res.json({ success: true, rows, registros: rows, total: rows.length });
  } catch (e) {
    console.error('[semillero/consulta-descarga]', e.message);
    res.status(500).json({ success: false, error: 'No se pudo consultar el detalle de Semillero' });
  }
});
router.post('/force-refresh', async (req, res) => {
  const desde = fechaValida(req.query.fechaDesde) ? req.query.fechaDesde : undefined;
  const hasta = fechaValida(req.query.fechaHasta) ? req.query.fechaHasta : undefined;
  try {
    const resultado = await reconciliarLeads({
      empresa: 'semillero',
      categoria: CATEGORIA_SEMILLERO,
      filtrarPorCategoria: true,
      campoFecha: 'DATE_CREATE',
      soloEtapas: true,
      depurarCategoria: true,
      cursorRapido: true,
      desde,
      hasta,
      aplicar: true,
      log: () => {},
    });
    res.json({ success: true, message: 'Semillero sincronizado con Bitrix', resultado });
  } catch (e) {
    console.error('[semillero/force-refresh]', e.message);
    res.status(500).json({ success: false, error: 'No se pudo sincronizar Semillero con Bitrix' });
  }
});

module.exports = router;
