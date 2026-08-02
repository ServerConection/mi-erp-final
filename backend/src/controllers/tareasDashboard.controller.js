/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * CONTROLADOR: Dashboard y exportación del módulo de Tareas
 * ═══════════════════════════════════════════════════════════════════════════════
 * Los KPIs respetan la misma visibilidad que la lista: una jefatura ve su área,
 * el administrador ve toda la empresa.
 */

const pool = require('../config/db');
const XLSX = require('xlsx');
const vis  = require('../services/tareasVisibilidad.service');
const svc  = require('../services/tareas.service');
const cfg  = require('../config/tareas.config');

const VISTA = 'public.v_tar_tareas';

function error500(res, ctx, e) {
  console.error(`[tareasDashboard:${ctx}]`, e.message);
  return res.status(500).json({ success: false, error: 'Error interno del servidor' });
}

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/tareas/dashboard
// ══════════════════════════════════════════════════════════════════════════════
exports.dashboard = async (req, res) => {
  try {
    const u = req.tareasUser;

    // Ventana temporal (por defecto: últimos 6 meses)
    const meses = Math.min(Math.max(parseInt(req.query.meses, 10) || 6, 1), 24);

    const params = [];
    const filtro = vis.construirFiltroVisibilidad(u, params, 't');
    const base   = `FROM ${VISTA} t WHERE ${filtro}`;

    const [kpis, porEstado, porArea, porPersona, tendencia, topVencidas] = await Promise.all([

      // ── Tarjetas KPI ──────────────────────────────────────────────────────
      pool.query(
        `SELECT
           count(*)::int                                                   AS total,
           count(*) FILTER (WHERE t.estado NOT IN ('COMPLETADA','CANCELADA'))::int AS abiertas,
           count(*) FILTER (WHERE t.esta_vencida)::int                     AS vencidas,
           count(*) FILTER (WHERE t.estado = 'EN_REVISION')::int           AS en_revision,
           count(*) FILTER (WHERE t.entregada_a_tiempo IS TRUE)::int       AS a_tiempo,
           count(*) FILTER (WHERE t.entregada_a_tiempo IS FALSE)::int      AS con_retraso,
           COALESCE(ROUND(AVG(t.dias_retraso) FILTER (WHERE t.esta_vencida), 1), 0)::float
                                                                           AS promedio_dias_retraso
         ${base}`, params),

      // ── Distribución por estado ───────────────────────────────────────────
      pool.query(
        `SELECT t.estado, count(*)::int AS total
         ${base} GROUP BY t.estado`, params),

      // ── Por área (apilado por estado) ─────────────────────────────────────
      pool.query(
        `SELECT COALESCE(t.area_responsable_nombre, 'Sin área') AS area,
                count(*)::int                                              AS total,
                count(*) FILTER (WHERE t.estado = 'PENDIENTE')::int        AS pendientes,
                count(*) FILTER (WHERE t.estado = 'EN_PROCESO')::int       AS en_proceso,
                count(*) FILTER (WHERE t.estado = 'EN_REVISION')::int      AS en_revision,
                count(*) FILTER (WHERE t.estado = 'COMPLETADA')::int       AS completadas,
                count(*) FILTER (WHERE t.esta_vencida)::int                AS vencidas
         ${base}
         GROUP BY t.area_responsable_nombre
         ORDER BY total DESC`, params),

      // ── Carga por persona ─────────────────────────────────────────────────
      pool.query(
        `SELECT t.responsable_id,
                t.responsable_nombre                                       AS persona,
                COALESCE(t.area_responsable_nombre,'Sin área')             AS area,
                count(*) FILTER (WHERE t.estado NOT IN ('COMPLETADA','CANCELADA'))::int AS abiertas,
                count(*) FILTER (WHERE t.esta_vencida)::int                AS vencidas,
                count(*) FILTER (WHERE t.estado = 'COMPLETADA')::int       AS completadas
         ${base}
         GROUP BY t.responsable_id, t.responsable_nombre, t.area_responsable_nombre
         HAVING count(*) FILTER (WHERE t.estado NOT IN ('COMPLETADA','CANCELADA')) > 0
            OR  count(*) FILTER (WHERE t.estado = 'COMPLETADA') > 0
         ORDER BY abiertas DESC, vencidas DESC`, params),

      // ── Tendencia mensual de cumplimiento ─────────────────────────────────
      pool.query(
        `SELECT to_char(date_trunc('month', t.fecha_limite), 'YYYY-MM')    AS mes,
                count(*)::int                                              AS total,
                count(*) FILTER (WHERE t.entregada_a_tiempo IS TRUE)::int  AS a_tiempo,
                count(*) FILTER (WHERE t.entregada_a_tiempo IS FALSE)::int AS con_retraso
         ${base}
           AND t.fecha_limite >= date_trunc('month', CURRENT_DATE) - make_interval(months => ${meses - 1})
           AND t.fecha_limite <  date_trunc('month', CURRENT_DATE) + interval '1 month'
         GROUP BY 1 ORDER BY 1`, params),

      // ── Las 10 más vencidas ───────────────────────────────────────────────
      pool.query(
        `SELECT t.id, t.codigo, t.titulo, t.prioridad, t.estado,
                t.fecha_limite, t.dias_retraso,
                t.responsable_nombre, t.area_responsable_nombre, t.solicitante_nombre
         ${base} AND t.esta_vencida = true
         ORDER BY t.dias_retraso DESC LIMIT 10`, params),
    ]);

    const k = kpis.rows[0];
    const cerradas = k.a_tiempo + k.con_retraso;
    const cumplimiento = cerradas > 0 ? Math.round((k.a_tiempo / cerradas) * 1000) / 10 : null;

    // Normaliza los estados para que el gráfico siempre tenga las 5 series
    const mapaEstado = Object.fromEntries(porEstado.rows.map(r => [r.estado, r.total]));
    const distribucion = Object.values(cfg.ESTADOS).map(e => ({
      estado:   e,
      etiqueta: cfg.ETIQUETAS_ESTADO[e],
      total:    mapaEstado[e] || 0,
    }));

    res.json({
      success: true,
      data: {
        kpis: {
          total:                 k.total,
          abiertas:              k.abiertas,
          vencidas:              k.vencidas,
          en_revision:           k.en_revision,
          a_tiempo:              k.a_tiempo,
          con_retraso:           k.con_retraso,
          cumplimiento_pct:      cumplimiento,
          promedio_dias_retraso: k.promedio_dias_retraso,
        },
        por_estado:    distribucion,
        por_area:      porArea.rows,
        por_persona:   porPersona.rows,
        tendencia:     tendencia.rows.map(r => ({
          ...r,
          cumplimiento_pct: (r.a_tiempo + r.con_retraso) > 0
            ? Math.round((r.a_tiempo / (r.a_tiempo + r.con_retraso)) * 1000) / 10
            : null,
        })),
        top_vencidas:  topVencidas.rows,
        alcance: u.esAdmin
          ? `Toda la empresa ${u.empresa}`
          : (u.esJefatura ? `Área ${u.areaNombre}` : 'Solo mis tareas'),
      },
    });

  } catch (e) { return error500(res, 'dashboard', e); }
};

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/tareas/exportar  →  archivo .xlsx
// Acepta los mismos filtros que GET /api/tareas
// ══════════════════════════════════════════════════════════════════════════════
exports.exportar = async (req, res) => {
  try {
    const u = req.tareasUser;

    const { tareas } = await svc.listarTareas(u, { ...req.query, limit: 200, page: 1 });

    // Si hay más de una página, las traemos todas (tope de seguridad: 5000 filas)
    let todas = tareas;
    const total = await (async () => {
      const r = await svc.listarTareas(u, { ...req.query, limit: 1, page: 1 });
      return r.paginacion.total;
    })();

    if (total > todas.length) {
      const paginas = Math.min(Math.ceil(total / 200), 25);
      todas = [];
      for (let p = 1; p <= paginas; p++) {
        const r = await svc.listarTareas(u, { ...req.query, limit: 200, page: p });
        todas.push(...r.tareas);
      }
    }

    const filas = todas.map(t => ({
      'Código':             t.codigo,
      'Tipo':               cfg.ETIQUETAS_TIPO[t.tipo] || t.tipo,
      'Título':             t.titulo,
      'Descripción':        t.descripcion || '',
      'Proyecto':           t.proyecto_nombre || '',
      'Estado':             cfg.ETIQUETAS_ESTADO[t.estado] || t.estado,
      'Prioridad':          cfg.ETIQUETAS_PRIORIDAD[t.prioridad] || t.prioridad,
      'Solicitante':        t.solicitante_nombre,
      'Área solicitante':   t.solicitante_area_nombre || '',
      'Responsable':        t.responsable_nombre,
      'Área responsable':   t.area_responsable_nombre || '',
      'Áreas involucradas': (t.areas_involucradas || []).map(a => a.nombre).join(', '),
      'Fecha solicitud':    fecha(t.fecha_solicitud),
      'Fecha inicio':       fecha(t.fecha_inicio),
      'Fecha límite':       fecha(t.fecha_limite),
      'Fecha completada':   fecha(t.fecha_completada),
      '¿Vencida?':          t.esta_vencida ? 'SÍ' : 'No',
      'Días de retraso':    t.esta_vencida ? t.dias_retraso : '',
      '¿A tiempo?':         t.entregada_a_tiempo === null ? '' : (t.entregada_a_tiempo ? 'SÍ' : 'No'),
      'Progreso %':         t.progreso,
      'Subtareas':          t.total_subtareas,
      'Subtareas abiertas': t.subtareas_abiertas,
      'Comentarios':        t.total_comentarios,
    }));

    if (filas.length === 0) {
      filas.push({ 'Código': 'Sin resultados para los filtros aplicados' });
    }

    const ws = XLSX.utils.json_to_sheet(filas);
    ws['!cols'] = [
      { wch: 16 }, { wch: 11 }, { wch: 45 }, { wch: 50 }, { wch: 22 },
      { wch: 13 }, { wch: 11 }, { wch: 26 }, { wch: 20 }, { wch: 26 },
      { wch: 20 }, { wch: 30 }, { wch: 15 }, { wch: 13 }, { wch: 13 },
      { wch: 17 }, { wch: 10 }, { wch: 15 }, { wch: 11 }, { wch: 11 },
      { wch: 10 }, { wch: 17 }, { wch: 12 },
    ];
    ws['!autofilter'] = { ref: ws['!ref'] };

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Tareas');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const nombre = `tareas_${u.empresa}_${new Date().toISOString().slice(0, 10)}.xlsx`;

    res.setHeader('Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
    res.send(buffer);

  } catch (e) { return error500(res, 'exportar', e); }
};

function fecha(f) {
  if (!f) return '';
  const d = new Date(f);
  return Number.isNaN(d.getTime()) ? String(f) : d.toISOString().slice(0, 10);
}
