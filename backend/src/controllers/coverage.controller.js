/**
 * Coverage Controller
 * Maneja validación de cobertura de internet
 * Pure JavaScript - Sin dependencias Python
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

// Garantiza que la tabla coverage_zones exista
async function ensureCoverageTable() {
  // Tabla de zonas individuales — una fila por polígono
  // Mucho mejor que un JSONB gigante: inserts por lotes, loads rápidos
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.coverage_zones (
      id          SERIAL PRIMARY KEY,
      file_name   TEXT    NOT NULL,
      name        TEXT,
      coordinates JSONB   NOT NULL,
      bbox_minlon FLOAT,
      bbox_minlat FLOAT,
      bbox_maxlon FLOAT,
      bbox_maxlat FLOAT,
      loaded_at   TIMESTAMPTZ DEFAULT NOW()
    )
  `);
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
        values.push(`($${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++})`);
        params.push(
          fileName,
          z.name,
          JSON.stringify(z.coordinates),
          bbox.minLon, bbox.minLat, bbox.maxLon, bbox.maxLat
        );
      }

      await pool.query(
        `INSERT INTO public.coverage_zones
           (file_name, name, coordinates, bbox_minlon, bbox_minlat, bbox_maxlon, bbox_maxlat)
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
      `SELECT name, coordinates, bbox_minlon, bbox_minlat, bbox_maxlon, bbox_maxlat, file_name, loaded_at
       FROM public.coverage_zones ORDER BY id`
    );
    if (!rows.length) return null;

    const zones = rows.map(r => ({
      name:        r.name,
      coordinates: r.coordinates,
      type:        'Polygon',
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

  // 2. Asignar cada zona a todas las celdas que su bbox toca
  const cells = new Map();
  for (let i = 0; i < zones.length; i++) {
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
// Parser KML por REGEX — sin xml2js, sin DOM en memoria
// Probado con KML de 149MB / 23,154 polígonos / 5,901 placemarks en ~1 segundo
// ════════════════════════════════════════════════════════════════════════════════

/**
 * Extrae zonas de un string KML usando regex.
 * NO construye árbol DOM — consume ~10x menos memoria que xml2js.
 */
function parseKMLFast(kmlString) {
  const zones = [];
  const pmRegex    = /<Placemark>([\s\S]*?)<\/Placemark>/g;
  const nameRegex  = /<name>\s*([\s\S]*?)\s*<\/name>/;
  const coordRegex = /<coordinates>\s*([\s\S]*?)\s*<\/coordinates>/g;

  let pm;
  while ((pm = pmRegex.exec(kmlString)) !== null) {
    const block     = pm[1];
    const nameMatch = nameRegex.exec(block);
    const name      = nameMatch ? nameMatch[1].trim() : 'Sin nombre';

    coordRegex.lastIndex = 0;
    let coordMatch;
    while ((coordMatch = coordRegex.exec(block)) !== null) {
      const raw    = coordMatch[1].trim();
      const coords = raw.split(/\s+/).filter(Boolean).map(pair => {
        const parts = pair.split(',');
        return [parseFloat(parts[0]), parseFloat(parts[1])];
      }).filter(c => !isNaN(c[0]) && !isNaN(c[1]));

      if (coords.length > 2) {
        zones.push({ name, coordinates: coords, type: 'Polygon' });
      }
    }
  }

  console.log('[KML] Zonas extraídas (regex):', zones.length);
  return zones;
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

  const zones = parseKMLFast(kmlString);
  return zones; // ya no retorna kmlContent — no lo necesitamos
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
    const zones = handleCoverageFile(req.file.path, req.file.originalname);

    if (!zones || zones.length === 0) {
      return res.status(422).json({
        status: 'error',
        message: 'El archivo fue procesado pero no se encontraron zonas con polígonos.'
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
      message: `Se cargaron ${zones.length} zonas exitosamente`,
      loadedAt
    });

    // Guardar zonas en DB como filas individuales (background, sin bloquear)
    saveZonesToDB(zones, req.file.originalname)
      .catch(e => console.error('[Coverage] Guardado background fallido:', e.message));

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
      zones: loadedZones.slice(0, 100),
      loadedAt,
      fileName: loadedFile || null
    });

  } catch (error) {
    console.error('[Coverage Error]', error);
    return res.status(500).json({ status: 'error', message: error.message });
  }
};

exports.getCoverageStatus = (req, res) => {
  return res.status(200).json({
    status: 'ok',
    message: 'Coverage service active',
    zonesLoaded: loadedZones ? loadedZones.length : 0,
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
