/**
 * Migración: aislamiento de datos por usuario en el módulo WhatsApp.
 * Ejecutar UNA SOLA VEZ desde la carpeta backend:
 *   node src/migrations/run_whatsapp_ownership.js
 */
require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const pool = require('../config/db');

async function run() {
  console.log('[whatsapp-ownership] Ejecutando migración...');
  const sql = fs.readFileSync(path.join(__dirname, 'whatsapp_ownership.sql'), 'utf8');
  try {
    await pool.query(sql);
    console.log('[OK] Columna created_by agregada a: lines, bots, contact_lists, templates, campaigns, scheduled_messages, contacts');
    console.log('[INFO] Las filas existentes quedan con created_by = NULL (solo ADMINISTRADOR las verá hasta asignarles dueño).');
    process.exit(0);
  } catch (err) {
    console.error('[ERR]', err.message);
    process.exit(1);
  }
}

run();
