const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
  // ESTA ES LA PARTE QUE TE FALTA PARA LA NUBE:
  ssl: {
    rejectUnauthorized: false // Esto permite la conexión segura con Render
  }
});

module.exports = pool;