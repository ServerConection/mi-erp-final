const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

for (const archivo of ['redesWebhook.controller.js', 'redesVelsaWebhook.controller.js']) {
  test(`${archivo} calcula Redes desde bitrix_webhook_leads`, () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'controllers', archivo), 'utf8');
    assert.match(source, /bitrix_webhook_leads/i);
    assert.doesNotMatch(source, /\bmv_monitoreo\w*\b/i);
    assert.doesNotMatch(source, /\bmv_indicadores\w*\b/i);
    assert.doesNotMatch(source, /\bmestra_bitrix\b/i);
  });
}

test('las rutas activan los controladores webhook', () => {
  const novo = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'redes.routes.js'), 'utf8');
  const velsa = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'redesVelsa.routes.js'), 'utf8');
  assert.match(novo, /redesWebhook\.controller/);
  assert.match(velsa, /redesVelsaWebhook\.controller/);
});
test('VELSA filtra las metricas por agencia asignada y no por origen crudo', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'controllers', 'redesVelsaWebhook.controller.js'), 'utf8');
  assert.match(source, /const filtroAgencia/);
  assert.match(source, /\$\$\{offset \+ i \+ 1\}/);
  assert.match(source, /velsa_lineas_canal/);
  assert.match(source, /canal_publicidad,\s*COUNT\(\*\)/);
  assert.doesNotMatch(source, /const filtroOrigen/);
});
