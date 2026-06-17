const pool = require('../config/db');

// ─────────────────────────────────────────────────────────────────────────────
// MONITOREO REDES VELSA
// Fuente: mv_monitoreo_redes_velsa (creada sobre mv_indicadores_velsa_completo).
//
// A diferencia del módulo "Redes" de NOVONET, aquí NO existe un catálogo de
// canal/inversión (no hay velsa_lineas_canal ni mapeo origen→grupo).
// Se trabaja directamente con "canal_publicidad" = origen_venta/origen crudo
// tal como llega de Bitrix/GHL/JotForm. Instrucción explícita del cliente:
// "no generamos un catalogo de pautas, todos los origenes son diferentes,
// asi vamos".
//
// SÍ se permite cargar el monto de inversión/pauta diario por origen,
// directamente sobre el valor crudo de canal_publicidad (sin catálogo),
// en la tabla velsa_inversion_redes (fecha, canal_publicidad, monto_usd).
// Con eso se calculan CPL (costo por lead) y costo por venta subida.
// ─────────────────────────────────────────────────────────────────────────────

const getFiltroFechas = (query) => {
  const hoy = new Date().toISOString().split('T')[0];
  return {
    fechaDesde: query.fechaDesde || hoy,
    fechaHasta: query.fechaHasta || hoy,
  };
};

const buildInWhere = (valores, offsetInicial, field) => {
  if (!valores || valores.length === 0) return { where: '', params: [] };
  const ph = valores.map((_, i) => `$${offsetInicial + i + 1}`).join(', ');
  return { where: `AND ${field} IN (${ph})`, params: valores };
};

// 1. Listado de canales (orígenes) disponibles en el rango — para el filtro del frontend
const getCanalesDisponibles = async (req, res) => {
  try {
    const { fechaDesde, fechaHasta } = getFiltroFechas(req.query);
    const result = await pool.query(
      `SELECT canal_publicidad, SUM(n_leads) AS n_leads
       FROM mv_monitoreo_redes_velsa
       WHERE fecha BETWEEN $1 AND $2
       GROUP BY canal_publicidad
       ORDER BY n_leads DESC`,
      [fechaDesde, fechaHasta]
    );
    res.json({ success: true, canales: result.rows });
  } catch (error) {
    console.error('Error en getCanalesDisponibles (RedesVelsa):', error);
    res.status(500).json({ success: false, message: 'Error al obtener canales', error: error.message });
  }
};

// 2. Monitoreo principal: detalle diario por canal + totales agregados
const getMonitoreoRedesVelsa = async (req, res) => {
  try {
    const { fechaDesde, fechaHasta } = getFiltroFechas(req.query);
    const canalesRaw = req.query.canales || '';
    const canalesSel = canalesRaw ? canalesRaw.split(',').map(c => c.trim()).filter(Boolean) : [];
    const { where: canalWhere, params: canalParams } = buildInWhere(canalesSel, 2, 'canal_publicidad');

    const detalleResult = await pool.query(
      `SELECT *
       FROM mv_monitoreo_redes_velsa
       WHERE fecha BETWEEN $1 AND $2
       ${canalWhere}
       ORDER BY fecha DESC, n_leads DESC`,
      [fechaDesde, fechaHasta, ...canalParams]
    );

    const data = detalleResult.rows;
    const sum = (f) => data.reduce((s, r) => s + Number(r[f] || 0), 0);

    const n_leads = sum('n_leads');
    const venta_subida = sum('venta_subida');
    const atc = sum('atc');
    const descartados = sum('fuera_cobertura') + sum('zona_peligrosa') + sum('innegociable') + sum('duplicado') + sum('descarte');

    const totales = {
      n_leads,
      atc,
      fuera_cobertura: sum('fuera_cobertura'),
      zona_peligrosa: sum('zona_peligrosa'),
      innegociable: sum('innegociable'),
      duplicado: sum('duplicado'),
      descarte: sum('descarte'),
      venta_subida,
      seguimiento_negociacion: sum('seguimiento_negociacion'),
      regularizacion: sum('regularizacion'),
      mas_15_dias_cierre: sum('mas_15_dias_cierre'),
      contacto_nuevo_supervisor: sum('contacto_nuevo_supervisor'),
      urgente_gestion_supervisor: sum('urgente_gestion_supervisor'),
      envio_requisitos: sum('envio_requisitos'),
      activos_jotform: sum('activos_jotform'),
      fin_gestion_jotform: sum('fin_gestion_jotform'),
      rechazado_jotform: sum('rechazado_jotform'),
      desiste_servicio_jotform: sum('desiste_servicio_jotform'),
      descartados,
      pct_venta_subida: n_leads > 0 ? +((venta_subida / n_leads) * 100).toFixed(1) : 0,
      pct_atc: n_leads > 0 ? +((atc / n_leads) * 100).toFixed(1) : 0,
      pct_descartado: n_leads > 0 ? +((descartados / n_leads) * 100).toFixed(1) : 0,
    };

    // Resumen por canal (para tabla/torta de distribución)
    const porCanalMap = {};
    data.forEach((row) => {
      const c = row.canal_publicidad || 'SIN ORIGEN';
      if (!porCanalMap[c]) {
        porCanalMap[c] = { canal_publicidad: c, n_leads: 0, atc: 0, venta_subida: 0, descartados: 0 };
      }
      porCanalMap[c].n_leads += Number(row.n_leads || 0);
      porCanalMap[c].atc += Number(row.atc || 0);
      porCanalMap[c].venta_subida += Number(row.venta_subida || 0);
      porCanalMap[c].descartados +=
        Number(row.fuera_cobertura || 0) + Number(row.zona_peligrosa || 0) +
        Number(row.innegociable || 0) + Number(row.duplicado || 0) + Number(row.descarte || 0);
    });
    // Inversión cargada manualmente, agregada por canal en el mismo rango
    const inversionResult = await pool.query(
      `SELECT canal_publicidad, SUM(monto_usd) AS inversion
       FROM velsa_inversion_redes
       WHERE fecha BETWEEN $1 AND $2
       ${canalWhere}
       GROUP BY canal_publicidad`,
      [fechaDesde, fechaHasta, ...canalParams]
    );
    const inversionPorCanal = {};
    let inversion_total = 0;
    inversionResult.rows.forEach((r) => {
      const monto = Number(r.inversion || 0);
      inversionPorCanal[r.canal_publicidad] = monto;
      inversion_total += monto;
    });

    const porCanal = Object.values(porCanalMap)
      .map((row) => {
        const inversion = inversionPorCanal[row.canal_publicidad] || 0;
        return {
          ...row,
          inversion,
          cpl: row.n_leads > 0 && inversion > 0 ? +(inversion / row.n_leads).toFixed(2) : null,
          costo_venta: row.venta_subida > 0 && inversion > 0 ? +(inversion / row.venta_subida).toFixed(2) : null,
        };
      })
      .sort((a, b) => b.n_leads - a.n_leads);

    totales.inversion_total = +inversion_total.toFixed(2);
    totales.cpl_promedio = n_leads > 0 && inversion_total > 0 ? +(inversion_total / n_leads).toFixed(2) : null;
    totales.costo_venta_promedio = venta_subida > 0 && inversion_total > 0 ? +(inversion_total / venta_subida).toFixed(2) : null;

    res.json({ success: true, totales, porCanal, data });
  } catch (error) {
    console.error('Error en getMonitoreoRedesVelsa:', error);
    res.status(500).json({ success: false, message: 'Error al obtener datos', error: error.message });
  }
};

// 3. Serie diaria global (para el gráfico de tendencia, sin desagregar por canal)
const getTendenciaDiaria = async (req, res) => {
  try {
    const { fechaDesde, fechaHasta } = getFiltroFechas(req.query);
    const canalesRaw = req.query.canales || '';
    const canalesSel = canalesRaw ? canalesRaw.split(',').map(c => c.trim()).filter(Boolean) : [];
    const { where: canalWhere, params: canalParams } = buildInWhere(canalesSel, 2, 'canal_publicidad');

    const result = await pool.query(
      `SELECT
         fecha,
         SUM(n_leads) AS n_leads,
         SUM(atc) AS atc,
         SUM(venta_subida) AS venta_subida,
         SUM(fuera_cobertura + zona_peligrosa + innegociable + duplicado + descarte) AS descartados
       FROM mv_monitoreo_redes_velsa
       WHERE fecha BETWEEN $1 AND $2
       ${canalWhere}
       GROUP BY fecha
       ORDER BY fecha ASC`,
      [fechaDesde, fechaHasta, ...canalParams]
    );

    const inversionResult = await pool.query(
      `SELECT fecha, SUM(monto_usd) AS inversion
       FROM velsa_inversion_redes
       WHERE fecha BETWEEN $1 AND $2
       ${canalWhere}
       GROUP BY fecha`,
      [fechaDesde, fechaHasta, ...canalParams]
    );
    const inversionPorFecha = {};
    inversionResult.rows.forEach((r) => {
      const key = new Date(r.fecha).toISOString().split('T')[0];
      inversionPorFecha[key] = Number(r.inversion || 0);
    });

    const data = result.rows.map((row) => {
      const key = new Date(row.fecha).toISOString().split('T')[0];
      const inversion = inversionPorFecha[key] || 0;
      const n_leads = Number(row.n_leads || 0);
      const venta_subida = Number(row.venta_subida || 0);
      return {
        ...row,
        inversion,
        cpl: n_leads > 0 && inversion > 0 ? +(inversion / n_leads).toFixed(2) : null,
        costo_venta: venta_subida > 0 && inversion > 0 ? +(inversion / venta_subida).toFixed(2) : null,
      };
    });

    res.json({ success: true, data });
  } catch (error) {
    console.error('Error en getTendenciaDiaria (RedesVelsa):', error);
    res.status(500).json({ success: false, message: 'Error al obtener tendencia', error: error.message });
  }
};

// 4. Inversión / pauta cargada manualmente — lectura por rango (y canal opcional)
const getInversion = async (req, res) => {
  try {
    const { fechaDesde, fechaHasta } = getFiltroFechas(req.query);
    const canalesRaw = req.query.canales || '';
    const canalesSel = canalesRaw ? canalesRaw.split(',').map(c => c.trim()).filter(Boolean) : [];
    const { where: canalWhere, params: canalParams } = buildInWhere(canalesSel, 2, 'canal_publicidad');

    const result = await pool.query(
      `SELECT id, fecha, canal_publicidad, monto_usd, creado_por, updated_at
       FROM velsa_inversion_redes
       WHERE fecha BETWEEN $1 AND $2
       ${canalWhere}
       ORDER BY fecha DESC, canal_publicidad ASC`,
      [fechaDesde, fechaHasta, ...canalParams]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error en getInversion (RedesVelsa):', error);
    res.status(500).json({ success: false, message: 'Error al obtener inversión', error: error.message });
  }
};

// 5. Inversión / pauta — carga manual (upsert por fecha + canal_publicidad)
// Body acepta un solo registro { fecha, canal_publicidad, monto_usd } o un
// arreglo de registros { items: [...] } para cargar varios de una vez.
const upsertInversion = async (req, res) => {
  const items = Array.isArray(req.body.items) ? req.body.items : [req.body];
  const creadoPor = req.user?.usuario || 'desconocido';

  if (!items.length) {
    return res.status(400).json({ success: false, message: 'No se recibieron datos para guardar' });
  }

  for (const item of items) {
    if (!item.fecha || !item.canal_publicidad || item.monto_usd === undefined || item.monto_usd === null) {
      return res.status(400).json({ success: false, message: 'Cada registro requiere fecha, canal_publicidad y monto_usd' });
    }
    if (Number.isNaN(Number(item.monto_usd)) || Number(item.monto_usd) < 0) {
      return res.status(400).json({ success: false, message: `monto_usd inválido para ${item.canal_publicidad} (${item.fecha})` });
    }
  }

  try {
    const guardados = [];
    for (const item of items) {
      const result = await pool.query(
        `INSERT INTO velsa_inversion_redes (fecha, canal_publicidad, monto_usd, creado_por, updated_at)
         VALUES ($1, $2, $3, $4, now())
         ON CONFLICT (fecha, canal_publicidad) DO UPDATE SET
           monto_usd  = EXCLUDED.monto_usd,
           creado_por = EXCLUDED.creado_por,
           updated_at = now()
         RETURNING id, fecha, canal_publicidad, monto_usd, creado_por, updated_at`,
        [item.fecha, item.canal_publicidad, Number(item.monto_usd), creadoPor]
      );
      guardados.push(result.rows[0]);
    }
    res.json({ success: true, data: guardados });
  } catch (error) {
    console.error('Error en upsertInversion (RedesVelsa):', error);
    res.status(500).json({ success: false, message: 'Error al guardar inversión', error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Réplica del módulo "Redes" de NOVONET para VELSA: Ciudad, Hora, "motivos" y
// reporte mensual. Igual que arriba: SIN catálogo. canal_publicidad se calcula
// siempre igual que en mv_monitoreo_redes_velsa:
//   COALESCE(NULLIF(TRIM(origen_venta),''), NULLIF(TRIM(origen),''), 'SIN ORIGEN')
// Fuente: mv_indicadores_velsa_completo (no tiene ciudad/hora/forma_pago
// pre-agregados en la vista de monitoreo, así que estos endpoints consultan
// la vista completa directamente).
// ─────────────────────────────────────────────────────────────────────────────

const CANAL_EXPR = `COALESCE(NULLIF(TRIM(origen_venta), ''), NULLIF(TRIM(origen), ''), 'SIN ORIGEN')`;

// 6. Monitoreo por ciudad/provincia
const getMonitoreoCiudad = async (req, res) => {
  try {
    const { fechaDesde, fechaHasta } = getFiltroFechas(req.query);
    const canalesRaw = req.query.canales || '';
    const canalesSel = canalesRaw ? canalesRaw.split(',').map(c => c.trim()).filter(Boolean) : [];
    const canalParam = canalesSel.length ? canalesSel : null;

    const result = await pool.query(
      `WITH base AS (
         SELECT
           ${CANAL_EXPR} AS canal_publicidad,
           COALESCE(NULLIF(TRIM(provincia), ''), 'SIN PROVINCIA') AS provincia,
           COALESCE(NULLIF(TRIM(ciudad), ''), 'SIN CIUDAD') AS ciudad,
           etapa_crm
         FROM mv_indicadores_velsa_completo
         WHERE fecha_creacion_date BETWEEN $1 AND $2
           AND ciudad IS NOT NULL AND TRIM(ciudad) <> ''
       )
       SELECT provincia, ciudad,
         count(*) AS n_leads,
         count(*) FILTER (WHERE etapa_crm ~* 'VENTA SUBIDA') AS venta_subida,
         count(*) FILTER (WHERE etapa_crm ~* 'ATC') AS atc
       FROM base
       WHERE ($3::text[] IS NULL OR canal_publicidad = ANY($3::text[]))
       GROUP BY provincia, ciudad
       ORDER BY n_leads DESC`,
      [fechaDesde, fechaHasta, canalParam]
    );

    const porDiaResult = await pool.query(
      `WITH base AS (
         SELECT
           fecha_creacion_date AS fecha,
           ${CANAL_EXPR} AS canal_publicidad,
           COALESCE(NULLIF(TRIM(ciudad), ''), 'SIN CIUDAD') AS ciudad,
           etapa_crm
         FROM mv_indicadores_velsa_completo
         WHERE fecha_creacion_date BETWEEN $1 AND $2
           AND ciudad IS NOT NULL AND TRIM(ciudad) <> ''
       )
       SELECT fecha, ciudad,
         count(*) AS n_leads,
         count(*) FILTER (WHERE etapa_crm ~* 'VENTA SUBIDA') AS venta_subida
       FROM base
       WHERE ($3::text[] IS NULL OR canal_publicidad = ANY($3::text[]))
       GROUP BY fecha, ciudad
       ORDER BY fecha ASC`,
      [fechaDesde, fechaHasta, canalParam]
    );

    res.json({ success: true, porCiudad: result.rows, porCiudadDia: porDiaResult.rows });
  } catch (error) {
    console.error('Error en getMonitoreoCiudad (RedesVelsa):', error);
    res.status(500).json({ success: false, message: 'Error al obtener monitoreo por ciudad', error: error.message });
  }
};

// 7. Monitoreo por hora de creación del lead
const getMonitoreoHora = async (req, res) => {
  try {
    const { fechaDesde, fechaHasta } = getFiltroFechas(req.query);
    const canalesRaw = req.query.canales || '';
    const canalesSel = canalesRaw ? canalesRaw.split(',').map(c => c.trim()).filter(Boolean) : [];
    const canalParam = canalesSel.length ? canalesSel : null;

    const result = await pool.query(
      `WITH base AS (
         SELECT
           ${CANAL_EXPR} AS canal_publicidad,
           EXTRACT(HOUR FROM fecha_creacion_crm)::int AS hora,
           etapa_crm
         FROM mv_indicadores_velsa_completo
         WHERE fecha_creacion_date BETWEEN $1 AND $2
       )
       SELECT hora,
         count(*) AS n_leads,
         count(*) FILTER (WHERE etapa_crm ~* 'VENTA SUBIDA') AS venta_subida,
         count(*) FILTER (WHERE etapa_crm ~* 'ATC') AS atc
       FROM base
       WHERE ($3::text[] IS NULL OR canal_publicidad = ANY($3::text[]))
       GROUP BY hora
       ORDER BY hora`,
      [fechaDesde, fechaHasta, canalParam]
    );

    const porDiaResult = await pool.query(
      `WITH base AS (
         SELECT
           fecha_creacion_date AS fecha,
           ${CANAL_EXPR} AS canal_publicidad,
           EXTRACT(HOUR FROM fecha_creacion_crm)::int AS hora
         FROM mv_indicadores_velsa_completo
         WHERE fecha_creacion_date BETWEEN $1 AND $2
       )
       SELECT fecha, hora, count(*) AS n_leads
       FROM base
       WHERE ($3::text[] IS NULL OR canal_publicidad = ANY($3::text[]))
       GROUP BY fecha, hora
       ORDER BY fecha ASC, hora ASC`,
      [fechaDesde, fechaHasta, canalParam]
    );

    res.json({ success: true, porHora: result.rows, porHoraDia: porDiaResult.rows });
  } catch (error) {
    console.error('Error en getMonitoreoHora (RedesVelsa):', error);
    res.status(500).json({ success: false, message: 'Error al obtener monitoreo por hora', error: error.message });
  }
};

// 8. "Motivos" de no-conversión.
// IMPORTANTE: a diferencia de NOVONET (que tiene un campo de texto libre,
// j_novedades_atc, donde el asesor escribe el motivo detallado del ATC),
// en VELSA NO existe ese campo. Se revisó mv_indicadores_velsa_completo
// columna por columna: lo único disponible es la etapa del CRM (etapa_crm)
// en la que quedó el lead (ATC, FUERA DE COBERTURA, ZONA PELIGROSA,
// INNEGOCIABLE, DUPLICADO, Descarte, etc.). Por eso este endpoint agrupa por
// etapa_crm (excluyendo "Venta Subida") como la aproximación más cercana
// posible con datos reales — no se inventa un desglose que no existe.
const getMonitoreoAtc = async (req, res) => {
  try {
    const { fechaDesde, fechaHasta } = getFiltroFechas(req.query);
    const canalesRaw = req.query.canales || '';
    const canalesSel = canalesRaw ? canalesRaw.split(',').map(c => c.trim()).filter(Boolean) : [];
    const canalParam = canalesSel.length ? canalesSel : null;

    const result = await pool.query(
      `WITH base AS (
         SELECT
           ${CANAL_EXPR} AS canal_publicidad,
           COALESCE(NULLIF(TRIM(etapa_crm), ''), 'SIN ETAPA') AS motivo
         FROM mv_indicadores_velsa_completo
         WHERE fecha_creacion_date BETWEEN $1 AND $2
           AND etapa_crm IS NOT NULL
           AND etapa_crm !~* 'VENTA SUBIDA'
       )
       SELECT motivo, count(*) AS cantidad
       FROM base
       WHERE ($3::text[] IS NULL OR canal_publicidad = ANY($3::text[]))
       GROUP BY motivo
       ORDER BY cantidad DESC`,
      [fechaDesde, fechaHasta, canalParam]
    );

    res.json({
      success: true,
      data: result.rows,
      aviso: 'VELSA no tiene un campo de motivo ATC detallado (texto libre) como NOVONET. Este desglose usa la etapa del CRM de cada lead como aproximación.',
    });
  } catch (error) {
    console.error('Error en getMonitoreoAtc (RedesVelsa):', error);
    res.status(500).json({ success: false, message: 'Error al obtener motivos', error: error.message });
  }
};

// 9. Reporte mensual completo: combina inversión diaria, forma de pago, ciclo
// de venta, ciudad y hora en una sola respuesta (para la pestaña "Reporte").
const getReporteData = async (req, res) => {
  try {
    const { fechaDesde, fechaHasta } = getFiltroFechas(req.query);
    const canalesRaw = req.query.canales || '';
    const canalesSel = canalesRaw ? canalesRaw.split(',').map(c => c.trim()).filter(Boolean) : [];
    const canalParam = canalesSel.length ? canalesSel : null;
    const { where: canalWhere, params: canalParams } = buildInWhere(canalesSel, 2, 'canal_publicidad');

    const diasResult = await pool.query(
      `SELECT to_char(d, 'YYYY-MM-DD') AS fecha
       FROM generate_series($1::date, $2::date, interval '1 day') d`,
      [fechaDesde, fechaHasta]
    );
    const dias = diasResult.rows.map((r) => r.fecha);

    const diarioResult = await pool.query(
      `SELECT fecha,
         SUM(n_leads) AS n_leads,
         SUM(atc) AS atc,
         SUM(venta_subida) AS venta_subida,
         SUM(fuera_cobertura + zona_peligrosa + innegociable + duplicado + descarte) AS descartados
       FROM mv_monitoreo_redes_velsa
       WHERE fecha BETWEEN $1 AND $2
       ${canalWhere}
       GROUP BY fecha`,
      [fechaDesde, fechaHasta, ...canalParams]
    );
    const inversionResult = await pool.query(
      `SELECT fecha, SUM(monto_usd) AS inversion
       FROM velsa_inversion_redes
       WHERE fecha BETWEEN $1 AND $2
       ${canalWhere}
       GROUP BY fecha`,
      [fechaDesde, fechaHasta, ...canalParams]
    );
    const porFecha = {};
    diarioResult.rows.forEach((r) => {
      const key = new Date(r.fecha).toISOString().split('T')[0];
      porFecha[key] = {
        n_leads: Number(r.n_leads || 0),
        atc: Number(r.atc || 0),
        venta_subida: Number(r.venta_subida || 0),
        descartados: Number(r.descartados || 0),
        inversion: 0,
      };
    });
    inversionResult.rows.forEach((r) => {
      const key = new Date(r.fecha).toISOString().split('T')[0];
      if (!porFecha[key]) porFecha[key] = { n_leads: 0, atc: 0, venta_subida: 0, descartados: 0, inversion: 0 };
      porFecha[key].inversion = Number(r.inversion || 0);
    });
    const inversion = dias.map((fecha) => {
      const row = porFecha[fecha] || { n_leads: 0, atc: 0, venta_subida: 0, descartados: 0, inversion: 0 };
      return {
        fecha,
        ...row,
        cpl: row.n_leads > 0 && row.inversion > 0 ? +(row.inversion / row.n_leads).toFixed(2) : null,
        costo_venta: row.venta_subida > 0 && row.inversion > 0 ? +(row.inversion / row.venta_subida).toFixed(2) : null,
      };
    });

    const pagoResult = await pool.query(
      `WITH base AS (
         SELECT
           ${CANAL_EXPR} AS canal_publicidad,
           COALESCE(NULLIF(TRIM(forma_pago), ''), 'SIN ESPECIFICAR') AS forma_pago,
           etapa_crm
         FROM mv_indicadores_velsa_completo
         WHERE fecha_creacion_date BETWEEN $1 AND $2
       )
       SELECT forma_pago, count(*) AS cantidad
       FROM base
       WHERE etapa_crm ~* 'VENTA SUBIDA'
         AND ($3::text[] IS NULL OR canal_publicidad = ANY($3::text[]))
       GROUP BY forma_pago
       ORDER BY cantidad DESC`,
      [fechaDesde, fechaHasta, canalParam]
    );

    const cicloResult = await pool.query(
      `WITH base AS (
         SELECT
           ${CANAL_EXPR} AS canal_publicidad,
           (fecha_activacion_date - fecha_creacion_date) AS dias_ciclo
         FROM mv_indicadores_velsa_completo
         WHERE fecha_creacion_date BETWEEN $1 AND $2
           AND fecha_activacion_date IS NOT NULL
       )
       SELECT
         CASE
           WHEN dias_ciclo <= 0 THEN '0'
           WHEN dias_ciclo = 1 THEN '1'
           WHEN dias_ciclo = 2 THEN '2'
           WHEN dias_ciclo = 3 THEN '3'
           WHEN dias_ciclo = 4 THEN '4'
           ELSE '5+'
         END AS bucket,
         count(*) AS cantidad
       FROM base
       WHERE ($3::text[] IS NULL OR canal_publicidad = ANY($3::text[]))
       GROUP BY 1
       ORDER BY 1`,
      [fechaDesde, fechaHasta, canalParam]
    );

    const ciudadResult = await pool.query(
      `WITH base AS (
         SELECT
           ${CANAL_EXPR} AS canal_publicidad,
           COALESCE(NULLIF(TRIM(provincia), ''), 'SIN PROVINCIA') AS provincia,
           COALESCE(NULLIF(TRIM(ciudad), ''), 'SIN CIUDAD') AS ciudad,
           etapa_crm
         FROM mv_indicadores_velsa_completo
         WHERE fecha_creacion_date BETWEEN $1 AND $2
           AND ciudad IS NOT NULL AND TRIM(ciudad) <> ''
       )
       SELECT provincia, ciudad,
         count(*) AS n_leads,
         count(*) FILTER (WHERE etapa_crm ~* 'VENTA SUBIDA') AS venta_subida
       FROM base
       WHERE ($3::text[] IS NULL OR canal_publicidad = ANY($3::text[]))
       GROUP BY provincia, ciudad
       ORDER BY n_leads DESC
       LIMIT 30`,
      [fechaDesde, fechaHasta, canalParam]
    );

    const horaResult = await pool.query(
      `WITH base AS (
         SELECT
           ${CANAL_EXPR} AS canal_publicidad,
           EXTRACT(HOUR FROM fecha_creacion_crm)::int AS hora,
           etapa_crm
         FROM mv_indicadores_velsa_completo
         WHERE fecha_creacion_date BETWEEN $1 AND $2
       )
       SELECT hora,
         count(*) AS n_leads,
         count(*) FILTER (WHERE etapa_crm ~* 'VENTA SUBIDA') AS venta_subida
       FROM base
       WHERE ($3::text[] IS NULL OR canal_publicidad = ANY($3::text[]))
       GROUP BY hora
       ORDER BY hora`,
      [fechaDesde, fechaHasta, canalParam]
    );

    const canalesResult = await pool.query(
      `SELECT canal_publicidad, SUM(n_leads) AS n_leads
       FROM mv_monitoreo_redes_velsa
       WHERE fecha BETWEEN $1 AND $2
       GROUP BY canal_publicidad
       ORDER BY n_leads DESC`,
      [fechaDesde, fechaHasta]
    );

    res.json({
      success: true,
      meta: { dias, fechaDesde, fechaHasta },
      inversion,
      pago: pagoResult.rows,
      ciclo: cicloResult.rows,
      ciudad: ciudadResult.rows,
      hora: horaResult.rows,
      canales_disponibles: canalesResult.rows,
    });
  } catch (error) {
    console.error('Error en getReporteData (RedesVelsa):', error);
    res.status(500).json({ success: false, message: 'Error al generar reporte', error: error.message });
  }
};

module.exports = {
  getCanalesDisponibles,
  getMonitoreoRedesVelsa,
  getTendenciaDiaria,
  getInversion,
  upsertInversion,
  getMonitoreoCiudad,
  getMonitoreoHora,
  getMonitoreoAtc,
  getReporteData,
};
