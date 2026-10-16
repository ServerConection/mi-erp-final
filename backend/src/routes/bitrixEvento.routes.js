/**
 * Rutas del receptor de eventos en tiempo real de Bitrix24.
 * Se monta SIN prefijo (app.use(bitrixEventoRoutes)), por eso las rutas van
 * completas acá:
 *   - ANY  /bitrix_evento.php                  → recepción del evento (público, ?token=...)
 *   - GET  /api/bitrix-evento/reprocesar       → reproceso manual (requiere sesión)
 */
const express = require('express');
const router  = express.Router();
const { recibirEvento, reprocesar } = require('../controllers/bitrixEvento.controller');
const { verificarToken } = require('../middleware/auth');

router.all('/bitrix_evento.php', recibirEvento);
router.get('/api/bitrix-evento/reprocesar', verificarToken, reprocesar);

module.exports = router;
