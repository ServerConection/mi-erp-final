/**
 * WhatsApp Service — ERP
 * Reemplaza el stub. Usa BaileysManager + CampaignEngine.
 */
const { getIO } = require('../config/socket');
const BaileysManager     = require('./BaileysManager');
const CampaignEngine     = require('./CampaignEngine');
const WaTimeoutService   = require('./wa_timeout.service');
const WaSchedulerService = require('./wa_scheduler.service');
const pool = require('../config/db');
const path = require('path');
const fs   = require('fs');

let baileysManager = null;
let campaignEngine = null;
let timeoutService = null;
let scheduler      = null;

// Ejecuta la migración del módulo (idempotente: CREATE TABLE IF NOT EXISTS)
// Así no depende de correrla manualmente desde una PC local.
const ejecutarMigracion = async () => {
  try {
    const sqlPath = path.join(__dirname, '../migrations/whatsapp_schema.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    await pool.query(sql);
    console.log('[WA] Migración verificada/aplicada (tablas OK)');
  } catch (err) {
    console.error('[WA] Error en migración automática:', err.message);
    throw err;
  }
};

const iniciarWhatsApp = async () => {
  try {
    const io = getIO();

    await ejecutarMigracion();

    const authDir = process.env.WA_AUTH_DIR || path.join(__dirname, '../../auth_sessions');
    fs.mkdirSync(authDir, { recursive: true });

    baileysManager = new BaileysManager(io);
    campaignEngine = new CampaignEngine(baileysManager, io);
    timeoutService = new WaTimeoutService(baileysManager, io);
    scheduler      = new WaSchedulerService({ baileysManager, campaignEngine, io });

    // Registrar en la app Express para que los controladores accedan vía req.app.get(...)
    const app = require('../app');
    app.set('baileysManager', baileysManager);
    app.set('campaignEngine', campaignEngine);

    timeoutService.start();
    scheduler.start();

    await campaignEngine.resumePendingOnBoot();

    const { rows } = await pool.query(
      "SELECT id, name FROM lines WHERE status = 'connected'"
    );
    if (rows.length) {
      console.log('[WA] Reconectando', rows.length, 'línea(s)...');
      for (const line of rows) {
        try { await baileysManager.connect(line.id); }
        catch (e) { console.warn('[WA] Error reconectando', line.name, ':', e.message); }
      }
    }
    console.log('[WA] Módulo WhatsApp iniciado');
  } catch (err) {
    console.error('[WA] Error al iniciar:', err.message);
  }
};

const getBaileysManager = () => baileysManager;
const getCampaignEngine = () => campaignEngine;

const getEstado = () => ({
  estado: baileysManager ? 'activo' : 'desconectado',
  lineas: baileysManager ? Object.keys(baileysManager.instances).length : 0,
});

const enviarMensaje = async (lineId, numero, mensaje) => {
  if (!baileysManager) return { success: false, message: 'WhatsApp no inicializado' };
  try {
    await baileysManager.sendText(lineId, numero, mensaje);
    return { success: true };
  } catch (err) {
    return { success: false, message: err.message };
  }
};

// Mantiene compatibilidad con el código existente del ERP
const formatearAlerta = ({ supervisor, condicion, asesores }) =>
  `🚨 ALERTA\nSupervisor: ${supervisor}\nCondición: ${condicion}\nAsesores: ${asesores.map(a => a.nombre).join(', ')}`;

module.exports = {
  iniciarWhatsApp,
  getBaileysManager,
  getCampaignEngine,
  getEstado,
  enviarMensaje,
  formatearAlerta,
};
