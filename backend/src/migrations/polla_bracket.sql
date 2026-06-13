-- =============================================================================
-- POLLA MUNDIALISTA 2026 — Persistencia del bracket (diagrama de flujo)
-- Guarda, por usuario, la asignación de los 8 mejores terceros a los slots del
-- bracket y el ganador elegido en cada partido de eliminatorias (73-104).
-- El scoring sigue usando polla_pred_fases (se deriva del bracket al guardar).
-- Ejecutar: psql $DATABASE_URL -f backend/src/migrations/polla_bracket.sql
-- No toca tablas existentes.
-- =============================================================================

CREATE TABLE IF NOT EXISTS polla_pred_bracket (
  usuario_id INT         PRIMARY KEY,
  data       JSONB       NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT now()
);
