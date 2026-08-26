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