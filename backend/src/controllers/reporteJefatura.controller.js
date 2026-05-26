// =============================================================================
// REPORTE JEFATURA - Comparativa de ingresos JotForm vs promedio historico
// Empresas: NOVONET (mestra_bitrix) y VELSA (mv_indicadores_velsa_completo)
//
// Devuelve por cada hora del dia:
//   - ingresos_hoy:        cuantos ingresos JotForm hay HOY hasta esa hora
//   - promedio_historico:  promedio de los ultimos 90 dias para (hora, dia_semana)
//   - variacion_pct:       (hoy - prom) / prom * 100
//   - estado:              ENCIMA / EN_LINEA / DEBAJO
// =============================================================================
const pool = require('../config/db');

const VENTANA_HISTORICA_DIAS = 90;
const TOLERANCIA_PCT         = 10;  // ±10% se considera "en linea"

const getEcuadorHourDow = () => {
  // Hora y dia de semana en zona Ecuador
  const r = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Guayaquil' }));
  return { hora: r.getHours(), dow: r.getDay() };
};

function clasificarEstado(actual, promedio) {
  if (promedio == null || promedio == 0) return 'SIN_DATO';
  const diff = ((actual - promedio) * 100) / promedio;
  if (diff > TOLERANCIA_PCT)  return 'ENCIMA';
  if (diff < -TOLERANCIA_PCT) return 'DEBAJO';
  return 'EN_LINEA';
}

// Constructor de query: parametriza la tabla y la columna timestamp
// NOTA: se castea la columna a TIMESTAMPTZ para compatibilidad con AT TIME ZONE
//       cuando el campo esta almacenado como text en la BD.
function buildQuery(tabla, colFecha) {
  const col = `(${colFecha}::timestamptz)`;
  return `
    WITH historico AS (
      SELECT
        EXTRACT(HOUR FROM (${col} AT TIME ZONE 'America/Guayaquil'))::int  AS hora,
        EXTRACT(DOW  FROM (${col} AT TIME ZONE 'America/Guayaquil'))::int  AS dow,
        DATE(${col} AT TIME ZONE 'America/Guayaquil')                       AS fecha_dia,
        COUNT(*) AS n
      FROM ${tabla}
      WHERE ${colFecha} IS NOT NULL
        AND (${col} AT TIME ZONE 'America/Guayaquil') >= (NOW() AT TIME ZONE 'America/Guayaquil') - INTERVAL '${VENTANA_HISTORICA_DIAS} days'
        AND (${col} AT TIME ZONE 'America/Guayaquil') <  DATE_TRUNC('day', (NOW() AT TIME ZONE 'America/Guayaquil'))
      GROUP BY 1, 2, 3
    ),
    promedio AS (
      SELECT hora, dow,
             ROUND(AVG(n)::numeric, 2) AS promedio,
             ROUND(MIN(n)::numeric, 2) AS minimo,
             ROUND(MAX(n)::numeric, 2) AS maximo,
             COUNT(*)                  AS n_muestras
      FROM historico
      GROUP BY hora, dow
    ),
    hoy AS (
      SELECT EXTRACT(HOUR FROM (${col} AT TIME ZONE 'America/Guayaquil'))::int AS hora,
             COUNT(*) AS ingresos_hoy
      FROM ${tabla}
      WHERE DATE(${col} AT TIME ZONE 'America/Guayaquil') = DATE(NOW() AT TIME ZONE 'America/Guayaquil')
      GROUP BY 1
    ),
    serie_horas AS (
      SELECT generate_series(0, 23) AS hora
    )
    SELECT
      sh.hora,
      COALESCE(h.ingresos_hoy, 0)::int  AS ingresos_hoy,
      COALESCE(p.promedio, 0)::numeric  AS promedio_historico,
      COALESCE(p.minimo,   0)::numeric  AS historico_min,
      COALESCE(p.maximo,   0)::numeric  AS historico_max,
      COALESCE(p.n_muestras, 0)::int    AS muestras
    FROM serie_horas sh
    LEFT JOIN hoy      h ON h.hora = sh.hora
    LEFT JOIN promedio p ON p.hora = sh.hora AND p.dow = EXTRACT(DOW FROM (NOW() AT TIME ZONE 'America/Guayaquil'))::int
    ORDER BY sh.hora;
  `;
}

// Endpoint generico que recibe empresa
async function obtenerReporteJefatura(empresa) {
  let tabla, colFecha;
  if (empresa === 'NOVONET') {
    tabla = 'public.mestra_bitrix';
    colFecha = 'j_fecha_registro_sistema';
  } else if (empresa === 'VELSA') {
    tabla = 'public.mv_indicadores_velsa_completo';
    colFecha = 'fecha_registro_jotform';
  } else {
    throw new Error('empresa invalida (NOVONET | VELSA)');
  }

  const q = buildQuery(tabla, colFecha);
  const r = await pool.query(q);

  const { hora: horaActual } = getEcuadorHourDow();

  const filas = r.rows.map(row => {
    const ingresos = Number(row.ingresos_hoy);
    const promedio = Number(row.promedio_historico);
    const variacion_pct = (promedio > 0)
      ? Number((((ingresos - promedio) * 100) / promedio).toFixed(2))
      : null;
    const estado = clasificarEstado(ingresos, promedio);
    return {
      hora: row.hora,
      ingresos_hoy: ingresos,
      promedio_historico: promedio,
      historico_min: Number(row.historico_min),
      historico_max: Number(row.historico_max),
      muestras: row.muestras,
      variacion_pct,
      estado,
    };
  });

  // Resumen acumulado hasta la hora actual
  const hastaAhora = filas.filter(f => f.hora <= horaActual);
  const totalHoy   = hastaAhora.reduce((a, f) => a + f.ingresos_hoy, 0);
  const totalProm  = hastaAhora.reduce((a, f) => a + f.promedio_historico, 0);
  const variacionAcum = (totalProm > 0)
    ? Number((((totalHoy - totalProm) * 100) / totalProm).toFixed(2))
    : null;

  return {
    empresa,
    fecha:               new Date().toISOString().slice(0, 10),
    hora_actual:         horaActual,
    dia_semana:          getEcuadorHourDow().dow,
    ventana_dias:        VENTANA_HISTORICA_DIAS,
    tolerancia_pct:      TOLERANCIA_PCT,
    acumulado: {
      total_hoy:           totalHoy,
      promedio_historico:  Number(totalProm.toFixed(2)),
      variacion_pct:       variacionAcum,
      estado:              clasificarEstado(totalHoy, totalProm),
    },
    por_hora: filas,
  };
}

exports.getNovonet = async (req, res) => {
  try {
    const data = await obtenerReporteJefatura('NOVONET');
    res.json({ success: true, ...data });
  } catch (err) {
    console.error('[reporteJefatura.getNovonet]', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.getVelsa = async (req, res) => {
  try {
    const data = await obtenerReporteJefatura('VELSA');
    res.json({ success: true, ...data });
  } catch (err) {
    console.error('[reporteJefatura.getVelsa]', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// Endpoint combinado (para vista que muestra ambas empresas)
exports.getAmbas = async (req, res) => {
  try {
    const [novonet, velsa] = await Promise.all([
      obtenerReporteJefatura('NOVONET'),
      obtenerReporteJefatura('VELSA'),
    ]);
    res.json({ success: true, novonet, velsa });
  } catch (err) {
    console.error('[reporteJefatura.getAmbas]', err);
    res.status(500).json({ success: false, error: err.message });
  }
};
