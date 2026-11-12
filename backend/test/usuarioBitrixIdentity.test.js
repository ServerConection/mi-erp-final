const test = require('node:test');
const assert = require('node:assert/strict');
const {
  quitarRepeticionCompleta,
  nombresEquivalentesParaVincular,
} = require('../src/services/usuarioBitrixIdentity.service');

test('elimina el nombre legal completo duplicado en nombres y apellidos', () => {
  assert.deepEqual(
    quitarRepeticionCompleta('JOMAIRA CRISTINA LEITON RIZZO JOMAIRA CRISTINA LEITON RIZZO'),
    ['JOMAIRA', 'CRISTINA', 'LEITON', 'RIZZO']
  );
});

test('vincula el caso real de Jomaira aunque el ERP duplique el nombre', () => {
  assert.equal(
    nombresEquivalentesParaVincular(
      'JOMAIRA CRISTINA LEITON RIZZO JOMAIRA CRISTINA LEITON RIZZO',
      'JOMAIRA CRISTINA LEITON RIZZO'
    ),
    true
  );
});

test('tolera tildes, símbolos y un orden diferente de las mismas palabras', () => {
  assert.equal(
    nombresEquivalentesParaVincular('José Andrés Pérez López', 'PEREZ-LOPEZ JOSE ANDRES'),
    true
  );
});

test('no vincula nombres parciales ni personas diferentes', () => {
  assert.equal(
    nombresEquivalentesParaVincular('JOMAIRA CRISTINA LEITON RIZZO', 'JOMAIRA CRISTINA LEITON'),
    false
  );
  assert.equal(nombresEquivalentesParaVincular('MARIA LOPEZ', 'MARIA PEREZ'), false);
});
