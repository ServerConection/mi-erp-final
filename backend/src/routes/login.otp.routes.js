const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { enviarOTP } = require('../services/email.service');

// ─── Rate limiting simple en memoria ─────────────────────────────────────────
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

// ─── POST /login ──────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const ip = req.ip || req.connection.remoteAddress;
  const userAgent = req.headers['user-agent'] || '';

  if (!checkRateLimit(ip)) {
    return res.status(429).json({ success: false, error: 'Demasiados intentos. Espera 15 minutos.' });
  }

  try {
    const { usuario, password, device_token } = req.body;

    if (!usuario || !password) {
      return res.status(400).json({ success: false, error: 'Faltan credenciales' });
    }

    const result = await pool.query(
      "SELECT * FROM usuarios WHERE usuario = $1 AND activo = 'SI'",
      [usuario]
    );

    // Siempre ejecutar bcrypt (evita timing attack)
    const hashFalso = '$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012';
    const hashReal = result.rows.length > 0 ? result.rows[0].contraseña : hashFalso;
    const match = await bcrypt.compare(password, hashReal);

    if (result.rows.length === 0 || !match) {
      await pool.query(
        'INSERT INTO login_logs (usuario_id, ip, user_agent, success) VALUES ($1,$2,$3,$4)',
        [result.rows[0]?.id || null, ip, userAgent, false]
      );
      return res.status(401).json({ success: false, error: 'Credenciales inválidas' });
    }

    const user = result.rows[0];

    // ¿Dispositivo confiable?
    if (device_token) {
      const devices = await pool.query(
        'SELECT * FROM trusted_devices WHERE usuario_id = $1 AND expires_at > NOW()',
        [user.id]
      );

      for (const device of devices.rows) {
        const deviceMatch = await bcrypt.compare(device_token, device.device_token);
        if (deviceMatch) {
          await pool.query(
            'UPDATE trusted_devices SET last_used_at = NOW() WHERE id = $1',
            [device.id]
          );

          await pool.query(
            'INSERT INTO login_logs (usuario_id, ip, user_agent, success) VALUES ($1,$2,$3,$4)',
            [user.id, ip, userAgent, true]
          );

          const token = jwt.sign(
            { id: user.id, rol: user.perfil },
            process.env.JWT_SECRET,
            { expiresIn: '8h' }
          );

          return res.json({
            success: true,
            trusted: true,
            message: 'Acceso directo por dispositivo confiable',
            token,
            user: {
              id: user.id,
              usuario: user.usuario,
              perfil: user.perfil,
              nombre: `${user.nombres} ${user.apellidos}`
            }
          });
        }
      }
    }

    // Sin dispositivo confiable → enviar OTP
    const otp = crypto.randomInt(100000, 999999);
    const otpHash = await bcrypt.hash(otp.toString(), 10);

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
    console.error('[login-otp]:', error);
    return res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

module.exports = router;