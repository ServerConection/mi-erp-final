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

/**
 * Valida que lat/lon estén en rango geográfico.
 */
function isValidCoords(lat, lon) {
  return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

/**
 * Parsea un par "lat,lon" o "lat, lon".
 * @returns {{lat: number, lon: number} | null}
 */
function parseCoordPair(text) {
  const m = text.trim().match(/^(-?\d+\.?\d*),\s*(-?\d+\.?\d*)$/);
  if (m) {
    const lat = parseFloat(m[1]);
    const lon = parseFloat(m[2]);
    if (isValidCoords(lat, lon)) return { lat, lon };
  }
  return null;
}

/**
 * Extrae coordenadas de texto libre, URL de Google Maps, Apple Maps, etc.
 * Formatos soportados:
 *  - Coordenadas directas:    "-2.4189, -79.3459"
 *  - Google Maps ?q=LAT,LNG:  https://maps.google.com/?q=-2.4189,-79.3459
 *  - Google Maps place:       https://google.com/maps/place/NAME/@LAT,LNG,ZOOMz
 *  - Apple Maps:              https://maps.apple.com/?ll=LAT,LNG
 *  - URL con patrón coords:   cualquier URL que contenga LAT,LNG
 *
 * @returns {{lat: number, lon: number} | null}
 */
function parseCoordinatesFromUrl(text) {
  text = (text || '').trim();

  // 1. Coordenadas directas: "lat, lon" o "lat,lon"
  const direct = parseCoordPair(text);
  if (direct) return direct;

  try {
    const url = new URL(text);
    const params = new URLSearchParams(url.search);

    // 2. Google Maps ?q=LAT,LNG  (WhatsApp comparte en este formato)
    if (params.has('q')) {
      const r = parseCoordPair(params.get('q'));
      if (r) return r;
    }

    // 3. Apple Maps ?ll=LAT,LNG
    if (params.has('ll')) {
      const r = parseCoordPair(params.get('ll'));
      if (r) return r;
    }

    // 4. Google Maps place: /@LAT,LNG,ZOOMz en el path
    const pathMatch = url.pathname.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
    if (pathMatch) {
      const lat = parseFloat(pathMatch[1]);
      const lon = parseFloat(pathMatch[2]);
      if (isValidCoords(lat, lon)) return { lat, lon };
    }

    // 5. Google Maps /search/LAT,+LNG
    const searchMatch = url.pathname.match(/\/search\/(-?\d+\.?\d*)(?:,\+?|,\s*)(-?\d+\.?\d*)/);
    if (searchMatch) {
      const lat = parseFloat(searchMatch[1]);
      const lon = parseFloat(searchMatch[2]);
      if (isValidCoords(lat, lon)) return { lat, lon };
    }

  } catch (e) {
    // no era una URL válida — continuar
  }

  // 6. Búsqueda general: cualquier patrón "LAT,LNG" con 4+ decimales en cualquier texto
  const generalMatch = text.match(/(-?\d{1,2}\.\d{4,})[,\s]+(-?\d{1,3}\.\d{4,})/);
  if (generalMatch) {
    const lat = parseFloat(generalMatch[1]);
    const lon = parseFloat(generalMatch[2]);
    if (isValidCoords(lat, lon)) return { lat, lon };
  }

  return null;
}

/**
 * Detecta si la URL es un enlace acortado que necesita resolución de redirect.
 */
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

if (!fs.existsSync(coverageDir)) {
  fs.mkdirSync(coverageDir, { recursive: true });
}

let loadedZones = null;
let loadedAt = null;

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
// Parse KML/KMZ
// ════════════════════════════════════════════════════════════════════════════════

async function parseKML(kmlContent) {
  try {
    const parser = new xml2js.Parser({ mergeAttrs: true });
    const result = await parser.parseStringPromise(kmlContent);

    const zones = [];
    const kml = result.kml;

    if (!kml) return zones;

    // DEBUG: Log estructura del KML
    console.log('[KML STRUCTURE]', JSON.stringify(Object.keys(kml), null, 2));
    if (kml.Document) console.log('[KML.Document]', JSON.stringify(Object.keys(kml.Document[0]), null, 2));
    if (kml.Folder) console.log('[KML.Folder]', JSON.stringify(Object.keys(kml.Folder[0]), null, 2));

    // Buscar placemarks en múltiples ubicaciones del árbol KML
    let placemarks = [];

    if (kml.Document?.[0]?.Placemark) {
      console.log('[FOUND] Placemarks en Document');
      placemarks = kml.Document[0].Placemark;
    } else if (kml.Placemark) {
      console.log('[FOUND] Placemarks en raíz');
      placemarks = kml.Placemark;
    } else if (kml.Folder?.[0]?.Placemark) {
      console.log('[FOUND] Placemarks en Folder');
      placemarks = kml.Folder[0].Placemark;
    }

    console.log(`[PLACEMARKS] Total encontrados: ${placemarks.length}`);

    // Procesar cada placemark
    placemarks.forEach((placemark) => {
      const name = placemark.name?.[0] || 'Sin nombre';

      // Buscar Polygons
      const polygons = placemark.Polygon || [];
      polygons.forEach((polygon) => {
        const outerBoundary = polygon.outerBoundaryIs?.[0];
        if (outerBoundary) {
          const linearRing = outerBoundary.LinearRing?.[0];
          if (linearRing?.coordinates) {
            const coords = linearRing.coordinates[0]
              .trim()
              .split(/\s+/)
              .map(pair => pair.split(',').slice(0, 2).map(Number));

            if (coords.length > 2) {
              zones.push({ name, coordinates: coords, type: 'Polygon' });
            }
          }
        }
      });

      // Buscar Points (convertir a un círculo de 100m de radio)
      const points = placemark.Point || [];
      points.forEach((point) => {
        if (point.coordinates?.[0]) {
          const coords = point.coordinates[0]
            .trim()
            .split(',')
            .map(Number);

          if (coords.length >= 2) {
            const [lon, lat] = coords;
            // Crear un pequeño círculo alrededor del punto (100m aprox)
            const buffer = 0.01; // ~1km en grados
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
    });

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
        const kmlEntry = entries.find(e => e.entryName.endsWith('.kml'));

        if (!kmlEntry) throw new Error('No KML found in KMZ');

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
      return res.status(400).json({
        status: 'error',
        message: 'No file uploaded'
      });
    }

    const zones = await handleCoverageFile(req.file.path, req.file.originalname);

    loadedZones = zones;
    loadedAt = new Date().toISOString();

    return res.status(200).json({
      status: 'ok',
      fileName: req.file.originalname,
      zonesLoaded: zones.length,
      message: `Se cargaron ${zones.length} zonas exitosamente`,
      loadedAt
    });

  } catch (error) {
    console.error('[Coverage Error]', error);
    return res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

exports.checkCoverage = async (req, res) => {
  try {
    const { lat, lon } = req.query;

    if (!lat || !lon) {
      return res.status(400).json({
        status: 'error',
        message: 'Missing lat or lon'
      });
    }

    const latitude = parseFloat(lat);
    const longitude = parseFloat(lon);

    if (isNaN(latitude) || isNaN(longitude)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid coordinates'
      });
    }

    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return res.status(400).json({
        status: 'error',
        message: 'Coordinates out of range'
      });
    }

    if (!loadedZones || loadedZones.length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'No zones loaded. Upload KML/KMZ first'
      });
    }

    const point = [longitude, latitude];
    let hasCoverage = false;
    let zoneName = 'Unknown';

    for (const zone of loadedZones) {
      if (pointInPolygon(point, zone.coordinates)) {
        hasCoverage = true;
        zoneName = zone.name;
        break;
      }
    }

    return res.status(200).json({
      latitude,
      longitude,
      hasCoverage,
      zoneName,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[Coverage Error]', error);
    return res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

exports.checkBatch = async (req, res) => {
  try {
    const { points } = req.body;

    if (!Array.isArray(points) || points.length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid points array'
      });
    }

    if (!loadedZones || loadedZones.length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'No zones loaded. Upload KML/KMZ first'
      });
    }

    const results = points.map(p => {
      const latitude = parseFloat(p.latitude);
      const longitude = parseFloat(p.longitude);
      const point = [longitude, latitude];

      let hasCoverage = false;
      let zoneName = 'Unknown';

      for (const zone of loadedZones) {
        if (pointInPolygon(point, zone.coordinates)) {
          hasCoverage = true;
          zoneName = zone.name;
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
    return res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

exports.getZones = (req, res) => {
  try {
    if (!loadedZones || loadedZones.length === 0) {
      return res.status(200).json({
        zonesLoaded: false,
        totalZones: 0,
        zones: [],
        loadedAt: null
      });
    }

    return res.status(200).json({
      zonesLoaded: true,
      totalZones: loadedZones.length,
      zones: loadedZones.slice(0, 100),
      loadedAt
    });

  } catch (error) {
    console.error('[Coverage Error]', error);
    return res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

exports.getCoverageStatus = (req, res) => {
  return res.status(200).json({
    status: 'ok',
    message: 'Coverage service active',
    zonesLoaded: loadedZones ? loadedZones.length : 0,
    loadedAt: loadedAt || null,
    timestamp: new Date().toISOString()
  });
};

// ════════════════════════════════════════════════════════════════════════════════
// Resolver + parsear enlaces de ubicación (WhatsApp, Google Maps, etc.)
// ════════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/coverage/resolve-link
 * Body: { "link": "https://maps.google.com/?q=-2.4189,-79.3459" }
 *
 * 1. Intenta parsear el enlace directamente.
 * 2. Si es una URL acortada (goo.gl, maps.app.goo.gl), sigue el redireccionamiento
 *    y parsea la URL final.
 * 3. Retorna { lat, lon } o un error 422 si no se puede extraer.
 */
exports.resolveLink = async (req, res) => {
  try {
    const { link } = req.body;

    if (!link || typeof link !== 'string') {
      return res.status(400).json({
        status: 'error',
        message: 'Campo "link" requerido'
      });
    }

    const trimmed = link.trim();

    // ── Paso 1: intento directo ──────────────────────────────────────────────
    const direct = parseCoordinatesFromUrl(trimmed);
    if (direct) {
      return res.status(200).json({
        status: 'ok',
        lat: direct.lat,
        lon: direct.lon,
        source: 'direct',
        message: `Coordenadas extraídas: ${direct.lat}, ${direct.lon}`
      });
    }

    // ── Paso 2: resolver redirect (URLs acortadas) ───────────────────────────
    if (isShortenedUrl(trimmed) || trimmed.startsWith('http')) {
      try {
        // fetch con redirect: 'follow' devuelve response.url = URL final
        const response = await fetch(trimmed, {
          method: 'GET',
          redirect: 'follow',
          signal: AbortSignal.timeout(8000),
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; CoverageBot/1.0)'
          }
        });

        const finalUrl = response.url;

        // Intentar parsear la URL final
        if (finalUrl && finalUrl !== trimmed) {
          const fromRedirect = parseCoordinatesFromUrl(finalUrl);
          if (fromRedirect) {
            return res.status(200).json({
              status: 'ok',
              lat: fromRedirect.lat,
              lon: fromRedirect.lon,
              source: 'redirect',
              resolvedUrl: finalUrl,
              message: `Coordenadas extraídas tras redirección: ${fromRedirect.lat}, ${fromRedirect.lon}`
            });
          }
        }

        // Intentar buscar coords en el HTML de respuesta (último recurso)
        const html = await response.text().catch(() => '');
        const htmlMatch = html.match(/(-?\d{1,2}\.\d{6,}),(-?\d{1,3}\.\d{6,})/);
        if (htmlMatch) {
          const lat = parseFloat(htmlMatch[1]);
          const lon = parseFloat(htmlMatch[2]);
          if (isValidCoords(lat, lon)) {
            return res.status(200).json({
              status: 'ok',
              lat,
              lon,
              source: 'html',
              message: `Coordenadas extraídas del contenido: ${lat}, ${lon}`
            });
          }
        }

      } catch (fetchErr) {
        console.warn('[Coverage] Error resolviendo redirect:', fetchErr.message);
      }
    }

    // ── Paso 3: no se pudo extraer ───────────────────────────────────────────
    return res.status(422).json({
      status: 'error',
      message:
        'No se pudo extraer coordenadas del enlace. ' +
        'Usa un enlace directo de Google Maps (maps.google.com/?q=LAT,LNG) ' +
        'o escribe las coordenadas directamente (ej: -2.4189, -79.3459).'
    });

  } catch (error) {
    console.error('[Coverage resolveLink Error]', error);
    return res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};
