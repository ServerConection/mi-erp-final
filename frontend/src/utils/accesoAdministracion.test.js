import assert from 'node:assert/strict';
import { puedeAccederAdministracion } from './accesoAdministracion.js';

for (const perfil of ['ADMINISTRADOR', 'GERENCIA', 'GERENTE', 'GERENCIA COMERCIAL', 'GERENTE GENERAL', 'gerencia financiera']) {
  assert.equal(puedeAccederAdministracion(perfil), true, perfil);
}
for (const perfil of ['SUPERVISOR', 'ATC', 'ANALISTA', 'TTHH', 'USUARIO', 'ASESOR', '']) {
  assert.equal(puedeAccederAdministracion(perfil), false, perfil);
}
console.log('OK acceso Administracion frontend');
