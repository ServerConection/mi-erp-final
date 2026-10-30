/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * MIDDLEWARE: Control de acceso del módulo Evaluaciones
 * ═══════════════════════════════════════════════════════════════════════════════
 * Cualquier perfil autenticado puede entrar. USUARIO y ATC solo responden las
 * que les corresponden por empresa; los demás perfiles también gestionan.
 */

const pool = require('../config/db');

// Todo perfil autenticado puede gestionar, excepto USUARIO (asesores) y ATC,
// que únicamente responden lo asignado desde "Mis evaluaciones". arengel es
// una excepción nominal autorizada para gestionar evaluaciones.
const puedeGestionarEvaluaciones = (perfil, usuario = '') =>
  String(usuario).trim().toLowerCase() === 'arengel'
  || (Boolean(perfil) && !['USUARIO', 'ATC'].includes(String(perfil).trim().toUpperCase()));

const accesoEvaluaciones = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'No autenticado' });
  }
  req.puedeCrearEvaluaciones = puedeGestionarEvaluaciones(req.user.perfil, req.user.usuario);
  next();
};

const puedeCrearEvaluacion = (req, res, next) => {
  if (!puedeGestionarEvaluaciones(req.user?.perfil, req.user?.usuario)) {
    return res.status(403).json({
      success: false,
      error: 'Tu perfil no puede crear evaluaciones.',
    });
  }
  next();
};

/** Solo ADMINISTRADOR. Se usa para borrar definitivamente una evaluación. */
const soloAdministrador = (req, res, next) => {
  if (req.user?.perfil !== 'ADMINISTRADOR') {
    return res.status(403).json({
      success: false,
      error: 'Solo un administrador puede eliminar evaluaciones. Puedes archivarla en su lugar.',
    });
  }
  next();
};

/**
 * Carga la evaluación de :evaluacionId. `soloCreador` exige además que sea
 * ADMINISTRADOR o quien la creó (para editar/archivar/ver resultados).
 */
const cargarEvaluacion = (soloCreador = false) => async (req, res, next) => {
  try {
    const id = parseInt(req.params.evaluacionId, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(404).json({ success: false, error: 'Evaluación no encontrada' });
    }

    const { rows } = await pool.query(`SELECT * FROM eva_evaluaciones WHERE id = $1`, [id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Evaluación no encontrada' });
    }

    const evaluacion = rows[0];
    const esCreador = evaluacion.creado_por === req.user.id || req.user.perfil === 'ADMINISTRADOR';

    if (soloCreador && (!puedeGestionarEvaluaciones(req.user.perfil, req.user.usuario) || !esCreador)) {
      return res.status(403).json({ success: false, error: 'Tu perfil no puede gestionar esta evaluación.' });
    }

    req.evaluacion = evaluacion;
    req.esCreadorEvaluacion = esCreador;
    next();
  } catch (error) {
    console.error('[evaluacionesAcceso] Error cargando evaluación:', error);
    res.status(500).json({ success: false, error: 'Error validando la evaluación' });
  }
};

module.exports = { accesoEvaluaciones, puedeCrearEvaluacion, soloAdministrador, cargarEvaluacion, puedeGestionarEvaluaciones };
