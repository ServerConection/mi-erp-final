// local-storage-server/server.js
// ============================================================
// Servicio receptor de archivos para correr en EL SERVIDOR LOCAL del cliente
// (no en Render). El backend principal (en la nube) sube y lee archivos aquí
// a través de una clave de API compartida — nunca se expone directo al
// navegador del usuario final ni a internet sin autenticación.
//
// Endpoints:
//   GET  /health                          — chequeo de vida (sin auth)
//   POST /upload                          — sube un archivo (requiere x-api-key)
//   GET  /archivo/:carpeta/:archivo       — descarga un archivo (requiere x-api-key)
//
// Organización en disco: <STORAGE_DIR>/<carpeta>/<archivo>
//   - "carpeta" = cédula del cliente (ventas) o código de asesor / "generales" (TTHH)
//
// ── ENDURECIMIENTO DE ESTA REVISIÓN ─────────────────────────────────────────
// Este proceso custodia cédulas y datos personales de clientes reales. Cambios:
//
//  1. BIND A LOOPBACK POR DEFECTO. Antes escuchaba en 0.0.0.0: cualquier equipo
//     de la red local (y cualquier cosa que atravesara el router) podía golpear
//     el puerto 4500 a fuerza bruta contra la API key. Ahora escucha en
//     127.0.0.1 salvo que se fije HOST explícitamente. El túnel corre en la
//     misma máquina, así que sigue funcionando igual.
//  2. COMPARACIÓN DE API KEY EN TIEMPO CONSTANTE. `key !== API_KEY` filtra
//     información por tiempo de respuesta (CWE-208). Ahora usa timingSafeEqual.
//  3. VALIDACIÓN POR FIRMA BINARIA. El `mimetype` lo declara quien sube; se
//     falsifica trivialmente. Se valida el contenido real y la extensión que se
//     escribe a disco se DERIVA de la firma, nunca del nombre recibido: ya no es
//     posible dejar un .html/.svg/.php en una carpeta del servidor de archivos.
//  4. CONTENCIÓN DE RUTA CORRECTA. `filePath.startsWith(STORAGE_DIR)` es un
//     chequeo con fallo conocido (`/almacen` también hace prefijo de
//     `/almacen_publico`). Se usa path.relative, y se rechazan symlinks que
//     apunten fuera del almacén.
//  5. RESPUESTAS QUE NO FILTRAN. El manejador de errores devolvía `err.message`,
//     que incluye rutas absolutas del disco del cliente. Ahora responde genérico
//     y deja el detalle solo en el log local.
//  6. CABECERAS DE SEGURIDAD + rate limit + apagado ordenado.
// ============================================================

'use strict';

require('dotenv').config();
const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const crypto  = require('crypto');

const { validarArchivo, mimeSeguroPorExtension } = require('./fileSignature');

const app = express();
const PORT        = Number(process.env.PORT || 4500);
const HOST        = process.env.HOST || '127.0.0.1'; // loopback por defecto
const API_KEY     = process.env.API_KEY;
const STORAGE_DIR = path.resolve(process.cwd(), process.env.STORAGE_DIR || './storage');
const PDF_ESTRICTO = process.env.PDF_ESTRICTO !== '0';

// ─── Verificaciones de arranque: mejor no arrancar que arrancar inseguro ─────
if (!API_KEY || API_KEY.includes('CAMBIA_ESTO')) {
  console.error('[FATAL] Debes configurar una API_KEY real en el archivo .env antes de iniciar este servicio.');
  process.exit(1);
}
if (API_KEY.length < 24) {
  console.error('[FATAL] La API_KEY es demasiado corta (<24 caracteres). Genera una con:');
  console.error('        node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
  process.exit(1);
}
if (HOST === '0.0.0.0' && process.env.PERMITIR_BIND_PUBLICO !== '1') {
  console.error('[FATAL] HOST=0.0.0.0 expone este servicio a toda la red local.');
  console.error('        Si de verdad lo necesitas, arranca con PERMITIR_BIND_PUBLICO=1.');
  process.exit(1);
}

fs.mkdirSync(STORAGE_DIR, { recursive: true });

app.disable('x-powered-by');
app.set('trust proxy', 1); // detrás del túnel (Cloudflare/ngrok)

// Cabeceras de seguridad mínimas, sin dependencias.
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('Referrer-Policy', 'no-referrer');
  res.set('Cache-Control', 'private, no-store');
  res.set('Content-Security-Policy', "default-src 'none'; sandbox");
  next();
});

// ─── Rate limit sencillo por IP (freno ante fuerza bruta sobre la API key) ───
const golpes = new Map();
const VENTANA_MS = 60_000;
const MAX_POR_VENTANA = 120;
app.use((req, res, next) => {
  if (req.path === '/health') return next();
  const ip = req.ip || 'desconocida';
  const ahora = Date.now();
  const lista = (golpes.get(ip) || []).filter((t) => t > ahora - VENTANA_MS);
  if (lista.length >= MAX_POR_VENTANA) {
    res.set('Retry-After', '60');
    return res.status(429).json({ success: false, error: 'Demasiadas peticiones' });
  }
  lista.push(ahora);
  golpes.set(ip, lista);
  if (golpes.size > 5000) golpes.clear();
  next();
});

// ─── Auth por clave compartida, en tiempo constante ──────────────────────────
const API_KEY_BUF = Buffer.from(API_KEY, 'utf8');

function clavesIguales(recibida) {
  if (typeof recibida !== 'string' || recibida.length === 0) return false;
  const buf = Buffer.from(recibida, 'utf8');
  // timingSafeEqual exige la misma longitud: se comparan digests para no
  // filtrar la longitud de la clave real.
  const a = crypto.createHash('sha256').update(buf).digest();
  const b = crypto.createHash('sha256').update(API_KEY_BUF).digest();
  return crypto.timingSafeEqual(a, b);
}

const verificarApiKey = (req, res, next) => {
  if (!clavesIguales(req.headers['x-api-key'])) {
    console.warn(`[STORAGE] API key inválida desde ${req.ip} en ${req.method} ${req.path}`);
    return res.status(401).json({ success: false, error: 'API key inválida o faltante' });
  }
  next();
};

// ─── Sanitización de nombres (evita path traversal: ../, /, \, null bytes) ───
const SEGMENTO_VALIDO = /^[a-zA-Z0-9._-]+$/;
const esSegmentoValido = (s) =>
  typeof s === 'string' && s.length > 0 && s.length <= 200 &&
  SEGMENTO_VALIDO.test(s) && s !== '.' && s !== '..' && !s.includes('\0');

/**
 * Comprueba que una ruta resuelta siga DENTRO del almacén.
 * path.relative es la forma correcta: startsWith se equivoca con directorios
 * hermanos que comparten prefijo ("/almacen" vs "/almacen_publico").
 */
function dentroDelAlmacen(rutaAbsoluta) {
  const rel = path.relative(STORAGE_DIR, rutaAbsoluta);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

// ─── Multer en memoria; se escribe a disco manualmente tras validar ──────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 1, fields: 10, parts: 15 },
  fileFilter: (req, file, cb) => {
    // Primer filtro barato. La defensa real es la firma binaria, más abajo.
    if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf'
      || file.mimetype === 'application/octet-stream') cb(null, true);
    else cb(new Error('FORMATO_NO_PERMITIDO'));
  }
});

app.get('/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

// ─── POST /upload ─────────────────────────────────────────────────────────────
// form-data: archivo=<file>, carpeta=<cedula|codigo_asesor|"generales">
app.post('/upload', verificarApiKey, (req, res, next) => {
  upload.single('archivo')(req, res, (err) => {
    if (!err) return next();
    const mensaje = err.code === 'LIMIT_FILE_SIZE'
      ? 'El archivo supera el máximo de 20 MB'
      : 'Formato no permitido. Usa imagen o PDF.';
    console.warn('[STORAGE] upload rechazado en multer:', err.code || err.message);
    return res.status(400).json({ success: false, error: mensaje });
  });
}, (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'No se recibió ningún archivo' });

    const carpeta = (req.body.carpeta || 'sin_clasificar').toString().trim();
    if (!esSegmentoValido(carpeta)) {
      return res.status(400).json({ success: false, error: 'Nombre de carpeta inválido' });
    }

    // Validación de contenido real (defensa en profundidad: el backend ya validó,
    // pero este servicio no debe confiar en que su único cliente sea el backend).
    const veredicto = validarArchivo({
      buffer: req.file.buffer,
      mimetypeDeclarado: req.file.mimetype,
      pdfEstricto: PDF_ESTRICTO,
    });
    if (!veredicto.ok) {
      console.warn('[STORAGE] contenido rechazado:', veredicto.codigo);
      return res.status(415).json({ success: false, error: veredicto.motivo });
    }

    const dir = path.join(STORAGE_DIR, carpeta);
    if (!dentroDelAlmacen(dir)) {
      return res.status(400).json({ success: false, error: 'Ruta inválida' });
    }
    fs.mkdirSync(dir, { recursive: true });

    // Nombre 100 % generado por el servidor. La extensión sale de la firma
    // binaria, NO del nombre que envió el cliente.
    const filename = `${Date.now()}_${crypto.randomBytes(8).toString('hex')}${veredicto.ext}`;
    const destino  = path.join(dir, filename);
    if (!dentroDelAlmacen(destino)) {
      return res.status(400).json({ success: false, error: 'Ruta inválida' });
    }

    // wx: falla si el archivo ya existe, en vez de sobrescribir en silencio.
    // 0o600: solo el usuario que corre el servicio puede leerlo.
    fs.writeFileSync(destino, req.file.buffer, { flag: 'wx', mode: 0o600 });

    console.log(`[STORAGE] Archivo guardado: ${carpeta}/${filename} (${req.file.size} bytes, ${veredicto.tipo})`);
    res.json({
      success: true,
      carpeta,
      archivo: filename,
      nombreOriginal: path.basename(String(req.file.originalname || '')).slice(0, 120),
    });
  } catch (e) {
    console.error('[STORAGE] upload:', e.message);
    res.status(500).json({ success: false, error: 'No se pudo guardar el archivo' });
  }
});

// ─── GET /archivo/:carpeta/:archivo ───────────────────────────────────────────
app.get('/archivo/:carpeta/:archivo', verificarApiKey, (req, res) => {
  const { carpeta, archivo } = req.params;
  if (!esSegmentoValido(carpeta) || !esSegmentoValido(archivo)) {
    return res.status(400).json({ success: false, error: 'Parámetros inválidos' });
  }

  const filePath = path.join(STORAGE_DIR, carpeta, archivo);
  if (!dentroDelAlmacen(filePath)) {
    return res.status(400).json({ success: false, error: 'Ruta inválida' });
  }

  let st;
  try {
    // lstat (no stat): si es un symlink, no lo seguimos a ciegas.
    st = fs.lstatSync(filePath);
  } catch {
    return res.status(404).json({ success: false, error: 'Archivo no encontrado' });
  }
  if (!st.isFile()) {
    return res.status(404).json({ success: false, error: 'Archivo no encontrado' });
  }

  const ext  = path.extname(filePath).toLowerCase();
  const mime = mimeSeguroPorExtension(ext) || 'application/octet-stream';

  res.set('Content-Type', mime);
  res.set('Content-Length', String(st.size));
  res.set('Content-Disposition', `attachment; filename="documento${ext || '.bin'}"`);
  fs.createReadStream(filePath)
    .on('error', () => {
      if (!res.headersSent) res.status(500).json({ success: false, error: 'No se pudo leer el archivo' });
    })
    .pipe(res);
});

// 404 explícito para cualquier otra ruta
app.use((req, res) => res.status(404).json({ success: false, error: 'Endpoint no encontrado' }));

// Manejador final: registra el detalle en local, responde genérico al cliente.
app.use((err, req, res, next) => {
  console.error('[STORAGE] Error no controlado:', err.stack || err.message);
  if (res.headersSent) return next(err);
  res.status(500).json({ success: false, error: 'Error interno del servicio de almacenamiento' });
});

const server = app.listen(PORT, HOST, () => {
  console.log(`[STORAGE] Servicio de almacenamiento escuchando en http://${HOST}:${PORT}`);
  console.log(`[STORAGE] Carpeta de almacenamiento: ${STORAGE_DIR}`);
  if (HOST === '127.0.0.1') {
    console.log('[STORAGE] Bind a loopback: solo accesible desde este equipo (y desde el túnel local). ✅');
  }
});

// Apagado ordenado: no cortar una subida a la mitad.
for (const señal of ['SIGINT', 'SIGTERM']) {
  process.on(señal, () => {
    console.log(`[STORAGE] ${señal} recibida, cerrando…`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}
