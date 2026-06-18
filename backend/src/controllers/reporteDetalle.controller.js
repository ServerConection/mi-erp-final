/**
 * REPORTE DETALLE — Cubo de eventos para BI interactivo (Novonet y Velsa).
 *
 * Devuelve un cubo agregado de eventos:
 *   t = tipo de evento: 'lead' (creación CRM) | 'mod' (modificación CRM) | 'jot' (ingreso Jotform)
 *   f = fecha (YYYY-MM-DD)   h = hora (0-23, -1 si no se conoce)
 *   a = asesor               e = etapa (CRM para lead/mod, estatus Jot para jot)
 *   c = cantidad
 *
 * El frontend hace TODO el cross-filtering sobre este cubo (estilo Power BI).
 * Gestionables = toda etapa que NO matchee DUPLICADO/ATC/FUERA DE COBERTURA/ZONA PELIGROSA.
 */
const pool = require('../config/db');

const parseFecha = (col) =>
  `CASE WHEN ${col} IS NULL OR TRIM(${col}::text) = '' THEN NULL ` +
  `WHEN ${col}::text ~ '^\\d{4}-\\d{2}-\\d{2}' THEN ${col}::text::date ` +
  `ELSE TO_DATE(SUBSTRING(${col}::text FROM 5 FOR 11), 'Mon DD YYYY') END`;

// Hora desde texto tipo "14:35" / "9:05:33" → 0-23 (o -1)
const parseHoraTxt = (col) =>
  `COALESCE(NULLIF(SUBSTRING(TRIM(${col}::text) FROM '^([0-9]{1,2})'), '')::int, -1)`;

const getFechaEcuador = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'America/Guayaquil' });

const ETAPAS_NO_GESTIONABLES = ['DUPLICADO', 'ATC', 'FUERA DE COBERTURA', 'ZONA PELIGROSA'];

// ── Cubos por empresa ─────────────────────────────────────────
const CUBO_SQL = {
  novonet: `
    SELECT 'lead' AS t,
           (${parseFecha('mb.b_creado_el_fecha')})::text AS f,
           LEAST(GREATEST(${parseHoraTxt('mb.b_creado_el_hora')}, -1), 23) AS h,
           COALESCE(NULLIF(TRIM(mb.b_persona_responsable), ''), 'SIN ASIGNAR') AS a,
           COALESCE(NULLIF(TRIM(UPPER(mb.b_etapa_de_la_negociacion)), ''), 'SIN ETAPA') AS e,
           COUNT(*)::int AS c
    FROM public.mestra_bitrix mb
    WHERE (${parseFecha('mb.b_creado_el_fecha')}) BETWEEN $1::date AND $2::date
    GROUP BY 1,2,3,4,5
    UNION ALL
    SELECT 'mod',
           (${parseFecha('mb.b_modificado_el_fecha')})::text,
           LEAST(GREATEST(${parseHoraTxt('mb.b_modificado_el_hora')}, -1), 23),
           COALESCE(NULLIF(TRIM(mb.b_persona_responsable), ''), 'SIN ASIGNAR'),
           COALESCE(NULLIF(TRIM(UPPER(mb.b_etapa_de_la_negociacion)), ''), 'SIN ETAPA'),
           COUNT(*)::int
    FROM public.mestra_bitrix mb
    WHERE (${parseFecha('mb.b_modificado_el_fecha')}) BETWEEN $1::date AND $2::date
    GROUP BY 1,2,3,4,5
    UNION ALL
    SELECT 'jot',
           mb.j_fecha_registro_sistema::date::text,
           COALESCE(EXTRACT(HOUR FROM mb.j_fecha_registro_sistema::timestamp)::int, -1),
           COALESCE(NULLIF(TRIM(mb.b_persona_responsable), ''), 'SIN ASIGNAR'),
           COALESCE(NULLIF(TRIM(UPPER(mb.j_netlife_estatus_real)), ''), 'SIN ESTADO'),
           COUNT(*)::int
    FROM public.mestra_bitrix mb
    WHERE mb.j_fecha_registro_sistema::date BETWEEN $1::date AND $2::date
    GROUP BY 1,2,3,4,5
  `,
  velsa: `
    SELECT 'lead' AS t,
           mv.fecha_creacion_crm::date::text AS f,
           COALESCE(EXTRACT(HOUR FROM mv.fecha_creacion_crm::timestamp)::int, -1) AS h,
           COALESCE(NULLIF(TRIM(mv.asesor), ''), 'SIN ASIGNAR') AS a,
           COALESCE(NULLIF(TRIM(UPPER(mv.etapa_crm)), ''), 'SIN ETAPA') AS e,
           COUNT(*)::int AS c
    FROM public.mv_indicadores_velsa_completo mv
    WHERE mv.fecha_creacion_crm::date BETWEEN $1::date AND $2::date
    GROUP BY 1,2,3,4,5
    UNION ALL
    SELECT 'mod',
           mv.fecha_modificacion_crm::date::text,
           COALESCE(EXTRACT(HOUR FROM mv.fecha_modificacion_crm::timestamp)::int, -1),
           COALESCE(NULLIF(TRIM(mv.asesor), ''), 'SIN ASIGNAR'),
           COALESCE(NULLIF(TRIM(UPPER(mv.etapa_crm)), ''), 'SIN ETAPA'),
           COUNT(*)::int
    FROM public.mv_indicadores_velsa_completo mv
    WHERE mv.fecha_modificacion_crm::date BETWEEN $1::date AND $2::date
    GROUP BY 1,2,3,4,5
    UNION ALL
    SELECT 'jot',
           (mv.fecha_registro_jotform - INTERVAL '5 hours')::date::text,
           COALESCE(EXTRACT(HOUR FROM (mv.fecha_registro_jotform::timestamp - INTERVAL '5 hours'))::int, -1),
           COALESCE(NULLIF(TRIM(mv.asesor), ''), 'SIN ASIGNAR'),
           COALESCE(NULLIF(TRIM(UPPER(mv.estado_venta)), ''), 'SIN ESTADO'),
           COUNT(*)::int
    FROM public.mv_indicadores_velsa_completo mv
    WHERE (mv.fecha_registro_jotform - INTERVAL '5 hours')::date BETWEEN $1::date AND $2::date
    GROUP BY 1,2,3,4,5
  `,
};

// ── Detalle de leads (drill-down) ──────────────────────────────
// Devuelve filas individuales (no agregadas) para un asesor/etapa/día/hora
// específico, dentro del mismo rango de fechas y tipo de evento que el cubo.
// Estilo "mostrar detalle" de una tabla dinámica de Excel.
const DETALLE_SQL = {
  novonet: {
    lead: {
      from: `public.mestra_bitrix mb`,
      fechaExpr: parseFecha('mb.b_creado_el_fecha'),
      horaExpr: `LEAST(GREATEST(${parseHoraTxt('mb.b_creado_el_hora')}, -1), 23)`,
      asesorExpr: `COALESCE(NULLIF(TRIM(mb.b_persona_responsable), ''), 'SIN ASIGNAR')`,
      etapaExpr: `COALESCE(NULLIF(TRIM(UPPER(mb.b_etapa_de_la_negociacion)), ''), 'SIN ETAPA')`,
      select: `
        COALESCE(mb.j_id_bitrix::text, mb.b_id::text) AS id,
        mb.b_id::text AS id_crm,
        mb.j_id_bitrix::text AS id_jotform,
        mb.j_netlife_login AS login,
        mb.j_netlife_estatus_real AS estado_jotform,
        mb.j_forma_pago AS forma_pago
      `,
    },
    mod: {
      from: `public.mestra_bitrix mb`,
      fechaExpr: parseFecha('mb.b_modificado_el_fecha'),
      horaExpr: `LEAST(GREATEST(${parseHoraTxt('mb.b_modificado_el_hora')}, -1), 23)`,
      asesorExpr: `COALESCE(NULLIF(TRIM(mb.b_persona_responsable), ''), 'SIN ASIGNAR')`,
      etapaExpr: `COALESCE(NULLIF(TRIM(UPPER(mb.b_etapa_de_la_negociacion)), ''), 'SIN ETAPA')`,
      select: `
        COALESCE(mb.j_id_bitrix::text, mb.b_id::text) AS id,
        mb.b_id::text AS id_crm,
        mb.j_id_bitrix::text AS id_jotform,
        mb.j_netlife_login AS login,
        mb.j_netlife_estatus_real AS estado_jotform,
        mb.j_forma_pago AS forma_pago
      `,
    },
    jot: {
      from: `public.mestra_bitrix mb`,
      fechaExpr: `mb.j_fecha_registro_sistema::date`,
      horaExpr: `COALESCE(EXTRACT(HOUR FROM mb.j_fecha_registro_sistema::timestamp)::int, -1)`,
      asesorExpr: `COALESCE(NULLIF(TRIM(mb.b_persona_responsable), ''), 'SIN ASIGNAR')`,
      etapaExpr: `COALESCE(NULLIF(TRIM(UPPER(mb.j_netlife_estatus_real)), ''), 'SIN ESTADO')`,
      select: `
        COALESCE(mb.j_id_bitrix::text, mb.b_id::text) AS id,
        mb.b_id::text AS id_crm,
        mb.j_id_bitrix::text AS id_jotform,
        mb.j_netlife_login AS login,
        mb.b_etapa_de_la_negociacion AS etapa_crm,
        mb.j_forma_pago AS forma_pago,
        mb.j_fecha_activacion_netlife::text AS fecha_activacion
      `,
    },
  },
  velsa: {
    lead: {
      from: `public.mv_indicadores_velsa_completo mv`,
      fechaExpr: `mv.fecha_creacion_crm::date`,
      horaExpr: `COALESCE(EXTRACT(HOUR FROM mv.fecha_creacion_crm::timestamp)::int, -1)`,
      asesorExpr: `COALESCE(NULLIF(TRIM(mv.asesor), ''), 'SIN ASIGNAR')`,
      etapaExpr: `COALESCE(NULLIF(TRIM(UPPER(mv.etapa_crm)), ''), 'SIN ETAPA')`,
      select: `
        COALESCE(mv.id_jotform::text, mv.id_crm::text) AS id,
        mv.id_crm::text AS id_crm,
        mv.id_jotform::text AS id_jotform,
        mv.estado_venta AS estado_jotform,
        mv.forma_pago AS forma_pago,
        mv.supervisor AS supervisor
      `,
    },
    mod: {
      from: `public.mv_indicadores_velsa_completo mv`,
      fechaExpr: `mv.fecha_modificacion_crm::date`,
      horaExpr: `COALESCE(EXTRACT(HOUR FROM mv.fecha_modificacion_crm::timestamp)::int, -1)`,
      asesorExpr: `COALESCE(NULLIF(TRIM(mv.asesor), ''), 'SIN ASIGNAR')`,
      etapaExpr: `COALESCE(NULLIF(TRIM(UPPER(mv.etapa_crm)), ''), 'SIN ETAPA')`,
      select: `
        COALESCE(mv.id_jotform::text, mv.id_crm::text) AS id,
        mv.id_crm::text AS id_crm,
        mv.id_jotform::text AS id_jotform,
        mv.estado_venta AS estado_jotform,
        mv.forma_pago AS forma_pago,
        mv.supervisor AS supervisor
      `,
    },
    jot: {
      from: `public.mv_indicadores_velsa_completo mv`,
      fechaExpr: `(mv.fecha_registro_jotform - INTERVAL '5 hours')::date`,
      horaExpr: `COALESCE(EXTRACT(HOUR FROM (mv.fecha_registro_jotform::timestamp - INTERVAL '5 hours'))::int, -1)`,
      asesorExpr: `COALESCE(NULLIF(TRIM(mv.asesor), ''), 'SIN ASIGNAR')`,
      etapaExpr: `COALESCE(NULLIF(TRIM(UPPER(mv.estado_venta)), ''), 'SIN ESTADO')`,
      select: `
        COALESCE(mv.id_jotform::text, mv.id_crm::text) AS id,
        mv.id_crm::text AS id_crm,
        mv.id_jotform::text AS id_jotform,
        mv.etapa_crm AS etapa_crm,
        mv.forma_pago AS forma_pago,
        mv.supervisor AS supervisor
      `,
    },
  },
};

async function getDetalle(req, res) {
  try {
    const empresa = (req.params.empresa || '').toLowerCase();
    const tipo = (req.query.tipo || '').toLowerCase();
    const cfgEmpresa = DETALLE_SQL[empresa];
    if (!cfgEmpresa) return res.status(400).json({ success: false, error: 'Empresa inválida (novonet|velsa)' });
    const cfg = cfgEmpresa[tipo];
    if (!cfg) return res.status(400).json({ success: false, error: 'Tipo inválido (lead|mod|jot)' });

    const hoy   = getFechaEcuador();
    const desde = req.query.fechaDesde || hoy.slice(0, 7) + '-01';
    const hasta = req.query.fechaHasta || hoy;
    const dias = (new Date(hasta) - new Date(desde)) / 86400000;
    if (isNaN(dias) || dias < 0) return res.status(400).json({ success: false, error: 'Rango de fechas inválido' });
    if (dias > 92) return res.status(400).json({ success: false, error: 'Máximo 92 días por consulta' });

    const limit = Math.min(parseInt(req.query.limit, 10) || 300, 1000);

    const where = [`(${cfg.fechaExpr}) BETWEEN $1::date AND $2::date`];
    const values = [desde, hasta];

    if (req.query.asesor) { values.push(req.query.asesor); where.push(`(${cfg.asesorExpr}) = $${values.length}`); }
    if (req.query.etapa)  { values.push(req.query.etapa);  where.push(`(${cfg.etapaExpr}) = $${values.length}`); }
    if (req.query.dia)    { values.push(req.query.dia);    where.push(`(${cfg.fechaExpr}) = $${values.length}::date`); }
    if (req.query.hora !== undefined && req.query.hora !== '') {
      values.push(parseInt(req.query.hora, 10));
      where.push(`(${cfg.horaExpr}) = $${values.length}`);
    }
    if (req.query.gestionable === 'si' || req.query.gestionable === 'no') {
      const noGestSql = ETAPAS_NO_GESTIONABLES.map(p => `(${cfg.etapaExpr}) LIKE '%${p}%'`).join(' OR ');
      where.push(req.query.gestionable === 'si' ? `NOT (${noGestSql})` : `(${noGestSql})`);
    }

    values.push(limit);
    const sql = `
      SELECT
        (${cfg.fechaExpr})::text AS fecha,
        (${cfg.horaExpr})        AS hora,
        (${cfg.asesorExpr})      AS asesor,
        (${cfg.etapaExpr})       AS etapa,
        ${cfg.select}
      FROM ${cfg.from}
      WHERE ${where.join(' AND ')}
      ORDER BY (${cfg.fechaExpr}) DESC, (${cfg.horaExpr}) DESC
      LIMIT $${values.length}
    `;

    const { rows } = await pool.query(sql, values);
    res.json({ success: true, empresa, tipo, total: rows.length, limite: limit, filas: rows });
  } catch (err) {
    console.error('[ReporteDetalle:getDetalle]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

async function getCubo(req, res) {
  try {
    const empresa = (req.params.empresa || '').toLowerCase();
    if (!CUBO_SQL[empresa]) {
      return res.status(400).json({ success: false, error: 'Empresa inválida (novonet|velsa)' });
    }

    const hoy   = getFechaEcuador();
    const desde = req.query.fechaDesde || hoy.slice(0, 7) + '-01';
    const hasta = req.query.fechaHasta || hoy;

    // Límite de seguridad: máximo 92 días por consulta
    const dias = (new Date(hasta) - new Date(desde)) / 86400000;
    if (isNaN(dias) || dias < 0) return res.status(400).json({ success: false, error: 'Rango de fechas inválido' });
    if (dias > 92) return res.status(400).json({ success: false, error: 'Máximo 92 días por consulta' });

    const { rows } = await pool.query(CUBO_SQL[empresa], [desde, hasta]);

    res.json({
      success: true,
      empresa,
      rango: { desde, hasta },
      etapas_no_gestionables: ETAPAS_NO_GESTIONABLES,
      total_filas: rows.length,
      eventos: rows,
    });
  } catch (err) {
    console.error('[ReporteDetalle]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

module.exports = { getCubo, getDetalle };
