/**
 * PROCESO: INGESTA / WEBHOOKS
 *
 * Recibe los webhooks de Bitrix / Jotform / gestionables. Estas rutas definen
 * su path completo internamente (por eso se montan sin prefijo, igual que en el
 * monolito). Aislar la ingesta evita que una ráfaga de webhooks compita con los
 * usuarios reales del ERP.
 *
 * Fase 2 recomendada (ver guía): que estas rutas solo VALIDEN y ENCOLEN el
 * evento (BullMQ/Redis) y respondan 200 al instante; los Workers procesan.
 */
require('dotenv').config();
const { buildBaseApp, finalize } = require('../shared/createApp');
const startHttp = require('../shared/startHttp');

const app = buildBaseApp({ serviceName: 'ingesta' });

app.use(require('../routes/bitrixWebhook.routes'));       // /bitrix_webhook.php, /api/bitrix-webhook/leads
app.use(require('../routes/bitrixEvento.routes'));        // /bitrix_evento.php — eventos en tiempo real
app.use(require('../routes/gestionablesWebhook.routes')); // /bitrix_webhook_gestionables.php
app.use(require('../routes/jotformWebhook.routes'));      // /jotform_webhook.php, /api/jotform-webhook/submissions

finalize(app);
startHttp(app, { serviceName: 'ingesta', withSocket: false });
