require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes             = require('./routes/auth.routes');
const redesRoutes = require('./routes/redes.routes');
const usuariosRoutes         = require('./routes/usuarios.routes');
const loginOtpRoutes         = require('./routes/login.otp.routes');
const passwordRoutes         = require('./routes/password.routes');
const forgotRoutes           = require('./routes/forgotPassword.routes');
const testEmailRoutes        = require('./routes/test.email.routes');
const verifyOtpRoutes        = require('./routes/verify.otp.routes');
const indicadoresRoutes      = require('./routes/indicadores.routes');
const indicadoresVelsaRoutes = require('./routes/indicadoresVelsa.routes');

const app = express();

app.use(cors());
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
app.use('/api/indicadores',       indicadoresRoutes);
app.use('/api/indicadores-velsa', indicadoresVelsaRoutes);

//Redes
app.use('/api/redes',             redesRoutes);

module.exports = app;