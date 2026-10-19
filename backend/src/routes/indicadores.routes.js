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
  const filtroCategoria = empresa === 'semillero'
    ? `(BTRIM(COALESCE(w.categoria_id, '')) = $4 OR (
         NULLIF(BTRIM(w.categoria_id), '') IS NULL
         AND UPPER(REPLACE(COALESCE(NULLIF(BTRIM(w.etapa_bitrix), ''), NULLIF(BTRIM(w.etapa), ''), 'SIN ETAPA'), '_', ' ')) <> 'CONTACTO NUEVO'
       ))`
    : `BTRIM(COALESCE(w.categoria_id, '')) = $4`;

  const { rows } = await pool.query(`
    SELECT
      $5::text AS "DISTRIBUIDOR",
      w.bitrix_id AS "ID_CRM", w.bitrix_id AS "ID_JOT",
      UPPER(REPLACE(COALESCE(NULLIF(BTRIM(w.etapa_bitrix), ''), NULLIF(BTRIM(w.etapa), ''), 'SIN ETAPA'), '_', ' ')) AS "ETAPA",
      to_char(w.created_at AT TIME ZONE 'America/Guayaquil', 'YYYY-MM-DD HH24:MI:SS') AS "FECHA_CREACION",
      COALESCE(NULLIF(BTRIM(w.responsible), ''), 'SIN RESPONSABLE') AS "ASESOR",
      COALESCE(NULLIF(BTRIM(emp.supervisor), ''), 'SIN SUPERVISOR') AS "SUPERVISOR_ASIGNADO",
      COALESCE(NULLIF(BTRIM(w.source), ''), 'SIN ORIGEN') AS "ORIGEN",
      to_char(w.created_at AT TIME ZONE 'America/Guayaquil', 'DD/MM/YYYY HH24:MI:SS') AS "FECHA_CREACION_JOT",
      NULL::text AS "FECHA_ASIGNACION", NULLIF(w.fecha_venta_subida, '') AS "FECHA_ACTIVACION",
      NULL::text AS "COD_ASESOR_JOT", COALESCE(NULLIF(BTRIM(w.responsible), ''), 'SIN RESPONSABLE') AS "ASESOR_USUARIO",
      NULL::text AS "LOGIN",
      UPPER(REPLACE(COALESCE(NULLIF(BTRIM(w.etapa_bitrix), ''), NULLIF(BTRIM(w.etapa), ''), 'SIN ETAPA'), '_', ' ')) AS "ESTADO_NETLIFE",
      NULL::text AS "INGRESO_TELCOS", NULL::text AS "ESTADO_REGULARIZACION",
      NULL::text AS "OBSERV_REGULARIZACION", w.comentario AS "NOVEDADES_ATC",
      NULL::text AS "TIPO_PLAN", NULL::text AS "VELOCIDAD", NULL::text AS "EMPAQUETADO",
      NULL::text AS "SERVICIO_ADICIONAL_FACTURADO", NULL::text AS "FORMA_PAGO",
      NULL::text AS "APLICA_DESCUENTO", w.comentario AS "OBSERVACION"
    FROM public.bitrix_webhook_leads w
    LEFT JOIN LATERAL (
      SELECT e.supervisor
      FROM public.empleados e
      WHERE UPPER(BTRIM(e.nombre_completo)) = UPPER(BTRIM(w.responsible))
      ORDER BY CASE WHEN BTRIM(e.codigo) ~ '^\\d+$' THEN BTRIM(e.codigo)::int ELSE -1 END DESC
      LIMIT 1
    ) emp ON true
    WHERE (w.created_at AT TIME ZONE 'America/Guayaquil')::date BETWEEN $1::date AND $2::date
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
      const m = String(fila.FECHA_CREACION_JOT || '').match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}):(\d{2}))?/);
      return m ? `${m[3]}${m[2]}${m[1]}${m[4] || '00'}${m[5] || '00'}${m[6] || '00'}` : '';
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
