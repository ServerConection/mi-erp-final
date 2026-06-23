// src/utils/storageClient.js
// ============================================================
// Cliente HTTP hacia el servicio de almacenamiento local
// (local-storage-server, expuesto vía Cloudflare Tunnel).
//
// El backend principal es el ÚNICO que habla con este servicio —
// nunca se expone la URL ni la API key al navegador.
//
// Variables de entorno requeridas (Render):
//   STORAGE_SERVER_URL  — ej: https://storage.tudominio.com
//   STORAGE_API_KEY     — misma clave configurada en local-storage-server/.env
//
// Si estas variables no están configuradas, las funciones lanzan error
// para que las rutas que las usan puedan responder con un mensaje claro
// en vez de fallar silenciosamente.
// ============================================================

const STORAGE_SERVER_URL = (process.env.STORAGE_SERVER_URL || '').replace(/\/+$/, '');
const STORAGE_API_KEY    = process.env.STORAGE_API_KEY || '';

const configurado = () => Boolean(STORAGE_SERVER_URL && STORAGE_API_KEY);

/**
 * Sube un archivo (buffer en memoria, viene de multer memoryStorage) al
 * servidor de almacenamiento local, dentro de la carpeta indicada.
 *
 * @param {Object} opts
 * @param {Buffer} opts.buffer         - contenido del archivo
 * @param {string} opts.originalname   - nombre original (para extraer extensión)
 * @param {string} opts.mimetype       - mimetype del archivo
 * @param {string} opts.carpeta        - cédula del cliente / código de asesor / "generales"
 * @returns {Promise<{carpeta:string, archivo:string, nombreOriginal:string}>}
 */
async function subirArchivo({ buffer, originalname, mimetype, carpeta }) {
  if (!configurado()) {
    throw new Error('STORAGE_SERVER_URL / STORAGE_API_KEY no están configurados en el backend');
  }

  const fd = new FormData();
  fd.append('archivo', new Blob([buffer], { type: mimetype }), originalname);
  fd.append('carpeta', carpeta);

  const resp = await fetch(`${STORAGE_SERVER_URL}/upload`, {
    method: 'POST',
    headers: { 'x-api-key': STORAGE_API_KEY },
    body: fd,
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.success) {
    throw new Error(data.error || `Error subiendo archivo al servidor local (HTTP ${resp.status})`);
  }
  return data; // { success, carpeta, archivo, nombreOriginal }
}

/**
 * Descarga un archivo del servidor de almacenamiento local y devuelve
 * su contenido como Buffer junto con metadatos básicos.
 *
 * @param {string} carpeta
 * @param {string} archivo
 * @returns {Promise<{buffer:Buffer, contentType:string}>}
 */
async function obtenerArchivo(carpeta, archivo) {
  if (!configurado()) {
    throw new Error('STORAGE_SERVER_URL / STORAGE_API_KEY no están configurados en el backend');
  }

  const resp = await fetch(
    `${STORAGE_SERVER_URL}/archivo/${encodeURIComponent(carpeta)}/${encodeURIComponent(archivo)}`,
    { headers: { 'x-api-key': STORAGE_API_KEY } }
  );

  if (resp.status === 404) {
    const err = new Error('Archivo no encontrado en el servidor local');
    err.status = 404;
    throw err;
  }
  if (!resp.ok) {
    const err = new Error(`Error obteniendo archivo del servidor local (HTTP ${resp.status})`);
    err.status = resp.status;
    throw err;
  }

  const arrayBuffer = await resp.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    contentType: resp.headers.get('content-type') || 'application/octet-stream',
  };
}

/**
 * Construye la ruta interna (no la URL pública) que se guarda en la base de
 * datos para referenciar un archivo: "<carpeta>/<archivo>".
 * Las rutas que sirven el archivo (proxy autenticado) parsean este valor.
 */
function rutaInterna(carpeta, archivo) {
  return `${carpeta}/${archivo}`;
}

module.exports = { subirArchivo, obtenerArchivo, rutaInterna, configurado };
