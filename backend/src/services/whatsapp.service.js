// whatsapp.service.js

let estado = 'desconectado';

const iniciarWhatsApp = async () => {
  console.log('[WhatsApp] Servicio no configurado — omitiendo inicio');
  estado = 'desconectado';
};

const getEstado = () => {
  return { estado };
};

const formatearAlerta = ({ supervisor, condicion, asesores }) => {
  return `🚨 ALERTA
Supervisor: ${supervisor}
Condición: ${condicion}
Asesores: ${asesores.map(a => a.nombre).join(', ')}`;
};

const enviarMensaje = async (numero, mensaje) => {
  console.log(`[WhatsApp] ${numero}: ${mensaje}`);
  return { success: false, message: 'Servicio no configurado' };
};

module.exports = {
  iniciarWhatsApp,
  enviarMensaje,
  getEstado,
  formatearAlerta
};