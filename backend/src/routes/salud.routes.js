// Mapa de salud del ERP. Solo lectura, y solo para perfiles que ya pueden ver
// datos de operacion: expone que tan fresca esta cada tabla, no su contenido.
const express = require('express');
const router = express.Router();
const { verificarToken, noAsesor } = require('../middleware/auth');
const { getSalud } = require('../controllers/salud.controller');

router.use(verificarToken);
router.use(noAsesor);

router.get('/', getSalud);

module.exports = router;
