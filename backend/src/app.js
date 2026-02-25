require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/users.routes');
// 1. Importamos las nuevas rutas de indicadores
const indicadoresRoutes = require('./routes/indicadores.routes');

const app = express();

// 1. IMPORTANTE: CORS activado para que entre el frontend
app.use(cors()); 
app.use(express.json());

// 2. CORRECCIÓN DE RUTAS (Agregamos '/api')
app.use('/api/auth', authRoutes);
app.use('/api/admin/users', userRoutes);
// 2. Registramos la nueva ruta de indicadores
app.use('/api/indicadores', indicadoresRoutes);

module.exports = app;