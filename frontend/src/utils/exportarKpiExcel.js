/**
 * EXPORTAR KPI COMERCIAL A EXCEL — con el formato de gerencia
 *
 * Replica la hoja "METAS NOVONET" del archivo
 * "FORMATO CONTROL SEMANAL VENTAS INFORMACION COMERCIAL ERP ASESORES NOVONET":
 * mismas columnas, mismo orden, encabezados de dos filas (Pto / Real),
 * subtotal "SUPERVISOR: X" al final de cada grupo y TOTAL al final.
 *
 * Sirve para NOVONET y VELSA (lo usa TablaKpiComercial.jsx).
 *
 * Formato de datos que recibe (el mismo de GET /api/kpi-comercial):
 *   - conteos: leads_total, leads_gestion, descarte_n, ingresos_crm, ...
 *   - reales % vienen 0-100  (pct_efect_vs_leads = 23.5)
 *   - metas  % vienen 0-1    (meta_pct_efect_leads = 0.23)
 * En el Excel todo % se escribe como fracción con formato 0% (igual al modelo).
 *
 * Las filas de SUPERVISOR y TOTAL llevan fórmulas (SUMA y divisiones, como el
 * modelo) con el resultado ya calculado, para que se vean bien incluso en
 * visores que no recalculan (WhatsApp, vista previa de correo, celular).
 *
 * exceljs se carga bajo demanda (import dinámico) para no engordar el bundle.
 */

// ── Paleta tomada del Excel modelo ───────────────────────────────────────────
const C = {
  negro: 'FF000000',
  rojo: 'FFFF0000',
  verde: 'FF00B050',
  ambar: 'FFC65911',
  grisHdr: 'FFEDEDED',   // "% Leads Gestionables vs Totales"
  verdeBanda: 'FFC1F0C8', // "ACUMULADO MES"
  celeste: 'FFC0E6F5',    // filas SUPERVISOR / TOTAL
  celeste2: 'FFDCE9F5',   // bloque TC / 3ra edad / planes en filas de subtotal
};
const FUENTE = 'Aptos Narrow';
const FMT_NUM = '_ * #,##0_ ;_ * \\-#,##0_ ;_ * "-"??_ ;_ @_ ';
const FMT_INT = '#,##0';
const FMT_PCT = '0%';

const MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO',
  'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];

const n = (v) => Number(v || 0);
const div = (a, b) => (n(b) > 0 ? n(a) / n(b) : 0);

// ── Columnas en el MISMO orden y posición que el modelo (A..BE) ──────────────
// k: tipo de celda
//   'idx'  número de fila        'txt' texto libre     'nombre' asesor
//   'num'  conteo (Real)         'mnum' meta conteo (Pto)
//   'pct'  % real (0-100)        'mpct' meta % (0-1)
//   'dif'  Ingresos Jot − CRM
// sub: cómo se calcula en fila SUPERVISOR/TOTAL → 'sum' | ['div', num, den] | 'meta' | 'dif'
// Estados del backoffice (columnas "STATUS DE CADA RAZÓN"). Mismas claves
// est_* que ESTADOS_BO en backend/src/controllers/kpiComercial.controller.js.
// null = columna en blanco (pedido de gerencia, AQ).
const ESTADOS_BO = [
  ['est_activo', 'ACTIVO'], ['est_asignado', 'ASIGNADO'], ['est_preservicio', 'PRESERVICIO'],
  ['est_preplanificado', 'PREPLANIFICADO'], ['est_fin_gestion', 'FIN DE GESTIÓN'],
  ['est_desiste', 'DESISTE DEL SERVICIO'], [null, ''], ['est_factible', 'FACTIBLE'],
  ['est_detenido', 'DETENIDO'], ['est_anulado', 'ANULADO'], ['est_duplicado', 'DUPLICADO'],
  ['est_en_verificacion', 'EN VERIFICACION'], ['est_venta_perdida', 'VENTA PERDIDA OTRO ASESOR'],
  ['est_rechazado', 'RECHAZADO'], ['est_replanificado', 'REPLANIFICADO'],
  ['est_sin_estado', 'SIN ESTADO'], ['est_eliminado', 'ELIMINADO'],
  ['est_zona_peligrosa', 'ZONA PELIGROSA'], ['est_fiscalizacion', 'FISCALIZACION'],
  ['est_incorte', 'INCORTE'], ['est_otros', 'OTROS'],
];
// Letra de columna Excel a partir de su número (1 = A)
const letra = (num) => { let t = ''; while (num > 0) { const m = (num - 1) % 26; t = String.fromCharCode(65 + m) + t; num = Math.floor((num - 1) / 26); } return t; };
const COL_INI_ESTADOS = 37; // AK
const COL_FIN_ESTADOS = COL_INI_ESTADOS + ESTADOS_BO.length - 1;
const ULTIMA_COL = letra(COL_FIN_ESTADOS);

const COLS = [
  { L: 'A',  k: 'idx',   w: 4 },
  { L: 'B',  k: 'txt',   w: 11.2, h: 'CODIGO ASESOR' },
  { L: 'C',  k: 'txt',   w: 19.3, h: 'OBSERVACION TRABAJO' },
  { L: 'D',  k: 'nombre',w: 38,   h: 'ASESOR' },
  { L: 'E',  k: 'mnum',  w: 9.5,  f: 'meta_leads_total',     sub: 'sum' },
  { L: 'F',  k: 'num',   w: 9.5,  f: 'leads_total',          sub: 'sum' },
  { L: 'G',  k: 'mnum',  w: 9.5,  f: 'meta_leads_gestion',   sub: 'sum' },
  { L: 'H',  k: 'num',   w: 9.5,  f: 'leads_gestion',        sub: 'sum' },
  { L: 'I',  k: 'pct',   w: 12,   f: 'pct_gestion_vs_total', sub: ['div', 'H', 'F'] },
  { L: 'J',  k: 'mpct',  w: 8,    f: 'meta_pct_efect_leads', sub: 'meta' },
  { L: 'K',  k: 'pct',   w: 8,    f: 'pct_efect_vs_leads',   sub: ['div', 'U', 'F'], meta: 'J' },
  { L: 'L',  k: 'mpct',  w: 8,    f: 'meta_pct_efect_gestion', sub: 'meta' },
  { L: 'M',  k: 'pct',   w: 9.8,  f: 'pct_efect_vs_gestion', sub: ['div', 'U', 'H'], meta: 'L' },
  { L: 'N',  k: 'pct',   w: 10,   f: 'pct_efectividad_efectiva', sub: ['divn', 'ingresos_jot_efectivo', 'H'] },
  { L: 'O',  k: 'pct',   w: 10,   f: 'pct_efectividad_acida',    sub: ['divn', 'ingresos_jot_acido', 'H'] },
  { L: 'P',  k: 'mpct',  w: 8,    f: 'meta_pct_descarte',    sub: 'meta' },
  { L: 'Q',  k: 'num',   w: 12.5, f: 'descarte_n',           sub: 'sum' },
  { L: 'R',  k: 'pct',   w: 9,    f: 'pct_descarte',         sub: ['div', 'Q', 'H'], meta: 'P', invertido: true },
  { L: 'S',  k: 'num',   w: 9.5,  f: 'ingresos_crm',         sub: 'sum' },
  { L: 'T',  k: 'mnum',  w: 9.5,  f: 'meta_ingresos_jot',    sub: 'sum' },
  { L: 'U',  k: 'num',   w: 9.5,  f: 'ingresos_jot',         sub: 'sum' },
  { L: 'V',  k: 'dif',   w: 11.5,   sub: 'dif' },
  { L: 'W',  k: 'num',   w: 8.5,  f: 'activa_mes',           sub: 'sum' },
  { L: 'X',  k: 'num',   w: 8.5,  f: 'activas_backlog',      sub: 'sum' },
  { L: 'Y',  k: 'mnum',  w: 9.5,  f: 'meta_activas_totales', sub: 'sum' },
  { L: 'Z',  k: 'num',   w: 9.5,  f: 'activas_totales',      sub: 'sum' },
  { L: 'AA', k: 'mpct',  w: 8,    f: 'meta_pct_tasa_activacion', sub: 'meta' },
  { L: 'AB', k: 'pct',   w: 8,    f: 'pct_tasa_activacion',  sub: ['div', 'Z', 'U'], meta: 'AA' },
  { L: 'AC', k: 'mpct',  w: 8.5,  f: 'meta_pct_tarjeta',     sub: 'meta' },
  { L: 'AD', k: 'pct',   w: 8.5,  f: 'pct_tarjeta',          sub: ['divn', 'tarjeta_n', 'U'], meta: 'AC' },
  { L: 'AE', k: 'mpct',  w: 8.5,  f: 'meta_pct_tercera_edad', sub: 'meta' },
  { L: 'AF', k: 'pct',   w: 8.5,  f: 'pct_tercera_edad',     sub: ['divn', 'tercera_edad_n', 'U'], meta: 'AE' },
  { L: 'AG', k: 'mpct',  w: 8.5,  f: 'meta_pct_planes',      sub: 'meta' },
  { L: 'AH', k: 'pct',   w: 8.5,  f: 'pct_planes_150_200',   sub: ['divn', 'planes_150_200_n', 'U'], meta: 'AG' },
  { L: 'AI', k: 'num',   w: 10,   f: 'por_regularizar',      sub: 'sum' },
  { L: 'AJ', k: 'vacio', w: 2 },
  ...ESTADOS_BO.map(([f, h], i) => (f
    ? { L: letra(COL_INI_ESTADOS + i), k: 'num', w: 10, f, sub: 'sum', h }
    : { L: letra(COL_INI_ESTADOS + i), k: 'vacio', w: 6, h, borde: true })),
];
const COL = Object.fromEntries(COLS.map((c) => [c.L, c]));

// Encabezados: [rango fila 7, texto, opciones]. Pto/Real van en la fila 8.
const HEAD7 = [
  ['B7:B8', 'CODIGO ASESOR'],
  ['C7:C8', 'OBSERVACION TRABAJO'],
  ['D7:D8', 'ASESOR'],
  ['E7:F7', 'N Leads Total'],
  ['G7:H7', 'N Leads Gestion.'],
  ['I7:I8', '% Leads Gestionables vs Totales', { fill: C.grisHdr, sz: 8 }],
  ['J7:K7', 'Efectividad vs Leads Totales'],
  ['L7:M7', 'Efectividad vs Leads Gestion.'],
  ['N7:N8', 'EFECTIVIDAD EFECTIVA', { sz: 9 }],
  ['O7:O8', 'EFECTIVIDAD ÁCIDA', { sz: 9 }],
  ['P7:R7', 'Descarte %'],
  ['S7:S8', 'Ingresos CRM'],
  ['T7:U7', 'Ingresos Totales Jotform Acum Mes'],
  ['V7:V8', 'Diferencia CRM vs Jot', { fill: C.rojo }],
  ['W7:W8', 'ACTIVA MES', { sz: 8 }],
  ['X7:X8', 'ACTIVAS BACK.', { sz: 8 }],
  ['Y7:Z7', 'ACTIVAS TOTALES'],
  ['AA7:AB7', 'TASA ACTIVACIÓN'],
  ['AC7:AC8', 'TC Pto', { sz: 9, b: false }],
  ['AD7:AD8', 'TC Real', { sz: 9, b: false }],
  ['AE7:AE8', '3rda Edad PTO', { sz: 9, b: false }],
  ['AF7:AF8', '3rda Edad REAL', { sz: 9, b: false }],
  ['AG7:AG8', 'PTO Planes 150, 200', { sz: 9, b: false }],
  ['AH7:AH8', 'REAL Planes 150, 200', { sz: 9, b: false }],
  ['AI7:AI8', 'POR REGULARIZAR', { sz: 9, b: false }],
  [`AK7:${ULTIMA_COL}7`, 'STATUS DE CADA RAZÓN'],
];
const HEAD8 = { E: 'Pto', F: 'Real', G: 'Pto', H: 'Real', J: 'Pto', K: 'Real', L: 'Pto', M: 'Real',
  P: 'Pto', Q: 'N. DESCARTE', R: 'Real', T: 'Pto', U: 'Real', Y: 'Pto', Z: 'Real', AA: 'Pto', AB: 'Real' };

// Valor más frecuente (> 0) de una meta %. Las metas % son iguales para todo
// el equipo; el backend no las trae en la fila de supervisor/total.
const moda = (filas, campo) => {
  const cuenta = new Map();
  for (const f of filas) {
    const v = n(f[campo]);
    if (v > 0) cuenta.set(v, (cuenta.get(v) || 0) + 1);
  }
  let mejor = 0, veces = 0;
  for (const [v, c] of cuenta) if (c > veces) { mejor = v; veces = c; }
  return mejor;
};

// Semáforo igual al del ERP: verde cumple, ámbar 80-100%, rojo < 80%.
const colorSemaforo = (col, real, meta) => {
  if (!meta) return C.negro;
  const ratio = real / meta;
  if (col.invertido) return ratio <= 1 ? C.verde : ratio <= 1.2 ? C.ambar : C.rojo;
  return ratio >= 1 ? C.verde : ratio >= 0.8 ? C.ambar : C.rojo;
};

const fmtFecha = (iso) => {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
};

// ─────────────────────────────────────────────────────────────────────────────
export async function exportarKpiExcel({
  titulo = 'KPI POR ASESOR',
  filas = [],
  total = null,
  agrupado = false,
  divisorMeta = 1,
  empresa,
  // Filas de donde tomar las metas % cuando `filas` no las trae (tabla por
  // supervisor: el backend solo manda metas % a nivel asesor).
  filasMeta = null,
  fechaDesde,
  fechaHasta,
}) {
  const ExcelJS = (await import('exceljs')).default;

  const emp = (empresa || String(total?.nombre || '').replace(/^TOTAL\s+/i, '') || 'NOVONET').toUpperCase();
  const refFecha = fechaDesde ? new Date(`${String(fechaDesde).slice(0, 10)}T12:00:00`) : new Date();
  const mesTxt = `${MESES[refFecha.getMonth()]} ${refFecha.getFullYear()}`;

  // Metas % comunes (para filas de supervisor/total y para la cabecera "Meta %")
  const metasPct = {};
  for (const c of COLS) if (c.k === 'mpct') metasPct[c.f] = moda(filas, c.f) || moda(filasMeta || [], c.f) || n(total?.[c.f]);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'ERP Novo-Velsa';
  wb.created = new Date();
  const hoja = `${titulo} ${emp}`.replace(/[\\/?*[\]:]/g, '').slice(0, 31);
  const ws = wb.addWorksheet(hoja, {
    views: [{ state: 'frozen', xSplit: 4, ySplit: 8, showGridLines: false, zoomScale: 90 }],
    pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      margins: { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } },
  });
  ws.properties.defaultRowHeight = 15;
  COLS.forEach((c, i) => { ws.getColumn(i + 1).width = c.w; });

  const font = (o = {}) => ({ name: FUENTE, size: 11, color: { argb: C.negro }, ...o });
  const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
  const thin = { style: 'thin' };
  const medium = { style: 'medium' };

  // ── Títulos (filas 2-6) ────────────────────────────────────────────────────
  ws.getCell('D2').value = `${titulo} — ${emp}`;
  ws.getCell('D2').font = font({ bold: true, size: 14 });
  ws.getCell('D4').value = `METAS MES DE ${mesTxt}`;
  ws.getCell('D4').font = font({ bold: true });
  ws.getRow(4).height = 18;
  if (fechaDesde && fechaHasta) {
    ws.getCell('D5').value = `Periodo: ${fmtFecha(fechaDesde)} al ${fmtFecha(fechaHasta)}`;
    ws.getCell('D5').font = font({ size: 10, italic: true });
  }
  if (divisorMeta > 1) {
    ws.getCell('E4').value = `Meta diaria = meta mensual ÷ ${divisorMeta} días operativos`;
    ws.getCell('E4').font = font({ size: 9, italic: true });
  }

  ws.mergeCells('E6:AB6');
  const banda = ws.getCell('E6');
  banda.value = divisorMeta > 1 ? 'ACUMULADO DÍA' : 'ACUMULADO MES';
  banda.font = font({ bold: true });
  banda.alignment = { horizontal: 'center', vertical: 'middle' };
  banda.fill = fill(C.verdeBanda);
  banda.border = { left: thin, right: thin, top: thin, bottom: thin };

  ws.getCell('AC5').value = 'Meta %';
  ws.getCell('AC5').font = font({ size: 9, bold: true });
  for (const [L, campo] of [['AC', 'meta_pct_tarjeta'], ['AE', 'meta_pct_tercera_edad'], ['AG', 'meta_pct_planes']]) {
    const c = ws.getCell(`${L}6`);
    c.value = metasPct[campo] || null;
    c.numFmt = FMT_PCT;
    c.font = font({ size: 9, bold: true });
    c.alignment = { horizontal: 'center' };
    c.border = { bottom: thin, left: L === 'AC' ? thin : undefined, right: L === 'AG' ? thin : undefined };
  }

  // ── Encabezado (filas 7-8) ─────────────────────────────────────────────────
  ws.getRow(7).height = 32;
  ws.getRow(8).height = 30; // los nombres de estado van en dos líneas
  for (const [rango, texto, o = {}] of HEAD7) {
    const [a, b] = rango.split(':');
    ws.mergeCells(rango);
    const c = ws.getCell(a);
    c.value = rango === 'D7:D8' && !agrupado ? 'SUPERVISOR' : texto;
    c.font = font({ bold: o.b !== false, size: o.sz || 10 });
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    if (o.fill) c.fill = fill(o.fill);
    // bordes del bloque completo
    const r1 = 7, r2 = Number(b.match(/\d+/)[0]);
    const cIni = COLS.findIndex((x) => x.L === a.replace(/\d+/, ''));
    const cFin = COLS.findIndex((x) => x.L === b.replace(/\d+/, ''));
    for (let r = r1; r <= 8; r++) {
      for (let ci = cIni; ci <= cFin; ci++) {
        const cell = ws.getCell(`${COLS[ci].L}${r}`);
        cell.border = {
          top: r === 7 ? medium : undefined,
          bottom: r === 8 || r === r2 ? medium : undefined,
          left: ci === cIni ? thin : undefined,
          right: ci === cFin ? thin : undefined,
        };
      }
    }
  }
  for (const [L, texto] of Object.entries(HEAD8)) {
    const c = ws.getCell(`${L}8`);
    c.value = texto;
    c.font = font({ bold: true, size: L === 'Q' ? 9 : 11 });
    c.alignment = { horizontal: 'center', vertical: 'middle' };
    if (L === 'Q') c.fill = fill(C.rojo);
    c.border = { ...c.border, bottom: medium };
  }
  // Fila 8 del bloque de estados: un nombre por columna
  for (const col of COLS.slice(COL_INI_ESTADOS - 1)) {
    const c = ws.getCell(`${col.L}8`);
    c.value = col.h || null;
    c.font = font({ bold: true, size: 8 });
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    c.border = { left: thin, right: thin, bottom: medium };
  }

  // ── Escritura de filas ─────────────────────────────────────────────────────
  const valorReal = (col, f) => {
    switch (col.k) {
      case 'num':  return Math.round(n(f[col.f]));
      case 'mnum': return divisorMeta > 1 ? n(f[col.f]) / divisorMeta : n(f[col.f]);
      case 'pct':  return n(f[col.f]) / 100;
      case 'mpct': return n(f[col.f]) || metasPct[col.f] || 0;
      case 'dif':  return n(f.ingresos_jot) - n(f.ingresos_crm);
      default:     return null;
    }
  };

  const estiloBase = (cell, col, { bold = false, bg = null, bordeGrueso = false } = {}) => {
    cell.font = font({ bold });
    if (bg) cell.fill = fill(bg);
    cell.border = {
      left: thin, right: thin,
      top: bordeGrueso ? medium : thin,
      bottom: bordeGrueso ? medium : thin,
    };
    if (col.k === 'num' || col.k === 'dif') cell.numFmt = FMT_INT;
    if (col.k === 'mnum') cell.numFmt = FMT_NUM;
    if (col.k === 'pct' || col.k === 'mpct') cell.numFmt = FMT_PCT;
    if (col.k === 'pct' || col.k === 'mpct' || col.k === 'num' || col.k === 'mnum' || col.k === 'dif') {
      cell.alignment = { horizontal: 'right' };
    }
  };

  const colorear = (cell, col, real, meta, bold) => {
    if (col.k === 'dif') { cell.font = font({ bold: true, color: { argb: C.rojo } }); return; }
    if (col.k !== 'pct' || !col.meta) return;
    const argb = colorSemaforo(col, real, meta);
    if (argb !== C.negro) cell.font = font({ bold: bold || argb === C.rojo, color: { argb } });
  };

  let fila = 9;

  const escribirFilaDato = (f, idx) => {
    const r = ws.getRow(fila);
    const vals = {};
    for (const col of COLS) {
      const cell = r.getCell(col.L);
      if (col.k === 'idx') { cell.value = idx; cell.font = font({ size: 10 }); cell.alignment = { horizontal: 'right' }; continue; }
      if (col.k === 'nombre') { cell.value = f.nombre || f.asesor_display || ''; estiloBase(cell, col); continue; }
      if (col.k === 'txt') { estiloBase(cell, col); continue; }
      if (col.k === 'vacio') { if (col.borde) cell.border = { left: thin, right: thin, top: thin, bottom: thin }; continue; }
      const v = valorReal(col, f);
      vals[col.L] = v;
      cell.value = col.k === 'dif'
        ? { formula: `U${fila}-S${fila}`, result: v }
        : v;
      estiloBase(cell, col);
    }
    for (const col of COLS) if (col.meta || col.k === 'dif') colorear(r.getCell(col.L), col, vals[col.L], vals[col.meta], false);
    fila++;
  };

  // Fila de subtotal (SUPERVISOR) o TOTAL: fórmulas estilo modelo + resultado.
  // rangos: lista de [desde, hasta] de filas de asesor que suma (para TOTAL
  // son los rangos de todos los grupos) o, si se pasa refs, suma esas filas.
  const escribirFilaResumen = (etiqueta, datos, { rangos = null, refs = null, esTotal = false }) => {
    const r = ws.getRow(fila);
    const sumaF = (L) => {
      if (refs) return refs.map((x) => `${L}${x}`).join('+') || '0';
      if (rangos && rangos.length) return `SUM(${rangos.map(([a, b]) => `${L}${a}:${L}${b}`).join(',')})`;
      return null;
    };
    const vals = {};
    // 1) valores numéricos (resultado cacheado)
    for (const col of COLS) {
      if (col.sub === 'sum') vals[col.L] = col.k === 'mnum' && divisorMeta > 1 ? n(datos[col.f]) / divisorMeta : n(datos[col.f]);
      if (col.sub === 'meta') vals[col.L] = metasPct[col.f] || 0;
    }
    vals.V = n(datos.ingresos_jot) - n(datos.ingresos_crm);
    for (const col of COLS) {
      if (Array.isArray(col.sub)) {
        const [tipo, a, b] = col.sub;
        vals[col.L] = tipo === 'div' ? div(vals[a], vals[b]) : div(datos[a], vals[b]);
      }
    }
    // 2) escribir
    for (const col of COLS) {
      const cell = r.getCell(col.L);
      const bg = ['AC', 'AD', 'AE', 'AF', 'AG', 'AH', 'AI'].includes(col.L) ? C.celeste2 : C.celeste;
      if (col.k === 'idx') continue;
      if (col.k === 'vacio') {
        if (col.borde) { cell.fill = fill(C.celeste); cell.border = { left: thin, right: thin, top: medium, bottom: medium }; }
        continue;
      }
      if (col.k === 'txt') {
        if (col.L === 'B' || col.L === 'C') { cell.border = { top: medium, bottom: medium, left: col.L === 'B' ? thin : undefined }; }
        continue;
      }
      if (col.k === 'nombre') {
        cell.value = etiqueta;
        cell.font = font({ bold: esTotal });
        cell.fill = fill(C.celeste);
        cell.border = { left: medium, top: medium, bottom: medium, right: thin };
        continue;
      }
      estiloBase(cell, col, { bold: esTotal, bg, bordeGrueso: true });
      const v = vals[col.L];
      let formula = null;
      if (col.sub === 'sum') formula = sumaF(col.L);
      else if (col.sub === 'dif') formula = `U${fila}-S${fila}`;
      else if (Array.isArray(col.sub) && col.sub[0] === 'div') {
        const [, a, b] = col.sub;
        formula = `IFERROR(${a}${fila}/${b}${fila},0)`;
      }
      // Tarjeta / 3ra edad / planes: el conteo base no está en la hoja → valor.
      cell.value = formula ? { formula, result: v } : v;
    }
    for (const col of COLS) if (col.meta || col.k === 'dif') colorear(r.getCell(col.L), col, vals[col.L], vals[col.meta], esTotal);
    r.getCell('AB').font = { ...r.getCell('AB').font, bold: true };
    r.getCell('AB').border = { ...r.getCell('AB').border, right: medium };
    fila++;
  };

  // ── Cuerpo ─────────────────────────────────────────────────────────────────
  const rangosTodos = [];
  const refsSubtotales = [];
  if (agrupado) {
    const grupos = new Map();
    for (const f of filas) {
      const k = f.supervisor || 'SIN ASIGNAR';
      if (!grupos.has(k)) grupos.set(k, []);
      grupos.get(k).push(f);
    }
    const lista = [...grupos.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    for (const [sup, hijos] of lista) {
      const desde = fila;
      hijos.forEach((h, i) => escribirFilaDato(h, i + 1));
      const hasta = fila - 1;
      rangosTodos.push([desde, hasta]);
      // Subtotal del grupo: suma de absolutos del grupo
      const acc = {};
      for (const h of hijos) for (const [k, v] of Object.entries(h)) if (typeof v === 'number' || !isNaN(Number(v))) acc[k] = (acc[k] || 0) + n(v);
      refsSubtotales.push(fila);
      escribirFilaResumen(`SUPERVISOR: ${sup}`, acc, { rangos: [[desde, hasta]] });
      fila += 2; // dos filas en blanco entre grupos, como el modelo
    }
  } else {
    const desde = fila;
    filas.forEach((f, i) => escribirFilaDato(f, i + 1));
    if (filas.length) rangosTodos.push([desde, fila - 1]);
    fila += 1;
  }

  if (total) {
    escribirFilaResumen(total.nombre || `TOTAL ${emp}`, total, {
      refs: agrupado ? refsSubtotales : null,
      rangos: agrupado ? null : rangosTodos,
      esTotal: true,
    });
  }

  if (!filas.length) {
    ws.getCell(`D${fila + 1}`).value = 'Sin datos en el rango seleccionado';
    ws.getCell(`D${fila + 1}`).font = font({ italic: true, color: { argb: 'FF808080' } });
  }

  // Nota al pie
  const nota = ws.getCell(`D${fila + 2}`);
  nota.value = `Generado desde ERP ${new Date().toLocaleString('es-EC')} · Semáforo: verde cumple meta, ámbar 80–99%, rojo < 80% (Descarte: al revés).`;
  nota.font = font({ size: 8, italic: true, color: { argb: 'FF808080' } });

  ws.pageSetup.printArea = `A1:${ULTIMA_COL}${fila + 2}`;
  ws.pageSetup.printTitlesRow = '7:8';

  // ── Descarga ───────────────────────────────────────────────────────────────
  const buffer = await wb.xlsx.writeBuffer();
  const nombre = `${titulo.replace(/\s+/g, '_')}_${emp}_${(fechaDesde || '').slice(0, 10) || new Date().toISOString().slice(0, 10)}${fechaHasta ? `_a_${String(fechaHasta).slice(0, 10)}` : ''}.xlsx`;
  if (typeof window === 'undefined') return { buffer, nombre }; // entorno de pruebas (Node)
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  return { nombre };
}

export default exportarKpiExcel;
