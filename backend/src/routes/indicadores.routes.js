const express = require('express');
const router = express.Router();

const {
  getIndicadoresDashboard,
  getMonitoreoDiario,
  getReporte180,
  getConsultaDescargaNovonet,
  getActivacionesPorDia,
  forceRefreshNovonet
} = require('../controllers/indicadores.controller');
const {
  getEfectividadDiariaNovonet,
  getAgenciasEfectividadNovonet,
} = require('../controllers/efectividadDiaria.controller');
const { verificarToken } = require('../middleware/auth');
const pool = require('../config/db');
const { consultarDetalleJotform } = require('../shared/detalleJotformEnviosVentas');
const { fechaWebhookExpr } = require('../shared/webhookRedes');

async function consultarDetallePipelineWebhook(empresa, categoria, distribuidor, query = {}) {
  const { fechaDesde, fechaHasta } = query;
  if (!fechaDesde || !fechaHasta) {
    throw Object.assign(new Error('Parámetros fechaDesde y fechaHasta requeridos'), { status: 400 });
  }

  const values = [fechaDesde, fechaHasta, empresa, categoria, distribuidor];
  let filtros = '';
  const agregar = (valor, expresion) => {
    const limpio = String(valor || '').trim();
    if (!limpio) return;
    values.push(`%${limpio}%`);
    filtros += ` AND (${expresion}) ILIKE $${values.length}`;
  };
  agregar(query.asesor, `COALESCE(w.responsible, '')`);
  // Estos pipelines todavía no tienen login Netlife. Si se filtra por login,
  // no deben aparecer como falsos positivos en el consolidado.
  agregar(query.loginNetlife, `''`);
  agregar(query.idBitrix, `COALESCE(w.bitrix_id::text, '')`);
  agregar(query.busquedaGeneral, `COALESCE(w.responsible, '') || ' ' || COALESCE(w.bitrix_id::text, '') || ' ' || COALESCE(w.etapa_bitrix, w.etapa, '')`);
  if (query.fechaActivacionDesde) {
    values.push(query.fechaActivacionDesde);
    filtros += ` AND public.parse_fecha_flex(NULLIF(w.fecha_venta_subida, '')) >= $${values.length}::date`;
  }
  if (query.fechaActivacionHasta) {
    values.push(query.fechaActivacionHasta);
    filtros += ` AND public.parse_fecha_flex(NULLIF(w.fecha_venta_subida, '')) <= $${values.length}::date`;
  }
  const filtroCategoria = empresa === 'semillero'
    ? `(BTRIM(COALESCE(w.categoria_id, '')) = $4 OR (
         NULLIF(BTRIM(w.categoria_id), '') IS NULL
         AND UPPER(REPLACE(COALESCE(NULLIF(BTRIM(w.etapa_bitrix), ''), NULLIF(BTRIM(w.etapa), ''), 'SIN ETAPA'), '_', ' ')) <> 'CONTACTO NUEVO'
       ))`
    : `BTRIM(COALESCE(w.categoria_id, '')) = $4`;
  // Debe usar exactamente las mismas reglas que las consultas individuales
  // de Semillero y Venta en Línea. Antes el consolidado usaba created_at y un
  // supervisor genérico, por lo que el resultado Master no coincidía con la
  // suma de los reportes descargados por separado.
  const fecha = fechaWebhookExpr('w');
  const supervisor = empresa === 'semillero'
    ? `'ADRIANA SALVATORE'::text`
    : `COALESCE((
        SELECT NULLIF(BTRIM(m.supervisor), '')
        FROM public.metas_asesor m
        WHERE m.empresa = 'VENTAENLINEA' AND m.activo
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

  const { rows } = await pool.query(`
    SELECT
      $5::text AS "DISTRIBUIDOR",
      w.bitrix_id AS "ID_CRM", NULL::text AS "ID_JOT",
      UPPER(REPLACE(COALESCE(NULLIF(BTRIM(w.etapa_bitrix), ''), NULLIF(BTRIM(w.etapa), ''), 'SIN ETAPA'), '_', ' ')) AS "ETAPA",
      ${fecha}::text AS "FECHA_CREACION",
      COALESCE(NULLIF(BTRIM(w.responsible), ''), 'SIN RESPONSABLE') AS "ASESOR",
      ${supervisor} AS "SUPERVISOR_ASIGNADO",
      COALESCE(NULLIF(BTRIM(w.source), ''), 'SIN ORIGEN') AS "ORIGEN",
      NULL::text AS "FECHA_CREACION_JOT",
      NULL::text AS "FECHA_ASIGNACION", NULLIF(w.fecha_venta_subida, '') AS "FECHA_ACTIVACION",
      NULL::text AS "COD_ASESOR_JOT", NULL::text AS "ASESOR_USUARIO",
      NULL::text AS "LOGIN",
      NULL::text AS "ESTADO_NETLIFE",
      NULL::text AS "INGRESO_TELCOS", NULL::text AS "ESTADO_REGULARIZACION",
      NULL::text AS "OBSERV_REGULARIZACION", w.comentario AS "NOVEDADES_ATC",
      NULL::text AS "TIPO_PLAN", NULL::text AS "VELOCIDAD", NULL::text AS "EMPAQUETADO",
      NULL::text AS "SERVICIO_ADICIONAL_FACTURADO", NULL::text AS "FORMA_PAGO",
      NULL::text AS "APLICA_DESCUENTO", w.comentario AS "OBSERVACION"
    FROM public.bitrix_webhook_leads w
    WHERE ${fecha} BETWEEN $1::date AND $2::date
      AND LOWER(BTRIM(w.empresa)) = $3
      AND ${filtroCategoria}
      ${filtros}
    ORDER BY w.created_at DESC
    LIMIT 100000
  `, values);
  return rows;
}

const normalizarPerfil = valor => String(valor || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .trim().replace(/\s+/g, ' ').toUpperCase();

const puedeConsultaMaster = req => {
  const perfil = normalizarPerfil(req.user?.perfil);
  return perfil === 'ADMIN'
    || /^ADMINISTRADOR(?:A)?(?:[ _-].*)?$/.test(perfil)
    || /^GEREN(?:CIA|TE|TA|CIAL)(?:[ _-].*)?$/.test(perfil)
    || /^ANALISTA(?:[ _-].*)?$/.test(perfil);
};

// /dashboard requiere sesión: alimenta la Vista Asesor y debe saber QUIÉN
// está pidiendo los datos para poder forzar el filtro a su propio nombre
// cuando el perfil es ASESOR (ver getIndicadoresDashboard).
// SEGURIDAD (2026-09): todos estos endpoints devuelven datos comerciales y de
// clientes de Novonet y estaban PUBLICOS: solo /dashboard exigia token. Con la
// URL cualquiera bajaba /consulta-descarga o disparaba /force-refresh contra la
// vista materializada. El CORS no protege esto (solo aplica a navegadores).
// Se exige token para TODO el router; el frontend ya manda el Bearer en cada
// fetch (ver frontend/src/utils/sesion.js).
router.use(verificarToken);

router.get('/dashboard', getIndicadoresDashboard);
router.get('/monitoreo-diario', getMonitoreoDiario);
router.get('/reporte180', getReporte180);
router.get('/consulta-descarga', getConsultaDescargaNovonet);
router.get('/detalle-crm-master', async (req, res) => {
  const usuario = String(req.user?.usuario || req.user?.username || '').trim().toLowerCase();
  const perfil = normalizarPerfil(req.user?.perfil);
  const puedeVerDetalleCRMMaster = usuario === 'jasimbana'
    || perfil === 'ADMIN'
    || /^ADMINISTRADOR(?:A)?(?:[ _-].*)?$/.test(perfil);
  if (!puedeVerDetalleCRMMaster) {
    return res.status(403).json({ success: false, error: 'No tiene permisos para consultar el detalle CRM master' });
  }
  const { fechaDesde, fechaHasta } = req.query;
  if (!fechaDesde || !fechaHasta) {
    return res.status(400).json({ success: false, error: 'Los parámetros fechaDesde y fechaHasta son requeridos' });
  }
  try {
    const [novonet, velsa] = await Promise.all([
      pool.query(`
        SELECT DISTINCT 'NOVONET'::text AS "EMPRESA",
          mb.b_id AS "ID_CRM", mb.b_etapa_de_la_negociacion AS "ETAPA_CRM",
          TO_CHAR(mb.b_creado_el_fecha, 'YYYY-MM-DD') AS "FECHA_CREACION_CRM", mb.b_persona_responsable AS "ASESOR",
          mb.b_creado_el_hora AS "HORA_CREACION", e.supervisor AS "SUPERVISOR_ASIGNADO",
          TO_CHAR(mb.b_modificado_el_fecha, 'YYYY-MM-DD') AS "FECHA_MODIFICACION", mb.b_modificado_el_hora AS "HORA_MODIFICACION",
          mb.b_origen AS "ORIGEN"
        FROM public.vw_bitrix_novonet_v2 mb
        LEFT JOIN LATERAL (
          SELECT e2.supervisor FROM public.empleados e2
          WHERE e2.nombre_completo = mb.b_persona_responsable
          ORDER BY CASE WHEN e2.codigo = EXTRACT(MONTH FROM mb.b_creado_el_fecha::date)::text THEN 0 ELSE 1 END,
            CASE WHEN BTRIM(e2.codigo) ~ '^\\d+$' THEN BTRIM(e2.codigo)::int ELSE -1 END DESC
          LIMIT 1
        ) e ON true
        WHERE mb.b_creado_el_fecha BETWEEN $1::date AND $2::date
      `, [fechaDesde, fechaHasta]),
      pool.query(`
        SELECT DISTINCT 'VELSA'::text AS "EMPRESA",
          mv.id_crm AS "ID_CRM", mv.etapa_crm AS "ETAPA_CRM",
          TO_CHAR(mv.fecha_creacion_crm, 'YYYY-MM-DD') AS "FECHA_CREACION_CRM", mv.asesor AS "ASESOR",
          TO_CHAR(mv.fecha_creacion_crm, 'HH24:MI:SS') AS "HORA_CREACION",
          'ALEXANDRA PACHECO / DARIANA LEONARDI'::text AS "SUPERVISOR_ASIGNADO",
          TO_CHAR(mv.fecha_modificacion_crm, 'YYYY-MM-DD') AS "FECHA_MODIFICACION",
          TO_CHAR(mv.fecha_modificacion_crm, 'HH24:MI:SS') AS "HORA_MODIFICACION", mv.origen AS "ORIGEN"
        FROM public.mv_indicadores_velsa_completo mv
        WHERE mv.fecha_creacion_crm::date BETWEEN $1::date AND $2::date
      `, [fechaDesde, fechaHasta]),
    ]);
    const rows = [...novonet.rows, ...velsa.rows].sort((a, b) =>
      String(b.FECHA_CREACION_CRM || '').localeCompare(String(a.FECHA_CREACION_CRM || ''))
    );
    return res.json({ success: true, rows, total: rows.length, empresas: ['NOVONET', 'VELSA'] });
  } catch (error) {
    console.error('[indicadores/detalle-crm-master]', error.message);
    return res.status(500).json({ success: false, error: 'No se pudo consultar el detalle CRM master' });
  }
});
router.get('/consulta-master', async (req, res) => {
  if (!puedeConsultaMaster(req)) {
    return res.status(403).json({ success: false, error: 'No tiene permisos para realizar la Consulta Master' });
  }
  try {
    const [novonet, velsa, semillero, ventaenlinea] = await Promise.all([
      consultarDetalleJotform(pool, 'novonet', req.query),
      consultarDetalleJotform(pool, 'velsa', req.query),
      consultarDetallePipelineWebhook('semillero', '41', 'SEMILLERO', req.query),
      consultarDetallePipelineWebhook('ventaenlinea', '61', 'VENTAENLINEA', req.query),
    ]);
    const claveFecha = fila => {
      const valor = String(fila.FECHA_CREACION_JOT || fila.FECHA_CREACION || '').trim();
      const dmy = valor.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}):(\d{2}))?/);
      if (dmy) return `${dmy[3]}${dmy[2]}${dmy[1]}${dmy[4] || '00'}${dmy[5] || '00'}${dmy[6] || '00'}`;
      const iso = valor.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2}))?/);
      return iso ? `${iso[1]}${iso[2]}${iso[3]}${iso[4] || '00'}${iso[5] || '00'}${iso[6] || '00'}` : '';
    };
    const rows = [...novonet, ...velsa, ...semillero, ...ventaenlinea]
      .sort((a, b) => claveFecha(b).localeCompare(claveFecha(a)));
    return res.json({
      success: true,
      rows,
      total: rows.length,
      empresas: ['NOVONET', 'VELSA', 'SEMILLERO', 'VENTAENLINEA'],
    });
  } catch (error) {
    console.error('[indicadores/consulta-master]', error.message);
    const status = error.status || 500;
    return res.status(status).json({ success: false, error: status === 500 ? 'No se pudo realizar la Consulta Master' : error.message });
  }
});
router.get('/activaciones-dia', getActivacionesPorDia);
router.post('/force-refresh', forceRefreshNovonet);

// EFECTIVIDAD DIARIA — por agencia y fecha de creación del lead (ver
// controllers/efectividadDiaria.controller.js). Solo lectura, no toca nada
// de lo existente.
router.get('/efectividad-diaria', getEfectividadDiariaNovonet);
router.get('/efectividad-diaria/agencias', getAgenciasEfectividadNovonet);

module.exports = router;
