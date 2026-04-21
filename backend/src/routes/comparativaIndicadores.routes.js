const express = require('express');
const { getComparativaSupervisores } = require('../controllers/comparativaIndicadores.controller');
const { verificarToken } = require('../middlewares/auth');

const router = express.Router();

// GET /api/comparativa-indicadores/supervisores
// Obtiene comparativa de supervisores: casos asignados vs gestionables vs ingresos JOT
router.get('/supervisores', verificarToken, getComparativaSupervisores);

module.exports = router;
