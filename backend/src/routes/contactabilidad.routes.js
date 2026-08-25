const express = require('express');
const { listar, stats } = require('../controllers/contactabilidad.controller');

const router = express.Router();
router.get('/stats', stats);
router.get('/', listar);

module.exports = router;

