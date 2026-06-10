/**
 * Migración del módulo WhatsApp para el ERP.
 * Ejecutar UNA SOLA VEZ desde la carpeta backend:
 *   node src/migrations/run_whatsapp.js
 */
require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const pool = require('../config/db');

async function run() {
  console.log('[whatsapp-migrate] Ejecutando migración...');
  const sql = fs.readFileSync(path.join(__dirname, 'whatsapp_schema.sql'), 'utf8');
  try {
    await pool.query(sql);
    console.log('[OK] Tablas creadas:');
    console.log('     bots, lines, lid_mappings, wa_contacts');
    console.log('     contact_lists, contact_list_items');
    console.log('     wa_templates, campaigns, campaign_messages');
    console.log('     campaign_recipients, conversations');
    console.log('     wa_messages, scheduled_messages');
    process.exit(0);
  } catch (err) {
    console.error('[ERR]', err.message);
    process.exit(1);
  }
}

run();
