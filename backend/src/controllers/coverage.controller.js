/**
 * Coverage Controller
 * Maneja validación de cobertura de internet
 * Pure JavaScript - Sin dependencias Python
 * (rev: resolución robusta de NetworkLinks + reintentos)
 */

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const AdmZip = require('adm-zip');
const pool   = require('../config/db');
// xml2js ya NO se usa para KML — reemplazado por parser regex de bajo consumo

// ════════════════════════════════════════════════════════════════════════════════
// Location URL Parser  (WhatsApp, Google Maps, Apple Maps, coordenadas directas)
// ════════════════════════════════════════════════════════════════════════════════

function isValidCoords(lat, lon) {
  return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

function parseCoordPair(text) {
  const m = text.trim().match(/^(-?\d+\.?\d*),\s*(-?\d+\.?\d*)$/);
  if (m) {
    const lat = parseFloat(m[1]);
    const lon = parseFloat(m[2]);
    if (isValidCoords(lat, lon)) return { lat, lon };
  }
  return null;
}

function parseCoordinatesFromUrl(text) {
  text = (text || '').trim();

  const direct = parseCoordPair(text);
  if (direct) return direct;

  try {
    const url = new URL(text);
    const params = new URLSearchParams(url.search);

    if (params.has('q')) {
      const r = parseCoordPair(params.get('q'));
      if (r) return r;
    }

    if (params.has('ll')) {
      const r = parseCoordPair(params.get('ll'));
      if (r) return r;
    }

    const pathMatch = url.pathname.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
    if (pathMatch) {
      const lat = parseFloat(pathMatch[1]);
      const lon = parseFloat(pathMatch[2]);
      if (isValidCoords(lat, lon)) return { lat, lon };
    }

    const searchMatch = url.pathname.match(/\/search\/(-?\d+\.?\d*)(?:,\+?|,\s*)(-?\d+\.?\d*)/);
    if (searchMatch) {
      const lat = parseFloat(searchMatch[1]);
      const lon = parseFloat(searchMatch[2]);
      if (isValidCoords(lat, lon)) return { lat, lon };
    }

  } catch (e) {}

  const generalMatch = text.match(/(-?\d{1,2}\.\d{4,})[,\s]+(-?\d{1,3}\.\d{4,})/);
  if (generalMatch) {
    const lat = parseFloat(generalMatch[1]);
    const lon = parseFloat(generalMatch[2]);
    if (isValidCoords(lat, lon)) return { lat, lon };
  }

  return null;
}

function isShortenedUrl(url) {
  const shortHosts = ['goo.gl', 'maps.app.goo.gl', 'bit.ly', 't.co', 'tinyurl.com'];
  try {
    const { hostname } = new URL(url);
    return shortHosts.some(h => hostname === h || hostname.endsWith('.' + h));
  } catch {
    return false;
  }
}

// ════════════════════════════════════════════════════════════════════════════════
// Persistencia en PostgreSQL — sobrevive reinicios y deploys en Render
// Render tiene filesystem efímero; la DB es la única persistencia confiable.
// FIXES:
//   1. file_data BYTEA — guarda el archivo original comprimido (mucho más pequeño
//      que el JSONB de coordenadas). Se usa para restaurar en frío.
//   2. saveZonesToDB es NO-AWAIT en loadCoverage — responde al cliente antes de
//      guardar, evitando el timeout de 30s de Render en archivos grandes.
//   3. ensureZonesLoaded — lazy-load en checkCoverage/checkBatch: si el servidor
//      despertó de inactividad y perdió la memoria, recarga automáticamente.
// ════════════════════════════════════════════════════════════════════════════════

let loadedZones  = null;
let loadedAt     = null;
let loadedFile   = null;
let spatialIndex = null; // grilla de zonas de COBERTURA
let dangerIndex  = null; // grilla de zonas de PELIGRO (independiente)
let dbRestoring  = false; // semáforo para evitar restauraciones paralelas

// ════════════════════════════════════════════════════════════════════════════════
// ACUMULACIÓN DE COBERTURA
// ────────────────────────────────────────────────────────────────────────────────
// La cobertura de Netlife está repartida en MUCHOS archivos y mapas externos
// (KMZ por ciudad, ~250 mapas de My Maps, TelcoDrive…). Ningún archivo tiene el
// total. Por eso el modo por defecto es SUMAR: cada carga se agrega al acervo
// existente en vez de reemplazarlo.
//
// Antes cada carga hacía DELETE de todo, así que subir un archivo pequeño
// borraba la cobertura acumulada y zonas que antes daban "sí" pasaban a "no".
//
// Para que sumar no genere duplicados se calcula una clave por zona
// (nombre + geometría). Si la clave ya está cargada, se omite.
// ════════════════════════════════════════════════════════════════════════════════

let loadedKeys = new Set(); // claves de todas las zonas en memoria

/** Clave estable de una zona: mismo nombre + misma geometría ⇒ misma clave. */
function zoneKey(z) {
  const h = crypto.createHash('md5');
  h.update((z.name || '') + '|' + (z.type || 'Polygon') + '|');
  for (const c of (z.coordinates || [])) {
    h.update(Number(c[0]).toFixed(6) + ',' + Number(c[1]).toFixed(6) + ';');
  }
  return h.digest('hex');
}

/** Reemplaza por completo el set de zonas en memoria y reconstruye todo. */
function setLoadedZones(zones) {
  loadedZones = zones || [];
  loadedKeys  = new Set();
  for (const z of loadedZones) {
    if (!z._key) z._key = zoneKey(z);
    loadedKeys.add(z._key);
  }
  rebuildIndexes(loadedZones);
}

/**
 * Filtra las zonas que YA están cargadas (por clave) y devuelve solo las nuevas.
 * También deduplica dentro del propio lote entrante.
 */
function soloNuevas(zones) {
  const nuevas = [];
  for (const z of (zones || [])) {
    const k = z._key || zoneKey(z);
    if (loadedKeys.has(k)) continue;
    z._key = k;
    loadedKeys.add(k);
    nuevas.push(z);
  }
  return nuevas;
}

/**
 * Quita de memoria todas las zonas que vinieron de un archivo de origen.
 * Es la base del modo "actualizar": al resubir un archivo, sus zonas viejas
 * se retiran y entran las nuevas, SIN tocar lo aportado por otros archivos.
 * Necesario porque si Telconet cambia la forma de un polígono, la clave cambia
 * y sin esto quedarían conviviendo la versión vieja y la nueva.
 */
function quitarZonasDeArchivo(fileName) {
  if (!loadedZones || !fileName) return 0;
  const antes = loadedZones.length;
  const quedan = loadedZones.filter(z => z.fileName !== fileName);
  if (quedan.length === antes) return 0;
  setLoadedZones(quedan);
  return antes - quedan.length;
}

/** Resumen de los archivos de origen cargados en memoria. */
function resumenArchivos() {
  const m = new Map();
  for (const z of (loadedZones || [])) {
    const f = z.fileName || '(desconocido)';
    if (!m.has(f)) m.set(f, { fileName: f, total: 0, cobertura: 0, peligro: 0, puntos: 0 });
    const r = m.get(f);
    r.total++;
    if (z.dangerType) r.peligro++;
    else if (z.type === 'Point') r.puntos++;
    else r.cobertura++;
  }
  return [...m.values()].sort((a, b) => b.total - a.total);
}

// Estado de resolución de NetworkLinks (enlaces a mapas externos: Google My Maps,
// Telcodrive, etc.). Se resuelven en background porque pueden ser cientos/miles
// y cada uno requiere una petición HTTP saliente.
let networkLinksState = { total: 0, resolved: 0, failed: 0, loading: false, zonesAdded: 0 };

// Cuenta zonas cargadas por tipo de geometría (Point / LineString / Polygon)
function countByType(zones) {
  return (zones || []).reduce((acc, z) => {
    const t = z.type || 'Polygon';
    acc[t] = (acc[t] || 0) + 1;
    return acc;
  }, {});
}

// ════════════════════════════════════════════════════════════════════════════════
// Clasificación de ZONAS DE PELIGRO
// ────────────────────────────────────────────────────────────────────────────────
// Telconet cambió la nomenclatura con el tiempo:
//   • Hasta 2024  → "OPU", "GIS"                        (Guayaquil)
//   • Desde 2025  → "Bloqueado", "Horario restringido"  (nacional)
// Ambas convenciones conviven en el mismo KMZ, así que se reconocen las dos.
//
// Tipos y su significado operativo:
//   BLOQUEADO           → NO ingresar. Prohibido.
//   HORARIO_RESTRINGIDO → Se puede ingresar solo en horario permitido.
//   RESTRINGIDA         → Marcada como peligrosa (nomenclatura antigua OPU/GIS).
// ════════════════════════════════════════════════════════════════════════════════

const DANGER_BLOQUEADO   = 'BLOQUEADO';
const DANGER_HORARIO     = 'HORARIO_RESTRINGIDO';
const DANGER_RESTRINGIDA = 'RESTRINGIDA';

const DANGER_LABELS = {
  [DANGER_BLOQUEADO]:   'Bloqueado',
  [DANGER_HORARIO]:     'Horario restringido',
  [DANGER_RESTRINGIDA]: 'Zona restringida'
};

// Nomenclatura antigua: nombres exactos (no substring — "GIS" aparecería dentro
// de palabras como "REGISTRO" y marcaría zonas buenas como peligrosas).
const DANGER_LEGACY_EXACT = new Set(['OPU', 'GIS', 'AZ4']);

/**
 * Determina si una zona es de peligro a partir de su nombre y el de su carpeta.
 * Devuelve null si no es peligrosa, o el tipo (constante DANGER_*) si lo es.
 */
function classifyDanger(zoneName, folderName) {
  const n = (zoneName || '').trim();
  if (!n) return null;

  const upper = n.toUpperCase();

  // Nomenclatura nueva (2025+) — por nombre del placemark
  if (upper.includes('BLOQUEAD'))                          return DANGER_BLOQUEADO;
  if (upper.includes('HORARIO') && upper.includes('RESTR')) return DANGER_HORARIO;

  // Nomenclatura antigua (OPU / GIS / AZ4) — coincidencia EXACTA
  if (DANGER_LEGACY_EXACT.has(upper)) return DANGER_RESTRINGIDA;

  // Respaldo por CARPETA contenedora: marca la zona aunque su nombre no siga
  // ninguna convención conocida. Cubre dos casos:
  //   • carpetas originales de Telconet ("Zonas_Peligro_Urbano", "Zonas-Peligros-Gye")
  //   • carpetas ya agrupadas por tipo ("Bloqueado", "Horario restringido",
  //     "Zona restringida"), como quedan en un archivo consolidado.
  const f = (folderName || '').toUpperCase();
  const carpetaBloqueado  = f.includes('BLOQUEAD');
  const carpetaHorario    = f.includes('HORARIO') && f.includes('RESTR');
  const carpetaRestringida = f.includes('RESTRINGID');
  const carpetaPeligro    = f.includes('PELIGRO');

  if (carpetaPeligro || carpetaBloqueado || carpetaHorario || carpetaRestringida) {
    // El nombre de la zona manda; si no dice nada, decide la carpeta.
    if (upper.includes('BLOQUEAD'))                           return DANGER_BLOQUEADO;
    if (upper.includes('HORARIO') && upper.includes('RESTR')) return DANGER_HORARIO;
    if (carpetaBloqueado) return DANGER_BLOQUEADO;
    if (carpetaHorario)   return DANGER_HORARIO;
    return DANGER_RESTRINGIDA;
  }

  return null;
}

// Cuenta zonas de peligro por tipo
function countDanger(zones) {
  const acc = {};
  for (const z of (zones || [])) {
    if (!z.dangerType) continue;
    acc[z.dangerType] = (acc[z.dangerType] || 0) + 1;
  }
  return acc;
}

// Garantiza que la tabla coverage_zones exista (y la migra si viene de una versión anterior)
async function ensureCoverageTable() {
  // Tabla de zonas individuales — una fila por elemento (Point/LineString/Polygon)
  // Mucho mejor que un JSONB gigante: inserts por lotes, loads rápidos
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.coverage_zones (
      id          SERIAL PRIMARY KEY,
      file_name   TEXT    NOT NULL,
      name        TEXT,
      type        TEXT    DEFAULT 'Polygon',
      source      TEXT,
      coordinates JSONB   NOT NULL,
      bbox_minlon FLOAT,
      bbox_minlat FLOAT,
      bbox_maxlon FLOAT,
      bbox_maxlat FLOAT,
      loaded_at   TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  // Migración para tablas creadas antes de que existieran type/source
  await pool.query(`ALTER TABLE public.coverage_zones ADD COLUMN IF NOT EXISTS type   TEXT DEFAULT 'Polygon'`);
  await pool.query(`ALTER TABLE public.coverage_zones ADD COLUMN IF NOT EXISTS source TEXT`);
  // Zonas de peligro: BLOQUEADO / HORARIO_RESTRINGIDO / RESTRINGIDA (NULL = normal)
  await pool.query(`ALTER TABLE public.coverage_zones ADD COLUMN IF NOT EXISTS danger_type TEXT`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_coverage_zones_danger ON public.coverage_zones (danger_type) WHERE danger_type IS NOT NULL`);

  // Registro de NetworkLinks (mapas externos) — permite reintentar los fallidos
  // sin volver a subir el KMZ, y sobrevive reinicios del servidor.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.coverage_links (
      href        TEXT PRIMARY KEY,
      status      TEXT DEFAULT 'pending',
      zones_count INT  DEFAULT 0,
      error       TEXT,
      updated_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

// Inserta zonas SIN borrar las existentes (para las que llegan de NetworkLinks).
// Así el progreso queda persistido incrementalmente y sobrevive reinicios.
async function appendZonesToDB(zones, fileName) {
  if (!zones || zones.length === 0) return;
  await ensureCoverageTable();
  const BATCH = 200;
  for (let i = 0; i < zones.length; i += BATCH) {
    const batch  = zones.slice(i, i + BATCH);
    const values = [];
    const params = [];
    let   p      = 1;
    for (const z of batch) {
      const bbox = buildBBox(z.coordinates);
      values.push(`($${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++})`);
      params.push(
        fileName, z.name, z.type || 'Polygon', z.source || null,
        z.dangerType || null,
        JSON.stringify(z.coordinates),
        bbox.minLon, bbox.minLat, bbox.maxLon, bbox.maxLat
      );
    }
    await pool.query(
      `INSERT INTO public.coverage_zones
         (file_name, name, type, source, danger_type, coordinates, bbox_minlon, bbox_minlat, bbox_maxlon, bbox_maxlat)
       VALUES ${values.join(',')}`,
      params
    );
  }
}

// Guarda zonas como filas individuales en batch de 200
// Sin JSON.stringify de todo el array — sin OOM
async function saveZonesToDB(zones, fileName) {
  try {
    await ensureCoverageTable();

    // Borrar zonas anteriores
    await pool.query('DELETE FROM public.coverage_zones');

    // Insertar en lotes de 200
    const BATCH = 200;
    for (let i = 0; i < zones.length; i += BATCH) {
      const batch  = zones.slice(i, i + BATCH);
      const values = [];
      const params = [];
      let   p      = 1;

      for (const z of batch) {
        const bbox = buildBBox(z.coordinates);
        values.push(`($${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++})`);
        params.push(
          fileName,
          z.name,
          z.type || 'Polygon',
          z.source || null,
          z.dangerType || null,
          JSON.stringify(z.coordinates),
          bbox.minLon, bbox.minLat, bbox.maxLon, bbox.maxLat
        );
      }

      await pool.query(
        `INSERT INTO public.coverage_zones
           (file_name, name, type, source, danger_type, coordinates, bbox_minlon, bbox_minlat, bbox_maxlon, bbox_maxlat)
         VALUES ${values.join(',')}`,
        params
      );
    }

    console.log('[Coverage] Zonas guardadas en DB:', zones.length, '| archivo:', fileName);
  } catch (e) {
    console.error('[Coverage] Error guardando zonas en DB:', e.message);
  }
}

// Restaura zonas desde DB (carga todas las filas de una vez)
async function loadZonesFromDB() {
  try {
    await ensureCoverageTable();
    const { rows } = await pool.query(
      `SELECT name, type, source, danger_type, coordinates, bbox_minlon, bbox_minlat, bbox_maxlon, bbox_maxlat, file_name, loaded_at
       FROM public.coverage_zones ORDER BY id`
    );
    if (!rows.length) return null;

    const zones = rows.map(r => ({
      name:        r.name,
      coordinates: r.coordinates,
      type:        r.type || 'Polygon',
      source:      r.source || null,
      // Zonas guardadas ANTES de esta versión no tienen danger_type en DB.
      // Se reclasifican al vuelo para no exigir recargar el KMZ.
      dangerType:  r.danger_type || classifyDanger(r.name, '') || undefined,
      // Archivo de origen: permite actualizar o quitar un origen concreto
      // sin tocar los demás.
      fileName:    r.file_name,
      bbox: {
        minLon: r.bbox_minlon, minLat: r.bbox_minlat,
        maxLon: r.bbox_maxlon, maxLat: r.bbox_maxlat
      }
    }));

    console.log('[Coverage] Restaurado desde DB — zonas:', zones.length,
      '| de peligro:', zones.filter(z => z.dangerType).length);
    return { zones, fileName: rows[0].file_name, savedAt: rows[0].loaded_at };
  } catch (e) {
    console.warn('[Coverage] No se pudo restaurar desde DB:', e.message);
    return null;
  }
}

// Lazy-load: si las zonas se perdieron de memoria (reinicio de Render),
// las recarga desde DB automáticamente antes de responder al usuario
async function ensureZonesLoaded() {
  if (loadedZones && loadedZones.length > 0) return true;
  if (dbRestoring) {
    // Esperar hasta 8s a que termine otra restauración en curso
    for (let i = 0; i < 16; i++) {
      await new Promise(r => setTimeout(r, 500));
      if (loadedZones && loadedZones.length > 0) return true;
    }
    return false;
  }
  dbRestoring = true;
  try {
    console.log('[Coverage] Zonas no en memoria — restaurando desde DB...');
    const cached = await loadZonesFromDB();
    if (cached) {
      setLoadedZones(cached.zones);
      loadedAt     = cached.savedAt;
      loadedFile   = cached.fileName;
      console.log('[Coverage] Restauración lazy exitosa — zonas:', loadedZones.length);
      return true;
    }
    return false;
  } finally {
    dbRestoring = false;
  }
}

// Inicialización al arrancar el servidor — con reintentos
(async () => {
  const intentos = 3;
  for (let i = 1; i <= intentos; i++) {
    try {
      const cached = await loadZonesFromDB();
      if (cached) {
        setLoadedZones(cached.zones);
        loadedAt     = cached.savedAt;
        loadedFile   = cached.fileName;
        console.log('[Coverage] Inicialización exitosa — zonas:', loadedZones.length);
      } else {
        console.log('[Coverage] Sin zonas previas en DB — esperando carga de KMZ');
      }
      break; // éxito
    } catch (e) {
      console.error(`[Coverage] Error en inicialización (intento ${i}/${intentos}):`, e.message);
      if (i < intentos) await new Promise(r => setTimeout(r, 3000 * i));
    }
  }
})();

// ════════════════════════════════════════════════════════════════════════════════
// Point in Polygon Algorithm
// ════════════════════════════════════════════════════════════════════════════════

function pointInPolygon(point, polygon) {
  const [x, y] = point;
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1];
    const xj = polygon[j][0], yj = polygon[j][1];

    const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }

  return inside;
}

// ════════════════════════════════════════════════════════════════════════════════
// Índice espacial por grilla — O(1) lookup en vez de O(N) lineal
// Cada celda de ~0.05° (~5km) guarda los índices de zonas que la solapan.
// ════════════════════════════════════════════════════════════════════════════════

const GRID_CELL = 0.05; // grados (~5.5 km) — ajusta según tamaño medio de zona

function buildBBox(coords) {
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  for (const [lon, lat] of coords) {
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  return { minLon, minLat, maxLon, maxLat };
}

/**
 * Construye la grilla espacial.
 * @param {Array}   zones  todas las zonas cargadas
 * @param {Object}  opts   { soloPeligro: true } → indexa SOLO zonas de peligro
 *
 * Se construyen DOS índices independientes (cobertura y peligro) porque son
 * preguntas distintas: un punto puede tener cobertura Y estar en zona bloqueada
 * a la vez. Con un solo índice se devolvía la primera coincidencia y la alerta
 * de peligro podía quedar enmascarada por una zona de cobertura.
 */
function buildSpatialIndex(zones, opts = {}) {
  const t0 = Date.now();
  const soloPeligro = !!opts.soloPeligro;

  // 1. Pre-calcular bounding box de cada zona (en el objeto mismo)
  for (const zone of zones) {
    if (!zone.bbox) zone.bbox = buildBBox(zone.coordinates);
  }

  // 2. Asignar cada zona a todas las celdas que su bbox toca.
  //    Solo los Polygon participan en el algoritmo point-in-polygon — Point y
  //    LineString quedan en loadedZones (para conteos / listado / mapa) pero
  //    no en la grilla, porque no son geometrías cerradas válidas para "contiene".
  const cells = new Map();
  let indexadas = 0;
  for (let i = 0; i < zones.length; i++) {
    if (zones[i].type && zones[i].type !== 'Polygon') continue;
    if (soloPeligro && !zones[i].dangerType) continue;
    if (!soloPeligro && zones[i].dangerType) continue; // peligro va en su propio índice
    const { minLon, minLat, maxLon, maxLat } = zones[i].bbox;
    const c0 = Math.floor(minLon / GRID_CELL);
    const c1 = Math.floor(maxLon / GRID_CELL);
    const r0 = Math.floor(minLat / GRID_CELL);
    const r1 = Math.floor(maxLat / GRID_CELL);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const key = `${r},${c}`;
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key).push(i);
      }
    }
    indexadas++;
  }

  console.log(
    `[Coverage] Índice ${soloPeligro ? 'de PELIGRO' : 'de cobertura'} listo:`,
    `${cells.size} celdas / ${indexadas} polígonos (${Date.now() - t0}ms)`
  );
  return cells;
}

// Reconstruye AMBOS índices a partir de las zonas en memoria
function rebuildIndexes(zones) {
  spatialIndex = buildSpatialIndex(zones);
  dangerIndex  = buildSpatialIndex(zones, { soloPeligro: true });
}

/**
 * Busca la primera zona que contiene el punto dado.
 * 1. Lookup O(1) en la grilla → lista corta de candidatos
 * 2. Filtro por bounding box (4 comparaciones)
 * 3. Ray-casting solo si pasa el bbox
 */
function findZoneForPoint(longitude, latitude, zones, cells) {
  if (!cells) return null;
  const row = Math.floor(latitude  / GRID_CELL);
  const col = Math.floor(longitude / GRID_CELL);
  const key = `${row},${col}`;

  const candidates = cells.get(key);
  if (!candidates || candidates.length === 0) return null;

  const point = [longitude, latitude];
  for (const idx of candidates) {
    const zone = zones[idx];
    const { minLon, minLat, maxLon, maxLat } = zone.bbox;
    if (longitude < minLon || longitude > maxLon ||
        latitude  < minLat || latitude  > maxLat) continue;
    if (pointInPolygon(point, zone.coordinates)) return zone;
  }
  return null;
}

/**
 * Devuelve TODAS las zonas de peligro que contienen el punto.
 * Se devuelven todas (no la primera) porque un punto puede caer en el solape de
 * una zona "Bloqueado" y una "Horario restringido"; el operador debe ver la más
 * grave, y para eso hay que tenerlas todas.
 */
function findDangerZonesForPoint(longitude, latitude, zones, cells) {
  if (!cells) return [];
  const row = Math.floor(latitude  / GRID_CELL);
  const col = Math.floor(longitude / GRID_CELL);
  const candidates = cells.get(`${row},${col}`);
  if (!candidates || candidates.length === 0) return [];

  const point = [longitude, latitude];
  const out = [];
  for (const idx of candidates) {
    const zone = zones[idx];
    const { minLon, minLat, maxLon, maxLat } = zone.bbox;
    if (longitude < minLon || longitude > maxLon ||
        latitude  < minLat || latitude  > maxLat) continue;
    if (pointInPolygon(point, zone.coordinates)) out.push(zone);
  }
  return out;
}

// Gravedad: BLOQUEADO manda sobre HORARIO_RESTRINGIDO, y este sobre RESTRINGIDA
const DANGER_SEVERITY = { [DANGER_BLOQUEADO]: 3, [DANGER_HORARIO]: 2, [DANGER_RESTRINGIDA]: 1 };

/**
 * Evalúa el peligro de un punto y devuelve un resumen listo para la UI.
 */
function evaluarPeligro(longitude, latitude) {
  const zonas = findDangerZonesForPoint(longitude, latitude, loadedZones, dangerIndex);
  if (zonas.length === 0) {
    return { esPeligrosa: false, tipo: null, etiqueta: null, zonas: [] };
  }
  // La más grave define el veredicto
  const peor = zonas.reduce((a, b) =>
    (DANGER_SEVERITY[b.dangerType] || 0) > (DANGER_SEVERITY[a.dangerType] || 0) ? b : a
  );
  return {
    esPeligrosa: true,
    tipo:        peor.dangerType,
    etiqueta:    DANGER_LABELS[peor.dangerType] || 'Zona restringida',
    zonas: zonas.map(z => ({
      nombre:   z.name,
      tipo:     z.dangerType,
      etiqueta: DANGER_LABELS[z.dangerType] || 'Zona restringida'
    }))
  };
}

// ════════════════════════════════════════════════════════════════════════════════
// Parser KML por REGEX GLOBAL — sin xml2js, sin DOM en memoria
// Captura TODOS los <coordinates> del archivo: Placemark, MultiGeometry, Folder…
// Archivo de 149MB con ~88K bloques de coordenadas procesa en ~2-3 segundos.
// ════════════════════════════════════════════════════════════════════════════════

/**
 * Determina el tipo de geometría de un bloque <coordinates> mirando la
 * etiqueta de apertura más cercana hacia atrás (Point / LineString / LinearRing).
 * <LinearRing> implica Polygon (outerBoundaryIs/innerBoundaryIs siempre la contienen).
 */
function classifyGeometry(beforeSnippet) {
  const pointIdx = beforeSnippet.lastIndexOf('<Point>');
  const lineIdx  = beforeSnippet.lastIndexOf('<LineString>');
  const ringIdx  = beforeSnippet.lastIndexOf('<LinearRing>');
  const max = Math.max(pointIdx, lineIdx, ringIdx);
  if (max === -1) return 'Polygon'; // fallback conservador (no debería pasar en KML válido)
  if (max === pointIdx) return 'Point';
  if (max === lineIdx) return 'LineString';
  return 'Polygon';
}

/**
 * Extrae TODOS los elementos (Point, LineString, Polygon) de un string KML
 * usando regex global, y además recolecta los <NetworkLink><href> para que
 * puedan resolverse después (apuntan a mapas externos: Google My Maps, etc.).
 * Escanea sin importar nesting (Placemark, MultiGeometry, Folder, Document, etc.)
 * para no perder ningún elemento. NO construye árbol DOM — consume ~10x menos
 * memoria que xml2js.
 */
function parseKMLFast(kmlString) {
  const zones    = [];
  const coordReg = /<coordinates>\s*([\s\S]*?)\s*<\/coordinates>/g;
  let cm;

  // Mapa de posición → nombre de la carpeta que la contiene. Se usa para
  // clasificar zonas de peligro cuyo nombre no sigue ninguna convención
  // conocida pero que viven en una carpeta "Zonas_Peligro_*".
  const folderMarks = [];
  const folderReg = /<(?:Folder|Document)>\s*(?:<[^>]+>\s*)*?<name>\s*([\s\S]*?)\s*<\/name>/g;
  let fm;
  while ((fm = folderReg.exec(kmlString)) !== null) {
    folderMarks.push({
      idx:  fm.index,
      name: fm[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim()
    });
  }
  // Devuelve el nombre de la última carpeta abierta antes de `pos`
  function folderAt(pos) {
    let lo = 0, hi = folderMarks.length - 1, res = '';
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (folderMarks[mid].idx <= pos) { res = folderMarks[mid].name; lo = mid + 1; }
      else hi = mid - 1;
    }
    return res;
  }

  while ((cm = coordReg.exec(kmlString)) !== null) {
    // Parsear pares lon,lat,alt separados por espacios/saltos
    const coords = cm[1].trim().split(/\s+/).filter(Boolean).map(pair => {
      const parts = pair.split(',');
      return [parseFloat(parts[0]), parseFloat(parts[1])];
    }).filter(c => !isNaN(c[0]) && !isNaN(c[1]));

    if (coords.length === 0) continue;

    const type = classifyGeometry(kmlString.substring(Math.max(0, cm.index - 300), cm.index));

    // Buscar el <name> más cercano ANTES de este bloque de coordenadas
    // Ventana de 2000 chars es suficiente para cubrir cualquier Placemark / Folder
    const before      = kmlString.substring(Math.max(0, cm.index - 2000), cm.index);
    const nameMatches = before.match(/<name>\s*([\s\S]*?)\s*<\/name>/g);
    let name = 'Sin nombre';
    if (nameMatches && nameMatches.length > 0) {
      name = nameMatches[nameMatches.length - 1]
        .replace(/<!\[CDATA\[|\]\]>/g, '')
        .replace(/<\/?name>/g, '')
        .trim();
    }

    // ¿Es zona de peligro? Se evalúa por nombre y, como respaldo, por la
    // carpeta contenedora ("Zonas_Peligro_Urbano", "Zonas-Peligros-Gye"…).
    const dangerType = classifyDanger(name, folderAt(cm.index));

    const zone = { name, coordinates: coords, type };
    if (dangerType) zone.dangerType = dangerType;
    zones.push(zone);
  }

  // NetworkLinks: enlaces a mapas externos (Google My Maps "mid=...", Telcodrive, etc.)
  // Su contenido NO está embebido en este KML — hay que descargarlo aparte.
  const networkLinks = [];
  const nlReg = /<NetworkLink>[\s\S]*?<href>\s*([\s\S]*?)\s*<\/href>/g;
  let nm;
  while ((nm = nlReg.exec(kmlString)) !== null) {
    const href = nm[1].replace(/&amp;/g, '&').trim();
    if (href) networkLinks.push(href);
  }

  const nPeligro = zones.filter(z => z.dangerType).length;
  console.log(
    '[KML] Elementos extraídos —',
    'Polygon:', zones.filter(z => z.type === 'Polygon').length,
    '| Point:', zones.filter(z => z.type === 'Point').length,
    '| LineString:', zones.filter(z => z.type === 'LineString').length,
    '| NetworkLinks:', networkLinks.length,
    nPeligro > 0 ? `| ⚠️ Zonas de peligro: ${nPeligro} ${JSON.stringify(countDanger(zones))}` : ''
  );
  return { zones, networkLinks };
}

/**
 * Lee un KMZ/KML desde disco, extrae el KML, parsea con regex.
 * Lee el archivo UNA sola vez.
 */
function handleCoverageFile(filePath, originalName = '') {
  const data = fs.readFileSync(filePath);
  let kmlString;

  if (originalName.toLowerCase().endsWith('.kmz') || filePath.endsWith('.kmz')) {
    const zip      = new AdmZip(data);
    const kmlEntry = zip.getEntries().find(e => e.entryName.endsWith('.kml'));
    if (!kmlEntry) throw new Error('No KML found in KMZ');
    console.log('[KMZ] Leyendo:', kmlEntry.entryName);
    kmlString = kmlEntry.getData().toString('utf8');
    // data y zip quedan elegibles para GC
  } else {
    kmlString = data.toString('utf8');
  }

  return parseKMLFast(kmlString); // { zones, networkLinks }
}

// ════════════════════════════════════════════════════════════════════════════════
// Resolución de NetworkLinks — descarga en background los mapas externos
// referenciados por <NetworkLink><href> (Google My Maps, Telcodrive, etc.)
// y fusiona sus zonas con las ya cargadas. Nunca bloquea la respuesta al cliente.
// ════════════════════════════════════════════════════════════════════════════════

// Ejecuta `worker` sobre `items` con un máximo de `limit` tareas en paralelo.
async function mapWithConcurrency(items, limit, worker) {
  let i = 0;
  async function run() {
    while (i < items.length) {
      const idx = i++;
      await worker(items[idx], idx);
    }
  }
  const runners = Array.from({ length: Math.min(limit, items.length) }, run);
  await Promise.all(runners);
}

/**
 * Normaliza URLs de Google My Maps.
 * Los KMZ exportados de Google Earth traen enlaces con ruta de cuenta
 * (/maps/d/u/1/kml, /u/2/, /u/3/...) que SOLO funcionan con la sesión de ese
 * usuario en el navegador — desde el servidor redirigen al login de Google y
 * la resolución falla. La forma pública equivalente es:
 *   https://www.google.com/maps/d/kml?mid=<ID>&forcekml=1
 * Además, el mismo mapa (mismo mid) aparece muchas veces con parámetros cv/cid
 * distintos; al normalizar quedan deduplicados y se descarga UNA sola vez.
 */
function normalizeNetworkLinkUrl(href) {
  try {
    const u = new URL(href.trim());
    const isGoogle = /(^|\.)google\.[a-z.]+$/i.test(u.hostname);
    if (isGoogle && /^\/maps\/d\/(u\/\d+\/)?kml$/i.test(u.pathname)) {
      const mid = u.searchParams.get('mid');
      if (mid) return `https://www.google.com/maps/d/kml?mid=${encodeURIComponent(mid)}&forcekml=1`;
    }
  } catch (e) { /* URL inválida — se devuelve tal cual */ }
  return href.trim();
}

const NL_TIMEOUT_MS = 90000; // mapas de cobertura grandes pueden pesar decenas de MB
const NL_RETRIES    = 3;     // reintentos con espera creciente (Google ratelimitea)

// Descarga un href de NetworkLink (con reintentos), detecta si la respuesta es
// KML o KMZ, la parsea, y resuelve recursivamente (hasta `depth` 2) sus propios
// NetworkLinks.
async function fetchAndParseLink(href, depth, visited) {
  const url = normalizeNetworkLinkUrl(href);
  if (visited.has(url)) return [];
  visited.add(url);

  let lastErr = null;
  let buf     = null;

  for (let attempt = 1; attempt <= NL_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal: AbortSignal.timeout(NL_TIMEOUT_MS),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
          'Accept': 'application/vnd.google-earth.kml+xml, application/vnd.google-earth.kmz, */*'
        }
      });

      // Redirección al login de Google → el mapa no es público; reintentar no ayuda
      if (res.url && /accounts\.google\.com|ServiceLogin/i.test(res.url)) {
        throw Object.assign(new Error('Mapa no público (Google pide login). Compártelo como "Cualquier persona con el enlace".'), { noRetry: true });
      }

      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { noRetry: res.status === 404 || res.status === 403 });

      buf = Buffer.from(await res.arrayBuffer());
      lastErr = null;
      break;
    } catch (e) {
      lastErr = e;
      if (e.noRetry || attempt === NL_RETRIES) break;
      // Espera creciente: 2s, 6s... (evita el ratelimit de Google)
      await new Promise(r => setTimeout(r, 2000 * attempt * attempt));
    }
  }
  if (lastErr) throw lastErr;

  let kmlString;
  // Firma ZIP (PK) → es un KMZ
  if (buf.length >= 2 && buf[0] === 0x50 && buf[1] === 0x4b) {
    const zip   = new AdmZip(buf);
    const entry = zip.getEntries().find(e => e.entryName.toLowerCase().endsWith('.kml'));
    if (!entry) throw new Error('KMZ sin .kml interno');
    kmlString = entry.getData().toString('utf8');
  } else {
    kmlString = buf.toString('utf8');
  }

  if (!/<kml[\s>]/i.test(kmlString)) {
    throw new Error('La respuesta no es un KML/KMZ válido (posible página de login o error de Google)');
  }

  const { zones, networkLinks } = parseKMLFast(kmlString);
  // Marca el origen para trazabilidad (de qué enlace externo vino cada zona)
  for (const z of zones) z.source = url;

  let all = zones;
  if (depth < 2 && networkLinks.length > 0) {
    for (const nestedHref of networkLinks) {
      try {
        const nested = await fetchAndParseLink(nestedHref, depth + 1, visited);
        all = all.concat(nested);
      } catch (e) {
        console.warn('[Coverage NetworkLink] Falló enlace anidado', nestedHref, '-', e.message);
      }
    }
  }
  return all;
}

/**
 * Agrega zonas nuevas a las ya cargadas y reconstruye los índices.
 * Devuelve SOLO las que realmente se agregaron (las repetidas se descartan),
 * para que el llamador persista únicamente esas en la base de datos.
 */
function mergeZonesIntoMemory(newZones) {
  if (!newZones || newZones.length === 0) return [];
  if (!loadedZones) { loadedZones = []; loadedKeys = new Set(); }

  const nuevas = soloNuevas(newZones);
  if (nuevas.length === 0) return [];

  loadedZones = loadedZones.concat(nuevas);
  rebuildIndexes(loadedZones);
  return nuevas;
}

// Actualiza el registro de un enlace en coverage_links (para poder reintentar)
async function upsertLinkStatus(href, status, zonesCount = 0, error = null) {
  try {
    await pool.query(
      `INSERT INTO public.coverage_links (href, status, zones_count, error, updated_at)
       VALUES ($1,$2,$3,$4,NOW())
       ON CONFLICT (href) DO UPDATE
         SET status = $2, zones_count = $3, error = $4, updated_at = NOW()`,
      [href, status, zonesCount, error]
    );
  } catch (e) { /* no crítico */ }
}

// Resuelve todos los NetworkLinks de un archivo en background, con concurrencia
// limitada, y va fusionando resultados en memoria y en DB a medida que llegan.
// `isRetry` = true cuando se reintentan solo los fallidos (no limpia el registro).
async function resolveNetworkLinksBackground(hrefs, isRetry = false) {
  // Normalizar ANTES de deduplicar: el mismo mapa (mid) aparece muchas veces
  // con parámetros distintos → sin normalizar se descargaba varias veces.
  const unique = Array.from(new Set(
    (hrefs || []).map(h => normalizeNetworkLinkUrl(h)).filter(Boolean)
  ));
  if (unique.length === 0) return;
  if (networkLinksState.loading) {
    console.warn('[Coverage] Resolución de NetworkLinks ya en curso — se omite');
    return;
  }

  networkLinksState = { total: unique.length, resolved: 0, failed: 0, loading: true, zonesAdded: 0 };
  console.log(`[Coverage] Resolviendo ${unique.length} NetworkLinks únicos en background...`);

  try {
    await ensureCoverageTable();
    if (!isRetry) {
      // Nuevo archivo: limpiar registro anterior y registrar los enlaces actuales
      await pool.query('DELETE FROM public.coverage_links');
      for (const href of unique) await upsertLinkStatus(href, 'pending');
    }
  } catch (e) { console.warn('[Coverage] No se pudo preparar coverage_links:', e.message); }

  const visited = new Set();
  let pendingMerge = [];
  // Escrituras a DB en vuelo. Se esperan TODAS antes de dar por terminado el
  // proceso: si no, `loading` pasa a false mientras aún faltan filas por
  // insertar y el usuario ve un total incompleto (o se pierde al reiniciar).
  const escriturasEnVuelo = [];

  // Concurrencia baja (3): Google ratelimitea si se le pega con 8 conexiones a la vez
  await mapWithConcurrency(unique, 3, async (href) => {
    try {
      const zones = await fetchAndParseLink(href, 0, visited);
      pendingMerge = pendingMerge.concat(zones);
      networkLinksState.resolved++;
      networkLinksState.zonesAdded += zones.length;
      upsertLinkStatus(href, 'resolved', zones.length);
    } catch (e) {
      networkLinksState.failed++;
      upsertLinkStatus(href, 'failed', 0, e.message);
      console.warn('[Coverage NetworkLink] Error en', href, '-', e.message);
    } finally {
      const done = networkLinksState.resolved + networkLinksState.failed;
      if (pendingMerge.length && (done % 10 === 0 || done === unique.length)) {
        const lote = pendingMerge;
        pendingMerge = [];
        // Solo se persiste lo que realmente se agregó (sin duplicados)
        const agregadas = mergeZonesIntoMemory(lote);
        // Persistir INCREMENTALMENTE (append) — si el server se reinicia a mitad,
        // lo ya resuelto no se pierde y queda disponible tras el restart.
        if (agregadas.length) {
          escriturasEnVuelo.push(
            appendZonesToDB(agregadas, loadedFile)
              .catch(err => console.error('[Coverage] Append a DB falló:', err.message))
          );
        }
      }
    }
  });

  if (pendingMerge.length) {
    const agregadas = mergeZonesIntoMemory(pendingMerge);
    if (agregadas.length) {
      escriturasEnVuelo.push(
        appendZonesToDB(agregadas, loadedFile)
          .catch(err => console.error('[Coverage] Append final a DB falló:', err.message))
      );
    }
  }

  // Esperar a que TODAS las inserciones terminen antes de marcar como completo
  await Promise.all(escriturasEnVuelo);
  networkLinksState.loading = false;

  console.log(
    `[Coverage] NetworkLinks resueltos: ${networkLinksState.resolved}/${networkLinksState.total}`,
    `(fallidos: ${networkLinksState.failed}) — zonas totales ahora: ${loadedZones ? loadedZones.length : 0}`
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// Controllers
// ════════════════════════════════════════════════════════════════════════════════

exports.loadCoverage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ status: 'error', message: 'No file uploaded' });
    }

    // Parsea el KMZ con regex — sin xml2js, sin OOM
    const { zones, networkLinks } = handleCoverageFile(req.file.path, req.file.originalname);

    // Un KML puede ser solo un índice de enlaces (sin coordenadas propias).
    // Es válido: la cobertura llega al resolver los NetworkLinks.
    if ((!zones || zones.length === 0) && (!networkLinks || networkLinks.length === 0)) {
      return res.status(422).json({
        status: 'error',
        message: 'El archivo fue procesado pero no se encontraron elementos con coordenadas ni enlaces externos.'
      });
    }

    // MODO: 'sumar' (por defecto) agrega al acervo; 'reemplazar' borra lo previo.
    const reemplazar = req.body && req.body.modo === 'reemplazar';

    if (reemplazar) {
      setLoadedZones([]);
    } else {
      await ensureZonesLoaded();
      if (!loadedZones) setLoadedZones([]);
    }

    const previas  = loadedZones.length;
    const nuevas   = mergeZonesIntoMemory(zones);
    loadedAt   = new Date().toISOString();
    loadedFile = req.file.originalname;

    res.status(200).json({
      status: 'ok',
      modo: reemplazar ? 'reemplazar' : 'sumar',
      fileName: req.file.originalname,
      zonesLoaded: loadedZones.length,
      zonasNuevas: nuevas.length,
      zonasOmitidas: zones.length - nuevas.length,
      byType: countByType(loadedZones),
      byDanger: countDanger(loadedZones),
      networkLinksFound: networkLinks.length,
      message: networkLinks.length > 0
        ? `${nuevas.length} elementos nuevos (total ${loadedZones.length}). Resolviendo ${networkLinks.length} enlaces externos en segundo plano...`
        : `${nuevas.length} elementos nuevos agregados — total ${loadedZones.length}`,
      loadedAt
    });

    // Persistir. En modo reemplazar se reescribe todo; en modo sumar solo se
    // agregan las nuevas (append), sin tocar lo ya guardado.
    const persistir = reemplazar
      ? saveZonesToDB(loadedZones, req.file.originalname)
      : appendZonesToDB(nuevas, req.file.originalname);

    persistir
      .catch(e => console.error('[Coverage] Guardado background fallido:', e.message))
      .then(() => {
        if (networkLinks.length > 0) {
          return resolveNetworkLinksBackground(networkLinks);
        }
      })
      .catch(e => console.error('[Coverage] Error resolviendo NetworkLinks:', e.message));

    console.log(`[Coverage] /load ${reemplazar ? 'REEMPLAZAR' : 'SUMAR'} — previas ${previas}, nuevas ${nuevas.length}, total ${loadedZones.length}`);

  } catch (error) {
    console.error('[Coverage Error]', error);
    if (!res.headersSent) {
      res.status(500).json({ status: 'error', message: (process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : error.message) });
    }
  }
};

exports.checkCoverage = async (req, res) => {
  try {
    const { lat, lon } = req.query;

    if (!lat || !lon) {
      return res.status(400).json({ status: 'error', message: 'Missing lat or lon' });
    }

    const latitude  = parseFloat(lat);
    const longitude = parseFloat(lon);

    if (isNaN(latitude) || isNaN(longitude)) {
      return res.status(400).json({ status: 'error', message: 'Invalid coordinates' });
    }

    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return res.status(400).json({ status: 'error', message: 'Coordinates out of range' });
    }

    // Lazy-load: si el servidor se reinició (Render inactividad), restaurar desde DB
    if (!loadedZones || loadedZones.length === 0) {
      const ok = await ensureZonesLoaded();
      if (!ok) {
        return res.status(503).json({ status: 'error', message: 'Zonas de cobertura no disponibles. Por favor recarga el archivo KMZ.' });
      }
    }

    // ── DOS PREGUNTAS INDEPENDIENTES ─────────────────────────────────────────
    // 1) ¿Hay cobertura?   2) ¿Es zona de peligro?
    // Se evalúan por separado contra índices distintos: un punto puede tener
    // cobertura Y estar en zona bloqueada al mismo tiempo.
    const zone    = findZoneForPoint(longitude, latitude, loadedZones, spatialIndex);
    const peligro = evaluarPeligro(longitude, latitude);

    return res.status(200).json({
      latitude, longitude,
      // Pregunta 1 — cobertura
      hasCoverage: !!zone,
      zoneName:    zone ? zone.name : 'Sin cobertura',
      // Pregunta 2 — peligro (siempre presente, independiente de la cobertura)
      esZonaPeligrosa: peligro.esPeligrosa,
      peligroTipo:     peligro.tipo,      // BLOQUEADO | HORARIO_RESTRINGIDO | RESTRINGIDA | null
      peligroEtiqueta: peligro.etiqueta,  // texto para mostrar
      peligroZonas:    peligro.zonas,     // todas las zonas de peligro que contienen el punto
      timestamp:   new Date().toISOString()
    });

  } catch (error) {
    console.error('[Coverage Error]', error);
    return res.status(500).json({ status: 'error', message: (process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : error.message) });
  }
};

// ── POST /api/coverage/load-batch ────────────────────────────────────────────
// Recibe zonas ya parseadas en el navegador, lote por lote.
// El servidor nunca toca el archivo KMZ — cero riesgo de OOM.
exports.loadBatch = async (req, res) => {
  try {
    const { zones, fileName, isFirst, isFinal, total, networkLinks, modo } = req.body;

    // Un KML puede ser SOLO un índice de enlaces (ej: "COBERTURA SMB_LINK.kml",
    // que apunta al KMZ real en TelcoDrive). En ese caso zones viene vacío y
    // toda la cobertura llega al resolver los NetworkLinks — es válido.
    const soloEnlaces = Array.isArray(networkLinks) && networkLinks.length > 0;

    if (!Array.isArray(zones) || (zones.length === 0 && !soloEnlaces))
      return res.status(400).json({ status: 'error', message: 'zones vacías' });
    if (!fileName)
      return res.status(400).json({ status: 'error', message: 'fileName requerido' });

    // MODOS DE CARGA:
    //   'sumar'      (por defecto) agrega al acervo sin borrar nada
    //   'actualizar' reemplaza SOLO lo que aportó este mismo archivo antes,
    //                conservando lo de los demás orígenes
    //   'reemplazar' limpia todo y deja solo este archivo
    const reemplazar = modo === 'reemplazar';
    const actualizar = modo === 'actualizar';

    await ensureCoverageTable();

    if (isFirst) {
      if (reemplazar) {
        await pool.query('DELETE FROM public.coverage_zones');
        setLoadedZones([]);
        console.log('[Coverage] MODO REEMPLAZAR — zonas anteriores borradas. Archivo:', fileName);
      } else {
        // Sumar y actualizar necesitan el acervo en memoria para deduplicar
        await ensureZonesLoaded();
        if (!loadedZones) setLoadedZones([]);

        if (actualizar) {
          // Retirar la versión anterior de ESTE archivo (en DB y en memoria).
          // Así una actualización de cobertura no deja conviviendo el polígono
          // viejo con el nuevo.
          const del = await pool.query('DELETE FROM public.coverage_zones WHERE file_name = $1', [fileName]);
          const quitadas = quitarZonasDeArchivo(fileName);
          console.log(`[Coverage] MODO ACTUALIZAR — retiradas ${del.rowCount || quitadas} zonas previas de "${fileName}". Acervo restante: ${loadedZones.length}`);
        } else {
          console.log('[Coverage] MODO SUMAR — acervo actual:', loadedZones.length, 'zonas. Agregando:', fileName);
        }
      }
    }

    // Marcar el origen y CLASIFICAR EL PELIGRO en el servidor.
    // Es crítico hacerlo aquí y no confiar en el navegador: la clasificación de
    // zonas de riesgo es información de seguridad y debe tener una sola fuente
    // de verdad. Antes, las zonas subidas desde el navegador llegaban sin
    // clasificar y quedaban invisibles para la alerta.
    for (const z of zones) {
      z.fileName = fileName;
      if (!z.dangerType) {
        const d = classifyDanger(z.name, z.folder || '');
        if (d) z.dangerType = d;
      }
    }

    // Descartar las que ya existen (mismo nombre + misma geometría) y quedarse
    // solo con las nuevas. Evita duplicar al recargar un archivo ya cargado.
    const validas = zones.filter(z => Array.isArray(z.coordinates) && z.coordinates.length >= 1);
    const nuevas  = mergeZonesIntoMemory(validas);
    const omitidas = validas.length - nuevas.length;

    // Insertar en DB SOLO las nuevas
    if (nuevas.length > 0) {
      const values = [];
      const params = [];
      let   p      = 1;
      for (const z of nuevas) {
        const bbox = buildBBox(z.coordinates);
        values.push(`($${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++})`);
        params.push(
          fileName, z.name || 'Sin nombre', z.type || 'Polygon', z.source || null,
          z.dangerType || null,
          JSON.stringify(z.coordinates),
          bbox.minLon, bbox.minLat, bbox.maxLon, bbox.maxLat
        );
      }
      await pool.query(
        `INSERT INTO public.coverage_zones
           (file_name, name, type, source, danger_type, coordinates, bbox_minlon, bbox_minlat, bbox_maxlon, bbox_maxlat)
         VALUES ${values.join(',')}`,
        params
      );
    }

    console.log(
      `[Coverage] Lote: recibidas ${zones.length} | nuevas ${nuevas.length}` +
      (omitidas > 0 ? ` | repetidas omitidas ${omitidas}` : '') +
      ` | total acumulado ${loadedZones.length} | archivo: ${fileName}`
    );

    // En el último lote, fijar metadatos y disparar los enlaces externos
    if (isFinal) {
      loadedFile = fileName;
      loadedAt   = new Date().toISOString();
      console.log('[Coverage] Carga finalizada — elementos totales en memoria:', loadedZones.length);

      // Si el navegador detectó NetworkLinks (mapas externos), resolverlos en
      // background ahora que ya se guardó la base del archivo subido.
      if (Array.isArray(networkLinks) && networkLinks.length > 0) {
        resolveNetworkLinksBackground(networkLinks)
          .catch(e => console.error('[Coverage] Error resolviendo NetworkLinks:', e.message));
      }

      const nEnlaces = Array.isArray(networkLinks) ? networkLinks.length : 0;
      return res.status(200).json({
        status: 'ok',
        modo: reemplazar ? 'reemplazar' : (actualizar ? 'actualizar' : 'sumar'),
        zonesLoaded: loadedZones ? loadedZones.length : 0,
        byType: countByType(loadedZones),
        byDanger: countDanger(loadedZones),
        networkLinksFound: nEnlaces,
        message: (total || 0) > 0
          ? (reemplazar
              ? `${loadedZones.length} elementos cargados (reemplazo completo)`
              : `Acervo actualizado: ${loadedZones.length} elementos en total`)
          : `Archivo de enlaces cargado. Descargando cobertura desde ${nEnlaces} origen(es) externo(s)...`
      });
    }

    return res.status(200).json({
      status: 'ok',
      nuevas: nuevas.length,
      omitidas,
      acumulado: loadedZones.length,
      message: `Lote: ${nuevas.length} nuevas de ${zones.length}`
    });

  } catch (error) {
    console.error('[Coverage] Error en loadBatch:', error);
    return res.status(500).json({ status: 'error', message: (process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : error.message) });
  }
};

exports.checkBatch = async (req, res) => {
  try {
    const { points } = req.body;

    if (!Array.isArray(points) || points.length === 0) {
      return res.status(400).json({ status: 'error', message: 'Invalid points array' });
    }

    // Lazy-load: restaurar desde DB si el servidor se reinició
    if (!loadedZones || loadedZones.length === 0) {
      const ok = await ensureZonesLoaded();
      if (!ok) {
        return res.status(503).json({ status: 'error', message: 'Zonas de cobertura no disponibles. Por favor recarga el archivo KMZ.' });
      }
    }

    const results = points.map(p => {
      const latitude  = parseFloat(p.latitude);
      const longitude = parseFloat(p.longitude);

      // Dos preguntas independientes por cada punto
      const zone    = findZoneForPoint(longitude, latitude, loadedZones, spatialIndex);
      const peligro = evaluarPeligro(longitude, latitude);

      return {
        latitude, longitude,
        hasCoverage: !!zone,
        zoneName:    zone ? zone.name : 'Sin cobertura',
        esZonaPeligrosa: peligro.esPeligrosa,
        peligroTipo:     peligro.tipo,
        peligroEtiqueta: peligro.etiqueta,
        peligroZonas:    peligro.zonas
      };
    });

    const withCoverage = results.filter(r => r.hasCoverage).length;
    const enPeligro    = results.filter(r => r.esZonaPeligrosa).length;

    return res.status(200).json({
      totalPoints: results.length,
      pointsWithCoverage: withCoverage,
      pointsWithoutCoverage: results.length - withCoverage,
      // Resumen de peligro del lote
      pointsEnZonaPeligrosa: enPeligro,
      pointsBloqueados:      results.filter(r => r.peligroTipo === DANGER_BLOQUEADO).length,
      pointsHorarioRestringido: results.filter(r => r.peligroTipo === DANGER_HORARIO).length,
      results,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[Coverage Error]', error);
    return res.status(500).json({ status: 'error', message: (process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : error.message) });
  }
};

exports.getZones = (req, res) => {
  try {
    if (!loadedZones || loadedZones.length === 0) {
      return res.status(200).json({
        zonesLoaded: false, totalZones: 0, zones: [], loadedAt: null, fileName: null
      });
    }

    return res.status(200).json({
      zonesLoaded: true,
      totalZones: loadedZones.length,
      byType: countByType(loadedZones),
      byDanger: countDanger(loadedZones),
      networkLinks: networkLinksState,
      zones: loadedZones.slice(0, 100),
      loadedAt,
      fileName: loadedFile || null
    });

  } catch (error) {
    console.error('[Coverage Error]', error);
    return res.status(500).json({ status: 'error', message: (process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : error.message) });
  }
};

// ── GET /api/coverage/links ──────────────────────────────────────────────────
// Detalle de los mapas externos: cuáles resolvieron, cuáles no y POR QUÉ.
// Sin esto, un "37 fallidos" no dice si el problema es permisos, red o el mapa.
exports.getLinksDetail = async (req, res) => {
  try {
    await ensureCoverageTable();
    const { rows } = await pool.query(
      `SELECT href, status, zones_count, error, updated_at
       FROM public.coverage_links ORDER BY status, href`
    );

    // Agrupar los fallos por causa, en lenguaje entendible
    const motivos = {};
    for (const r of rows.filter(r => r.status === 'failed')) {
      const e = (r.error || '').toLowerCase();
      let causa;
      if (e.includes('no público') || e.includes('login'))        causa = 'Mapa no compartido públicamente (Google exige iniciar sesión)';
      else if (e.includes('404'))                                  causa = 'El mapa ya no existe (fue eliminado o cambió de dirección)';
      else if (e.includes('403'))                                  causa = 'Acceso denegado por Google';
      else if (e.includes('timeout') || e.includes('abort'))       causa = 'Tiempo de espera agotado (mapa muy grande o red lenta)';
      else if (e.includes('429'))                                  causa = 'Google limitó las descargas por exceso de peticiones';
      else if (e.includes('no es un kml'))                         causa = 'La respuesta no era un archivo de mapa válido';
      else                                                          causa = r.error || 'Error desconocido';
      if (!motivos[causa]) motivos[causa] = { causa, cantidad: 0, ejemplos: [] };
      motivos[causa].cantidad++;
      if (motivos[causa].ejemplos.length < 3) motivos[causa].ejemplos.push(r.href);
    }

    return res.status(200).json({
      total:     rows.length,
      resueltos: rows.filter(r => r.status === 'resolved').length,
      fallidos:  rows.filter(r => r.status === 'failed').length,
      pendientes: rows.filter(r => r.status === 'pending').length,
      zonasAportadas: rows.reduce((a, r) => a + (r.zones_count || 0), 0),
      motivosDeFallo: Object.values(motivos).sort((a, b) => b.cantidad - a.cantidad),
      enlaces: rows.map(r => ({
        href: r.href, status: r.status, zonas: r.zones_count || 0, error: r.error || null
      }))
    });
  } catch (error) {
    console.error('[Coverage getLinksDetail Error]', error);
    return res.status(500).json({ status: 'error', message: (process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : error.message) });
  }
};

// ── GET /api/coverage/files ──────────────────────────────────────────────────
// Inventario de los archivos que componen el acervo actual. Permite ver de
// dónde salió cada zona y decidir qué actualizar o quitar.
exports.getSourceFiles = async (req, res) => {
  try {
    if (!loadedZones || loadedZones.length === 0) await ensureZonesLoaded();

    let fechas = {};
    try {
      const { rows } = await pool.query(
        `SELECT file_name, MIN(loaded_at) AS primera, MAX(loaded_at) AS ultima
         FROM public.coverage_zones GROUP BY file_name`
      );
      for (const r of rows) fechas[r.file_name] = { primera: r.primera, ultima: r.ultima };
    } catch (e) { /* la vista en memoria basta si la consulta falla */ }

    const archivos = resumenArchivos().map(a => ({ ...a, ...(fechas[a.fileName] || {}) }));

    return res.status(200).json({
      totalArchivos: archivos.length,
      totalZonas:    loadedZones ? loadedZones.length : 0,
      archivos
    });
  } catch (error) {
    console.error('[Coverage getSourceFiles Error]', error);
    return res.status(500).json({ status: 'error', message: (process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : error.message) });
  }
};

// ── DELETE /api/coverage/files ───────────────────────────────────────────────
// Quita del acervo todo lo aportado por un archivo, sin tocar los demás.
// Body: { fileName }
exports.deleteSourceFile = async (req, res) => {
  try {
    const { fileName } = req.body || {};
    if (!fileName) {
      return res.status(400).json({ status: 'error', message: 'fileName requerido' });
    }

    await ensureCoverageTable();
    await ensureZonesLoaded();

    const del = await pool.query('DELETE FROM public.coverage_zones WHERE file_name = $1', [fileName]);
    const quitadas = quitarZonasDeArchivo(fileName);

    if ((del.rowCount || 0) === 0 && quitadas === 0) {
      return res.status(404).json({ status: 'error', message: `No hay zonas cargadas del archivo "${fileName}"` });
    }

    console.log(`[Coverage] Origen eliminado: "${fileName}" — ${del.rowCount || quitadas} zonas. Acervo restante: ${loadedZones.length}`);

    return res.status(200).json({
      status: 'ok',
      eliminadas: del.rowCount || quitadas,
      zonesLoaded: loadedZones.length,
      byDanger: countDanger(loadedZones),
      message: `Se quitaron ${del.rowCount || quitadas} zonas de "${fileName}". Quedan ${loadedZones.length} en total.`
    });
  } catch (error) {
    console.error('[Coverage deleteSourceFile Error]', error);
    return res.status(500).json({ status: 'error', message: (process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : error.message) });
  }
};

// ── GET /api/coverage/zones-in-view ──────────────────────────────────────────
// Devuelve SOLO las zonas que se ven en el área del mapa (viewport).
// Nunca se mandan las miles de zonas de golpe: el navegador de operación no lo
// soportaría. Con este endpoint el mapa pesa lo mismo sin importar cuántas
// zonas haya cargadas en total.
//
// Query: minLon, minLat, maxLon, maxLat  (obligatorios)
//        limit  (opcional, tope 3000)
//        soloPeligro=1 (opcional, para pintar solo la capa de riesgo)
exports.getZonesInView = async (req, res) => {
  try {
    const minLon = parseFloat(req.query.minLon);
    const minLat = parseFloat(req.query.minLat);
    const maxLon = parseFloat(req.query.maxLon);
    const maxLat = parseFloat(req.query.maxLat);

    if ([minLon, minLat, maxLon, maxLat].some(v => isNaN(v))) {
      return res.status(400).json({ status: 'error', message: 'Área inválida: se requieren minLon, minLat, maxLon, maxLat' });
    }

    if (!loadedZones || loadedZones.length === 0) {
      const ok = await ensureZonesLoaded();
      if (!ok) return res.status(200).json({ total: 0, truncado: false, zones: [] });
    }

    const limit = Math.min(parseInt(req.query.limit || '1500', 10) || 1500, 3000);
    const soloPeligro = req.query.soloPeligro === '1';

    // Simplificación por nivel de acercamiento: cuando el área visible es
    // grande, el detalle fino de cada polígono no se aprecia en pantalla pero
    // sí pesa en la descarga. Se reduce el número de vértices para que el mapa
    // siga siendo liviano en los equipos de operación.
    const areaGrados = Math.abs(maxLon - minLon) * Math.abs(maxLat - minLat);
    const paso =
      areaGrados > 20  ? 8 :   // vista país
      areaGrados > 4   ? 4 :   // vista provincia
      areaGrados > 0.5 ? 2 :   // vista ciudad
      1;                       // barrio: sin simplificar

    // Conserva primer y último vértice (para no abrir el polígono) y toma
    // uno de cada `paso` en el medio. Nunca baja de 4 vértices.
    function simplificar(coords) {
      if (paso === 1 || coords.length <= 12) return coords;
      const out = [];
      for (let i = 0; i < coords.length - 1; i += paso) out.push(coords[i]);
      out.push(coords[coords.length - 1]);
      return out.length >= 4 ? out : coords;
    }

    const out = [];
    let encontradas = 0;

    for (const z of loadedZones) {
      if (soloPeligro && !z.dangerType) continue;
      const b = z.bbox || buildBBox(z.coordinates);
      // Descartar si los bounding boxes no se solapan
      if (b.maxLon < minLon || b.minLon > maxLon || b.maxLat < minLat || b.minLat > maxLat) continue;

      encontradas++;
      if (out.length >= limit) continue;

      out.push({
        name:       z.name,
        type:       z.type || 'Polygon',
        dangerType: z.dangerType || null,
        // [lon,lat] tal como se guarda; el frontend invierte para Leaflet.
        // Las zonas de peligro NO se simplifican: su forma exacta importa
        // porque de ella depende la alerta de seguridad.
        coordinates: z.dangerType ? z.coordinates : simplificar(z.coordinates)
      });
    }

    return res.status(200).json({
      total:     encontradas,
      devueltas: out.length,
      truncado:  encontradas > out.length,
      limit,
      simplificado: paso,
      zones:     out
    });
  } catch (error) {
    console.error('[Coverage getZonesInView Error]', error);
    return res.status(500).json({ status: 'error', message: (process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : error.message) });
  }
};

// ── GET /api/coverage/danger-zones ───────────────────────────────────────────
// Lista las zonas de peligro cargadas (sin coordenadas, para que sea liviano).
// Sirve para auditar qué está detectando el sistema.
exports.getDangerZones = async (req, res) => {
  try {
    if (!loadedZones || loadedZones.length === 0) await ensureZonesLoaded();
    const zonas = (loadedZones || []).filter(z => z.dangerType);

    return res.status(200).json({
      total: zonas.length,
      porTipo: countDanger(loadedZones),
      etiquetas: DANGER_LABELS,
      zonas: zonas.map(z => ({
        nombre:   z.name,
        tipo:     z.dangerType,
        etiqueta: DANGER_LABELS[z.dangerType] || 'Zona restringida',
        bbox:     z.bbox || buildBBox(z.coordinates)
      }))
    });
  } catch (error) {
    console.error('[Coverage getDangerZones Error]', error);
    return res.status(500).json({ status: 'error', message: (process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : error.message) });
  }
};

// ── POST /api/coverage/retry-links ───────────────────────────────────────────
// Reintenta la descarga de los NetworkLinks fallidos/pendientes registrados en
// DB, sin necesidad de volver a subir el KMZ. Solo administradores.
exports.retryNetworkLinks = async (req, res) => {
  try {
    if (networkLinksState.loading) {
      return res.status(409).json({ status: 'error', message: 'Ya hay una resolución de enlaces en curso. Espera a que termine.' });
    }

    await ensureCoverageTable();
    const { rows } = await pool.query(
      `SELECT href FROM public.coverage_links WHERE status IN ('failed','pending') ORDER BY href`
    );

    if (!rows.length) {
      return res.status(200).json({ status: 'ok', retrying: 0, message: 'No hay enlaces fallidos ni pendientes por reintentar.' });
    }

    // Asegurar que las zonas base estén en memoria antes de fusionar las nuevas
    await ensureZonesLoaded();

    const hrefs = rows.map(r => r.href);
    resolveNetworkLinksBackground(hrefs, true)
      .catch(e => console.error('[Coverage] Error en reintento de NetworkLinks:', e.message));

    return res.status(200).json({
      status: 'ok',
      retrying: hrefs.length,
      message: `Reintentando ${hrefs.length} enlaces externos en segundo plano...`
    });
  } catch (error) {
    console.error('[Coverage retryNetworkLinks Error]', error);
    return res.status(500).json({ status: 'error', message: (process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : error.message) });
  }
};

exports.getCoverageStatus = (req, res) => {
  return res.status(200).json({
    status: 'ok',
    message: 'Coverage service active',
    zonesLoaded: loadedZones ? loadedZones.length : 0,
    byType: loadedZones ? countByType(loadedZones) : {},
    byDanger: loadedZones ? countDanger(loadedZones) : {},
    dangerTotal: loadedZones ? loadedZones.filter(z => z.dangerType).length : 0,
    dangerLabels: DANGER_LABELS,
    networkLinks: networkLinksState,
    loadedAt: loadedAt || null,
    fileName: loadedFile || null,
    timestamp: new Date().toISOString()
  });
};

// ════════════════════════════════════════════════════════════════════════════════
// Resolver + parsear enlaces de ubicacion (WhatsApp, Google Maps, etc.)
// ════════════════════════════════════════════════════════════════════════════════

exports.resolveLink = async (req, res) => {
  try {
    const { link } = req.body;

    if (!link || typeof link !== 'string') {
      return res.status(400).json({ status: 'error', message: 'Campo "link" requerido' });
    }

    const trimmed = link.trim();

    const direct = parseCoordinatesFromUrl(trimmed);
    if (direct) {
      return res.status(200).json({
        status: 'ok', lat: direct.lat, lon: direct.lon, source: 'direct',
        message: `Coordenadas extraidas: ${direct.lat}, ${direct.lon}`
      });
    }

    if (isShortenedUrl(trimmed) || trimmed.startsWith('http')) {
      try {
        const response = await fetch(trimmed, {
          method: 'GET',
          redirect: 'follow',
          signal: AbortSignal.timeout(8000),
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CoverageBot/1.0)' }
        });

        const finalUrl = response.url;

        if (finalUrl && finalUrl !== trimmed) {
          const fromRedirect = parseCoordinatesFromUrl(finalUrl);
          if (fromRedirect) {
            return res.status(200).json({
              status: 'ok', lat: fromRedirect.lat, lon: fromRedirect.lon,
              source: 'redirect', resolvedUrl: finalUrl,
              message: `Coordenadas extraidas tras redireccion: ${fromRedirect.lat}, ${fromRedirect.lon}`
            });
          }
        }

        const html = await response.text().catch(() => '');
        const htmlMatch = html.match(/(-?\d{1,2}\.\d{6,}),(-?\d{1,3}\.\d{6,})/);
        if (htmlMatch) {
          const lat = parseFloat(htmlMatch[1]);
          const lon = parseFloat(htmlMatch[2]);
          if (isValidCoords(lat, lon)) {
            return res.status(200).json({
              status: 'ok', lat, lon, source: 'html',
              message: `Coordenadas extraidas del contenido: ${lat}, ${lon}`
            });
          }
        }

      } catch (fetchErr) {
        console.warn('[Coverage] Error resolviendo redirect:', fetchErr.message);
      }
    }

    return res.status(422).json({
      status: 'error',
      message: 'No se pudo extraer coordenadas del enlace. ' +
               'Usa un enlace directo de Google Maps (maps.google.com/?q=LAT,LNG) ' +
               'o escribe las coordenadas directamente (ej: -2.4189, -79.3459).'
    });

  } catch (error) {
    console.error('[Coverage resolveLink Error]', error);
    return res.status(500).json({ status: 'error', message: (process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : error.message) });
  }
};
