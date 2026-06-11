const router = require('express').Router();
const { verificarToken } = require('../middleware/auth');
const ctrl = require('../controllers/reporteDetalle.controller');

router.use(verificarToken);

// GET /api/reporte-detalle/:empresa/cubo?fechaDesde&fechaHasta
router.get('/:empresa/cubo', ctrl.getCubo);

module.exports = router;
