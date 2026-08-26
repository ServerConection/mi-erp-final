const express = require('express');
const { listar, stats, analytics } = require('../controllers/contactabilidad.controller');

const router = express.Router();
router.get('/stats', stats);
router.get('/analytics', analytics);
router.get('/', listar);

module.exports = router;

