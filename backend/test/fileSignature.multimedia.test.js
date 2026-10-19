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

test('detecta los formatos de audio comunes de WhatsApp y móviles', () => {
  const casos = [
    [Buffer.concat([Buffer.from([0xff, 0xf1]), Buffer.alloc(20)]), 'aac', 'audio/aac', '.aac'],
    [Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypM4A '), Buffer.alloc(20)]), 'm4a', 'audio/mp4', '.m4a'],
    [Buffer.concat([Buffer.from('OggS'), Buffer.alloc(20)]), 'ogg', 'audio/ogg', '.ogg'],
    [Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE'), Buffer.alloc(12)]), 'wav', 'audio/wav', '.wav'],
    [Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(20)]), 'webm', 'audio/webm', '.webm'],
    [Buffer.concat([Buffer.from('#!AMR\n'), Buffer.alloc(20)]), 'amr', 'audio/amr', '.amr'],
  ];
  for (const [buffer, tipo, mime, ext] of casos) {
    assert.deepEqual(detectarTipo(buffer), { tipo, mime, ext });
    assert.equal(validarArchivo({ buffer, mimetypeDeclarado: mime }).ok, true);
    assert.equal(mimeSeguroPorExtension(ext), mime);
  }
  assert.equal(mimeSeguroPorExtension('.opus'), 'audio/ogg');
});

test('AAC ADTS no se confunde con MP3', () => {
  const buffer = Buffer.concat([Buffer.from([0xff, 0xf9]), Buffer.alloc(20)]);
  assert.equal(detectarTipo(buffer)?.tipo, 'aac');
});
