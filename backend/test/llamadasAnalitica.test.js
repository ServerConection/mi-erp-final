const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseFile, summarize, validateFilters } = require('../src/services/llamadasAnalitica');
const header = 'Fecha,Nombre Agente,Destino,Duracion,Segundos Facturados,Disposicion,Costo\n';
const row = '2026-09-01 09:20:00,"María, Pérez",5930991234567,30,20,ANSWERED,0.2';
const file = (s, name='outbound_Netlife_20260701_20260919.csv') => ({originalname:name,buffer:Buffer.from(s)});
test('CSV quoted names, local timestamps and phone normalization remain stable across cdr aliases', () => {
  const a = parseFile(file(header+row));
  const b = parseFile(file(header+row,'cdr_outbound_Netlife_20260701_20260919.csv'));
  assert.equal(a.rows[0].telefono,'593991234567');
  assert.equal(a.rows[0].fecha,'2026-09-01 09:20:00');
  assert.equal(a.rows[0].espera,null);
  assert.equal(a.rows[0].huella,b.rows[0].huella);
  assert.equal(a.rows[0].agente,'MARIA, PEREZ');
});
test('rejects invalid dates, negative and blank numeric fields without silently coercing them to zero', () => {
  for (const bad of [row.replace('09-01','02-30'),row.replace(',30,',',-3,'),row.replace(',30,',',,')]) {
    const out=parseFile(file(header+bad)); assert.equal(out.rows.length,0); assert.equal(out.rechazadas,1);
  }
});
test('missing schema, ambiguous company and broken quoting reject the file', () => {
  assert.throws(()=>parseFile(file('Fecha,Destino\n2026-09-01,123')));
  assert.throws(()=>parseFile(file(header+row,'outbound.csv')));
  assert.throws(()=>parseFile(file(header+row+'"')));
});
test('summaries distinguish answered calls from billed time and unique called numbers', () => {
  const a=parseFile(file(header+row)).rows[0];
  const b={...a,estado:'NO ANSWERED',facturados:0};
  const out=summarize([a,b]);
  assert.equal(out.resumen.total,2); assert.equal(out.resumen.tasa,50);
  assert.equal(out.resumen.telefonos,1); assert.equal(out.resumen.intentosPorTelefono,2);
  assert.equal(out.resumen.segundosFacturados,20); assert.equal(out.resumen.esperaMedia,null);
  assert.equal(out.diario[0].grupo,'2026-09-01'); assert.equal(out.mapa[0].grupo,'2-09');
});
test('empty data never implies zero wait and filtering is bounded/validated', () => {
  assert.equal(summarize([]).resumen.esperaMedia,null);
  assert.throws(()=>validateFilters({desde:'2026-02-30'}));
  assert.throws(()=>validateFilters({desde:'2026-09-02',hasta:'2026-09-01'}));
  assert.throws(()=>validateFilters({empresa:'other'}));
  assert.throws(()=>validateFilters({pagina:'-1'}));
  assert.equal(validateFilters({empresa:'NETLIFE'}).empresa,'NETLIFE');
});
