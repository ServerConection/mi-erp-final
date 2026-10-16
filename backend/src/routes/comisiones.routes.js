const express = require('express');
const { verificarToken } = require('../middleware/auth');
const { soloAdministracion } = require('../shared/accesoAdministracion');
const { listar, catalogoResumen, catalogoCargar } = require('../controllers/comisiones.controller');

const router = express.Router();
router.use(verificarToken, soloAdministracion);
router.get('/', listar);
router.get('/catalogo', catalogoResumen);
router.post('/catalogo', catalogoCargar);

module.exports = router;
