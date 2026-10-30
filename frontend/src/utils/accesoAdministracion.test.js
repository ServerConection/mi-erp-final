import assert from 'node:assert/strict';
import { puedeAccederAdministracion, puedeAccederComisiones } from './accesoAdministracion.js';

for (const perfil of ['ADMINISTRADOR', 'administrador', ' Administrador ', 'GERENCIA', 'GERENTE', 'GERENCIA COMERCIAL', 'GERENTE GENERAL', 'gerencia financiera']) {
  assert.equal(puedeAccederAdministracion(perfil), true, perfil);
}
for (const perfil of ['SUPERVISOR', 'ATC', 'ANALISTA', 'TTHH', 'USUARIO', 'ASESOR', '']) {
  assert.equal(puedeAccederAdministracion(perfil), false, perfil);
}
assert.equal(puedeAccederComisiones('ANALISTA'), true);
assert.equal(puedeAccederComisiones('SUPERVISOR'), false);
console.log('OK acceso Administracion frontend');
