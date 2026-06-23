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
// ============================================================

require('dotenv').config();
const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');

const app = express();
const PORT       = process.env.PORT || 4500;
const API_KEY    = process.env.API_KEY;
const STORAGE_DIR = path.resolve(process.cwd(), process.env.STORAGE_DIR || './storage');

if (!API_KEY || API_KEY.includes('CAMBIA_ESTO')) {
  console.error('[FATAL] Debes configurar una API_KEY real en el archivo .env antes de iniciar este servicio.');
  process.exit(1);
}

fs.mkdirSync(STORAGE_DIR, { recursive: true });

// ─── Auth simple por clave compartida ─────────────────────────────────────────
const verificarApiKey = (req, res, next) => {
  const key = req.headers['x-api-key'];
  if (!key || key !== API_KEY) {
    return res.status(401).json({ success: false, error: 'API key inválida o faltante' });
  }
  next();
};

// ─── Sanitización de nombres (evita path traversal: ../, /, \, null bytes) ───
const SEGMENTO_VALIDO = /^[a-zA-Z0-9._-]+$/;
const esSegmentoValido = (s) => typeof s === 'string' && s.length > 0 && s.length <= 200 && SEGMENTO_VALIDO.test(s);

// ─── Multer en memoria; se escribe a disco manualmente tras validar carpeta ──
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf'
      || file.mimetype.includes('word') || file.mimetype.includes('sheet')) cb(null, true);
    else cb(new Error('Formato no permitido. Usa imagen, PDF, Word o Excel.'));
  }
});

app.get('/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

// ─── POST /upload ─────────────────────────────────────────────────────────────
// form-data: archivo=<file>, carpeta=<cedula|codigo_asesor|"generales">
app.post('/upload', verificarApiKey, upload.single('archivo'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'No se recibió ningún archivo' });

    const carpeta = (req.body.carpeta || 'sin_clasificar').toString().trim();
    if (!esSegmentoValido(carpeta)) {
      return res.status(400).json({ success: false, error: 'Nombre de carpeta inválido' });
    }

    const dir = path.join(STORAGE_DIR, carpeta);
    fs.mkdirSync(dir, { recursive: true });

    const ext      = path.extname(req.file.originalname) || '';
    const filename = `${Date.now()}_${Math.round(Math.random() * 1e6)}${ext}`;
    fs.writeFileSync(path.join(dir, filename), req.file.buffer);

    console.log(`[STORAGE] Archivo guardado: ${carpeta}/${filename} (${req.file.size} bytes)`);
    res.json({ success: true, carpeta, archivo: filename, nombreOriginal: req.file.originalname });
  } catch (e) {
    console.error('[STORAGE] upload:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ─── GET /archivo/:carpeta/:archivo ───────────────────────────────────────────
app.get('/archivo/:carpeta/:archivo', verificarApiKey, (req, res) => {
  const { carpeta, archivo } = req.params;
  if (!esSegmentoValido(carpeta) || !esSegmentoValido(archivo)) {
    return res.status(400).json({ success: false, error: 'Parámetros inválidos' });
  }

  const filePath = path.join(STORAGE_DIR, carpeta, archivo);
  // Verificación adicional: el path resuelto debe seguir dentro de STORAGE_DIR
  if (!filePath.startsWith(STORAGE_DIR)) {
    return res.status(400).json({ success: false, error: 'Ruta inválida' });
  }
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, error: 'Archivo no encontrado' });
  }

  res.sendFile(filePath);
});

app.use((err, req, res, next) => {
  console.error('[STORAGE] Error:', err.message);
  res.status(500).json({ success: false, error: err.message });
});

app.listen(PORT, () => {
  console.log(`[STORAGE] Servicio de almacenamiento local escuchando en http://localhost:${PORT}`);
  console.log(`[STORAGE] Carpeta de almacenamiento: ${STORAGE_DIR}`);
});
