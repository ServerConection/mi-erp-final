const DEFAULT_MAX_AGE_MS = 14 * 60 * 1000;

function crearAseguradorInversion({ db, sync, now = () => new Date(), maxAgeMs = DEFAULT_MAX_AGE_MS, logger = console } = {}) {
  let enCurso = null;

  return async function asegurarInversionReciente() {
    if (enCurso) return enCurso;
    const estado = await db.query(`
      SELECT CASE WHEN COUNT(ultima) = 3 THEN MIN(ultima) END AS ultima,
             COUNT(*) FILTER (WHERE fecha_hoy IS NULL)::int AS faltantes_hoy
      FROM (
        SELECT MAX(updated_at) AS ultima, MAX(fecha) FILTER (WHERE fecha = (CURRENT_TIMESTAMP AT TIME ZONE 'America/Guayaquil')::date) AS fecha_hoy
        FROM novonet_inversion_redes WHERE origen = '__WINTRACKER_ARTS__'
        UNION ALL
        SELECT MAX(updated_at) AS ultima, MAX(fecha) FILTER (WHERE fecha = (CURRENT_TIMESTAMP AT TIME ZONE 'America/Guayaquil')::date) AS fecha_hoy
        FROM novonet_inversion_redes WHERE origen = '__WINTRACKER_VIDIKA__'
        UNION ALL
        SELECT MAX(updated_at) AS ultima, MAX(fecha) FILTER (WHERE fecha = (CURRENT_TIMESTAMP AT TIME ZONE 'America/Guayaquil')::date) AS fecha_hoy
        FROM velsa_inversion_redes WHERE canal_publicidad = '__WINTRACKER_VELSA__'
      ) agencias
    `);
    const ultima = estado.rows[0]?.ultima ? new Date(estado.rows[0].ultima) : null;
    const faltantesHoy = Number(estado.rows[0]?.faltantes_hoy || 0);
    if (faltantesHoy === 0 && ultima && now().getTime() - ultima.getTime() <= maxAgeMs) return { sincronizada: false, ultima };
    if (enCurso) return enCurso;

    enCurso = Promise.resolve(sync())
      .then((resultado) => ({ sincronizada: true, resultado }))
      .catch((error) => {
        logger.error('[WinTracker] No se pudo actualizar antes de calcular Redes:', error.message);
        return { sincronizada: false, error: error.message };
      })
      .finally(() => { enCurso = null; });
    return enCurso;
  };
}

let singleton;
function asegurarInversionReciente() {
  if (!singleton) {
    const db = require('../config/db');
    const { syncTodasLasAgencias } = require('./wintracker.service');
    singleton = crearAseguradorInversion({ db, sync: () => syncTodasLasAgencias() });
  }
  return singleton();
}

module.exports = { crearAseguradorInversion, asegurarInversionReciente };
