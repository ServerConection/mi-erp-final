const express = require('express');
const router  = express.Router();

const { buscarPorBitrix } = require('../controllers/consultor.controller');
const { validarApiKey }   = require('../middleware/apiKey');

// GET /api/consultor/buscar?j_id_bitrix=XXXXX
// Requiere header:  x-api-key: <clave>
// O query param:    ?api_key=<clave>&j_id_bitrix=XXXXX
router.get('/buscar', validarApiKey, buscarPorBitrix);

module.exports = router;
