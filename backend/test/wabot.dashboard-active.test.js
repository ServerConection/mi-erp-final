const test = require('node:test');
const assert = require('node:assert/strict');
test('panel incluye usuarios activos sin líneas y alerta excesos de asesores', async () => {
  const db = require.resolve('../src/config/db');
  const file = require.resolve('../src/controllers/wa_lines.controller');
  const previous = require.cache[db];
  let sql;
  require.cache[db] = { id: db, filename: db, loaded: true, exports: { query: async text => {
    sql = text;
    return { rows: [
      { id: null, usuario: 'sin-linea', empresa: 'VELSA', perfil: 'ASESOR' },
      { id: 'a', usuario: 'dos-lineas', empresa: 'NOVONET', perfil: 'ASESOR', status: 'connected' },
      { id: 'b', usuario: 'dos-lineas', empresa: 'NOVONET', perfil: 'ASESOR', status: 'logged_out' },
    ] };
  } } };
  delete require.cache[file];
  try {
    let body;
    await require(file).dashboard({ user: { perfil: 'ADMINISTRADOR' }, app: { get: () => null } }, {
      json: value => { body = value; }, status() { return this; },
    });
    assert.match(sql, /UPPER\(TRIM\(u.activo\)\) = 'SI'/);
    assert.match(sql, /FROM usuarios u[\s\S]*LEFT JOIN lines/);
    assert.equal(body.resumen.lineas, 2);
    assert.equal(body.data.find(e => e.empresa === 'VELSA').asesores[0].alerta, 'Sin líneas asignadas');
    assert.equal(body.data.find(e => e.empresa === 'NOVONET').asesores[0].alerta, 'Asesor con más de 1 línea');
    assert.equal(body.resumen.conectadas, 0);
  } finally { delete require.cache[file]; if (previous) require.cache[db] = previous; else delete require.cache[db]; }
});
