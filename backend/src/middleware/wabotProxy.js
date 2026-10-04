/**
 * WABOT EXTERNO — reenvío desde el monolito al servicio "erp-wabot".
 *
 * Solo se activa si existe la variable WABOT_REMOTE_URL. Sin ella esta función
 * devuelve null y el monolito sigue exactamente igual que antes (WhatsApp
 * dentro del mismo proceso). Así el cambio se puede desplegar apagado y
 * encenderse/apagarse desde Render sin tocar código (rollback = borrar la var).
 *
 * El frontend y Bitrix24 siguen llamando a la MISMA URL del ERP: el monolito
 * reenvía estas rutas tal cual (ruta completa, cuerpo sin parsear) al wabot.
 *
 * DEBE montarse ANTES de express.json(): si el cuerpo ya fue leído, el proxy
 * reenvía una petición vacía (subidas de archivos y eventos de Bitrix).
 */
const { createProxyMiddleware } = require('http-proxy-middleware');

// Prefijos que viven en el servicio wabot (todos dependen de BaileysManager).
// Se comparan por segmento completo: '/api/wa' atrapa '/api/wa' y '/api/wa/...'
// pero NO '/api/wabot' ni '/api/waX'.
const PREFIJOS_API = ['/api/wa', '/api/bitrix-connector', '/api/bitrix-connector-velsa'];
const PREFIJOS_UPLOADS = ['/wa-uploads'];

const filtroPorPrefijos = (prefijos) => (pathname) =>
  prefijos.some((p) => pathname === p || pathname.startsWith(p + '/'));

function crearProxy(pathFilter) {
  const target = (process.env.WABOT_REMOTE_URL || '').replace(/\/+$/, '');
  if (!target) return null;
  return createProxyMiddleware({
    target,
    pathFilter,
    changeOrigin: true,
    xfwd: true,
    proxyTimeout: 120000,
    timeout: 120000,
    // Llave interna: el wabot la usa para no aplicar su rate limit por IP
    // (todas las peticiones le llegan desde la IP del monolito, que ya limitó).
    headers: process.env.WABOT_INTERNAL_KEY ? { 'x-wabot-proxy-key': process.env.WABOT_INTERNAL_KEY } : {},
    on: {
      error: (err, req, res) => {
        console.error('[wabot-proxy]', req.method, req.originalUrl || req.url, '->', err.code || err.message);
        if (res && !res.headersSent && typeof res.status === 'function') {
          res.status(502).json({ success: false, error: 'Servicio de WhatsApp no disponible, intenta en unos segundos' });
        }
      },
    },
  });
}

/** Proxy de las APIs de WhatsApp/Bitrix-conector. null si WABOT_REMOTE_URL no está. */
const wabotApiProxy = () => crearProxy(filtroPorPrefijos(PREFIJOS_API));

/** Proxy de medios nuevos (/wa-uploads) para los archivos que ya no están en el disco local. */
const wabotUploadsProxy = () => crearProxy(filtroPorPrefijos(PREFIJOS_UPLOADS));

const wabotEsExterno = () => Boolean((process.env.WABOT_REMOTE_URL || '').trim());

module.exports = { wabotApiProxy, wabotUploadsProxy, wabotEsExterno };
