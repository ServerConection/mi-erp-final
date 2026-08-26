import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Redes renderiza el filtro global con agencias dinamicas', () => {
  const source = fs.readFileSync(new URL('./Redes.jsx', import.meta.url), 'utf8');
  assert.match(source, /<PanelFiltrosGlobales/);
  assert.match(source, /agencias=\{data\.principal\?\.canales_disponibles \|\| \[\]\}/);
});

test('el selector acepta opciones dinamicas del catalogo', () => {
  const source = fs.readFileSync(new URL('./GlobalFilters.jsx', import.meta.url), 'utf8');
  assert.match(source, /opciones/);
  assert.match(source, /agencias\.map/);
});
