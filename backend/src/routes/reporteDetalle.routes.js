const router = require('express').Router();
const { verificarToken } = require('../middleware/auth');
const ctrl = require('../controllers/reporteDetalle.controller');

router.use(verificarToken);

// GET /api/reporte-detalle/:empresa/cubo?fechaDesde&fechaHasta
router.get('/:empresa/cubo', ctrl.getCubo);

// GET /api/reporte-detalle/:empresa/detalle?tipo&fechaDesde&fechaHasta&asesor&etapa&dia&hora&gestionable&limit
router.get('/:empresa/detalle', ctrl.getDetalle);

module.exports = router;
