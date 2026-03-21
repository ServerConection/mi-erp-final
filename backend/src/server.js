const http    = require('http');
const app     = require('./app');
const { initSocket }      = require('./config/socket');
const { initAlertas }     = require('./jobs/alertas.cron');
const { iniciarWhatsApp } = require('./services/whatsapp.service');

const server = http.createServer(app);

// Inicializar Socket.io sobre el mismo servidor HTTP
initSocket(server);

server.listen(process.env.PORT, async () => {
  console.log(`🚀 Backend corriendo en http://localhost:${process.env.PORT}`);

  // Tabla BD + cron de alertas (cada 15 min lun-sáb 7am-8pm)
  await initAlertas();

  // WhatsApp Baileys — genera QR, no bloquea el servidor
  iniciarWhatsApp();
});