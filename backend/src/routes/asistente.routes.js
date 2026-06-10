/**
 * Rutas del Asistente ERP — /api/asistente/*
 * Requiere autenticación: solo usuarios del ERP pueden consultar datos.
 */
const router = require('express').Router();
const { verificarToken } = require('../middleware/auth');
const asistente = require('../services/asistente.service');

router.use(verificarToken);

// POST /api/asistente/preguntar  { pregunta: "..." }
router.post('/preguntar', async (req, res) => {
  try {
    const { pregunta } = req.body || {};
    const r = await asistente.responder(pregunta);
    res.json({ success: true, ...r });
  } catch (err) {
    console.error('[Asistente] Error:', err.message);
    res.status(500).json({ success: false, error: 'Error interno del asistente' });
  }
});

// GET /api/asistente/sugerencias — preguntas de ejemplo para los chips del chat
router.get('/sugerencias', (req, res) => {
  res.json({ success: true, data: asistente.INTENCIONES.map(i => i.ejemplos) });
});

module.exports = router;
