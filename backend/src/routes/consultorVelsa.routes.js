const express = require('express');
const router  = express.Router();

const { buscarPorBitrixVelsa } = require('../controllers/consultorVelsa.controller');
const { validarApiKeyVelsa }   = require('../middleware/apiKey');

// GET /api/consultor-velsa/buscar?j_id_bitrix=XXXXX
// Requiere header:  x-api-key: <clave>
// O query param:    ?api_key=<clave>&j_id_bitrix=XXXXX
router.get('/buscar', validarApiKeyVelsa, buscarPorBitrixVelsa);

module.exports = router;
