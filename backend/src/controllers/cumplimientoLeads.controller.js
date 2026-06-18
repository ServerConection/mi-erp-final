/**
 * CUMPLIMIENTO DE LEADS — NOVONET
 * Replica en vivo el reporte "CUMPLIMIENTO DE LEADS / VENTAS" que antes se
 * armaba a mano en Excel (BITRIX + BITRIX 2 + JOT + Hoja4), pero leyendo
 * directo de public.mestra_bitrix (Bitrix y Jotform NOVONET ya cruzados).
 *
 * Por asesor:
 *   LEADS GESTIONABLES            -> etapa CRM no descartable (mismo criterio
 *                                     que backofficeJotform.controller.js)
 *   VENTA DEL DÍA                 -> activaciones Netlife de HOY (fecha Ecuador)
 *   VENTA EN JOTFORM               -> activaciones Netlife dentro del rango filtrado
 *   PRESERVICIOS / SIN ESTATUS    -> estado Netlife = PRESERVICIO o sin estado
 *   FACTIBLES                     -> estado Netlife = PREFACTIBILIDAD
 *   ASIGNADAS                     -> estado Netlife = ASIGNADO
 *   PREPLANIFICADAS               -> estado Netlith = PREPLANIFICADO
 *   OBJETIVO DE GESTIONABLES      -> meta mensual editable (public.asesores_metas),
 *                                     dato de negocio que NO existe en mestra_bitrix
 *   CUMPLIMIENTO DE ENTREGA DE LEADS -> LEADS GESTIONABLES / OBJETIVO
 *
 * El vínculo asesor <-> meta es por NOMBRE normalizado porque mestra_bitrix
 * no guarda el código de ejecutivo.
 */
const pool = require('../config/db');

const ETAPAS_NO_GESTIONABLES = ['DUPLICADO', 'ATC', 'FUERA DE COBERTURA', 'ZONA PELIGROSA'];

const esGestionableExpr = (col) =>
  `(${col} IS NULL OR (
      UPPER(TRIM(${col})) NOT LIKE '%DUPLICADO%' AND
      UPPER(TRIM(${col})) NOT LIKE '%ATC%' AND
      UPPER(TRIM(${col})) NOT LIKE '%FUERA DE COBERTURA%' AND
      UPPER(TRIM(${col})) NOT LIKE '%ZONA PELIGROSA%'
  ))`;

const ASESOR = `COALESCE(NULLIF(TRIM(mb.b_persona_responsable), ''), 'SIN ASIGNAR')`;
const ETAPA  = `mb.b_etapa_de_la_negociacion`;
const ESTADO_NETLIFE = `COALESCE(NULLIF(TRIM(UPPER(mb.j_netlife_estatus_real)), ''), 'SIN ESTADO')`;

const getFechaEcuador = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'America/Guayaquil' });

function rangoFechas(req, res) {
  const hoy   = getFechaEcuador();
  const desde = req.query.fechaDesde || hoy;
  const hasta = req.query.fechaHasta || hoy;
  const dias  = (new Date(hasta) - new Date(desde)) / 86400000;
  if (isNaN(dias) || dias < 0) {
    res.status(400).json({ success: false, error: 'Rango de fechas inválido' });
    return null;
  }
  if (dias > 92) {
    res.status(400).json({ success: false, error: 'Máximo 92 días por consulta' });
    return null;
  }
  return { desde, hasta, hoy };
}

// ─────────────────────────────────────────────────────────────────────────
// GET /api/cumplimiento-leads/reporte?fechaDesde=&fechaHasta=&asesor=&supervisor=
// ─────────────────────────────────────────────────────────────────────────
async function getReporte(req, res) {
  try {
    const rango = rangoFechas(req, res);
    if (!rango) return;

    const data = await construirReporte(req, rango);

    res.json({
      success: true,
      rango: { desde: rango.desde, hasta: rango.hasta },
      actualizado_en: new Date().toISOString(),
      por_asesor: data.por_asesor,
      totales: data.totales,
    });
  } catch (err) {
    console.error('[CumplimientoLeads][reporte]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────
// GET /api/cumplimiento-leads/metas  → catálogo editable de metas por asesor
// ─────────────────────────────────────────────────────────────────────────
async function getMetas(req, res) {
  try {
    const { rows } = await pool.query(`
      SELECT id, codigo_ejecutivo, asesor, supervisor, meta_gestionables, activo, actualizado_en
      FROM public.asesores_metas
      ORDER BY asesor ASC
    `);
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[CumplimientoLeads][getMetas]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────
// POST /api/cumplimiento-leads/metas  { codigo_ejecutivo, asesor, supervisor, meta_gestionables }
// Upsert por codigo_ejecutivo
// ─────────────────────────────────────────────────────────────────────────
async function upsertMeta(req, res) {
  try {
    const { codigo_ejecutivo, asesor, supervisor, meta_gestionables } = req.body;
    if (!codigo_ejecutivo || !asesor) {
      return res.status(400).json({ success: false, error: 'codigo_ejecutivo y asesor son requeridos' });
    }
    const meta = Number.isFinite(Number(meta_gestionables)) ? Number(meta_gestionables) : 0;

    const { rows } = await pool.query(`
      INSERT INTO public.asesores_metas (codigo_ejecutivo, asesor, supervisor, meta_gestionables)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (codigo_ejecutivo) DO UPDATE SET
        asesor            = EXCLUDED.asesor,
        supervisor        = EXCLUDED.supervisor,
        meta_gestionables = EXCLUDED.meta_gestionables
      RETURNING *
    `, [String(codigo_ejecutivo), asesor, supervisor || null, meta]);

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('[CumplimientoLeads][upsertMeta]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────
// PUT /api/cumplimiento-leads/metas/:id  { meta_gestionables, activo }
// ─────────────────────────────────────────────────────────────────────────
async function updateMeta(req, res) {
  try {
    const { id } = req.params;
    const { meta_gestionables, activo } = req.body;
    const { rows } = await pool.query(`
      UPDATE public.asesores_metas
      SET meta_gestionables = COALESCE($2, meta_gestionables),
          activo            = COALESCE($3, activo)
      WHERE id = $1
      RETURNING *
    `, [id, meta_gestionables ?? null, activo ?? null]);
    if (!rows.length) return res.status(404).json({ success: false, error: 'No encontrado' });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('[CumplimientoLeads][updateMeta]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────
// GET /api/cumplimiento-leads/export  → Excel con las mismas columnas del reporte
// ─────────────────────────────────────────────────────────────────────────
async function exportExcel(req, res) {
  try {
    const rango = rangoFechas(req, res);
    if (!rango) return;

    const data = await construirReporte(req, rango);

    const XLSX = require('xlsx');
    const filas = data.por_asesor.map(r => ({
      'CODIGO': r.codigo,
      'ASESOR': r.asesor,
      'SUPERVISOR': r.supervisor || '',
      'LEADS GESTIONABLES': r.leads_gestionables,
      'VENTA DEL DÍA': r.venta_del_dia,
      'VENTA EN JOTFORM': r.venta_jotform,
      'PRESERVICIOS / SIN ESTATUS': r.preservicios_sin_estatus,
      'FACTIBLES': r.factibles,
      'ASIGNADAS': r.asignadas,
      'PREPLANIFICADAS': r.preplanificadas,
      'OBJETIVO DE GESTIONABLES': r.objetivo_gestionables,
      'CUMPLIMIENTO DE ENTREGA DE LEADS': r.cumplimiento_pct !== null ? `${r.cumplimiento_pct}%` : '—',
    }));
    filas.push({
      'CODIGO': '', 'ASESOR': 'TOTAL', 'SUPERVISOR': '',
      'LEADS GESTIONABLES': data.totales.leads_gestionables,
      'VENTA DEL DÍA': data.totales.venta_del_dia,
      'VENTA EN JOTFORM': data.totales.venta_jotform,
      'PRESERVICIOS / SIN ESTATUS': data.totales.preservicios_sin_estatus,
      'FACTIBLES': data.totales.factibles,
      'ASIGNADAS': data.totales.asignadas,
      'PREPLANIFICADAS': data.totales.preplanificadas,
      'OBJETIVO DE GESTIONABLES': data.totales.objetivo_gestionables,
      'CUMPLIMIENTO DE ENTREGA DE LEADS': data.totales.cumplimiento_pct !== null ? `${data.totales.cumplimiento_pct}%` : '—',
    });

    const ws = XLSX.utils.json_to_sheet(filas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Cumplimiento Leads');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="cumplimiento_leads_novonet_${rango.desde}_${rango.hasta}.xlsx"`);
    res.send(buf);
  } catch (err) {
    console.error('[CumplimientoLeads][export]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

// Lógica compartida entre getReporte y exportExcel (evita duplicar el SQL)
async function construirReporte(req, rango) {
  const where = [`mb.b_creado_el_fecha::date BETWEEN $1::date AND $2::date`];
  const values = [rango.desde, rango.hasta];

  if (req.query.asesor) {
    values.push(`%${req.query.asesor}%`);
    where.push(`${ASESOR} ILIKE $${values.length}`);
  }
  const whereSql = where.join(' AND ');

  values.push(rango.hoy);
  const hoyParamIdx = values.length;

  const havingSupervisor = req.query.supervisor
    ? (() => { values.push(`%${req.query.supervisor}%`); return `HAVING am.supervisor ILIKE $${values.length}`; })()
    : '';

  const sql = `
    WITH base AS (
      SELECT
        ${ASESOR} AS asesor,
        ${ETAPA}  AS etapa,
        ${ESTADO_NETLIFE} AS estado_netlife,
        mb.j_fecha_activacion_netlife::date AS fecha_activacion
      FROM public.mestra_bitrix mb
      WHERE ${whereSql}
    )
    SELECT
      COALESCE(am.codigo_ejecutivo, '—') AS codigo,
      b.asesor                            AS asesor,
      am.supervisor                       AS supervisor,
      COUNT(*) FILTER (WHERE ${esGestionableExpr('b.etapa')})::int AS leads_gestionables,
      COUNT(*) FILTER (WHERE b.estado_netlife = 'ACTIVO' AND b.fecha_activacion = $${hoyParamIdx}::date)::int AS venta_del_dia,
      COUNT(*) FILTER (WHERE b.estado_netlife = 'ACTIVO')::int AS venta_jotform,
      COUNT(*) FILTER (WHERE b.estado_netlife IN ('PRESERVICIO','SIN ESTADO'))::int AS preservicios_sin_estatus,
      COUNT(*) FILTER (WHERE b.estado_netlife LIKE '%FACTIB%')::int AS factibles,
      COUNT(*) FILTER (WHERE b.estado_netlife = 'ASIGNADO')::int AS asignadas,
      COUNT(*) FILTER (WHERE b.estado_netlife = 'PREPLANIFICADO')::int AS preplanificadas,
      COALESCE(am.meta_gestionables, 0)::int AS objetivo_gestionables
    FROM base b
    LEFT JOIN public.asesores_metas am
      ON UPPER(TRIM(am.asesor)) = UPPER(TRIM(b.asesor))
    GROUP BY 1, 2, 3, am.meta_gestionables
    ${havingSupervisor}
    ORDER BY leads_gestionables DESC, b.asesor ASC
  `;
  const { rows } = await pool.query(sql, values);

  const porAsesor = rows.map(r => {
    const objetivo = r.objetivo_gestionables || 0;
    const cumplimiento = objetivo > 0 ? r.leads_gestionables / objetivo : null;
    return {
      codigo: r.codigo,
      asesor: r.asesor,
      supervisor: r.supervisor || null,
      leads_gestionables: r.leads_gestionables,
      venta_del_dia: r.venta_del_dia,
      venta_jotform: r.venta_jotform,
      preservicios_sin_estatus: r.preservicios_sin_estatus,
      factibles: r.factibles,
      asignadas: r.asignadas,
      preplanificadas: r.preplanificadas,
      objetivo_gestionables: objetivo,
      cumplimiento_pct: cumplimiento !== null ? Math.round(cumplimiento * 1000) / 10 : null,
    };
  });

  const totales = porAsesor.reduce((acc, r) => {
    acc.leads_gestionables       += r.leads_gestionables;
    acc.venta_del_dia            += r.venta_del_dia;
    acc.venta_jotform            += r.venta_jotform;
    acc.preservicios_sin_estatus += r.preservicios_sin_estatus;
    acc.factibles                += r.factibles;
    acc.asignadas                += r.asignadas;
    acc.preplanificadas          += r.preplanificadas;
    acc.objetivo_gestionables    += r.objetivo_gestionables;
    return acc;
  }, {
    leads_gestionables: 0, venta_del_dia: 0, venta_jotform: 0,
    preservicios_sin_estatus: 0, factibles: 0, asignadas: 0,
    preplanificadas: 0, objetivo_gestionables: 0,
  });
  totales.cumplimiento_pct = totales.objetivo_gestionables > 0
    ? Math.round((totales.leads_gestionables / totales.objetivo_gestionables) * 1000) / 10
    : null;

  return { por_asesor: porAsesor, totales };
}

module.exports = { getReporte, getMetas, upsertMeta, updateMeta, exportExcel };
