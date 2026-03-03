require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/users.routes');
const indicadoresRoutes = require('./routes/indicadores.routes');
const indicadoresVelsaRoutes = require('./routes/indicadoresVelsa.routes');

const app = express();

// CORS
app.use(cors());
app.use(express.json());

// Rutas
app.use('/api/auth', authRoutes);
app.use('/api/admin/users', userRoutes);

// Indicadores originales
app.use('/api/indicadores', indicadoresRoutes);

// Indicadores Velsa (nuevo backend)
app.use('/api/indicadores-velsa', indicadoresVelsaRoutes);

module.exports = app;