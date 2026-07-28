/**
 * PROCESO: WABOT  (WhatsApp aislado)
 *
 * Baileys, campañas, conversaciones, broadcast y Socket.io. Al vivir en su
 * propio proceso, una caída de WhatsApp NO reinicia el ERP. Debe correr en UNA
 * sola instancia (las sesiones de Baileys son estado local con afinidad).
 * Requiere disco persistente para WA_AUTH_DIR y WA_UPLOADS_DIR.
 *
 * Incluye alertas.cron aquí porque emite por Socket.io (getIO) y este proceso
 * es el dueño del plano de tiempo real.
 */
require('dotenv').config();
const path = require('path');
const { buildBaseApp, finalize, express } = require('../shared/createApp');
const startHttp = require('../shared/startHttp');
const { iniciarWhatsApp } = require('../services/whatsapp.service');
const { initAlertas }     = require('../jobs/alertas.cron');

const app = buildBaseApp({ serviceName: 'wabot' });

// Estáticos de medios de WhatsApp (en Render: disco persistente)
const waUploadsPath = process.env.WA_UPLOADS_DIR || path.resolve(__dirname, '..', '..', 'wa_uploads');
app.use('/wa-uploads', express.static(waUploadsPath, { maxAge: '7d' }));

app.use('/api/wa',        require('../routes/whatsapp.routes'));
app.use('/api/broadcast', require('../routes/broadcast.routes'));

finalize(app);

startHttp(app, {
  serviceName: 'wabot',
  withSocket: true,          // QR, conversaciones y broadcast en vivo
  onReady: async () => {
    await initAlertas();
    // Pasamos ESTA app para que el baileysManager se registre aquí
    // (los controladores wa lo leen vía req.app.get('baileysManager')).
    await iniciarWhatsApp(app);
  },
  onShutdown: async () => {
    // Cerrar sesiones de WhatsApp limpio evita 401/428 al reiniciar
    try {
      const wa = require('../services/whatsapp.service');
      const bm = wa.getBaileysManager && wa.getBaileysManager();
      if (bm && bm.shutdown) await bm.shutdown();
    } catch (e) {
      console.warn('[wabot] no se pudo cerrar WhatsApp limpio:', e.message);
    }
  },
});
