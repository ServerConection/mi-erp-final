/**
 * KPI COMERCIAL — NOVONET
 *
 * Arma las tablas "KPI por Supervisor" y "KPI por Asesor" con la estructura
 * que definió gerencia (Excel dato.xlsx): cada indicador con su Pto (meta) y
 * su Real.
 *
 * FUENTES
 *   Lado Bitrix  → public.vw_bitrix_novonet   (webhook, tiempo real)
 *   Lado Jotform → columnas j_* de esa misma vista
 *   Metas        → public.metas_asesor
 *   Supervisor   → public.empleados (por nombre exacto, codigo = mes)
 *
 * DEFINICIONES (dadas por el usuario, 2026-08)
 *   N Leads Total      = leads creados en el rango
 *   N Leads Gestion    = solo las etapas de ETAPAS_GESTIONABLES
 *   % Gest vs Totales  = gestion / total
 *   Efect. vs Leads    = Venta Subida / total
 *   Efect. vs Gestion  = Venta Subida / gestion
 *   Descarte %         = Descarte / gestion      ← sobre GESTIONABLES, no total
 *   Ingresos CRM       = cantidad en etapa Venta Subida
 *   Ingresos Jot       = registros Jotform creados en el rango
 *   ACTIVA MES         = activo + activación en rango + lead creado en rango
 *   ACTIVAS BACK       = activo + activación en rango + lead creado ANTES
 *   ACTIVAS TOTALES    = activo + activación en rango   (= mes + backlog)
 *   Tasa Activación    = activas totales / ingresos Jot
 *   % 3ra Edad         = ventas 3ra edad / ingresos Jot
 *
 * NOTA: los nombres de asesor vienen con distintas escrituras (el webhook usa
 * Mixed Case y mestra MAYUSCULA). Todo se agrupa por UPPER(TRIM(nombre)).
 */

const pool = require('../config/db');

// ── Etapas que cuentan como GESTIONABLES ─────────────────────────────────────
// Lista BLANCA definida por gerencia. Cualquier etapa fuera de aquí (ATC,
// Duplicado, Fuera de Cobertura, Zona Peligrosa, Regularización, OPORTUNIDADES)
// suma a Leads Totales pero NO a Gestionables.
const ETAPAS_GESTIONABLES = [
  'CONTACTO NUEVO',
  'GESTION DIARIA/PENDIENTE CIERRE',
  'SEGUIMIENTO NEGOCIACION',
  'ENVIO REQUISITOS/DOCUMENTOS PENDIENTES',
  'VOLVER A LLAMAR NO CONTESTA',
  'MAS DE 15 DIAS PARA CIERRE',
  'INNEGOCIABLE',
  'URGENTE GESTION SUPERVISOR',
  'VENTA SUBIDA',
  'DESCARTE',
];

const listaSql = (arr) => `(${arr.map(v => `'${v.replace(/'/g, "''")}'`).join(',')})`;

const errorResponse = (res, etiqueta, err) => {
  console.error(`[KpiComercial][${etiqueta}]`, err.message);
  return res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : err.message,
  });
};

const validarRango = (d, h) => {
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (!re.test(String(d || '')) || !re.test(String(h || ''))) return null;
  return String(d) <= String(h) ? { desde: d, hasta: h } : null;
};

// ─────────────────────────────────────────────────────────────────────────────
// Consulta base: una fila por ASESOR con todos los reales + sus metas.
// El nivel supervisor se obtiene agregando esta misma base.
// ─────────────────────────────────────────────────────────────────────────────
// __VISTA__      → vw_bitrix_novonet | vw_bitrix_velsa
// __SUPERVISOR__ → cómo se resuelve el supervisor en cada empresa
const SQL_BASE = `
WITH datos AS (
    SELECT
        UPPER(TRIM(mb.b_persona_responsable))              AS persona,
        MIN(mb.b_persona_responsable)                      AS asesor_display,
        __SUPERVISOR__                                     AS supervisor,

        -- ── Lado Bitrix (por fecha de creación del lead) ──────────────────
        COUNT(DISTINCT mb.b_id) FILTER (
            WHERE mb.b_creado_el_fecha BETWEEN $1::date AND $2::date
        )                                                  AS leads_total,

        COUNT(DISTINCT mb.b_id) FILTER (
            WHERE mb.b_creado_el_fecha BETWEEN $1::date AND $2::date
              AND UPPER(TRIM(mb.b_etapa_de_la_negociacion)) IN __GESTIONABLES__
        )                                                  AS leads_gestion,

        COUNT(DISTINCT mb.b_id) FILTER (
            WHERE mb.b_creado_el_fecha BETWEEN $1::date AND $2::date
              AND UPPER(TRIM(mb.b_etapa_de_la_negociacion)) = 'VENTA SUBIDA'
        )                                                  AS ingresos_crm,

        COUNT(DISTINCT mb.b_id) FILTER (
            WHERE mb.b_creado_el_fecha BETWEEN $1::date AND $2::date
              AND UPPER(TRIM(mb.b_etapa_de_la_negociacion)) = 'DESCARTE'
        )                                                  AS descarte_n,

        -- ── Lado Jotform (por fecha de registro / activación) ─────────────
        COUNT(*) FILTER (
            WHERE public.parse_fecha_flex(mb.j_fecha_registro_sistema::text)
                  BETWEEN $1::date AND $2::date
        )                                                  AS ingresos_jot,

        -- ACTIVAS TOTALES: activo + activación dentro del rango
        COUNT(*) FILTER (
            WHERE UPPER(TRIM(mb.j_netlife_estatus_real)) = 'ACTIVO'
              AND public.parse_fecha_flex(mb.j_fecha_activacion_netlife::text)
                  BETWEEN $1::date AND $2::date
        )                                                  AS activas_totales,

        -- ACTIVA MES: además el lead se creó dentro del rango
        COUNT(*) FILTER (
            WHERE UPPER(TRIM(mb.j_netlife_estatus_real)) = 'ACTIVO'
              AND public.parse_fecha_flex(mb.j_fecha_activacion_netlife::text)
                  BETWEEN $1::date AND $2::date
              AND mb.b_creado_el_fecha BETWEEN $1::date AND $2::date
        )                                                  AS activa_mes,

        -- activas_backlog NO se calcula aquí: se deriva como TOTALES − MES
        -- en la función derivar(), para que los tres números siempre cuadren.
        0::int                                             AS activas_backlog,

        -- 3ra Edad: el valor real en la base es 'SI POR TERCERA EDAD'
        -- (mismo literal que usa queryMetasGlobales en indicadores.controller.js)
        COUNT(*) FILTER (
            WHERE public.parse_fecha_flex(mb.j_fecha_registro_sistema::text)
                  BETWEEN $1::date AND $2::date
              AND UPPER(TRIM(mb.j_aplica_descuento_3ra_edad)) = 'SI POR TERCERA EDAD'
        )                                                  AS tercera_edad_n,

        -- Tarjeta: el valor real lleva punto final → 'TARJETA DE CREDITO.'
        COUNT(*) FILTER (
            WHERE public.parse_fecha_flex(mb.j_fecha_registro_sistema::text)
                  BETWEEN $1::date AND $2::date
              AND UPPER(TRIM(mb.j_forma_pago)) LIKE 'TARJETA DE CREDITO%'
        )                                                  AS tarjeta_n,

        -- Planes 150/200: ACTIVOS cuyo plan contratado tiene esa velocidad.
        -- El regex evita falsos positivos como "1500" o "2000": exige que
        -- antes y después del número no haya otro dígito.
        COUNT(*) FILTER (
            WHERE public.parse_fecha_flex(mb.j_fecha_registro_sistema::text)
                  BETWEEN $1::date AND $2::date
              AND UPPER(TRIM(mb.j_netlife_estatus_real)) = 'ACTIVO'
              AND mb.j_plan_contratado_final ~* '(^|[^0-9])(150|200)([^0-9]|$)'
        )                                                  AS planes_150_200_n,

        COUNT(*) FILTER (
            WHERE public.parse_fecha_flex(mb.j_fecha_registro_sistema::text)
                  BETWEEN $1::date AND $2::date
              AND UPPER(TRIM(mb.j_estatus_regularizacion)) = 'POR REGULARIZAR'
        )                                                  AS por_regularizar
    FROM public.__VISTA__ mb
    __JOIN_EMPLEADOS__
    WHERE NULLIF(TRIM(mb.b_persona_responsable), '') IS NOT NULL
    GROUP BY 1
),
metas AS (
    -- MAX y no SUM: un asesor puede tener varias filas (una por escritura)
    SELECT UPPER(TRIM(asesor))  AS persona,
           MAX(leads_total)     AS m_leads_total,
           MAX(leads_gestion)   AS m_leads_gestion,
           MAX(ingresos_jot)    AS m_ingresos_jot,
           MAX(activas_totales) AS m_activas_totales,
           MAX(pct_efect_leads)     AS m_pct_efect_leads,
           MAX(pct_efect_gestion)   AS m_pct_efect_gestion,
           MAX(pct_descarte)        AS m_pct_descarte,
           MAX(pct_tasa_activacion) AS m_pct_tasa_activacion,
           MAX(pct_tarjeta)         AS m_pct_tarjeta,
           MAX(pct_tercera_edad)    AS m_pct_tercera_edad,
           MAX(pct_planes_150_200)  AS m_pct_planes
    FROM public.metas_asesor
    WHERE empresa = $3 AND activo
      AND anio = EXTRACT(YEAR  FROM $1::date)::int
      AND mes  = EXTRACT(MONTH FROM $1::date)::int
    GROUP BY 1
)
SELECT d.*,
       COALESCE(m.m_leads_total,0)          AS meta_leads_total,
       COALESCE(m.m_leads_gestion,0)        AS meta_leads_gestion,
       COALESCE(m.m_ingresos_jot,0)         AS meta_ingresos_jot,
       COALESCE(m.m_activas_totales,0)      AS meta_activas_totales,
       COALESCE(m.m_pct_efect_leads,0)      AS meta_pct_efect_leads,
       COALESCE(m.m_pct_efect_gestion,0)    AS meta_pct_efect_gestion,
       COALESCE(m.m_pct_descarte,0)         AS meta_pct_descarte,
       COALESCE(m.m_pct_tasa_activacion,0)  AS meta_pct_tasa_activacion,
       COALESCE(m.m_pct_tarjeta,0)          AS meta_pct_tarjeta,
       COALESCE(m.m_pct_tercera_edad,0)     AS meta_pct_tercera_edad,
       COALESCE(m.m_pct_planes,0)           AS meta_pct_planes
FROM datos d
LEFT JOIN metas m ON m.persona = d.persona
`;

// Calcula los porcentajes derivados sobre una fila (asesor o supervisor)
const derivar = (f) => {
  const n = (v) => Number(v || 0);
  const pct = (num, den) => (n(den) > 0 ? Number(((n(num) / n(den)) * 100).toFixed(1)) : 0);

  // ACTIVAS TOTALES = todo lo que tiene fecha de activación en el rango
  // ACTIVA MES      = de esas, las que además se crearon en el rango
  // ACTIVAS BACKLOG = TOTALES − MES  (definición de gerencia, 2026-08)
  // Se calcula por resta y no con su propio FILTER: así los tres siempre
  // cuadran entre sí, en cualquier nivel (asesor, supervisor o total).
  const activasBacklog = Math.max(0, n(f.activas_totales) - n(f.activa_mes));

  return {
    ...f,
    activas_backlog: activasBacklog,
    pct_gestion_vs_total: pct(f.leads_gestion, f.leads_total),
    pct_efect_vs_leads:   pct(f.ingresos_crm,  f.leads_total),
    pct_efect_vs_gestion: pct(f.ingresos_crm,  f.leads_gestion),
    pct_descarte:         pct(f.descarte_n,    f.leads_gestion),
    pct_tasa_activacion:  pct(f.activas_totales, f.ingresos_jot),
    // Los tres van sobre INGRESOS JOTFORM del rango, según definió gerencia
    pct_tercera_edad:     pct(f.tercera_edad_n,     f.ingresos_jot),
    pct_tarjeta:          pct(f.tarjeta_n,          f.ingresos_jot),
    pct_planes_150_200:   pct(f.planes_150_200_n,   f.ingresos_jot),
  };
};

const CAMPOS_SUMA = [
  'leads_total', 'leads_gestion', 'ingresos_crm', 'descarte_n', 'ingresos_jot',
  'activas_totales', 'activa_mes', 'activas_backlog', 'tercera_edad_n',
  'tarjeta_n', 'planes_150_200_n', 'por_regularizar',
  'meta_leads_total', 'meta_leads_gestion', 'meta_ingresos_jot', 'meta_activas_totales',
];

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/kpi-comercial?fechaDesde=&fechaHasta=
// Devuelve { supervisores: [...], asesores: [...], total: {...} }
// ─────────────────────────────────────────────────────────────────────────────
async function getKpiComercial(req, res) {
  try {
    const rango = validarRango(req.query.fechaDesde, req.query.fechaHasta);
    if (!rango) {
      return res.status(400).json({
        success: false,
        error: 'fechaDesde y fechaHasta son requeridas en formato YYYY-MM-DD',
      });
    }

    const empresa = String(req.query.empresa || 'NOVONET').toUpperCase() === 'VELSA'
      ? 'VELSA' : 'NOVONET';

    // NOVONET: el supervisor sale de public.empleados (por nombre exacto y mes)
    // VELSA:   no hay equipos — todo el personal responde a las dos supervisoras,
    //          así que va como un solo grupo. Los datos de supervisor que trae
    //          la MV están incompletos (55% vacío) y con nombres duplicados.
    const cfg = empresa === 'VELSA'
      ? {
          vista: 'vw_bitrix_velsa',
          supervisor: `'ALEXANDRA PACHECO · DARIANA LEONARDI'`,
          joinEmpleados: '',
        }
      : {
          vista: 'vw_bitrix_novonet',
          supervisor: `COALESCE(MAX(e.supervisor), 'SIN ASIGNAR')`,
          joinEmpleados: `
            LEFT JOIN LATERAL (
                SELECT e2.supervisor
                FROM public.empleados e2
                WHERE e2.nombre_completo = mb.b_persona_responsable
                ORDER BY
                    CASE WHEN e2.codigo = EXTRACT(MONTH FROM $1::date)::text THEN 0 ELSE 1 END,
                    e2.codigo::int DESC
                LIMIT 1
            ) e ON TRUE`,
        };

    const sql = SQL_BASE
      .replace('__GESTIONABLES__', listaSql(ETAPAS_GESTIONABLES))
      .replace('__VISTA__', cfg.vista)
      .replace('__SUPERVISOR__', cfg.supervisor)
      .replace('__JOIN_EMPLEADOS__', cfg.joinEmpleados);

    const { rows } = await pool.query(sql, [rango.desde, rango.hasta, empresa]);

    // Nivel ASESOR
    const asesores = rows
      .map(r => derivar({ ...r, nombre: r.asesor_display }))
      .filter(r => r.leads_total > 0 || r.ingresos_jot > 0 || r.meta_leads_total > 0)
      .sort((a, b) => b.leads_total - a.leads_total);

    // Nivel SUPERVISOR — se agregan los absolutos y se recalculan los %
    const porSup = new Map();
    for (const r of rows) {
      const k = r.supervisor || 'SIN ASIGNAR';
      if (!porSup.has(k)) {
        porSup.set(k, Object.fromEntries([['nombre', k], ...CAMPOS_SUMA.map(c => [c, 0])]));
      }
      const acc = porSup.get(k);
      for (const c of CAMPOS_SUMA) acc[c] += Number(r[c] || 0);
    }
    const supervisores = [...porSup.values()]
      .map(derivar)
      .sort((a, b) => b.leads_total - a.leads_total);

    // TOTAL general
    const total = derivar(
      Object.fromEntries([
        ['nombre', `TOTAL ${empresa}`],
        ...CAMPOS_SUMA.map(c => [c, supervisores.reduce((s, x) => s + Number(x[c] || 0), 0)]),
      ])
    );

    return res.json({
      success: true,
      data: { supervisores, asesores, total, empresa, fechaDesde: rango.desde, fechaHasta: rango.hasta },
    });
  } catch (err) {
    return errorResponse(res, 'getKpiComercial', err);
  }
}

module.exports = { getKpiComercial, ETAPAS_GESTIONABLES };
