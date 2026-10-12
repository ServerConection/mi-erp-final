const express = require('express');
const { verificarToken } = require('../middleware/auth');
const { soloAdministracion } = require('../shared/accesoAdministracion');
const { listar } = require('../controllers/comisiones.controller');

const router = express.Router();
router.use(verificarToken, soloAdministracion);
router.get('/', listar);

module.exports = router;
