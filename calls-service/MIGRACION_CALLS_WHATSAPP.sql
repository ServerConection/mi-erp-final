-- calls-service: tablas propias (prefijo calls_). Idempotente.
-- El servicio también las crea solo al arrancar; este archivo es para correrlo en pgAdmin si se prefiere.
CREATE TABLE IF NOT EXISTS calls_accounts (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  waba_id TEXT,
  phone_number_id TEXT NOT NULL UNIQUE,
  display_phone TEXT,
  verified_name TEXT,
  token_enc TEXT NOT NULL,          -- cifrado AES-256-GCM con CALLS_ENCRYPTION_KEY
  app_secret_enc TEXT,
  verify_token TEXT NOT NULL,
  api_version TEXT NOT NULL DEFAULT 'v25.0',
  rate_per_min NUMERIC(10,5) NOT NULL DEFAULT 0.01392,
  currency TEXT NOT NULL DEFAULT 'USD',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS calls_agents (
  usuario_id INT PRIMARY KEY,       -- usuarios.id del ERP
  account_id INT REFERENCES calls_accounts(id) ON DELETE SET NULL,
  habilitado BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by INT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS calls_log (
  id SERIAL PRIMARY KEY,
  wa_call_id TEXT UNIQUE,
  account_id INT REFERENCES calls_accounts(id) ON DELETE SET NULL,
  agent_id INT,
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
