import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('./WaLineas.jsx', import.meta.url), 'utf8');

test('un QR emitido por socket no abre el modal sin accion del usuario', () => {
  assert.doesNotMatch(
    source,
    /socket\.on\("line:qr"[\s\S]*?setQrModal\(\{\s*lineId,\s*qr\s*\}\)/,
  );
});

test('el boton Conectar QR sigue abriendo el modal y consultando su propia linea', () => {
  assert.match(source, /setQrModal\(\{\s*lineId:\s*id,\s*qr:\s*null\s*\}\)/);
  assert.match(source, /startQrPoll\(id\)/);
});
