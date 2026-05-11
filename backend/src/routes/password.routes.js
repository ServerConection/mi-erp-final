const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const sgMail = require('@sendgrid/mail');
const pool = require('../config/db');

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// ─── SOLICITAR RECUPERACIÓN ───────────────────────────────────────────────────
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: 'Email requerido' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ success: false, message: 'Email inválido' });
    }

    const result = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    // Respuesta genérica siempre (no revelar si el email existe)
    if (result.rows.length === 0) {
      return res.json({
        success: true,
        message: 'Si el correo está registrado, recibirás instrucciones pronto.'
      });
    }

    // Generar token seguro
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 3600000); // 1 hora

    // Eliminar tokens anteriores del mismo email
    await pool.query(
      'DELETE FROM password_resets WHERE email = $1',
      [email]
    );

    // Guardar token hasheado
    const tokenHash = await bcrypt.hash(token, 10);
    await pool.query(
      'INSERT INTO password_resets (email, token, expires_at) VALUES ($1, $2, $3)',
      [email, tokenHash, expires]
    );

    const resetLink = `${process.env.FRONTEND_URL}/reset-password/${token}`;

    const msg = {
      to: email,
      from: process.env.EMAIL_FROM,
      subject: 'Recuperar contraseña - ERP',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:400px;margin:auto;padding:24px;border:1px solid #e0e0e0;border-radius:8px;">
          <h2 style="color:#333;">🔐 Recuperación de contraseña</h2>
          <p>Haz clic en el botón para restablecer tu contraseña:</p>
          <a href="${resetLink}" 
             style="display:inline-block;padding:12px 24px;background:#1a73e8;color:#fff;border-radius:6px;text-decoration:none;font-weight:bold;">
            Restablecer contraseña
          </a>
          <p style="color:#888;font-size:13px;margin-top:16px;">Este enlace expira en <strong>1 hora</strong>. Si no solicitaste esto, ignora este correo.</p>
        </div>
      `
    };

    await sgMail.send(msg);

    return res.json({
      success: true,
      message: 'Si el correo está registrado, recibirás instrucciones pronto.'
    });

  } catch (error) {
    console.error('[password.routes] forgot-password:', error);
    return res.status(500).json({ success: false, message: 'Error enviando correo' });
  }
});

// ─── RESETEAR CONTRASEÑA ──────────────────────────────────────────────────────
router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ success: false, message: 'Datos incompletos' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ success: false, message: 'La contraseña debe tener al menos 8 caracteres' });
    }

    // Buscar tokens vigentes
    const result = await pool.query(
      'SELECT * FROM password_resets WHERE expires_at > NOW()',
      []
    );

    // Comparar token con hashes guardados
    let registro = null;
    for (const row of result.rows) {
      const match = await bcrypt.compare(token, row.token);
      if (match) { registro = row; break; }
    }

    if (!registro) {
      return res.status(400).json({ success: false, message: 'Token inválido o expirado' });
    }

    // Actualizar contraseña
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await pool.query(
      'UPDATE users SET password_hash = $1 WHERE email = $2',
      [passwordHash, registro.email]
    );

    // Eliminar token usado
    await pool.query(
      'DELETE FROM password_resets WHERE email = $1',
      [registro.email]
    );

    return res.json({ success: true, message: 'Contraseña actualizada correctamente' });

  } catch (error) {
    console.error('[password.routes] reset-password:', error);
    return res.status(500).json({ success: false, message: 'Error actualizando contraseña' });
  }
});

module.exports = router;