const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { registrarIntento } = require('../services/audit.service'); // 🔍 Auditoría

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

router.post('/login', async (req, res) => {
  const ip = req.ip || req.connection.remoteAddress;

  if (!checkRateLimit(ip)) {
    return res.status(429).json({ success: false, error: 'Demasiados intentos. Espera 15 minutos.' });
  }

  try {
    const { usuario, contraseña, username, password } = req.body;
    const userLogin = usuario || username;
    const passLogin = contraseña || password;

    if (!userLogin || !passLogin) {
      return res.status(400).json({ success: false, error: 'Faltan datos de acceso' });
    }

    const result = await pool.query(
      'SELECT * FROM users WHERE username = $1',
      [userLogin]
    );

    // Siempre ejecutar bcrypt (evita timing attack)
    const hashFalso = '$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012';
    const hashReal = result.rows.length > 0
      ? (result.rows[0].password || result.rows[0].password_hash)
      : hashFalso;

    const match = await bcrypt.compare(passLogin, hashReal || hashFalso);

    if (result.rows.length === 0 || !match) {
      // 🔍 Registrar intento FALLIDO en auditoría (para detectar ataques)
      const razon = result.rows.length === 0 ? 'Usuario no existe' : 'Contraseña incorrecta';
      await registrarIntento(userLogin, ip, false, razon);

      return res.status(401).json({ success: false, error: 'Credenciales inválidas' });
    }

    const user = result.rows[0];

    const rol = user.rol ? user.rol.toUpperCase() : '';
    const urlReporte = USUARIOS_ESPECIALES.has(user.username)
      ? URL_REPORTES.especiales
      : (URL_REPORTES[rol] || '');

    const token = jwt.sign(
      { id: user.id, rol: user.rol },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    // 🔍 Registrar intento EXITOSO en auditoría
    await registrarIntento(user.username, ip, true, null);

    return res.json({
      success: true,
      token,
      user: {
        id: user.id,
        usuario: user.username,
        perfil: user.rol,
        nombre: user.nombres_completos,
        url_reporte: urlReporte
      }
    });

  } catch (error) {
    console.error('[auth.routes] login:', error);
    return res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

module.exports = router;