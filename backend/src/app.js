require('dotenv').config();
const express = require('express');
const path    = require('path');
const cors = require('cors');

const authRoutes                   = require('./routes/auth.routes');
const redesRoutes                  = require('./routes/redes.routes');
const usuariosRoutes               = require('./routes/usuarios.routes');
const loginOtpRoutes               = require('./routes/login.otp.routes');
const passwordRoutes               = require('./routes/password.routes');
const forgotRoutes                 = require('./routes/forgotPassword.routes');
const testEmailRoutes              = require('./routes/test.email.routes');
const verifyOtpRoutes              = require('./routes/verify.otp.routes');
const indicadoresRoutes            = require('./routes/indicadores.routes');
const indicadoresVelsaRoutes       = require('./routes/indicadoresVelsa.routes');
const comparativaIndicadoresRoutes = require('./routes/comparativaIndicadores.routes');
const alertasRoutes                = require('./routes/alertas.routes');
const broadcastRoutes              = require('./routes/broadcast.routes');
const ventasRoutes                 = require('./routes/ventas.routes');
const analistaRoutes               = require('./routes/analista.routes');
const bitrixRoutes                 = require('./routes/bitrix.routes');
const coverageRoutes               = require('./routes/coverage.routes');
const inventarioRoutes             = require('./routes/inventario.routes');
const forecastRoutes               = require('./routes/forecast.routes');
const enviosVentasRoutes           = require('./routes/envios-ventas.routes');
const backofficeRoutes             = require('./routes/backoffice.routes');
const mundialitoRoutes             = require('./routes/mundialito.routes');
const reporteJefaturaRoutes        = require('./routes/reporteJefatura.routes');
const consultorRoutes              = require('./routes/consultor.routes');
const whatsappRoutes               = require('./routes/whatsapp.routes');
const asistenteRoutes              = require('./routes/asistente.routes');
const reporteDetalleRoutes         = require('./routes/reporteDetalle.routes');

const app = express();

// SEGURIDAD: CORS CONFIGURADO
const defaultOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://erp-frontend-v1.onrender.com'
];

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : defaultOrigins;

const corsOptions = {
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400
};

app.options('/{*path}', cors(corsOptions));
app.use(cors(corsOptions));

// SEGURIDAD: Headers de seguridad nativos (sin dependencia helmet)
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

// SEGURIDAD: Rate limiting global (umbral alto, no afecta uso normal de dashboards)
const rateLimit = require('./middleware/rateLimit');
app.use(rateLimit);

app.use(express.json({ limit: '10mb' }));

app.get('/health', (req, res) => {
  res.json({ ok: true, ts: Date.now(), uptime: process.uptime() });
});

app.use('/api/auth',         authRoutes);
app.use('/api/otp',          loginOtpRoutes);
app.use('/api/otp',          verifyOtpRoutes);
app.use('/api/usuarios',     usuariosRoutes);
app.use('/api/auth',         passwordRoutes);
app.use('/api/auth',         forgotRoutes);
app.use('/api',              testEmailRoutes);
app.use('/api/indicadores',             indicadoresRoutes);
app.use('/api/indicadores-velsa',       indicadoresVelsaRoutes);
app.use('/api/comparativa-indicadores', comparativaIndicadoresRoutes);
app.use('/api/redes',             redesRoutes);
app.use('/api/alertas',           alertasRoutes);
app.use('/api/ventas',            ventasRoutes);
app.use('/api/analista',          analistaRoutes);
app.use('/api/bitrix',            bitrixRoutes);
app.use('/api/coverage',          coverageRoutes);
app.use('/api/inventario',        inventarioRoutes);
app.use('/api/forecast',          forecastRoutes);
app.use('/api/envios-ventas',     enviosVentasRoutes);
app.use('/api/backoffice',        backofficeRoutes);
app.use('/api/mundialito',        mundialitoRoutes);
app.use('/api/reporte-jefatura',  reporteJefaturaRoutes);
app.use('/api/consultor',         consultorRoutes);

// Broadcast TV - servir uploads con cache HTTP
const uploadsPath = path.resolve(__dirname, '..', 'uploads');
app.use('/uploads', express.static(uploadsPath, {
  maxAge: '7d',
  etag: true,
  lastModified: true,
  fallthrough: true,
}));
app.use('/api/broadcast',         broadcastRoutes);

// ── Módulo WhatsApp ───────────────────────────────────────────
// WA_UPLOADS_DIR: en Render apunta al disco persistente (/var/data/wa_uploads)
const waUploadsPath = process.env.WA_UPLOADS_DIR || path.resolve(__dirname, '..', 'wa_uploads');
app.use('/wa-uploads', express.static(waUploadsPath, { maxAge: '7d' }));
app.use('/api/wa', whatsappRoutes);
app.use('/api/asistente', asistenteRoutes);
app.use('/api/reporte-detalle', reporteDetalleRoutes);

// Handler 404
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Endpoint no encontrado' });
});

// Handler global de errores
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
      : (err.message || 'Error interno')
  });
});

module.exports = app;
