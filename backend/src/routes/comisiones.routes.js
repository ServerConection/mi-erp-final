const express = require('express');
const { verificarToken } = require('../middleware/auth');
const { soloAdministracion } = require('../shared/accesoAdministracion');
const { listar, detalle, catalogoResumen, catalogoCargar, rolListar, rolAjuste } = require('../controllers/comisiones.controller');

const router = express.Router();
router.use(verificarToken, soloAdministracion);
router.get('/', listar);
router.get('/detalle', detalle);
router.get('/catalogo', catalogoResumen);
router.post('/catalogo', catalogoCargar);
router.get('/rol', rolListar);
router.put('/rol/ajuste', rolAjuste);

module.exports = router;
