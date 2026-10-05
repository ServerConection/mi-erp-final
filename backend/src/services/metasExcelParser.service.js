// src/services/metasExcelParser.service.js
// ============================================================================
// Lee una hoja de METAS del Excel mensual de gerencia
// ("INFORMACION COMERCIAL ERP ASESORES NOVONET Y VELSA <MES>.xlsx").
//
// Estructura esperada (hojas "METAS NOVONET <MES>" / "METAS VELSA <MES>"):
//   - Una fila de encabezados con "ASESOR", "N Leads Total", "N Leads Gestion.",
//     "Efectividad vs Leads Totales", ... y debajo "Pto | Real".
//   - Filas de ASESOR: columna A con un numero de orden.
//   - Fila de SUPERVISOR (subtotal del equipo): columna A vacia, debajo de sus asesores.
//   - Fila "TOTAL <EMPRESA>": total de la empresa.
//   - Fila "Meta %" arriba con % Tarjeta / % 3ra Edad / % Planes 150-200.
//
// Las columnas se ubican por el TEXTO del encabezado, no por letra, para
// tolerar que gerencia mueva columnas de un mes a otro.
// No escribe nada en la base: solo devuelve lo que leyo + avisos.
// ============================================================================

const XLSX = require('xlsx');

const sinTildes = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const normHeader = (s) => sinTildes(s).toUpperCase().replace(/[^A-Z0-9%]+/g, ' ').trim();

const num = (v) => {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = Number(String(v).replace('%', '').replace(',', '.').trim());
  return Number.isFinite(n) ? n : null;
};
// Los % del Excel vienen como fraccion (0.23). Si alguien escribe 23 -> 0.23
const pct = (v) => {
  const n = num(v);
  if (n === null) return null;
  return n > 1 ? n / 100 : n;
};
const r2 = (n) => (n === null || n === undefined ? null : Math.round(n * 100) / 100);

// Encabezado -> campo. Se evalua en orden: la primera regla que calce gana.
const REGLAS_COLUMNAS = [
  { campo: 'codigo',              test: (h) => h.includes('CODIGO') },
  { campo: 'pct_gest_vs_total',   test: (h) => h.includes('GESTIONABLES VS TOTALES') },
  { campo: 'pct_efect_gestion',   test: (h) => h.includes('EFECTIVIDAD') && h.includes('GESTION') },
  { campo: 'pct_efect_leads',     test: (h) => h.includes('EFECTIVIDAD') && h.includes('TOTAL') },
  { campo: 'leads_gestion',       test: (h) => h.includes('LEADS GESTION') },
  { campo: 'leads_total',         test: (h) => h.includes('LEADS TOTAL') },
  { campo: 'pct_descarte',        test: (h) => h.includes('DESCARTE') },
  { campo: 'ingresos_crm',        test: (h) => h.includes('INGRESOS CRM') },
  { campo: 'ingresos_jot',        test: (h) => h.includes('INGRESOS') && h.includes('JOT') },
  { campo: 'activas_mes',         test: (h) => h.startsWith('ACTIVA MES') || h === 'ACTIVAS MES' },
  { campo: 'activas_backlog',     test: (h) => h.includes('ACTIVAS BACK') },
  { campo: 'activas_totales',     test: (h) => h.includes('ACTIVAS TOTALES') },
  { campo: 'pct_tasa_activacion', test: (h) => h.includes('TASA') && (h.includes('ACTIVACION') || h.includes('INST')) },
  { campo: 'pct_tarjeta',         test: (h) => h.includes('TARJETA') },
  { campo: 'pct_tercera_edad',    test: (h) => h.includes('3RDA EDAD') || h.includes('3RA EDAD') || h.includes('TERCERA EDAD') },
  { campo: 'pct_planes_150_200',  test: (h) => h.includes('PLANES 150') },
  { campo: 'por_regularizar',     test: (h) => h.includes('REGULARIZA') },
  { campo: 'asesor',              test: (h) => h === 'ASESOR' },
];

const MESES = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];

const celda = (ws, r, c) => {
  const cell = ws[XLSX.utils.encode_cell({ r, c })];
  return cell ? cell.v : null;
};

/** Lista de hojas que parecen de metas (para el selector del frontend). */
function hojasDeMetas(wb) {
  return wb.SheetNames.map((nombre) => {
    const n = normHeader(nombre);
    return {
      nombre,
      esMetas: n.startsWith('METAS'),
      empresa: n.includes('VELSA') ? 'VELSA' : (n.includes('NOVONET') ? 'NOVONET' : null),
    };
  });
}

/**
 * Parsea una hoja de metas.
 * @returns {{ asesores, supervisores, total, pctGlobales, periodoTexto, avisos }}
 */
function parseHojaMetas(wb, hoja) {
  const ws = wb.Sheets[hoja];
  if (!ws || !ws['!ref']) throw new Error(`La hoja "${hoja}" no existe o esta vacia`);
  const rango = XLSX.utils.decode_range(ws['!ref']);
  const avisos = [];

  // 1. Fila de encabezados: la que tenga "ASESOR" y "LEADS TOTAL"
  let filaHeader = -1;
  for (let r = rango.s.r; r <= Math.min(rango.e.r, 40) && filaHeader < 0; r++) {
    const textos = [];
    for (let c = rango.s.c; c <= rango.e.c; c++) textos.push(normHeader(celda(ws, r, c)));
    if (textos.includes('ASESOR') && textos.some((t) => t.includes('LEADS TOTAL'))) filaHeader = r;
  }
  if (filaHeader < 0) throw new Error(`No encontre los encabezados (ASESOR / N Leads Total) en la hoja "${hoja}"`);

  // 2. Mapa campo -> columna. En columnas "Pto | Real" el valor Pto esta en la
  //    misma columna del encabezado (celda combinada), asi que se usa esa.
  const col = {};
  for (let c = rango.s.c; c <= rango.e.c; c++) {
    const h = normHeader(celda(ws, filaHeader, c));
    if (!h) continue;
    const regla = REGLAS_COLUMNAS.find((x) => x.test(h));
    if (regla && col[regla.campo] === undefined) col[regla.campo] = c;
  }
  // NOVONET no titula la columna de tasa de activacion: es el par "Pto|Real"
  // que sigue a ACTIVAS TOTALES. Se toma solo si debajo dice "Pto".
  if (col.pct_tasa_activacion === undefined && col.activas_totales !== undefined) {
    const c = col.activas_totales + 2;
    if (!normHeader(celda(ws, filaHeader, c)) && normHeader(celda(ws, filaHeader + 1, c)) === 'PTO') {
      col.pct_tasa_activacion = c;
    }
  }
  for (const req of ['asesor', 'leads_total', 'leads_gestion', 'ingresos_jot', 'activas_totales']) {
    if (col[req] === undefined) throw new Error(`Falta la columna "${req}" en la hoja "${hoja}"`);
  }

  // 3. % globales (fila "Meta %": valores sobre Tarjeta / 3ra edad / Planes)
  const pctGlobales = {};
  for (const campo of ['pct_tarjeta', 'pct_tercera_edad', 'pct_planes_150_200']) {
    if (col[campo] === undefined) continue;
    for (let r = filaHeader - 1; r >= Math.max(rango.s.r, filaHeader - 4); r--) {
      const v = pct(celda(ws, r, col[campo]));
      if (v !== null) { pctGlobales[campo] = v; break; }
    }
  }

  // 4. Texto de periodo ("METAS MES DE SEPTIEMBRE 2026") -> solo para avisar
  let periodoTexto = null;
  for (let r = rango.s.r; r < filaHeader && !periodoTexto; r++) {
    for (let c = rango.s.c; c <= rango.e.c; c++) {
      const t = normHeader(celda(ws, r, c));
      if (t.includes('METAS MES')) { periodoTexto = t; break; }
    }
  }

  // 5. Filas de datos
  const leerMetricas = (r) => ({
    leads_total:         r2(num(celda(ws, r, col.leads_total))),
    leads_gestion:       r2(num(celda(ws, r, col.leads_gestion))),
    ingresos_jot:        r2(num(celda(ws, r, col.ingresos_jot))),
    activas_totales:     r2(num(celda(ws, r, col.activas_totales))),
    pct_efect_leads:     col.pct_efect_leads     !== undefined ? pct(celda(ws, r, col.pct_efect_leads))     : null,
    pct_efect_gestion:   col.pct_efect_gestion   !== undefined ? pct(celda(ws, r, col.pct_efect_gestion))   : null,
    pct_descarte:        col.pct_descarte        !== undefined ? pct(celda(ws, r, col.pct_descarte))        : null,
    pct_tasa_activacion: col.pct_tasa_activacion !== undefined ? pct(celda(ws, r, col.pct_tasa_activacion)) : null,
  });

  const asesores = [];
  const supervisores = [];
  let total = null;
  let pendientes = [];          // asesores del bloque actual, esperando su fila de supervisor

  for (let r = filaHeader + 2; r <= rango.e.r; r++) {
    const orden = celda(ws, r, rango.s.c);                 // columna A
    const nombreRaw = celda(ws, r, col.asesor);
    const nombre = String(nombreRaw ?? '').replace(/\s+/g, ' ').trim();
    if (!nombre) continue;
    const codigoRaw = col.codigo !== undefined ? celda(ws, r, col.codigo) : null;
    const codigo = codigoRaw === null || codigoRaw === undefined ? null : String(codigoRaw).trim().toUpperCase();
    const nNorm = normHeader(nombre);

    if (nNorm.startsWith('TOTAL')) {
      total = { nombre, fila: r + 1, ...leerMetricas(r) };
      continue;
    }

    if (typeof orden === 'number' || /^\d+$/.test(String(orden ?? '').trim())) {
      // Codigo valido = 3+ digitos con letras opcionales (4486, 4068LK).
      const codigoValido = codigo && /^\d{3,}[A-Z]{0,4}$/.test(codigo) ? codigo : null;
      // En VELSA el nombre viene con el codigo pegado: "4068LK GEOVANNY ..."
      let nombreLimpio = nombre;
      const m = nombre.match(/^(\d{3,}[A-Za-z]{0,4})\s+(.*)$/);
      if (m) nombreLimpio = m[2].trim();
      const fila = {
        fila: r + 1,
        orden: Number(orden),
        codigo: codigoValido || (m ? m[1].toUpperCase() : null),
        nombre_excel: nombreLimpio,
        ...leerMetricas(r),
        supervisor: null,
      };
      if (!fila.leads_total && !fila.leads_gestion && !fila.ingresos_jot) {
        avisos.push({ tipo: 'meta_cero', fila: fila.fila, msg: `${nombreLimpio}: viene con meta en 0` });
      }
      asesores.push(fila);
      pendientes.push(fila);
      continue;
    }

    // Fila sin numero de orden = subtotal de SUPERVISOR
    const nombreSup = nombre
      .replace(/^SUPERVISOR(ES)?\s*:\s*/i, '')
      .replace(/\s+TOTAL\s*$/i, '')
      .trim();
    const sup = {
      fila: r + 1,
      codigo: codigo && /^\d{3,}[A-Z]{0,4}$/.test(codigo) ? codigo : null,
      supervisor: nombreSup,
      num_asesores: pendientes.length,
      ...leerMetricas(r),
    };
    pendientes.forEach((a) => { a.supervisor = nombreSup; });

    // Validacion: el subtotal del Excel debe ser la suma de sus asesores
    for (const k of ['leads_total', 'leads_gestion', 'ingresos_jot', 'activas_totales']) {
      const suma = pendientes.reduce((s, a) => s + (a[k] || 0), 0);
      if (sup[k] !== null && Math.abs(suma - sup[k]) > 1) {
        avisos.push({ tipo: 'subtotal', fila: sup.fila,
          msg: `Equipo ${nombreSup}: ${k} del subtotal (${r2(sup[k])}) no cuadra con la suma de sus asesores (${r2(suma)})` });
      }
    }
    supervisores.push(sup);
    pendientes = [];
  }

  if (pendientes.length) {
    avisos.push({ tipo: 'sin_supervisor', msg: `${pendientes.length} asesor(es) al final de la hoja sin fila de supervisor: ${pendientes.map((a) => a.nombre_excel).join(', ')}` });
  }

  // Codigos repetidos dentro de la hoja
  const vistos = new Map();
  for (const a of asesores) {
    if (!a.codigo) continue;
    if (vistos.has(a.codigo)) avisos.push({ tipo: 'codigo_duplicado', fila: a.fila, msg: `Codigo ${a.codigo} repetido (${vistos.get(a.codigo)} y ${a.nombre_excel})` });
    else vistos.set(a.codigo, a.nombre_excel);
  }

  return { asesores, supervisores, total, pctGlobales, periodoTexto, avisos };
}

/** Devuelve el mes (1-12) que menciona el texto del periodo, o null. */
function mesDelTexto(texto) {
  if (!texto) return null;
  const i = MESES.findIndex((m) => texto.includes(m));
  return i >= 0 ? i + 1 : null;
}

module.exports = { hojasDeMetas, parseHojaMetas, mesDelTexto, MESES };
