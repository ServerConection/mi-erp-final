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

const ESTADO_ACTIVO = `REGEXP_REPLACE(TRANSLATE(UPPER(COALESCE(e.netlife_estatus_real, '')), 'ÁÉÍÓÚÜÑ', 'AEIOUUN'), '[^A-Z]', '', 'g') = 'ACTIVO'`;
const REG_NORM = `REGEXP_REPLACE(TRANSLATE(UPPER(COALESCE(e.estatus_regularizacion, '')), 'ÁÉÍÓÚÜÑ', 'AEIOUUN'), '[^A-Z]', '', 'g')`;

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

    const codigo = `COALESCE(NULLIF(BTRIM(e.codigo_asesor), ''), NULLIF(BTRIM(u.codigo_vendedor), ''), 'SIN CODIGO')`;
    const usuario = `COALESCE(NULLIF(BTRIM(e.usuario), ''), NULLIF(BTRIM(u.usuario), ''), NULLIF(BTRIM(CONCAT_WS(' ', u.nombres, u.apellidos)), ''), 'SIN ASIGNAR')`;
    const { rows } = await pool.query(`
      SELECT ${codigo} AS codigo_asesor, ${usuario} AS usuario,
        MAX(public.parse_fecha_flex(e.fecha_ingreso_telcos::text))::date AS ultima_fecha_ingreso_telcos,
        COUNT(*) FILTER (WHERE ${REG_NORM} = 'PORREGULARIZAR')::int AS activas_por_regularizar,
        COUNT(*) FILTER (WHERE ${REG_NORM} = 'REGULARIZADO')::int AS activas_regularizadas,
        COUNT(*)::int AS activas_totales
      FROM public.envios_ventas e
      LEFT JOIN public.usuarios u ON u.id = e.usuario_id
      WHERE UPPER(BTRIM(COALESCE(e.distribuidor_autorizado, ''))) = $1
        AND e.origen_dato IN ($2, 'ERP')
        AND e.estatus_envio IS DISTINCT FROM 'BORRADOR'
        AND ${ESTADO_ACTIVO}
        AND ${filtrosFecha.join('\n        AND ')}
        ${filtroGlobal}
      GROUP BY ${codigo}, ${usuario}
      ORDER BY ultima_fecha_ingreso_telcos DESC NULLS LAST, usuario, codigo_asesor
    `, values);

    const totales = rows.reduce((a, r) => ({
      activas_por_regularizar: a.activas_por_regularizar + Number(r.activas_por_regularizar || 0),
      activas_regularizadas: a.activas_regularizadas + Number(r.activas_regularizadas || 0),
      activas_totales: a.activas_totales + Number(r.activas_totales || 0),
    }), { activas_por_regularizar: 0, activas_regularizadas: 0, activas_totales: 0 });
    return res.json({ success: true, data: { empresa, filas: rows, totales, filtros: req.query } });
  } catch (error) {
    if (error.status === 400) return res.status(400).json({ success: false, error: error.message });
    console.error('[comisiones.listar]', error);
    return res.status(500).json({ success: false, error: 'No se pudo calcular las comisiones.' });
  }
}
module.exports = { listar, _test: { fechaIso, validarRangoOpcional, construirFiltrosFechas } };
