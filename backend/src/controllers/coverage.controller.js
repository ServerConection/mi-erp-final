/**
 * Coverage Controller
 * Maneja validación de cobertura de internet
 * Pure JavaScript - Sin dependencias Python
 */

const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const xml2js = require('xml2js');

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

const coverageDir = path.join(process.cwd(), 'coverage-data');
const ZONES_CACHE_FILE = path.join(coverageDir, 'zones_cache.json');

if (!fs.existsSync(coverageDir)) {
  fs.mkdirSync(coverageDir, { recursive: true });
}

// ════════════════════════════════════════════════════════════════════════════════
// Persistencia en disco (sobrevive reinicios de Render)
// ════════════════════════════════════════════════════════════════════════════════

function saveZonesToDisk(zones, fileName) {
  try {
    const cache = { zones, fileName, savedAt: new Date().toISOString() };
    fs.writeFileSync(ZONES_CACHE_FILE, JSON.stringify(cache), 'utf8');
    console.log('[Coverage] Zonas guardadas en disco:', zones.length);
  } catch (e) {
    console.warn('[Coverage] No se pudo guardar en disco:', e.message);
  }
}

function loadZonesFromDisk() {
  try {
    if (!fs.existsSync(ZONES_CACHE_FILE)) return null;
    const raw = fs.readFileSync(ZONES_CACHE_FILE, 'utf8');
    const cache = JSON.parse(raw);
    console.log('[Coverage] Zonas cargadas desde disco:', cache.zones.length, '(guardadas el', cache.savedAt + ')');
    return cache;
  } catch (e) {
    console.warn('[Coverage] No se pudo leer cache del disco:', e.message);
    return null;
  }
}

// Cargar desde disco al iniciar el servidor
let _cache = loadZonesFromDisk();
let loadedZones = _cache ? _cache.zones : null;
let loadedAt    = _cache ? _cache.savedAt : null;
let loadedFile  = _cache ? _cache.fileName : null;

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
// Parse KML - Extraccion recursiva de Placemarks
// ════════════════════════════════════════════════════════════════════════════════

/**
 * Recorre RECURSIVAMENTE el arbol KML (Document, Folder anidados) 
 * y devuelve todos los Placemarks encontrados sin importar la profundidad.
 * Soporta: kml > Placemark
 *           kml > Document > Placemark
 *           kml > Document > Folder > Placemark
 *           kml > Document > Folder > Folder > Placemark  (exportaciones Google Earth)
 */
function extractPlacemarks(node) {
  let placemarks = [];
  if (!node || typeof node !== 'object') return placemarks;

  // Placemarks directos en este nodo
  if (Array.isArray(node.Placemark)) {
    placemarks = placemarks.concat(node.Placemark);
  }

  // Bajar a Document(s)
  if (Array.isArray(node.Document)) {
    node.Document.forEach(doc => {
      placemarks = placemarks.concat(extractPlacemarks(doc));
    });
  }

  // Bajar a Folder(s) - pueden estar anidados
  if (Array.isArray(node.Folder)) {
    node.Folder.forEach(folder => {
      placemarks = placemarks.concat(extractPlacemarks(folder));
    });
  }

  return placemarks;
}

/**
 * Convierte un Placemark de xml2js en una zona {name, coordinates, type}
 */
function processPlacemark(placemark) {
  const zones = [];
  const name = placemark.name?.[0] || 'Sin nombre';

  // Polygons directos
  const polygons = placemark.Polygon || [];
  polygons.forEach((polygon) => {
    const outerBoundary = polygon.outerBoundaryIs?.[0];
    if (outerBoundary) {
      const linearRing = outerBoundary.LinearRing?.[0];
      if (linearRing?.coordinates) {
        const coords = linearRing.coordinates[0]
          .trim()
          .split(/\s+/)
          .filter(Boolean)
          .map(pair => pair.split(',').slice(0, 2).map(Number))
          .filter(c => c.length === 2 && !isNaN(c[0]) && !isNaN(c[1]));

        if (coords.length > 2) {
          zones.push({ name, coordinates: coords, type: 'Polygon' });
        }
      }
    }
  });

  // MultiGeometry - contiene Polygons anidados
  const multiGeometries = placemark.MultiGeometry || [];
  multiGeometries.forEach((mg) => {
    const mgPolygons = mg.Polygon || [];
    mgPolygons.forEach((polygon) => {
      const outerBoundary = polygon.outerBoundaryIs?.[0];
      if (outerBoundary) {
        const linearRing = outerBoundary.LinearRing?.[0];
        if (linearRing?.coordinates) {
          const coords = linearRing.coordinates[0]
            .trim()
            .split(/\s+/)
            .filter(Boolean)
            .map(pair => pair.split(',').slice(0, 2).map(Number))
            .filter(c => c.length === 2 && !isNaN(c[0]) && !isNaN(c[1]));

          if (coords.length > 2) {
            zones.push({ name, coordinates: coords, type: 'Polygon' });
          }
        }
      }
    });
  });

  // Points -> bounding box de ~100m
  const points = placemark.Point || [];
  points.forEach((point) => {
    if (point.coordinates?.[0]) {
      const coords = point.coordinates[0].trim().split(',').map(Number);
      if (coords.length >= 2) {
        const [lon, lat] = coords;
        const buffer = 0.001; // ~100m en grados
        zones.push({
          name,
          coordinates: [
            [lon - buffer, lat - buffer],
            [lon + buffer, lat - buffer],
            [lon + buffer, lat + buffer],
            [lon - buffer, lat + buffer],
            [lon - buffer, lat - buffer]
          ],
          type: 'Point'
        });
      }
    }
  });

  return zones;
}

async function parseKML(kmlContent) {
  try {
    const parser = new xml2js.Parser({ mergeAttrs: true });
    const result = await parser.parseStringPromise(kmlContent);

    const kml = result.kml;
    if (!kml) {
      console.warn('[KML] No se encontro nodo raiz <kml>');
      return [];
    }

    // Extraer TODOS los placemarks recursivamente
    const placemarks = extractPlacemarks(kml);
    console.log('[KML] Placemarks encontrados (recursivo):', placemarks.length);

    const zones = [];
    placemarks.forEach(pm => {
      const found = processPlacemark(pm);
      zones.push(...found);
    });

    console.log('[KML] Zonas generadas:', zones.length,
      '| Tipos:', zones.reduce((acc, z) => { acc[z.type] = (acc[z.type]||0)+1; return acc; }, {}));

    return zones;
  } catch (error) {
    throw new Error(`KML Parse error: ${error.message}`);
  }
}

async function handleCoverageFile(filePath, originalName = '') {
  try {
    const data = fs.readFileSync(filePath);
    let kmlContent;

    if (originalName.toLowerCase().endsWith('.kmz') || filePath.endsWith('.kmz')) {
      try {
        const zip = new AdmZip(data);
        const entries = zip.getEntries();
        console.log('[KMZ] Archivos dentro del ZIP:', entries.map(e => e.entryName));
        const kmlEntry = entries.find(e => e.entryName.endsWith('.kml'));

        if (!kmlEntry) throw new Error('No KML found in KMZ');

        console.log('[KMZ] Leyendo:', kmlEntry.entryName);
        kmlContent = kmlEntry.getData().toString('utf8');
      } catch (e) {
        throw new Error(`KMZ extraction failed: ${e.message}`);
      }
    } else {
      kmlContent = data.toString('utf8');
    }

    return await parseKML(kmlContent);
  } catch (error) {
    throw new Error(`File processing error: ${error.message}`);
  }
}

// ════════════════════════════════════════════════════════════════════════════════
// Controllers
// ════════════════════════════════════════════════════════════════════════════════

exports.loadCoverage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ status: 'error', message: 'No file uploaded' });
    }

    const zones = await handleCoverageFile(req.file.path, req.file.originalname);

    if (zones.length === 0) {
      return res.status(422).json({
        status: 'error',
        message: 'El archivo fue procesado pero no se encontraron zonas con poligonos. ' +
                 'Verifica que el KMZ contenga Polygons (no solo etiquetas o puntos sin poligono).'
      });
    }

    loadedZones = zones;
    loadedAt    = new Date().toISOString();
    loadedFile  = req.file.originalname;

    // Guardar en disco para sobrevivir reinicios
    saveZonesToDisk(zones, req.file.originalname);

    return res.status(200).json({
      status: 'ok',
      fileName: req.file.originalname,
      zonesLoaded: zones.length,
      message: `Se cargaron ${zones.length} zonas exitosamente`,
      loadedAt
    });

  } catch (error) {
    console.error('[Coverage Error]', error);
    return res.status(500).json({ status: 'error', message: error.message });
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

    if (!loadedZones || loadedZones.length === 0) {
      return res.status(400).json({ status: 'error', message: 'No zones loaded. Upload KML/KMZ first' });
    }

    const point = [longitude, latitude];
    let hasCoverage = false;
    let zoneName    = 'Unknown';

    for (const zone of loadedZones) {
      if (pointInPolygon(point, zone.coordinates)) {
        hasCoverage = true;
        zoneName    = zone.name;
        break;
      }
    }

    return res.status(200).json({
      latitude, longitude, hasCoverage, zoneName,
      timestamp: new Date().toISOString()
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

    if (!loadedZones || loadedZones.length === 0) {
      return res.status(400).json({ status: 'error', message: 'No zones loaded. Upload KML/KMZ first' });
    }

    const results = points.map(p => {
      const latitude  = parseFloat(p.latitude);
      const longitude = parseFloat(p.longitude);
      const point     = [longitude, latitude];

      let hasCoverage = false;
      let zoneName    = 'Unknown';

      for (const zone of loadedZones) {
        if (pointInPolygon(point, zone.coordinates)) {
          hasCoverage = true;
          zoneName    = zone.name;
          break;
        }
      }

      return { latitude, longitude, hasCoverage, zoneName };
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
