// =============================================================================
// Contactabilidad — Webhook de eventos Bitrix
// Ruta publica (Bitrix no envia JWT): se autentica con un token por empresa.
// Se monta con path completo para que quede fuera del middleware de sesion.
//
// URL a registrar en Bitrix24 (Aplicaciones > Webhooks salientes):
//   https://<tu-dominio>/api/webhooks/contactabilidad/NOVONET?token=<TOKEN>
// Evento: ONIMOPENLINESMESSAGEADD (y opcionalmente ONCRMDEALUPDATE)
// =============================================================================
const express = require('express');
const C = require('../controllers/contactabilidad.controller');

const router = express.Router();

// Bitrix envia application/x-www-form-urlencoded anidado.
router.post('/api/webhooks/contactabilidad/:empresa',
  express.urlencoded({ extended: true, limit: '1mb' }),
  express.json({ limit: '1mb' }),
  C.webhookBitrix);

// Comprobacion rapida desde el navegador al configurar el webhook.
router.get('/api/webhooks/contactabilidad/:empresa', (req, res) =>
  res.json({ success: true, listo: true, empresa: String(req.params.empresa || '').toUpperCase() }));

module.exports = router;
