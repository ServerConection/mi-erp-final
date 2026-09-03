/**
 * PROCESO: API GATEWAY  (único URL para el frontend)
 *
 * Enruta cada prefijo al servicio correcto conservando la RUTA COMPLETA.
 *
 * IMPORTANTE (fix): usamos `pathFilter` montando el proxy en la raíz, en vez de
 * `app.use('/prefijo', proxy)`. Con el segundo, Express recorta el prefijo y el
 * servicio destino recibe la ruta incompleta (causa de "Endpoint no encontrado").
 * Con pathFilter se reenvía la URL original tal cual.
 *
 * Reglas (orden importa: lo más específico primero):
 *   - socket.io / WhatsApp / broadcast          → WABOT
 *   - indicadores-velsa / redes-velsa / datos-adicionales → ANALÍTICA VELSA
 *   - indicadores / redes / forecast / ...       → ANALÍTICA NOVO
 *   - webhooks Bitrix/Jotform                    → INGESTA
 *   - TODO lo demás (auth, ventas, consultor...) → CORE (monolito)
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

const makeProxy = (target, pathFilter, ws = false) => createProxyMiddleware({
  target,
  changeOrigin: true,
  xfwd: true,
  ws,
  pathFilter,
  proxyTimeout: 120000,
  timeout: 120000,
});

// WhatsApp + tiempo real → WABOT (monolito por ahora)
const waProxy = makeProxy(TARGETS.WABOT, ['/socket.io/**', '/api/wa/**', '/wa-uploads/**', '/api/broadcast/**'], true);
app.use(waProxy);

// ANALÍTICA VELSA (antes que Novonet)
app.use(makeProxy(TARGETS.VELSA, [
  '/api/indicadores-velsa', '/api/indicadores-velsa/**',
  '/api/redes-velsa', '/api/redes-velsa/**',
  '/api/datos-adicionales', '/api/datos-adicionales/**',
]));

// ANALÍTICA NOVONET
app.use(makeProxy(TARGETS.NOVO, [
  '/api/indicadores', '/api/indicadores/**',
  '/api/comparativa-indicadores', '/api/comparativa-indicadores/**',
  '/api/redes', '/api/redes/**',
  '/api/forecast', '/api/forecast/**',
  '/api/coverage', '/api/coverage/**',
  '/api/llamadas', '/api/llamadas/**',
  '/api/kpi-comercial', '/api/kpi-comercial/**',
]));

// INGESTA / WEBHOOKS
app.use(makeProxy(TARGETS.INGESTA, [
  '/bitrix_webhook.php', '/api/bitrix-webhook/**',
  '/bitrix_webhook_gestionables.php',
  '/jotform_webhook.php', '/api/jotform-webhook/**',
]));

// CATCH-ALL → CORE (monolito). Incluye /api/consultor y /api/consultor-velsa.
app.use(makeProxy(TARGETS.CORE, ['/**']));

const PORT = process.env.PORT || 8080;
const server = app.listen(PORT, () => console.log(`[gateway] escuchando en :${PORT}`));
// Habilita el proxy de WebSocket (socket.io) hacia WABOT
server.on('upgrade', waProxy.upgrade);

process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT',  () => process.exit(0));
process.on('unhandledRejection', (r) => console.error('[gateway] unhandledRejection:', r));
process.on('uncaughtException',  (e) => console.error('[gateway] uncaughtException:', e));
