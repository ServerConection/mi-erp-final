// src/services/whatsapp.service.js
// Usa @whiskeysockets/baileys (fork activo de Baileys)
// Instalación: npm install @whiskeysockets/baileys qrcode-terminal
//
// El QR se muestra en el módulo frontend vía endpoint GET /api/alertas/whatsapp/qr
// Una vez escaneado, la sesión persiste en ./whatsapp_session/

const path = require('path');
const fs   = require('fs');

let sock           = null;
let qrActual       = null;
let estadoConexion = 'desconectado'; // 'desconectado' | 'esperando_qr' | 'conectado'
let onQRCallback   = null;

const SESSION_DIR = path.join(process.cwd(), 'whatsapp_session');

const iniciarWhatsApp = async () => {
  try {
    const {
      default: makeWASocket,
      useMultiFileAuthState,
      DisconnectReason,
      fetchLatestBaileysVersion,
    } = require('@whiskeysockets/baileys');

    if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
    const { version }          = await fetchLatestBaileysVersion();

    sock = makeWASocket({
      version,
      auth:           state,
      printQRInTerminal: false,
      browser:        ['ERP Novonet', 'Chrome', '1.0'],
      qrTimeout:      60000,   // 60 segundos para escanear
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
      if (qr) {
        qrActual       = qr;
        estadoConexion = 'esperando_qr';
        console.log('[WA] QR generado — escanear desde el módulo de Notificaciones');
        if (onQRCallback) onQRCallback(qr);
      }
      if (connection === 'open') {
        estadoConexion = 'conectado';
        qrActual       = null;
        console.log('[WA] WhatsApp conectado ✓');
      }
      if (connection === 'close') {
        const code = lastDisconnect?.error?.output?.statusCode;
        estadoConexion = 'desconectado';
        if (code !== DisconnectReason.loggedOut) {
          console.log('[WA] Reconectando...');
          setTimeout(iniciarWhatsApp, 5000);
        } else {
          console.log('[WA] Sesión cerrada — elimina whatsapp_session/ y reinicia');
          fs.rmSync(SESSION_DIR, { recursive: true, force: true });
        }
      }
    });

  } catch (e) {
    console.error('[WA] Error iniciando WhatsApp:', e.message);
  }
};

// Envía mensaje de texto a un número (formato: '593XXXXXXXXX@s.whatsapp.net')
const enviarMensaje = async (numero, mensaje) => {
  if (!sock || estadoConexion !== 'conectado') {
    throw new Error('WhatsApp no conectado');
  }
  const jid = numero.includes('@') ? numero : `${numero}@s.whatsapp.net`;
  await sock.sendMessage(jid, { text: mensaje });
};

// Formatea el mensaje de alerta para WhatsApp
const formatearAlerta = ({ supervisor, condicion, asesores = [] }) => {
  const EMOJIS = {
    gestion_diaria: '⚠️',
    contacto_nuevo: '🔴',
    sin_ventas:     '📉',
  };
  const TITULOS = {
    gestion_diaria: 'Leads en Gestión Diaria sin mover',
    contacto_nuevo: 'Leads en Contacto Nuevo sin responder',
    sin_ventas:     'Asesores sin ingresos hoy',
  };

  const emoji  = EMOJIS[condicion]  || '🔔';
  const titulo = TITULOS[condicion] || 'Alerta de gestión';
  const fecha  = new Date().toLocaleString('es-EC', { timeZone: 'America/Guayaquil' });

  const listaAsesores = asesores.length > 0
    ? asesores.map(a => `  • ${a.nombre}${a.cantidad ? ` (${a.cantidad})` : ''}`).join('\n')
    : '  Sin detalle adicional';

  return `${emoji} *${titulo}*\n\nHola *${supervisor}*,\n\n${listaAsesores}\n\n_${fecha} — Sistema ERP Novonet_`;
};

const getEstado = () => ({ estado: estadoConexion, tieneQR: !!qrActual });
const getQR    = () => qrActual;
const setOnQR  = (cb) => { onQRCallback = cb; };

module.exports = { iniciarWhatsApp, enviarMensaje, formatearAlerta, getEstado, getQR, setOnQR };