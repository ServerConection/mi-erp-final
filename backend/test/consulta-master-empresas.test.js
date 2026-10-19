const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const fuente = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'indicadores.routes.js'), 'utf8');

test('Consulta Master consolida las cuatro empresas con sus categorías Bitrix', () => {
  assert.match(fuente, /consultarDetalleJotform\(pool, 'novonet'/);
  assert.match(fuente, /consultarDetalleJotform\(pool, 'velsa'/);
  assert.match(fuente, /consultarDetallePipelineWebhook\('semillero', '41', 'SEMILLERO'/);
  assert.match(fuente, /consultarDetallePipelineWebhook\('ventaenlinea', '61', 'VENTAENLINEA'/);
  assert.match(fuente, /empresas: \['NOVONET', 'VELSA', 'SEMILLERO', 'VENTAENLINEA'\]/);
});

test('Consulta Master conserva la autorización en frontend y backend', () => {
  assert.match(fuente, /ADMINISTRADOR/);
  assert.match(fuente, /GEREN/);
  assert.match(fuente, /ANALISTA/);
  assert.match(fuente, /status\(403\)/);
});
