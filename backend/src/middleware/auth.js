/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * MIDDLEWARE DE AUTENTICACIÓN (ACTUALIZADO)
 * Valida JWT y obtiene datos del usuario de la BD (empresa, perfil, etc)
 * ═══════════════════════════════════════════════════════════════════════════════
 */

const jwt = require('jsonwebtoken');
const pool = require('../config/db');

module.exports = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ 
      success: false, 
      error: 'Token no proporcionado' 
    });
  }

  try {
    // Verificar y decodificar JWT
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Obtener datos frescos del usuario desde la BD
    // Importante: esto asegura que los permisos estén siempre actualizados
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

    const user = result.rows[0];

    // Verificar si el usuario está activo
    if (user.activo !== 'SI') {
      return res.status(403).json({ 
        success: false, 
        error: 'Usuario desactivado. Contacta al administrador.' 
      });
    }

    // Adjuntar datos del usuario al objeto request
    // Ahora disponible en todos los controllers como: req.user.id, req.user.empresa, etc
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
        error: 'Token expirado. Por favor, inicia sesión de nuevo.' 
      });
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        success: false, 
        error: 'Token inválido' 
      });
    }

    console.error('[auth.middleware] Error:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Error validando token' 
    });
  }
};