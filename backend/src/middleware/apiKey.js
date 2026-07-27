/**
 * MIDDLEWARE: API Key para consultor externo
 * Valida que la petición traiga la clave correcta.
 *
 * Uso:
 *   Header:       x-api-key: <tu_clave>
 *   Query param:  ?api_key=<tu_clave>
 *
 * Configuración:
 *   Agrega en tu .env:  CONSULTOR_API_KEY=clave_secreta_aqui        (Novonet)
 *                       CONSULTOR_VELSA_API_KEY=clave_secreta_aqui  (Velsa)
 */

const crypto = require('crypto');

// SEGURIDAD: comparación en tiempo constante para evitar timing attacks
function comparaSegura(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Fábrica de middlewares de API Key.
 * Genera un validador que compara contra la variable de entorno indicada,
 * permitiendo tener claves independientes por empresa/consultor.
 *
 * @param {string} envVar  Nombre de la variable de entorno con la clave esperada.
 * @returns {import('express').RequestHandler}
 */
function crearValidadorApiKey(envVar) {
  return (req, res, next) => {
    const apiKey =
      req.headers['x-api-key'] ||
      req.query.api_key;

    const claveEsperada = process.env[envVar];

    if (!claveEsperada) {
      console.error(`[apiKey] ${envVar} no está definida en .env`);
      return res.status(500).json({
        success: false,
        error: 'API Key no configurada en el servidor'
      });
    }

    if (!apiKey || !comparaSegura(apiKey, claveEsperada)) {
      return res.status(401).json({
        success: false,
        error: 'API Key inválida o ausente'
      });
    }

    next();
  };
}

// Novonet (clave existente, sin cambios de comportamiento)
const validarApiKey = crearValidadorApiKey('CONSULTOR_API_KEY');

// Velsa (clave independiente)
const validarApiKeyVelsa = crearValidadorApiKey('CONSULTOR_VELSA_API_KEY');

module.exports = { validarApiKey, validarApiKeyVelsa, crearValidadorApiKey };
