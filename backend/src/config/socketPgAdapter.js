/**
 * Adaptador Postgres para Socket.io (solo si SOCKET_PG_ADAPTER=on).
 *
 * Con WhatsApp en un servicio aparte, los eventos (mensaje nuevo, QR, estado de
 * línea) se emiten en el proceso wabot, pero el navegador sigue conectado al
 * socket del ERP. Este adaptador usa LISTEN/NOTIFY de Postgres para que un
 * io.to(sala).emit() en un servicio llegue a los clientes conectados al otro.
 *
 * Usa un pool PROPIO y pequeño (no le quita conexiones al pool principal).
 * Si algo falla, se registra y Socket.io sigue funcionando en modo local.
 */
const { Pool } = require('pg');

const TABLA = 'socket_io_attachments';

async function aplicarAdaptadorPg(io) {
  if ((process.env.SOCKET_PG_ADAPTER || '').toLowerCase() !== 'on') return false;
  try {
    const { createAdapter } = require('@socket.io/postgres-adapter');
    const pool = new Pool({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      port: process.env.DB_PORT,
      ssl: { rejectUnauthorized: false },
      max: 3,
      keepAlive: true,
    });
    pool.on('error', (e) => console.error('[SOCKET-PG] error en pool:', e.message));
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${TABLA} (
        id          bigserial UNIQUE,
        created_at  timestamptz DEFAULT NOW(),
        payload     bytea
      )`);
    io.adapter(createAdapter(pool, { tableName: TABLA }));
    console.log('[SOCKET-PG] Adaptador Postgres activo (eventos compartidos entre servicios)');
    return true;
  } catch (e) {
    console.error('[SOCKET-PG] No se pudo activar el adaptador, Socket.io queda local:', e.message);
    return false;
  }
}

module.exports = { aplicarAdaptadorPg };
