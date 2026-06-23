const express = require('express');
const router = express.Router();
const { verificarToken } = require('../middleware/auth');
const C = require('../controllers/datosAdicionales.controller');

router.use(verificarToken);

router.get('/contactos-bitrix',      C.listarContactosBitrix);
router.get('/inversion-diaria',      C.listarInversionDiaria);
router.get('/reporte-mensual-velsa', C.listarReporteMensualVelsa);

module.exports = router;
