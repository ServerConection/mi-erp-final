// src/routes/pautaObjetivos.routes.js
// ============================================================
// Objetivos diarios de pauta (forecast comercial)
//
// LECTURA  → verificarToken + noAsesor  (mismo criterio que cumplimiento-leads)
// ESCRITURA→ verificarToken + soloAdmin (solo administración carga objetivos)
//
// Montado en: entries/analitica-novo.js
// Prefijo en gateway.js: /api/pauta-objetivos
// ============================================================

const express = require('express');
const router  = express.Router();
const { verificarToken, noAsesor, soloAdmin } = require('../middleware/auth');
const ctrl = require('../controllers/pautaObjetivos.controller');

// Todas las rutas requieren sesión válida y bloquean al perfil ASESOR.
router.use(verificarToken);
router.use(noAsesor);

// ── LECTURA ─────────────────────────────────────────────────
// GET /api/pauta-objetivos/resumen?fechaDesde=&fechaHasta=&empresa=
//   Acumulado del rango — lo consume el módulo Indicadores.
router.get('/resumen',  ctrl.getResumen);

// GET /api/pauta-objetivos/diario?fechaDesde=&fechaHasta=&empresa=
//   Serie por día, para la gráfica meta vs real.
router.get('/diario',   ctrl.getDiario);

// GET /api/pauta-objetivos/campanas?empresa=
router.get('/campanas', ctrl.getCampanas);

// GET /api/pauta-objetivos?fechaDesde=&fechaHasta=&empresa=
//   Filas crudas por campaña — pantalla de carga/edición.
router.get('/',         ctrl.listar);

// ── ESCRITURA (solo ADMINISTRADOR) ──────────────────────────
// POST /api/pauta-objetivos          → upsert de una fila
router.post('/',        soloAdmin, ctrl.upsert);

// POST /api/pauta-objetivos/lote     → carga masiva de un mes (transaccional)
router.post('/lote',    soloAdmin, ctrl.upsertLote);

// PUT /api/pauta-objetivos/:id       → edición puntual
router.put('/:id',      soloAdmin, ctrl.actualizar);

// DELETE /api/pauta-objetivos/:id    → baja lógica (activo = FALSE)
router.delete('/:id',   soloAdmin, ctrl.desactivar);

module.exports = router;
