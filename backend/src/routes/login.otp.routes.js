const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { enviarOTP } = require('../services/email.service');
const { obtenerPermisosUsuario } = require('../config/permisos.config');

// Rate limiting
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

// LOGIN
router.post('/login', async (req, res) => {
  const ip = req.ip || req.connection.remoteAddress;

  if (!checkRateLimit(ip)) {
    return res.status(429).json({ 
      success: false, 
      error: 'Demasiados intentos. Espera 15 minutos.' 
    });
  }

  try {
    const { usuario, password } = req.body;

    if (!usuario || !password) {
      return res.status(400).json({ 
        success: false, 
        error: 'Faltan credenciales' 
      });
    }

    // 🔥 FIX: usuario case insensitive
    const result = await pool.query(
      "SELECT id, usuario, correo, contraseña, activo FROM usuarios WHERE LOWER(usuario) = LOWER($1)",
      [usuario]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ 
        success: false, 
        error: 'Usuario no encontrado' 
      });
    }

    const user = result.rows[0];

    const hashFalso = '$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012';
    const match = await bcrypt.compare(password, user.contraseña || hashFalso);

    if (!match) {
      return res.status(401).json({ 
        success: false, 
        error: 'Contraseña incorrecta' 
      });
    }

    if (user.activo !== 'SI') {
      return res.status(403).json({ 
        success: false, 
        error: 'Usuario desactivado' 
      });
    }

    const otp = crypto.randomInt(100000, 999999).toString();
    const otpHash = await bcrypt.hash(otp, 10);

    await pool.query('DELETE FROM otp_login WHERE usuario_id = $1', [user.id]);

    await pool.query(
      `INSERT INTO otp_login (usuario_id, otp_code, expira_en)
       VALUES ($1, $2, NOW() + interval '10 minutes')`,
      [user.id, otpHash]
    );

    await enviarOTP(user.correo, otp);

    return res.json({
      success: true,
      trusted: false,
      message: 'OTP enviado al correo registrado',
      usuario_id: user.id
    });

  } catch (error) {
    console.error('[otp/login]:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Error interno del servidor' 
    });
  }
});

// VERIFY OTP
router.post('/verify-otp', async (req, res) => {
  try {
    const { usuario, otp } = req.body;

    if (!usuario || !otp) {
      return res.status(400).json({ 
        success: false, 
        error: 'Faltan datos' 
      });
    }

    // 🔥 FIX: case insensitive
    const result = await pool.query(
      `SELECT u.id, u.usuario, u.correo, u.nombres, u.apellidos, 
              u.perfil, u.empresa, u.activo,
              o.otp_code, o.expira_en
       FROM usuarios u
       LEFT JOIN otp_login o ON u.id = o.usuario_id
       WHERE LOWER(u.usuario) = LOWER($1) AND u.activo = 'SI'`,
      [usuario]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ 
        success: false, 
        error: 'Usuario no encontrado o inactivo' 
      });
    }

    const user = result.rows[0];

    if (!user.otp_code) {
      return res.status(401).json({ 
        success: false, 
        error: 'No hay OTP generado.' 
      });
    }

    if (new Date() > new Date(user.expira_en)) {
      return res.status(401).json({ 
        success: false, 
        error: 'OTP expirado' 
      });
    }

    const otpMatch = await bcrypt.compare(otp, user.otp_code);

    if (!otpMatch) {
      return res.status(401).json({ 
        success: false, 
        error: 'OTP incorrecto' 
      });
    }

    const perfil = user.perfil?.toUpperCase() || '';
    const empresa = user.empresa?.toUpperCase() || '';
    const permisos = obtenerPermisosUsuario(empresa, perfil);

    const token = jwt.sign(
      { id: user.id, usuario: user.usuario, empresa, perfil },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    const urlReporte = USUARIOS_ESPECIALES.has(user.usuario)
      ? URL_REPORTES.especiales
      : (URL_REPORTES[perfil] || '');

    // 🔥 FIX CRÍTICO: borrar SOLO después de validar
    await pool.query(
      'DELETE FROM otp_login WHERE usuario_id = $1',
      [user.id]
    );

    return res.json({
      success: true,
      token,
      user: {
        id: user.id,
        usuario: user.usuario,
        nombre: `${user.nombres} ${user.apellidos}`,
        perfil,
        empresa,
        correo: user.correo,
        url_reporte: urlReporte,
        permisos
      }
    });

  } catch (error) {
    console.error('[otp/verify-otp]:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Error verificando OTP' 
    });
  }
});

module.exports = router;