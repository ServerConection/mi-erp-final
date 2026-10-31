/**
 * API del módulo "Bolsa Leads" (ADMINISTRADOR y GERENCIA).
 *   GET  /api/bolsa-leads/estado?fecha=YYYY-MM-DD
 *   PUT  /api/bolsa-leads/config      { activo, modo, patron, encadenar_reparto, reiniciar_ciclo }
 *   POST /api/bolsa-leads/reintentar  { deal_id }
 *   POST /api/bolsa-leads/pendientes  → entrega lo que quedó en Bolsa Leads
 */
const router = require('express').Router();
const erp = require('../config/dbErp');
const { verificarToken } = require('../middleware/auth');
const { perfilGestionables } = require('../shared/accesoGestionables');
const { leerConfig, distribuir, distribuirPendientes, conectadosPorEmpresa } = require('../controllers/bolsaLeads.controller');
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
    const [conectados, resumen, porHora, movimientos, eventos] = await Promise.all([
      conectadosPorEmpresa({ forzar: req.query.forzar === '1' }),
      erp.query(
        `SELECT COUNT(*) FILTER (WHERE estado = 'entregado' AND empresa = 'novonet')::int AS novonet,
                COUNT(*) FILTER (WHERE estado = 'entregado' AND empresa = 'velsa')::int   AS velsa,
                COUNT(*) FILTER (WHERE estado = 'entregado' AND empresa = 'semillero')::int AS semillero,
                COUNT(*) FILTER (WHERE estado = 'error')::int   AS errores,
                COUNT(*) FILTER (WHERE estado = 'omitido')::int AS omitidos
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
      success: true, config: cfg, patron: resumenPatron(cfg.patron), conectados,
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
