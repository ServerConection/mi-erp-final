import test from 'node:test';
import assert from 'node:assert/strict';
import { puedeAccederAutomarcador } from './accesoAutomarcador.js';

test('permite los perfiles de mando solicitados', () => {
  for (const perfil of ['ADMINISTRADOR', 'SUPERVISOR', 'COORDINADOR', 'ANALISTA', 'GERENCIA', 'GERENTE', 'GERENCIA COMERCIAL']) {
    assert.equal(puedeAccederAutomarcador(perfil), true, perfil);
  }
});

test('rechaza perfiles operativos', () => {
  for (const perfil of ['ASESOR', 'USUARIO', 'CONSULTOR', 'ATC', '']) {
    assert.equal(puedeAccederAutomarcador(perfil), false, perfil);
  }
});
