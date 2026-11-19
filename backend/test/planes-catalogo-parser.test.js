const test = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('xlsx');

const { parseWorkbook } = require('../src/services/planesCatalogoParser.service');

function sheet(rows) {
  return XLSX.utils.aoa_to_sheet(rows);
}

function octubreWorkbook() {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet([
    ['PLANES CASA', 'Velocidad', 'Equipo', 'Beneficio extra MINI UPS', 'Servicios Adicionales sin costo dentro del plan escoges', 'PLAN PROMOCION', 'SubTotal', 'IVA', 'Precio con IVA', null, '% Dsto con TC', 'Facturas promocion', 'Promocion Valor', 'Sub Total Precio Promocion', 'IVA', 'PVP CON PROMOCION', null, '% Dsto con CTA', 'Facturas promocion', 'Promocion Valor', 'Sub Total Precio Promocion', 'IVA', 'PVP CON PROMOCION'],
    ['Plan 750 Mbps', 'Simetrica', 'Wifi 6 o Wifi7', '1 MINI UPS', 'Netlife Play', '1200 MEGAS POR 18 MESES', 25.75, 3.8625, 29.6125, null, 0.45, 3, 11.5875, 14.1625, 2.124375, 16.286875, null, 0.2, 7, 5.15, 20.6, 3.09, 23.69],
  ]), 'HOME');
  XLSX.utils.book_append_sheet(wb, sheet([
    ['TIPO DE PLAN', 'PLANES CASA', 'Velocidad', 'Equipo', 'Beneficio extra MINI UPS', 'Servicios Adicionales sin costo dentro del plan escoges', 'PLAN PROMOCION', 'SubTotal', 'IVA', 'Precio con IVA', null, 'PRECIO SIN IVA', 'IVA', 'PRECIO CON IVA'],
    ['HOME', 'Plan 400 Mbps', 'Simetrica', 'Wifi 5', null, 'NetlifeCam Indoor', '900 MEGAS POR 18 MESES', 24.5, 3.675, 28.175, null, 14.5, 2.175, 16.68],
  ]), 'TERCERA EDAD');
  XLSX.utils.book_append_sheet(wb, sheet([
    ['PLAN GAMER', 'GOLDEN FEATURES SETUP PRO', 'SUBTOTAL', 'IVA', 'TOTAL', 'Router DB Premium'],
    ['GAMER LITE 550 Mbps', 'NAT Abierta PRO', 26.5, 3.975, 30.475, 'Wifi 7 Certificado'],
  ]), 'GAMER');
  XLSX.utils.book_append_sheet(wb, sheet([
    ['PLANES', 'Velocidad', 'Servicios incluidos sin costo', 'Plan Promocion', 'Subtotal', 'IVA', 'Precio Total', 'Wifi'],
    ['PRO 250 MEGAS', 'Simetrica', 'Netlife Assistance Pro', '600 MBPS POR 18 Meses', 22, 3.3, 25.3, 'Wifi5'],
  ]), 'PRO');
  XLSX.utils.book_append_sheet(wb, sheet([
    ['PLANES', 'VELOCIDAD', 'OPCIONES INCLUIDAS YA DENTRO DEL PLAN', 'OPCIONES INCLUIDAS DE PERSONALIZACION', 'SUBTOTAL', 'IVA', 'PRECIO TOTAL', 'WIFI'],
    ['PLAN 2000 MEGAS', 'ASIMETRICA', 'NETLIFE DEFENSE + CONSTRUCTOR WEB', 'Netlife Assistance Pro', 117, 17.55, 134.55, 'WIFI 6 o superior'],
    ['PLAN 2000 MEGAS', 'ASIMETRICA', 'NETLIFE DEFENSE + CONSTRUCTOR WEB', '1 Extender Dual Band Premium', 117, 17.55, 134.55, 'WIFI 6 o superior'],
  ]), 'PYME');
  return wb;
}

test('importa el formato de octubre desde la fila 1 sin perder tipos de plan', () => {
  const { registros, resumen } = parseWorkbook(octubreWorkbook());

  assert.deepEqual(resumen, {
    HOME: '1 opciones',
    'TERCERA EDAD': '1 opciones',
    GAMER: '1 opciones',
    PRO: '1 opciones',
    PYME: '2 opciones',
  });
  assert.equal(registros.length, 6);

  const terceraEdad = registros.find(r => r.tipo_plan === 'TERCERA EDAD');
  assert.deepEqual(terceraEdad, {
    tipo_plan: 'TERCERA EDAD',
    plan_base: 'Plan 400 Mbps',
    empaquetado: 'NetlifeCam Indoor',
    velocidad: 'Simetrica',
    plan_promocion: '900 MEGAS POR 18 MESES',
    equipo: 'Wifi 5',
    precio_sin_iva: 14.5,
    precio_con_iva: 16.68,
  });

  const pyme = registros.filter(r => r.tipo_plan === 'PYME');
  assert.deepEqual(pyme.map(r => r.empaquetado), [
    'NETLIFE DEFENSE + CONSTRUCTOR WEB + Netlife Assistance Pro',
    'NETLIFE DEFENSE + CONSTRUCTOR WEB + 1 Extender Dual Band Premium',
  ]);
});

test('rechaza una hoja conocida cuando no contiene sus encabezados obligatorios', () => {
  const wb = octubreWorkbook();
  wb.Sheets.HOME = sheet([['PLANES CASA', 'Velocidad'], ['Plan 750 Mbps', 'Simetrica']]);

  assert.throws(
    () => parseWorkbook(wb),
    /HOME.*encabezados obligatorios/i,
  );
});

test('no permite reemplazar el catálogo cuando una pestaña queda sin opciones', () => {
  const wb = octubreWorkbook();
  wb.Sheets.GAMER = sheet([
    ['PLAN GAMER', 'GOLDEN FEATURES SETUP PRO', 'SUBTOTAL', 'IVA', 'TOTAL', 'Router DB Premium'],
  ]);

  assert.throws(
    () => parseWorkbook(wb),
    /GAMER.*ninguna opcion/i,
  );
});

test('no permite reemplazar el catálogo cuando falta una pestaña obligatoria', () => {
  const wb = octubreWorkbook();
  delete wb.Sheets.PRO;
  wb.SheetNames = wb.SheetNames.filter(name => name !== 'PRO');

  assert.throws(
    () => parseWorkbook(wb),
    /PRO.*hoja obligatoria/i,
  );
});
