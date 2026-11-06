/**
 * API del módulo "Bolsa Leads" (ADMINISTRADOR y GERENCIA).
 *   GET  /api/bolsa-leads/estado?fecha=YYYY-MM-DD
 *   PUT  /api/bolsa-leads/config      { activo, modo, patron, encadenar_reparto, reiniciar_ciclo }
 *   POST /api/bolsa-leads/reintentar  { deal_id }
 *   POST /api/bolsa-leads/pendientes  → entrega lo que quedó en Bolsa Leads
 *   GET  /api/bolsa-leads/costos?desde&hasta → costo de la pauta por empresa y eficiencia
 *   GET  /api/bolsa-leads/analisis?desde&hasta → embudo, asesores, hora/día y antes vs piloto
 */
const router = require('express').Router();
const erp = require('../config/dbErp');
const { verificarToken } = require('../middleware/auth');
const { perfilGestionables } = require('../shared/accesoGestionables');
const { leerConfig, leerHorario, distribuir, distribuirPendientes, conectadosPorEmpresa } = require('../controllers/bolsaLeads.controller');
const { patronValido, limpiarPatron, resumenPatron } = require('../shared/bolsaLeadsPatron');

const MODOS = ['proporcion', 'solo_novonet', 'solo_velsa', 'solo_semillero'];
const fechaValida = (f) => /^\d{4}-\d{2}-\d{2}$/.test(String(f || ''));
const usuarioDe = (req) => req.user?.nombreCompleto || req.user?.usuario || `ID ${req.user?.id}`;

router.use(verificarToken, (req, res, next) => {
  if (!['ADMINISTRADOR', 'GERENCIA'].includes(perfilGestionables(req.user?.perfil || req.user?.rol))) {
    return res.status(403).json({ success: false, error: 'Solo administración y gerencia pueden usar Bolsa Leads' });
  }
  next();
});

router.get('/estado', async (req, res) => {
  try {
    const fecha = fechaValida(req.query.fecha) ? req.query.fecha : null;
    const DIA = fecha ? '$1::date' : `(NOW() AT TIME ZONE 'America/Guayaquil')::date`;
    const params = fecha ? [fecha] : [];
    const filtroDia = `(creado_en AT TIME ZONE 'America/Guayaquil')::date = ${DIA}`;
    const cfg = await leerConfig();
    const [horario, conectados, resumen, porHora, movimientos, eventos] = await Promise.all([
      leerHorario(),
      conectadosPorEmpresa({ forzar: req.query.forzar === '1' }),
      erp.query(
        `SELECT COUNT(*) FILTER (WHERE estado = 'entregado' AND empresa = 'novonet')::int AS novonet,
                COUNT(*) FILTER (WHERE estado = 'entregado' AND empresa = 'velsa')::int   AS velsa,
                COUNT(*) FILTER (WHERE estado = 'entregado' AND empresa = 'semillero')::int AS semillero,
                COUNT(*) FILTER (WHERE estado = 'error')::int   AS errores,
                COUNT(*) FILTER (WHERE estado = 'omitido')::int AS omitidos,
                COUNT(*) FILTER (WHERE estado = 'en_espera')::int AS en_espera
           FROM bolsa_leads_entregas WHERE ${filtroDia}`, params),
      erp.query(
        `SELECT EXTRACT(HOUR FROM creado_en AT TIME ZONE 'America/Guayaquil')::int AS hora,
                COUNT(*) FILTER (WHERE empresa = 'novonet')::int AS novonet,
                COUNT(*) FILTER (WHERE empresa = 'velsa')::int   AS velsa,
                COUNT(*) FILTER (WHERE empresa = 'semillero')::int AS semillero
           FROM bolsa_leads_entregas WHERE estado = 'entregado' AND ${filtroDia}
          GROUP BY 1 ORDER BY 1`, params),
      erp.query(
        `SELECT id, bitrix_deal_id, empresa, casilla, modo, estado, detalle, reparto_resultado, origen, creado_en
           FROM bolsa_leads_entregas WHERE ${filtroDia}
          ORDER BY creado_en DESC, id DESC LIMIT 200`, params),
      erp.query('SELECT campo, valor, usuario, creado_en FROM bolsa_leads_eventos ORDER BY creado_en DESC LIMIT 15'),
    ]);
    res.json({
      success: true, config: cfg, patron: resumenPatron(cfg.patron), conectados, horario,
      resumen: resumen.rows[0], porHora: porHora.rows, movimientos: movimientos.rows, eventos: eventos.rows,
    });
  } catch (e) {
    console.error('[bolsaLeads] estado:', e.message);
    res.status(500).json({ success: false, error: 'No se pudo leer. ¿Se corrió la migración 20261029_bolsa_leads.sql?' });
  }
});

router.put('/config', async (req, res) => {
  const b = req.body || {};
  const cambios = {};
  if (typeof b.activo === 'boolean') cambios.activo = b.activo;
  if (typeof b.encadenar_reparto === 'boolean') cambios.encadenar_reparto = b.encadenar_reparto;
  if (typeof b.redirigir_sin_conectados === 'boolean') cambios.redirigir_sin_conectados = b.redirigir_sin_conectados;
  if (b.modo !== undefined) {
    if (!MODOS.includes(b.modo)) return res.status(400).json({ success: false, error: 'Modo inválido' });
    cambios.modo = b.modo;
  }
  if (b.patron !== undefined) {
    if (!patronValido(b.patron)) return res.status(400).json({ success: false, error: 'El ciclo solo puede tener N, V y S (1 a 50 casillas)' });
    cambios.patron = limpiarPatron(b.patron);
  }
  const reiniciar = b.reiniciar_ciclo === true || cambios.patron !== undefined; // patrón nuevo = ciclo desde la casilla 1
  if (!Object.keys(cambios).length && !reiniciar) return res.status(400).json({ success: false, error: 'Nada que actualizar' });

  const client = await erp.connect();
  try {
    await client.query('BEGIN');
    const sets = Object.keys(cambios).map((k, i) => `${k} = $${i + 1}`);
    if (reiniciar) sets.push('posicion = 0');
    const vals = Object.values(cambios);
    sets.push(`actualizado_por = $${vals.length + 1}`, 'actualizado_en = NOW()');
    await client.query(`UPDATE bolsa_leads_config SET ${sets.join(', ')} WHERE id = 1`, [...vals, usuarioDe(req)]);
    const evs = Object.entries(cambios);
    if (reiniciar && cambios.patron === undefined) evs.push(['reiniciar_ciclo', true]);
    for (const [campo, valor] of evs) {
      await client.query('INSERT INTO bolsa_leads_eventos (campo, valor, usuario) VALUES ($1,$2,$3)', [campo, String(valor), usuarioDe(req)]);
    }
    await client.query('COMMIT');
    res.json({ success: true, config: await leerConfig() });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[bolsaLeads] config:', e.message);
    res.status(500).json({ success: false, error: 'No se pudo guardar. ¿Se corrió la migración 20261029_bolsa_leads.sql?' });
  } finally {
    client.release();
  }
});

// ── Reporte de costos: cuánto le costó la pauta a cada empresa ──────────────
//   GET /api/bolsa-leads/costos?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
//   Por defecto: desde el primer lead que repartió la Bolsa hasta hoy.
const ESTADO_ACTIVO = `REGEXP_REPLACE(TRANSLATE(UPPER(COALESCE(e.netlife_estatus_real, '')), 'ÁÉÍÓÚÜÑ', 'AEIOUUN'), '[^A-Z]', '', 'g') = 'ACTIVO'`;
// Arma el reporte de costos (lo usan /costos y /analisis).
// query: { desde, hasta } — por defecto desde el primer lead que repartió la Bolsa hasta hoy.
const armarCostos = async (query) => {
  const req = { query };
    const db = require('../config/db');   // bddgeneral: inversión y ventas
    const { calcularCostos, agruparPorOrigen, costosPorAgencia, normalizarOrigen } = require('../shared/bolsaLeadsCostos');
    const hoy = `(NOW() AT TIME ZONE 'America/Guayaquil')::date`;
    const rango = await erp.query(
      `SELECT to_char(MIN((creado_en AT TIME ZONE 'America/Guayaquil')::date), 'YYYY-MM-DD') AS desde,
              to_char(${hoy}, 'YYYY-MM-DD') AS hoy
         FROM bolsa_leads_entregas WHERE estado = 'entregado'`
    );
    const desde = fechaValida(req.query.desde) ? req.query.desde : (rango.rows[0].desde || rango.rows[0].hoy);
    const hasta = fechaValida(req.query.hasta) ? req.query.hasta : rango.rows[0].hoy;
    if (desde > hasta) throw Object.assign(new Error('La fecha "desde" es mayor que "hasta"'), { status: 400 });

    const entregas = (await erp.query(
      `SELECT bitrix_deal_id AS deal, empresa,
              to_char((creado_en AT TIME ZONE 'America/Guayaquil')::date, 'YYYY-MM-DD') AS fecha,
              EXTRACT(HOUR FROM creado_en AT TIME ZONE 'America/Guayaquil')::int AS hora,
              EXTRACT(ISODOW FROM creado_en AT TIME ZONE 'America/Guayaquil')::int AS dow,
              detalle, origen AS via,
              to_char(creado_en AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS entregado_en
         FROM bolsa_leads_entregas
        WHERE estado = 'entregado'
          AND (creado_en AT TIME ZONE 'America/Guayaquil')::date BETWEEN $1::date AND $2::date
        ORDER BY creado_en`, [desde, hasta]
    )).rows;

    const inversion = [];
    const avisos = [];
    for (const [tabla, sql] of [
      ['novonet', `SELECT to_char(fecha::date, 'YYYY-MM-DD') AS fecha, origen, SUM(monto_usd)::float AS monto
                     FROM public.novonet_inversion_redes WHERE fecha::date BETWEEN $1::date AND $2::date GROUP BY 1, 2`],
      ['velsa', `SELECT to_char(fecha::date, 'YYYY-MM-DD') AS fecha, canal_publicidad AS origen, SUM(monto_usd)::float AS monto
                   FROM public.velsa_inversion_redes WHERE fecha::date BETWEEN $1::date AND $2::date GROUP BY 1, 2`],
    ]) {
      try {
        for (const r of (await db.query(sql, [desde, hasta])).rows) inversion.push({ ...r, tabla });
      } catch (e) {
        console.error(`[bolsaLeads] costos: inversión ${tabla}:`, e.message);
        avisos.push(`No se pudo leer la inversión de ${tabla.toUpperCase()}`);
      }
    }

    const ventas = new Map();
    const ids = [...new Set(entregas.map((x) => String(x.deal)))];
    if (ids.length) {
      try {
        const { rows } = await db.query(
          `SELECT NULLIF(BTRIM(e.id_bitrix::text), '') AS deal,
                  COUNT(*)::int AS ventas,
                  COUNT(*) FILTER (WHERE ${ESTADO_ACTIVO})::int AS activas
             FROM public.envios_ventas e
            WHERE NULLIF(BTRIM(e.id_bitrix::text), '') = ANY($1::text[])
              AND e.estatus_envio IS DISTINCT FROM 'BORRADOR'
            GROUP BY 1`, [ids]
        );
        for (const r of rows) ventas.set(String(r.deal), { ventas: r.ventas, activas: r.activas });
      } catch (e) {
        console.error('[bolsaLeads] costos: ventas:', e.message);
        avisos.push('No se pudieron leer las ventas (envios_ventas)');
      }
    }

    const reporte = calcularCostos({ entregas, inversion, ventas });

    // Origen (campaña) de cada lead y su agencia (ARTS / VIDIKA / VELSA …)
    // Fuente principal: el campo "Origen" del lead en Bitrix (igual para NOVONET,
    // VELSA y SEMILLERO). Se guarda en bolsa_leads_entregas al entregar; lo que
    // falte se pide a Bitrix una vez y queda guardado. El webhook es el último recurso.
    const origenes = new Map();
    const catalogo = new Map();
    if (ids.length) {
      // Velsa primero y Novonet después: si un origen está en los dos catálogos, manda el de Novonet
      for (const tabla of ['public.velsa_lineas_canal', 'public.novonet_lineas_canal']) {
        try {
          const { rows } = await db.query(`SELECT origen, agencia FROM ${tabla} WHERE NULLIF(BTRIM(agencia), '') IS NOT NULL`);
          for (const r of rows) catalogo.set(normalizarOrigen(r.origen), r.agencia);
        } catch (e) {
          console.warn(`[bolsaLeads] costos: catálogo ${tabla}:`, e.message);
        }
      }
      // El catálogo puede tener el nombre del origen o su código de Bitrix: se usa el que exista
      const elegir = ({ id, nombre }) => (catalogo.has(normalizarOrigen(nombre)) || !catalogo.has(normalizarOrigen(id)) ? nombre : id);

      // 1) lo ya guardado al entregar
      try {
        const { rows } = await erp.query(
          `SELECT bitrix_deal_id AS deal, origen_lead_id AS id, origen_lead AS nombre FROM bolsa_leads_entregas
            WHERE estado = 'entregado' AND bitrix_deal_id = ANY($1::text[]) AND origen_lead IS NOT NULL`, [ids]
        );
        for (const r of rows) origenes.set(String(r.deal), elegir(r));
      } catch (e) {
        if (!/origen_lead/.test(e.message)) console.warn('[bolsaLeads] costos: origen guardado:', e.message);
        else avisos.push('Falta correr la migración 20261105_bolsa_leads_origen_lead.sql (el origen se consulta a Bitrix cada vez)');
      }
      // 2) lo que falte, directo de Bitrix (queda guardado)
      const faltanBitrix = ids.filter((id) => !origenes.has(id));
      if (faltanBitrix.length) {
        try {
          const { origenesDesdeBitrix } = require('../controllers/bolsaLeads.controller');
          const deBitrix = await origenesDesdeBitrix(faltanBitrix);
          for (const [deal, o] of deBitrix) origenes.set(deal, elegir(o));
        } catch (e) {
          console.error('[bolsaLeads] costos: origen en Bitrix:', e.message);
          avisos.push('No se pudo consultar el origen en Bitrix; se usa el del webhook');
        }
      }
      // 3) último recurso: lo que guardó el webhook general
      try {
        for (const tabla of ['public.bitrix_webhook_leads', 'public.bitrix_webhook_leads_historial']) {
          const faltan = ids.filter((id) => !origenes.has(id));
          if (!faltan.length) break;
          const { rows } = await db.query(
            `SELECT DISTINCT ON (bitrix_id::text) bitrix_id::text AS deal, NULLIF(BTRIM(source), '') AS origen
               FROM ${tabla}
              WHERE bitrix_id::text = ANY($1::text[]) AND NULLIF(BTRIM(source), '') IS NOT NULL
              ORDER BY bitrix_id::text`, [faltan]
          );
          for (const r of rows) origenes.set(String(r.deal), r.origen);
        }
      } catch (e) {
        console.warn('[bolsaLeads] costos: origen del webhook:', e.message);
      }
    }
    const { ORIGEN_A_CANAL } = require('../shared/origenesRedes');
    const origen = agruparPorOrigen({ detalle: reporte.detalle, origenes, catalogo, historico: ORIGEN_A_CANAL });
    const costosAgencia = costosPorAgencia({ ...origen, porFuente: reporte.porFuente });

    return { success: true, desde, hasta, avisos, ...reporte, ...origen, ...costosAgencia, _entregas: entregas, _db: db };
};

router.get('/costos', async (req, res) => {
  try {
    const { _entregas, _db, ...reporte } = await armarCostos(req.query);
    res.json(reporte);
  } catch (e) {
    if (e.status) return res.status(e.status).json({ success: false, error: e.message });
    console.error('[bolsaLeads] costos:', e.message);
    res.status(500).json({ success: false, error: 'No se pudo armar el reporte de costos' });
  }
});

// ── Análisis profundo del piloto ─────────────────────────────────────────────
//   GET /api/bolsa-leads/analisis?desde&hasta
//   Embudo por empresa, por asesor, por hora/día y antes vs piloto. Usa Bitrix
//   (etapa y responsable actuales de cada lead) → se guarda 5 min en memoria.
const cacheAnalisis = new Map();
router.get('/analisis', async (req, res) => {
  try {
    const clave = `${req.query.desde || ''}|${req.query.hasta || ''}`;
    const c = cacheAnalisis.get(clave);
    if (c && Date.now() - c.ts < 5 * 60 * 1000 && req.query.forzar !== '1') return res.json(c.data);

    const { analizarPiloto, compararPeriodos, analizarTiempos } = require('../shared/bolsaLeadsAnalisis');
    const ctrl = require('../controllers/bolsaLeads.controller');
    const { _entregas: entregas, _db: db, ...costos } = await armarCostos(req.query);
    const avisos = [...costos.avisos];
    const ids = [...new Set(entregas.map((x) => String(x.deal)))];

    // Hora, día, cola y saltos de cada entrega
    const extra = new Map(entregas.map((x) => {
      const m = /casilla \d+ era (NOVONET|VELSA|SEMILLERO) sin asesores conectados/i.exec(x.detalle || '');
      return [String(x.deal), { hora: x.hora, dow: x.dow, viaCola: x.via === 'pendientes', salto: !!m, saltoDe: m ? m[1].toLowerCase() : null }];
    }));
    const enEspera = Number((await erp.query(
      `SELECT COUNT(DISTINCT bitrix_deal_id)::int AS n FROM bolsa_leads_entregas
        WHERE estado = 'en_espera' AND (creado_en AT TIME ZONE 'America/Guayaquil')::date BETWEEN $1::date AND $2::date`,
      [costos.desde, costos.hasta]
    )).rows[0]?.n) || 0;

    // Etapa y responsable actuales (Bitrix)
    let bitrix = new Map();
    try { bitrix = await ctrl.infoDealsBitrix(ids); }
    catch (e) {
      console.error('[bolsaLeads] analisis: Bitrix:', e.message);
      avisos.push('No se pudo leer la etapa y el responsable en Bitrix: el embudo y los asesores salen incompletos');
    }
    const analisis = analizarPiloto({ detalle: costos.detalle, extra, bitrix, enEspera });

    // Tiempos de operación: historial de etapas de Bitrix + primera venta registrada
    let tiempos = null;
    try {
      const historial = await ctrl.historialEtapas(ids);
      const primeraVenta = new Map();
      try {
        const { rows } = await db.query(
          `SELECT NULLIF(BTRIM(e.id_bitrix::text), '') AS deal,
                  to_char(MIN(public.parse_fecha_flex(e.fecha_registro_sistema::text)), 'YYYY-MM-DD"T"HH24:MI:SS') || '-05:00' AS t
             FROM public.envios_ventas e
            WHERE NULLIF(BTRIM(e.id_bitrix::text), '') = ANY($1::text[]) AND e.estatus_envio IS DISTINCT FROM 'BORRADOR'
            GROUP BY 1`, [ids]
        );
        for (const r of rows) if (r.t) primeraVenta.set(String(r.deal), r.t);
      } catch (e) {
        console.warn('[bolsaLeads] analisis: fecha de ventas:', e.message);
      }
      const { EMPRESAS: CFG } = require('../shared/repartoEmpresas');
      const plazos = Object.fromEntries(Object.entries(CFG).map(([k, v]) => [k, v.plazoVentaHoras ?? null]));
      const cfgBolsa = await ctrl.leerConfig?.().catch(() => null);
      const categoriaBolsa = String(cfgBolsa?.categoria_origen ?? 43);
      tiempos = analizarTiempos({
        leads: entregas.map((x) => ({ deal: x.deal, empresa: x.empresa, entregado_en: x.entregado_en, categoriaBolsa })),
        historial, primeraVenta, plazos,
      });
    } catch (e) {
      console.error('[bolsaLeads] analisis: tiempos:', e.message);
      avisos.push('No se pudo leer el historial de etapas en Bitrix: los tiempos de operación no están disponibles');
    }

    // Antes vs piloto: mismos días, justo antes del primer día del rango
    let comparacion = null;
    try {
      const dia = 24 * 3600 * 1000;
      const d0 = new Date(`${costos.desde}T12:00:00Z`), d1 = new Date(`${costos.hasta}T12:00:00Z`);
      const dias = Math.round((d1 - d0) / dia) + 1;
      const fmt = (d) => d.toISOString().slice(0, 10);
      const antesHasta = fmt(new Date(d0.getTime() - dia));
      const antesDesde = fmt(new Date(d0.getTime() - dias * dia));
      const periodo = async (desde, hasta) => {
        const inv = await db.query(
          `SELECT COALESCE((SELECT SUM(monto_usd) FROM public.novonet_inversion_redes WHERE fecha::date BETWEEN $1::date AND $2::date), 0)
                + COALESCE((SELECT SUM(monto_usd) FROM public.velsa_inversion_redes   WHERE fecha::date BETWEEN $1::date AND $2::date), 0) AS total`,
          [desde, hasta]
        );
        const ven = await db.query(
          `SELECT UPPER(BTRIM(COALESCE(e.distribuidor_autorizado, ''))) AS empresa, COUNT(*)::int AS n
             FROM public.envios_ventas e
            WHERE e.estatus_envio IS DISTINCT FROM 'BORRADOR'
              AND e.fecha_ingreso_telcos BETWEEN $1::date AND $2::date
            GROUP BY 1`, [desde, hasta]
        );
        const ventas = { novonet: 0, velsa: 0, semillero: 0 };
        for (const r of ven.rows) {
          const k = /SEMILLERO/.test(r.empresa) ? 'semillero' : /VELSA/.test(r.empresa) ? 'velsa' : /NOVONET/.test(r.empresa) ? 'novonet' : null;
          if (k) ventas[k] += r.n;
        }
        return { desde, hasta, dias, inversion: Number(inv.rows[0].total) || 0, leads: await ctrl.leadsPorPipeline(desde, hasta), ventas };
      };
      comparacion = compararPeriodos(await periodo(antesDesde, antesHasta), await periodo(costos.desde, costos.hasta));
    } catch (e) {
      console.error('[bolsaLeads] analisis: antes vs piloto:', e.message);
      avisos.push('No se pudo armar la comparación antes vs piloto');
    }

    const data = {
      success: true, desde: costos.desde, hasta: costos.hasta, avisos,
      totales: costos.totales, porEmpresa: costos.porEmpresa, ...analisis, comparacion, tiempos,
    };
    cacheAnalisis.set(clave, { ts: Date.now(), data });
    res.json(data);
  } catch (e) {
    if (e.status) return res.status(e.status).json({ success: false, error: e.message });
    console.error('[bolsaLeads] analisis:', e.message);
    res.status(500).json({ success: false, error: 'No se pudo armar el análisis del piloto' });
  }
});

router.post('/reintentar', async (req, res) => {
  const dealId = String(req.body?.deal_id || '').trim();
  if (!/^\d+$/.test(dealId)) return res.status(400).json({ success: false, error: 'ID de negociación inválido' });
  try {
    const r = await distribuir(dealId, { origen: 'manual' });
    res.json({ success: true, resultado: r });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/pendientes', async (req, res) => {
  try {
    res.json({ success: true, resultado: await distribuirPendientes({ limite: 50 }) });
  } catch (e) {
    console.error('[bolsaLeads] pendientes:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
