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

test('Consulta Master usa las mismas reglas de fecha y supervisor de los reportes individuales', () => {
  assert.match(fuente, /fechaWebhookExpr\('w'\)/);
  assert.match(fuente, /'ADRIANA SALVATORE'::text/);
  assert.match(fuente, /m\.empresa = 'VENTAENLINEA'/);
  assert.match(fuente, /m\.anio = EXTRACT\(YEAR FROM \$2::date\)/);
  assert.doesNotMatch(fuente, /WHERE \(w\.created_at AT TIME ZONE 'America\/Guayaquil'\)::date BETWEEN/);
});
