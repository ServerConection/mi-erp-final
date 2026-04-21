/**
 * 🔍 SERVICIO DE AUDITORÍA
 *
 * ¿Para qué sirve?
 * Registrar TODOS los intentos de login (exitosos y fallidos)
 * para auditoría, debugging y detección de intentos maliciosos
 *
 * ¿Qué se registra?
 * - Usuario que intentó login
 * - IP desde donde se conectó
 * - Si fue exitoso o falló
 * - Razón del fallo (contraseña incorrecta, usuario no existe, etc)
 * - Timestamp del intento
 *
 * ¿Por qué es importante?
 * - Detectar ataques de fuerza bruta (muchos intentos desde una IP)
 * - Auditoría: quién accedió y cuándo
 * - Debugging: investigar problemas de login
 */

const pool = require('../config/db');

/**
 * 📝 Registrar un intento de login
 *
 * @param {string} username - Usuario que intentó login
 * @param {string} ipAddress - IP del cliente
 * @param {boolean} success - ¿Login exitoso?
 * @param {string} reason - Razón si falló (ej: "Credenciales inválidas")
 */
async function registrarIntento(username, ipAddress, success, reason = null) {
  try {
    // Insertar en tabla audit_login
    await pool.query(
      `INSERT INTO audit_login (username, ip_address, success, reason, timestamp)
       VALUES ($1, $2, $3, $4, NOW())`,
      [username, ipAddress, success, reason]
    );

    // Log local para debugging
    const estado = success ? '✅ EXITOSO' : '❌ FALLIDO';
    console.log(`[AUDIT] ${estado} - Usuario: ${username}, IP: ${ipAddress}, Razón: ${reason || 'N/A'}`);

  } catch (error) {
    // No fallar el login si falla la auditoría
    // Solo registrar en logs para debugging
    console.error('[AUDIT] Error registrando intento:', error);
  }
}

/**
 * 📊 Obtener intentos fallidos recientes de un usuario
 *
 * Útil para:
 * - Detectar ataques de fuerza bruta
 * - Bloquear usuario después de X intentos fallidos
 *
 * @param {string} username - Usuario a buscar
 * @param {number} minutos - Rango de tiempo (default 15 minutos)
 * @returns {number} Cantidad de intentos fallidos en ese rango
 */
async function obtenerIntentosFallidos(username, minutos = 15) {
  try {
    const resultado = await pool.query(
      `SELECT COUNT(*) as intentos
       FROM audit_login
       WHERE username = $1
         AND success = false
         AND timestamp > NOW() - INTERVAL '${minutos} minutes'`,
      [username]
    );

    return parseInt(resultado.rows[0].intentos);

  } catch (error) {
    console.error('[AUDIT] Error obteniendo intentos:', error);
    return 0;
  }
}

/**
 * 🔗 Obtener todos los intentos de un usuario
 *
 * Útil para auditoría: ver historial de accesos
 *
 * @param {string} username - Usuario
 * @param {number} limite - Cantidad máxima de registros
 * @returns {Array} Historial de intentos
 */
async function obtenerHistorial(username, limite = 50) {
  try {
    const resultado = await pool.query(
      `SELECT username, ip_address, success, reason, timestamp
       FROM audit_login
       WHERE username = $1
       ORDER BY timestamp DESC
       LIMIT $2`,
      [username, limite]
    );

    return resultado.rows;

  } catch (error) {
    console.error('[AUDIT] Error obteniendo historial:', error);
    return [];
  }
}

/**
 * 🚨 Obtener IPs sospechosas (muchos intentos fallidos)
 *
 * Útil para detectar ataques
 *
 * @param {number} minutos - Rango de tiempo
 * @param {number} minIntentos - Umbral mínimo para considerar sospechosa
 * @returns {Array} IPs con intentos fallidos
 */
async function obtenerIPsSospechosas(minutos = 60, minIntentos = 10) {
  try {
    const resultado = await pool.query(
      `SELECT ip_address, COUNT(*) as intentos_fallidos
       FROM audit_login
       WHERE success = false
         AND timestamp > NOW() - INTERVAL '${minutos} minutes'
       GROUP BY ip_address
       HAVING COUNT(*) >= $1
       ORDER BY intentos_fallidos DESC`,
      [minIntentos]
    );

    return resultado.rows;

  } catch (error) {
    console.error('[AUDIT] Error obteniendo IPs sospechosas:', error);
    return [];
  }
}

module.exports = {
  registrarIntento,
  obtenerIntentosFallidos,
  obtenerHistorial,
  obtenerIPsSospechosas
};
