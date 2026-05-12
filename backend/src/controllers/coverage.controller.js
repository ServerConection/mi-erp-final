/**
 * Coverage Controller
 * Maneja validación de cobertura de internet
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const coverageDir = path.join(process.cwd(), 'coverage-data');

if (!fs.existsSync(coverageDir)) {
  fs.mkdirSync(coverageDir, { recursive: true });
}

let loadedZones = null;
let loadedAt = null;

// ════════════════════════════════════════════════════════════════════════════════
// Ejecutar servicio Python
// ════════════════════════════════════════════════════════════════════════════════

function runCoverageService(operation, params) {
  return new Promise((resolve, reject) => {
    try {
      const pythonScriptPath = path.join(process.cwd(), 'coverage-api-service.py');
      const jsonInput = JSON.stringify({ operation, params, dataDir: coverageDir });
      const pythonProcess = spawn('python3', [pythonScriptPath]);

      let output = '';
      let errorOutput = '';

      pythonProcess.stdout.on('data', (data) => {
        output += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      pythonProcess.on('close', (code) => {
        if (code !== 0) {
          return reject(new Error(`Python error: ${errorOutput}`));
        }
        try {
          const result = JSON.parse(output);
          resolve(result);
        } catch (e) {
          reject(new Error(`Invalid response: ${output}`));
        }
      });

      setTimeout(() => {
        pythonProcess.kill();
        reject(new Error('Python service timeout'));
      }, 30000);

      pythonProcess.stdin.write(jsonInput);
      pythonProcess.stdin.end();

    } catch (error) {
      reject(error);
    }
  });
}

// ════════════════════════════════════════════════════════════════════════════════
// Controladores
// ════════════════════════════════════════════════════════════════════════════════

exports.loadCoverage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        status: 'error',
        message: 'No file uploaded'
      });
    }

    const filePath = req.file.path;
    const fileName = req.file.originalname;

    const result = await runCoverageService('load', { filePath, fileName });

    loadedZones = result.zones || [];
    loadedAt = new Date().toISOString();

    return res.status(200).json({
      status: 'ok',
      fileName,
      zonesLoaded: loadedZones.length,
      message: `Se cargaron ${loadedZones.length} zonas`,
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

    const result = await runCoverageService('check', { latitude, longitude });

    return res.status(200).json({
      latitude,
      longitude,
      hasCoverage: result.has_coverage,
      zoneName: result.zone_name || 'Unknown',
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

    const validPoints = points.map((p) => ({
      latitude: parseFloat(p.latitude),
      longitude: parseFloat(p.longitude)
    }));

    if (!loadedZones || loadedZones.length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'No zones loaded. Upload KML/KMZ first'
      });
    }

    const result = await runCoverageService('check_batch', { points: validPoints });

    const withCoverage = result.results.filter(r => r.has_coverage).length;

    return res.status(200).json({
      totalPoints: result.results.length,
      pointsWithCoverage: withCoverage,
      pointsWithoutCoverage: result.results.length - withCoverage,
      results: result.results,
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
