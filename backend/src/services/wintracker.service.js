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
 *   WINTRACKER_APIKEY_VIDIKA — opcional. Sin ella, Vidika NO se sincroniza
 *                              todavía (pendiente que Novonet la entregue).
 */

const pool = require('../config/db');

const BASE_URL = process.env.WINTRACKER_BASE_URL || 'https://reportingvidika.online';

// Cuántos días hacia atrás se vuelven a pedir en cada corrida (incluye hoy).
const DIAS_VENTANA = 4;

// Cada entrada = una agencia sincronizable. Agregar 'vidika' aquí cuando
// llegue su apikey (agency se omite en la URL para Vidika, es el default
// del proveedor — ver correo original).
const AGENCIAS = [
  {
    agency: 'arts',
    apikeyEnv: 'WINTRACKER_APIKEY_ARTS',
    tabla: 'novonet_inversion_redes',
    columnaOrigen: 'origen',
    origenSintetico: '__WINTRACKER_ARTS__',
  },
  {
    agency: 'velsa',
    apikeyEnv: 'WINTRACKER_APIKEY_VELSA',
    tabla: 'velsa_inversion_redes',
    columnaOrigen: 'canal_publicidad',
    origenSintetico: '__WINTRACKER_VELSA__',
  },
  // { agency: 'vidika', apikeyEnv: 'WINTRACKER_APIKEY_VIDIKA', tabla: 'novonet_inversion_redes', columnaOrigen: 'origen', origenSintetico: '__WINTRACKER_VIDIKA__' },
];

function restarDias(fechaISO, dias) {
  const d = new Date(`${fechaISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().split('T')[0];
}

async function fetchInversion({ agency, apikey, from, to }) {
  const params = new URLSearchParams({ apikey, from, to });
  if (agency && agency !== 'vidika') params.set('agency', agency);
  const url = `${BASE_URL}/api/v1/netlife.php?${params.toString()}`;

  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`WinTracker respondió HTTP ${resp.status} para agency=${agency}`);
  }
  const payload = await resp.json();
  if (payload?.ok !== true) {
    throw new Error(`WinTracker respondió ok=false para agency=${agency}: ${JSON.stringify(payload).slice(0, 300)}`);
  }
  return payload;
}

async function syncAgencia(cfg, { from, to }) {
  const apikey = process.env[cfg.apikeyEnv];
  if (!apikey) {
    console.log(`  ⚠️  WinTracker: falta ${cfg.apikeyEnv} en .env — se omite "${cfg.agency}".`);
    return;
  }

  const payload = await fetchInversion({ agency: cfg.agency, apikey, from, to });
  const dias = Array.isArray(payload.consolidado_diario) ? payload.consolidado_diario : [];

  if (!dias.length) {
    console.log(`  ⚠️  WinTracker "${cfg.agency}": la respuesta no trajo "consolidado_diario" para ${from}..${to}.`);
    return;
  }

  let guardados = 0;
  for (const dia of dias) {
    const fecha = dia?.fecha;
    const monto = Number(dia?.inversion);
    if (!fecha || Number.isNaN(monto)) continue;

    await pool.query(
      `INSERT INTO ${cfg.tabla} (fecha, ${cfg.columnaOrigen}, monto_usd, fuente, creado_por, updated_at)
       VALUES ($1, $2, $3, 'wintracker_api', 'wintracker-sync', now())
       ON CONFLICT (fecha, ${cfg.columnaOrigen}) DO UPDATE SET
         monto_usd  = EXCLUDED.monto_usd,
         fuente     = 'wintracker_api',
         updated_at = now()`,
      [fecha, cfg.origenSintetico, monto]
    );
    guardados++;
  }
  console.log(`  ✅ WinTracker "${cfg.agency}": ${guardados} día(s) sincronizados (${from} a ${to}).`);
}

// Sincroniza todas las agencias configuradas para una ventana de fechas (por
// defecto: los últimos DIAS_VENTANA días, incluido hoy). Cada agencia se
// sincroniza de forma independiente — si una falla (ej. key inválida) no
// bloquea a las demás.
async function syncTodasLasAgencias({ from, to } = {}) {
  const hoy = new Date().toISOString().split('T')[0];
  const hastaFinal  = to || hoy;
  const desdeFinal  = from || restarDias(hastaFinal, DIAS_VENTANA);
  const rango = { from: desdeFinal, to: hastaFinal };

  for (const cfg of AGENCIAS) {
    try {
      await syncAgencia(cfg, rango);
    } catch (err) {
      console.error(`  💥 Error sincronizando WinTracker ("${cfg.agency}"):`, err.message);
    }
  }
}

module.exports = { syncTodasLasAgencias };
