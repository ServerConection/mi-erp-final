/**
 * WinTracker (Vidika) — Sincronización automática de inversión/pauta.
 *
 * Llama GET {WINTRACKER_BASE_URL}/api/v1/netlife.php?agency=...&apikey=...&from=...&to=...
 * y guarda la inversión DIARIA (desglosada, no un total del período) en la
 * misma tabla de "Agencias" de cada empresa (novonet_inversion_redes /
 * velsa_inversion_redes), bajo un origen sintético reservado — ver
 * WINTRACKER_SYNC_SETUP.sql para el porqué de ese diseño.
 *
 * FORMATO REAL DE LA RESPUESTA (confirmado 2026-08-19 con una llamada real a
 * agency=arts, from=2026-08-01, to=2026-08-18):
 *   {
 *     "ok": true,
 *     "agency": "arts",
 *     "kpis": { "inversion": 7666.4, ... }   ← total del período completo, NO se usa para guardar
 *     "consolidado_diario": [
 *       { "fecha": "2026-08-01", "leads": 76, "ventas": 6, "inversion": 293.33, "cpl": 3.86, ... },
 *       ...
 *     ],
 *     "campanas": [...], "canales": [...], "google_ads_insights": {...}, ...
 *   }
 * Lo único que este servicio consume es "consolidado_diario[].fecha" +
 * ".inversion" — el resto del payload (kpis, campañas, canales, Google Ads)
 * no se guarda todavía; si en algún momento se quiere ese detalle, es la
 * misma respuesta, solo falta decidir dónde vive.
 *
 * VENTANA DE RESYNC: cada corrida vuelve a pedir los últimos DIAS_VENTANA
 * días (no solo "hoy"), porque los ad platforms (Meta/Google) a veces
 * ajustan el gasto de un día 1-2 días después de reportarlo la primera vez.
 * Volver a pedir esos días y hacer UPSERT atrapa esos ajustes en vez de
 * dejar el número congelado en el primer valor que llegó.
 *
 * CONFIGURACIÓN (.env):
 *   WINTRACKER_BASE_URL     — https://reportingvidika.online (confirmado).
 *   WINTRACKER_APIKEY_ARTS  — apikey de Arts (recibida 2026-08-20).
 *   WINTRACKER_APIKEY_VELSA — apikey de Velsa (recibida 2026-08-20).
 *   WINTRACKER_APIKEY_VIDIKA — requerida para sincronizar inversión VIDIKA.
 */

const pool = require('../config/db');

const BASE_URL = process.env.WINTRACKER_BASE_URL || 'https://reportingvidika.online';

// Cuántos días hacia atrás se vuelven a pedir en cada corrida (incluye hoy).
const DIAS_VENTANA = 4;

// Cada entrada = una agencia soportada. En VIDIKA se omite agency en la URL
// porque es la agencia por defecto del proveedor.
const AGENCIAS_SOPORTADAS = [
  {
    agency: 'arts',
    apikeyEnv: 'WINTRACKER_APIKEY_ARTS',
    tabla: 'novonet_inversion_redes',
    columnaOrigen: 'origen',
    origenSintetico: '__WINTRACKER_ARTS__',
  },
  {
    agency: 'vidika',
    apikeyEnv: 'WINTRACKER_APIKEY_VIDIKA',
    tabla: 'novonet_inversion_redes',
    columnaOrigen: 'origen',
    origenSintetico: '__WINTRACKER_VIDIKA__',
  },
  {
    agency: 'velsa',
    apikeyEnv: 'WINTRACKER_APIKEY_VELSA',
    tabla: 'velsa_inversion_redes',
    columnaOrigen: 'canal_publicidad',
    origenSintetico: '__WINTRACKER_VELSA__',
  },
];

function crearConfiguracionAgencias(env = process.env) {
  return AGENCIAS_SOPORTADAS
    .filter((cfg) => Boolean(env[cfg.apikeyEnv]?.trim()))
    .map((cfg) => ({ ...cfg, apikey: env[cfg.apikeyEnv].trim() }));
}

function restarDias(fechaISO, dias) {
  const d = new Date(`${fechaISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().split('T')[0];
}

async function fetchInversion({ agency, apikey, from, to, fetchImpl = fetch }) {
  const params = new URLSearchParams({ apikey, from, to });
  if (agency && agency !== 'vidika') params.set('agency', agency);
  params.set('_ts', String(Date.now()));
  const url = `${BASE_URL}/api/v1/netlife.php?${params.toString()}`;
  const signal = typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(15_000) : undefined;

  const resp = await fetchImpl(url, { signal, cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } });
  if (!resp.ok) {
    throw new Error(`WinTracker respondió HTTP ${resp.status} para agency=${agency}`);
  }
  const payload = await resp.json();
  if (payload?.ok !== true) {
    throw new Error(`WinTracker respondió ok=false para agency=${agency}: ${JSON.stringify(payload).slice(0, 300)}`);
  }
  return payload;
}

function diasConRescateKpi(payload, fechaUnica) {
  const dias = Array.isArray(payload?.consolidado_diario) ? [...payload.consolidado_diario] : [];
  const inversionKpi = payload?.kpis?.inversion;
  if (!dias.some((dia) => dia?.fecha === fechaUnica) && fechaUnica && inversionKpi !== undefined && inversionKpi !== null && Number.isFinite(Number(inversionKpi))) {
    dias.push({ fecha: fechaUnica, inversion: Number(inversionKpi) });
  }
  return dias;
}

async function syncAgencia(cfg, { from, to }, { fetchImpl = fetch, db = pool } = {}) {
  const payload = await fetchInversion({ agency: cfg.agency, apikey: cfg.apikey, from, to, fetchImpl });
  let dias = Array.isArray(payload.consolidado_diario) ? [...payload.consolidado_diario] : [];
  if (!dias.some((dia) => dia?.fecha === to)) {
    const payloadHoy = from === to ? payload : await fetchInversion({ agency: cfg.agency, apikey: cfg.apikey, from: to, to, fetchImpl });
    const rescateHoy = diasConRescateKpi(payloadHoy, to).filter((dia) => dia?.fecha === to);
    dias = [...dias.filter((dia) => dia?.fecha !== to), ...rescateHoy];
  }

  if (!dias.length) {
    console.log(`  ⚠️  WinTracker "${cfg.agency}": la respuesta no trajo "consolidado_diario" para ${from}..${to}.`);
    return { agency: cfg.agency, ok: true, guardados: 0, ultimaFecha: null, ultimoMonto: null };
  }

  let guardados = 0;
  let ultimaFecha = null;
  let ultimoMonto = null;
  for (const dia of dias) {
    const fecha = dia?.fecha;
    const monto = Number(dia?.inversion);
    if (!fecha || Number.isNaN(monto)) continue;

    await db.query(
      `INSERT INTO ${cfg.tabla} (fecha, ${cfg.columnaOrigen}, monto_usd, fuente, creado_por, updated_at)
       VALUES ($1, $2, $3, 'wintracker_api', 'wintracker-sync', now())
       ON CONFLICT (fecha, ${cfg.columnaOrigen}) DO UPDATE SET
         monto_usd  = EXCLUDED.monto_usd,
         fuente     = 'wintracker_api',
         updated_at = now()`,
      [fecha, cfg.origenSintetico, monto]
    );
    guardados++;
    if (!ultimaFecha || fecha >= ultimaFecha) {
      ultimaFecha = fecha;
      ultimoMonto = monto;
    }
  }
  console.log(`  ✅ WinTracker "${cfg.agency}": ${guardados} día(s) sincronizados (${from} a ${to}).`);
  return { agency: cfg.agency, ok: true, guardados, ultimaFecha, ultimoMonto };
}
// Sincroniza todas las agencias configuradas para una ventana de fechas (por
// defecto: los últimos DIAS_VENTANA días, incluido hoy). Cada agencia se
// sincroniza de forma independiente — si una falla (ej. key inválida) no
// bloquea a las demás.
function fechaEcuador(now = new Date()) {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Guayaquil',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const valor = (tipo) => partes.find((p) => p.type === tipo)?.value;
  return `${valor('year')}-${valor('month')}-${valor('day')}`;
}

async function syncTodasLasAgencias({ from, to, env = process.env, fetchImpl = fetch, db = pool, now = new Date() } = {}) {
  const hoy = fechaEcuador(now);
  const hastaFinal = to || hoy;
  const desdeFinal = from || restarDias(hastaFinal, DIAS_VENTANA);
  const rango = { from: desdeFinal, to: hastaFinal };
  const configuradas = crearConfiguracionAgencias(env);
  const configuracionPorAgencia = new Map(configuradas.map((cfg) => [cfg.agency, cfg]));

  // Se conserva una fila de resultado por cada agencia soportada. Antes las
  // agencias sin API key desaparecían silenciosamente y el botón podía decir
  // "actualizado" aunque VIDIKA nunca hubiera sido consultada.
  const sincronizaciones = AGENCIAS_SOPORTADAS.map(async (soportada) => {
    const cfg = configuracionPorAgencia.get(soportada.agency);
    if (!cfg) {
      const error = `Falta configurar ${soportada.apikeyEnv} en este servicio.`;
      console.error(`  ⚠️ WinTracker "${soportada.agency}": ${error}`);
      return {
        agency: soportada.agency,
        ok: false,
        guardados: 0,
        configuracionFaltante: true,
        error,
      };
    }

    try {
      return await syncAgencia(cfg, rango, { fetchImpl, db });
    } catch (err) {
      const error = String(err?.message || 'Error desconocido').slice(0, 300);
      console.error(`  💥 Error sincronizando WinTracker ("${cfg.agency}"): `, error);
      return { agency: cfg.agency, ok: false, guardados: 0, error };
    }
  });
  const resultados = await Promise.all(sincronizaciones);

  return {
    from: desdeFinal,
    to: hastaFinal,
    agencias: AGENCIAS_SOPORTADAS.length,
    configuradas: configuradas.length,
    resultados,
  };
}

module.exports = { crearConfiguracionAgencias, fechaEcuador, syncTodasLasAgencias };
