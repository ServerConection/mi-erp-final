-- ============================================================
-- Webhook Jotform — tabla de historial (auditoría) de envíos
-- ============================================================
-- La tabla "jotform_submissions" (current, 1 fila por submission_id,
-- UPSERT) ya fue creada a mano en pgAdmin conectado a "erp_database".
-- Esta migración agrega su compañera de historial, siguiendo el MISMO
-- patrón que bitrix_webhook_leads / bitrix_webhook_leads_historial
-- (ver backend/src/db/migrations/bitrix_webhook_leads.sql):
--   - jotform_submissions            → estado ACTUAL, se sobreescribe
--   - jotform_submissions_historial  → 1 fila por CADA webhook recibido,
--                                       nunca se sobreescribe (trazabilidad)
--
-- Ejecutar conectado a "erp_database" (pgAdmin > Query Tool > pegar y F5).
-- ============================================================

-- Por si acaso no se corrió antes (idempotente, no rompe si ya existe):
CREATE TABLE IF NOT EXISTS jotform_submissions (
    id             SERIAL PRIMARY KEY,
    submission_id  VARCHAR(50) UNIQUE NOT NULL,
    form_id        VARCHAR(50) NOT NULL,
    data           JSONB NOT NULL,
    submitted_at   TIMESTAMPTZ,
    created_at     TIMESTAMPTZ DEFAULT now(),
    updated_at     TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_jotform_submissions_form_id ON jotform_submissions(form_id);

-- Historial: nunca se actualiza, solo se inserta
CREATE TABLE IF NOT EXISTS jotform_submissions_historial (
    id             SERIAL PRIMARY KEY,
    submission_id  VARCHAR(50) NOT NULL,
    form_id        VARCHAR(50) NOT NULL,
    data           JSONB NOT NULL,
    created_at     TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_jotform_submissions_historial_submission_id ON jotform_submissions_historial(submission_id);
