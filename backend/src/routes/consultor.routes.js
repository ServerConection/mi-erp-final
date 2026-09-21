const express = require('express');
const router  = express.Router();

const { buscarPorBitrix, consultarNovonetPorFecha } = require('../controllers/consultor.controller');
const { validarApiKey }   = require('../middleware/apiKey');

// GET /api/consultor/buscar?j_id_bitrix=XXXXX
// Requiere header:  x-api-key: <clave>
// O query param:    ?api_key=<clave>&j_id_bitrix=XXXXX
router.get('/buscar', validarApiKey, buscarPorBitrix);

// GET /api/consultor/novonet-leads?fecha=YYYY-MM-DD
// (o ?desde=YYYY-MM-DD&hasta=YYYY-MM-DD)
// Requiere header:  x-api-key: <clave>
// O query param:    ?api_key=<clave>
router.get('/novonet-leads', validarApiKey, consultarNovonetPorFecha);

module.exports = router;
