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
  };
}
const mesValido = (m) => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(m || ''));

const tablaCatalogoExiste = async () => {
  const { rows } = await pool.query(`SELECT to_regclass('public.comisiones_catalogo') IS NOT NULL AS ok`);
  return rows[0].ok;
};

// Mes del catálogo a usar: el último cargado que no pase del mes consultado.
async function mesCatalogo(query) {
  if (!(await tablaCatalogoExiste())) return null;
  const ref = String(query.telcosHasta || query.activacionHasta || query.jotformHasta || '').slice(0, 7);
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
const TIPO_VENTA = `CASE
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

async function listar(req, res) {
  try {
    const empresa = String(req.query.empresa || '').trim().toUpperCase();
    if (!['NOVONET', 'VELSA'].includes(empresa)) return res.status(400).json({ success: false, error: 'Empresa no valida.' });

    const values = [empresa, `JOTFORM_${empresa}`];
    const filtrosFecha = construirFiltrosFechas(req.query, values);
    if (!filtrosFecha.length) return res.status(400).json({ success: false, error: 'Selecciona al menos un rango de fechas.' });

    const buscar = String(req.query.buscar || '').trim();
    let filtroGlobal = '';
    if (buscar) {
      values.push(`%${buscar}%`);
      filtroGlobal = `AND (to_jsonb(e)::text || ' ' || COALESCE(u.usuario, '') || ' ' || COALESCE(u.nombres, '') || ' ' || COALESCE(u.apellidos, '') || ' ' || COALESCE(u.codigo_vendedor, '')) ILIKE $${values.length}`;
    }

    // Mientras el mes está en curso todos se calculan con el tramo "menor a 35".
    const mes = await mesCatalogo(req.query);
    let catalogo = `SELECT NULL::text AS tipo, NULL::int AS velocidad, NULL::int AS n_servicios, NULL::numeric AS com WHERE false`;
    if (mes) {
      values.push(mes);
      catalogo = `SELECT tipo, velocidad, n_servicios, MAX(com_t1) AS com
        FROM public.comisiones_catalogo WHERE activo AND mes = $${values.length}
        GROUP BY tipo, velocidad, n_servicios`;
    }

    const codigo = `COALESCE(NULLIF(BTRIM(u.codigo_vendedor), ''), NULLIF(BTRIM(e.codigo_asesor), ''), 'SIN CODIGO')`;
    const usuario = `COALESCE(NULLIF(BTRIM(e.usuario), ''), NULLIF(BTRIM(u.usuario), ''), NULLIF(BTRIM(CONCAT_WS(' ', u.nombres, u.apellidos)), ''), 'SIN ASIGNAR')`;
    const { rows } = await pool.query(`
      WITH ventas AS (
        SELECT ${codigo} AS codigo, ${usuario} AS usuario,
          public.parse_fecha_flex(e.fecha_ingreso_telcos::text)::date AS fecha_telcos,
          ${REG_NORM} AS reg,
          ${TIPO_VENTA} AS tipo,
          ${VELOCIDAD_VENTA} AS velocidad,
          ${SERVICIOS_VENTA} AS n_servicios
        FROM public.envios_ventas e
        LEFT JOIN public.usuarios u ON u.id = e.usuario_id
        WHERE UPPER(BTRIM(COALESCE(e.distribuidor_autorizado, ''))) = $1
          AND e.origen_dato IN ($2, 'ERP')
          AND e.estatus_envio IS DISTINCT FROM 'BORRADOR'
          AND ${ESTADO_ACTIVO}
          AND ${filtrosFecha.join('\n          AND ')}
          ${filtroGlobal}
      ), cat AS (${catalogo})
      SELECT MAX(v.codigo) AS codigo_asesor, v.usuario AS usuario,
        MAX(v.fecha_telcos) AS ultima_fecha_ingreso_telcos,
        COUNT(*) FILTER (WHERE v.reg = 'PORREGULARIZAR')::int AS activas_por_regularizar,
        COUNT(*) FILTER (WHERE v.reg = 'REGULARIZADO')::int AS activas_regularizadas,
        COUNT(*)::int AS activas_totales,
        ROUND(COALESCE(SUM(c.com), 0), 2)::float AS valor_total,
        ROUND(COALESCE(SUM(c.com) FILTER (WHERE v.reg = 'REGULARIZADO'), 0), 2)::float AS valor_disponible,
        COUNT(*) FILTER (WHERE c.com IS NULL)::int AS sin_valor
      FROM ventas v
      LEFT JOIN LATERAL (
        SELECT cat.com FROM cat
         WHERE cat.tipo = v.tipo AND cat.velocidad = v.velocidad
         ORDER BY ABS(cat.n_servicios - v.n_servicios), cat.n_servicios
         LIMIT 1
      ) c ON true
      GROUP BY v.usuario
      ORDER BY activas_regularizadas DESC, activas_totales DESC, usuario, codigo_asesor
    `, values);

    const suma = (k) => rows.reduce((a, r) => a + Number(r[k] || 0), 0);
    const totales = {
      activas_por_regularizar: suma('activas_por_regularizar'),
      activas_regularizadas: suma('activas_regularizadas'),
      activas_totales: suma('activas_totales'),
      valor_total: Math.round(suma('valor_total') * 100) / 100,
      valor_disponible: Math.round(suma('valor_disponible') * 100) / 100,
      sin_valor: suma('sin_valor'),
    };
    return res.json({ success: true, data: { empresa, filas: rows, totales, mes_catalogo: mes, tramo: 'MENOR A 35', filtros: req.query } });
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
  if (!filas.length) return res.status(400).json({ success: false, error: 'Ninguna fila tiene TIPO, VELOCIDAD y COM MENOR A 35.' });
  if (!(await tablaCatalogoExiste().catch(() => false))) {
    return res.status(409).json({ success: false, error: 'Falta crear la tabla comisiones_catalogo (ejecutar COMISIONES_CATALOGO.sql).' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE public.comisiones_catalogo SET activo = false WHERE mes = $1 AND activo', [mes]);
    const usuario = req.user?.usuario || null;
    for (const f of filas) {
      await client.query(`
        INSERT INTO public.comisiones_catalogo
          (mes, tipo, velocidad, n_servicios, plan, servicios, nombre_erp, com_t1, com_t2, com_t3, impulso, bono_tc, cargado_por)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [mes, f.tipo, f.velocidad, f.n_servicios, f.plan, f.servicios, f.nombre_erp, f.com_t1, f.com_t2, f.com_t3, f.impulso, f.bono_tc, usuario]);
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

module.exports = {
  listar, catalogoResumen, catalogoCargar,
  _test: { fechaIso, validarRangoOpcional, construirFiltrosFechas, contarServicios, normalizarFilaCatalogo, mesValido },
};
