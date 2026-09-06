// Reporte Gerencial: salud comercial de ambas empresas en una pantalla.
// Es informacion de direccion (inversion, costo por venta, margen): se limita a
// perfiles gerenciales, no a cualquier usuario con sesion.
const express = require('express');
const router = express.Router();
const { verificarToken, noAsesor } = require('../middleware/auth');
const { getReporteGerencial } = require('../controllers/reporteGerencial.controller');

router.use(verificarToken);
router.use(noAsesor);

router.get('/', getReporteGerencial);

module.exports = router;
