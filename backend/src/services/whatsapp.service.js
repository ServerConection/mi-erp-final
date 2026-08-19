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

// appInstance: opcional. Cuando WABOT corre como proceso separado, el
// entrypoint pasa SU app Express para registrar el baileysManager ahí. Si no
// se pasa (monolito), cae al require('../app') de siempre → sin cambios.
const iniciarWhatsApp = async (appInstance) => {
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
    const app = appInstance || require('../app');
    app.set('baileysManager', baileysManager);
    app.set('campaignEngine', campaignEngine);

    timeoutService.start();
    scheduler.start();

    await campaignEngine.resumePendingOnBoot();

    // Restaurar TODAS las líneas con sesión previa en disco.
    //
    // Se incluye 'error' a propósito: ese estado no significa solo "bloqueada
    // por WhatsApp", también aparece al agotar los reintentos por un corte de
    // red, y en ese caso la sesión guardada sigue siendo válida. Excluirlas
    // hacía que se acumularan decenas de líneas caídas esperando un QR manual
    // que en realidad no hacía falta.
    //
    // Si la sesión ya no sirve, WhatsApp responde 401 y ahí sí se limpian las
    // credenciales y se pide QR (ver BaileysManager, manejo de 'close').
    // Solo se excluye 'logged_out': ahí la sesión fue cerrada explícitamente.
    const { rows } = await pool.query(
      `SELECT id, name FROM lines
       WHERE status IN ('connected','disconnected','connecting','qr_ready','error')
         AND last_connected IS NOT NULL
         AND deleted_at IS NULL`
    );
    if (rows.length) {
      console.log('[WA] Restaurando', rows.length, 'línea(s)...');
      for (const line of rows) {
        try {
          await baileysManager.connect(line.id);
          // Pausa breve entre líneas: evita golpear DB/CPU con todas a la vez
          await new Promise(r => setTimeout(r, 1500));
        }
        catch (e) { console.warn('[WA] Error restaurando', line.name, ':', e.message); }
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
