const express = require('express');
const router = express.Router();
const { verificarToken } = require('../middleware/auth');
const { getResumenNovonet, getResumenVelsa } = require('../controllers/analista.controller');

// GET /api/analista/novonet?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
router.get('/novonet', verificarToken, getResumenNovonet);

// GET /api/analista/velsa?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
router.get('/velsa', verificarToken, getResumenVelsa);

module.exports = router;
