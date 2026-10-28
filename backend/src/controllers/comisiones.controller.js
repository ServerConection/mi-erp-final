const pool = require('../config/db');

function fechaIso(valor) { return /^\d{4}-\d{2}-\d{2}$/.test(String(valor || '')); }
function validarRangoOpcional(desde, hasta) {
  if (!desde && !hasta) return true;
  return fechaIso(desde) && fechaIso(hasta) && desde <= hasta;
}
function construirFiltrosFechas(query, values) {
  const defs = [
    ['telcosDesde', 'telcosHasta', 'public.parse_fecha_flex(e.fecha_ingreso_telcos::text)'],
    ['jotformDesde', 'jotformHasta', 'public.parse_fecha_flex(e.fecha_registro_sistema::text)'],
    ['activacionDesde', 'activacionHasta', 'public.parse_fecha_flex(e.fecha_activacion_netlife::text)'],
  ];
  const filtros = [];
  for (const [kd, kh, columna] of defs) {
    const desde = String(query[kd] || ''), hasta = String(query[kh] || '');
    if (!validarRangoOpcional(desde, hasta)) {
      const error = new Error(`El rango ${kd.replace('Desde', '')} no es valido.`);
      error.status = 400; throw error;
    }
    if (desde && hasta) {
      values.push(desde, hasta);
      filtros.push(`${columna} BETWEEN $${values.length - 1}::date AND $${values.length}::date`);
    }
  }
  return filtros;
}

// ── Catálogo de comisiones ───────────────────────────────────────────────────
// Regla de negocio: el número de servicios adicionales se cuenta por los "+".
// Vacío = 0, sin "+" = 1, un "+" = 2, dos "+" = 3.
function contarServicios(texto) {
  const s = String(texto ?? '').trim();
  if (!s) return 0;
  return s.split('+').length;
}
function numero(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(/[$\s]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}
const TIPOS = new Set(['HOME', 'TERCERA EDAD', 'PRO', 'PYME', 'GAMER']);
/** Valida una fila del Excel. Devuelve la fila limpia o null si no sirve. */
function normalizarFilaCatalogo(f) {
  const tipo = String(f?.tipo ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase().replace(/\s+/g, ' ');
  const velocidad = Math.round(numero(f?.velocidad) ?? 0);
  const comT1 = numero(f?.com_t1);
  if (!TIPOS.has(tipo) || !(velocidad > 0) || comT1 === null) return null;
  const servicios = String(f?.servicios ?? '').trim();
  return {
    tipo, velocidad, servicios, n_servicios: contarServicios(servicios),
    plan: String(f?.plan ?? '').trim() || null,
    nombre_erp: String(f?.nombre_erp ?? '').trim() || null,
    com_t1: comT1, com_t2: numero(f?.com_t2), com_t3: numero(f?.com_t3),
    impulso: numero(f?.impulso), bono_tc: numero(f?.bono_tc),
    categoria: categoriaDesdeTexto(f?.categoria),
  };
}
const mesValido = (m) => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(m || ''));

// ── Modelo de pago (catálogo NOVONET, oct-2026) ─────────────────────────────
// Categoría de cada plan (columna "Consideración" del Excel):
//   TABLA     = "Suma a tabla": cuenta para llegar a las 35 del asegurado
//   PYME      = suma a tabla (regla especial >35 queda para la fase 2)
//   COMISION  = se paga por unidad y NO cuenta para el asegurado
//   NO_VENDER = no autorizado; se paga como comisión y se marca
const CATEGORIAS = new Set(['TABLA', 'PYME', 'COMISION', 'NO_VENDER']);
function categoriaDesdeTexto(texto) {
  const t = String(texto ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
  if (!t) return null;
  if (CATEGORIAS.has(t)) return t;
  if (t.includes('NO VENDER')) return 'NO_VENDER';
  if (t.includes('TABLA') && t.includes('35')) return 'PYME';
  if (t.includes('TABLA')) return 'TABLA';
  if (t.includes('COMISION')) return 'COMISION';
  return null;
}
const REGLAS = { asegurado: 550, meta: 35, desdeTramo2: 41 };
const cuentaParaAsegurado = (cat) => !cat || cat === 'TABLA' || cat === 'PYME';

/**
 * Valor de un conjunto de ventas de UN asesor.
 * ventas: [{ t1, t2, categoria }] (t1 = tabla "hasta 40", t2 = "desde 41"; null = sin tarifa)
 *  - N = ventas que suman a tabla (las de categoría COMISION / NO_VENDER no cuentan)
 *  - tramo: N >= 41 → tabla "desde 41"; si no → "hasta 40"
 *  - N >= 35 → la parte de tabla nunca baja de $550 (asegurado garantizado)
 *  - las de comisión se suman aparte con el mismo tramo
 */
function calcularValor(ventas, reglas = REGLAS) {
  const tabla = ventas.filter((v) => cuentaParaAsegurado(v.categoria));
  const directas = ventas.filter((v) => !cuentaParaAsegurado(v.categoria));
  const n = tabla.length;
  const tramo = n >= reglas.desdeTramo2 ? 2 : 1;
  const valorDe = (v) => Number((tramo === 2 ? (v.t2 ?? v.t1) : v.t1) ?? 0);
  const sumaTabla = tabla.reduce((a, v) => a + valorDe(v), 0);
  const aseguradoAplica = n >= reglas.meta;
  const valorTabla = aseguradoAplica ? Math.max(reglas.asegurado, sumaTabla) : sumaTabla;
  const valorDirecto = directas.reduce((a, v) => a + valorDe(v), 0);
  return {
    n_tabla: n, tramo, asegurado_aplica: aseguradoAplica,
    valor_tabla: valorTabla, valor_directo: valorDirecto, valor: valorTabla + valorDirecto,
  };
}

const r2 = (n) => Math.round(Number(n || 0) * 100) / 100;
const TRAMO_TXT = { 1: 'HASTA 40', 2: 'DESDE 41' };

/** Agrupa las ventas por asesor y calcula total (todas las activas) y disponible (solo REGULARIZADO). */
function calcularAsesores(ventas, reglas = REGLAS) {
  const grupos = new Map();
  for (const v of ventas) {
    if (!grupos.has(v.usuario)) grupos.set(v.usuario, []);
    grupos.get(v.usuario).push(v);
  }
  const filas = [];
  for (const [usuario, vs] of grupos) {
    const regularizadas = vs.filter((v) => v.reg === 'REGULARIZADO');
    // "SIN ASIGNAR" no es un asesor: nunca recibe asegurado ni tramo "desde 41".
    const sinAsesor = usuario === 'SIN ASIGNAR';
    const reglasGrupo = sinAsesor ? { ...reglas, meta: Infinity, desdeTramo2: Infinity } : reglas;
    const total = calcularValor(vs, reglasGrupo);
    const disp = calcularValor(regularizadas, reglasGrupo);
    const maxTxt = (k) => vs.reduce((m, v) => (v[k] && String(v[k]) > String(m || '') ? v[k] : m), null);
    filas.push({
      codigo_asesor: sinAsesor ? [...new Set(vs.map((v) => v.codigo).filter(Boolean))].join(', ') : maxTxt('codigo'), usuario, nombre_asesor: maxTxt('nombre_asesor'),
      ultima_fecha_ingreso_telcos: maxTxt('fecha_telcos'),
      ultima_fecha_activacion: maxTxt('fecha_activacion'),
      activas_por_regularizar: vs.length - regularizadas.length,
      activas_regularizadas: regularizadas.length,
      activas_totales: vs.length,
      ventas_tabla: disp.n_tabla,
      tramo: TRAMO_TXT[disp.tramo],
      asegurado_aplicado: disp.asegurado_aplica,
      valor_comision_directa: r2(disp.valor_directo),
      valor_total: r2(total.valor),
      valor_disponible: r2(disp.valor),
      sin_valor: vs.filter((v) => v.t1 === null || v.t1 === undefined).length,
      no_vender: vs.filter((v) => v.categoria === 'NO_VENDER').length,
    });
  }
  filas.sort((a, b) => b.activas_regularizadas - a.activas_regularizadas
    || b.activas_totales - a.activas_totales || String(a.usuario).localeCompare(String(b.usuario)));
  return filas;
}

const tablaCatalogoExiste = async () => {
  const { rows } = await pool.query(`SELECT to_regclass('public.comisiones_catalogo') IS NOT NULL AS ok`);
  return rows[0].ok;
};

// La columna "categoria" se agrega con COMISIONES_CATALOGO_V2.sql; sin ella todo cuenta como TABLA.
let columnaCategoria = false;
async function tieneCategoria(db = pool) {
  if (columnaCategoria) return true;
  const { rows } = await db.query(`SELECT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'comisiones_catalogo' AND column_name = 'categoria') AS ok`);
  columnaCategoria = rows[0].ok === true;
  return columnaCategoria;
}

// Mes del catálogo a usar: el último cargado que no pase del mes consultado.
async function mesCatalogo(query) {
  if (!(await tablaCatalogoExiste())) return null;
  const ref = String(query.activacionHasta || query.telcosHasta || query.jotformHasta || '').slice(0, 7);
  const { rows } = await pool.query(`
    SELECT mes FROM public.comisiones_catalogo
     WHERE activo AND ($1 = '' OR mes <= $1)
     ORDER BY mes DESC LIMIT 1`, [mesValido(ref) ? ref : '']);
  return rows[0]?.mes || null;
}

const ESTADO_ACTIVO = `REGEXP_REPLACE(TRANSLATE(UPPER(COALESCE(e.netlife_estatus_real, '')), 'ÁÉÍÓÚÜÑ', 'AEIOUUN'), '[^A-Z]', '', 'g') = 'ACTIVO'`;
const REG_NORM = `REGEXP_REPLACE(TRANSLATE(UPPER(COALESCE(e.estatus_regularizacion, '')), 'ÁÉÍÓÚÜÑ', 'AEIOUUN'), '[^A-Z]', '', 'g')`;

// Cómo se clasifica cada venta para cruzarla con el catálogo.
const PLAN_TXT = `UPPER(COALESCE(e.plan_contratado, '') || ' ' || COALESCE(e.plan_contratado_final, ''))`;
const TIPO_BASE = `UPPER(BTRIM(TRANSLATE(COALESCE(e.plan_contratado, ''), 'ÁÉÍÓÚ', 'AEIOU')))`;
const TIPO_VENTA = `CASE
      WHEN ${TIPO_BASE} IN ('HOME', 'TERCERA EDAD', 'PRO', 'PYME', 'GAMER') THEN ${TIPO_BASE}
      WHEN ${PLAN_TXT} LIKE '%GAMER%' THEN 'GAMER'
      WHEN ${PLAN_TXT} LIKE '%TERCERA%' OR ${PLAN_TXT} LIKE '%ADULTO%'
        OR UPPER(BTRIM(COALESCE(e.aplica_descuento_3ra_edad, ''))) LIKE 'SI%' THEN 'TERCERA EDAD'
      WHEN ${PLAN_TXT} LIKE '%PYME%' THEN 'PYME'
      WHEN UPPER(BTRIM(COALESCE(e.plan_contratado, ''))) LIKE 'PRO%' OR ${PLAN_TXT} LIKE '%PRO %MEGAS%' THEN 'PRO'
      ELSE 'HOME' END`;
const VEL_TXT = `UPPER(COALESCE(NULLIF(BTRIM(e.velocidad_plan), ''), '') || ' ' || COALESCE(e.plan_contratado_final, ''))`;
const VEL_MATCH = `REGEXP_MATCH(${VEL_TXT}, '(\\d+(?:[.,]\\d+)?)\\s*(MBPS|MEGAS|MB|GBPS|GB)')`;
const VELOCIDAD_VENTA = `COALESCE(
      CASE WHEN (${VEL_MATCH})[2] LIKE 'G%'
           THEN ROUND(REPLACE((${VEL_MATCH})[1], ',', '.')::numeric * 1000)
           ELSE ROUND(REPLACE((${VEL_MATCH})[1], ',', '.')::numeric) END,
      (REGEXP_MATCH(${VEL_TXT}, '(\\d{3,4})'))[1]::numeric)::int`;
const SERVICIOS_VENTA = `CASE WHEN NULLIF(BTRIM(e.servicios_digitales), '') IS NULL THEN 0
      ELSE LENGTH(e.servicios_digitales) - LENGTH(REPLACE(e.servicios_digitales, '+', '')) + 1 END`;

const error400 = (mensaje) => { const e = new Error(mensaje); e.status = 400; return e; };

/** Cálculo de comisiones por asesor (lo usan Comisiones, Billetera y Rol de Pagos). */
async function calcularComisiones(query) {
    const empresa = String(query.empresa || '').trim().toUpperCase();
    if (!['NOVONET', 'VELSA'].includes(empresa)) throw error400('Empresa no valida.');

    const values = [empresa, `JOTFORM_${empresa}`];
    const filtrosFecha = construirFiltrosFechas(query, values);
    if (!filtrosFecha.length) throw error400('Selecciona al menos un rango de fechas.');

    const buscar = String(query.buscar || '').trim();
    let filtroGlobal = '';
    if (buscar) {
      values.push(`%${buscar}%`);
      filtroGlobal = `AND (to_jsonb(e)::text || ' ' || COALESCE(u.usuario, '') || ' ' || COALESCE(u.nombres, '') || ' ' || COALESCE(u.apellidos, '') || ' ' || COALESCE(u.codigo_vendedor, '')) ILIKE $${values.length}`;
    }

    // Tarifa = TIPO + VELOCIDAD (igual que el Excel). com_t1 = tabla "hasta 40", com_t2 = "desde 41".
    const mes = await mesCatalogo(query);
    let catalogo = `SELECT NULL::text AS tipo, NULL::int AS velocidad, NULL::numeric AS t1, NULL::numeric AS t2, NULL::text AS categoria WHERE false`;
    if (mes) {
      values.push(mes);
      const cat = (await tieneCategoria()) ? 'MAX(categoria)' : 'NULL::text';
      catalogo = `SELECT tipo, velocidad, MAX(com_t1) AS t1, MAX(com_t2) AS t2, ${cat} AS categoria
        FROM public.comisiones_catalogo WHERE activo AND mes = $${values.length}
        GROUP BY tipo, velocidad`;
    }

    const codigo = `COALESCE(NULLIF(BTRIM(u.codigo_vendedor), ''), NULLIF(BTRIM(e.codigo_asesor), ''), 'SIN CODIGO')`;
    // Ventas del histórico JotForm no traen usuario_id: se resuelve el asesor por su código de vendedor (uc).
    const usuario = `COALESCE(NULLIF(BTRIM(e.usuario), ''), NULLIF(BTRIM(u.usuario), ''), NULLIF(BTRIM(uc.usuario), ''),
      NULLIF(BTRIM(CONCAT_WS(' ', u.nombres, u.apellidos)), ''), NULLIF(BTRIM(CONCAT_WS(' ', uc.nombres, uc.apellidos)), ''),
      'COD ' || NULLIF(BTRIM(e.codigo_asesor), ''), 'SIN ASIGNAR')`;
    const { rows: ventas } = await pool.query(`
      WITH ventas AS (
        SELECT ${codigo} AS codigo, ${usuario} AS usuario,
          COALESCE(NULLIF(BTRIM(CONCAT_WS(' ', u.nombres, u.apellidos)), ''), NULLIF(BTRIM(CONCAT_WS(' ', uc.nombres, uc.apellidos)), ''), ${usuario}) AS nombre_asesor,
          public.parse_fecha_flex(e.fecha_ingreso_telcos::text)::date AS fecha_telcos,
          public.parse_fecha_flex(e.fecha_activacion_netlife::text)::date AS fecha_activacion,
          ${REG_NORM} AS reg,
          ${TIPO_VENTA} AS tipo,
          ${VELOCIDAD_VENTA} AS velocidad
        FROM public.envios_ventas e
        LEFT JOIN public.usuarios u ON u.id = e.usuario_id
        LEFT JOIN LATERAL (
          SELECT u2.usuario, u2.nombres, u2.apellidos
            FROM public.usuarios u2
           WHERE u.id IS NULL
             AND NULLIF(BTRIM(e.codigo_asesor), '') IS NOT NULL
             AND UPPER(BTRIM(COALESCE(u2.codigo_vendedor, ''))) = UPPER(BTRIM(e.codigo_asesor))
             AND UPPER(COALESCE(u2.empresa, '')) LIKE '%' || $1 || '%'
           ORDER BY u2.activo DESC NULLS LAST, u2.id DESC
           LIMIT 1
        ) uc ON true
        WHERE UPPER(BTRIM(COALESCE(e.distribuidor_autorizado, ''))) = $1
          AND e.origen_dato IN ($2, 'ERP')
          AND e.estatus_envio IS DISTINCT FROM 'BORRADOR'
          AND ${ESTADO_ACTIVO}
          AND ${filtrosFecha.join('\n          AND ')}
          ${filtroGlobal}
      ), cat AS (${catalogo})
      SELECT v.codigo, v.usuario, v.nombre_asesor, to_char(v.fecha_telcos, 'YYYY-MM-DD') AS fecha_telcos,
             to_char(v.fecha_activacion, 'YYYY-MM-DD') AS fecha_activacion, v.reg,
             c.t1::float AS t1, c.t2::float AS t2, c.categoria
      FROM ventas v
      LEFT JOIN cat c ON c.tipo = v.tipo AND c.velocidad = v.velocidad
    `, values);

    // Solo REGULARIZADO se paga (disponible); valor total = si todas sus activas se regularizan.
    const rows = calcularAsesores(ventas);
    const suma = (k) => rows.reduce((a, r) => a + Number(r[k] || 0), 0);
    const totales = {
      activas_por_regularizar: suma('activas_por_regularizar'),
      activas_regularizadas: suma('activas_regularizadas'),
      activas_totales: suma('activas_totales'),
      valor_total: r2(suma('valor_total')),
      valor_disponible: r2(suma('valor_disponible')),
      sin_valor: suma('sin_valor'),
      no_vender: suma('no_vender'),
      con_asegurado: rows.filter((r) => r.asegurado_aplicado).length,
    };
    return { empresa, filas: rows, totales, mes_catalogo: mes, reglas: REGLAS, filtros: query };
}

async function listar(req, res) {
  try {
    return res.json({ success: true, data: await calcularComisiones(req.query) });
  } catch (error) {
    if (error.status === 400) return res.status(400).json({ success: false, error: error.message });
    console.error('[comisiones.listar]', error);
    return res.status(500).json({ success: false, error: 'No se pudo calcular las comisiones.' });
  }
}

// GET /api/comisiones/catalogo -> meses cargados
async function catalogoResumen(req, res) {
  try {
    if (!(await tablaCatalogoExiste())) return res.json({ success: true, data: { tabla: false, meses: [] } });
    const { rows } = await pool.query(`
      SELECT mes, COUNT(*)::int AS filas, MAX(cargado_por) AS cargado_por, MAX(cargado_en) AS cargado_en
        FROM public.comisiones_catalogo WHERE activo GROUP BY mes ORDER BY mes DESC LIMIT 12`);
    return res.json({ success: true, data: { tabla: true, meses: rows } });
  } catch (error) {
    console.error('[comisiones.catalogoResumen]', error);
    return res.status(500).json({ success: false, error: 'No se pudo leer el catálogo.' });
  }
}

// POST /api/comisiones/catalogo { mes: 'YYYY-MM', filas: [...] }
// No borra nada: lo anterior del mismo mes queda activo = false.
async function catalogoCargar(req, res) {
  const mes = String(req.body?.mes || '');
  if (!mesValido(mes)) return res.status(400).json({ success: false, error: 'Mes no valido (formato AAAA-MM).' });
  const entrada = Array.isArray(req.body?.filas) ? req.body.filas : [];
  if (!entrada.length || entrada.length > 5000) return res.status(400).json({ success: false, error: 'El archivo no trae filas validas.' });
  const filas = entrada.map(normalizarFilaCatalogo).filter(Boolean);
  if (!filas.length) return res.status(400).json({ success: false, error: 'Ninguna fila tiene TIPO, VELOCIDAD y valor de comisión.' });
  if (!(await tablaCatalogoExiste().catch(() => false))) {
    return res.status(409).json({ success: false, error: 'Falta crear la tabla comisiones_catalogo (ejecutar COMISIONES_CATALOGO.sql).' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE public.comisiones_catalogo SET activo = false WHERE mes = $1 AND activo', [mes]);
    const usuario = req.user?.usuario || null;
    const conCategoria = await tieneCategoria(client);
    for (const f of filas) {
      const cols = ['mes', 'tipo', 'velocidad', 'n_servicios', 'plan', 'servicios', 'nombre_erp', 'com_t1', 'com_t2', 'com_t3', 'impulso', 'bono_tc', 'cargado_por'];
      const vals = [mes, f.tipo, f.velocidad, f.n_servicios, f.plan, f.servicios, f.nombre_erp, f.com_t1, f.com_t2, f.com_t3, f.impulso, f.bono_tc, usuario];
      if (conCategoria) { cols.push('categoria'); vals.push(f.categoria); }
      await client.query(
        `INSERT INTO public.comisiones_catalogo (${cols.join(', ')}) VALUES (${vals.map((_, i) => `$${i + 1}`).join(',')})`,
        vals);
    }
    await client.query('COMMIT');
    return res.json({ success: true, data: { mes, cargadas: filas.length, omitidas: entrada.length - filas.length } });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[comisiones.catalogoCargar]', error);
    return res.status(500).json({ success: false, error: 'No se pudo guardar el catálogo.' });
  } finally {
    client.release();
  }
}


// ── Rol de pagos (formato "FORMATO DE ROL DE COMISIONES" del Excel) ─────────
// Conceptos AUTO se calculan; el resto se ingresa en el módulo y se guarda en
// public.rol_pagos_ajustes (ROL_PAGOS_AJUSTES.sql). Un ajuste guardado sobre un
// concepto AUTO lo reemplaza; borrar el valor vuelve al cálculo automático.
const ROL_CONCEPTOS = [
  { clave: 'asegurado',          lado: 'ingreso',   etiqueta: 'Asegurado',                              auto: true },
  { clave: 'comision_total',     lado: 'ingreso',   etiqueta: 'Comisión total (solo regularizadas)',    auto: true },
  { clave: 'bono_tc',            lado: 'ingreso',   etiqueta: 'Pago de tarjetas de crédito recaudadas' },
  { clave: 'incentivos',         lado: 'ingreso',   etiqueta: 'Incentivos' },
  { clave: 'asegurado_pagado',   lado: 'descuento', etiqueta: 'Asegurado pagado',                       auto: true },
  { clave: 'chargeback',         lado: 'descuento', etiqueta: 'Chargeback' },
  { clave: 'calidad_venta',      lado: 'descuento', etiqueta: 'Descuentos por calidad de venta' },
  { clave: 'adelantos',          lado: 'descuento', etiqueta: 'Adelantos' },
  { clave: 'retencion',          lado: 'descuento', etiqueta: 'Retención 8%' },
  { clave: 'atrasos',            lado: 'descuento', etiqueta: 'Atrasos' },
  { clave: 'anticipo_40',        lado: 'descuento', etiqueta: 'Anticipo pago 40%',                      auto: true },
  { clave: 'plan_celular',       lado: 'descuento', etiqueta: 'Plan celular',                           auto: true },
];
const ROL_CLAVES = new Set(ROL_CONCEPTOS.map((c) => c.clave));
const ROL_REGLAS = { anticipo: 0.4, plan_celular: 8.4 };

/** Arma el rol de un asesor a partir de su fila de comisiones y sus ajustes { clave: monto }. */
function armarRol(fila, ajustes = {}, reglas = REGLAS) {
  const comision = Number(fila.valor_disponible || 0);
  const asegurado = fila.asegurado_aplicado ? reglas.asegurado : 0;
  const auto = {
    asegurado,
    comision_total: comision,
    asegurado_pagado: asegurado,
    anticipo_40: r2(comision * ROL_REGLAS.anticipo),
    plan_celular: ROL_REGLAS.plan_celular,
  };
  const conceptos = ROL_CONCEPTOS.map((c) => {
    const manual = ajustes[c.clave];
    const tieneManual = manual !== undefined && manual !== null;
    const valor = tieneManual ? Number(manual) : (c.auto ? auto[c.clave] : 0);
    return { ...c, valor: r2(valor), automatico: c.auto && !tieneManual, ajustado: tieneManual };
  });
  const total = (lado) => r2(conceptos.filter((c) => c.lado === lado).reduce((a, c) => a + c.valor, 0));
  const ingresos = total('ingreso'), descuentos = total('descuento');
  return {
    usuario: fila.usuario, nombre_asesor: fila.nombre_asesor, codigo_asesor: fila.codigo_asesor,
    ventas_activas: fila.activas_regularizadas, activas_totales: fila.activas_totales,
    tramo: fila.tramo, asegurado_aplicado: fila.asegurado_aplicado,
    conceptos, total_ingresos: ingresos, total_descuentos: descuentos, valor_a_pagar: r2(ingresos - descuentos),
  };
}

const tablaRolExiste = async () => {
  const { rows } = await pool.query(`SELECT to_regclass('public.rol_pagos_ajustes') IS NOT NULL AS ok`);
  return rows[0].ok;
};
const rangoDeMes = (mes) => {
  const [y, m] = mes.split('-').map(Number);
  const hoy = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Guayaquil' }));
  const fin = (hoy.getFullYear() === y && hoy.getMonth() + 1 === m) ? hoy.getDate() : new Date(y, m, 0).getDate();
  return { desde: `${mes}-01`, hasta: `${mes}-${String(fin).padStart(2, '0')}` };
};

// GET /api/comisiones/rol?empresa=NOVONET&mes=2026-10
async function rolListar(req, res) {
  try {
    const mes = String(req.query.mes || '');
    if (!mesValido(mes)) return res.status(400).json({ success: false, error: 'Mes no valido (formato AAAA-MM).' });
    const r = rangoDeMes(mes);
    const data = await calcularComisiones({ empresa: req.query.empresa, activacionDesde: r.desde, activacionHasta: r.hasta });
    const tabla = await tablaRolExiste().catch(() => false);
    const ajustes = new Map();
    if (tabla) {
      const { rows } = await pool.query(
        `SELECT usuario, concepto, monto::float AS monto FROM public.rol_pagos_ajustes WHERE empresa = $1 AND mes = $2`,
        [data.empresa, mes]);
      for (const a of rows) {
        if (!ajustes.has(a.usuario)) ajustes.set(a.usuario, {});
        ajustes.get(a.usuario)[a.concepto] = a.monto;
      }
    }
    const roles = data.filas
      .filter((f) => f.usuario !== 'SIN ASIGNAR')
      .map((f) => armarRol(f, ajustes.get(f.usuario), data.reglas));
    const suma = (k) => r2(roles.reduce((a, x) => a + x[k], 0));
    return res.json({ success: true, data: {
      empresa: data.empresa, mes, tabla_ajustes: tabla, mes_catalogo: data.mes_catalogo,
      roles, totales: { total_ingresos: suma('total_ingresos'), total_descuentos: suma('total_descuentos'), valor_a_pagar: suma('valor_a_pagar') },
    } });
  } catch (error) {
    if (error.status === 400) return res.status(400).json({ success: false, error: error.message });
    console.error('[comisiones.rolListar]', error);
    return res.status(500).json({ success: false, error: 'No se pudo armar el rol de pagos.' });
  }
}

// PUT /api/comisiones/rol/ajuste { empresa, mes, usuario, concepto, monto }  (monto null = volver a automático)
async function rolAjuste(req, res) {
  try {
    const empresa = String(req.body?.empresa || '').trim().toUpperCase();
    const mes = String(req.body?.mes || '');
    const usuario = String(req.body?.usuario || '').trim();
    const concepto = String(req.body?.concepto || '');
    if (!['NOVONET', 'VELSA'].includes(empresa) || !mesValido(mes) || !usuario || !ROL_CLAVES.has(concepto)) {
      return res.status(400).json({ success: false, error: 'Datos del ajuste no validos.' });
    }
    const crudo = req.body?.monto;
    const monto = crudo === null || crudo === undefined || crudo === '' ? null : numero(crudo);
    if (crudo !== null && crudo !== undefined && crudo !== '' && monto === null) {
      return res.status(400).json({ success: false, error: 'El monto no es un número.' });
    }
    if (!(await tablaRolExiste().catch(() => false))) {
      return res.status(409).json({ success: false, error: 'Falta crear la tabla rol_pagos_ajustes (ejecutar ROL_PAGOS_AJUSTES.sql).' });
    }
    await pool.query(`
      INSERT INTO public.rol_pagos_ajustes (empresa, mes, usuario, concepto, monto, actualizado_por, actualizado_en)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      ON CONFLICT (empresa, mes, usuario, concepto)
      DO UPDATE SET monto = EXCLUDED.monto, actualizado_por = EXCLUDED.actualizado_por, actualizado_en = NOW()`,
      [empresa, mes, usuario, concepto, monto, req.user?.usuario || null]);
    return res.json({ success: true, data: { empresa, mes, usuario, concepto, monto } });
  } catch (error) {
    console.error('[comisiones.rolAjuste]', error);
    return res.status(500).json({ success: false, error: 'No se pudo guardar el ajuste.' });
  }
}

module.exports = {
  listar, catalogoResumen, catalogoCargar, rolListar, rolAjuste,
  _test: { fechaIso, validarRangoOpcional, construirFiltrosFechas, contarServicios, normalizarFilaCatalogo, mesValido,
    categoriaDesdeTexto, calcularValor, calcularAsesores, REGLAS, armarRol, ROL_CONCEPTOS },
};
