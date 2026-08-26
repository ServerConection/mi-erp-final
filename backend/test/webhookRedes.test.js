const test = require('node:test');
const assert = require('node:assert/strict');
const { fechaWebhookExpr, etapaWebhookExpr, horaWebhookExpr } = require('../src/shared/webhookRedes');

test('la fecha prioriza iniciado_el de Bitrix y conserva respaldo Ecuador', () => {
  const sql = fechaWebhookExpr('lead');
  assert.match(sql, /lead\.iniciado_el/);
  assert.match(sql, /DD\/MM\/YYYY/);
  assert.match(sql, /America\/Guayaquil/);
});

test('etapa y hora se leen desde el webhook normalizado', () => {
  assert.match(etapaWebhookExpr('lead'), /lead\.etapa_bitrix/);
  assert.match(horaWebhookExpr('lead'), /lead\.created_at/);
});
