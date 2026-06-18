// src/routes/cumplimientoLeads.routes.js
// ============================================================
// Cumplimiento de Leads — NOVONET
// Reporte en vivo (mestra_bitrix) + metas editables por asesor
// Todas las rutas requieren token válido y perfil distinto de ASESOR/CONSULTOR
// ============================================================

const express = require('express');
const router  = express.Router();
const { verificarToken, noAsesor } = require('../middleware/auth');
const ctrl = require('../controllers/cumplimientoLeads.controller');

router.use(verificarToken);
router.use(noAsesor);

// GET /api/cumplimiento-leads/reporte?fechaDesde=&fechaHasta=&asesor=&supervisor=
router.get('/reporte', ctrl.getReporte);

// GET /api/cumplimiento-leads/metas
router.get('/metas', ctrl.getMetas);

// POST /api/cumplimiento-leads/metas  { codigo_ejecutivo, asesor, supervisor, meta_gestionables }
router.post('/metas', ctrl.upsertMeta);

// PUT /api/cumplimiento-leads/metas/:id  { meta_gestionables, activo }
router.put('/metas/:id', ctrl.updateMeta);

// GET /api/cumplimiento-leads/export?fechaDesde=&fechaHasta=&asesor=&supervisor=
router.get('/export', ctrl.exportExcel);

module.exports = router;
