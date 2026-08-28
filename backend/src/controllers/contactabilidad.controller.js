// =============================================================================
// Contactabilidad — Controladores HTTP
// listar / stats      : compatibilidad con el tablero original.
// analytics           : inteligencia completa (incluye semaforo de severidad).
// filtros             : catalogos reales con cascada por empresa y fechas.
// alertas             : consulta ligera para el auto-refresco (cada 30 s).
// refrescarLead       : boton por fila -> trae ESE chat de Bitrix al momento.
// refrescarGlobal     : boton de administrador -> ciclo completo, con cooldown.
// exportar            : CSV de lo que el usuario esta viendo.
// estado              : salud del pipeline (para no confiar a ciegas).
// =============================================================================

const pool = require('../config/db');
const { obtenerAnalytics, construirFiltros } = require('../contactabilidad/contactabilidad.analytics');
const { obtenerUmbrales, UMBRALES_DEFECTO, expresionSeveridad, expresionMinutosEspera } =
  require('../contactabilidad/contactabilidad.severidad');
const { obtenerCapacidades, columnaOpcional } = require('../contactabilidad/contactabilidad.esquema');

const EMPRESAS = ['NOVONET', 'VELSA'];
const COOLDOWN_MANUAL_MS = 60_000;
const LOCK_MANUAL = 918273642;
const CACHE_UMBRALES_MS = 60_000;

let cacheUmbrales = { valor: null, at: 0 };
let ultimoRefrescoManual = 0;

/** Umbrales de SLA con cache corta: se leen de BD sin castigar cada request. */
async function umbralesVigentes() {
  if (cacheUmbrales.valor && Date.now() - cacheUmbrales.at < CACHE_UMBRALES_MS) return cacheUmbrales.valor;
  const valor = await obtenerUmbrales(pool);
  cacheUmbrales = { valor, at: Date.now() };
  return valor;
}

const contexto = () => require('../contactabilidad/contactabilidad.contexto').obtenerContexto();

const empresaValida = (valor) => {
  const empresa = String(valor || '').toUpperCase();
  return EMPRESAS.includes(empresa) ? empresa : null;
};

const fallo = (res, error, mensaje, etiqueta) => {
  const status = error instanceof TypeError ? 400 : 500;
  console.error(`[contactabilidad] ${etiqueta}:`, error.message);
  return res.status(status).json({ success: false, error: status === 400 ? error.message : mensaje });
};

// ---------------------------------------------------------------------------
// Listado paginado (vista operativa clasica)
// ---------------------------------------------------------------------------
async function listar(req, res) {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
    const umbrales = await umbralesVigentes();
    const cols = await obtenerCapacidades(pool);
    const { whereSql, params } = construirFiltros(req.query, umbrales);

    const total = await pool.query(
      `SELECT COUNT(*)::int AS total FROM contactabilidad_leads l ${whereSql}`, params);

    const consulta = [...params, limit, (page - 1) * limit];
    const rows = await pool.query(`
      SELECT l.empresa, l.id_bitrix, l.nombre_cliente, l.asesor_id, l.asesor_nombre,
             l.origen_nombre, l.fecha_creacion, l.etapa_id,
             COALESCE(l.etapa_nombre, l.etapa_id) AS etapa_nombre, l.etapa_ingreso_at,
             l.mensajes_cliente_total, l.mensajes_asesor_total,
             l.mensajes_cliente_etapa, l.mensajes_asesor_etapa,
             l.ultimo_mensaje_cliente_at, l.ultimo_mensaje_asesor_at,
             l.pendiente_por, l.temperatura,
             ${columnaOpcional(cols.chat_id, 'l.chat_id', 'chat_id')},
             l.tiempo_primera_respuesta_seg, l.ultima_sincronizacion_at,
             ${columnaOpcional(cols.origen_ultimo_dato, 'l.origen_ultimo_dato', 'origen_ultimo_dato')},
             (${expresionSeveridad('l', umbrales)}) AS severidad,
             (${expresionMinutosEspera('l')}) AS minutos_pendiente
      FROM contactabilidad_leads l ${whereSql}
      ORDER BY (l.pendiente_por = 'ASESOR') DESC,
               l.ultimo_mensaje_cliente_at DESC NULLS LAST,
               l.fecha_creacion DESC NULLS LAST
      LIMIT $${consulta.length - 1} OFFSET $${consulta.length}
    `, consulta);

    res.json({
      success: true,
      data: rows.rows,
      umbrales,
      pagination: {
        page, limit, total: total.rows[0].total,
        pages: Math.ceil(total.rows[0].total / limit),
      },
    });
  } catch (error) {
    return fallo(res, error, 'Error consultando Contactabilidad', 'listar');
  }
}

// ---------------------------------------------------------------------------
// Resumen rapido
// ---------------------------------------------------------------------------
async function stats(req, res) {
  try {
    const umbrales = await umbralesVigentes();
    const { whereSql, params } = construirFiltros(req.query, umbrales);
    const result = await pool.query(`
      SELECT COUNT(*)::int AS leads,
             COALESCE(SUM(l.mensajes_cliente_total),0)::int AS mensajes_cliente,
             COALESCE(SUM(l.mensajes_asesor_total),0)::int AS mensajes_asesor,
             COUNT(*) FILTER (WHERE l.mensajes_cliente_total > 0)::int AS contactados,
             COUNT(*) FILTER (WHERE l.pendiente_por = 'ASESOR')::int AS pendientes_asesor,
             MAX(l.ultima_sincronizacion_at) AS ultima_sincronizacion
      FROM contactabilidad_leads l ${whereSql}
    `, params);
    const data = result.rows[0];
    data.tasa_contactabilidad = data.leads
      ? Number(((data.contactados / data.leads) * 100).toFixed(1)) : 0;
    res.json({ success: true, data });
  } catch (error) {
    return fallo(res, error, 'Error calculando Contactabilidad', 'stats');
  }
}

// ---------------------------------------------------------------------------
// Inteligencia completa
// ---------------------------------------------------------------------------
async function analytics(req, res, deps = {}) {
  try {
    const umbrales = await umbralesVigentes();
    const columnas = await obtenerCapacidades(pool);
    const obtener = deps.obtener || ((query) => obtenerAnalytics(pool, query, { umbrales, columnas }));
    const data = await obtener(req.query);
    res.json({ success: true, data, generado_at: new Date().toISOString() });
  } catch (error) {
    return fallo(res, error, 'Error calculando inteligencia de Contactabilidad', 'analytics');
  }
}

// ---------------------------------------------------------------------------
// Catalogos de filtros (cascada por empresa + rango de fechas)
// ---------------------------------------------------------------------------
async function filtros(req, res) {
  try {
    // La cascada usa SOLO empresa y fechas: si dependiera del resto, elegir un
    // asesor vaciaria la lista de asesores y el filtro quedaria inservible.
    const base = {
      empresa: req.query.empresa,
      desde: req.query.desde,
      hasta: req.query.hasta,
    };
    const { whereSql, params } = construirFiltros(base);

    const [origenes, asesores, etapas, empresas] = await Promise.all([
      pool.query(`SELECT COALESCE(NULLIF(TRIM(l.origen_nombre),''),'SIN ORIGEN') AS valor,
                         COUNT(*)::int AS leads
                  FROM contactabilidad_leads l ${whereSql}
                  GROUP BY 1 ORDER BY leads DESC, valor`, params),
      pool.query(`SELECT l.asesor_id AS id,
                         COALESCE(NULLIF(TRIM(l.asesor_nombre),''),'SIN ASESOR') AS nombre,
                         COUNT(*)::int AS leads
                  FROM contactabilidad_leads l ${whereSql}
                  GROUP BY 1,2 ORDER BY nombre`, params),
      pool.query(`SELECT COALESCE(NULLIF(TRIM(l.etapa_nombre),''),l.etapa_id,'SIN ETAPA') AS valor,
                         COUNT(*)::int AS leads
                  FROM contactabilidad_leads l ${whereSql}
                  GROUP BY 1 ORDER BY leads DESC, valor`, params),
      pool.query(`SELECT DISTINCT empresa FROM contactabilidad_leads ORDER BY empresa`),
    ]);

    res.json({
      success: true,
      data: {
        empresas: empresas.rows.map((r) => r.empresa),
        origenes: origenes.rows,
        asesores: asesores.rows.filter((r) => r.id),
        etapas: etapas.rows,
        severidades: ['CRITICO', 'GRAVE', 'ALERTA', 'OK'],
        temperaturas: ['CALIENTE', 'TIBIO', 'FRIO'],
        pendiente_por: ['ASESOR', 'CLIENTE'],
        umbrales: await umbralesVigentes(),
      },
    });
  } catch (error) {
    return fallo(res, error, 'Error cargando filtros', 'filtros');
  }
}

// ---------------------------------------------------------------------------
// Semaforo de alertas (consulta barata, apta para auto-refresco)
// ---------------------------------------------------------------------------
async function alertas(req, res) {
  try {
    const umbrales = await umbralesVigentes();
    const { whereSql, params } = construirFiltros(req.query, umbrales);
    const severidad = expresionSeveridad('l', umbrales);
    const minutos = expresionMinutosEspera('l');

    const [resumen, criticos] = await Promise.all([
      pool.query(`
        WITH c AS (SELECT (${severidad}) AS severidad, (${minutos}) AS espera
                   FROM contactabilidad_leads l ${whereSql})
        SELECT COUNT(*) FILTER (WHERE severidad = 'CRITICO')::int AS critico,
               COUNT(*) FILTER (WHERE severidad = 'GRAVE')::int   AS grave,
               COUNT(*) FILTER (WHERE severidad = 'ALERTA')::int  AS alerta,
               COUNT(*) FILTER (WHERE severidad = 'OK')::int      AS ok,
               MAX(espera)::int AS espera_maxima_min
        FROM c`, params),
      pool.query(`
        SELECT l.empresa, l.id_bitrix, l.nombre_cliente, l.asesor_nombre,
               COALESCE(l.etapa_nombre, l.etapa_id) AS etapa_nombre, l.origen_nombre,
               l.ultimo_mensaje_cliente_at,
               (${severidad}) AS severidad, (${minutos}) AS minutos_pendiente
        FROM contactabilidad_leads l ${whereSql}
        ${whereSql ? 'AND' : 'WHERE'} l.pendiente_por = 'ASESOR'
        ORDER BY l.ultimo_mensaje_cliente_at ASC NULLS LAST
        LIMIT 25`, params),
    ]);

    res.json({
      success: true,
      data: { resumen: resumen.rows[0], criticos: criticos.rows, umbrales },
      generado_at: new Date().toISOString(),
    });
  } catch (error) {
    return fallo(res, error, 'Error calculando alertas', 'alertas');
  }
}

// ---------------------------------------------------------------------------
// Refresco forzado de UN lead (boton por fila)
// ---------------------------------------------------------------------------
async function refrescarLead(req, res) {
  const empresa = empresaValida(req.params.empresa);
  if (!empresa) return res.status(400).json({ success: false, error: 'Empresa invalida' });
  const id = String(req.params.id || '').trim();
  if (!id) return res.status(400).json({ success: false, error: 'Negociacion invalida' });

  try {
    const resultado = await contexto().refrescador.refrescarLead(empresa, id, { origen: 'MANUAL' });
    if (resultado.sin_lead) return res.status(404).json({ success: false, error: 'Lead no encontrado' });

    const umbrales = await umbralesVigentes();
    const { rows } = await pool.query(`
      SELECT l.empresa, l.id_bitrix, l.ultimo_mensaje_cliente_at, l.ultimo_mensaje_asesor_at,
             l.mensajes_cliente_total, l.mensajes_asesor_total, l.pendiente_por, l.temperatura,
             l.actualizado_at,
             (${expresionSeveridad('l', umbrales)}) AS severidad,
             (${expresionMinutosEspera('l')}) AS minutos_pendiente
      FROM contactabilidad_leads l WHERE l.empresa = $1 AND l.id_bitrix = $2
    `, [empresa, id]);

    res.json({ success: true, data: { ...rows[0], ...resultado } });
  } catch (error) {
    return fallo(res, error, 'No se pudo actualizar el lead', 'refrescarLead');
  }
}

// ---------------------------------------------------------------------------
// Refresco forzado global (administrador)
// ---------------------------------------------------------------------------
async function refrescarGlobal(req, res) {
  const restante = COOLDOWN_MANUAL_MS - (Date.now() - ultimoRefrescoManual);
  if (restante > 0) {
    return res.status(429).json({
      success: false,
      error: `Espera ${Math.ceil(restante / 1000)} s antes de forzar otra actualizacion`,
      reintentar_en_seg: Math.ceil(restante / 1000),
    });
  }

  const lock = await pool.query('SELECT pg_try_advisory_lock($1) AS obtenido', [LOCK_MANUAL]);
  if (!lock.rows[0]?.obtenido) {
    return res.status(409).json({ success: false, error: 'Ya hay una actualizacion en curso' });
  }

  ultimoRefrescoManual = Date.now();
  try {
    const { refrescador, webhook } = contexto();
    const empresaFiltro = empresaValida(req.query.empresa);
    const empresas = empresaFiltro ? [empresaFiltro] : refrescador.empresas();
    if (!empresas.length) {
      return res.status(503).json({ success: false, error: 'No hay empresas habilitadas' });
    }

    const eventos = await webhook.drenarPendientes({ limite: 50 }).catch(() => ({ procesados: 0 }));
    const resultados = {};
    for (const empresa of empresas) {
      resultados[empresa] = await refrescador.refrescarActivos(empresa, {
        limite: Number(req.query.limite) || 120, origen: 'MANUAL',
      });
    }

    res.json({
      success: true,
      data: { eventos, empresas: resultados },
      disparado_por: req.user?.usuario || null,
      generado_at: new Date().toISOString(),
    });
  } catch (error) {
    return fallo(res, error, 'No se pudo forzar la actualizacion', 'refrescarGlobal');
  } finally {
    await pool.query('SELECT pg_advisory_unlock($1)', [LOCK_MANUAL]).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Export CSV de la vista filtrada
// ---------------------------------------------------------------------------
const CSV_CAMPOS = [
  ['empresa', 'Empresa'], ['id_bitrix', 'ID Bitrix'], ['nombre_cliente', 'Cliente'],
  ['asesor_nombre', 'Asesor'], ['origen_nombre', 'Origen'], ['etapa_nombre', 'Etapa'],
  ['fecha_creacion', 'Creado'], ['ultimo_mensaje_cliente_at', 'Ultimo mensaje cliente'],
  ['ultimo_mensaje_asesor_at', 'Ultimo mensaje asesor'], ['pendiente_por', 'Pendiente por'],
  ['minutos_pendiente', 'Minutos esperando'], ['severidad', 'Severidad'],
  ['temperatura', 'Temperatura'], ['mensajes_cliente_total', 'Mensajes cliente'],
  ['mensajes_asesor_total', 'Mensajes asesor'],
  ['tiempo_primera_respuesta_seg', 'Primera respuesta (seg)'],
];

/** Escapa para CSV y neutraliza formulas (=, +, -, @) que Excel ejecutaria. */
function celdaCsv(valor) {
  if (valor === null || valor === undefined) return '';
  const texto = valor instanceof Date ? valor.toISOString() : String(valor);
  const seguro = /^[=+\-@]/.test(texto) ? `'${texto}` : texto;
  return `"${seguro.replace(/"/g, '""')}"`;
}

async function exportar(req, res) {
  try {
    const umbrales = await umbralesVigentes();
    const { whereSql, params } = construirFiltros(req.query, umbrales);
    const limite = Math.min(20000, Math.max(1, Number(req.query.limite) || 5000));

    const { rows } = await pool.query(`
      SELECT l.empresa, l.id_bitrix, l.nombre_cliente, l.asesor_nombre, l.origen_nombre,
             COALESCE(l.etapa_nombre, l.etapa_id) AS etapa_nombre, l.fecha_creacion,
             l.ultimo_mensaje_cliente_at, l.ultimo_mensaje_asesor_at, l.pendiente_por,
             (${expresionMinutosEspera('l')}) AS minutos_pendiente,
             (${expresionSeveridad('l', umbrales)}) AS severidad,
             l.temperatura, l.mensajes_cliente_total, l.mensajes_asesor_total,
             l.tiempo_primera_respuesta_seg
      FROM contactabilidad_leads l ${whereSql}
      ORDER BY (l.pendiente_por = 'ASESOR') DESC, l.ultimo_mensaje_cliente_at DESC NULLS LAST
      LIMIT ${limite}
    `, params);

    const fecha = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="contactabilidad_${fecha}.csv"`);
    // BOM para que Excel en Windows lea tildes correctamente.
    res.write('﻿');
    res.write(`${CSV_CAMPOS.map(([, titulo]) => celdaCsv(titulo)).join(';')}\n`);
    for (const fila of rows) {
      res.write(`${CSV_CAMPOS.map(([campo]) => celdaCsv(fila[campo])).join(';')}\n`);
    }
    res.end();
  } catch (error) {
    if (res.headersSent) return res.end();
    return fallo(res, error, 'No se pudo exportar', 'exportar');
  }
}

// ---------------------------------------------------------------------------
// Salud del pipeline: permite confiar (o no) en lo que muestra el tablero
// ---------------------------------------------------------------------------
async function estado(req, res) {
  try {
    const cols = await obtenerCapacidades(pool);
    const vacio = { rows: [] };

    const [runs, eventos, frescura] = await Promise.all([
      pool.query(`
        SELECT DISTINCT ON (empresa, origen) empresa, origen, estado, iniciado_at,
               finalizado_at, leads_leidos, mensajes_insertados, error_resumen
        FROM contactabilidad_sync_runs
        WHERE iniciado_at >= NOW() - INTERVAL '24 hours'
        ORDER BY empresa, origen, iniciado_at DESC`).catch(() => vacio),
      cols.eventos_inbox ? pool.query(`
        SELECT estado, COUNT(*)::int AS total, MAX(recibido_at) AS ultimo
        FROM contactabilidad_eventos_inbox
        WHERE recibido_at >= NOW() - INTERVAL '24 hours'
        GROUP BY estado`) : Promise.resolve(vacio),
      pool.query(`
        SELECT empresa,
               MAX(actualizado_at) AS ultimo_recalculo,
               MAX(GREATEST(ultimo_mensaje_cliente_at, ultimo_mensaje_asesor_at)) AS ultimo_mensaje,
               ${cols.origen_ultimo_dato
                 ? "COUNT(*) FILTER (WHERE origen_ultimo_dato = 'WEBHOOK')::int"
                 : '0'} AS por_webhook,
               COUNT(*)::int AS leads
        FROM contactabilidad_leads GROUP BY empresa`),
    ]);

    res.json({
      success: true,
      data: {
        ciclos: runs.rows,
        eventos_webhook: eventos.rows,
        frescura: frescura.rows,
        webhook_activo: eventos.rows.some((r) => r.estado === 'PROCESADO' && r.total > 0),
        migracion_pendiente: !cols.eventos_inbox || !cols.chat_id,
        empresas_habilitadas: contexto().refrescador.empresas(),
      },
      generado_at: new Date().toISOString(),
    });
  } catch (error) {
    return fallo(res, error, 'No se pudo leer el estado', 'estado');
  }
}

// ---------------------------------------------------------------------------
// Webhook Bitrix (sin sesion: se autentica por token en la URL)
// ---------------------------------------------------------------------------
async function webhookBitrix(req, res) {
  try {
    const { estado: codigo, cuerpo } = await contexto().webhook.recibir({
      empresa: req.params.empresa,
      token: req.query.token || req.headers['x-contactabilidad-token'],
      body: req.body,
    });
    res.status(codigo).json(cuerpo);
  } catch (error) {
    // Nunca 500 hacia Bitrix: desactiva el handler tras varios errores.
    console.error('[contactabilidad] webhook:', error.message);
    res.status(200).json({ success: false, error: 'Evento no procesado' });
  }
}

// ---------------------------------------------------------------------------
// Vistas guardadas (presets): propias + las que el equipo comparte
// ---------------------------------------------------------------------------
const usuarioDe = (req) => req.user?.usuario || 'anonimo';

async function listarVistas(req, res) {
  try {
    const cols = await obtenerCapacidades(pool);
    if (!cols.vistas) return res.json({ success: true, data: [], migracion_pendiente: true });
    const { rows } = await pool.query(`
      SELECT id, usuario, nombre, filtros, compartida, actualizado_at,
             (usuario = $1) AS propia
      FROM contactabilidad_vistas
      WHERE usuario = $1 OR compartida = TRUE
      ORDER BY propia DESC, nombre
    `, [usuarioDe(req)]);
    res.json({ success: true, data: rows });
  } catch (error) {
    return fallo(res, error, 'No se pudieron cargar las vistas', 'listarVistas');
  }
}

async function guardarVista(req, res) {
  const nombre = String(req.body?.nombre || '').trim().slice(0, 120);
  if (!nombre) return res.status(400).json({ success: false, error: 'La vista necesita un nombre' });

  try {
    const cols = await obtenerCapacidades(pool);
    if (!cols.vistas) {
      return res.status(503).json({ success: false, error: 'Falta ejecutar la migracion de Contactabilidad' });
    }
    // Solo se guardan claves conocidas: un preset no debe poder inyectar
    // parametros arbitrarios en las consultas del tablero.
    const permitidas = ['empresa', 'desde', 'hasta', 'origen', 'asesor_id', 'etapa',
      'pendiente_por', 'severidad', 'min_espera', 'temperatura', 'q', 'solo_con_mensajes'];
    const filtros = Object.fromEntries(Object.entries(req.body?.filtros || {})
      .filter(([clave, valor]) => permitidas.includes(clave) && valor !== '' && valor != null));

    const { rows } = await pool.query(`
      INSERT INTO contactabilidad_vistas (usuario, nombre, filtros, compartida)
      VALUES ($1,$2,$3::jsonb,$4)
      ON CONFLICT (usuario, nombre) DO UPDATE
        SET filtros = EXCLUDED.filtros, compartida = EXCLUDED.compartida, actualizado_at = NOW()
      RETURNING id, nombre, filtros, compartida
    `, [usuarioDe(req), nombre, JSON.stringify(filtros), Boolean(req.body?.compartida)]);

    res.json({ success: true, data: rows[0] });
  } catch (error) {
    return fallo(res, error, 'No se pudo guardar la vista', 'guardarVista');
  }
}

async function eliminarVista(req, res) {
  try {
    // El WHERE por usuario impide borrar la vista de otra persona.
    const { rowCount } = await pool.query(
      'DELETE FROM contactabilidad_vistas WHERE id = $1 AND usuario = $2',
      [Number(req.params.id), usuarioDe(req)]);
    if (!rowCount) return res.status(404).json({ success: false, error: 'Vista no encontrada' });
    res.json({ success: true });
  } catch (error) {
    return fallo(res, error, 'No se pudo eliminar la vista', 'eliminarVista');
  }
}

module.exports = {
  listar, stats, analytics, filtros, alertas,
  refrescarLead, refrescarGlobal, exportar, estado, webhookBitrix,
  listarVistas, guardarVista, eliminarVista,
  celdaCsv,
};
