// src/jobs/alertas.cron.js
// Instalación: npm install node-cron nodemailer @whiskeysockets/baileys
//
// Llama initAlertas() desde tu app.js/server.js:
//   const { initAlertas } = require('./jobs/alertas.cron');
//   initAlertas();

const cron        = require('node-cron');
const alertasSvc  = require('../services/alertas.service');
const correoSvc   = require('../services/correo.service');
const waSvc       = require('../services/whatsapp.service');
const notifModel  = require('../models/notificaciones');
const { getIO }   = require('../config/socket');

// Mapa supervisor → { email, whatsapp }
// Personaliza con los datos reales de tu equipo
const SUPERVISORES = {
  'ANDRES RODRIGUEZ': {
    email:    'supervisor4@novonet.net',
    whatsapp: '593999925455',
  },
  'JAVIER NAVARRETE': {
    email:    'supervisor2@novonet.net',
    whatsapp: '593984892363',
  },
  'NOVONET ECUADOR': {
    email:    'coordinadorventas1@novonet.net',
    whatsapp: '593983336118',
  },
  'RICARDO ECHEVERRIA': {
    email:    'supervisor3@novonet.net',
    whatsapp: '593992620501',
  },
};

// ── Procesar una alerta: dispara ERP + Email + WhatsApp ─────────────────────
const procesarAlerta = async (alerta) => {
  const { supervisor, condicion, asesores, total } = alerta;
  const contacto = SUPERVISORES[supervisor];

  if (!contacto) {
    console.log(`[CRON] Sin contacto para supervisor: ${supervisor}`);
    return;
  }

  const io = (() => { try { return getIO(); } catch { return null; } })();

  // ── Canal 1: ERP (Socket.io — aparece en cualquier módulo abierto) ─────────
  try {
    if (io) {
      io.emit('alerta_supervisor', {
        supervisor,
        condicion,
        asesores,
        total,
        timestamp: new Date().toISOString(),
      });
    }
    await notifModel.registrar({
      tipo: 'ERP', canal: 'ERP',
      supervisor, condicion,
      asesor: asesores.map(a => a.nombre).join(', '),
      mensaje: `${condicion} — ${total} registros`,
      enviado_ok: !!io,
    });
  } catch (e) {
    console.error('[CRON] Error ERP socket:', e.message);
  }

  // ── Canal 2: Email ──────────────────────────────────────────────────────────
  if (contacto.email) {
    try {
      await correoSvc.enviarAlerta({
        para:       contacto.email,
        supervisor,
        condicion,
        asesores,
        detalle:    `Se detectaron ${total} caso(s) que requieren atención inmediata.`,
      });
      await notifModel.registrar({
        tipo: 'EMAIL', canal: 'EMAIL',
        supervisor, condicion,
        asesor: asesores.map(a => a.nombre).join(', '),
        mensaje: `Email enviado a ${contacto.email}`,
        enviado_ok: true,
      });
      console.log(`[CRON] Email enviado a ${supervisor} (${contacto.email})`);
    } catch (e) {
      console.error(`[CRON] Error email ${supervisor}:`, e.message);
      await notifModel.registrar({
        tipo: 'EMAIL', canal: 'EMAIL',
        supervisor, condicion,
        mensaje: `Error enviando email`,
        enviado_ok: false, error_detalle: e.message,
      });
    }
  }

  // ── Canal 3: WhatsApp ───────────────────────────────────────────────────────
  if (contacto.whatsapp && waSvc.getEstado().estado === 'conectado') {
    try {
      const msg = waSvc.formatearAlerta({ supervisor, condicion, asesores });
      await waSvc.enviarMensaje(contacto.whatsapp, msg);
      await notifModel.registrar({
        tipo: 'WHATSAPP', canal: 'WHATSAPP',
        supervisor, condicion,
        asesor: asesores.map(a => a.nombre).join(', '),
        mensaje: `WhatsApp enviado a ${contacto.whatsapp}`,
        enviado_ok: true,
      });
      console.log(`[CRON] WhatsApp enviado a ${supervisor}`);
    } catch (e) {
      console.error(`[CRON] Error WhatsApp ${supervisor}:`, e.message);
      await notifModel.registrar({
        tipo: 'WHATSAPP', canal: 'WHATSAPP',
        supervisor, condicion,
        mensaje: `Error enviando WhatsApp`,
        enviado_ok: false, error_detalle: e.message,
      });
    }
  }
};

// ── Job principal ─────────────────────────────────────────────────────────────
const ejecutarAlertas = async () => {
  console.log(`[CRON] Ejecutando detección de alertas — ${new Date().toLocaleString('es-EC', { timeZone: 'America/Guayaquil' })}`);
  try {
    const alertas = await alertasSvc.detectarTodo();
    if (alertas.length === 0) {
      console.log('[CRON] Sin alertas que disparar');
      return;
    }
    console.log(`[CRON] ${alertas.length} alertas detectadas`);
    for (const alerta of alertas) {
      await procesarAlerta(alerta);
    }
  } catch (e) {
    console.error('[CRON] Error en job de alertas:', e.message);
  }
};

// ── Inicializar: crea tabla + programa cron ───────────────────────────────────
const initAlertas = async () => {
  await notifModel.crearTabla();
  // Cada 15 minutos en horario laboral (lun-sáb, 7am-8pm hora Ecuador)
  cron.schedule('*/15 7-20 * * 1-6', ejecutarAlertas, {
    timezone: 'America/Guayaquil',
  });
  console.log('[CRON] Job de alertas programado cada 15 min (lun-sáb 7am-8pm)');
};

module.exports = { initAlertas, ejecutarAlertas };