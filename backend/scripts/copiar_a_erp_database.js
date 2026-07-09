/**
 * COPIA UNA SOLA VEZ los datos históricos de bddgeneral (bitrix_webhook_leads
 * y bitrix_webhook_leads_historial) hacia erp_database, el nuevo desarrollo.
 *
 * Uso (desde backend/):
 *   node scripts/copiar_a_erp_database.js
 *
 * Requisito: ya debiste correr la migración
 * backend/src/db/migrations/bitrix_webhook_leads.sql conectado a "erp_database"
 * en pgAdmin (para que existan las tablas ahí). Si no lo hiciste, el script
 * te lo va a avisar y no copia nada para esa tabla.
 *
 * Es seguro correrlo más de una vez: usa ON CONFLICT DO NOTHING, así que si
 * ya se replicó algo en vivo por el webhook (desde que activaste la doble
 * escritura), no se duplica. Al final deja la secuencia de "id" de cada
 * tabla en erp_database sincronizada, para que los próximos inserts en vivo
 * no choquen con los ids ya copiados.
 *
 * No toca ni borra nada en bddgeneral — es solo lectura ahí.
 */

require('dotenv').config();
const pool = require('../src/config/db');       // origen: bddgeneral
const poolErp = require('../src/config/dbErp'); // destino: erp_database

const LOTE = 300; // filas por INSERT (evita pasar el límite de parámetros de Postgres)
const REINTENTOS = 8; // si se corta la conexión o el servidor está reiniciando, reintenta el mismo lote
const ESPERA_BASE_MS = 3000; // espera creciente: 3s, 6s, 12s, 24s, 48s, 60s, 60s, 60s (tope 60s)

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// Reintenta una query en poolErp si la conexión se corta o el servidor está
// en "recovery mode" (reinicio/mantenimiento de Render — pasajero, típicamente
// se resuelve en menos de 1 minuto). Como todo usa ON CONFLICT DO NOTHING, un
// reintento nunca duplica datos.
async function queryConReintento(sql, params, etiqueta) {
  let ultimoError;
  for (let intento = 1; intento <= REINTENTOS; intento++) {
    try {
      return await poolErp.query(sql, params);
    } catch (err) {
      ultimoError = err;
      const espera = Math.min(ESPERA_BASE_MS * 2 ** (intento - 1), 60000);
      console.error(`\n⚠️  ${etiqueta}: intento ${intento}/${REINTENTOS} falló (${err.message}). Reintentando en ${Math.round(espera / 1000)}s...`);
      await esperar(espera);
    }
  }
  throw ultimoError;
}

// Estas columnas NO se copian: los triggers de la tabla destino las recalculan
// solas a partir de created_at/updated_at, así que copiarlas es innecesario.
const EXCLUIR = new Set(['created_at_ecuador', 'updated_at_ecuador']);

async function columnasTabla(clientPool, tabla, etiqueta) {
  try {
    const r = await clientPool.query(
      `SELECT column_name, data_type
       FROM information_schema.columns
       WHERE table_name = $1
       ORDER BY ordinal_position`,
      [tabla]
    );
    return r.rows;
  } catch (err) {
    console.error(`\n❌ Error consultando columnas de "${tabla}" en ${etiqueta}`);
    console.error('  code:', err.code);
    console.error('  message:', err.message);
    throw err;
  }
}

async function copiarTabla(tabla, conflictoCols) {
  console.log(`\n== ${tabla} ==`);

  const colsOrigen = await columnasTabla(pool, tabla, 'bddgeneral (origen)');
  if (!colsOrigen.length) {
    console.error(`  No existe "${tabla}" en bddgeneral (origen). Se omite.`);
    return;
  }
  const colsDestino = await columnasTabla(poolErp, tabla, 'erp_database (destino)');
  if (!colsDestino.length) {
    console.error(`  ❌ "${tabla}" no existe en erp_database. Corre primero la migración ahí (bitrix_webhook_leads.sql) y vuelve a intentar.`);
    return;
  }

  const columnas = colsOrigen
    .map(c => c.column_name)
    .filter(nombre => !EXCLUIR.has(nombre) && colsDestino.some(d => d.column_name === nombre));

  const jsonbCols = new Set(
    colsOrigen.filter(c => columnas.includes(c.column_name) && c.data_type === 'jsonb').map(c => c.column_name)
  );

  const { rows } = await pool.query(`SELECT ${columnas.map(c => `"${c}"`).join(',')} FROM ${tabla} ORDER BY id`);
  console.log(`  Filas en bddgeneral: ${rows.length}`);
  if (!rows.length) return;

  let copiadas = 0;
  for (let i = 0; i < rows.length; i += LOTE) {
    const lote = rows.slice(i, i + LOTE);
    const valoresSQL = [];
    const params = [];
    lote.forEach((fila, f) => {
      const placeholders = columnas.map((col, c) => {
        const n = f * columnas.length + c + 1;
        return jsonbCols.has(col) ? `$${n}::jsonb` : `$${n}`;
      });
      valoresSQL.push(`(${placeholders.join(',')})`);
      columnas.forEach(col => {
        let v = fila[col];
        if (jsonbCols.has(col) && v !== null && typeof v !== 'string') v = JSON.stringify(v);
        params.push(v);
      });
    });

    const conflictClause = conflictoCols ? `ON CONFLICT (${conflictoCols.join(',')}) DO NOTHING` : '';
    try {
      await queryConReintento(
        `INSERT INTO ${tabla} (${columnas.map(c => `"${c}"`).join(',')}) VALUES ${valoresSQL.join(',')} ${conflictClause}`,
        params,
        `Lote ${i}-${i + lote.length} de "${tabla}"`
      );
    } catch (err) {
      console.error(`\n❌ Error insertando lote ${i}-${i + lote.length} de "${tabla}" en erp_database (tras ${REINTENTOS} intentos)`);
      console.error('  code:', err.code);
      console.error('  message:', err.message);
      throw err;
    }
    copiadas += lote.length;
    process.stdout.write(`\r  Copiadas: ${copiadas}/${rows.length}`);
  }
  console.log('');

  if (columnas.includes('id')) {
    await queryConReintento(
      `SELECT setval(pg_get_serial_sequence('${tabla}', 'id'), COALESCE((SELECT MAX(id) FROM ${tabla}), 1))`,
      [],
      `Reinicio de secuencia de "${tabla}"`
    );
    console.log('  Secuencia de "id" reiniciada.');
  }
}

(async () => {
  try {
    await copiarTabla('bitrix_webhook_leads', ['empresa', 'bitrix_id']);
    await copiarTabla('bitrix_webhook_leads_historial', ['id']);
    console.log('\nListo. Revisa los conteos en pgAdmin (erp_database) para confirmar.');
  } catch (err) {
    console.error('\nError general - code:', err.code);
    console.error('Error general - message:', err.message);
  } finally {
    process.exit(0);
  }
})();
