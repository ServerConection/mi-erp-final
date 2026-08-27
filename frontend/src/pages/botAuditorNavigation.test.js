import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const page = await readFile(new URL('./BotAuditor.jsx', import.meta.url), 'utf8');
const contactabilidad = await readFile(new URL('./Contactabilidad.jsx', import.meta.url), 'utf8');

test('Bot Auditor muestra un acceso visible al dashboard de Contactabilidad', () => {
  assert.match(page, /\/bot-auditor\/contactabilidad/);
  assert.match(page, /Contactabilidad/);
});

test('Contactabilidad identifica claramente la tabla de mensajes y fechas', () => {
  assert.match(contactabilidad, /Mensajes y fechas/);
});

test('la tabla explica los registros que todavia no tienen mensajes', () => {
  assert.match(contactabilidad, /Pendiente de reintento|Sin mensajes recuperables/);
});
