/**
 * API del módulo "Bolsa Leads" (ADMINISTRADOR y GERENCIA).
 *   GET  /api/bolsa-leads/estado?fecha=YYYY-MM-DD
 *   PUT  /api/bolsa-leads/config      { activo, modo, patron, encadenar_reparto, reiniciar_ciclo }
 *   POST /api/bolsa-leads/reintentar  { deal_id }
 *   POST /api/bolsa-leads/pendientes  → entrega lo que quedó en Bolsa Leads
 *   GET  /api/bolsa-leads/costos?desde&hasta → costo de la pauta por empresa y eficiencia
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
router.get('/costos', async (req, res) => {
  try {
    const db = require('../config/db');   // bddgeneral: inversión y ventas
    const { calcularCostos } = require('../shared/bolsaLeadsCostos');
    const hoy = `(NOW() AT TIME ZONE 'America/Guayaquil')::date`;
    const rango = await erp.query(
      `SELECT to_char(MIN((creado_en AT TIME ZONE 'America/Guayaquil')::date), 'YYYY-MM-DD') AS desde,
              to_char(${hoy}, 'YYYY-MM-DD') AS hoy
         FROM bolsa_leads_entregas WHERE estado = 'entregado'`
    );
    const desde = fechaValida(req.query.desde) ? req.query.desde : (rango.rows[0].desde || rango.rows[0].hoy);
    const hasta = fechaValida(req.query.hasta) ? req.query.hasta : rango.rows[0].hoy;
    if (desde > hasta) return res.status(400).json({ success: false, error: 'La fecha "desde" es mayor que "hasta"' });

    const entregas = (await erp.query(
      `SELECT bitrix_deal_id AS deal, empresa,
              to_char((creado_en AT TIME ZONE 'America/Guayaquil')::date, 'YYYY-MM-DD') AS fecha
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

    res.json({ success: true, desde, hasta, avisos, ...calcularCostos({ entregas, inversion, ventas }) });
  } catch (e) {
    console.error('[bolsaLeads] costos:', e.message);
    res.status(500).json({ success: false, error: 'No se pudo armar el reporte de costos' });
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
