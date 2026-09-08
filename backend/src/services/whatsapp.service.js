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
// Tablas de WABOT-BITRIX: wa_auth_state (sesiones de Baileys en Postgres),
// wa_line_locks y el mapeo con Bitrix. Va aparte y NO tumba el arranque si
// falla: el modo 'disco' sigue funcionando sin estas tablas, así que un error
// aquí no puede dejar a los asesores sin WhatsApp. Pero sin ellas
// WA_AUTH_STORE='pg' no puede activarse, por eso se avisa fuerte.
const ejecutarMigracionWabotBitrix = async () => {
  try {
    const sqlPath = path.join(__dirname, '../migrations/wabot_bitrix.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    await pool.query(sql);
    console.log('[WA] Tablas WABOT-BITRIX verificadas (wa_auth_state, wa_line_locks, mapeo Bitrix)');
  } catch (err) {
    console.error('[WA] ⚠️ No se pudieron crear las tablas WABOT-BITRIX:', err.message);
    console.error("[WA] ⚠️ WA_AUTH_STORE='pg' NO debe activarse hasta que esto pase.");
  }
};

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
    await ejecutarMigracionWabotBitrix();

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

    // Restaurar las líneas que TIENEN SESIÓN EN DISCO, no las que la base
    // dice que estaban conectadas.
    //
    // Por qué cambió: el filtro anterior era `status = 'connected'`. Una línea
    // que se cae un momento agota sus 5 reintentos y queda en 'disconnected' o
    // 'error', y NADA revierte ese estado. El arranque siguiente ya no la mira,
    // así que no vuelve a levantarse nunca — aunque su sesión siga intacta en
    // disco. Con el tiempo la lista de 'connected' se vacía y el servidor deja
    // de levantar líneas perfectamente válidas: el asesor termina escaneando un
    // QR nuevo cuando la sesión vieja seguía sirviendo.
    // (Auditoría 08/09/2026: 87 sesiones válidas en disco contra 0 líneas en
    // 'connected' en la base.)
    //
    // Ahora manda el disco: si la línea tiene creds.json, tiene sesión y se
    // intenta levantar sin QR. 'logged_out' queda fuera a propósito — ahí
    // WhatsApp cerró la sesión de verdad y sí hace falta escanear de nuevo.
    //
    // Se puede saltar del todo con WA_SKIP_BOOT_RESTORE=true, y limitar cuántas
    // se levantan por arranque con WA_BOOT_RESTORE_MAX (0 = todas).
    if (process.env.WA_SKIP_BOOT_RESTORE === 'true') {
      console.log('[WA] Restauración de líneas al arranque desactivada (WA_SKIP_BOOT_RESTORE)');
    } else {
      const { rows } = await pool.query(
        `SELECT id, name, status FROM lines
          WHERE deleted_at IS NULL
            AND status <> 'logged_out'
          ORDER BY last_connected DESC NULLS LAST`
      );

      // El disco es la fuente de verdad: sin creds.json no hay sesión que reusar
      // y conectar solo serviría para pedir un QR que nadie está mirando.
      const conSesion = rows.filter(l =>
        fs.existsSync(path.join(authDir, String(l.id), 'creds.json'))
      );

      const tope = parseInt(process.env.WA_BOOT_RESTORE_MAX || '0', 10);
      const aRestaurar = tope > 0 ? conSesion.slice(0, tope) : conSesion;

      const sinSesion = rows.length - conSesion.length;
      console.log(
        `[WA] Líneas candidatas: ${rows.length} · con sesión en disco: ${conSesion.length}` +
        ` · sin sesión (necesitan QR): ${sinSesion}` +
        (tope > 0 && conSesion.length > tope ? ` · tope por arranque: ${tope}` : '')
      );

      if (aRestaurar.length) {
        console.log('[WA] Restaurando', aRestaurar.length, 'línea(s) con sesión guardada...');
        let ok = 0, fallidas = 0;
        for (const line of aRestaurar) {
          try {
            await baileysManager.connect(line.id);
            ok++;
            // Pausa amplia entre líneas: no golpear DB/CPU ni la IP con todas a la vez
            await new Promise(r => setTimeout(r, 4000));
          }
          catch (e) {
            fallidas++;
            console.warn('[WA] Error restaurando', line.name, ':', e.message);
          }
        }
        console.log(`[WA] Restauración terminada: ${ok} iniciada(s), ${fallidas} con error`);
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
