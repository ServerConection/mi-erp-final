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

const app = express();

/**
 * 🔐 SEGURIDAD: CORS CONFIGURADO
 * Restringe qué dominios pueden acceder a la API
 * Solo orígenes en ALLOWED_ORIGINS pueden hacer requests
 *
 * Variables usadas: process.env.ALLOWED_ORIGINS (en .env)
 * Si no está configurado, usa localhost + producción
 */
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

// Manejo explícito de preflight (OPTIONS) para todas las rutas
app.options('*', cors(corsOptions));
app.use(cors(corsOptions));
app.use(express.json());

// Auth sin OTP (token directo)
app.use('/api/auth',         authRoutes);

// Auth con OTP
app.use('/api/otp',          loginOtpRoutes);
app.use('/api/otp',          verifyOtpRoutes);

// Gestión de usuarios (tabla: usuarios)
app.use('/api/usuarios',     usuariosRoutes);

// Password
app.use('/api/auth',         passwordRoutes);
app.use('/api/auth',         forgotRoutes);

// Test email (solo dev)
app.use('/api',              testEmailRoutes);

// Indicadores
app.use('/api/indicadores',             indicadoresRoutes);
app.use('/api/indicadores-velsa',       indicadoresVelsaRoutes);
app.use('/api/comparativa-indicadores', comparativaIndicadoresRoutes);

// Redes
app.use('/api/redes',             redesRoutes);

// Alertas y notificaciones
app.use('/api/alertas',           alertasRoutes);

// Ventas
app.use('/api/ventas',            ventasRoutes);

// Broadcast TV
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));
app.use('/api/broadcast',         broadcastRoutes);

module.exports = app;