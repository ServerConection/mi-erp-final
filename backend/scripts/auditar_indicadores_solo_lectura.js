// Valida el SQL real sin iniciar el servidor ni ejecutar la auto-provisión DDL.
// node backend/scripts/auditar_indicadores_solo_lectura.js [--totales]
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { Client } = require('pg');
const env = require('dotenv').parse(fs.readFileSync(path.join(__dirname, '../.env')));
const client = new Client({
  host: env.DB_HOST, user: env.DB_USER, password: env.DB_PASSWORD,
  database: env.DB_NAME, port: env.DB_PORT, ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000, statement_timeout: 20000,
  options: '-c default_transaction_read_only=on',
});
const queries = [];
const modules = new Map();
let supervisorDisponible = false;
const db = { query: async (sql, values) => {
  if (sql.includes('to_regprocedure')) return { rows: [{ existe: supervisorDisponible }] };
  queries.push({ sql, values });
  return { rows: [] };
} };
function load(file) {
  file = require.resolve(file);
  if (modules.has(file)) return modules.get(file).exports;
  const module = { exports: {} };
  modules.set(file, module);
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    module, exports: module.exports, process, Date, Map, Set, Buffer, setTimeout, clearTimeout,
    console: { log() {}, warn() {}, error() {} },
    require: name => name === '../config/db' ? db
      : name.startsWith('.') ? load(path.resolve(path.dirname(file), name)) : require(name),
  }, { filename: file });
  return module.exports;
}
async function capture(handler, query) {
  queries.length = 0;
  let status = 200;
  let payload;
  await handler({ query }, { status(code) { status = code; return this; }, json(data) { payload = data; } });
  if (status !== 200 || !payload?.success) throw new Error(`Controller HTTP ${status}: ${payload?.error}`);
  return queries.slice();
}
async function checked(sql, values) {
  await client.query('SAVEPOINT audit_query');
  try { return await client.query(sql, values); }
  finally {
    await client.query('ROLLBACK TO SAVEPOINT audit_query');
    await client.query('RELEASE SAVEPOINT audit_query');
  }
}
async function main() {
  await client.connect();
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  supervisorDisponible = (await client.query("SELECT to_regprocedure('public.supervisor_velsa(text,date)') IS NOT NULL AS existe")).rows[0].existe;
  const controllers = path.join(__dirname, '../src/controllers');
  const comercial = load(path.join(controllers, 'kpiComercial.controller.js'));
  const novo = load(path.join(controllers, 'indicadores.controller.js'));
  const velsa = load(path.join(controllers, 'indicadoresVelsaMaterialized.controller.js'));
  await Promise.resolve();
  for (const empresa of ['NOVONET', 'VELSA']) {
    const rango = { empresa, fechaDesde: '2026-09-01', fechaHasta: '2026-09-14' };
    const dashboard = empresa === 'NOVONET' ? novo.getIndicadoresDashboard : velsa.getIndicadoresDashboardVelsa;
    const variantes = [{}, { gestionables: 'si' }, { gestionables: 'no' }, {
      asesor: 'AUDITORIA SIN RESULTADOS', supervisor: 'AUDITORIA SIN RESULTADOS',
      etapaCRM: 'VENTA SUBIDA', estadoNetlife: 'ACTIVO', etapaJotform: 'ACTIVO',
      estadoRegularizacion: 'PENDIENTE', idBitrix: '0',
      fechaActivacionDesde: rango.fechaDesde, fechaActivacionHasta: rango.fechaHasta,
      ...(empresa === 'NOVONET' ? { canal: 'ARTS' } : { origen: 'AUDITORIA' }),
    }];
    for (const [index, filtros] of variantes.entries()) {
      const q = { ...rango, ...filtros };
      const comercialQueries = await capture(comercial.getKpiComercial, q);
      const dashboardQueries = await capture(dashboard, q);
      let errors = 0;
      for (const [i, query] of [...comercialQueries, ...dashboardQueries].entries()) {
        try { await checked('EXPLAIN ' + query.sql, query.values); }
        catch (e) {
          errors++;
          console.log(JSON.stringify({ empresa, variante: index, query: i, code: e.code, error: e.message }));
        }
      }
      console.log(JSON.stringify({ empresa, variante: index, consultas: comercialQueries.length + dashboardQueries.length, errors }));
      if (errors) process.exitCode = 1;
      if (index === 0 && !errors && process.argv.includes('--totales')) {
        const cq = comercialQueries.find(x => x.sql.includes('WITH datos'));
        const dq = dashboardQueries.find(x => x.sql.includes('AS ingresos_reales') && x.sql.includes('AS sup_nombre'));
        const cRows = (await checked(cq.sql, cq.values)).rows;
        const dRows = (await checked(dq.sql, dq.values)).rows;
        const sum = (rows, key) => rows.reduce((acc, row) => acc + Number(row[key] || 0), 0);
        const pairs = [['leads_total', 'leads_totales'], ['leads_gestion', 'gestionables'], ['ingresos_jot', 'ingresos_reales'], ['activas_totales', 'real_mes']];
        const totales = pairs.map(([c, d]) => ({ campo: c, tabla: sum(cRows, c), panel: sum(dRows, d) }));
        console.log(JSON.stringify({ empresa, totales }));
        if (totales.some(x => x.tabla !== x.panel)) process.exitCode = 1;
      }
    }
  }
}
main().catch(e => { console.error(e.code || e.name, e.message); process.exitCode = 1; })
  .finally(async () => { try { await client.query('ROLLBACK'); } finally { await client.end(); } });
