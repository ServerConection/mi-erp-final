// calls-service — softphone WhatsApp Business Calling API para asesores NOVONET / VELSA
const path = require('path');
const express = require('express');
const { migrate } = require('./db');
const { requireEnv } = require('./security');
const { authenticate } = require('./auth');
const hub = require('./hub');

requireEnv('JWT_SECRET', 8);       // el mismo del ERP (erp-shared)
requireEnv('CALLS_ENCRYPTION_KEY'); // propia de este servicio: cifra los tokens de Meta

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

// Solo el ERP puede embeber este módulo en un iframe (ERP_ORIGINS separado por comas)
const frameOrigins = (process.env.ERP_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', `frame-ancestors 'self' ${frameOrigins.join(' ')}`.trim());
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
});
app.use(express.json({ limit: '1mb', verify: (req, res, buf) => { req.rawBody = buf; } }));

app.get('/health', (req, res) => res.json({ ok: true }));
app.use('/webhook', require('./routes/webhook.routes'));
app.use('/api', require('./routes/auth.routes'));
app.get('/api/stream', authenticate, (req, res) => hub.subscribe(req, res, req.agent));
app.use('/api/config', authenticate, require('./routes/config.routes'));
app.use('/api/calls', authenticate, require('./routes/calls.routes').router);
app.use('/api/analytics', authenticate, require('./routes/analytics.routes'));

app.use(express.static(path.join(__dirname, '..', 'public')));

// Errores: mensaje claro al front, detalle en logs
app.use((err, req, res, next) => {
  console.error(`[${req.method} ${req.path}]`, err.message, err.meta ? JSON.stringify(err.meta) : '');
  res.status(err.publicMsg ? 400 : err.status && err.status < 600 ? err.status : 500)
    .json({ error: err.publicMsg || err.message || 'Error interno', meta: err.meta?.code ? { code: err.meta.code } : undefined });
});

const PORT = process.env.PORT || 3090;
migrate()
  .then(() => app.listen(PORT, () => console.log(`calls-service escuchando en :${PORT}`)))
  .catch(e => { console.error('No se pudo iniciar (base de datos):', e.message); process.exit(1); });
