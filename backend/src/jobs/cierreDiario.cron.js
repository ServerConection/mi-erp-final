/**
 * JOB CRON: Cierre diario de leads (Bitrix) -> reportegeneral_d1
 *
 * Todos los días a las 23:30 (hora Ecuador) toma el estado ACTUAL de
 * bddgeneral.public.bitrix_webhook_leads y lo copia hacia
 * erp_database.reportegeneral_d1, marcando cada fila con
 * fecha_cierre = hoy.
 *
 * Por qué: bitrix_webhook_leads se sobrescribe con cada webhook (1 fila
 * por lead), así que no sirve para comparar "cómo cerró ayer" vs "cómo
 * cerró hoy". reportegeneral_d1 SIEMPRE ACUMULA: el mismo bitrix_id
 * aparece una vez por cada día de cierre, dando trazabilidad completa
 * para ratios e indicadores mensuales.
 *
 * Lee de bddgeneral (fuente de verdad) y NO de erp_database.bitrix_webhook_leads,
 * porque esa réplica puede desincronizarse en silencio si el doble-escrito
 * del webhook falla (ver comentario en config/dbErp.js).
 *
 * Es seguro re-ejecutarlo el mismo día: usa ON CONFLICT (empresa, bitrix_id,
 * fecha_cierre) DO UPDATE, así que un reintento o una corrida manual de
 * prueba nunca duplica filas, solo refresca el snapshot de hoy.
 *
 * Ejecución manual / backfill: scripts/ejecutar_cierre_diario.js
 */

const cron = require('node-cron');
const pool = require('../config/db');       // origen: bddgeneral (solo lectura)
const poolErp = require('../config/dbErp'); // destino: erp_database

const LOTE = 300; // filas por INSERT (mismo tamaño que scripts/copiar_a_erp_database.js)
const REINTENTOS = 8;
const ESPERA_BASE_MS = 3000;

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// Mismo patrón de reintento con backoff que copiar_a_erp_database.js:
// Render puede reiniciar/mantener la DB brevemente, y como todo es
// upsert (ON CONFLICT), reintentar nunca duplica ni corrompe datos.
async function queryConReintento(sql, params, etiqueta) {
  let ultimoError;
  for (let intento = 1; intento <= REINTENTOS; intento++) {
    try {
      return await poolErp.query(sql, params);
    } catch (err) {
      ultimoError = err;
      const espera = Math.min(ESPERA_BASE_MS * 2 ** (intento - 1), 60000);
      console.error(`⚠️  [CIERRE-DIARIO] ${etiqueta}: intento ${intento}/${REINTENTOS} falló (${err.message}). Reintentando en ${Math.round(espera / 1000)}s...`);
      await esperar(espera);
    }
  }
  throw ultimoError;
}

// Columnas que se copian de bitrix_webhook_leads (bddgeneral) hacia
// reportegeneral_d1 (erp_database). created_at/updated_at se renombran
// a lead_created_at/lead_updated_at al insertar (ver COLUMNAS_DESTINO).
const COLUMNAS_ORIGEN = [
  'empresa', 'bitrix_id', 'etapa', 'etapa_bitrix', 'event', 'phone', 'source',
  'city', 'repeated', 'responsible', 'utm_source', 'utm_medium', 'utm_campaign',
  'utm_content', 'utm_term', 'fecha_venta_subida', 'fecha_concretar',
  'modificado_por', 'creado_por', 'creado_por_friendly', 'pipeline',
  'comentario', 'iniciado_el', 'otro_proveedor', 'razon_descarte',
  'innegociable', 'volver_a_llamar', 'documentos_pendientes', 'motivo_atc',
  'id_conversacion', 'raw_query', 'created_at', 'updated_at',
];

const COLUMNAS_DESTINO = [
  ...COLUMNAS_ORIGEN.slice(0, -2), // todas menos created_at/updated_at
  'lead_created_at', 'lead_updated_at',
  'fecha_cierre',
];

const JSONB_COLS = new Set(['raw_query']);

// Fecha "de hoy" en hora Ecuador, formato YYYY-MM-DD (aunque el server
// corra en UTC, como Render). El job corre a las 23:30 hora Ecuador, así
// que "hoy" en Ecuador es siempre el día que se está cerrando.
function fechaCierreHoyEcuador() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Guayaquil' });
}

async function ejecutarCierre(fechaCierreManual) {
  const inicio = Date.now();
  const fechaCierre = fechaCierreManual || fechaCierreHoyEcuador();

  console.log(`[CIERRE-DIARIO] Iniciando cierre del ${fechaCierre}...`);

  let rows;
  try {
    const r = await pool.query(
      `SELECT ${COLUMNAS_ORIGEN.map((c) => `"${c}"`).join(',')} FROM bitrix_webhook_leads`
    );
    rows = r.rows;
  } catch (err) {
    console.error('❌ [CIERRE-DIARIO] Error leyendo bitrix_webhook_leads en bddgeneral:', err.message);
    throw err;
  }

  console.log(`[CIERRE-DIARIO] Leads a cerrar: ${rows.length}`);
  if (!rows.length) {
    console.warn('[CIERRE-DIARIO] No hay leads en bddgeneral, no se genera snapshot.');
    return { fechaCierre, total: 0 };
  }

  let copiadas = 0;
  for (let i = 0; i < rows.length; i += LOTE) {
    const lote = rows.slice(i, i + LOTE);
    const valoresSQL = [];
    const params = [];

    lote.forEach((fila, f) => {
      const placeholders = COLUMNAS_DESTINO.map((col, c) => {
        const n = f * COLUMNAS_DESTINO.length + c + 1;
        return JSONB_COLS.has(col) ? `$${n}::jsonb` : `$${n}`;
      });
      valoresSQL.push(`(${placeholders.join(',')})`);

      COLUMNAS_ORIGEN.forEach((colOrigen) => {
        let v = fila[colOrigen];
        if (JSONB_COLS.has(colOrigen) && v !== null && typeof v !== 'string') v = JSON.stringify(v);
        params.push(v);
      });
      params.push(fechaCierre); // última columna: fecha_cierre
    });

    const sql = `
      INSERT INTO reportegeneral_d1 (${COLUMNAS_DESTINO.map((c) => `"${c}"`).join(',')})
      VALUES ${valoresSQL.join(',')}
      ON CONFLICT (empresa, bitrix_id, fecha_cierre) DO UPDATE SET
        ${COLUMNAS_DESTINO
          .filter((c) => !['empresa', 'bitrix_id', 'fecha_cierre'].includes(c))
          .map((c) => `"${c}" = EXCLUDED."${c}"`)
          .join(',\n        ')},
        snapshot_generado_at = NOW()
    `;

    await queryConReintento(sql, params, `Lote ${i}-${i + lote.length}`);
    copiadas += lote.length;
    process.stdout.write(`\r[CIERRE-DIARIO] Guardadas: ${copiadas}/${rows.length}`);
  }
  console.log('');

  const duracion = Date.now() - inicio;
  console.log(`✅ [CIERRE-DIARIO] Cierre del ${fechaCierre} completo: ${copiadas} leads en ${duracion}ms`);
  return { fechaCierre, total: copiadas, duracionMs: duracion };
}

// Todos los días a las 23:30, hora Ecuador.
const initCierreDiario = () => {
  cron.schedule('30 23 * * *', () => {
    ejecutarCierre().catch((err) => {
      console.error('💥 [CIERRE-DIARIO] Error general:', err.message);
    });
  }, { timezone: 'America/Guayaquil' });
  console.log('[CIERRE-DIARIO] Job programado todos los días a las 23:30 (America/Guayaquil)');
};

module.exports = { initCierreDiario, ejecutarCierre };
