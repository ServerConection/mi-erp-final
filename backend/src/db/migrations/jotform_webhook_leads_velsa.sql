-- ============================================================
-- Webhook Jotform — VELSA (formulario 251603619851660)
-- Mismo patrón que jotform_submissions / jotform_submissions_historial
-- (NOVONET), pero en tablas separadas porque son formularios distintos
-- con preguntas distintas — así la vista "ancha" de cada uno no se mezcla.
--
-- Ejecutar conectado a "erp_database" (pgAdmin > Query Tool > F5).
-- ============================================================

CREATE TABLE IF NOT EXISTS jotform_submissions_velsa (
    id             SERIAL PRIMARY KEY,
    submission_id  VARCHAR(50) UNIQUE NOT NULL,
    form_id        VARCHAR(50) NOT NULL,
    data           JSONB NOT NULL,
    submitted_at   TIMESTAMPTZ,
    created_at     TIMESTAMPTZ DEFAULT now(),
    updated_at     TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_jotform_submissions_velsa_form_id ON jotform_submissions_velsa(form_id);

CREATE TABLE IF NOT EXISTS jotform_submissions_velsa_historial (
    id             SERIAL PRIMARY KEY,
    submission_id  VARCHAR(50) NOT NULL,
    form_id        VARCHAR(50) NOT NULL,
    data           JSONB NOT NULL,
    created_at     TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_jotform_submissions_velsa_historial_submission_id ON jotform_submissions_velsa_historial(submission_id);
