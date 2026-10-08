const router = require('express').Router();
const erp = require('../config/dbErp');
const db = require('../config/db');
const { verificarToken } = require('../middleware/auth');
const { fechaValida, validarFilas, parseTxt } = require('../shared/gestionablesCarga');
const { EMPRESAS, empresaValida } = require('../shared/repartoEmpresas');
const { puedeAccederGestionables } = require('../shared/accesoGestionables');
// ?empresa=velsa (o en el body) → tablas de Velsa. Sin empresa = NOVONET, como siempre.
const empresaDe = (req) => {
  const e = req.query.empresa ?? req.body?.empresa;
  if (e === undefined || e === null || e === '') return EMPRESAS.novonet;
  return EMPRESAS[empresaValida(e)] || null;
};

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
  const empresa = empresaDe(req);
  if (!empresa) return res.status(400).json({ success: false, error: 'Empresa inválida' });
  if (!puedeAccederGestionables(req.user, empresa.etiqueta)) {
    return res.status(403).json({ success: false, error: 'No tiene acceso al reparto de esta empresa' });
  }
  next();
});
router.get('/', async (req, res) => {
  const E = empresaDe(req); if (!E) return res.status(400).json({ success: false, error: 'Empresa inválida' });
  const T = E.tablas;
  if (!fechaValida(req.query.fecha)) return res.status(400).json({ success: false, error: 'Fecha inválida' });
  try {
    const result = await erp.query(`SELECT id, nombre_bitrix_asesor, gestionables_permitidos, porcentaje_atc_max, fecha_carga::text FROM ${T.asesores} WHERE fecha_carga = $1 ORDER BY nombre_bitrix_asesor`, [req.query.fecha]);
    const max = await erp.query(`SELECT COALESCE(MAX(id), 0) AS ultimo_id FROM ${T.asesores}`);
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
          WHERE empresa = $3
            AND LEFT(created_at_ecuador, 10) = $1
            AND LOWER(BTRIM(COALESCE(etapa, ''))) <> ALL($2::text[])
          GROUP BY 1`,
        [req.query.fecha, ETAPAS_NO_GESTIONABLES_LEADS, E.clave]
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
  const E = empresaDe(req); if (!E) return res.status(400).json({ success: false, error: 'Empresa inválida' });
  const T = E.tablas;
  let rows;
  try {
    rows = importar ? parseTxt(req.body.contenido) : validarFilas(req.body.items);
    if (!importar && (!fechaValida(req.body.fecha) || rows.some(r => r.fecha_carga !== req.body.fecha))) throw new Error('Todas las filas deben corresponder a la fecha seleccionada');
  } catch (e) { return res.status(400).json({ success: false, error: e.message }); }
  let client;
  try {
    client = await erp.connect();
    await client.query('BEGIN');
    await client.query(`LOCK TABLE ${T.asesores} IN SHARE ROW EXCLUSIVE MODE`);
    for (const r of rows) {
      const existing = await client.query(`SELECT id, nombre_bitrix_asesor, fecha_carga::text, gestionables_permitidos, porcentaje_atc_max FROM ${T.asesores} WHERE id = $1 OR (UPPER(BTRIM(nombre_bitrix_asesor)) = UPPER($2) AND fecha_carga = $3)`, [r.id, r.nombre_bitrix_asesor, r.fecha_carga]);
      if (existing.rows.some(x => x.id !== r.id || x.nombre_bitrix_asesor !== r.nombre_bitrix_asesor || x.fecha_carga !== r.fecha_carga)) throw Object.assign(new Error(`El ID ${r.id} o el asesor/fecha ya pertenece a otro registro`), { status: 409 });
      if (!importar && (!existing.rows.length || existing.rows[0].gestionables_permitidos !== r.original || (r.original_atc !== undefined && existing.rows[0].porcentaje_atc_max !== r.original_atc))) throw Object.assign(new Error('Las cuotas cambiaron. Consulte la fecha otra vez antes de actualizar.'), { status: 409 });
      await client.query(`INSERT INTO ${T.asesores} (id, nombre_bitrix_asesor, gestionables_permitidos, fecha_carga, porcentaje_atc_max) VALUES ($1,$2,$3,$4,COALESCE($5::int, 50)) ON CONFLICT (id) DO UPDATE SET gestionables_permitidos = EXCLUDED.gestionables_permitidos, porcentaje_atc_max = COALESCE($5::int, ${T.asesores}.porcentaje_atc_max)`, [r.id, r.nombre_bitrix_asesor, r.gestionables_permitidos, r.fecha_carga, r.porcentaje_atc_max ?? null]);
    }
    await client.query(`SELECT setval('${T.asesores}_id_seq', GREATEST((SELECT MAX(id) FROM ${T.asesores}), (SELECT last_value FROM ${T.asesores}_id_seq)), true)`);
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
const { conteoGestionablesHoy, bloqueadoPorAtc } = require('../shared/repartoConteo');

const fechaEc = (f) => (fechaValida(f) ? f : null);
const HOY_EC_SQL = `(NOW() AT TIME ZONE 'America/Guayaquil')::date`;

// Estado en vivo: interruptores + cada asesor con su cupo, ronda y si está en línea.
router.get('/reparto/estado', async (req, res) => {
  const E = empresaDe(req); if (!E) return res.status(400).json({ success: false, error: 'Empresa inválida' });
  const T = E.tablas;
  try {
    // Botón "Forzar actualización": consulta a Bitrix sin caché quién está en
    // línea y corre ya la revisión de entregas manuales y la cola (no espera al cron).
    const forzar = req.query.forzar === '1';
    if (forzar) {
      const { procesarCola, sincronizarManuales } = require('../controllers/gestionablesWebhook.controller');
      await leerEnLinea({ forzar: true, empresa: E.clave });
      await sincronizarManuales(E.clave).catch(() => null);
      await procesarCola(E.clave).catch(() => null);
    }
    const [cfg, enLinea, asesores, resumen, cola, gestMap] = await Promise.all([
      leerConfig({ sinCache: true, empresa: E.clave }),
      leerEnLinea({ empresa: E.clave }),
      erp.query(
        `SELECT g.nombre_bitrix_asesor AS nombre, g.gestionables_permitidos AS permitidos, g.porcentaje_atc_max AS atc_max,
                COUNT(a.id)::int AS asignados,
                COUNT(a.id) FILTER (WHERE a.origen <> 'humano')::int AS asignados_bot,
                COUNT(a.id) FILTER (WHERE a.origen = 'humano')::int  AS asignados_humano,
                MAX(a.creado_en) AS ultima_asignacion
           FROM ${T.asesores} g
           LEFT JOIN ${T.asignaciones} a
             ON a.fecha = g.fecha_carga
            AND a.vigente
            AND UPPER(BTRIM(a.asesor_asignado)) = UPPER(BTRIM(g.nombre_bitrix_asesor))
          WHERE g.fecha_carga = ${HOY_EC_SQL}
          GROUP BY 1, 2, 3`
      ),
      erp.query(
        `SELECT (SELECT COUNT(*) FROM ${T.asignaciones} WHERE fecha = ${HOY_EC_SQL} AND vigente AND origen <> 'humano')::int AS repartidos,
                (SELECT COUNT(*) FROM ${T.asignaciones} WHERE fecha = ${HOY_EC_SQL} AND vigente AND origen = 'humano')::int AS humanos,
                (SELECT MAX(creado_en) FROM ${T.asignaciones} WHERE fecha = ${HOY_EC_SQL} AND origen <> 'humano') AS ultimo_reparto,
                (SELECT COUNT(DISTINCT bitrix_id) FROM ${T.log}
                  WHERE (creado_en AT TIME ZONE 'America/Guayaquil')::date = ${HOY_EC_SQL}
                    AND encontrado = false AND error LIKE 'Ningún asesor%')::int AS sin_repartir`
      ),
      // Leads esperando en la estación (si la migración de la cola aún no se corrió, lista vacía)
      erp.query(
        `SELECT bitrix_deal_id, motivo, creado_en FROM ${T.cola}
          WHERE estado = 'pendiente' ORDER BY creado_en, id LIMIT 200`
      ).catch(() => ({ rows: [], sinTabla: true })),
      conteoGestionablesHoy(erp, E.clave).catch(() => null),
    ]);
    const data = asesores.rows.map((r) => {
      const l = enLinea?.mapa.get(normalizarNombre(r.nombre));
      const esEstacion = normalizarNombre(r.nombre) === normalizarNombre(cfg.estacion_nombre);
      return {
        ...r,
        // Cupo usado = gestionables (lo que pasó a ATC, Duplicado, etc. libera cupo)
        total_asignados: r.asignados,
        asignados: gestMap ? (gestMap.get(normalizarNombre(r.nombre))?.gestionables || 0) : r.asignados,
        disponibles: Math.max(0, r.permitidos - (gestMap ? (gestMap.get(normalizarNombre(r.nombre))?.gestionables || 0) : r.asignados)),
        en_linea: enLinea ? !!l?.enLinea : null,
        jornada: l?.jornada || null,
        encontrado_en_bitrix: enLinea ? !!l : null,
        es_estacion: esEstacion,
        gestionables: gestMap ? (gestMap.get(normalizarNombre(r.nombre))?.gestionables || 0) : null,
        // % ATC de lo recibido hoy y si ya llegó a su máximo (el bot no le entrega)
        atc: gestMap ? (gestMap.get(normalizarNombre(r.nombre))?.atc || 0) : null,
        atc_pct: gestMap && r.asignados ? Math.round(((gestMap.get(normalizarNombre(r.nombre))?.atc || 0) * 100) / r.asignados) : 0,
        bloqueado_atc: gestMap ? bloqueadoPorAtc({ total: r.asignados, atc: gestMap.get(normalizarNombre(r.nombre))?.atc || 0, maxPct: r.atc_max }) : false,
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
  const E = empresaDe(req); if (!E) return res.status(400).json({ success: false, error: 'Empresa inválida' });
  try {
    const usuario = req.user.nombreCompleto || req.user.usuario || `ID ${req.user.id}`;
    const cfg = await guardarConfig(
      { activo: req.body?.activo, solo_en_linea: req.body?.solo_en_linea },
      usuario,
      E.clave
    );
    res.json({ success: true, config: cfg });
  } catch (e) {
    console.error('[gestionables] reparto/config:', e.message);
    res.status(e.status || 500).json({ success: false, error: e.status ? e.message : 'No se pudo guardar. ¿Se corrió la migración 20261002_gestionables_reparto_config.sql?' });
  }
});

// Reporte por hora de un día: repartidos por hora y asesor, leads sin repartir y detalle.
router.get('/reparto/reporte', async (req, res) => {
  const E = empresaDe(req); if (!E) return res.status(400).json({ success: false, error: 'Empresa inválida' });
  const T = E.tablas;
  const fecha = fechaEc(req.query.fecha);
  if (!fecha) return res.status(400).json({ success: false, error: 'Fecha inválida' });
  try {
    const [detalle, sinRepartir, eventos] = await Promise.all([
      erp.query(
        `SELECT bitrix_deal_id, asesor_asignado, asesor_original, ronda, origen, vigente, reasignado_a,
                EXTRACT(HOUR FROM creado_en AT TIME ZONE 'America/Guayaquil')::int AS hora,
                TO_CHAR(creado_en AT TIME ZONE 'America/Guayaquil', 'HH24:MI') AS hora_texto
           FROM ${T.asignaciones}
          WHERE fecha = $1
          ORDER BY creado_en`,
        [fecha]
      ),
      // Leads que llegaron y se fueron a la estación (cola), por hora de llegada
      erp.query(
        `SELECT EXTRACT(HOUR FROM creado_en AT TIME ZONE 'America/Guayaquil')::int AS hora,
                COUNT(DISTINCT bitrix_deal_id)::int AS total
           FROM ${T.cola}
          WHERE (creado_en AT TIME ZONE 'America/Guayaquil')::date = $1
          GROUP BY 1`,
        [fecha]
      ).catch(() => ({ rows: [] })),
      erp.query(
        `SELECT campo, valor, usuario, TO_CHAR(creado_en AT TIME ZONE 'America/Guayaquil', 'HH24:MI') AS hora_texto
           FROM ${T.eventos}
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
