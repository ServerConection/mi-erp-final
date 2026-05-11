// src/routes/alertas.routes.js
// Montar en app.js: app.use('/api/alertas', require('./routes/alertas.routes'));

const router   = require('express').Router();
const notif    = require('../models/notificaciones');
const waSvc    = require('../services/whatsapp.service');
const { ejecutarAlertas } = require('../jobs/alertas.cron');
const QRCode   = require('qrcode');

// GET /api/alertas/resumen — conteos por canal para el dashboard
router.get('/resumen', async (req, res) => {
  try {
    const [resumen, porCondicion, historial] = await Promise.all([
      notif.getResumen(),
      notif.getConteosPorCondicion(),
      notif.getHistorial(20),
    ]);
    res.json({ success: true, resumen, porCondicion, historial });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/alertas/whatsapp/estado — estado de conexión WhatsApp
router.get('/whatsapp/estado', (req, res) => {
  res.json({ success: true, ...waSvc.getEstado() });
});

// GET /api/alertas/whatsapp/qr — devuelve el QR como imagen base64
router.get('/whatsapp/qr', async (req, res) => {
  try {
    const qrRaw = waSvc.getQR();
    if (!qrRaw) {
      const estado = waSvc.getEstado();
      return res.json({
        success: false,
        estado:  estado.estado,
        mensaje: estado.estado === 'conectado'
          ? 'WhatsApp ya está conectado'
          : 'QR aún no disponible — espera unos segundos e intenta de nuevo',
      });
    }
    const qrBase64 = await QRCode.toDataURL(qrRaw, { width: 280, margin: 2 });
    res.json({ success: true, qr: qrBase64, estado: 'esperando_qr' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/alertas/ejecutar — dispara el job manualmente (para pruebas)
router.post('/ejecutar', async (req, res) => {
  try {
    await ejecutarAlertas();
    res.json({ success: true, mensaje: 'Job de alertas ejecutado' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;