const XLSX = require('xlsx');

const IVA = 0.15;

class CatalogoInvalidoError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CatalogoInvalidoError';
    this.statusCode = 422;
  }
}

const limpiar = (value) => String(value ?? '').replace(/\s+/g, ' ').replace(/\*/g, '').trim();
const normalizar = (value) => limpiar(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toUpperCase();
const num = (value) => (value === null || value === undefined || value === '' || Number.isNaN(Number(value)))
  ? null
  : Number(value);
const round2 = (value) => value == null ? null : Math.round((value + Number.EPSILON) * 100) / 100;

function opcionesDe(texto) {
  const value = limpiar(texto);
  if (!value) return [];
  return value.split(/\s+[oO]\s+/).map(limpiar).filter(Boolean);
}

function basePlanHome(nombre) {
  const value = limpiar(nombre);
  const match = value.match(/^(Plan\s+\d+\s*Mbps)/i);
  return {
    base: match ? match[1].replace(/\s+/g, ' ') : value,
    tieneParamount: /paramount/i.test(value),
  };
}

function filas(ws) {
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
}

function buscarEncabezado(rows, predicado, hoja) {
  const limite = Math.min(rows.length, 12);
  for (let rowIndex = 0; rowIndex < limite; rowIndex += 1) {
    const headers = rows[rowIndex].map(normalizar);
    if (predicado(headers)) return { rowIndex, headers };
  }
  throw new Error(`${hoja}: no se encontraron los encabezados obligatorios`);
}

function columna(headers, matcher, hoja, etiqueta, desde = 0) {
  const index = headers.findIndex((header, i) => i >= desde && matcher(header));
  if (index === -1) throw new Error(`${hoja}: faltan encabezados obligatorios (${etiqueta})`);
  return index;
}

function valor(row, index) {
  return index == null || index < 0 ? null : row[index];
}

function equipoConBeneficio(equipo, beneficio) {
  return [limpiar(equipo), limpiar(beneficio)].filter(Boolean).join(' + ') || null;
}

function expandirHome({ tipoPlan, nombre, adicionales, precioSinIva, precioConIva, promos, velocidad, promocion, equipo }) {
  const { base, tieneParamount } = basePlanHome(nombre);
  const alternativas = opcionesDe(adicionales);
  const etiquetas = alternativas.length ? alternativas : [tieneParamount ? 'Paramount+' : 'Sin empaquetado'];
  const sufijo = tieneParamount && alternativas.length ? ' + Paramount' : '';
  const sinIva = round2(num(precioSinIva));
  const conIva = round2(num(precioConIva) ?? (sinIva != null ? sinIva * (1 + IVA) : null));

  return etiquetas.map(etiqueta => ({
    tipo_plan: tipoPlan,
    plan_base: base,
    empaquetado: `${etiqueta}${sufijo}`,
    velocidad: limpiar(velocidad) || null,
    plan_promocion: limpiar(promocion) || null,
    equipo: equipo || null,
    precio_sin_iva: sinIva,
    precio_con_iva: conIva,
    ...promos,
  }));
}

function parseHome(ws) {
  const rows = filas(ws);
  const { rowIndex, headers } = buscarEncabezado(rows, h => h.includes('PLANES CASA') && h.some(x => x === 'SUBTOTAL'), 'HOME');
  const plan = columna(headers, h => h === 'PLANES CASA', 'HOME', 'PLANES CASA');
  const velocidad = columna(headers, h => h === 'VELOCIDAD', 'HOME', 'VELOCIDAD');
  const equipo = columna(headers, h => h.startsWith('EQUIPO'), 'HOME', 'EQUIPO');
  const adicionales = columna(headers, h => h.startsWith('SERVICIOS ADICIONALES'), 'HOME', 'SERVICIOS ADICIONALES');
  const promocion = columna(headers, h => h.startsWith('PLAN PROMOCION'), 'HOME', 'PLAN PROMOCION');
  const subtotal = columna(headers, h => h === 'SUBTOTAL', 'HOME', 'SUBTOTAL');
  const precioConIva = headers.findIndex(h => h === 'PRECIO CON IVA');
  const tcDsto = columna(headers, h => h.includes('DSTO CON TC'), 'HOME', '% DSTO CON TC');
  const tcFacturas = columna(headers, h => h.startsWith('FACTURAS PROMOCION'), 'HOME', 'FACTURAS TC', tcDsto);
  const tcPvp = columna(headers, h => h === 'PVP CON PROMOCION', 'HOME', 'PVP TC', tcDsto);
  const ctaDsto = columna(headers, h => h.includes('DSTO CON CTA'), 'HOME', '% DSTO CON CTA');
  const ctaFacturas = columna(headers, h => h.startsWith('FACTURAS PROMOCION'), 'HOME', 'FACTURAS CTA', ctaDsto);
  const ctaPvp = columna(headers, h => h === 'PVP CON PROMOCION', 'HOME', 'PVP CTA', ctaDsto);
  const beneficio = headers.findIndex(h => h.startsWith('BENEFICIO EXTRA'));

  return rows.slice(rowIndex + 1).flatMap(row => {
    if (!/^plan/i.test(limpiar(valor(row, plan)))) return [];
    return expandirHome({
      tipoPlan: 'HOME',
      nombre: valor(row, plan),
      adicionales: valor(row, adicionales),
      precioSinIva: valor(row, subtotal),
      precioConIva: valor(row, precioConIva),
      velocidad: valor(row, velocidad),
      promocion: valor(row, promocion),
      equipo: equipoConBeneficio(valor(row, equipo), valor(row, beneficio)),
      promos: {
        tc_dsto: num(valor(row, tcDsto)),
        tc_facturas: num(valor(row, tcFacturas)),
        tc_pvp: round2(num(valor(row, tcPvp))),
        cta_dsto: num(valor(row, ctaDsto)),
        cta_facturas: num(valor(row, ctaFacturas)),
        cta_pvp: round2(num(valor(row, ctaPvp))),
      },
    });
  });
}

function parseTerceraEdad(ws) {
  const rows = filas(ws);
  const { rowIndex, headers } = buscarEncabezado(rows, h => h.includes('PLANES CASA') && h.some(x => x.includes('PRECIO SIN IVA')), 'TERCERA EDAD');
  const plan = columna(headers, h => h === 'PLANES CASA', 'TERCERA EDAD', 'PLANES CASA');
  const velocidad = columna(headers, h => h === 'VELOCIDAD', 'TERCERA EDAD', 'VELOCIDAD');
  const equipo = columna(headers, h => h.startsWith('EQUIPO'), 'TERCERA EDAD', 'EQUIPO');
  const adicionales = columna(headers, h => h.startsWith('SERVICIOS ADICIONALES'), 'TERCERA EDAD', 'SERVICIOS ADICIONALES');
  const promocion = columna(headers, h => h.startsWith('PLAN PROMOCION'), 'TERCERA EDAD', 'PLAN PROMOCION');
  const precioSinIva = columna(headers, h => h === 'PRECIO SIN IVA', 'TERCERA EDAD', 'PRECIO SIN IVA');
  const precioConIva = columna(headers, h => h === 'PRECIO CON IVA', 'TERCERA EDAD', 'PRECIO CON IVA', precioSinIva);
  const beneficio = headers.findIndex(h => h.startsWith('BENEFICIO EXTRA'));

  return rows.slice(rowIndex + 1).flatMap(row => {
    if (!/^plan/i.test(limpiar(valor(row, plan)))) return [];
    return expandirHome({
      tipoPlan: 'TERCERA EDAD',
      nombre: valor(row, plan),
      adicionales: valor(row, adicionales),
      precioSinIva: valor(row, precioSinIva),
      precioConIva: valor(row, precioConIva),
      velocidad: valor(row, velocidad),
      promocion: valor(row, promocion),
      equipo: equipoConBeneficio(valor(row, equipo), valor(row, beneficio)),
      promos: {},
    });
  });
}

function parseGamer(ws) {
  const rows = filas(ws);
  const { rowIndex, headers } = buscarEncabezado(rows, h => h.includes('PLAN GAMER') && h.includes('SUBTOTAL'), 'GAMER');
  const plan = columna(headers, h => h === 'PLAN GAMER', 'GAMER', 'PLAN GAMER');
  const incluido = columna(headers, h => h.includes('GOLDEN FEATURES'), 'GAMER', 'GOLDEN FEATURES');
  const subtotal = columna(headers, h => h === 'SUBTOTAL', 'GAMER', 'SUBTOTAL');
  const total = columna(headers, h => h === 'TOTAL', 'GAMER', 'TOTAL');
  const equipo = columna(headers, h => h.includes('ROUTER'), 'GAMER', 'ROUTER');

  return rows.slice(rowIndex + 1).flatMap(row => {
    if (!/gamer/i.test(limpiar(valor(row, plan)))) return [];
    const sinIva = round2(num(valor(row, subtotal)));
    return [{
      tipo_plan: 'GAMER',
      plan_base: limpiar(valor(row, plan)),
      empaquetado: 'Sin empaquetado',
      velocidad: null,
      plan_promocion: limpiar(valor(row, incluido)) || null,
      equipo: limpiar(valor(row, equipo)) || null,
      precio_sin_iva: sinIva,
      precio_con_iva: round2(num(valor(row, total)) ?? (sinIva != null ? sinIva * (1 + IVA) : null)),
    }];
  });
}

function parsePro(ws) {
  const rows = filas(ws);
  const { rowIndex, headers } = buscarEncabezado(rows, h => h.includes('PLANES') && h.some(x => x === 'SUBTOTAL'), 'PRO');
  const plan = columna(headers, h => h === 'PLANES', 'PRO', 'PLANES');
  const velocidad = columna(headers, h => h === 'VELOCIDAD', 'PRO', 'VELOCIDAD');
  const incluidos = columna(headers, h => h.startsWith('SERVICIOS IN'), 'PRO', 'SERVICIOS INCLUIDOS');
  const promocion = columna(headers, h => h.startsWith('PLAN PROMOCION'), 'PRO', 'PLAN PROMOCION');
  const subtotal = columna(headers, h => h === 'SUBTOTAL', 'PRO', 'SUBTOTAL');
  const total = columna(headers, h => h === 'PRECIO TOTAL', 'PRO', 'PRECIO TOTAL');
  const equipo = columna(headers, h => h === 'WIFI', 'PRO', 'WIFI');

  return rows.slice(rowIndex + 1).flatMap(row => {
    if (!/^pro/i.test(limpiar(valor(row, plan)))) return [];
    const sinIva = round2(num(valor(row, subtotal)));
    return [{
      tipo_plan: 'PRO',
      plan_base: limpiar(valor(row, plan)),
      empaquetado: limpiar(valor(row, incluidos)) || 'Sin empaquetado',
      velocidad: limpiar(valor(row, velocidad)) || null,
      plan_promocion: limpiar(valor(row, promocion)) || null,
      equipo: limpiar(valor(row, equipo)) || null,
      precio_sin_iva: sinIva,
      precio_con_iva: round2(num(valor(row, total)) ?? (sinIva != null ? sinIva * (1 + IVA) : null)),
    }];
  });
}

function parsePyme(ws) {
  const rows = filas(ws);
  const { rowIndex, headers } = buscarEncabezado(rows, h => h.includes('PLANES') && h.some(x => x === 'SUBTOTAL'), 'PYME');
  const plan = columna(headers, h => h === 'PLANES', 'PYME', 'PLANES');
  const velocidad = columna(headers, h => h === 'VELOCIDAD', 'PYME', 'VELOCIDAD');
  const incluidos = columna(headers, h => h.startsWith('OPCIONES INCLUIDAS YA'), 'PYME', 'OPCIONES INCLUIDAS');
  const personalizacion = columna(headers, h => h.startsWith('OPCIONES INCLUIDAS DE PERSONALIZACION'), 'PYME', 'OPCIONES DE PERSONALIZACION');
  const subtotal = columna(headers, h => h === 'SUBTOTAL', 'PYME', 'SUBTOTAL');
  const total = columna(headers, h => h === 'PRECIO TOTAL', 'PYME', 'PRECIO TOTAL');
  const equipo = columna(headers, h => h === 'WIFI', 'PYME', 'WIFI');

  return rows.slice(rowIndex + 1).flatMap(row => {
    if (!/^plan/i.test(limpiar(valor(row, plan)))) return [];
    const sinIva = round2(num(valor(row, subtotal)));
    const empaquetado = [limpiar(valor(row, incluidos)), limpiar(valor(row, personalizacion))].filter(Boolean).join(' + ') || 'Sin empaquetado';
    return [{
      tipo_plan: 'PYME',
      plan_base: limpiar(valor(row, plan)),
      empaquetado,
      velocidad: limpiar(valor(row, velocidad)) || null,
      plan_promocion: null,
      equipo: limpiar(valor(row, equipo)) || null,
      precio_sin_iva: sinIva,
      precio_con_iva: round2(num(valor(row, total)) ?? (sinIva != null ? sinIva * (1 + IVA) : null)),
    }];
  });
}

const PARSERS = {
  HOME: parseHome,
  'TERCERA EDAD': parseTerceraEdad,
  GAMER: parseGamer,
  PRO: parsePro,
  PYME: parsePyme,
};

function parseWorkbook(workbook) {
  const registros = [];
  const resumen = {};
  for (const [hoja, parser] of Object.entries(PARSERS)) {
    const nombreReal = workbook.SheetNames.find(name => normalizar(name) === hoja);
    if (!nombreReal) {
      throw new CatalogoInvalidoError(`${hoja}: falta la hoja obligatoria`);
    }
    const parsed = parser(workbook.Sheets[nombreReal]);
    if (parsed.length === 0) {
      throw new CatalogoInvalidoError(`${hoja}: no se encontro ninguna opcion de plan`);
    }
    resumen[hoja] = `${parsed.length} opciones`;
    registros.push(...parsed);
  }
  return { registros, resumen };
}

module.exports = { parseWorkbook, CatalogoInvalidoError };
