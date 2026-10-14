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
    const [novonet, velsa] = await Promise.all([
      consultarDetalleJotform(pool, 'novonet', req.query),
      consultarDetalleJotform(pool, 'velsa', req.query),
    ]);
    const claveFecha = fila => {
      const m = String(fila.FECHA_CREACION_JOT || '').match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}):(\d{2}))?/);
      return m ? `${m[3]}${m[2]}${m[1]}${m[4] || '00'}${m[5] || '00'}${m[6] || '00'}` : '';
    };
    const rows = [...novonet, ...velsa].sort((a, b) => claveFecha(b).localeCompare(claveFecha(a)));
    return res.json({ success: true, rows, total: rows.length, empresas: ['NOVONET', 'VELSA'] });
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
