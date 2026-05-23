const jwt = require('jsonwebtoken');
const pool = require('../config/db');

/**
 * PERFORMANCE: Cache en memoria de usuarios autenticados.
 * Cada request HTTP normalmente hace 1 query a la BD para validar el usuario.
 * Con este cache (TTL 60s), solo se consulta la BD 1 vez por minuto por usuario.
 *
 * Comportamiento conservador:
 *   - TTL corto (60s): si desactivas un usuario, el acceso se cierra en <= 60s.
 *   - LRU manual con tamano max para evitar leaks de memoria.
 */
const USER_CACHE_TTL_MS = 60 * 1000;
const USER_CACHE_MAX    = 5000;
const userCache = new Map(); // id -> { user, expiresAt }

function cacheGet(id) {
  const entry = userCache.get(id);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    userCache.delete(id);
    return null;
  }
  // refrescar orden LRU
  userCache.delete(id);
  userCache.set(id, entry);
  return entry.user;
}

function cacheSet(id, user) {
  if (userCache.size >= USER_CACHE_MAX) {
    const firstKey = userCache.keys().next().value;
    userCache.delete(firstKey);
  }
  userCache.set(id, { user, expiresAt: Date.now() + USER_CACHE_TTL_MS });
}

// Permite invalidar manualmente desde controladores
function invalidarUsuarioCache(id) {
  if (id != null) userCache.delete(id);
}

const verificarToken = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Token no proporcionado'
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Intenta servir desde cache primero
    let user = cacheGet(decoded.id);

    if (!user) {
      const result = await pool.query(
        `SELECT id, usuario, empresa, perfil, activo
         FROM usuarios
         WHERE id = $1`,
        [decoded.id]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({
          success: false,
          error: 'Usuario no encontrado'
        });
      }

      user = result.rows[0];
      cacheSet(decoded.id, user);
    }

    if (user.activo !== 'SI') {
      userCache.delete(decoded.id);
      return res.status(403).json({
        success: false,
        error: 'Usuario desactivado. Contacta al administrador.'
      });
    }

    req.user = {
      id: user.id,
      usuario: user.usuario,
      empresa: user.empresa?.toUpperCase(),
      perfil: user.perfil?.toUpperCase(),
      activo: user.activo
    };

    next();

  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'Token expirado. Por favor, inicia sesion de nuevo.'
      });
    }

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        error: 'Token invalido'
      });
    }

    console.error('[auth.middleware] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Error validando token'
    });
  }
};

/**
 * Middleware: solo permite acceso a usuarios con perfil ADMINISTRADOR.
 * Debe usarse DESPUES de verificarToken.
 */
const soloAdmin = (req, res, next) => {
  if (!req.user || req.user.perfil !== 'ADMINISTRADOR') {
    return res.status(403).json({
      success: false,
      error: 'Acceso denegado. Solo los administradores pueden realizar esta accion.'
    });
  }
  next();
};

/**
 * Middleware: bloquea unicamente a usuarios con perfil ASESOR.
 * Todos los demas perfiles (ADMINISTRADOR, ANALISTA, GERENTE, SUPERVISOR) pasan.
 * Debe usarse DESPUES de verificarToken.
 */
const noAsesor = (req, res, next) => {
  if (!req.user || req.user.perfil === 'ASESOR') {
    return res.status(403).json({
      success: false,
      error: 'Acceso denegado. Los asesores no tienen permiso para esta seccion.'
    });
  }
  next();
};

module.exports = { verificarToken, soloAdmin, noAsesor, invalidarUsuarioCache };
