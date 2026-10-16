/**
 * ═══════════════════════════════════════════════════════════════════════════
 * RUTAS: Sesiones Bitrix24 — submódulo de Bitrix Live
 * Base: /api/bitrix-sesiones
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Datos de conexión de los usuarios de Bitrix24 (quién está activo, desde
 * cuándo, desde qué IP y con qué dispositivo). Es información de personal:
 * requiere token y perfil autorizado. Los asesores no entran.
 *
 * Para ampliar o restringir quién lo ve se toca una sola constante: PERFILES.
 */

const express = require('express');
const router  = express.Router();

const { verificarToken } = require('../middleware/auth');
const ctrl = require('../controllers/bitrixSesiones.controller');
const { empresaVisible } = require('../shared/bitrixSesionesAcceso');

const soloAutorizados = (req, res, next) => {
  if (!empresaVisible(req.user)) {
    return res.status(403).json({
      success: false,
      error: 'Acceso denegado. Bitrix Live está disponible para supervisores o superiores de NOVONET y VELSA.',
    });
  }
  next();
};

router.use(verificarToken, soloAutorizados);

// Tablero: resumen + listado + opciones de los filtros dinámicos
router.get('/live', ctrl.getLive);

// Descargable con los mismos filtros que estén aplicados en pantalla
router.get('/export', ctrl.exportar);

// Qué métodos de la API responden en cada cuenta (para saber si timeman está activo)
router.get('/diagnostico', ctrl.diagnostico);

// La API oficial no revoca la sesión web: cierra la jornada laboral abierta.
router.post('/:cuenta/:usuarioId/cerrar-jornada', ctrl.cerrarJornada);

module.exports = router;
