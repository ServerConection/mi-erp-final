/**
 * 🟢 SESIONES BITRIX24 — submódulo de Bitrix Live
 *
 * Responde, sobre los usuarios de BITRIX24 (no del ERP):
 *   ¿cuántos están activos ahora? ¿desde hace cuánto?
 *   ¿entraron por móvil o por escritorio? ¿desde qué IP y dónde?
 *
 * ── De dónde sale cada dato (todo API oficial, nada inventado) ────────────────
 *
 *  user.get            → ID, NAME, LAST_NAME, WORK_POSITION, UF_DEPARTMENT,
 *                        IS_ONLINE, LAST_LOGIN, LAST_ACTIVITY_DATE
 *  im.user.list.get    → mobile_last_date / desktop_last_date  (móvil vs escritorio)
 *                        last_activity_date, idle, status
 *  timeman.status      → STATUS (OPENED/PAUSED/CLOSED), TIME_START, DURATION,
 *                        IP_OPEN, IP_CLOSE, latitud/longitud, TIME_LEAKS
 *
 * ── Lo que Bitrix NO da ──────────────────────────────────────────────────────
 * El historial completo de inicios de sesión (cada login con su IP, 180 días)
 * vive solo en la interfaz de Bitrix24 (Seguridad → Historial de accesos). No
 * tiene método REST. `timeman` cubre lo equivalente: cada jornada con su IP,
 * hora de inicio y ubicación.
 *
 * ── timeman puede estar apagado ──────────────────────────────────────────────
 * Si la cuenta no usa "Registro de jornada laboral", timeman.status devuelve
 * CLOSED para todos o error de permisos. En ese caso NO fallamos: marcamos
 * `timemanDisponible: false` y el tablero cae a IS_ONLINE + fechas de última
 * actividad, avisando al usuario de qué se está perdiendo y por qué.
 *
 * ── Rendimiento ──────────────────────────────────────────────────────────────
 * timeman.status es por usuario. Con 80 asesores serían 80 requests. Se usa el
 * método `batch` de Bitrix: 50 comandos por llamada HTTP. 80 usuarios = 2
 * requests por cuenta. Además hay caché de 60 s: el tablero refresca cada
 * minuto y no castiga la API.
 */

const XLSX = require('xlsx');
const db = require('../config/db');
const { empresaVisible, puedeCerrarJornada } = require('../shared/bitrixSesionesAcceso');

const BITRIX_APIS = {
  NOVONET: (process.env.BITRIX_NOVONET_URL || '').replace(/\/+$/, ''),
  VELSA:   (process.env.BITRIX_VELSA_URL   || '').replace(/\/+$/, ''),
};

const TIMEOUT   = 15_000;
const BATCH_MAX = 50;              // límite duro de Bitrix por llamada batch
const CACHE_TTL = 60 * 1000;       // el tablero refresca cada 60 s

const _cache = { data: null, expira: 0 };

const normalizar = (v) => String(v || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .trim().replace(/\s+/g, ' ').toUpperCase();

async function mapaEmpresasUsuarios() {
  const [catalogos, erp] = await Promise.all([
    db.query(`
      SELECT id::text, 'VELSA'::text AS empresa FROM public.bitrix_usuarios WHERE activo = true
      UNION ALL
      SELECT id::text, 'NOVONET'::text AS empresa FROM public.bitrix_usuarios_novonet WHERE activo = true
    `),
    db.query(`
      SELECT empresa, usuario, nombres, apellidos
      FROM public.usuarios
      WHERE activo = 'SI' AND UPPER(COALESCE(empresa, '')) IN ('NOVONET', 'VELSA', 'SEMILLERO')
    `),
  ]);

  const porId = new Map();
  // VELSA prevalece: el catálogo NOVONET viene de la licencia madre y también
  // contiene a las personas VELSA.
  for (const r of catalogos.rows.filter(r => r.empresa === 'NOVONET')) porId.set(r.id, r.empresa);
  for (const r of catalogos.rows.filter(r => r.empresa === 'VELSA')) porId.set(r.id, r.empresa);

  const porIdentidad = new Map();
  for (const r of erp.rows) {
    const nombre = normalizar(`${r.nombres || ''} ${r.apellidos || ''}`);
    const usuario = normalizar(r.usuario);
    if (nombre) porIdentidad.set(nombre, String(r.empresa).toUpperCase());
    if (usuario) porIdentidad.set(usuario, String(r.empresa).toUpperCase());
  }
  return { porId, porIdentidad };
}

// ── Utilidades de llamada ────────────────────────────────────────────────────

async function bitrixCall(baseUrl, metodo, params = {}) {
  const qs = new URLSearchParams();
  const plano = (obj, prefijo = '') => {
    for (const [k, v] of Object.entries(obj)) {
      const clave = prefijo ? `${prefijo}[${k}]` : k;
      if (v && typeof v === 'object') plano(v, clave);
      else qs.set(clave, v);
    }
  };
  plano(params);

  const r = await fetch(`${baseUrl}/${metodo}.json?${qs.toString()}`,
    { signal: AbortSignal.timeout(TIMEOUT) });
  if (!r.ok) throw new Error(`${metodo} HTTP ${r.status}`);
  const j = await r.json();
  if (j.error) throw new Error(`${metodo}: ${j.error_description || j.error}`);
  return j.result;
}

/**
 * Ejecuta N comandos en tandas de 50 usando el método `batch`.
 * Devuelve { result, error } por clave de comando.
 */
async function bitrixBatch(baseUrl, comandos) {
  const claves = Object.keys(comandos);
  const salida = { result: {}, error: {} };

  for (let i = 0; i < claves.length; i += BATCH_MAX) {
    const trozo = claves.slice(i, i + BATCH_MAX);
    const cmd = {};
    trozo.forEach(k => { cmd[k] = comandos[k]; });

    try {
      const res = await bitrixCall(baseUrl, 'batch', { halt: 0, cmd });
      Object.assign(salida.result, res?.result || {});
      Object.assign(salida.error,  res?.result_error || {});
    } catch (e) {
      // Una tanda que falla no debe tumbar las demás.
      trozo.forEach(k => { salida.error[k] = e.message; });
    }
  }
  return salida;
}

// ── Normalización ────────────────────────────────────────────────────────────

const fecha = (v) => {
  if (!v || v === 'false' || v === false) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
};

/** "HH:MM:SS" → segundos. Bitrix devuelve DURATION en ese formato. */
function duracionASegundos(txt) {
  if (!txt || typeof txt !== 'string') return null;
  const p = txt.split(':').map(Number);
  if (p.some(isNaN)) return null;
  if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2];
  if (p.length === 2) return p[0] * 60 + p[1];
  return null;
}

/**
 * De dónde se conecta el usuario, comparando la última actividad de la app
 * móvil contra la de escritorio. Si ambas son recientes (menos de 15 min de
 * diferencia) se reporta "ambos" en vez de elegir una arbitrariamente.
 */
function resolverDispositivo(movil, escritorio) {
  const m = movil      ? new Date(movil).getTime()      : 0;
  const e = escritorio ? new Date(escritorio).getTime() : 0;
  if (!m && !e) return 'web';                       // solo navegador, sin apps
  if (m && e && Math.abs(m - e) < 15 * 60 * 1000) return 'ambos';
  return m > e ? 'movil' : 'escritorio';
}

// ── Recolección por cuenta ───────────────────────────────────────────────────

async function traerCuenta(baseUrl, cuenta, mapaEmpresas) {
  if (!baseUrl) return { cuenta, usuarios: [], timemanDisponible: false, error: 'Sin URL configurada' };

  // 1 · Usuarios activos (paginado)
  const usuarios = [];
  let start = 0;
  while (true) {
    const res = await bitrixCall(baseUrl, 'user.get', { ACTIVE: 'Y', start });
    const lote = Array.isArray(res) ? res : (res?.result || []);
    usuarios.push(...lote);
    if (lote.length < 50) break;
    start += 50;
    if (start > 1000) break;                        // tope de seguridad
  }
  const ids = usuarios.map(u => String(u.ID));
  if (!ids.length) return { cuenta, usuarios: [], timemanDisponible: false };

  // 2 · Datos de mensajería: móvil vs escritorio
  let im = {};
  try {
    const res = await bitrixCall(baseUrl, 'im.user.list.get', { ID: ids });
    if (res && typeof res === 'object') im = res;
  } catch (e) {
    console.warn(`[bitrix-sesiones ${cuenta}] im.user.list.get:`, e.message);
  }

  // 3 · Jornada laboral, en tandas de 50
  const cmd = {};
  ids.forEach(id => { cmd[`t${id}`] = `timeman.status?USER_ID=${id}`; });
  const tm = await bitrixBatch(baseUrl, cmd);

  // Si TODOS fallan, timeman no está disponible en esta cuenta.
  const conRespuesta = ids.filter(id => tm.result[`t${id}`]).length;
  const timemanDisponible = conRespuesta > 0;

  const filas = usuarios.map(u => {
    const id  = String(u.ID);
    const imu = im[id] || im[Number(id)] || {};
    const st  = tm.result[`t${id}`] || null;

    const movil      = fecha(imu.mobile_last_date);
    const escritorio = fecha(imu.desktop_last_date);
    const estadoJornada = st?.STATUS || null;
    const inicio        = fecha(st?.TIME_START);

    // Tiempo conectado: si la jornada está abierta, lo real es "ahora menos la
    // hora de apertura". DURATION de Bitrix descuenta pausas, así que se
    // devuelven los dos y el tablero muestra el que corresponda.
    const segDesdeInicio = inicio ? Math.floor((Date.now() - new Date(inicio).getTime()) / 1000) : null;

    const nombre = [u.NAME, u.LAST_NAME].filter(Boolean).join(' ').trim() || `ID-${id}`;
    const empresaClasificada = mapaEmpresas.porIdentidad.get(normalizar(nombre))
      || mapaEmpresas.porIdentidad.get(normalizar(u.EMAIL))
      || mapaEmpresas.porId.get(id)
      || (cuenta === 'VELSA' ? 'VELSA' : 'NOVONET');

    return {
      id,
      nombre,
      cuenta:       empresaClasificada,
      portalCuenta: cuenta,
      cargo:        u.WORK_POSITION || null,
      email:        u.EMAIL || null,
      online:       u.IS_ONLINE === 'Y' || imu.status === 'online',
      ultimoLogin:      fecha(u.LAST_LOGIN),
      ultimaActividad:  fecha(u.LAST_ACTIVITY_DATE) || fecha(imu.last_activity_date),
      inactivoDesde:    fecha(imu.idle),

      dispositivo:      resolverDispositivo(movil, escritorio),
      movilUltimo:      movil,
      escritorioUltimo: escritorio,

      jornada:        estadoJornada,                       // OPENED | PAUSED | CLOSED | EXPIRED | null
      jornadaInicio:  inicio,
      jornadaFin:     fecha(st?.TIME_FINISH),
      jornadaFinSugerida: fecha(st?.TIME_FINISH_DEFAULT),
      duracionSeg:    duracionASegundos(st?.DURATION),     // descuenta pausas
      conectadoSeg:   estadoJornada === 'OPENED' || estadoJornada === 'PAUSED' ? segDesdeInicio : null,
      pausasSeg:      duracionASegundos(st?.TIME_LEAKS),
      ipInicio:       st?.IP_OPEN  || null,
      ipFin:          st?.IP_CLOSE || null,
      lat:            st?.LAT ?? st?.latitude  ?? null,
      lon:            st?.LON ?? st?.longitude ?? null,
    };
  });

  return { cuenta, usuarios: filas, timemanDisponible };
}

async function recolectar({ forzar = false } = {}) {
  // forzar = true lo usa el botón "Forzar actualización" del Reparto de Gestionables
  if (!forzar && _cache.data && Date.now() < _cache.expira) return _cache.data;

  const mapaEmpresas = await mapaEmpresasUsuarios();
  const [nov, vel] = await Promise.all([
    traerCuenta(BITRIX_APIS.NOVONET, 'NOVONET', mapaEmpresas).catch(e => ({ cuenta: 'NOVONET', usuarios: [], timemanDisponible: false, error: e.message })),
    traerCuenta(BITRIX_APIS.VELSA,   'VELSA', mapaEmpresas).catch(e => ({ cuenta: 'VELSA',   usuarios: [], timemanDisponible: false, error: e.message })),
  ]);

  // La licencia NOVONET es corporativa y puede devolver también personas de
  // VELSA. Si el portal VELSA las devuelve otra vez, se conserva una sola fila.
  const unicos = new Map();
  for (const u of [...nov.usuarios, ...vel.usuarios]) {
    const clave = `${u.cuenta}:${u.id}`;
    if (!unicos.has(clave)) unicos.set(clave, u);
  }
  const usuarios = [...unicos.values()];
  const data = {
    usuarios,
    timemanDisponible: nov.timemanDisponible || vel.timemanDisponible,
    fuentes: {
      NOVONET: { usuarios: nov.usuarios.length, timeman: nov.timemanDisponible, error: nov.error || null },
      VELSA:   { usuarios: vel.usuarios.length, timeman: vel.timemanDisponible, error: vel.error || null },
    },
    generado: new Date().toISOString(),
  };

  _cache.data   = data;
  _cache.expira = Date.now() + CACHE_TTL;
  return data;
}

// ── Filtros ──────────────────────────────────────────────────────────────────
// Los filtros son DINÁMICOS: las opciones no están escritas a mano, se derivan
// de lo que realmente devolvió Bitrix en esta consulta. Si mañana aparece un
// cargo nuevo o una cuenta nueva, el filtro lo muestra solo.

const ESTADOS = {
  activos:    (u) => u.jornada === 'OPENED',
  pausa:      (u) => u.jornada === 'PAUSED',
  cerrados:   (u) => u.jornada === 'CLOSED' || u.jornada === 'EXPIRED' || !u.jornada,
  online:     (u) => u.online,
  offline:    (u) => !u.online,
};

function aplicarFiltros(usuarios, q) {
  let out = usuarios;

  if (q.cuenta && q.cuenta !== 'TODOS')
    out = out.filter(u => u.cuenta === q.cuenta);

  if (q.estado && q.estado !== 'todos' && ESTADOS[q.estado])
    out = out.filter(ESTADOS[q.estado]);

  if (q.dispositivo && q.dispositivo !== 'todos')
    out = out.filter(u => u.dispositivo === q.dispositivo);

  if (q.cargo && q.cargo !== 'todos')
    out = out.filter(u => (u.cargo || 'Sin cargo') === q.cargo);

  if (q.ip)
    out = out.filter(u => (u.ipInicio || '').includes(q.ip) || (u.ipFin || '').includes(q.ip));

  if (q.buscar) {
    const t = String(q.buscar).toLowerCase();
    out = out.filter(u =>
      u.nombre.toLowerCase().includes(t) ||
      (u.cargo || '').toLowerCase().includes(t) ||
      (u.email || '').toLowerCase().includes(t) ||
      (u.ipInicio || '').includes(t));
  }

  // Mínimo de horas conectado, para "muéstrame quién lleva más de 4 horas"
  const minH = parseFloat(q.minHoras);
  if (!isNaN(minH) && minH > 0)
    out = out.filter(u => (u.conectadoSeg || 0) >= minH * 3600);

  return out;
}

/** Opciones de filtro derivadas de los datos reales, con su conteo. */
function construirOpciones(usuarios) {
  const contar = (fn) => {
    const m = new Map();
    usuarios.forEach(u => { const k = fn(u); if (k) m.set(k, (m.get(k) || 0) + 1); });
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([valor, total]) => ({ valor, total }));
  };
  return {
    cuentas:      contar(u => u.cuenta),
    cargos:       contar(u => u.cargo || 'Sin cargo'),
    dispositivos: contar(u => u.dispositivo),
    estados: [
      { valor: 'activos',  total: usuarios.filter(ESTADOS.activos).length,  label: 'Jornada abierta' },
      { valor: 'pausa',    total: usuarios.filter(ESTADOS.pausa).length,    label: 'En pausa' },
      { valor: 'cerrados', total: usuarios.filter(ESTADOS.cerrados).length, label: 'Sin jornada' },
      { valor: 'online',   total: usuarios.filter(ESTADOS.online).length,   label: 'En línea' },
      { valor: 'offline',  total: usuarios.filter(ESTADOS.offline).length,  label: 'Desconectados' },
    ],
  };
}

const universoPara = (base, usuario) => {
  const empresa = empresaVisible(usuario);
  return empresa ? base.usuarios.filter(u => u.cuenta === empresa) : [];
};

// ── GET /api/bitrix-sesiones/live ────────────────────────────────────────────
const getLive = async (req, res) => {
  try {
    const base = await recolectar();
    const universo = universoPara(base, req.user);
    const filtrados = aplicarFiltros(universo, { ...req.query, cuenta: empresaVisible(req.user) });

    const conJornada = filtrados.filter(u => u.conectadoSeg != null);
    const promedio = conJornada.length
      ? Math.round(conJornada.reduce((s, u) => s + u.conectadoSeg, 0) / conJornada.length)
      : null;

    res.json({
      success: true,
      generado: base.generado,
      timemanDisponible: base.timemanDisponible,
      empresa: empresaVisible(req.user),
      puedeCerrarJornada: puedeCerrarJornada(req.user),
      // Las opciones salen del universo COMPLETO, no del filtrado: si vinieran
      // del filtrado, al elegir un valor desaparecerían los demás y el usuario
      // quedaría atrapado sin poder cambiar de filtro.
      opciones: construirOpciones(universo),
      resumen: {
        totalUsuarios:  universo.length,
        mostrados:      filtrados.length,
        jornadaAbierta: filtrados.filter(ESTADOS.activos).length,
        enPausa:        filtrados.filter(ESTADOS.pausa).length,
        enLinea:        filtrados.filter(ESTADOS.online).length,
        movil:          filtrados.filter(u => u.dispositivo === 'movil').length,
        escritorio:     filtrados.filter(u => u.dispositivo === 'escritorio').length,
        ambos:          filtrados.filter(u => u.dispositivo === 'ambos').length,
        promedioConectadoSeg: promedio,
        ipsDistintas:   new Set(filtrados.map(u => u.ipInicio).filter(Boolean)).size,
      },
      data: filtrados.sort((a, b) => (b.conectadoSeg || 0) - (a.conectadoSeg || 0)),
    });
  } catch (err) {
    console.error('[bitrix-sesiones live]', err.message);
    res.status(500).json({ success: false, error: process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : err.message });
  }
};

// ── GET /api/bitrix-sesiones/export ──────────────────────────────────────────
// Descarga lo mismo que se está viendo, con los mismos filtros aplicados.
const exportar = async (req, res) => {
  try {
    const base = await recolectar();
    const universo = universoPara(base, req.user);
    const filas = aplicarFiltros(universo, { ...req.query, cuenta: empresaVisible(req.user) });

    const hhmmss = (s) => {
      if (s == null) return '';
      const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
      return [h, m, x].map(n => String(n).padStart(2, '0')).join(':');
    };
    const local = (f) => f ? new Date(f).toLocaleString('es-EC', { timeZone: 'America/Guayaquil' }) : '';
    const JORNADA = { OPENED: 'Jornada abierta', PAUSED: 'En pausa', CLOSED: 'Cerrada', EXPIRED: 'Expirada' };
    const DISPO   = { movil: 'Móvil', escritorio: 'Escritorio', ambos: 'Móvil y escritorio', web: 'Solo navegador' };

    const datos = filas.map(u => ({
      'Usuario':               u.nombre,
      'Cuenta':                u.cuenta,
      'Cargo':                 u.cargo || '',
      'En línea':              u.online ? 'Sí' : 'No',
      'Estado jornada':        JORNADA[u.jornada] || 'Sin registro',
      'Inicio de jornada':     local(u.jornadaInicio),
      'Tiempo conectado':      hhmmss(u.conectadoSeg),
      'Tiempo neto (sin pausas)': hhmmss(u.duracionSeg),
      'Tiempo en pausa':       hhmmss(u.pausasSeg),
      'IP de conexión':        u.ipInicio || '',
      'IP de cierre':          u.ipFin || '',
      'Latitud':               u.lat ?? '',
      'Longitud':              u.lon ?? '',
      'Dispositivo':           DISPO[u.dispositivo] || u.dispositivo,
      'Última act. móvil':     local(u.movilUltimo),
      'Última act. escritorio':local(u.escritorioUltimo),
      'Último login':          local(u.ultimoLogin),
      'Última actividad':      local(u.ultimaActividad),
      'Email':                 u.email || '',
    }));

    const hoja = XLSX.utils.json_to_sheet(datos);
    hoja['!cols'] = [{ wch: 26 }, { wch: 10 }, { wch: 22 }, { wch: 9 }, { wch: 16 }, { wch: 19 },
                     { wch: 15 }, { wch: 20 }, { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 12 },
                     { wch: 12 }, { wch: 18 }, { wch: 19 }, { wch: 20 }, { wch: 19 }, { wch: 19 }, { wch: 26 }];
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, 'Sesiones Bitrix');

    const buffer = XLSX.write(libro, { bookType: 'xlsx', type: 'buffer' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="sesiones_bitrix_${new Date().toISOString().slice(0,10)}.xlsx"`);
    res.send(buffer);
  } catch (err) {
    console.error('[bitrix-sesiones export]', err.message);
    res.status(500).json({ success: false, error: process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : err.message });
  }
};

// ── GET /api/bitrix-sesiones/diagnostico ─────────────────────────────────────
// Dice, sin rodeos, qué métodos responden en cada cuenta. Sirve para saber si
// "Registro de jornada laboral" está activo antes de culpar al módulo.
const diagnostico = async (req, res) => {
  const empresa = empresaVisible(req.user);
  const salida = {};
  for (const [cuenta, url] of Object.entries(BITRIX_APIS)) {
    if (cuenta !== empresa && !(empresa === 'VELSA' && cuenta === 'NOVONET')) continue;
    if (!url) { salida[cuenta] = { configurada: false }; continue; }
    const probar = async (m, p) => {
      try { const r = await bitrixCall(url, m, p); return { ok: true, muestra: Array.isArray(r) ? r.length : typeof r }; }
      catch (e) { return { ok: false, error: e.message }; }
    };
    const users = await probar('user.get', { ACTIVE: 'Y' });
    let unId = null;
    try { const r = await bitrixCall(url, 'user.get', { ACTIVE: 'Y' }); unId = r?.[0]?.ID; } catch { /* ya reportado arriba */ }
    salida[cuenta] = {
      configurada: true,
      'user.get':          users,
      'im.user.list.get':  unId ? await probar('im.user.list.get', { ID: [unId] }) : { ok: false, error: 'sin usuarios' },
      'timeman.status':    unId ? await probar('timeman.status',   { USER_ID: unId }) : { ok: false, error: 'sin usuarios' },
    };
  }
  res.json({ success: true, cuentas: salida });
};

let auditoriaLista = false;
async function asegurarAuditoria() {
  if (auditoriaLista) return;
  await db.query(`
    CREATE TABLE IF NOT EXISTS public.bitrix_sesiones_auditoria (
      id BIGSERIAL PRIMARY KEY,
      actor_usuario_id INTEGER NOT NULL,
      actor_usuario VARCHAR(200), actor_perfil VARCHAR(50) NOT NULL, actor_empresa VARCHAR(50) NOT NULL,
      objetivo_bitrix_id VARCHAR(50) NOT NULL, objetivo_nombre VARCHAR(250), objetivo_empresa VARCHAR(50) NOT NULL,
      accion VARCHAR(50) NOT NULL, resultado VARCHAR(20) NOT NULL, detalle TEXT, ip VARCHAR(100),
      creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  auditoriaLista = true;
}

async function auditarCierre(req, objetivo, resultado, detalle) {
  await asegurarAuditoria();
  await db.query(
    `INSERT INTO public.bitrix_sesiones_auditoria
       (actor_usuario_id, actor_usuario, actor_perfil, actor_empresa,
        objetivo_bitrix_id, objetivo_nombre, objetivo_empresa, accion, resultado, detalle, ip)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'CERRAR_JORNADA',$8,$9,$10)`,
    [req.user.id, req.user.nombreCompleto || req.user.usuario || null, req.user.perfil, req.user.empresa,
      objetivo?.id || req.params.usuarioId, objetivo?.nombre || null, req.params.cuenta, resultado,
      String(detalle || '').slice(0, 2000), req.ip || null]
  );
}

// POST /api/bitrix-sesiones/:cuenta/:usuarioId/cerrar-jornada
// timeman.close finaliza la jornada; Bitrix no expone por REST una revocación
// general de todas las sesiones web del empleado.
const cerrarJornada = async (req, res) => {
  const empresa = empresaVisible(req.user);
  const cuenta = String(req.params.cuenta || '').toUpperCase();
  const usuarioId = String(req.params.usuarioId || '').trim();
  if (!puedeCerrarJornada(req.user) || cuenta !== empresa) {
    await auditarCierre(req, null, 'RECHAZADO', 'Intento de cerrar una jornada fuera de su empresa').catch(() => {});
    return res.status(403).json({ success: false, error: 'No puede cerrar jornadas de otra empresa' });
  }
  if (!/^\d+$/.test(usuarioId)) return res.status(400).json({ success: false, error: 'Usuario Bitrix inválido' });

  let objetivo = null;
  try {
    const base = await recolectar({ forzar: true });
    objetivo = universoPara(base, req.user).find(u => u.cuenta === cuenta && u.id === usuarioId);
    if (!objetivo) {
      await auditarCierre(req, null, 'RECHAZADO', 'Usuario no encontrado en la empresa autorizada');
      return res.status(404).json({ success: false, error: 'Usuario no encontrado en su empresa' });
    }
    if (!['OPENED', 'PAUSED', 'EXPIRED'].includes(objetivo.jornada)) {
      await auditarCierre(req, objetivo, 'RECHAZADO', `La jornada estaba en estado ${objetivo.jornada || 'SIN_REGISTRO'}`);
      return res.status(409).json({ success: false, error: 'La jornada ya no está abierta' });
    }

    const url = BITRIX_APIS[objetivo.portalCuenta];
    if (!url) throw new Error('La cuenta Bitrix del usuario no está configurada');
    const params = { USER_ID: usuarioId };
    // Una jornada expirada comenzó otro día. Bitrix entrega el cierre sugerido
    // para esa fecha; al enviar TIME también exige REPORT.
    if (objetivo.jornada === 'EXPIRED' && objetivo.jornadaFinSugerida) {
      params.TIME = objetivo.jornadaFinSugerida;
      params.REPORT = 'Cierre remoto desde ERP: jornada olvidada por el usuario';
    }
    const resultado = await bitrixCall(url, 'timeman.close', params);
    _cache.data = null;
    _cache.expira = 0;
    await auditarCierre(req, objetivo, 'EXITO', `Estado devuelto por Bitrix: ${resultado?.STATUS || 'CLOSED'}`);
    res.json({
      success: true,
      message: `Jornada de ${objetivo.nombre} cerrada en Bitrix`,
      jornada: resultado?.STATUS || 'CLOSED',
      nota: 'Se cerró la jornada laboral. La API de Bitrix no revoca todas las sesiones web del usuario.',
    });
  } catch (err) {
    console.error('[bitrix-sesiones cerrar-jornada]', err.message);
    await auditarCierre(req, objetivo, 'ERROR', err.message).catch(e => console.error('[bitrix-sesiones auditoría]', e.message));
    res.status(502).json({ success: false, error: `Bitrix no pudo cerrar la jornada: ${err.message}` });
  }
};

module.exports = { getLive, exportar, diagnostico, cerrarJornada, recolectar, BITRIX_APIS };
