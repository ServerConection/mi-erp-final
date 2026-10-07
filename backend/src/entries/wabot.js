/**
 * PROCESO: WABOT  (WhatsApp aislado en su propio servicio de Render)
 *
 * Baileys, campañas, chatbots, inbox, programados y el conector de Canales
 * Abiertos de Bitrix24. Al vivir aparte, un deploy del ERP ya NO tumba WhatsApp.
 *
 * Cómo encaja (ver GUIA_WABOT_SERVICIO_EXTERNO.md):
 *   - El ERP (monolito) conserva su URL y reenvía /api/wa, /api/bitrix-connector*
 *     y /wa-uploads a este servicio (variable WABOT_REMOTE_URL en el ERP).
 *   - Los eventos en vivo salen por Socket.io con el adaptador Postgres
 *     (SOCKET_PG_ADAPTER=on en AMBOS servicios) y llegan al navegador, que
 *     sigue conectado al socket del ERP.
 *   - UNA sola instancia. Sesiones en Postgres (WA_AUTH_STORE=pg) + lease por línea.
 *
 * Interruptor: WABOT_ACTIVO=true enciende WhatsApp. Sin él, el servicio solo
 * levanta HTTP (/health) — sirve para crearlo en Render sin chocar con el ERP.
 *
 * alertas.cron NO corre aquí: sigue en el ERP (evita alertas duplicadas).
 */
require('dotenv').config();
const path = require('path');
const { buildBaseApp, finalize, express } = require('../shared/createApp');
const startHttp = require('../shared/startHttp');
const { iniciarWhatsApp } = require('../services/whatsapp.service');

const app = buildBaseApp({ serviceName: 'wabot' });

// Estáticos de medios de WhatsApp (en Render: disco persistente)
const waUploadsPath = process.env.WA_UPLOADS_DIR || path.resolve(__dirname, '..', '..', 'wa_uploads');
app.use('/wa-uploads', express.static(waUploadsPath, { maxAge: '7d' }));

app.use('/api/wa',                    require('../routes/whatsapp.routes'));
app.use('/api/bitrix-connector',       require('../routes/bitrixConnector.routes'));
app.use('/api/bitrix-connector-velsa', require('../routes/bitrixConnectorVelsa.routes'));

finalize(app);

const WABOT_ACTIVO = String(process.env.WABOT_ACTIVO || '').toLowerCase() === 'true';

startHttp(app, {
  serviceName: 'wabot',
  withSocket: true,          // emite QR, mensajes y estados (vía adaptador Postgres)
  onReady: async () => {
    if (!WABOT_ACTIVO) {
      console.warn('[wabot] WABOT_ACTIVO no es "true": WhatsApp NO se inicia (modo espera).');
      return;
    }
    // Pasamos ESTA app para que el baileysManager se registre aquí
    // (los controladores wa lo leen vía req.app.get('baileysManager')).
    await iniciarWhatsApp(app);
  },
  onShutdown: async () => {
    // Cerrar sesiones de WhatsApp limpio evita 401/428 al reiniciar
    try {
      const wa = require('../services/whatsapp.service');
      if (wa.detenerWhatsApp) await wa.detenerWhatsApp();
    } catch (e) {
      console.warn('[wabot] no se pudo cerrar WhatsApp limpio:', e.message);
    }
  },
});
