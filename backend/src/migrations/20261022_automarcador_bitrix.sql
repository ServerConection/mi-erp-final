-- Automarcador Bitrix: campañas de marcado continuo por asesor (2026-10-22).
-- El backend las crea solo la primera vez (CREATE TABLE IF NOT EXISTS);
-- este archivo queda como referencia o para correrlo a mano en pgAdmin.
CREATE TABLE IF NOT EXISTS automarcador_bx_campanas (
  id          SERIAL PRIMARY KEY,
  nombre      VARCHAR(160) NOT NULL,
  empresa     VARCHAR(20)  NOT NULL,
  creado_por  INTEGER,
  filtros     JSONB,
  estado      VARCHAR(20)  NOT NULL DEFAULT 'activa',
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS automarcador_bx_items (
  id              SERIAL PRIMARY KEY,
  campana_id      INTEGER NOT NULL REFERENCES automarcador_bx_campanas(id) ON DELETE CASCADE,
  usuario_id      INTEGER NOT NULL,
  telefono        VARCHAR(20) NOT NULL,
  nombre_cliente  VARCHAR(200),
  deal_id         VARCHAR(30),
  estado          VARCHAR(20) NOT NULL DEFAULT 'pendiente',
  intentos        INTEGER NOT NULL DEFAULT 0,
  duracion_seg    INTEGER,
  ultimo_intento  TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_automarcador_bx_items_cola
  ON automarcador_bx_items (usuario_id, estado, id);
