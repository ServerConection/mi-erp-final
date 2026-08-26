import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('el boton envia el periodo visible y las consultas evitan cache', () => {
  const source = fs.readFileSync(new URL('./Redes.jsx', import.meta.url), 'utf8');
  assert.match(source, /<SyncInversionButton from=\{filtro\.desde\} to=\{filtro\.hasta\}/);
  assert.match(source, /cache:\s*["']no-store["']/);
});


test('Redes y el worker actualizan automaticamente cada 15 minutos', () => {
  const redes = fs.readFileSync(new URL('./Redes.jsx', import.meta.url), 'utf8');
  const cron = fs.readFileSync(new URL('../../../backend/src/jobs/syncWinTracker.cron.js', import.meta.url), 'utf8');
  assert.match(redes, /15 \* 60 \* 1000/);
  assert.match(cron, /cron\.schedule\(['"]\*\/15/);
});


test('la efectividad de Redes usa Venta Subida sobre Gestionables', () => {
  const source = fs.readFileSync(new URL('./Redes.jsx', import.meta.url), 'utf8');
  assert.match(source, /canalData\.venta_subida_bitrix \/ canalData\.negociables/);
  assert.match(source, /totalVta \/ totalNeg/);
  assert.doesNotMatch(source, /const ef\s*=\s*canalData\.n_leads/);
  assert.doesNotMatch(source, /const efect\s*=\s*totalNeg > 0 \? \(totalJot \/ totalNeg\)/);
});
