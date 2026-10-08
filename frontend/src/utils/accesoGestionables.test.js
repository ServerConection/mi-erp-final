import test from 'node:test';
import assert from 'node:assert/strict';
import { tieneAccesoGestionables } from './accesoGestionables.js';

test('administrador puede ver ambos repartos sin depender de su empresa', () => {
  for (const empresa of ['NOVONET', 'VELSA', 'SEMILLERO', '', null]) {
    const usuario = { perfil: 'ADMINISTRADOR', empresa };
    assert.equal(tieneAccesoGestionables(usuario, 'NOVONET'), true);
    assert.equal(tieneAccesoGestionables(usuario, 'VELSA'), true);
  }
});

test('supervisión y gerencia siguen aisladas por empresa', () => {
  assert.equal(tieneAccesoGestionables({ perfil: 'SUPERVISOR', empresa: 'NOVONET' }, 'NOVONET'), true);
  assert.equal(tieneAccesoGestionables({ perfil: 'SUPERVISOR', empresa: 'NOVONET' }, 'VELSA'), false);
  assert.equal(tieneAccesoGestionables({ perfil: 'GERENCIA', empresa: 'VELSA' }, 'VELSA'), true);
  assert.equal(tieneAccesoGestionables({ perfil: 'GERENCIA', empresa: 'VELSA' }, 'NOVONET'), false);
});
