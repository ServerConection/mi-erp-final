// whatsapp.service.js — placeholder hasta implementación completa

const iniciarWhatsApp = async () => {
  console.log('[WhatsApp] Servicio no configurado — omitiendo inicio');
};

const enviarMensaje = async (numero, mensaje) => {
  console.log(`[WhatsApp] ${numero}: ${mensaje}`);
  return { success: false, message: 'Servicio no configurado' };
};

module.exports = { iniciarWhatsApp, enviarMensaje };