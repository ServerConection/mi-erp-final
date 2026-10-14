const test = require('node:test');
const assert = require('node:assert/strict');
const { _test } = require('../src/controllers/bitrixSesiones.controller');
const db = require('../src/config/db');

test.after(async () => { await db.end(); });

test('un catálogo ausente no tumba Bitrix Live y conserva las otras fuentes', async () => {
  let llamada = 0;
  const query = async () => {
    llamada += 1;
    if (llamada === 1) throw new Error('relation bitrix_usuarios_novonet does not exist');
    if (llamada === 2) return { rows: [{ id: '25' }] };
    return { rows: [{ empresa: 'NOVONET', usuario: 'ana@empresa.test', nombres: 'Ana', apellidos: 'Pérez' }] };
  };

  const mapa = await _test.mapaEmpresasUsuarios(query);
  assert.equal(mapa.porId.get('25'), 'VELSA');
  assert.equal(mapa.porIdentidad.get('ANA PEREZ'), 'NOVONET');
  assert.equal(mapa.porIdentidad.get('ANA@EMPRESA.TEST'), 'NOVONET');
});

test('si fallan todos los catálogos devuelve mapas vacíos en vez de HTTP 500', async () => {
  const mapa = await _test.mapaEmpresasUsuarios(async () => { throw new Error('base no disponible'); });
  assert.equal(mapa.porId.size, 0);
  assert.equal(mapa.porIdentidad.size, 0);
});
