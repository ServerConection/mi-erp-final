/**
 * Coverage Controller
 * Maneja validación de cobertura de internet
 * Pure JavaScript - Sin dependencias Python
 */

const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const xml2js = require('xml2js');

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

    if (kml && kml.Document) {
      const document = kml.Document[0];
      const placemarks = document.Placemark || [];

      placemarks.forEach((placemark) => {
        const name = placemark.name ? placemark.name[0] : 'Sin nombre';
        const polygons = placemark.Polygon || [];

        polygons.forEach((polygon) => {
          const outerBoundary = polygon.outerBoundaryIs?.[0];
          if (outerBoundary) {
            const linearRing = outerBoundary.LinearRing?.[0];
            if (linearRing && linearRing.coordinates) {
              const coords = linearRing.coordinates[0]
                .trim()
                .split(/\s+/)
                .map(pair => pair.split(',').slice(0, 2).map(Number));

              zones.push({ name, coordinates: coords });
            }
          }
        });
      });
    }

    return zones;
  } catch (error) {
    throw new Error(`KML Parse error: ${error.message}`);
  }
}

async function handleCoverageFile(filePath) {
  try {
    const data = fs.readFileSync(filePath);
    let kmlContent;

    if (filePath.endsWith('.kmz')) {
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

    const zones = await handleCoverageFile(req.file.path);

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
