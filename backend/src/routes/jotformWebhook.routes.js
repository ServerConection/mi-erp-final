// src/routes/jotformWebhook.routes.js
// ============================================================
// Webhook receptor de Jotform — mismo patrón que bitrixWebhook.routes.js.
// Este router se monta SIN prefijo en app.js (app.use(jotformWebhookRoutes)),
// por eso las rutas llevan la ruta completa aquí mismo:
//   - ANY /jotform_webhook.php                    → recepción del webhook
//     (público, protegido por ?token=... contra JOTFORM_WEBHOOK_TOKEN).
//     router.all() por si Jotform algún día cambia de POST a otro método.
//   - GET /api/jotform-webhook/submissions         → consulta de lo recibido
//     (requiere sesión del ERP)
// ============================================================

const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const { recibirSubmission, listarSubmissions } = require('../controllers/jotformWebhook.controller');
const { verificarToken } = require('../middleware/auth');

// Jotform manda el body como multipart/form-data (no JSON, no query string).
// upload.none(): solo parsea campos de texto, no se esperan archivos aquí.
const upload = multer();

// Recepción del webhook — público (protegido por ?token=... contra el .env)
router.all('/jotform_webhook.php', upload.none(), recibirSubmission);

// Consulta interna: últimos envíos recibidos — requiere sesión del ERP
router.get('/api/jotform-webhook/submissions', verificarToken, listarSubmissions);

module.exports = router;
