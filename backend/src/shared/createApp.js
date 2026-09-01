/**
 * createApp — fábrica de aplicaciones Express compartida por TODOS los procesos.
 *
 * Replica exactamente los middlewares del monolito (app.js): CORS, cabeceras de
 * seguridad, trust proxy, rate limit, parser JSON, /health y el manejador de
 * errores global. Cada proceso (core, analitica-velsa, analitica-novo, wabot,
 * ingesta) construye su app con estos middlewares y monta SOLO sus rutas.
 *
 * Objetivo: separar procesos sin duplicar ni tocar la lógica de negocio.
 */
require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const rateLimit = require('../middleware/rateLimit');

const DEFAULT_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://erp-frontend-v1.onrender.com',
];

function buildBaseApp({ serviceName = 'service' } = {}) {
  const app = express();

  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : DEFAULT_ORIGINS;

  const corsOptions = {
    origin: allowedOrigins,
    credentials: true,
    // Varias APIs, incluido el cambio de estado de tareas, usan PATCH.
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    // Cache-Control y Pragma: los manda el botón "Forzar Refresh" de Indicadores.
    // Sin ellos el preflight falla con "Request header field cache-control is not allowed".
    allowedHeaders: ['Content-Type', 'Authorization', 'Cache-Control', 'Pragma'],
    maxAge: 86400,
  };

  app.options('/{*path}', cors(corsOptions));
  app.use(cors(corsOptions));

  // Cabeceras de seguridad (idénticas al monolito)
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'interest-cohort=()');
    if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });

  app.set('trust proxy', 1);
  app.use(rateLimit);
  app.use(express.json({ limit: '10mb' }));

  app.get('/health', (req, res) => {
    res.json({ ok: true, service: serviceName, ts: Date.now(), uptime: process.uptime() });
  });

  return app;
}

// Cierra la app con el 404 y el manejador de errores global (igual que app.js).
function finalize(app) {
  app.use((req, res) => {
    res.status(404).json({ success: false, error: 'Endpoint no encontrado' });
  });

  app.use((err, req, res, next) => {
    console.error('[GlobalError]', err.stack || err);
    if (err && err.message && err.message.includes('CORS')) {
      return res.status(403).json({ success: false, error: 'Origen no permitido' });
    }
    if (err && err.type === 'entity.parse.failed') {
      return res.status(400).json({ success: false, error: 'JSON invalido en el body' });
    }
    if (err && err.type === 'entity.too.large') {
      return res.status(413).json({ success: false, error: 'Payload demasiado grande' });
    }
    res.status(err.status || 500).json({
      success: false,
      error: process.env.NODE_ENV === 'production'
        ? 'Error interno del servidor'
        : (err.message || 'Error interno'),
    });
  });
}

module.exports = { buildBaseApp, finalize, express };
