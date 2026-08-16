// src/utils/storageClient.js
// ============================================================
// Cliente HTTP hacia el servicio de almacenamiento local
// (local-storage-server, expuesto vía Cloudflare Tunnel / ngrok).
//
// El backend principal es el ÚNICO que habla con este servicio —
// nunca se expone la URL ni la API key al navegador.
//
// Variables de entorno requeridas (Render):
//   STORAGE_SERVER_URL  — ej: https://storage.tudominio.com
//   STORAGE_API_KEY     — misma clave configurada en local-storage-server/.env
// Opcionales:
//   STORAGE_TIMEOUT_MS  — timeout por intento (default 20000)
//   STORAGE_REINTENTOS  — reintentos ante fallo de RED (default 2)
//   STORAGE_PERMITIR_HTTP — "1" para permitir http:// no-local (NO recomendado)
//
// ── CAMBIOS DE ESTA REVISIÓN ────────────────────────────────────────────────
// 1) DIAGNÓSTICO: `fetch()` de Node (undici) lanza siempre el mismo mensaje
//    genérico "fetch failed" y esconde la causa real en `error.cause`. Antes ese
//    mensaje viajaba tal cual hasta el navegador, así que el usuario veía
//    "fetch failed" y no había forma de saber si era DNS, túnel caído o TLS.
//    Ahora se registra la causa completa en el log del servidor y se devuelve un
//    error CLASIFICADO y accionable.
// 2) TIMEOUT: sin AbortSignal, una petición al túnel podía quedarse colgada
//    hasta el timeout de la plataforma. Ahora corta a los 20 s.
// 3) REINTENTOS: solo ante fallos de red/5xx, con backoff. Nunca ante 4xx
//    (un 401 por API key mala no mejora reintentando).
// 4) SEGURIDAD:
//    - Se exige https:// salvo que el destino sea localhost. La API key viaja en
//      un header; sobre http:// plano es interceptable en la red del cliente.
//    - Los errores que se devuelven a la capa HTTP NUNCA incluyen la URL del
//      túnel ni la API key. Se separan `message` (interno) y `publico`.
//    - La API key se redacta de cualquier objeto que se loguee.
// ============================================================

'use strict';

const STORAGE_SERVER_URL = (process.env.STORAGE_SERVER_URL || '').replace(/\/+$/, '');
const STORAGE_API_KEY    = process.env.STORAGE_API_KEY || '';
const TIMEOUT_MS         = Number(process.env.STORAGE_TIMEOUT_MS || 20_000);
const REINTENTOS         = Number(process.env.STORAGE_REINTENTOS || 2);
const PERMITIR_HTTP      = process.env.STORAGE_PERMITIR_HTTP === '1';

const configurado = () => Boolean(STORAGE_SERVER_URL && STORAGE_API_KEY);

// ─── Validación del destino (se ejecuta una vez, al cargar el módulo) ────────
let avisoConfig = null;
(function validarConfiguracion() {
  if (!configurado()) {
    avisoConfig = 'STORAGE_SERVER_URL / STORAGE_API_KEY no están definidas.';
    console.warn('[STORAGE] ⚠️  ' + avisoConfig + ' Las subidas de documentos responderán 503.');
    return;
  }
  let u;
  try {
    u = new URL(STORAGE_SERVER_URL);
  } catch {
    avisoConfig = 'STORAGE_SERVER_URL no es una URL válida.';
    console.error('[STORAGE] ❌ ' + avisoConfig);
    return;
  }
  const esLocal = ['localhost', '127.0.0.1', '::1'].includes(u.hostname);
  if (u.protocol !== 'https:' && !esLocal && !PERMITIR_HTTP) {
    avisoConfig = 'STORAGE_SERVER_URL usa http:// hacia un host remoto. La API key viajaría en claro.';
    console.error('[STORAGE] ❌ ' + avisoConfig + ' Usa https:// (o STORAGE_PERMITIR_HTTP=1 bajo tu responsabilidad).');
    return;
  }
  if (STORAGE_API_KEY.length < 24) {
    console.warn('[STORAGE] ⚠️  STORAGE_API_KEY es corta (<24 caracteres). Usa una clave aleatoria larga.');
  }
  console.log(`[STORAGE] Destino configurado: ${u.protocol}//${u.host} (timeout ${TIMEOUT_MS}ms, ${REINTENTOS} reintentos)`);
})();

/** Quita la API key de cualquier texto antes de loguearlo. */
function redactar(texto) {
  if (!texto || !STORAGE_API_KEY) return texto;
  return String(texto).split(STORAGE_API_KEY).join('«API_KEY»');
}

/**
 * Traduce un fallo de red de undici a un error accionable.
 * `err.cause.code` es donde vive la verdad: ENOTFOUND, ECONNREFUSED, etc.
 */
function clasificarFalloDeRed(err) {
  const causa  = err?.cause || {};
  const codigo = causa.code || err?.code || 'DESCONOCIDO';

  const mapa = {
    ENOTFOUND:  'El dominio del servidor de almacenamiento no resuelve (DNS). Revisa STORAGE_SERVER_URL o si el túnel cambió de dominio.',
    EAI_AGAIN:  'Fallo temporal de DNS al resolver el servidor de almacenamiento.',
    ECONNREFUSED: 'El servidor de almacenamiento rechazó la conexión: el servicio local no está levantado en ese puerto.',
    ECONNRESET: 'La conexión con el servidor de almacenamiento se cortó a mitad de la transferencia.',
    ETIMEDOUT:  'El servidor de almacenamiento no respondió a tiempo. Probablemente el equipo local o el túnel están apagados.',
    UND_ERR_CONNECT_TIMEOUT: 'Timeout al conectar con el servidor de almacenamiento (túnel caído o equipo apagado).',
    UND_ERR_HEADERS_TIMEOUT: 'El servidor de almacenamiento aceptó la conexión pero no envió respuesta a tiempo.',
    CERT_HAS_EXPIRED: 'El certificado TLS del servidor de almacenamiento está vencido.',
    UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'No se pudo verificar el certificado TLS del servidor de almacenamiento.',
    DEPTH_ZERO_SELF_SIGNED_CERT: 'El servidor de almacenamiento usa un certificado autofirmado.',
  };

  const e = new Error(mapa[codigo] || `Fallo de red hablando con el servidor de almacenamiento (${codigo}).`);
  e.codigo   = 'STORAGE_INALCANZABLE';
  e.causaRed = codigo;
  e.status   = 503;                 // 503: dependencia no disponible, no es culpa del cliente
  e.publico  = 'El servidor de almacenamiento de documentos no está disponible en este momento. Avisa a soporte: el equipo local o su túnel están caídos.';
  return e;
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * fetch con timeout, reintentos ante fallo de red y errores clasificados.
 * Devuelve la Response; lanza Error enriquecido si no se pudo completar.
 */
async function pedir(ruta, opciones = {}, { reintentable = true } = {}) {
  const url = `${STORAGE_SERVER_URL}${ruta}`;
  let ultimoError;

  const intentos = reintentable ? REINTENTOS + 1 : 1;

  for (let intento = 1; intento <= intentos; intento++) {
    const ac = new AbortController();
    const t  = setTimeout(() => ac.abort(new Error('timeout local')), TIMEOUT_MS);
    try {
      const resp = await fetch(url, { ...opciones, signal: ac.signal, redirect: 'error' });
      clearTimeout(t);
      return resp;
    } catch (err) {
      clearTimeout(t);
      ultimoError = err;

      const clasificado = clasificarFalloDeRed(err);
      console.error(
        `[STORAGE] intento ${intento}/${intentos} falló en ${redactar(ruta)} → ` +
        `${clasificado.causaRed}: ${clasificado.message}`,
        { cause: redactar(err?.cause?.message || err?.message) }
      );

      if (intento < intentos) {
        await dormir(400 * intento); // backoff lineal corto
        continue;
      }
      throw clasificado;
    }
  }
  throw clasificarFalloDeRed(ultimoError);
}

/**
 * Sube un archivo (buffer en memoria, viene de multer memoryStorage) al
 * servidor de almacenamiento local, dentro de la carpeta indicada.
 *
 * @param {Object} opts
 * @param {Buffer} opts.buffer         - contenido del archivo (ya validado por firma)
 * @param {string} opts.originalname   - nombre original, SOLO informativo
 * @param {string} opts.mimetype       - mimetype REAL (detectado por firma, no el del cliente)
 * @param {string} opts.carpeta        - cédula del cliente / código de asesor / "generales"
 * @param {string} [opts.extension]    - extensión canónica derivada de la firma (ej. ".jpg")
 * @returns {Promise<{carpeta:string, archivo:string, nombreOriginal:string}>}
 */
async function subirArchivo({ buffer, originalname, mimetype, carpeta, extension }) {
  if (!configurado()) {
    const e = new Error(avisoConfig || 'STORAGE_SERVER_URL / STORAGE_API_KEY no están configurados en el backend');
    e.codigo  = 'STORAGE_NO_CONFIGURADO';
    e.status  = 503;
    e.publico = 'El almacenamiento de documentos no está configurado. Contacta al administrador.';
    throw e;
  }

  // El nombre que se envía al servicio de almacenamiento se normaliza aquí:
  // nunca se propaga el nombre crudo del cliente (puede traer rutas, null bytes
  // o dobles extensiones).
  const ext = (extension || '').toLowerCase();
  const nombreSeguro = `documento${ext}`;

  const fd = new FormData();
  fd.append('archivo', new Blob([buffer], { type: mimetype }), nombreSeguro);
  fd.append('carpeta', carpeta);

  const resp = await pedir('/upload', {
    method: 'POST',
    headers: { 'x-api-key': STORAGE_API_KEY },
    body: fd,
  });

  const data = await resp.json().catch(() => ({}));

  if (!resp.ok || !data.success) {
    const e = new Error(
      `El servidor de almacenamiento respondió HTTP ${resp.status}` +
      (data.error ? `: ${data.error}` : '')
    );
    e.codigo = resp.status === 401 ? 'STORAGE_API_KEY_INVALIDA' : 'STORAGE_ERROR_REMOTO';
    e.status = resp.status === 401 ? 503 : 502;
    e.publico = resp.status === 401
      ? 'El backend no está autorizado contra el servidor de almacenamiento (API key desincronizada). Avisa a soporte.'
      : 'El servidor de almacenamiento no pudo guardar el archivo. Intenta de nuevo en unos minutos.';
    throw e;
  }

  return { ...data, nombreOriginal: originalname };
}

/**
 * Descarga un archivo del servidor de almacenamiento local.
 *
 * @param {string} carpeta
 * @param {string} archivo
 * @returns {Promise<{buffer:Buffer, contentType:string}>}
 */
async function obtenerArchivo(carpeta, archivo) {
  if (!configurado()) {
    const e = new Error(avisoConfig || 'STORAGE_SERVER_URL / STORAGE_API_KEY no están configurados en el backend');
    e.codigo  = 'STORAGE_NO_CONFIGURADO';
    e.status  = 503;
    e.publico = 'El almacenamiento de documentos no está configurado. Contacta al administrador.';
    throw e;
  }

  const resp = await pedir(
    `/archivo/${encodeURIComponent(carpeta)}/${encodeURIComponent(archivo)}`,
    { headers: { 'x-api-key': STORAGE_API_KEY } }
  );

  if (resp.status === 404) {
    const err = new Error('Archivo no encontrado en el servidor local');
    err.codigo  = 'ARCHIVO_NO_ENCONTRADO';
    err.status  = 404;
    err.publico = 'El archivo ya no existe en el servidor de documentos.';
    throw err;
  }
  if (!resp.ok) {
    const err = new Error(`Error obteniendo archivo del servidor local (HTTP ${resp.status})`);
    err.codigo  = resp.status === 401 ? 'STORAGE_API_KEY_INVALIDA' : 'STORAGE_ERROR_REMOTO';
    err.status  = 502;
    err.publico = 'No se pudo recuperar el archivo del servidor de documentos.';
    throw err;
  }

  const arrayBuffer = await resp.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    contentType: resp.headers.get('content-type') || 'application/octet-stream',
  };
}

/**
 * Chequeo de vida del servidor de almacenamiento, para diagnóstico.
 * No expone la URL ni la clave: solo dice si responde y por qué no.
 * @returns {Promise<{arriba:boolean, codigo?:string, detalle?:string, ms:number}>}
 */
async function estado() {
  const t0 = Date.now();
  if (!configurado()) {
    return { arriba: false, codigo: 'STORAGE_NO_CONFIGURADO', detalle: avisoConfig, ms: 0 };
  }
  try {
    const resp = await pedir('/health', { method: 'GET' }, { reintentable: false });
    return { arriba: resp.ok, codigo: resp.ok ? 'OK' : `HTTP_${resp.status}`, ms: Date.now() - t0 };
  } catch (e) {
    return { arriba: false, codigo: e.causaRed || e.codigo || 'ERROR', detalle: e.message, ms: Date.now() - t0 };
  }
}

/**
 * Construye la ruta interna (no la URL pública) que se guarda en la base de
 * datos para referenciar un archivo: "<carpeta>/<archivo>".
 */
function rutaInterna(carpeta, archivo) {
  return `${carpeta}/${archivo}`;
}

module.exports = { subirArchivo, obtenerArchivo, rutaInterna, configurado, estado };
