/**
 * PROCESO: CORE ERP  (conserva la URL actual del backend)
 *
 * Dominios transaccionales + auth + funciones compartidas por ambas marcas.
 * IMPORTANTE: mantiene /api/consultor y /api/consultor-velsa porque son APIs
 * EXTERNAS con URL pública fija (no se mueven ni se proxean).
 */
require('dotenv').config();
const path = require('path');
const { buildBaseApp, finalize, express } = require('../shared/createApp');
const startHttp = require('../shared/startHttp');

const app = buildBaseApp({ serviceName: 'core' });

// ── Auth / usuarios ──────────────────────────────────────────
app.use('/api/auth',      require('../routes/auth.routes'));
app.use('/api/otp',       require('../routes/login.otp.routes'));
app.use('/api/otp',       require('../routes/verify.otp.routes'));
app.use('/api/usuarios',  require('../routes/usuarios.routes'));
app.use('/api/auth',      require('../routes/password.routes'));
app.use('/api/auth',      require('../routes/forgotPassword.routes'));
app.use('/api',           require('../routes/test.email.routes'));

// ── Dominios transaccionales / compartidos ───────────────────
app.use('/api/ventas',            require('../routes/ventas.routes'));
app.use('/api/analista',          require('../routes/analista.routes'));
app.use('/api/bitrix',            require('../routes/bitrix.routes'));
app.use('/api/bitrix-sesiones',   require('../routes/bitrixSesiones.routes'));
app.use('/api/inventario',        require('../routes/inventario.routes'));
app.use('/api/envios-ventas',     require('../routes/envios-ventas.routes'));
app.use('/api/planes-catalogo',   require('../routes/planes-catalogo.routes'));
app.use('/api/backoffice',        require('../routes/backoffice.routes'));
app.use('/api/backoffice-jotform',require('../routes/backofficeJotform.routes'));
app.use('/api/reporte-jefatura',  require('../routes/reporteJefatura.routes'));
app.use('/api/reporte-detalle',   require('../routes/reporteDetalle.routes'));
app.use('/api/bot-auditor',       require('../routes/botAuditor.routes'));
app.use('/api/tthh',              require('../routes/tthh.routes'));
app.use('/api/tareas',            require('../routes/tareas.routes'));
app.use('/api/hojas',             require('../routes/hojas.routes'));
app.use('/api/chat',              require('../routes/chat.routes'));
app.use('/api/evaluaciones',      require('../routes/evaluaciones.routes'));
app.use('/api/asistente',         require('../routes/asistente.routes'));
app.use('/api/alertas',           require('../routes/alertas.routes'));
app.use('/api/mundialito',        require('../routes/mundialito.routes'));
app.use('/api/polla',             require('../routes/pollaMundialista.routes'));

// ── APIs EXTERNAS — NO MOVER (URL pública fija) ──────────────
app.use('/api/consultor',         require('../routes/consultor.routes'));
app.use('/api/consultor-velsa',   require('../routes/consultorVelsa.routes'));

// ── Uploads (PII bloqueada; el resto servido con cache) ──────
app.use('/uploads/envios_ventas',   (req, res) => res.status(404).json({ success: false, error: 'No encontrado' }));
app.use('/uploads/tthh_documentos', (req, res) => res.status(404).json({ success: false, error: 'No encontrado' }));
const uploadsPath = path.resolve(__dirname, '..', '..', 'uploads');
app.use('/uploads', express.static(uploadsPath, { maxAge: '7d', etag: true, lastModified: true, fallthrough: true }));

finalize(app);

// withSocket: mundialito y alertas usan getIO() para marcadores/alertas en vivo.
startHttp(app, { serviceName: 'core', withSocket: true });
