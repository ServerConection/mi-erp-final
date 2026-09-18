const router = require('express').Router();
const pool = require('../config/db');
const { verificarToken } = require('../middleware/auth');
const { fechaValida } = require('../shared/gestionablesCarga');
const { fechaWebhookExpr } = require('../shared/webhookRedes');
const { esGestionableExpr, esDescarteExactoExpr } = require('../shared/etapas');
const etapa = `UPPER(REPLACE(COALESCE(NULLIF(BTRIM(w.etapa_bitrix), ''), NULLIF(BTRIM(w.etapa), ''), 'SIN ETAPA'), '_', ' '))`;
const origen = `COALESCE(NULLIF(BTRIM(w.source), ''), 'SIN ORIGEN')`;
const responsable = `COALESCE(NULLIF(BTRIM(w.responsible), ''), 'SIN RESPONSABLE')`;
router.use(verificarToken);
router.get('/dashboard', async (req, res) => {
  const q = req.query;
  if (!fechaValida(q.desde) || !fechaValida(q.hasta) || q.desde > q.hasta || (Date.parse(q.hasta) - Date.parse(q.desde)) / 86400000 > 366) return res.status(400).json({ success: false, error: 'Seleccione un período válido de hasta 367 días' });
  const pagina = Number(q.pagina || 1);
  if (!Number.isInteger(pagina) || pagina < 1 || pagina > 100000) return res.status(400).json({ success: false, error: 'Página inválida' });
  const values = [q.desde, q.hasta];
  let where = `LOWER(BTRIM(w.empresa)) = 'semillero' AND ${fechaWebhookExpr('w')} BETWEEN $1::date AND $2::date`;
  // Mismo aislamiento que los indicadores actuales para cuentas de asesor.
  const asesor = req.user.perfil === 'ASESOR' ? (req.user.nombreCompleto || '__SIN_NOMBRE__') : q.responsable;
  for (const [value, col] of [[asesor, responsable], [q.origen, origen], [q.etapa, etapa]]) {
    if (value) { values.push(String(value)); where += ` AND UPPER(${col}) = UPPER($${values.length})`; }
  }
  if (q.buscar) {
    values.push(`%${String(q.buscar).slice(0, 150)}%`);
    where += ` AND (w.bitrix_id::text ILIKE $${values.length} OR w.phone ILIKE $${values.length} OR ${responsable} ILIKE $${values.length})`;
  }
  try {
    const base = `FROM public.bitrix_webhook_leads w WHERE ${where}`;
    const [resumen, distribucion, asesores, listado, catalogo] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE ${esGestionableExpr(etapa)})::int AS gestionables, COUNT(*) FILTER (WHERE ${etapa} = 'VENTA SUBIDA')::int AS ventas, COUNT(*) FILTER (WHERE ${etapa} ~ '^ATC([ /-]?SOPORTE)?$')::int AS atc, COUNT(*) FILTER (WHERE ${esDescarteExactoExpr(etapa)})::int AS descarte ${base}`, values),
      pool.query(`SELECT ${origen} AS origen, ${etapa} AS etapa, ${fechaWebhookExpr('w')}::text AS fecha, COUNT(*)::int AS total ${base} GROUP BY 1,2,3 ORDER BY 3,1,2`, values),
      pool.query(`SELECT ${responsable} AS responsable, COUNT(*)::int AS total, COUNT(*) FILTER (WHERE ${esGestionableExpr(etapa)})::int AS gestionables, COUNT(*) FILTER (WHERE ${etapa} = 'VENTA SUBIDA')::int AS ventas ${base} GROUP BY 1 ORDER BY total DESC, responsable`, values),
      pool.query(`SELECT w.bitrix_id, w.phone, ${responsable} AS responsable, ${origen} AS origen, ${etapa} AS etapa, ${fechaWebhookExpr('w')}::text AS fecha, w.city, w.pipeline, w.comentario, w.razon_descarte, w.motivo_atc ${base} ORDER BY w.created_at DESC, w.bitrix_id DESC LIMIT 50 OFFSET $${values.length + 1}`, [...values, (pagina - 1) * 50]),
      pool.query(`SELECT DISTINCT ${responsable} AS responsable, ${origen} AS origen, ${etapa} AS etapa FROM public.bitrix_webhook_leads w WHERE LOWER(BTRIM(w.empresa)) = 'semillero' ${req.user.perfil === 'ASESOR' ? 'AND UPPER(' + responsable + ') = UPPER($1)' : ''}`, req.user.perfil === 'ASESOR' ? [asesor] : []),
    ]);
    const opciones = key => [...new Set(catalogo.rows.map(r => r[key]))].sort((a, b) => a.localeCompare(b, 'es'));
    res.json({ success: true, resumen: resumen.rows[0], origenesEtapasDia: distribucion.rows, responsables: asesores.rows, leads: listado.rows, pagina, paginas: Math.ceil(resumen.rows[0].total / 50), periodo: { desde: q.desde, hasta: q.hasta }, opciones: { responsable: opciones('responsable'), origen: opciones('origen'), etapa: opciones('etapa') } });
  } catch (e) {
    console.error('[semillero]', e.message);
    res.status(500).json({ success: false, error: 'No se pudieron consultar los indicadores de Semillero' });
  }
});
module.exports = router;
