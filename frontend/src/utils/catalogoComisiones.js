// Lee el Excel del catálogo de comisiones (hoja con columnas TIPO ... COM MENOR A 35).
// Devuelve las filas listas para POST /api/comisiones/catalogo.
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toUpperCase().replace(/[°º]/g, '').replace(/\s+/g, ' ').trim();

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

export function filasDesdeLibro(XLSX, libro) {
  for (const nombre of libro.SheetNames) {
    const matriz = XLSX.utils.sheet_to_json(libro.Sheets[nombre], { header: 1, defval: null, raw: true });
    const filas = filasDesdeMatriz(matriz);
    if (filas) return { hoja: nombre, filas };
  }
  return null;
}
