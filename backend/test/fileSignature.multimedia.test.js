const test = require('node:test');
const assert = require('node:assert/strict');
const { detectarTipo, validarArchivo, mimeSeguroPorExtension } = require('../src/utils/fileSignature');

test('detecta y permite MP3 por firma ID3', () => {
  const buffer = Buffer.concat([Buffer.from('ID3'), Buffer.alloc(20)]);
  assert.deepEqual(detectarTipo(buffer), { tipo: 'mp3', mime: 'audio/mpeg', ext: '.mp3' });
  assert.equal(validarArchivo({ buffer, mimetypeDeclarado: 'audio/mpeg' }).ok, true);
});

test('detecta y permite MP4 por contenedor ISO-BMFF', () => {
  const buffer = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypmp42'), Buffer.alloc(20)]);
  assert.deepEqual(detectarTipo(buffer), { tipo: 'mp4', mime: 'video/mp4', ext: '.mp4' });
  assert.equal(validarArchivo({ buffer, mimetypeDeclarado: 'video/mp4' }).ok, true);
});

test('devuelve MIME seguro para descargar MP3 y MP4', () => {
  assert.equal(mimeSeguroPorExtension('.mp3'), 'audio/mpeg');
  assert.equal(mimeSeguroPorExtension('.mp4'), 'video/mp4');
});
