// Conexión a Postgres + migraciones idempotentes
const { Pool } = require('pg');

// Usa las mismas variables del ERP (DB_HOST, DB_USER...) del Environment Group "erp-shared".
// DATABASE_URL queda como alternativa para desarrollo local.
const conn = process.env.DB_HOST
  ? { host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME, port: process.env.DB_PORT || 5432 }
  : { connectionString: process.env.DATABASE_URL };
const useSsl = process.env.PGSSL ? process.env.PGSSL === 'true' : !!process.env.DB_HOST;

const pool = new Pool({
  ...conn,
  ssl: useSsl ? { rejectUnauthorized: false } : false,
  max: parseInt(process.env.DB_POOL_MAX || '4', 10), // pool chico: comparte el límite de conexiones con el ERP
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 10000,
  statement_timeout: 30000,
  keepAlive: true,
  // Fechas y horas de los reportes en hora local del negocio
  options: `-c timezone=${process.env.APP_TZ || 'America/Guayaquil'}`,
});

// Igual que en el ERP: un error de conexión idle no tumba el proceso
pool.on('error', err => console.error('[DB] Error en pool:', err.message));

const q = (text, params) => pool.query(text, params);

const DEFAULT_OUTCOMES = [
  { key: 'venta', label: 'Venta cerrada', positive: true },
  { key: 'interesado', label: 'Interesado / seguimiento', positive: true },
  { key: 'volver_llamar', label: 'Volver a llamar', positive: false },
  { key: 'no_interesado', label: 'No interesado', positive: false },
  { key: 'no_contesta', label: 'No contesta', positive: false },
  { key: 'numero_errado', label: 'Número errado', positive: false },
];

async function migrate() {
  await q(`
    CREATE TABLE IF NOT EXISTS calls_accounts (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      waba_id TEXT,
      phone_number_id TEXT NOT NULL UNIQUE,
      display_phone TEXT,
      verified_name TEXT,
      token_enc TEXT NOT NULL,
      app_secret_enc TEXT,
      verify_token TEXT NOT NULL,
      api_version TEXT NOT NULL DEFAULT 'v25.0',
      rate_per_min NUMERIC(10,5) NOT NULL DEFAULT 0.01392,
      currency TEXT NOT NULL DEFAULT 'USD',
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    -- Usuarios del ERP (tabla usuarios) habilitados para llamar y con qué cuenta
    CREATE TABLE IF NOT EXISTS calls_agents (
      usuario_id INT PRIMARY KEY,
      account_id INT REFERENCES calls_accounts(id) ON DELETE SET NULL,
      habilitado BOOLEAN NOT NULL DEFAULT TRUE,
      updated_by INT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS calls_log (
      id SERIAL PRIMARY KEY,
      wa_call_id TEXT UNIQUE,
      account_id INT REFERENCES calls_accounts(id) ON DELETE SET NULL,
      agent_id INT, -- usuarios.id del ERP
      agent_name TEXT,
      direction TEXT NOT NULL CHECK (direction IN ('outbound','inbound')),
      phone TEXT NOT NULL,
      contact_name TEXT,
      external_ref TEXT,
      status TEXT NOT NULL DEFAULT 'initiated',
      started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      connected_at TIMESTAMPTZ,
      ended_at TIMESTAMPTZ,
      duration_sec INT NOT NULL DEFAULT 0,
      pulses INT NOT NULL DEFAULT 0,
      cost NUMERIC(12,5) NOT NULL DEFAULT 0,
      outcome TEXT,
      notes TEXT,
      error TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_calls_log_started ON calls_log(started_at);
    CREATE INDEX IF NOT EXISTS idx_calls_log_agent ON calls_log(agent_id, started_at);
    CREATE INDEX IF NOT EXISTS idx_calls_log_phone ON calls_log(phone);
    CREATE TABLE IF NOT EXISTS calls_events (
      id BIGSERIAL PRIMARY KEY,
      wa_call_id TEXT,
      kind TEXT NOT NULL,
      payload JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_calls_events_call ON calls_events(wa_call_id);
    CREATE TABLE IF NOT EXISTS calls_settings (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL
    );
  `);
  await q(
    `INSERT INTO calls_settings(key, value) VALUES ('outcomes', $1) ON CONFLICT (key) DO NOTHING`,
    [JSON.stringify(DEFAULT_OUTCOMES)]
  );
  await q(
    `INSERT INTO calls_settings(key, value) VALUES ('general', $1) ON CONFLICT (key) DO NOTHING`,
    [JSON.stringify({ timezone: 'America/Guayaquil', permission_text: 'Hola, ¿nos autorizas a llamarte por WhatsApp para atender tu solicitud?' })]
  );
}

async function getSetting(key) {
  const r = await q('SELECT value FROM calls_settings WHERE key=$1', [key]);
  return r.rows[0]?.value ?? null;
}

async function setSetting(key, value) {
  await q(
    `INSERT INTO calls_settings(key, value) VALUES ($1,$2)
     ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value`,
    [key, JSON.stringify(value)]
  );
}

module.exports = { pool, q, migrate, getSetting, setSetting };
