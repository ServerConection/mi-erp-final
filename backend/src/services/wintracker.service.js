/**
 * WinTracker (Vidika) — Sincronización automática de inversión/pauta.
 *
 * Llama GET {WINTRACKER_BASE_URL}/api/v1/netlife.php?agency=...&apikey=...&from=...&to=...
 * (spec entregada por Vidika, correo 2026-08-18) y guarda el monto invertido
 * de HOY en la misma tabla de "Agencias" de cada empresa (novonet_inversion_redes
 * / velsa_inversion_redes), bajo un origen sintético reservado — ver
 * WINTRACKER_SYNC_SETUP.sql para el porqué de ese diseño.
 *
 * CONFIGURACIÓN (.env):
 *   WINTRACKER_BASE_URL     — Base real del endpoint. Se asumió
 *                              https://reportingvidika.online (mismo dominio
 *                              del iframe de WinTracker ya embebido en el
 *                              ERP) — PENDIENTE CONFIRMAR con quien envió el
 *                              correo, puede vivir en un subdominio distinto.
 *   WINTRACKER_APIKEY_ARTS  — apikey de Arts (recibida 2026-08-20).
 *   WINTRACKER_APIKEY_VELSA — apikey de Velsa (recibida 2026-08-20).
 *   WINTRACKER_APIKEY_VIDIKA — opcional. Sin ella, Vidika NO se sincroniza
 *                              todavía (pendiente que Novonet la entregue).
 *
 * IMPORTANTE — sin documentación real de la respuesta:
 *   El correo del proveedor menciona "las mismas 7 secciones" en la
 *   respuesta pero no detalla su forma exacta. extraerInversionTotal()
 *   intenta varias rutas comunes; si ninguna aplica, lanza error en vez de
 *   guardar un 0 silencioso (preferible fallar visible a inventar un dato).
 *   Con la primera respuesta real hay que ajustar esa función.
 */

const pool = require('../config/db');

const BASE_URL = process.env.WINTRACKER_BASE_URL || 'https://reportingvidika.online';

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

async function fetchInversion({ agency, apikey, from, to }) {
  const params = new URLSearchParams({ apikey, from, to });
  if (agency && agency !== 'vidika') params.set('agency', agency);
  const url = `${BASE_URL}/api/v1/netlife.php?${params.toString()}`;

  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`WinTracker respondió HTTP ${resp.status} para agency=${agency}`);
  }
  return resp.json();
}

// Ver aviso arriba: parser "best effort" hasta tener la respuesta real.
function extraerInversionTotal(payload) {
  const candidatos = [
    payload?.inversion,
    payload?.gasto_total,
    payload?.total_invertido,
    payload?.pauta?.total,
    payload?.data?.inversion,
    payload?.data?.total_invertido,
  ];
  const valor = candidatos.find((v) => typeof v === 'number' && !Number.isNaN(v));
  if (valor === undefined) {
    throw new Error(
      'No se encontró un campo de inversión numérico reconocible en la respuesta de WinTracker. ' +
      'Revisar el JSON real (loguéalo) y ajustar extraerInversionTotal() en wintracker.service.js.'
    );
  }
  return valor;
}

async function syncAgencia(cfg, { from, to }) {
  const apikey = process.env[cfg.apikeyEnv];
  if (!apikey) {
    console.log(`  ⚠️  WinTracker: falta ${cfg.apikeyEnv} en .env — se omite "${cfg.agency}".`);
    return;
  }

  const payload = await fetchInversion({ agency: cfg.agency, apikey, from, to });
  const monto = extraerInversionTotal(payload);

  await pool.query(
    `INSERT INTO ${cfg.tabla} (fecha, ${cfg.columnaOrigen}, monto_usd, fuente, creado_por, updated_at)
     VALUES ($1, $2, $3, 'wintracker_api', 'wintracker-sync', now())
     ON CONFLICT (fecha, ${cfg.columnaOrigen}) DO UPDATE SET
       monto_usd  = EXCLUDED.monto_usd,
       fuente     = 'wintracker_api',
       updated_at = now()`,
    [to, cfg.origenSintetico, monto]
  );
  console.log(`  ✅ WinTracker "${cfg.agency}": $${monto} guardado para ${to}.`);
}

// Sincroniza todas las agencias configuradas para un rango (por defecto: hoy).
// Cada agencia se sincroniza de forma independiente — si una falla (ej. key
// inválida) no bloquea a las demás.
async function syncTodasLasAgencias({ from, to } = {}) {
  const hoy = new Date().toISOString().split('T')[0];
  const rango = { from: from || hoy, to: to || hoy };

  for (const cfg of AGENCIAS) {
    try {
      await syncAgencia(cfg, rango);
    } catch (err) {
      console.error(`  💥 Error sincronizando WinTracker ("${cfg.agency}"):`, err.message);
    }
  }
}

module.exports = { syncTodasLasAgencias };
