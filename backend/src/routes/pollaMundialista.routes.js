// =============================================================================
// POLLA MUNDIALISTA 2026 - Rutas
// Lectura y predicciones: todos los usuarios autenticados.
// Resultados reales y config: solo ADMINISTRADOR (validado en controller).
// =============================================================================
const express = require('express');
const router = express.Router();
const { verificarToken } = require('../middleware/auth');
const C = require('../controllers/pollaMundialista.controller');

router.use(verificarToken);

// Equipos + configuración
router.get('/equipos',            C.listarEquipos);

// Predicciones del usuario
router.get('/mi-polla',           C.miPolla);
router.put('/mi-polla/grupos',    C.guardarPredGrupos);
router.put('/mi-polla/fases',     C.guardarPredFases);

// Resultados reales
router.get('/resultados',         C.resultados);
router.put('/resultados/grupos',  C.guardarResGrupo);   // admin
router.put('/resultados/fases',   C.guardarResFase);    // admin

// Config (abrir/cerrar predicciones)
router.put('/config',             C.actualizarConfig);  // admin

// Ranking de aciertos
router.get('/ranking',            C.ranking);

module.exports = router;
