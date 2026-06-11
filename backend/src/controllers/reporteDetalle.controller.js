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
           COALESCE(EXTRACT(HOUR FROM mb.j_fecha_registro_sistema)::int, -1),
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
           COALESCE(EXTRACT(HOUR FROM mv.fecha_creacion_crm)::int, -1) AS h,
           COALESCE(NULLIF(TRIM(mv.asesor), ''), 'SIN ASIGNAR') AS a,
           COALESCE(NULLIF(TRIM(UPPER(mv.etapa_crm)), ''), 'SIN ETAPA') AS e,
           COUNT(*)::int AS c
    FROM public.mv_indicadores_velsa_completo mv
    WHERE mv.fecha_creacion_crm::date BETWEEN $1::date AND $2::date
    GROUP BY 1,2,3,4,5
    UNION ALL
    SELECT 'mod',
           mv.fecha_modificacion_crm::date::text,
           COALESCE(EXTRACT(HOUR FROM mv.fecha_modificacion_crm)::int, -1),
           COALESCE(NULLIF(TRIM(mv.asesor), ''), 'SIN ASIGNAR'),
           COALESCE(NULLIF(TRIM(UPPER(mv.etapa_crm)), ''), 'SIN ETAPA'),
           COUNT(*)::int
    FROM public.mv_indicadores_velsa_completo mv
    WHERE mv.fecha_modificacion_crm::date BETWEEN $1::date AND $2::date
    GROUP BY 1,2,3,4,5
    UNION ALL
    SELECT 'jot',
           (mv.fecha_registro_jotform - INTERVAL '5 hours')::date::text,
           COALESCE(EXTRACT(HOUR FROM (mv.fecha_registro_jotform - INTERVAL '5 hours'))::int, -1),
           COALESCE(NULLIF(TRIM(mv.asesor), ''), 'SIN ASIGNAR'),
           COALESCE(NULLIF(TRIM(UPPER(mv.estado_venta)), ''), 'SIN ESTADO'),
           COUNT(*)::int
    FROM public.mv_indicadores_velsa_completo mv
    WHERE (mv.fecha_registro_jotform - INTERVAL '5 hours')::date BETWEEN $1::date AND $2::date
    GROUP BY 1,2,3,4,5
  `,
};

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

module.exports = { getCubo };
