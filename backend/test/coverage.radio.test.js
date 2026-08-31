/**
 * Pruebas del motor de cobertura: trazados con radio y agujeros.
 *
 * Cubre los dos defectos que reportó operación:
 *   · "dice que no hay cobertura y sí hay"  → las LineString se ignoraban
 *   · "dice que sí hay y no hay"            → los agujeros contaban como cobertura
 *
 * Se ejecuta con:  node backend/test/coverage.radio.test.js
 * No necesita base de datos ni servidor.
 */
require('dotenv').config();
const { _internos } = require('../src/controllers/coverage.controller');
const { parseKMLFast, evaluarCobertura, setLoadedZones, countByType, COVERAGE_BUFFER_M } = _internos;

// Guayaquil. A esta latitud 0.001° ≈ 111 m en latitud.
const LAT = -2.1700, LON = -79.9000;
const dLat = (m) => m / 111320;

const KML = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document>
  <Placemark><name>AREA CENTRO</name><Polygon>
    <outerBoundaryIs><LinearRing><coordinates>
      ${LON - 0.01},${LAT - 0.01},0 ${LON + 0.01},${LAT - 0.01},0
      ${LON + 0.01},${LAT + 0.01},0 ${LON - 0.01},${LAT + 0.01},0
      ${LON - 0.01},${LAT - 0.01},0
    </coordinates></LinearRing></outerBoundaryIs>
    <innerBoundaryIs><LinearRing><coordinates>
      ${LON - 0.002},${LAT - 0.002},0 ${LON + 0.002},${LAT - 0.002},0
      ${LON + 0.002},${LAT + 0.002},0 ${LON - 0.002},${LAT + 0.002},0
      ${LON - 0.002},${LAT - 0.002},0
    </coordinates></LinearRing></innerBoundaryIs>
  </Polygon></Placemark>

  <Placemark><name>TRONCAL FIBRA NORTE</name><LineString><tessellate>1</tessellate>
    <coordinates>
      ${LON - 0.03},${LAT + 0.05},0 ${LON + 0.03},${LAT + 0.05},0
    </coordinates>
  </LineString></Placemark>
</Document></kml>`;

const { zones } = parseKMLFast(KML);
setLoadedZones(zones);

let ok = 0, fallo = 0;
function prueba(titulo, lon, lat, espCubierto, espVia) {
  const r = evaluarCobertura(lon, lat);
  const bien = r.cubierto === espCubierto && (!espVia || r.via === espVia);
  bien ? ok++ : fallo++;
  console.log(`${bien ? '  OK  ' : 'FALLA '} ${titulo}`);
  console.log(`        → ${r.cubierto ? 'CON' : 'SIN'} cobertura · via=${r.via} · ${r.detalle}`);
}

console.log('\nGeometrias parseadas:', JSON.stringify(countByType(zones)));
console.log('Radio de trazado:', COVERAGE_BUFFER_M, 'm\n');

// El agujero debe existir: si sale 0, classifyGeometry no lo detecto.
const agujeros = zones.filter(z => z.type === 'Hole').length;
console.log(`${agujeros === 1 ? '  OK  ' : 'FALLA '} El anillo interior se reconoce como agujero (${agujeros})`);
agujeros === 1 ? ok++ : fallo++;

prueba('Dentro del area, fuera del agujero → CON cobertura',
       LON + 0.006, LAT + 0.006, true, 'poligono');

prueba('Dentro del agujero → SIN cobertura (antes daba "si tiene")',
       LON, LAT, false, 'agujero');

prueba('A ~110 m de la fibra → CON cobertura (antes daba "no tiene")',
       LON, LAT + 0.05 - dLat(110), true, 'trazado');

prueba('Justo en la fibra → CON cobertura',
       LON, LAT + 0.05, true, 'trazado');

prueba('A ~450 m de la fibra, fuera del radio → SIN cobertura',
       LON, LAT + 0.05 - dLat(450), false, null);

prueba('Lejos de todo → SIN cobertura',
       LON + 0.5, LAT + 0.5, false, null);

console.log(`\n${ok}/${ok + fallo} pruebas correctas\n`);
process.exit(fallo ? 1 : 0);
