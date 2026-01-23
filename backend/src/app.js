require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/users.routes');

const app = express();

// 1. IMPORTANTE: CORS activado para que entre el frontend
app.use(cors()); 
app.use(express.json());

// 2. CORRECCIÓN DE RUTAS (Agregamos '/api')
// Así la url queda: https://tu-web.com/api/auth/login
app.use('/api/auth', authRoutes);
app.use('/api/admin/users', userRoutes);

module.exports = app;