/* Explicit installer: never imported by server startup and never imports config/db. */
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

async function main() {
  const mode = process.argv[2];
  if (mode === '--help' || !mode) {
    console.log('Uso: node scripts/llamadas-db.js --check | --apply');
    console.log('--check: consulta el estado; no modifica la base. --apply: crea las tablas e índices del módulo.');
    console.log('Usa LLAMADAS_DATABASE_URL explícita o DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD de backend/.env.');
    return;
  }
  if (!['--check', '--apply'].includes(mode) || process.argv.length !== 3) {
    throw new Error('Argumentos inválidos. Usa --help.');
  }
  require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });
  let config;
  if (process.env.LLAMADAS_DATABASE_URL) {
    // Explicit connection strings define their own SSL mode.
    config = { connectionString: process.env.LLAMADAS_DATABASE_URL };
  } else {
    if (!['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'].every(k => process.env[k])) {
      throw new Error('Falta configurar la conexión de la base de datos.');
    }
    config = {
      host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 5432),
      database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
      // Match the existing ERP connection configuration.
      ssl: { rejectUnauthorized: false },
    };
  }
  const client = new Client({ ...config, connectionTimeoutMillis: 10000, statement_timeout: 30000 });
  await client.connect();
  try {
    await client.query('SET search_path TO public');
    await client.query("SET lock_timeout TO '5s'");
    const target = (await client.query('SELECT current_database() AS base')).rows[0];
    const expected = {
      llamadas_cdr: ['huella','empresa','direccion','fecha','agente','telefono','duracion','facturados','espera','estado','costo','carga_id'],
      llamadas_cdr_cargas: ['id','archivo','archivo_hash','empresa','direccion','usuario_id','usuario','creado_en','insertadas','repetidas','rechazadas','errores'],
    };
    async function inspect() {
      const rows = (await client.query(`SELECT table_name,column_name FROM information_schema.columns
        WHERE table_schema='public' AND table_name=ANY($1::text[])`, [Object.keys(expected)])).rows;
      return Object.entries(expected).map(([tabla,columns]) => {
        const actual = rows.filter(r => r.table_name === tabla).map(r => r.column_name);
        return { tabla, existe: actual.length > 0, columnasFaltantes: columns.filter(c => !actual.includes(c)) };
      });
    }
    const before = await inspect();
    if (mode === '--apply') {
      if (before.some(t => t.existe && t.columnasFaltantes.length)) {
        throw new Error('Ya hay una tabla de Llamadas con estructura diferente. Revisa el esquema antes de instalar.');
      }
      // The versioned migration owns BEGIN/COMMIT; no existing data is overwritten.
      await client.query(fs.readFileSync(path.resolve(__dirname, '../src/migrations/20260919_llamadas_analitica.sql'), 'utf8'));
    }
    const tables = await inspect();
    const listo = tables.every(t => t.existe && !t.columnasFaltantes.length);
    console.log(JSON.stringify({ modo: mode, base: target.base, listo, tablas: tables }, null, 2));
    if (!listo) process.exitCode = 2;
  } finally {
    await client.end();
  }
}

main().catch(error => {
  // Connection errors can contain credentials; report only the code for infrastructure errors.
  console.error(error.code ? `No se pudo completar la operación (${error.code}).` : error.message);
  process.exitCode = 1;
});
