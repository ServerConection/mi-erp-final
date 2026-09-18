const router = require('express').Router();
const erp = require('../config/dbErp');
const db = require('../config/db');
const { verificarToken } = require('../middleware/auth');
const { fechaValida, validarFilas, parseTxt } = require('../shared/gestionablesCarga');

// Etapas que NO cuentan como "gestionable" para el conteo diario. Son slugs
// (minusculas, guion bajo) porque asi los guarda bitrixWebhook.controller.js
// (funcion slugify) en bitrix_webhook_leads.etapa -- NO es el mismo formato
// que usa mestra_bitrix.b_etapa_de_la_negociacion (texto en mayusculas), asi
// que esta lista no se puede reemplazar por esGestionableExpr() de shared/etapas.
const ETAPAS_NO_GESTIONABLES_LEADS = [
  'duplicado', 'dupllicado', 'zona_peligrosa', 'zonas_peligrosas',
  'regularizacion', 'remarketing', 'fuera_de_cobertura', 'innegociable', 'atc',
];
router.use(verificarToken, (req, res, next) => {
  if (!['ADMINISTRADOR', 'GERENCIA'].includes(req.user.perfil) && Number(req.user.id) !== 76) return res.status(403).json({ success: false, error: 'No tiene acceso a este módulo' });
  next();
});
router.get('/', async (req, res) => {
  if (!fechaValida(req.query.fecha)) return res.status(400).json({ success: false, error: 'Fecha inválida' });
  try {
    const result = await erp.query('SELECT id, nombre_bitrix_asesor, gestionables_permitidos, fecha_carga::text FROM gestionables_asesores WHERE fecha_carga = $1 ORDER BY nombre_bitrix_asesor', [req.query.fecha]);
    const max = await erp.query('SELECT COALESCE(MAX(id), 0) AS ultimo_id FROM gestionables_asesores');
    let counts = new Map(), aviso = null;
    try {
      // Conteo en vivo desde bitrix_webhook_leads (bddgeneral): la llena en
      // tiempo real bitrixWebhook.controller.js con cada automatizacion de
      // etapa que dispara Bitrix. mestra_bitrix (usada antes aqui) depende de
      // un proceso externo a este repo y puede tardar en reflejar leads del
      // dia -- por eso el conteo salia en 0 con leads recien creados.
      const actual = await db.query(
        `SELECT UPPER(BTRIM(responsible)) AS asesor, COUNT(*)::int AS total
           FROM public.bitrix_webhook_leads
          WHERE empresa = 'novonet'
            AND LEFT(created_at_ecuador, 10) = $1
            AND LOWER(BTRIM(COALESCE(etapa, ''))) <> ALL($2::text[])
          GROUP BY 1`,
        [req.query.fecha, ETAPAS_NO_GESTIONABLES_LEADS]
      );
      counts = new Map(actual.rows.map(r => [r.asesor, r.total]));
    } catch (e) {
      console.error('[gestionables] conteo:', e.message);
      aviso = 'No se pudo consultar el consumo diario; se muestran las cuotas sin evaluar su límite.';
    }
    res.json({ success: true, ultimo_id: Number(max.rows[0].ultimo_id), aviso, data: result.rows.map(r => ({ ...r, gestionables_actuales: aviso ? null : (counts.get(r.nombre_bitrix_asesor.trim().toUpperCase()) || 0) })) });
  } catch (e) {
    console.error('[gestionables]', e.message);
    res.status(500).json({ success: false, error: 'No se pudieron consultar las cuotas' });
  }
});
async function guardar(req, res, importar) {
  let rows;
  try {
    rows = importar ? parseTxt(req.body.contenido) : validarFilas(req.body.items);
    if (!importar && (!fechaValida(req.body.fecha) || rows.some(r => r.fecha_carga !== req.body.fecha))) throw new Error('Todas las filas deben corresponder a la fecha seleccionada');
  } catch (e) { return res.status(400).json({ success: false, error: e.message }); }
  let client;
  try {
    client = await erp.connect();
    await client.query('BEGIN');
    await client.query('LOCK TABLE gestionables_asesores IN SHARE ROW EXCLUSIVE MODE');
    for (const r of rows) {
      const existing = await client.query('SELECT id, nombre_bitrix_asesor, fecha_carga::text, gestionables_permitidos FROM gestionables_asesores WHERE id = $1 OR (UPPER(BTRIM(nombre_bitrix_asesor)) = UPPER($2) AND fecha_carga = $3)', [r.id, r.nombre_bitrix_asesor, r.fecha_carga]);
      if (existing.rows.some(x => x.id !== r.id || x.nombre_bitrix_asesor !== r.nombre_bitrix_asesor || x.fecha_carga !== r.fecha_carga)) throw Object.assign(new Error(`El ID ${r.id} o el asesor/fecha ya pertenece a otro registro`), { status: 409 });
      if (!importar && (!existing.rows.length || existing.rows[0].gestionables_permitidos !== r.original)) throw Object.assign(new Error('Las cuotas cambiaron. Consulte la fecha otra vez antes de actualizar.'), { status: 409 });
      await client.query('INSERT INTO gestionables_asesores (id, nombre_bitrix_asesor, gestionables_permitidos, fecha_carga) VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO UPDATE SET gestionables_permitidos = EXCLUDED.gestionables_permitidos', [r.id, r.nombre_bitrix_asesor, r.gestionables_permitidos, r.fecha_carga]);
    }
    await client.query("SELECT setval(pg_get_serial_sequence('gestionables_asesores', 'id'), GREATEST((SELECT MAX(id) FROM gestionables_asesores), (SELECT last_value FROM gestionables_asesores_id_seq)), true)");
    await client.query('COMMIT');
    res.json({ success: true, total: rows.length });
  } catch (e) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('[gestionables] guardar:', e.message);
    res.status(e.status || 500).json({ success: false, error: e.status ? e.message : 'No se guardó ninguna fila. Revise los IDs y la conexión a la base.' });
  } finally { client?.release(); }
}
router.post('/importar', (req, res) => guardar(req, res, true));
router.put('/', (req, res) => guardar(req, res, false));
module.exports = router;
