/**
 * Coverage Controller
 * Maneja validación de cobertura de internet usando geometría (shapely en Python)
 *
 * Endpoints:
 * - POST /load-coverage    → Carga archivo KML/KMZ
 * - GET /check-coverage    → Valida si un punto tiene cobertura
 * - POST /check-batch      → Valida múltiples puntos
 * - GET /coverage-zones    → Lista zonas cargadas
 * - GET /coverage-status   → Status de coverage service
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

// ════════════════════════════════════════════════════════════════════════════════
// CONFIGURACIÓN
// ════════════════════════════════════════════════════════════════════════════════

const coverageDir = path.join(process.cwd(), 'coverage-data');
const pythonScriptPath = path.join(process.cwd(), 'coverage-api-service.py');

// Crear directorio si no existe
if (!fs.existsSync(coverageDir)) {
  fs.mkdirSync(coverageDir, { recursive: true });
}

// Configurar multer para archivos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, coverageDir);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    cb(null, `coverage-${timestamp}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 }, // 200 MB
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.kml', '.kmz'].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Solo se aceptan archivos .kml o .kmz'));
    }
  }
});

// Variable global para almacenar zonas cargadas
let loadedZones = null;
let loadedAt = null;

// ════════════════════════════════════════════════════════════════════════════════
// FUNCIONES AUXILIARES
// ════════════════════════════════════════════════════════════════════════════════

/**
 * Ejecuta el servicio de coverage (Python)
 */
function runCoverageService(operation, params) {
  return new Promise((resolve, reject) => {
    try {
      const dataDir = coverageDir;
      const jsonInput = JSON.stringify({
        operation,
        params,
        dataDir
      });

      // Usar stdin para pasar datos al script Python
      const pythonProcess = spawn('python', [pythonScriptPath]);

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
          return reject(new Error(`Python service error: ${errorOutput}`));
        }

        try {
          const result = JSON.parse(output);
          resolve(result);
        } catch (e) {
          reject(new Error(`Invalid JSON response from service: ${output}`));
        }
      });

      // Timeout después de 30 segundos
      setTimeout(() => {
        pythonProcess.kill();
        reject(new Error('Coverage service timeout'));
      }, 30000);

      pythonProcess.stdin.write(jsonInput);
      pythonProcess.stdin.end();

    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Valida que haya zonas cargadas
 */
function ensureZonesLoaded() {
  if (!loadedZones || loadedZones.length === 0) {
    throw new Error('No hay zonas cargadas. Sube un archivo KML/KMZ primero');
  }
}

// ════════════════════════════════════════════════════════════════════════════════
// CONTROLADORES
// ════════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/coverage/load
 * Carga un archivo KML/KMZ
 */
exports.loadCoverage = [upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        status: 'error',
        message: 'No se subió ningún archivo'
      });
    }

    const filePath = req.file.path;
    const fileName = req.file.originalname;

    console.log(`[Coverage] Cargando archivo: ${fileName}`);

    // Procesar archivo
    const result = await runCoverageService('load', {
      filePath,
      fileName
    });

    // Guardar información en memoria
    loadedZones = result.zones || [];
    loadedAt = new Date().toISOString();

    return res.status(200).json({
      status: 'ok',
      fileName,
      zonesLoaded: loadedZones.length,
      message: `Se cargaron ${loadedZones.length} zonas de cobertura exitosamente`,
      loadedAt
    });

  } catch (error) {
    console.error('[Coverage Error]', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Error al cargar archivo'
    });
  }
}];

/**
 * GET /api/coverage/check?lat=X&lon=Y
 * Valida si un punto tiene cobertura
 */
exports.checkCoverage = async (req, res) => {
  try {
    const { lat, lon } = req.query;

    // Validar parámetros
    if (!lat || !lon) {
      return res.status(400).json({
        status: 'error',
        message: 'Se requieren parámetros: lat, lon'
      });
    }

    const latitude = parseFloat(lat);
    const longitude = parseFloat(lon);

    if (isNaN(latitude) || isNaN(longitude)) {
      return res.status(400).json({
        status: 'error',
        message: 'Latitud y longitud deben ser números válidos'
      });
    }

    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return res.status(400).json({
        status: 'error',
        message: 'Coordenadas fuera de rango válido'
      });
    }

    ensureZonesLoaded();

    const result = await runCoverageService('check', {
      latitude,
      longitude
    });

    return res.status(200).json({
      latitude,
      longitude,
      hasCoverage: result.has_coverage,
      zoneName: result.zone_name || 'Sin nombre',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[Coverage Error]', error);
    return res.status(error.message.includes('No hay zonas') ? 400 : 500).json({
      status: 'error',
      message: error.message
    });
  }
};

/**
 * POST /api/coverage/check-batch
 * Valida múltiples puntos
 */
exports.checkBatch = async (req, res) => {
  try {
    const { points } = req.body;

    if (!Array.isArray(points) || points.length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Se requiere un array de puntos'
      });
    }

    // Validar cada punto
    const validPoints = points.map((p, idx) => {
      const lat = parseFloat(p.latitude);
      const lon = parseFloat(p.longitude);

      if (isNaN(lat) || isNaN(lon)) {
        throw new Error(`Punto ${idx} tiene coordenadas inválidas`);
      }

      if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        throw new Error(`Punto ${idx} tiene coordenadas fuera de rango`);
      }

      return { latitude: lat, longitude: lon };
    });

    ensureZonesLoaded();

    const result = await runCoverageService('check_batch', {
      points: validPoints
    });

    const withCoverage = result.results.filter(r => r.has_coverage).length;

    return res.status(200).json({
      totalPoints: result.results.length,
      pointsWithCoverage: withCoverage,
      pointsWithoutCoverage: result.results.length - withCoverage,
      results: result.results.map(r => ({
        latitude: r.latitude,
        longitude: r.longitude,
        hasCoverage: r.has_coverage,
        zoneName: r.zone_name || 'Sin nombre'
      })),
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[Coverage Error]', error);
    return res.status(error.message.includes('No hay zonas') ? 400 : 500).json({
      status: 'error',
      message: error.message
    });
  }
};

/**
 * GET /api/coverage/zones
 * Lista zonas cargadas
 */
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
      zones: loadedZones.slice(0, 100), // Máximo 100 para no saturar response
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

/**
 * GET /api/coverage/status
 * Estado del servicio de coverage
 */
exports.getCoverageStatus = (req, res) => {
  return res.status(200).json({
    status: 'ok',
    message: 'Coverage service activo',
    zonesLoaded: loadedZones ? loadedZones.length : 0,
    loadedAt: loadedAt || null,
    timestamp: new Date().toISOString()
  });
};

// Exportar middleware
exports.upload = upload;
