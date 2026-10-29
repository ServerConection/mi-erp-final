// Lee el Excel del catálogo de comisiones y devuelve las filas listas para
// POST /api/comisiones/catalogo. Acepta dos formatos:
//  1) Pestaña "CATALOGOS DE PLANES" (formato oficial NOVONET): bloques por tipo
//     con CONDICIÓN 35 / <=40 / >=41, valor, Bono TC y Consideración.
//     Se agrupa por TIPO + VELOCIDAD: com_t1 = "hasta 41" (columna "hasta las 40" del Excel), com_t2 = "42 en adelante",
//     com_t3 = valor por venta del asegurado (35), categoria = Consideración.
//  2) Formato anterior (hoja con columnas TIPO ... COM MENOR A 35).
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toUpperCase().replace(/[°º]/g, '').replace(/\s+/g, ' ').trim();

const TIPOS = new Set(['HOME', 'TERCERA EDAD', 'PRO', 'PYME', 'GAMER']);

const COLUMNAS = {
  tipo: ['TIPO'],
  plan: ['PLAN'],
  velocidad: ['VELOCIDAD MBPS', 'VELOCIDAD'],
  servicios: ['SERVICIOS ADICIONALES', 'SERVICIOS'],
  nombre_erp: ['NOMBRE ERP'],
  com_t1: ['COM MENOR A 35'],
  com_t2: ['COM DE 36 A 41'],
  com_t3: ['COM DE 42 EN ADELANTE'],
  impulso: ['IMPULSO ARPU'],
  bono_tc: ['BONO TC'],
};

export function filasDesdeMatriz(matriz) {
  const iHead = matriz.findIndex((fila) => {
    const h = (fila || []).map(norm);
    return h.includes('TIPO') && h.includes('COM MENOR A 35');
  });
  if (iHead < 0) return null;
  const head = matriz[iHead].map(norm);
  const idx = Object.fromEntries(Object.entries(COLUMNAS).map(([k, alias]) => [k, head.findIndex((h) => alias.includes(h))]));
  const filas = [];
  for (const fila of matriz.slice(iHead + 1)) {
    const o = {};
    for (const [k, i] of Object.entries(idx)) o[k] = i >= 0 ? (fila?.[i] ?? null) : null;
    if (String(o.tipo ?? '').trim()) filas.push(o);
  }
  return filas;
}

// "Plan 850 Mbps", "PRO 250 MEGAS", "GAMER LITE 550 Mbps", "Plan 2 Gbps" -> Mbps
export function velocidadDesdeTexto(texto) {
  const m = norm(texto).match(/(\d+(?:[.,]\d+)?)\s*(GBPS|GB|MBPS|MEGAS|MB)/);
  if (!m) return null;
  const n = Number(m[1].replace(',', '.'));
  return Math.round(m[2].startsWith('G') ? n * 1000 : n);
}

const numero = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[$\s]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

const CONDICION = (v) => {
  const c = norm(v).replace(/\s/g, '');
  if (c === '35') return 't3';
  if (c === '<=40') return 't1';
  if (c === '>=41') return 't2';
  return null;
};

// Formato oficial: la cabecera de cada bloque trae TIPO, PLAN..., CONDICIÓN, valor, Bono TC, Consideración.
export function filasDesdeCatalogoPlanes(matriz) {
  let cab = null;
  const grupos = new Map();
  for (const fila of matriz) {
    const h = (fila || []).map(norm);
    const iCond = h.indexOf('CONDICION');
    if (iCond >= 0) {
      const iTipo = h.findIndex((x) => x.startsWith('TIPO'));
      const iPlan = h.findIndex((x, i) => i > iTipo && (x.startsWith('PLAN') || x === 'PLANES CASA'));
      cab = {
        tipo: iTipo, plan: iPlan, cond: iCond,
        valor: h.findIndex((x) => x.startsWith('HASTA LAS') || x.startsWith('A PARTIR DE')),
        bono: h.indexOf('BONO TC'),
        cons: h.indexOf('CONSIDERACION'),
      };
      continue;
    }
    if (!cab || cab.tipo < 0 || cab.plan < 0 || cab.valor < 0) continue;
    const tipo = norm(fila?.[cab.tipo]);
    const tramo = CONDICION(fila?.[cab.cond]);
    const velocidad = velocidadDesdeTexto(fila?.[cab.plan]);
    const valor = numero(fila?.[cab.valor]);
    if (!TIPOS.has(tipo) || !tramo || !velocidad || valor === null) continue;
    const k = `${tipo}|${velocidad}`;
    if (!grupos.has(k)) grupos.set(k, { tipo, velocidad, t1: null, t2: null, t3: null, bono: null, cons: {} });
    const g = grupos.get(k);
    if (g[tramo] === null) g[tramo] = valor;
    const bono = cab.bono >= 0 ? numero(fila?.[cab.bono]) : null;
    if (bono !== null) g.bono = Math.max(g.bono ?? 0, bono);
    const cons = cab.cons >= 0 ? String(fila?.[cab.cons] ?? '').trim() : '';
    if (cons) g.cons[cons] = (g.cons[cons] || 0) + 1;
  }
  if (!grupos.size) return null;
  return [...grupos.values()]
    .filter((g) => g.t1 !== null)
    .map((g) => ({
      tipo: g.tipo,
      velocidad: g.velocidad,
      plan: `${g.tipo} ${g.velocidad} Mbps`,
      servicios: '',
      com_t1: g.t1,
      com_t2: g.t2,
      com_t3: g.t3,
      bono_tc: g.bono,
      // La consideración más repetida entre los empaquetados de ese plan
      categoria: Object.entries(g.cons).sort((a, b) => b[1] - a[1])[0]?.[0] || null,
    }));
}

export function filasDesdeLibro(XLSX, libro) {
  const matrices = libro.SheetNames.map((nombre) => [nombre,
    XLSX.utils.sheet_to_json(libro.Sheets[nombre], { header: 1, defval: null, raw: true })]);
  for (const [nombre, matriz] of matrices) {
    const filas = filasDesdeCatalogoPlanes(matriz);
    if (filas?.length) return { hoja: nombre, filas, formato: 'CATALOGOS DE PLANES' };
  }
  for (const [nombre, matriz] of matrices) {
    const filas = filasDesdeMatriz(matriz);
    if (filas) return { hoja: nombre, filas, formato: 'ANTERIOR' };
  }
  return null;
}
