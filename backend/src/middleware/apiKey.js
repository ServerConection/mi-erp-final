/**
 * MIDDLEWARE: API Key para consultor externo
 * Valida que la petición traiga la clave correcta.
 *
 * Uso:
 *   Header:       x-api-key: <tu_clave>
 *   Query param:  ?api_key=<tu_clave>
 *
 * Configuración:
 *   Agrega en tu .env:  CONSULTOR_API_KEY=clave_secreta_aqui
 */

const validarApiKey = (req, res, next) => {
  const apiKey =
    req.headers['x-api-key'] ||
    req.query.api_key;

  const claveEsperada = process.env.CONSULTOR_API_KEY;

  if (!claveEsperada) {
    console.error('[apiKey] CONSULTOR_API_KEY no está definida en .env');
    return res.status(500).json({
      success: false,
      error: 'API Key no configurada en el servidor'
    });
  }

  if (!apiKey || apiKey !== claveEsperada) {
    return res.status(401).json({
      success: false,
      error: 'API Key inválida o ausente'
    });
  }

  next();
};

module.exports = { validarApiKey };
