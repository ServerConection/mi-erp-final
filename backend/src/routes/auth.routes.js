const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { registrarIntento } = require('../services/audit.service');
const { obtenerPermisosUsuario } = require('../config/permisos.config');
const { verificarToken } = require('../middleware/auth');

// Rate limiting simple en memoria
const intentos = new Map();
function checkRateLimit(ip) {
  const ahora = Date.now();
  const ventana = 15 * 60 * 1000;
  const max = 5;
  if (!intentos.has(ip)) { intentos.set(ip, { count: 1, desde: ahora }); return true; }
  const d = intentos.get(ip);
  if (ahora - d.desde > ventana) { intentos.set(ip, { count: 1, desde: ahora }); return true; }
  if (d.count >= max) return false;
  d.count++;
  return true;
}

const URL_REPORTES = {
  especiales: 'https://lookerstudio.google.com/embed/reporting/ee3b8401-45d8-4075-912b-2bc6ef815309/page/p_jsui99vd0d',
  SUPERVISOR:     'https://lookerstudio.google.com/embed/reporting/5cfdbb81-95d3-428a-9e43-ac3a1687ba9c/page/0U7lF',
  ASESOR:         'https://lookerstudio.google.com/embed/reporting/7690d7a1-0a7e-4eeb-9f7b-5d1a65d0a03a/page/w7EnF',
  ANALISTA:       'https://lookerstudio.google.com/embed/reporting/5cfdbb81-95d3-428a-9e43-ac3a1687ba9c/page/0U7lF',
  GERENCIA:       'https://lookerstudio.google.com/embed/reporting/5cfdbb81-95d3-428a-9e43-ac3a1687ba9c/page/0U7lF',
  ADMINISTRADOR:  'https://lookerstudio.google.com/embed/reporting/7690d7a1-0a7e-4eeb-9f7b-5d1a65d0a03a/page/w7EnF',
};

const USUARIOS_ESPECIALES = new Set([
  'berueda', 'brueda', 'achavez', 'dleonardi', 'apachecho', 'asrodriguez'
]);

/**
 * POST /auth/login
 * Login con usuario y contraseña
 * Devuelve token JWT y permisos del usuario
 */
router.post('/login', async (req, res) => {
  const ip = req.ip || req.connection.remoteAddress;

  if (!checkRateLimit(ip)) {
    return res.status(429).json({
      success: false,
      error: 'Demasiados intentos. Espera 15 minutos.'
    });
  }

  try {
    const { usuario, contraseña, username, password } = req.body;
    const userLogin = usuario || username;
    const passLogin = contraseña || password;

    if (!userLogin || !passLogin) {
      return res.status(400).json({
        success: false,
        error: 'Faltan datos de acceso'
      });
    }

    const result = await pool.query(
      `SELECT id, usuario, empresa, perfil, nombres, apellidos, activo, contraseña
       FROM usuarios
       WHERE usuario = $1`,
      [userLogin]
    );

    // Siempre ejecutar bcrypt (evita timing attack)
    const hashFalso = '$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012';
    const hashReal = result.rows.length > 0
      ? result.rows[0].contraseña
      : hashFalso;

    const match = await bcrypt.compare(passLogin, hashReal || hashFalso);

    if (result.rows.length === 0 || !match) {
      // 🔍 Registrar intento FALLIDO en auditoría
      const razon = result.rows.length === 0 ? 'Usuario no existe' : 'Contraseña incorrecta';
      await registrarIntento(userLogin, ip, false, razon);

      return res.status(401).json({
        success: false,
        error: 'Credenciales inválidas'
      });
    }

    const user = result.rows[0];

    // ⚠️ VALIDACIÓN: Usuario debe estar activo
    if (user.activo !== 'SI') {
      return res.status(403).json({
        success: false,
        error: 'Usuario desactivado. Contacta al administrador.'
      });
    }

    const perfil = user.perfil?.toUpperCase() || '';
    const empresa = user.empresa?.toUpperCase() || '';

    // Obtener permisos basado en empresa + perfil
    const permisos = obtenerPermisosUsuario(empresa, perfil);

    const urlReporte = USUARIOS_ESPECIALES.has(user.usuario)
      ? URL_REPORTES.especiales
      : (URL_REPORTES[perfil] || '');

    // Crear JWT con empresa + perfil
    const token = jwt.sign(
      {
        id: user.id,
        empresa: empresa,
        perfil: perfil
      },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    // 🔍 Registrar intento EXITOSO en auditoría
    await registrarIntento(user.usuario, ip, true, null);

    return res.json({
      success: true,
      token,
      user: {
        id: user.id,
        usuario: user.usuario,
        perfil: perfil,
        empresa: empresa,
        nombre: `${user.nombres} ${user.apellidos}`,
        url_reporte: urlReporte,
        permisos: permisos
      }
    });

  } catch (error) {
    console.error('[auth.routes] login:', error);
    return res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

/**
 * GET /auth/permisos
 * Obtener permisos del usuario autenticado
 * Headers: Authorization: Bearer <token>
 */
router.get('/permisos', verificarToken, async (req, res) => {
  try {
    const { empresa, perfil } = req.user;
    const permisos = obtenerPermisosUsuario(empresa, perfil);

    return res.json({
      success: true,
      empresa: empresa,
      perfil: perfil,
      permisos: permisos
    });

  } catch (error) {
    console.error('[auth.routes] permisos:', error);
    return res.status(500).json({
      success: false,
      error: 'Error obteniendo permisos'
    });
  }
});

module.exports = router;