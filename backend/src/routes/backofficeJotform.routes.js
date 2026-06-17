// src/routes/backofficeJotform.routes.js
// ============================================================
// Backoffice Jotform — NOVONET y VELSA
// Todas las rutas requieren token válido y perfil distinto de ASESOR/CONSULTOR
// ============================================================

const express = require('express');
const router  = express.Router();
const { verificarToken, noAsesor } = require('../middleware/auth');
const ctrl = require('../controllers/backofficeJotform.controller');

router.use(verificarToken);
router.use(noAsesor);

// GET /api/backoffice-jotform/listado?empresa=novonet&fechaDesde=&fechaHasta=&asesor=&etapa=&q=&estadoRevision=&page=&pageSize=
router.get('/listado', ctrl.getListado);

// GET /api/backoffice-jotform/kpis?empresa=novonet&fechaDesde=&fechaHasta=
router.get('/kpis', ctrl.getKpis);

// GET /api/backoffice-jotform/embudo?empresa=novonet&fechaDesde=&fechaHasta=&asesor=
router.get('/embudo', ctrl.getEmbudo);

// GET /api/backoffice-jotform/heatmap?empresa=novonet&fechaDesde=&fechaHasta=&asesor=
router.get('/heatmap', ctrl.getHeatmap);

// POST /api/backoffice-jotform/revision  { empresa, id_externo, estado_revision, observacion }
router.post('/revision', ctrl.setRevision);

// GET /api/backoffice-jotform/export?empresa=novonet&fechaDesde=&fechaHasta=&asesor=&estadoRevision=
router.get('/export', ctrl.exportExcel);

module.exports = router;
