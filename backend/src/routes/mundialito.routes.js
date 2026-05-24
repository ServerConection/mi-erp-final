// =============================================================================
// MUNDIALITO - Rutas
// Todas requieren autenticacion + perfil ADMINISTRADOR
// =============================================================================
const express = require('express');
const router = express.Router();
const { verificarToken, soloAdmin } = require('../middleware/auth');
const C = require('../controllers/mundialito.controller');

// Aplicar guard a TODO el router
router.use(verificarToken);
router.use(soloAdmin);

// Torneos
router.get('/torneos',                        C.listarTorneos);
router.post('/torneos',                       C.crearTorneo);
router.put('/torneos/:id/cerrar',             C.cerrarTorneo);
router.put('/torneos/:id/reglas',             C.actualizarReglas);

// Grupos
router.get('/torneos/:torneoId/grupos',       C.listarGrupos);

// Participantes y sorteo
router.get('/torneos/:torneoId/participantes',     C.listarParticipantes);
router.post('/torneos/:torneoId/participantes',    C.agregarParticipante);
router.delete('/participantes/:id',                C.eliminarParticipante);
router.post('/torneos/:torneoId/sorteo',           C.realizarSorteo);

// Partidos
router.get('/torneos/:torneoId/partidos',          C.listarPartidos);
router.post('/torneos/:torneoId/partidos/generar', C.generarPartidosDia);
router.put('/partidos/:id/cerrar',                 C.cerrarPartido);

// Goles
router.post('/torneos/:torneoId/goles',            C.registrarGol);
router.get('/torneos/:torneoId/goles',             C.listarGoles);

// Tabla de posiciones + Top 10
router.get('/torneos/:torneoId/posiciones',        C.tablaPosiciones);
router.get('/torneos/:torneoId/top10',             C.listarTop10);
router.post('/torneos/:torneoId/top10/calcular',   C.calcularTop10);

// Premios
router.get('/torneos/:torneoId/premios',           C.listarPremios);
router.post('/torneos/:torneoId/premios/calcular', C.calcularPremios);

module.exports = router;
