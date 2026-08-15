const express = require('express');
const router = express.Router();
const sgMail = require('@sendgrid/mail');

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: 'Email requerido' });
    }

    // Validación básica de formato de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ success: false, message: 'Email inválido' });
    }

    const msg = {
      to: process.env.ADMIN_EMAIL,
      from: process.env.EMAIL_FROM,
      subject: 'Solicitud de recuperación de contraseña',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:400px;margin:auto;padding:24px;border:1px solid #e0e0e0;border-radius:8px;">
          <h3 style="color:#333;">🔐 Solicitud de recuperación</h3>
          <p>El usuario con correo <b>${email}</b> solicitó restablecer su contraseña.</p>
          <p>Ingresa al sistema para generar una nueva contraseña.</p>
        </div>
      `
    };

    await sgMail.send(msg);

    // Respuesta genérica (no revelar si el email existe o no)
    return res.json({
      success: true,
      message: 'Si el correo está registrado, recibirás instrucciones pronto.'
    });

  } catch (error) {
    console.error('[forgotPassword.routes]:', error);
    return res.status(500).json({ success: false, error: 'Error enviando correo' });
  }
});

module.exports = router;