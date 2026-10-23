const express = require('express');
const router  = express.Router();
const {
  getCatalogosFiltro,
  filtrarNegociaciones,
  crearLote,
  listarLotes,
  asignarAsesorItem,
  exportarLoteCsv,
} = require('../controllers/llamadas.controller');

const { verificarToken, noAsesor } = require('../middleware/auth');
// Analytics has a dedicated guard for both ASESOR and legacy USUARIO advisors.
router.use('/analitica', require('./llamadasAnalitica.routes').createRouter({
  pool: require('../config/db'), verify: verificarToken,
}));

// Automarcador Bitrix (lado asesor): lo abre Bitrix dentro de su app local.
// Va ANTES de verificarToken: la identidad viene de la sesión de Bitrix.
router.use('/bitrix-dialer', require('./llamadasBitrixDialer.routes').crearRouter());

// Todo el módulo es solo para supervisión (igual que Automarcador): los
// asesores no cargan bases, solo reciben llamadas desde el Automarcador.
router.use(verificarToken, noAsesor);

router.get('/filtros',                       getCatalogosFiltro);
router.get('/filtrar',                       filtrarNegociaciones);
router.post('/lotes',                        crearLote);
router.get('/lotes',                         listarLotes);
router.put('/lotes/:loteId/items/:itemId',   asignarAsesorItem);
router.get('/lotes/:loteId/export.csv',      exportarLoteCsv);

// Carga de base igual que WABOT (etapa + responsable + fechas, con teléfono)
const llamadasBitrix = require('../controllers/llamadasBitrix.controller');
router.get('/bitrix/opciones',               llamadasBitrix.opciones);
router.post('/bitrix/consultar',             llamadasBitrix.consultar);
router.post('/bitrix/enviar',                llamadasBitrix.enviar);

// Automarcador Bitrix (lado supervisor): campañas repartidas entre asesores
const campanasBitrix = require('../controllers/llamadasBitrixCampanas.controller').crearCampanasController();
router.get('/bitrix/asesores',                campanasBitrix.asesores);
router.get('/bitrix/campanas',                campanasBitrix.campanas);
router.post('/bitrix/campanas',               campanasBitrix.crear);
router.post('/bitrix/campanas/:id/reintentar', campanasBitrix.reintentar);
router.get('/bitrix/reporte',                 campanasBitrix.reporte);
router.get('/bitrix/resumen',                 campanasBitrix.resumen);
router.get('/bitrix/control',                 campanasBitrix.control);

module.exports = router;
