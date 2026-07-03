/**
 * Coverage Controller
 * Maneja validación de cobertura de internet
 * Pure JavaScript - Sin dependencias Python
 * (rev: resolución robusta de NetworkLinks + reintentos)
 */

const fs     = require('fs');
const path   = require('path');
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
let spatialIndex = null;
let dbRestoring  = false; // semáforo para evitar restauraciones paralelas

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
      values.push(`($${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++})`);
      params.push(
        fileName, z.name, z.type || 'Polygon', z.source || null,
        JSON.stringify(z.coordinates),
        bbox.minLon, bbox.minLat, bbox.maxLon, bbox.maxLat
      );
    }
    await pool.query(
      `INSERT INTO public.coverage_zones
         (file_name, name, type, source, coordinates, bbox_minlon, bbox_minlat, bbox_maxlon, bbox_maxlat)
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
        values.push(`($${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++})`);
        params.push(
          fileName,
          z.name,
          z.type || 'Polygon',
          z.source || null,
          JSON.stringify(z.coordinates),
          bbox.minLon, bbox.minLat, bbox.maxLon, bbox.maxLat
        );
      }

      await pool.query(
        `INSERT INTO public.coverage_zones
           (file_name, name, type, source, coordinates, bbox_minlon, bbox_minlat, bbox_maxlon, bbox_maxlat)
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
      `SELECT name, type, source, coordinates, bbox_minlon, bbox_minlat, bbox_maxlon, bbox_maxlat, file_name, loaded_at
       FROM public.coverage_zones ORDER BY id`
    );
    if (!rows.length) return null;

    const zones = rows.map(r => ({
      name:        r.name,
      coordinates: r.coordinates,
      type:        r.type || 'Polygon',
      source:      r.source || null,
      bbox: {
        minLon: r.bbox_minlon, minLat: r.bbox_minlat,
        maxLon: r.bbox_maxlon, maxLat: r.bbox_maxlat
      }
    }));

    console.log('[Coverage] Restaurado desde DB — zonas:', zones.length);
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
      loadedZones  = cached.zones;
      loadedAt     = cached.savedAt;
      loadedFile   = cached.fileName;
      spatialIndex = buildSpatialIndex(loadedZones);
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
        loadedZones  = cached.zones;
        loadedAt     = cached.savedAt;
        loadedFile   = cached.fileName;
        spatialIndex = buildSpatialIndex(loadedZones);
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

function buildSpatialIndex(zones) {
  const t0 = Date.now();

  // 1. Pre-calcular bounding box de cada zona (en el objeto mismo)
  for (const zone of zones) {
    if (!zone.bbox) zone.bbox = buildBBox(zone.coordinates);
  }

  // 2. Asignar cada zona a todas las celdas que su bbox toca.
  //    Solo los Polygon participan en el algoritmo point-in-polygon — Point y
  //    LineString quedan en loadedZones (para conteos / listado / mapa) pero
  //    no en la grilla, porque no son geometrías cerradas válidas para "contiene".
  const cells = new Map();
  for (let i = 0; i < zones.length; i++) {
    if (zones[i].type && zones[i].type !== 'Polygon') continue;
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
  }

  console.log(`[Coverage] Índice espacial listo: ${cells.size} celdas / ${zones.length} zonas (${Date.now() - t0}ms)`);
  return cells;
}

/**
 * Busca la primera zona que contiene el punto dado.
 * 1. Lookup O(1) en la grilla → lista corta de candidatos
 * 2. Filtro por bounding box (4 comparaciones)
 * 3. Ray-casting solo si pasa el bbox
 */
function findZoneForPoint(longitude, latitude, zones, cells) {
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

    zones.push({ name, coordinates: coords, type });
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

  console.log(
    '[KML] Elementos extraídos —',
    'Polygon:', zones.filter(z => z.type === 'Polygon').length,
    '| Point:', zones.filter(z => z.type === 'Point').length,
    '| LineString:', zones.filter(z => z.type === 'LineString').length,
    '| NetworkLinks:', networkLinks.length
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

// Agrega nuevas zonas a las ya cargadas en memoria y reconstruye el índice espacial.
function mergeZonesIntoMemory(newZones) {
  if (!newZones || newZones.length === 0) return;
  loadedZones  = (loadedZones || []).concat(newZones);
  spatialIndex = buildSpatialIndex(loadedZones);
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
        mergeZonesIntoMemory(lote);
        // Persistir INCREMENTALMENTE (append) — si el server se reinicia a mitad,
        // lo ya resuelto no se pierde y queda disponible tras el restart.
        appendZonesToDB(lote, loadedFile)
          .catch(err => console.error('[Coverage] Append a DB falló:', err.message));
      }
    }
  });

  if (pendingMerge.length) {
    mergeZonesIntoMemory(pendingMerge);
    await appendZonesToDB(pendingMerge, loadedFile)
      .catch(err => console.error('[Coverage] Append final a DB falló:', err.message));
  }
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

    if (!zones || zones.length === 0) {
      return res.status(422).json({
        status: 'error',
        message: 'El archivo fue procesado pero no se encontraron elementos con coordenadas.'
      });
    }

    // Cargar en memoria y responder AL CLIENTE INMEDIATAMENTE
    loadedZones  = zones;
    loadedAt     = new Date().toISOString();
    loadedFile   = req.file.originalname;
    spatialIndex = buildSpatialIndex(zones);

    res.status(200).json({
      status: 'ok',
      fileName: req.file.originalname,
      zonesLoaded: zones.length,
      byType: countByType(zones),
      networkLinksFound: networkLinks.length,
      message: networkLinks.length > 0
        ? `Se cargaron ${zones.length} elementos. Resolviendo ${networkLinks.length} enlaces externos en segundo plano...`
        : `Se cargaron ${zones.length} elementos exitosamente`,
      loadedAt
    });

    // Guardar zonas base en DB y DESPUÉS resolver NetworkLinks (mapas externos).
    // Encadenado a propósito: appendZonesToDB de los enlaces no debe correr en
    // paralelo con el DELETE+INSERT del guardado base o se perderían filas.
    saveZonesToDB(zones, req.file.originalname)
      .catch(e => console.error('[Coverage] Guardado background fallido:', e.message))
      .then(() => {
        if (networkLinks.length > 0) {
          return resolveNetworkLinksBackground(networkLinks);
        }
      })
      .catch(e => console.error('[Coverage] Error resolviendo NetworkLinks:', e.message));

  } catch (error) {
    console.error('[Coverage Error]', error);
    if (!res.headersSent) {
      res.status(500).json({ status: 'error', message: error.message });
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

    const zone = spatialIndex
      ? findZoneForPoint(longitude, latitude, loadedZones, spatialIndex)
      : (() => {
          const p = [longitude, latitude];
          return loadedZones.find(z => pointInPolygon(p, z.coordinates)) || null;
        })();

    return res.status(200).json({
      latitude, longitude,
      hasCoverage: !!zone,
      zoneName:    zone ? zone.name : 'Sin cobertura',
      timestamp:   new Date().toISOString()
    });

  } catch (error) {
    console.error('[Coverage Error]', error);
    return res.status(500).json({ status: 'error', message: error.message });
  }
};

// ── POST /api/coverage/load-batch ────────────────────────────────────────────
// Recibe zonas ya parseadas en el navegador, lote por lote.
// El servidor nunca toca el archivo KMZ — cero riesgo de OOM.
exports.loadBatch = async (req, res) => {
  try {
    const { zones, fileName, isFirst, isFinal, total, networkLinks } = req.body;

    if (!Array.isArray(zones) || zones.length === 0)
      return res.status(400).json({ status: 'error', message: 'zones vacías' });
    if (!fileName)
      return res.status(400).json({ status: 'error', message: 'fileName requerido' });

    await ensureCoverageTable();

    // En el primer lote, limpiar zonas anteriores
    if (isFirst) {
      await pool.query('DELETE FROM public.coverage_zones');
      console.log('[Coverage] Zonas anteriores borradas — iniciando carga de:', fileName);
    }

    // Insertar este lote con sus bounding boxes
    // Acepta Point (1 coord), LineString (2 coords) y Polygon (>=3 coords) — antes
    // se descartaba todo lo que tuviera menos de 3 coordenadas, perdiendo los Points.
    const values = [];
    const params = [];
    let   p      = 1;

    for (const z of zones) {
      if (!Array.isArray(z.coordinates) || z.coordinates.length < 1) continue;
      const bbox = buildBBox(z.coordinates);
      values.push(`($${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++})`);
      params.push(
        fileName, z.name || 'Sin nombre', z.type || 'Polygon',
        JSON.stringify(z.coordinates),
        bbox.minLon, bbox.minLat, bbox.maxLon, bbox.maxLat
      );
    }

    if (values.length > 0) {
      await pool.query(
        `INSERT INTO public.coverage_zones
           (file_name, name, type, coordinates, bbox_minlon, bbox_minlat, bbox_maxlon, bbox_maxlat)
         VALUES ${values.join(',')}`,
        params
      );
    }

    console.log(`[Coverage] Lote guardado: ${zones.length} elementos | archivo: ${fileName}`);

    // En el último lote, cargar todo en memoria y construir índice espacial
    if (isFinal) {
      const cached = await loadZonesFromDB();
      if (cached) {
        loadedZones  = cached.zones;
        loadedFile   = cached.fileName;
        loadedAt     = new Date().toISOString();
        spatialIndex = buildSpatialIndex(loadedZones);
        console.log('[Coverage] Índice espacial listo — elementos totales:', loadedZones.length);
      }

      // Si el navegador detectó NetworkLinks (mapas externos), resolverlos en
      // background ahora que ya se guardó la base del archivo subido.
      if (Array.isArray(networkLinks) && networkLinks.length > 0) {
        resolveNetworkLinksBackground(networkLinks)
          .catch(e => console.error('[Coverage] Error resolviendo NetworkLinks:', e.message));
      }

      return res.status(200).json({
        status: 'ok',
        zonesLoaded: loadedZones ? loadedZones.length : 0,
        byType: countByType(loadedZones),
        networkLinksFound: Array.isArray(networkLinks) ? networkLinks.length : 0,
        message: `${total} elementos cargados y guardados correctamente`
      });
    }

    return res.status(200).json({ status: 'ok', message: `Lote guardado: ${zones.length} elementos` });

  } catch (error) {
    console.error('[Coverage] Error en loadBatch:', error);
    return res.status(500).json({ status: 'error', message: error.message });
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

      const zone = spatialIndex
        ? findZoneForPoint(longitude, latitude, loadedZones, spatialIndex)
        : (() => {
            const pt = [longitude, latitude];
            return loadedZones.find(z => pointInPolygon(pt, z.coordinates)) || null;
          })();

      return {
        latitude, longitude,
        hasCoverage: !!zone,
        zoneName:    zone ? zone.name : 'Sin cobertura'
      };
    });

    const withCoverage = results.filter(r => r.hasCoverage).length;

    return res.status(200).json({
      totalPoints: results.length,
      pointsWithCoverage: withCoverage,
      pointsWithoutCoverage: results.length - withCoverage,
      results,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[Coverage Error]', error);
    return res.status(500).json({ status: 'error', message: error.message });
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
      networkLinks: networkLinksState,
      zones: loadedZones.slice(0, 100),
      loadedAt,
      fileName: loadedFile || null
    });

  } catch (error) {
    console.error('[Coverage Error]', error);
    return res.status(500).json({ status: 'error', message: error.message });
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
    return res.status(500).json({ status: 'error', message: error.message });
  }
};

exports.getCoverageStatus = (req, res) => {
  return res.status(200).json({
    status: 'ok',
    message: 'Coverage service active',
    zonesLoaded: loadedZones ? loadedZones.length : 0,
    byType: loadedZones ? countByType(loadedZones) : {},
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
    return res.status(500).json({ status: 'error', message: error.message });
  }
};
