const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.join(__dirname, '..', '..');
const leer = (...partes) => fs.readFileSync(path.join(raiz, ...partes), 'utf8');

const backends = [
  leer('backend', 'src', 'controllers', 'indicadores.controller.js'),
  leer('backend', 'src', 'controllers', 'indicadoresVelsaMaterialized.controller.js'),
];
const frontends = [
  leer('frontend', 'src', 'pages', 'Indicadores.jsx'),
  leer('frontend', 'src', 'pages', 'IndicadoresVelsa.jsx'),
];

test('Novonet y Velsa calculan todas las categorias solicitadas', () => {
  for (const fuente of backends) {
    for (const campo of [
      'profesional_ingresados', 'profesional_activos',
      'gamer_ingresados', 'gamer_activos',
      'servicios_adicionales_ingresados', 'servicios_adicionales_activos',
    ]) {
      assert.match(fuente, new RegExp(campo));
    }
  }
});

test('Dashboard y Reporte 180 muestran las seis categorias', () => {
  for (const fuente of frontends) {
    for (const clave of ['hogar', 'pymes', 'profesional', 'adulto_mayor', 'gamer', 'servicios_adicionales']) {
      assert.match(fuente, new RegExp(`key: '${clave}'`));
    }
  }
});
