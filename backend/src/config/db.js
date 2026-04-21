const { Pool } = require('pg');
require('dotenv').config();

/**
 * 🔐 CONFIGURACIÓN DE CONEXIÓN A PostgreSQL
 *
 * ¿Qué es SSL?
 * - SSL = Encrypted connection (segura)
 * - Sin SSL = Plain text (insegura en producción)
 *
 * rejectUnauthorized: true  = Valida certificado (🔒 Seguro)
 * rejectUnauthorized: false = NO valida certificado (⚠️ Inseguro)
 *
 * En DESARROLLO: No necesitamos certificado
 * En PRODUCCIÓN: SIEMPRE validar certificados (rejectUnauthorized: true)
 */

const pool = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,

  /**
   * 🔐 SSL según ambiente (DEVELOPMENT o PRODUCTION)
   *
   * Desarrollo (local): sin SSL = false
   * Producción (en nube): con SSL validado = { rejectUnauthorized: true }
   */
  ssl: process.env.NODE_ENV === 'production'
    ? {
        rejectUnauthorized: true,  // ✅ Validar certificado
        // Opcional si tienes certificado custom:
        // ca: fs.readFileSync('./certs/ca.crt', 'utf8')
      }
    : false, // Desarrollo sin SSL

  // Configuración de pooling para mejor rendimiento
  idleTimeoutMillis: 30000,          // Cerrar conexiones inactivas después 30s
  connectionTimeoutMillis: 2000,     // Timeout para establecer conexión
});

/**
 * 🚨 Manejo de errores de conexión
 * Si algo falla en la BD, log para debugging
 */
pool.on('error', (err) => {
  console.error('[DB] Error inesperado en pool de conexiones:', err);
});

module.exports = pool;