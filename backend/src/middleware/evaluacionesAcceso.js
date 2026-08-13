/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * MIDDLEWARE: Control de acceso del módulo Evaluaciones
 * ═══════════════════════════════════════════════════════════════════════════════
 * Mismo criterio que Archivos Compartidos: PERFILES_CREADORES arma/gestiona
 * evaluaciones; cualquier usuario autenticado puede responder las que le
 * corresponden por empresa.
 */

const pool = require('../config/db');

const PERFILES_CREADORES = ['ADMINISTRADOR', 'GERENCIA', 'ANALISTA', 'SUPERVISOR'];

const accesoEvaluaciones = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'No autenticado' });
  }
  req.puedeCrearEvaluaciones = PERFILES_CREADORES.includes(req.user.perfil);
  next();
};

const puedeCrearEvaluacion = (req, res, next) => {
  if (!PERFILES_CREADORES.includes(req.user?.perfil)) {
    return res.status(403).json({
      success: false,
      error: 'Tu perfil no puede crear evaluaciones.',
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

    if (soloCreador && !esCreador) {
      return res.status(403).json({ success: false, error: 'Solo quien creó la evaluación (o un administrador) puede hacer esto.' });
    }

    req.evaluacion = evaluacion;
    req.esCreadorEvaluacion = esCreador;
    next();
  } catch (error) {
    console.error('[evaluacionesAcceso] Error cargando evaluación:', error);
    res.status(500).json({ success: false, error: 'Error validando la evaluación' });
  }
};

module.exports = { accesoEvaluaciones, puedeCrearEvaluacion, cargarEvaluacion, PERFILES_CREADORES };
