const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { enviarOTP } = require('../services/email.service');

// Solo habilitar en entorno de desarrollo
router.post('/test-email', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ success: false, error: 'No disponible en producción' });
  }

  try {
    const { correo } = req.body;

    if (!correo) {
      return res.status(400).json({ success: false, error: 'Correo requerido' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(correo)) {
      return res.status(400).json({ success: false, error: 'Correo inválido' });
    }

    // OTP criptográficamente seguro
    const codigo = crypto.randomInt(100000, 999999);

    await enviarOTP(correo, codigo);

    return res.json({
      success: true,
      mensaje: 'Correo enviado',
      // NUNCA devolver el código en producción
      ...(process.env.NODE_ENV !== 'production' && { codigo })
    });

  } catch (error) {
    console.error('[test.email.routes]:', error);
    return res.status(500).json({ success: false, error: 'Error enviando correo' });
  }
});

module.exports = router;