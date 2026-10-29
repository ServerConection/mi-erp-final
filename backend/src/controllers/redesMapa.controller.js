// GET /api/redes/mapa-ventas — puntos GPS de ventas (envios_ventas) para el
// mapa de calor del módulo Redes. Fecha = fecha_ingreso_telcos.
// El GPS llega en DMS (0°12'05.7"S 78°25'58.9"W) o en decimal (-0.2015, -78.43).
const pool = require('../config/db');

const hoyEc = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guayaquil' }).format(new Date());

// Convierte un texto GPS a [lat, lng] o null.
function parseGps(txt) {
  const s = String(txt || '').trim().toUpperCase().replace(/,/g, ' ');
  if (!s) return null;
  let lat = null, lng = null;

  // DMS: grados°minutos'segundos"Hemisferio
  const dms = [...s.matchAll(/(\d+(?:\.\d+)?)\s*°\s*(\d+(?:\.\d+)?)?\s*['’′]?\s*(\d+(?:\.\d+)?)?\s*(?:["”″]|'')?\s*([NSEWO])/g)];
  if (dms.length >= 2) {
    const conv = (m) => {
      const v = Number(m[1]) + Number(m[2] || 0) / 60 + Number(m[3] || 0) / 3600;
      return ['S', 'W', 'O'].includes(m[4]) ? -v : v;
    };
    for (const m of dms) {
      if (['N', 'S'].includes(m[4])) lat = conv(m); else lng = conv(m);
    }
  } else {
    // Decimal: "-0.2015 -78.43"
    const nums = s.match(/-?\d+\.\d+/g);
    if (nums && nums.length >= 2) { lat = Number(nums[0]); lng = Number(nums[1]); }
  }
  if (lat === null || lng === null || !isFinite(lat) || !isFinite(lng)) return null;
  // Validar que esté dentro de Ecuador (incluye Galápagos)
  if (lat < -5.1 || lat > 1.7 || lng < -92.1 || lng > -75.1) return null;
  return [lat, lng];
}

async function getMapaVentas(req, res) {
  try {
    const empresa = String(req.query.empresa || 'NOVONET').toUpperCase();
    if (!['NOVONET', 'VELSA'].includes(empresa)) {
      return res.status(400).json({ success: false, message: 'Empresa no válida' });
    }
    const desde = req.query.fechaDesde || hoyEc();
    const hasta = req.query.fechaHasta || hoyEc();

    const { rows } = await pool.query(`
      SELECT e.coordenadas_gps AS gps,
             UPPER(BTRIM(COALESCE(NULLIF(BTRIM(e.ciudad), ''), 'SIN CIUDAD'))) AS ciudad,
             COUNT(*)::int AS n
      FROM public.envios_ventas e
      WHERE UPPER(BTRIM(COALESCE(e.distribuidor_autorizado, ''))) = $1
        AND e.origen_dato IN ($2, 'ERP')
        AND e.estatus_envio IS DISTINCT FROM 'BORRADOR'
        AND e.fecha_ingreso_telcos BETWEEN $3::date AND $4::date
      GROUP BY 1, 2
    `, [empresa, `JOTFORM_${empresa}`, desde, hasta]);

    // Agrupar por punto redondeado (~100 m) y contar por ciudad
    const puntos = new Map();
    const ciudades = new Map();
    let total = 0, sinGps = 0;
    for (const r of rows) {
      total += r.n;
      ciudades.set(r.ciudad, (ciudades.get(r.ciudad) || 0) + r.n);
      const c = parseGps(r.gps);
      if (!c) { sinGps += r.n; continue; }
      const k = `${c[0].toFixed(3)},${c[1].toFixed(3)}`;
      puntos.set(k, (puntos.get(k) || 0) + r.n);
    }

    res.json({
      success: true,
      total,
      sin_gps: sinGps,
      puntos: [...puntos].map(([k, n]) => { const [lat, lng] = k.split(',').map(Number); return { lat, lng, n }; }),
      top_ciudades: [...ciudades].map(([ciudad, n]) => ({ ciudad, n })).sort((a, b) => b.n - a.n).slice(0, 5),
    });
  } catch (e) {
    console.error('Error Redes mapa-ventas:', e);
    res.status(500).json({ success: false, message: 'Error al obtener mapa de ventas',
      error: process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : e.message });
  }
}

module.exports = { getMapaVentas, parseGps };
