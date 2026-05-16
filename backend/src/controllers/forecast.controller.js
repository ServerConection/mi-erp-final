/**
 * Forecast Controller
 * Consume: public.mv_monitoreo_publicidad + public.mestra_bitrix + public.forecast_objetivos
 *
 * Endpoints:
 *   GET  /api/forecast/dashboard      — KPIs reales vs objetivos por campaña
 *   GET  /api/forecast/diario/:canal  — Desglose diario de una campaña
 *   GET  /api/forecast/ejecutivos     — %TC por asesor / supervisor
 *   GET  /api/forecast/objetivos      — Leer objetivos guardados
 *   POST /api/forecast/objetivos      — Guardar/actualizar objetivos (admin)
 */

const pool = require('../config/db');

// ─── Helpers ─────────────────────────────────────────────────────────────────

const primerDia = (mes, anio) =>
  `${anio}-${String(mes).padStart(2, '0')}-01`;

const ultimoDia = (mes, anio) => {
  const d = new Date(anio, mes, 0).getDate();
  return `${anio}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
};

// Mapeo campaña → orígenes Bitrix (b_origen)
const CAMPANA_ORIGENES = {
  'ARTS FACEBOOK':  ['BASE 593-995211968'],
  'ARTS GOOGLE':    ['BASE 593-992827793', 'FORMULARIO LANDING 3', 'LLAMADA LANDING 3'],
  'REMARKETING':    ['BASE 593-958993371', 'BASE 593-984414273', 'BASE 593-995967355', 'WHATSAPP 593958993371'],
  'VIDIKA GOOGLE':  ['BASE 593-962881280', 'BASE 593-987133635', 'BASE API 593963463480', 'FORMULARIO LANDING 4', 'LLAMADA', 'LLAMADA LANDING 4'],
  'ARTS':           ['BASE 593-979083368'],
  'POR RECOMENDACIÓN': ['POR RECOMENDACIÓN', 'REFERIDO PERSONAL', 'TIENDA ONLINE'],
};

const getCampanaOrigenes = (campana) => CAMPANA_ORIGENES[campana] || [];

// ════════════════════════════════════════════════════════════════════════════════
// GET /api/forecast/dashboard?empresa=NOVONET&mes=5&anio=2026
// ════════════════════════════════════════════════════════════════════════════════
exports.getDashboard = async (req, res) => {
  try {
    const { empresa = 'NOVONET', mes, anio } = req.query;
    const hoy    = new Date();
    const m      = parseInt(mes  || hoy.getMonth() + 1);
    const y      = parseInt(anio || hoy.getFullYear());
    const desde  = primerDia(m, y);
    const hasta  = ultimoDia(m, y);
    const diasMes    = new Date(y, m, 0).getDate();
    const hoyDia     = hoy.getFullYear() === y && (hoy.getMonth() + 1) === m
      ? hoy.getDate() : diasMes;

    // ── 1. Real por campaña desde mv_monitoreo_publicidad ─────────────────────
    const mvRes = await pool.query(`
      SELECT
        SPLIT_PART(canal_inversion, ' -', 1)        AS campana,
        SUM(n_leads)                                 AS total_leads,
        SUM(atc_soporte)                             AS total_atc,
        SUM(fuera_cobertura) + SUM(zonas_peligrosas) AS total_fc_zp,
        SUM(innegociable)                            AS total_innegociable,
        SUM(negociables)                             AS total_gestionable,
        SUM(venta_subida_bitrix)                     AS total_ventas,
        SUM(activos_mes)                             AS total_activaciones,
        SUM(ingreso_jot)                             AS total_ingreso_jot,
        SUM(inversion_usd)                           AS total_inversion
      FROM public.mv_monitoreo_publicidad
      WHERE fecha BETWEEN $1::date AND $2::date
        AND canal_inversion NOT IN ('MAL INGRESO','SIN MAPEO')
      GROUP BY SPLIT_PART(canal_inversion, ' -', 1)
      ORDER BY SUM(inversion_usd) DESC
    `, [desde, hasta]);

    // ── 2. Objetivos guardados ─────────────────────────────────────────────────
    const objRes = await pool.query(`
      SELECT *
      FROM public.forecast_objetivos
      WHERE empresa = $1 AND mes = $2 AND anio = $3
    `, [empresa, m, y]);

    const objMap = {};
    for (const row of objRes.rows) {
      objMap[row.campana] = row;
    }

    // ── 3. Progreso del mes ────────────────────────────────────────────────────
    const diasTranscurridos = hoyDia;
    const progreso = Math.round((diasTranscurridos / diasMes) * 100);

    // ── 4. Combinar real + objetivos ──────────────────────────────────────────
    const campanas = mvRes.rows.map(row => {
      const obj   = objMap[row.campana] || null;
      const leads = parseInt(row.total_leads) || 0;
      const atc   = parseInt(row.total_atc) || 0;
      const fc_zp = parseInt(row.total_fc_zp) || 0;
      const inneg = parseInt(row.total_innegociable) || 0;
      const gest  = parseInt(row.total_gestionable) || 0;
      const ventas= parseInt(row.total_ventas) || 0;
      const activ = parseInt(row.total_activaciones) || 0;
      const inv   = parseFloat(row.total_inversion) || 0;

      const cpl_real = leads > 0 ? +(inv / leads).toFixed(2) : null;
      const cpa_real = activ > 0 ? +(inv / activ).toFixed(2) : null;

      // Proyección al cierre del mes
      const factor = diasTranscurridos > 0 ? diasMes / diasTranscurridos : 1;
      const leads_proyectado = Math.round(leads * factor);
      const inv_proyectada   = +(inv * factor).toFixed(2);

      return {
        campana:          row.campana,
        // Reales
        total_leads:      leads,
        total_atc:        atc,
        total_fc_zp:      fc_zp,
        total_inneg:      inneg,
        total_gestionable:gest,
        total_ventas:     ventas,
        total_activaciones:activ,
        total_inversion:  +inv.toFixed(2),
        cpl_real,
        cpa_real,
        // Ratios reales
        ratio_atc:        leads > 0 ? +(atc / leads).toFixed(4) : 0,
        ratio_fc_zp:      leads > 0 ? +(fc_zp / leads).toFixed(4) : 0,
        ratio_inneg:      leads > 0 ? +(inneg / leads).toFixed(4) : 0,
        ratio_gestionable:leads > 0 ? +(gest / leads).toFixed(4) : 0,
        ratio_efectividad:gest > 0  ? +(ventas / gest).toFixed(4) : 0,
        ratio_activacion: ventas > 0 ? +(activ / ventas).toFixed(4) : 0,
        // Proyección
        leads_proyectado,
        inv_proyectada,
        cpl_proyectado: leads_proyectado > 0 ? +(inv_proyectada / leads_proyectado).toFixed(2) : null,
        // Objetivos
        objetivo: obj ? {
          inversion_mensual:  parseFloat(obj.inversion_mensual) || 0,
          cpl_objetivo:       parseFloat(obj.cpl_objetivo) || 0,
          cpa_objetivo:       parseFloat(obj.cpa_objetivo) || 0,
          leads_objetivo:     parseInt(obj.leads_objetivo) || 0,
          ventas_objetivo:    parseInt(obj.ventas_objetivo) || 0,
          ratio_atc:          parseFloat(obj.ratio_atc) || 0,
          ratio_fc_zp:        parseFloat(obj.ratio_fc_zp) || 0,
          ratio_innegociable: parseFloat(obj.ratio_innegociable) || 0,
          ratio_gestionable:  parseFloat(obj.ratio_gestionable) || 0,
          ratio_efectividad:  parseFloat(obj.ratio_efectividad) || 0,
          ratio_activacion:   parseFloat(obj.ratio_activacion) || 0,
        } : null,
        // % cumplimiento inversión
        pct_inversion: obj && obj.inversion_mensual > 0
          ? +(inv / obj.inversion_mensual * 100).toFixed(1)
          : null,
        // % cumplimiento leads (vs proyección)
        pct_leads: obj && obj.leads_objetivo > 0
          ? +(leads_proyectado / obj.leads_objetivo * 100).toFixed(1)
          : null,
      };
    });

    // Resumen global
    const totales = campanas.reduce((acc, c) => ({
      total_leads:       acc.total_leads       + c.total_leads,
      total_ventas:      acc.total_ventas      + c.total_ventas,
      total_activaciones:acc.total_activaciones+ c.total_activaciones,
      total_inversion:   +(acc.total_inversion + c.total_inversion).toFixed(2),
    }), { total_leads: 0, total_ventas: 0, total_activaciones: 0, total_inversion: 0 });

    res.json({
      ok: true,
      periodo: { mes: m, anio: y, desde, hasta, dias_mes: diasMes, dias_transcurridos: diasTranscurridos, progreso_pct: progreso },
      empresa,
      campanas,
      totales,
    });
  } catch (e) {
    console.error('[Forecast] getDashboard:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
};

// ════════════════════════════════════════════════════════════════════════════════
// GET /api/forecast/diario/:canal?mes=5&anio=2026
// ════════════════════════════════════════════════════════════════════════════════
exports.getDiario = async (req, res) => {
  try {
    const { canal }   = req.params;
    const { mes, anio } = req.query;
    const hoy  = new Date();
    const m    = parseInt(mes  || hoy.getMonth() + 1);
    const y    = parseInt(anio || hoy.getFullYear());
    const desde = primerDia(m, y);
    const hasta = ultimoDia(m, y);
    const diasMes = new Date(y, m, 0).getDate();

    // Real diario desde MV
    const mvRes = await pool.query(`
      SELECT
        EXTRACT(DAY FROM fecha)::int                  AS dia,
        SUM(n_leads)                                  AS leads,
        SUM(atc_soporte)                              AS atc,
        SUM(fuera_cobertura) + SUM(zonas_peligrosas)  AS fc_zp,
        SUM(innegociable)                             AS inneg,
        SUM(negociables)                              AS gestionable,
        SUM(venta_subida_bitrix)                      AS ventas,
        SUM(activos_mes)                              AS activaciones,
        SUM(inversion_usd)                            AS inversion
      FROM public.mv_monitoreo_publicidad
      WHERE fecha BETWEEN $1::date AND $2::date
        AND SPLIT_PART(canal_inversion, ' -', 1) = $3
        AND canal_inversion NOT IN ('MAL INGRESO','SIN MAPEO')
      GROUP BY dia
      ORDER BY dia ASC
    `, [desde, hasta, canal]);

    // Objetivos para calcular línea guía diaria
    const objRes = await pool.query(`
      SELECT inversion_mensual, cpl_objetivo, leads_objetivo, ventas_objetivo
      FROM public.forecast_objetivos
      WHERE campana = $1 AND mes = $2 AND anio = $3
      LIMIT 1
    `, [canal, m, y]);

    const obj = objRes.rows[0] || null;
    const invDiaria   = obj ? +(obj.inversion_mensual / diasMes).toFixed(2) : null;
    const leadsDiarios = obj ? Math.round(obj.leads_objetivo / diasMes) : null;

    // Construir array completo de días (con 0 para días sin data)
    const dataMap = {};
    for (const row of mvRes.rows) dataMap[row.dia] = row;

    const dias = Array.from({ length: diasMes }, (_, i) => {
      const d   = i + 1;
      const row = dataMap[d] || {};
      return {
        dia:            d,
        leads:          parseInt(row.leads)       || 0,
        atc:            parseInt(row.atc)         || 0,
        fc_zp:          parseInt(row.fc_zp)       || 0,
        inneg:          parseInt(row.inneg)        || 0,
        gestionable:    parseInt(row.gestionable) || 0,
        ventas:         parseInt(row.ventas)       || 0,
        activaciones:   parseInt(row.activaciones)|| 0,
        inversion:      parseFloat(row.inversion) || 0,
        // Guías objetivo del día
        inv_objetivo_dia:   invDiaria,
        leads_objetivo_dia: leadsDiarios,
      };
    });

    res.json({ ok: true, canal, dias, objetivo: obj });
  } catch (e) {
    console.error('[Forecast] getDiario:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
};

// ════════════════════════════════════════════════════════════════════════════════
// GET /api/forecast/ejecutivos?mes=5&anio=2026&empresa=NOVONET&canal=
// ════════════════════════════════════════════════════════════════════════════════
exports.getEjecutivos = async (req, res) => {
  try {
    const { mes, anio, canal } = req.query;
    const hoy  = new Date();
    const m    = parseInt(mes  || hoy.getMonth() + 1);
    const y    = parseInt(anio || hoy.getFullYear());
    const desde = primerDia(m, y);
    const hasta = ultimoDia(m, y);

    // Filtro de campaña por orígenes Bitrix
    let origenWhere = '';
    let params = [desde, hasta];
    if (canal) {
      const origenes = getCampanaOrigenes(canal);
      if (origenes.length > 0) {
        const ph = origenes.map((_, i) => `$${3 + i}`).join(', ');
        origenWhere = `AND mb.b_origen IN (${ph})`;
        params = [...params, ...origenes];
      }
    }

    // JOIN LATERAL con empleados (igual que indicadores.controller.js)
    const parseFecha = (col) =>
      `CASE WHEN ${col} IS NULL OR TRIM(${col}::text) = '' THEN NULL ` +
      `WHEN ${col}::text ~ '^\\d{4}-\\d{2}-\\d{2}' THEN ${col}::text::date ` +
      `ELSE TO_DATE(SUBSTRING(${col}::text FROM 5 FOR 11), 'Mon DD YYYY') END`;

    const res2 = await pool.query(`
      SELECT
        COALESCE(e.supervisor, 'Sin supervisor')      AS supervisor,
        mb.b_persona_responsable                       AS ejecutivo,
        COALESCE(e.codigo, '')                         AS codigo,
        COUNT(*)                                       AS total_leads,
        COUNT(*) FILTER (WHERE mb.b_etapa_de_la_negociacion ILIKE '%ATC%'
          OR mb.b_etapa_de_la_negociacion ILIKE '%SOPORTE%')  AS atc,
        COUNT(*) FILTER (WHERE mb.b_etapa_de_la_negociacion ILIKE '%FUERA DE COBERTURA%'
          OR mb.b_etapa_de_la_negociacion ILIKE '%ZONA%PELIGRO%') AS fc_zp,
        COUNT(*) FILTER (WHERE mb.b_etapa_de_la_negociacion ILIKE '%INNEGOCIABLE%') AS inneg,
        -- Gestionables = leads - ATC - FC/ZP - Inneg - Duplicados
        COUNT(*) FILTER (WHERE mb.b_etapa_de_la_negociacion NOT ILIKE '%ATC%'
          AND mb.b_etapa_de_la_negociacion NOT ILIKE '%SOPORTE%'
          AND mb.b_etapa_de_la_negociacion NOT ILIKE '%FUERA DE COBERTURA%'
          AND mb.b_etapa_de_la_negociacion NOT ILIKE '%ZONA%PELIGRO%'
          AND mb.b_etapa_de_la_negociacion NOT ILIKE '%INNEGOCIABLE%'
          AND mb.b_etapa_de_la_negociacion NOT ILIKE '%DUPLICADO%') AS gestionable,
        COUNT(*) FILTER (WHERE mb.b_etapa_de_la_negociacion ILIKE '%VENTA SUBIDA%') AS ventas,
        COUNT(*) FILTER (WHERE mb.j_netlife_estatus_real ILIKE 'ACTIVO'
          AND mb.j_fecha_activacion_netlife IS NOT NULL
          AND mb.j_fecha_activacion_netlife <> ''
          AND TO_DATE(mb.j_fecha_activacion_netlife, 'YYYY-MM-DD') BETWEEN $1::date AND $2::date) AS activaciones
      FROM public.mestra_bitrix mb
      LEFT JOIN LATERAL (
        SELECT e2.supervisor, e2.codigo
        FROM public.empleados e2
        WHERE e2.nombre_completo = mb.b_persona_responsable
        ORDER BY
          CASE WHEN e2.codigo = EXTRACT(MONTH FROM COALESCE(
            ${parseFecha('mb.b_creado_el_fecha')}
          ))::text THEN 0 ELSE 1 END,
          e2.codigo::int DESC
        LIMIT 1
      ) e ON true
      WHERE mb.b_creado_el_fecha::date BETWEEN $1::date AND $2::date
        AND mb.b_persona_responsable IS NOT NULL
        AND mb.j_id_bitrix IS NULL
        ${origenWhere}
      GROUP BY supervisor, ejecutivo, codigo
      ORDER BY supervisor ASC, total_leads DESC
    `, params);

    // Agrupar por supervisor
    const supervisorMap = {};
    for (const row of res2.rows) {
      const sup = row.supervisor;
      if (!supervisorMap[sup]) {
        supervisorMap[sup] = { supervisor: sup, agentes: [], totales: { total_leads: 0, atc: 0, fc_zp: 0, inneg: 0, gestionable: 0, ventas: 0, activaciones: 0 } };
      }
      const leads = parseInt(row.total_leads) || 0;
      const atc   = parseInt(row.atc) || 0;
      const fc_zp = parseInt(row.fc_zp) || 0;
      const inneg = parseInt(row.inneg) || 0;
      const gest  = parseInt(row.gestionable) || 0;
      const vtas  = parseInt(row.ventas) || 0;
      const actv  = parseInt(row.activaciones) || 0;

      // %TC = descartes / leads (descartes = ATC + FC/ZP + Inneg)
      const descartes = atc + fc_zp + inneg;
      const pct_tc    = leads > 0 ? +(descartes / leads * 100).toFixed(1) : 0;
      const pct_efect = gest > 0  ? +(vtas / gest * 100).toFixed(1) : 0;

      supervisorMap[sup].agentes.push({
        ejecutivo: row.ejecutivo,
        codigo:    row.codigo,
        total_leads: leads,
        atc, fc_zp, inneg, gestionable: gest, ventas: vtas, activaciones: actv,
        descartes,
        pct_tc,
        pct_efect,
      });

      // Acumular totales del supervisor
      const t = supervisorMap[sup].totales;
      t.total_leads    += leads;
      t.atc            += atc;
      t.fc_zp          += fc_zp;
      t.inneg          += inneg;
      t.gestionable    += gest;
      t.ventas         += vtas;
      t.activaciones   += actv;
    }

    // Calcular %TC y efectividad del supervisor
    const equipos = Object.values(supervisorMap).map(eq => {
      const t = eq.totales;
      const desc = t.atc + t.fc_zp + t.inneg;
      return {
        ...eq,
        totales: {
          ...t,
          descartes: desc,
          pct_tc:    t.total_leads > 0 ? +(desc / t.total_leads * 100).toFixed(1) : 0,
          pct_efect: t.gestionable > 0 ? +(t.ventas / t.gestionable * 100).toFixed(1) : 0,
        },
      };
    });

    res.json({ ok: true, periodo: { mes: m, anio: y }, equipos });
  } catch (e) {
    console.error('[Forecast] getEjecutivos:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
};

// ════════════════════════════════════════════════════════════════════════════════
// GET /api/forecast/objetivos?empresa=NOVONET&mes=5&anio=2026
// ════════════════════════════════════════════════════════════════════════════════
exports.getObjetivos = async (req, res) => {
  try {
    const { empresa = 'NOVONET', mes, anio } = req.query;
    const hoy = new Date();
    const m   = parseInt(mes  || hoy.getMonth() + 1);
    const y   = parseInt(anio || hoy.getFullYear());

    const result = await pool.query(
      `SELECT * FROM public.forecast_objetivos
       WHERE empresa=$1 AND mes=$2 AND anio=$3
       ORDER BY campana ASC`,
      [empresa, m, y]
    );
    res.json({ ok: true, data: result.rows });
  } catch (e) {
    console.error('[Forecast] getObjetivos:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
};

// ════════════════════════════════════════════════════════════════════════════════
// POST /api/forecast/objetivos  — ADMIN only (middleware en routes)
// Body: { empresa, campana, mes, anio, inversion_mensual, cpl_objetivo, ... }
// ════════════════════════════════════════════════════════════════════════════════
exports.upsertObjetivos = async (req, res) => {
  try {
    const {
      empresa = 'NOVONET', campana, mes, anio,
      inversion_mensual, cpl_objetivo, cpa_objetivo,
      leads_objetivo, ventas_objetivo,
      ratio_atc, ratio_fc_zp, ratio_innegociable,
      ratio_gestionable, ratio_efectividad, ratio_activacion,
    } = req.body;

    if (!campana || !mes || !anio)
      return res.status(400).json({ ok: false, error: 'campana, mes y anio son requeridos' });

    const result = await pool.query(`
      INSERT INTO public.forecast_objetivos
        (empresa, campana, mes, anio,
         inversion_mensual, cpl_objetivo, cpa_objetivo,
         leads_objetivo, ventas_objetivo,
         ratio_atc, ratio_fc_zp, ratio_innegociable,
         ratio_gestionable, ratio_efectividad, ratio_activacion)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      ON CONFLICT (empresa, campana, mes, anio) DO UPDATE SET
        inversion_mensual   = EXCLUDED.inversion_mensual,
        cpl_objetivo        = EXCLUDED.cpl_objetivo,
        cpa_objetivo        = EXCLUDED.cpa_objetivo,
        leads_objetivo      = EXCLUDED.leads_objetivo,
        ventas_objetivo     = EXCLUDED.ventas_objetivo,
        ratio_atc           = EXCLUDED.ratio_atc,
        ratio_fc_zp         = EXCLUDED.ratio_fc_zp,
        ratio_innegociable  = EXCLUDED.ratio_innegociable,
        ratio_gestionable   = EXCLUDED.ratio_gestionable,
        ratio_efectividad   = EXCLUDED.ratio_efectividad,
        ratio_activacion    = EXCLUDED.ratio_activacion,
        modificado_en       = NOW()
      RETURNING *
    `, [
      empresa, campana, mes, anio,
      inversion_mensual || null, cpl_objetivo || null, cpa_objetivo || null,
      leads_objetivo || null, ventas_objetivo || null,
      ratio_atc || 0, ratio_fc_zp || 0, ratio_innegociable || 0,
      ratio_gestionable || 0, ratio_efectividad || 0, ratio_activacion || 0,
    ]);

    res.json({ ok: true, data: result.rows[0] });
  } catch (e) {
    console.error('[Forecast] upsertObjetivos:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
};
