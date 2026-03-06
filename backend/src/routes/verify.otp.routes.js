const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

router.post('/verify-otp', async (req, res) => {
  const ip = req.ip || req.connection.remoteAddress;
  const userAgent = req.headers['user-agent'] || '';

  try {
    const { usuario_id, otp } = req.body;

    if (!usuario_id || !otp) {
      return res.status(400).json({ success: false, error: 'Faltan datos' });
    }

    // Buscar OTP vigente y no usado
    const result = await pool.query(
      `SELECT * FROM otp_login 
       WHERE usuario_id = $1 
       AND usado = FALSE 
       AND expira_en > NOW()
       ORDER BY creado DESC 
       LIMIT 1`,
      [usuario_id]
    );

    if (result.rows.length === 0) {
      // Log intento fallido
      await pool.query(
        'INSERT INTO login_logs (usuario_id, ip, user_agent, success) VALUES ($1,$2,$3,$4)',
        [usuario_id, ip, userAgent, false]
      );
      return res.status(401).json({ success: false, error: 'Código inválido o expirado' });
    }

    const registro = result.rows[0];

    // Comparar OTP con hash
    const match = await bcrypt.compare(otp.toString(), registro.otp_code);

    if (!match) {
      await pool.query(
        'INSERT INTO login_logs (usuario_id, ip, user_agent, success) VALUES ($1,$2,$3,$4)',
        [usuario_id, ip, userAgent, false]
      );
      return res.status(401).json({ success: false, error: 'Código incorrecto' });
    }

    // Marcar OTP como usado
    await pool.query('UPDATE otp_login SET usado = TRUE WHERE id = $1', [registro.id]);

    // Buscar usuario
    const userResult = await pool.query(
      "SELECT * FROM usuarios WHERE id = $1 AND activo = 'SI'",
      [usuario_id]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ success: false, error: 'Usuario no encontrado' });
    }

    const user = userResult.rows[0];

    // Generar device token
    const deviceToken = crypto.randomBytes(32).toString('hex');
    const deviceTokenHash = await bcrypt.hash(deviceToken, 10);
    const expiresAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000); // 5 días

    // Eliminar dispositivos anteriores del mismo usuario+ip
    await pool.query(
      'DELETE FROM trusted_devices WHERE usuario_id = $1 AND ip = $2',
      [user.id, ip]
    );

    // Guardar nuevo dispositivo confiable
    await pool.query(
      `INSERT INTO trusted_devices (usuario_id, device_token, expires_at, ip, user_agent)
       VALUES ($1, $2, $3, $4, $5)`,
      [user.id, deviceTokenHash, expiresAt, ip, userAgent]
    );

    // Log exitoso
    await pool.query(
      'INSERT INTO login_logs (usuario_id, ip, user_agent, success) VALUES ($1,$2,$3,$4)',
      [user.id, ip, userAgent, true]
    );

    // Generar JWT
    const token = jwt.sign(
      { id: user.id, rol: user.perfil },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    return res.json({
      success: true,
      message: 'Acceso concedido',
      token,
      device_token: deviceToken, // guardar en frontend para próximos logins
      user: {
        id: user.id,
        usuario: user.usuario,
        perfil: user.perfil,
        nombre: `${user.nombres} ${user.apellidos}`
      }
    });

  } catch (error) {
    console.error('[verify-otp]:', error);
    return res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

module.exports = router;