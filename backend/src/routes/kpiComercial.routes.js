// src/routes/kpiComercial.routes.js
// ============================================================
// KPI Comercial Novonet — tablas por Supervisor y por Asesor
// Montado en: app.js (monolito) y entries/analitica-novo.js
// Prefijo en gateway.js: /api/kpi-comercial
// ============================================================

const express = require('express');
const router  = express.Router();
const { verificarToken, noAsesor } = require('../middleware/auth');
const ctrl = require('../controllers/kpiComercial.controller');

router.use(verificarToken);
router.use(noAsesor);

// GET /api/kpi-comercial?fechaDesde=&fechaHasta=
router.get('/', ctrl.getKpiComercial);

module.exports = router;
