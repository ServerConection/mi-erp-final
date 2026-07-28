/**
 * PROCESO: API GATEWAY  (único URL para el frontend)
 *
 * Enruta cada prefijo al servicio correcto. El frontend sigue usando UN solo
 * host. Los servicios internos quedan detrás.
 *
 * Reglas (el orden importa: los prefijos más específicos primero):
 *   - Socket.io + WhatsApp + broadcast  → WABOT
 *   - indicadores-velsa / redes-velsa / datos-adicionales → ANALÍTICA VELSA
 *   - indicadores / redes / forecast / coverage / ...     → ANALÍTICA NOVO
 *   - webhooks Bitrix/Jotform            → INGESTA
 *   - TODO lo demás (auth, ventas, tthh, consultor, ...)  → CORE
 *
 * NOTA: /api/consultor y /api/consultor-velsa caen al catch-all → CORE, de modo
 * que estas APIs externas NO cambian de comportamiento.
 *
 * URLs de destino por variables de entorno (ver render.yaml / guía).
 */
require('dotenv').config();
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
app.set('trust proxy', 1);

const TARGETS = {
  WABOT:   process.env.WABOT_URL,
  VELSA:   process.env.ANALITICA_VELSA_URL,
  NOVO:    process.env.ANALITICA_NOVO_URL,
  INGESTA: process.env.INGESTA_URL,
  CORE:    process.env.CORE_URL,
};

for (const [k, v] of Object.entries(TARGETS)) {
  if (!v) console.warn(`[gateway] Falta URL de destino: ${k}_URL`);
}

app.get('/health', (req, res) => res.json({ ok: true, service: 'gateway', ts: Date.now() }));

const proxy = (target, opts = {}) => createProxyMiddleware({
  target,
  changeOrigin: true,
  xfwd: true,
  proxyTimeout: 120000,
  timeout: 120000,
  ...opts,
});

// Tiempo real de WhatsApp (WebSocket) → WABOT
app.use('/socket.io', proxy(TARGETS.WABOT, { ws: true }));

// WABOT
app.use(['/api/wa', '/wa-uploads', '/api/broadcast'], proxy(TARGETS.WABOT));

// ANALÍTICA VELSA (antes que Novonet para que -velsa gane el prefijo)
app.use(['/api/indicadores-velsa', '/api/redes-velsa', '/api/datos-adicionales'], proxy(TARGETS.VELSA));

// ANALÍTICA NOVONET
app.use([
  '/api/indicadores', '/api/comparativa-indicadores', '/api/redes',
  '/api/forecast', '/api/coverage', '/api/cumplimiento-leads', '/api/llamadas',
], proxy(TARGETS.NOVO));

// INGESTA / WEBHOOKS
app.use([
  '/bitrix_webhook.php', '/api/bitrix-webhook',
  '/bitrix_webhook_gestionables.php',
  '/jotform_webhook.php', '/api/jotform-webhook',
], proxy(TARGETS.INGESTA));

// CATCH-ALL → CORE  (incluye /api/consultor y /api/consultor-velsa, intactas)
app.use('/', proxy(TARGETS.CORE));

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`[gateway] escuchando en :${PORT}`));

process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT',  () => process.exit(0));
process.on('unhandledRejection', (r) => console.error('[gateway] unhandledRejection:', r));
process.on('uncaughtException',  (e) => console.error('[gateway] uncaughtException:', e));
