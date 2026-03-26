// whatsapp.service.js — placeholder hasta implementación completa

const enviarMensaje = async (numero, mensaje) => {
  console.log(`[WhatsApp] ${numero}: ${mensaje}`);
  return { success: false, message: 'Servicio no configurado' };
};

module.exports = { enviarMensaje };