/**
 * BACKOFFICE JOTFORM — módulo de revisión, embudo y heatmap de envíos Jotform
 * para NOVONET y VELSA (cuentas Jotform separadas, mismo backoffice).
 *
 * Fuentes de datos:
 *   NOVONET → public.mestra_bitrix (mb)   — solo filas con mb.j_id_bitrix (= ingreso Jotform real)
 *   VELSA   → public.mv_indicadores_velsa_completo (mv) — solo filas con mv.id_jotform
 *
 * Estado de revisión (aprobar/rechazar/pendiente) se guarda en
 * public.backoffice_jotform_revision (tabla propia, no se altera la fuente).
 *
 * "Gestionable" = etapa CRM que NO sea DUPLICADO / ATC / FUERA DE COBERTURA / ZONA PELIGROSA
 * (mismo criterio usado en indicadores.controller.js / reporteDetalle.controller.js).
 * "Activo"      = estado Jotform/Netlife = 'ACTIVO' (mismo criterio que indicadoresVelsaMaterialized.controller.js).
 *
 * Embudo (3 etapas, igual para ambas empresas):
 *   1. Ingresados   → todo registro con id de Jotform en el rango de fechas
 *   2. Gestionables → no cae en una etapa CRM no-gestionable
 *   3. Activos      → estado Jotform/Netlife = ACTIVO
 * El "cuello de botella" es la transición consecutiva con menor % de conversión.
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

const getFechaEcuador = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'America/Guayaquil' });

const EMPRESAS = ['novonet', 'velsa'];

function validarEmpresa(req, res) {
  const empresa = (req.query.empresa || req.params.empresa || req.body.empresa || '').toLowerCase();
  if (!EMPRESAS.includes(empresa)) {
    res.status(400).json({ success: false, error: 'Empresa inválida (novonet|velsa)' });
    return null;
  }
  return empresa;
}

function rangoFechas(req, res, maxDias = 92) {
  const hoy   = getFechaEcuador();
  const desde = req.query.fechaDesde || hoy.slice(0, 7) + '-01';
  const hasta = req.query.fechaHasta || hoy;
  const dias  = (new Date(hasta) - new Date(desde)) / 86400000;
  if (isNaN(dias) || dias < 0) {
    res.status(400).json({ success: false, error: 'Rango de fechas inválido' });
    return null;
  }
  if (dias > maxDias) {
    res.status(400).json({ success: false, error: `Máximo ${maxDias} días por consulta` });
    return null;
  }
  return { desde, hasta };
}

// ─────────────────────────────────────────────────────────────────────────
// VENTA DE SERVICIO: igual condición base que "activo" (estado = ACTIVO) más
// la exigencia de que al menos una columna plan_* tenga datos reales — si no,
// el registro es solo un servicio adicional, no una venta de producto.
// Ninguna fuente (mestra_bitrix / mv_indicadores_velsa_completo) expone las
// columnas plan_*, por lo que se obtienen vía LEFT JOIN en el controller,
// sin modificar ningún esquema/vista/MV existente.
// ─────────────────────────────────────────────────────────────────────────
// FIX (2026-06-23): vista_analisis_novonet puede tener varias filas por
// id_bitrix; se dedupea con GROUP BY antes del JOIN para que no multiplique
// las filas de mb (causaba KPIs de "ingresados" inflados).
const JOIN_PLAN_NOVONET = `LEFT JOIN (
    SELECT
        id_bitrix,
        MAX(plan_casa)               AS plan_casa,
        MAX(plan_profesional)        AS plan_profesional,
        MAX(plan_pyme)                AS plan_pyme,
        MAX(plan_pyme_corp)          AS plan_pyme_corp,
        MAX(plan_hogar_adulto_mayor) AS plan_hogar_adulto_mayor,
        MAX(plan_centro_comercial)   AS plan_centro_comercial
    FROM public.vista_analisis_novonet
    GROUP BY id_bitrix
) van ON mb.j_id_bitrix::text = van.id_bitrix::text`;
const HAS_PLAN_NOVONET = `(
    (van.plan_casa IS NOT NULL AND TRIM(van.plan_casa::text) <> '') OR
    (van.plan_profesional IS NOT NULL AND TRIM(van.plan_profesional::text) <> '') OR
    (van.plan_pyme IS NOT NULL AND TRIM(van.plan_pyme::text) <> '') OR
    (van.plan_pyme_corp IS NOT NULL AND TRIM(van.plan_pyme_corp::text) <> '') OR
    (van.plan_hogar_adulto_mayor IS NOT NULL AND TRIM(van.plan_hogar_adulto_mayor::text) <> '') OR
    (van.plan_centro_comercial IS NOT NULL AND TRIM(van.plan_centro_comercial::text) <> '')
)`;

// FIX (2026-06-23): misma deduplicación que JOIN_PLAN_NOVONET, aplicada a la
// vista de Jotform Velsa (también puede tener varias filas por negociación).
const JOIN_PLAN_VELSA = `LEFT JOIN (
    SELECT
        id_negociacion_bitrix,
        MAX(plan_casa)                  AS plan_casa,
        MAX(plan_pyme)                   AS plan_pyme,
        MAX(plan_profesional)            AS plan_profesional,
        MAX(plan_hogar_adulto_mayor)     AS plan_hogar_adulto_mayor,
        MAX(plan_pyme_corp)              AS plan_pyme_corp,
        MAX(plan_centro_red_comercial)   AS plan_centro_red_comercial
    FROM public.vw_jotform_velsa_netlife_completo
    GROUP BY id_negociacion_bitrix
) jf2 ON mv.id_jotform::text = jf2.id_negociacion_bitrix::text`;
const HAS_PLAN_VELSA = `(
    (jf2.plan_casa IS NOT NULL AND TRIM(jf2.plan_casa::text) <> '') OR
    (jf2.plan_pyme IS NOT NULL AND TRIM(jf2.plan_pyme::text) <> '') OR
    (jf2.plan_profesional IS NOT NULL AND TRIM(jf2.plan_profesional::text) <> '') OR
    (jf2.plan_hogar_adulto_mayor IS NOT NULL AND TRIM(jf2.plan_hogar_adulto_mayor::text) <> '') OR
    (jf2.plan_pyme_corp IS NOT NULL AND TRIM(jf2.plan_pyme_corp::text) <> '') OR
    (jf2.plan_centro_red_comercial IS NOT NULL AND TRIM(jf2.plan_centro_red_comercial::text) <> '')
)`;

// ── Definición de campos por empresa (fuente, id, fecha, hora, asesor, etapa-crm, estado-jot) ──
const CFG = {
  novonet: {
    from: `public.mestra_bitrix mb`,
    idExterno: `COALESCE(mb.j_id_bitrix::text, mb.b_id::text)`,
    fechaJot: `mb.j_fecha_registro_sistema::date`,
    horaJot: `COALESCE(EXTRACT(HOUR FROM mb.j_fecha_registro_sistema::timestamp)::int, -1)`,
    asesor: `COALESCE(NULLIF(TRIM(mb.b_persona_responsable), ''), 'SIN ASIGNAR')`,
    etapaCrm: `mb.b_etapa_de_la_negociacion`,
    estadoJot: `COALESCE(NULLIF(TRIM(UPPER(mb.j_netlife_estatus_real)), ''), 'SIN ESTADO')`,
    whereJot: `mb.j_id_bitrix IS NOT NULL`,
    joinPlan: JOIN_PLAN_NOVONET,
    esVentaServicio: `(UPPER(TRIM(mb.j_netlife_estatus_real)) = 'ACTIVO' AND ${HAS_PLAN_NOVONET})`,
    selectExtra: `
      mb.b_id              AS id_crm,
      mb.j_id_bitrix       AS id_jotform,
      mb.j_netlife_login   AS login,
      mb.j_forma_pago      AS forma_pago,
      mb.j_estatus_regularizacion AS estado_regularizacion,
      mb.j_novedades_atc   AS novedades_atc,
      mb.j_fecha_activacion_netlife AS fecha_activacion,
      mb.j_fecha_agenda    AS fecha_agenda
    `,
  },
  velsa: {
    from: `public.mv_indicadores_velsa_completo mv`,
    idExterno: `COALESCE(mv.id_jotform::text, mv.id_crm::text)`,
    fechaJot: `(mv.fecha_registro_jotform - INTERVAL '5 hours')::date`,
    horaJot: `COALESCE(EXTRACT(HOUR FROM (mv.fecha_registro_jotform::timestamp - INTERVAL '5 hours'))::int, -1)`,
    asesor: `COALESCE(NULLIF(TRIM(mv.asesor), ''), 'SIN ASIGNAR')`,
    etapaCrm: `mv.etapa_crm`,
    estadoJot: `COALESCE(NULLIF(TRIM(UPPER(mv.estado_venta)), ''), 'SIN ESTADO')`,
    whereJot: `mv.id_jotform IS NOT NULL`,
    joinPlan: JOIN_PLAN_VELSA,
    esVentaServicio: `(UPPER(TRIM(mv.estado_venta)) = 'ACTIVO' AND ${HAS_PLAN_VELSA})`,
    selectExtra: `
      mv.id_crm            AS id_crm,
      mv.id_jotform         AS id_jotform,
      mv.forma_pago         AS forma_pago,
      mv.estado_venta       AS estado_regularizacion,
      mv.supervisor         AS supervisor
    `,
  },
};

// ─────────────────────────────────────────────────────────────────────────
// GET /api/backoffice-jotform/listado
// ─────────────────────────────────────────────────────────────────────────
async function getListado(req, res) {
  try {
    const empresa = validarEmpresa(req, res);
    if (!empresa) return;
    const rango = rangoFechas(req, res);
    if (!rango) return;
    const c = CFG[empresa];

    const page     = Math.max(parseInt(req.query.page) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(req.query.pageSize) || 50, 1), 200);
    const offset   = (page - 1) * pageSize;

    const where = [`${c.fechaJot} BETWEEN $1::date AND $2::date`, c.whereJot];
    const values = [rango.desde, rango.hasta];

    if (req.query.asesor) {
      values.push(`%${req.query.asesor}%`);
      where.push(`${c.asesor} ILIKE $${values.length}`);
    }
    if (req.query.etapa) {
      values.push(`%${req.query.etapa}%`);
      where.push(`(UPPER(${c.etapaCrm}) ILIKE UPPER($${values.length}) OR ${c.estadoJot} ILIKE $${values.length})`);
    }
    if (req.query.q) {
      values.push(`%${req.query.q}%`);
      where.push(`${c.idExterno} ILIKE $${values.length}`);
    }
    if (req.query.estadoRevision) {
      values.push(req.query.estadoRevision.toUpperCase());
      where.push(`COALESCE(r.estado_revision, 'PENDIENTE') = $${values.length}`);
    }

    const sql = `
      SELECT
        ${c.idExterno}        AS id_externo,
        ${c.fechaJot}::text   AS fecha,
        ${c.horaJot}          AS hora,
        ${c.asesor}           AS asesor,
        UPPER(TRIM(${c.etapaCrm})) AS etapa_crm,
        ${c.estadoJot}        AS estado_jot,
        ${esGestionableExpr(c.etapaCrm)} AS gestionable,
        ${c.esVentaServicio} AS es_venta_servicio,
        ${c.selectExtra},
        COALESCE(r.estado_revision, 'PENDIENTE') AS estado_revision,
        r.observacion         AS observacion,
        r.revisado_por        AS revisado_por,
        r.revisado_en         AS revisado_en
      FROM ${c.from}
      ${c.joinPlan}
      LEFT JOIN public.backoffice_jotform_revision r
        ON r.empresa = '${empresa.toUpperCase()}' AND r.id_externo = ${c.idExterno}
      WHERE ${where.join(' AND ')}
      ORDER BY ${c.fechaJot} DESC, ${c.horaJot} DESC
      LIMIT $${values.length + 1} OFFSET $${values.length + 2}
    `;
    const countSql = `
      SELECT COUNT(*)::int AS total
      FROM ${c.from}
      LEFT JOIN public.backoffice_jotform_revision r
        ON r.empresa = '${empresa.toUpperCase()}' AND r.id_externo = ${c.idExterno}
      WHERE ${where.join(' AND ')}
    `;

    const [{ rows }, { rows: countRows }] = await Promise.all([
      pool.query(sql, [...values, pageSize, offset]),
      pool.query(countSql, values),
    ]);

    res.json({
      success: true,
      empresa,
      rango,
      page,
      pageSize,
      total: countRows[0].total,
      data: rows,
    });
  } catch (err) {
    console.error('[BackofficeJotform][listado]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────
// GET /api/backoffice-jotform/kpis
// ─────────────────────────────────────────────────────────────────────────
async function getKpis(req, res) {
  try {
    const empresa = validarEmpresa(req, res);
    if (!empresa) return;
    const rango = rangoFechas(req, res);
    if (!rango) return;
    const c = CFG[empresa];

    const sql = `
      SELECT
        COUNT(*)::int AS ingresados,
        COUNT(*) FILTER (WHERE ${esGestionableExpr(c.etapaCrm)})::int AS gestionables,
        COUNT(*) FILTER (WHERE ${c.estadoJot} = 'ACTIVO')::int AS activos,
        COUNT(*) FILTER (WHERE ${c.esVentaServicio})::int AS venta_servicio,
        COUNT(*) FILTER (WHERE COALESCE(r.estado_revision,'PENDIENTE') = 'PENDIENTE')::int AS pendientes_revision,
        COUNT(*) FILTER (WHERE r.estado_revision = 'APROBADO')::int AS aprobados,
        COUNT(*) FILTER (WHERE r.estado_revision = 'RECHAZADO')::int AS rechazados,
        COUNT(DISTINCT ${c.asesor})::int AS asesores_activos
      FROM ${c.from}
      ${c.joinPlan}
      LEFT JOIN public.backoffice_jotform_revision r
        ON r.empresa = '${empresa.toUpperCase()}' AND r.id_externo = ${c.idExterno}
      WHERE ${c.fechaJot} BETWEEN $1::date AND $2::date AND ${c.whereJot}
    `;
    const { rows } = await pool.query(sql, [rango.desde, rango.hasta]);
    res.json({ success: true, empresa, rango, kpis: rows[0] });
  } catch (err) {
    console.error('[BackofficeJotform][kpis]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────
// GET /api/backoffice-jotform/embudo
// Segmentable por asesor (?asesor=) — devuelve además desglose por asesor y por hora
// ─────────────────────────────────────────────────────────────────────────
async function getEmbudo(req, res) {
  try {
    const empresa = validarEmpresa(req, res);
    if (!empresa) return;
    const rango = rangoFechas(req, res);
    if (!rango) return;
    const c = CFG[empresa];

    const where = [`${c.fechaJot} BETWEEN $1::date AND $2::date`, c.whereJot];
    const values = [rango.desde, rango.hasta];
    if (req.query.asesor) {
      values.push(`%${req.query.asesor}%`);
      where.push(`${c.asesor} ILIKE $${values.length}`);
    }
    const whereSql = where.join(' AND ');

    // Totales generales del embudo
    const totalSql = `
      SELECT
        COUNT(*)::int AS ingresados,
        COUNT(*) FILTER (WHERE ${esGestionableExpr(c.etapaCrm)})::int AS gestionables,
        COUNT(*) FILTER (WHERE ${c.estadoJot} = 'ACTIVO')::int AS activos,
        COUNT(*) FILTER (WHERE ${c.esVentaServicio})::int AS venta_servicio
      FROM ${c.from}
      ${c.joinPlan}
      WHERE ${whereSql}
    `;

    // Desglose por asesor (cada etapa del embudo)
    const porAsesorSql = `
      SELECT
        ${c.asesor} AS asesor,
        COUNT(*)::int AS ingresados,
        COUNT(*) FILTER (WHERE ${esGestionableExpr(c.etapaCrm)})::int AS gestionables,
        COUNT(*) FILTER (WHERE ${c.estadoJot} = 'ACTIVO')::int AS activos,
        COUNT(*) FILTER (WHERE ${c.esVentaServicio})::int AS venta_servicio
      FROM ${c.from}
      ${c.joinPlan}
      WHERE ${whereSql}
      GROUP BY 1
      ORDER BY ingresados DESC
    `;

    // Desglose por hora (0-23) del embudo — para ver el cuello de botella horario
    const porHoraSql = `
      SELECT
        ${c.horaJot} AS hora,
        COUNT(*)::int AS ingresados,
        COUNT(*) FILTER (WHERE ${esGestionableExpr(c.etapaCrm)})::int AS gestionables,
        COUNT(*) FILTER (WHERE ${c.estadoJot} = 'ACTIVO')::int AS activos,
        COUNT(*) FILTER (WHERE ${c.esVentaServicio})::int AS venta_servicio
      FROM ${c.from}
      ${c.joinPlan}
      WHERE ${whereSql}
      GROUP BY 1
      ORDER BY 1
    `;

    // Desglose por etapa CRM puntual (para detectar en qué etapa exacta se atascan)
    const porEtapaSql = `
      SELECT
        UPPER(TRIM(${c.etapaCrm})) AS etapa,
        COUNT(*)::int AS cantidad
      FROM ${c.from}
      WHERE ${whereSql}
      GROUP BY 1
      ORDER BY cantidad DESC
      LIMIT 30
    `;

    const [{ rows: totalRows }, { rows: asesorRows }, { rows: horaRows }, { rows: etapaRows }] = await Promise.all([
      pool.query(totalSql, values),
      pool.query(porAsesorSql, values),
      pool.query(porHoraSql, values),
      pool.query(porEtapaSql, values),
    ]);

    const t = totalRows[0];
    const etapas = [
      { etapa: 'Ingresados',        cantidad: t.ingresados },
      { etapa: 'Gestionables',      cantidad: t.gestionables },
      { etapa: 'Activos',           cantidad: t.activos },
      { etapa: 'Venta de Servicio', cantidad: t.venta_servicio },
    ];
    // % conversión entre etapas consecutivas + detección de cuello de botella
    let cuelloDeBottella = null;
    let peorConversion = Infinity;
    for (let i = 1; i < etapas.length; i++) {
      const prev = etapas[i - 1].cantidad;
      const conv = prev > 0 ? (etapas[i].cantidad / prev) * 100 : 0;
      etapas[i].conversion_pct = Math.round(conv * 10) / 10;
      etapas[i].caida_pct = Math.round((100 - conv) * 10) / 10;
      if (conv < peorConversion) {
        peorConversion = conv;
        cuelloDeBottella = { de: etapas[i - 1].etapa, a: etapas[i].etapa, conversion_pct: etapas[i].conversion_pct };
      }
    }

    // Mismo cálculo de conversión aplicado a cada asesor y cada hora, para ubicar el cuello de botella segmentado
    const conConversion = (row) => {
      const g = row.ingresados > 0 ? (row.gestionables / row.ingresados) * 100 : 0;
      const a = row.gestionables > 0 ? (row.activos / row.gestionables) * 100 : 0;
      const vs = row.activos > 0 ? (row.venta_servicio / row.activos) * 100 : 0;
      return {
        ...row,
        conversion_gestionable_pct: Math.round(g * 10) / 10,
        conversion_activo_pct: Math.round(a * 10) / 10,
        conversion_venta_servicio_pct: Math.round(vs * 10) / 10,
      };
    };

    res.json({
      success: true,
      empresa,
      rango,
      embudo: etapas,
      cuello_de_botella: cuelloDeBottella,
      por_asesor: asesorRows.map(conConversion),
      por_hora: horaRows.map(conConversion),
      por_etapa: etapaRows,
    });
  } catch (err) {
    console.error('[BackofficeJotform][embudo]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────
// GET /api/backoffice-jotform/heatmap  → matriz asesor x hora (cantidad de ingresos)
// ─────────────────────────────────────────────────────────────────────────
async function getHeatmap(req, res) {
  try {
    const empresa = validarEmpresa(req, res);
    if (!empresa) return;
    const rango = rangoFechas(req, res);
    if (!rango) return;
    const c = CFG[empresa];

    const where = [`${c.fechaJot} BETWEEN $1::date AND $2::date`, c.whereJot];
    const values = [rango.desde, rango.hasta];
    if (req.query.asesor) {
      values.push(`%${req.query.asesor}%`);
      where.push(`${c.asesor} ILIKE $${values.length}`);
    }

    const sql = `
      SELECT
        ${c.asesor} AS asesor,
        ${c.horaJot} AS hora,
        COUNT(*)::int AS cantidad
      FROM ${c.from}
      WHERE ${where.join(' AND ')}
      GROUP BY 1,2
      ORDER BY 1,2
    `;
    const { rows } = await pool.query(sql, values);
    res.json({ success: true, empresa, rango, celdas: rows });
  } catch (err) {
    console.error('[BackofficeJotform][heatmap]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────
// POST /api/backoffice-jotform/revision  { empresa, id_externo, estado_revision, observacion }
// ─────────────────────────────────────────────────────────────────────────
async function setRevision(req, res) {
  try {
    const empresa = (req.body.empresa || '').toLowerCase();
    if (!EMPRESAS.includes(empresa)) {
      return res.status(400).json({ success: false, error: 'Empresa inválida (novonet|velsa)' });
    }
    const { id_externo, estado_revision, observacion } = req.body;
    if (!id_externo) return res.status(400).json({ success: false, error: 'id_externo es requerido' });
    const estado = (estado_revision || 'PENDIENTE').toUpperCase();
    if (!['PENDIENTE', 'APROBADO', 'RECHAZADO'].includes(estado)) {
      return res.status(400).json({ success: false, error: 'estado_revision inválido (PENDIENTE|APROBADO|RECHAZADO)' });
    }

    const revisadoPor = req.user?.nombre || req.user?.usuario || 'sistema';

    const { rows } = await pool.query(`
      INSERT INTO public.backoffice_jotform_revision
        (empresa, id_externo, estado_revision, observacion, revisado_por, revisado_en)
      VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (empresa, id_externo) DO UPDATE SET
        estado_revision = EXCLUDED.estado_revision,
        observacion     = EXCLUDED.observacion,
        revisado_por    = EXCLUDED.revisado_por,
        revisado_en     = NOW()
      RETURNING *
    `, [empresa.toUpperCase(), String(id_externo), estado, observacion || null, revisadoPor]);

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('[BackofficeJotform][setRevision]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────
// GET /api/backoffice-jotform/export  → Excel (xlsx) con los filtros del listado (máx 5000 filas)
// ─────────────────────────────────────────────────────────────────────────
async function exportExcel(req, res) {
  try {
    const empresa = validarEmpresa(req, res);
    if (!empresa) return;
    const rango = rangoFechas(req, res);
    if (!rango) return;
    const c = CFG[empresa];

    const where = [`${c.fechaJot} BETWEEN $1::date AND $2::date`, c.whereJot];
    const values = [rango.desde, rango.hasta];
    if (req.query.asesor) {
      values.push(`%${req.query.asesor}%`);
      where.push(`${c.asesor} ILIKE $${values.length}`);
    }
    if (req.query.estadoRevision) {
      values.push(req.query.estadoRevision.toUpperCase());
      where.push(`COALESCE(r.estado_revision, 'PENDIENTE') = $${values.length}`);
    }

    const sql = `
      SELECT
        ${c.idExterno}        AS id_externo,
        ${c.fechaJot}::text   AS fecha,
        ${c.horaJot}          AS hora,
        ${c.asesor}           AS asesor,
        UPPER(TRIM(${c.etapaCrm})) AS etapa_crm,
        ${c.estadoJot}        AS estado_jot,
        ${c.esVentaServicio} AS es_venta_servicio,
        COALESCE(r.estado_revision, 'PENDIENTE') AS estado_revision,
        r.observacion         AS observacion,
        r.revisado_por        AS revisado_por
      FROM ${c.from}
      ${c.joinPlan}
      LEFT JOIN public.backoffice_jotform_revision r
        ON r.empresa = '${empresa.toUpperCase()}' AND r.id_externo = ${c.idExterno}
      WHERE ${where.join(' AND ')}
      ORDER BY ${c.fechaJot} DESC, ${c.horaJot} DESC
      LIMIT 5000
    `;
    const { rows } = await pool.query(sql, values);

    const XLSX = require('xlsx');
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'BackofficeJotform');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="backoffice_jotform_${empresa}_${rango.desde}_${rango.hasta}.xlsx"`);
    res.send(buf);
  } catch (err) {
    console.error('[BackofficeJotform][export]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

module.exports = { getListado, getKpis, getEmbudo, getHeatmap, setRevision, exportExcel };
