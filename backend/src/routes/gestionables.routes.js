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
  'regularizacion', 'remarketing', 'fuera_de_cobertura', 'atc', // innegociable SÍ es gestionable (2026-10-05)
];
router.use(verificarToken, (req, res, next) => {
  if (!['ADMINISTRADOR', 'GERENCIA', 'SUPERVISOR'].includes(req.user.perfil) && Number(req.user.id) !== 76) return res.status(403).json({ success: false, error: 'No tiene acceso a este módulo' });
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

// ── PANEL "REPARTO DE GESTIONABLES" ──────────────────────────────────────────
// Mismo acceso que las cuotas (router.use de arriba). Todo vive en erp_database.
const { leerConfig, guardarConfig, leerEnLinea } = require('../shared/repartoEstado');
const { normalizarNombre, dentroDeHorario } = require('../shared/repartoGestionables');
const fechaEc = (f) => (fechaValida(f) ? f : null);
const HOY_EC_SQL = `(NOW() AT TIME ZONE 'America/Guayaquil')::date`;

// Estado en vivo: interruptores + cada asesor con su cupo, ronda y si está en línea.
router.get('/reparto/estado', async (req, res) => {
  try {
    const [cfg, enLinea, asesores, resumen, cola] = await Promise.all([
      leerConfig({ sinCache: true }),
      leerEnLinea(),
      erp.query(
        `SELECT g.nombre_bitrix_asesor AS nombre, g.gestionables_permitidos AS permitidos,
                COUNT(a.id)::int AS asignados,
                COUNT(a.id) FILTER (WHERE a.origen <> 'humano')::int AS asignados_bot,
                COUNT(a.id) FILTER (WHERE a.origen = 'humano')::int  AS asignados_humano,
                MAX(a.creado_en) AS ultima_asignacion
           FROM gestionables_asesores g
           LEFT JOIN gestionables_asignaciones a
             ON a.fecha = g.fecha_carga
            AND a.vigente
            AND UPPER(BTRIM(a.asesor_asignado)) = UPPER(BTRIM(g.nombre_bitrix_asesor))
          WHERE g.fecha_carga = ${HOY_EC_SQL}
          GROUP BY 1, 2`
      ),
      erp.query(
        `SELECT (SELECT COUNT(*) FROM gestionables_asignaciones WHERE fecha = ${HOY_EC_SQL} AND vigente AND origen <> 'humano')::int AS repartidos,
                (SELECT COUNT(*) FROM gestionables_asignaciones WHERE fecha = ${HOY_EC_SQL} AND vigente AND origen = 'humano')::int AS humanos,
                (SELECT MAX(creado_en) FROM gestionables_asignaciones WHERE fecha = ${HOY_EC_SQL} AND origen <> 'humano') AS ultimo_reparto,
                (SELECT COUNT(DISTINCT bitrix_id) FROM gestionables_webhook_log
                  WHERE (creado_en AT TIME ZONE 'America/Guayaquil')::date = ${HOY_EC_SQL}
                    AND encontrado = false AND error LIKE 'Ningún asesor%')::int AS sin_repartir`
      ),
      // Leads esperando en la estación (si la migración de la cola aún no se corrió, lista vacía)
      erp.query(
        `SELECT bitrix_deal_id, motivo, creado_en FROM gestionables_cola
          WHERE estado = 'pendiente' ORDER BY creado_en, id LIMIT 200`
      ).catch(() => ({ rows: [], sinTabla: true })),
    ]);
    const data = asesores.rows.map((r) => {
      const l = enLinea?.mapa.get(normalizarNombre(r.nombre));
      const esEstacion = normalizarNombre(r.nombre) === normalizarNombre(cfg.estacion_nombre);
      return {
        ...r,
        disponibles: Math.max(0, r.permitidos - r.asignados),
        en_linea: enLinea ? !!l?.enLinea : null,
        jornada: l?.jornada || null,
        encontrado_en_bitrix: enLinea ? !!l : null,
        es_estacion: esEstacion,
      };
    });
    res.json({
      success: true,
      config: cfg,
      en_linea: enLinea ? { criterio: enLinea.criterio, generado: enLinea.generado } : null,
      resumen: resumen.rows[0],
      horario: { inicio: cfg.hora_inicio, fin: cfg.hora_fin, dentro: dentroDeHorario(new Date(), cfg.hora_inicio, cfg.hora_fin) },
      estacion: { nombre: cfg.estacion_nombre, pendientes: cola.rows.length, lista: cola.rows, sin_tabla: !!cola.sinTabla },
      data,
    });
  } catch (e) {
    console.error('[gestionables] reparto/estado:', e.message);
    res.status(500).json({ success: false, error: 'No se pudo consultar el estado del reparto' });
  }
});

// Encender / apagar el reparto o el filtro "solo en línea". Queda registrado quién lo hizo.
router.put('/reparto/config', async (req, res) => {
  try {
    const usuario = req.user.nombreCompleto || req.user.usuario || `ID ${req.user.id}`;
    const cfg = await guardarConfig(
      { activo: req.body?.activo, solo_en_linea: req.body?.solo_en_linea },
      usuario
    );
    res.json({ success: true, config: cfg });
  } catch (e) {
    console.error('[gestionables] reparto/config:', e.message);
    res.status(e.status || 500).json({ success: false, error: e.status ? e.message : 'No se pudo guardar. ¿Se corrió la migración 20261002_gestionables_reparto_config.sql?' });
  }
});

// Reporte por hora de un día: repartidos por hora y asesor, leads sin repartir y detalle.
router.get('/reparto/reporte', async (req, res) => {
  const fecha = fechaEc(req.query.fecha);
  if (!fecha) return res.status(400).json({ success: false, error: 'Fecha inválida' });
  try {
    const [detalle, sinRepartir, eventos] = await Promise.all([
      erp.query(
        `SELECT bitrix_deal_id, asesor_asignado, asesor_original, ronda, origen, vigente, reasignado_a,
                EXTRACT(HOUR FROM creado_en AT TIME ZONE 'America/Guayaquil')::int AS hora,
                TO_CHAR(creado_en AT TIME ZONE 'America/Guayaquil', 'HH24:MI') AS hora_texto
           FROM gestionables_asignaciones
          WHERE fecha = $1
          ORDER BY creado_en`,
        [fecha]
      ),
      // Leads que llegaron y se fueron a la estación (cola), por hora de llegada
      erp.query(
        `SELECT EXTRACT(HOUR FROM creado_en AT TIME ZONE 'America/Guayaquil')::int AS hora,
                COUNT(DISTINCT bitrix_deal_id)::int AS total
           FROM gestionables_cola
          WHERE (creado_en AT TIME ZONE 'America/Guayaquil')::date = $1
          GROUP BY 1`,
        [fecha]
      ).catch(() => ({ rows: [] })),
      erp.query(
        `SELECT campo, valor, usuario, TO_CHAR(creado_en AT TIME ZONE 'America/Guayaquil', 'HH24:MI') AS hora_texto
           FROM gestionables_reparto_eventos
          WHERE (creado_en AT TIME ZONE 'America/Guayaquil')::date = $1
          ORDER BY creado_en`,
        [fecha]
      ).catch(() => ({ rows: [] })),
    ]);
    res.json({ success: true, fecha, detalle: detalle.rows, sin_repartir: sinRepartir.rows, eventos: eventos.rows });
  } catch (e) {
    console.error('[gestionables] reparto/reporte:', e.message);
    res.status(500).json({ success: false, error: 'No se pudo consultar el reporte del reparto' });
  }
});

module.exports = router;
