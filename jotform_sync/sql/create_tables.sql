-- ============================================================
-- Tablas de sincronizacion Jotform -> Postgres
-- NOVONET  -> public.jotform_submissions
-- VELSA    -> public.jotform_submissions_velsa
-- ============================================================

CREATE TABLE IF NOT EXISTS public.jotform_submissions (
    id               SERIAL PRIMARY KEY,
    submission_id    VARCHAR NOT NULL UNIQUE,
    form_id          VARCHAR NOT NULL,
    data             JSONB NOT NULL,          -- respuestas ya resueltas a texto (no IDs)
    submitted_at     TIMESTAMP WITH TIME ZONE,
    created_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at       TIMESTAMP WITH TIME ZONE,
    created_at_local TEXT
);

CREATE TABLE IF NOT EXISTS public.jotform_submissions_velsa (
    id               SERIAL PRIMARY KEY,
    submission_id    VARCHAR NOT NULL UNIQUE,
    form_id          VARCHAR NOT NULL,
    data             JSONB NOT NULL,
    submitted_at     TIMESTAMP WITH TIME ZONE,
    created_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at       TIMESTAMP WITH TIME ZONE,
    created_at_local TEXT
);

-- ============================================================
-- Trigger: calcula created_at_local (hora Bogota, sin segundos)
-- cada vez que se inserta o actualiza un registro
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_created_at_local()
RETURNS trigger AS $$
BEGIN
  NEW.created_at_local := to_char(NEW.created_at AT TIME ZONE 'America/Bogota', 'YYYY-MM-DD HH24:MI');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_created_at_local ON public.jotform_submissions;
CREATE TRIGGER trg_created_at_local
BEFORE INSERT OR UPDATE ON public.jotform_submissions
FOR EACH ROW EXECUTE FUNCTION public.set_created_at_local();

CREATE OR REPLACE FUNCTION public.set_created_at_local_velsa()
RETURNS trigger AS $$
BEGIN
  NEW.created_at_local := to_char(NEW.created_at AT TIME ZONE 'America/Bogota', 'YYYY-MM-DD HH24:MI');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_created_at_local_velsa ON public.jotform_submissions_velsa;
CREATE TRIGGER trg_created_at_local_velsa
BEFORE INSERT OR UPDATE ON public.jotform_submissions_velsa
FOR EACH ROW EXECUTE FUNCTION public.set_created_at_local_velsa();
