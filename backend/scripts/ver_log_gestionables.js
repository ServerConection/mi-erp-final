/**
 * Muestra las últimas llamadas registradas del webhook de "gestionables
 * permitidos" — para diagnosticar por qué no se llenó el campo en Bitrix.
 *
 * Uso: node scripts/ver_log_gestionables.js
 */
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host:     process.env.ERP_DB_HOST || process.env.DB_HOST,
  user:     process.env.ERP_DB_USER || process.env.DB_USER,
  password: process.env.ERP_DB_PASSWORD || process.env.DB_PASSWORD,
  database: process.env.ERP_DB_NAME || 'erp_database',
  port:     process.env.ERP_DB_PORT || process.env.DB_PORT,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
});

(async () => {
  try {
    const r = await pool.query(
      `SELECT bitrix_id, nombre_asesor, gestionables_permitidos, encontrado,
              actualizado_en_bitrix, error, creado_en
         FROM gestionables_webhook_log
        ORDER BY creado_en DESC
        LIMIT 15`
    );

    if (r.rows.length === 0) {
      console.log('❌ NO HAY NINGÚN REGISTRO EN EL LOG.');
      console.log('   Esto significa que Bitrix NUNCA llegó a llamar el webhook.');
      console.log('   Revisa la URL de la automatización (dominio, token, que esté GUARDADA y ACTIVA).');
      process.exit(0);
    }

    console.log(`Últimos ${r.rows.length} intentos:\n`);
    r.rows.forEach(row => {
      console.log('──────────────────────────────────────');
      console.log('Fecha:', row.creado_en);
      console.log('Deal ID:', row.bitrix_id);
      console.log('Asesor recibido:', JSON.stringify(row.nombre_asesor));
      console.log('Cupo encontrado en la tabla:', row.encontrado);
      console.log('Gestionables:', row.gestionables_permitidos);
      console.log('Se actualizó en Bitrix:', row.actualizado_en_bitrix);
      if (row.error) console.log('⚠️  ERROR:', row.error);
    });
    process.exit(0);
  } catch (err) {
    console.error('❌ Error consultando el log:', err.message);
    process.exit(1);
  }
})();
