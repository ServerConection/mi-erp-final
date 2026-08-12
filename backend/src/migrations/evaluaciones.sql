-- ═══════════════════════════════════════════════════════════════════════════════
-- MÓDULO EVALUACIONES (capacitación + examen de opción múltiple)  ·  Migración v1
-- ═══════════════════════════════════════════════════════════════════════════════
-- Base de datos : bddgeneral (Render / PostgreSQL) — la misma que usa el resto
--                 del ERP vía backend/src/config/db.js.
-- Esquema       : public
-- Prefijo       : eva_
--
-- CÓMO EJECUTARLO
--   1. Abre bddgeneral en pgAdmin / DBeaver
--   2. Ejecuta el archivo completo, de una sola vez
--
-- CARACTERÍSTICAS
--   · Idempotente: puedes correrlo varias veces sin romper nada
--   · No borra ni modifica ninguna tabla existente
--
-- MODELO (v1 recortado a propósito — ver PLAN conversado)
--   eva_evaluaciones  1 ─── N  eva_intentos
--
--   Las preguntas viven como JSONB dentro de la evaluación (no en tablas
--   normalizadas): más rápido de construir y de sobra para opción múltiple.
--   Formato de cada pregunta:
--     { "id": "p1", "texto": "...", "opciones": ["A","B","C"], "correcta": 1 }
--   El campo "correcta" NUNCA se manda al frontend mientras alguien la está
--   respondiendo — eso lo filtra el backend (ver evaluaciones.controller.js).
--
--   Las respuestas de cada intento también van en JSONB:
--     [{ "preguntaId": "p1", "opcionElegida": 2 }, ...]
--
--   UNIQUE (evaluacion_id, usuario_id) en eva_intentos = un solo intento por
--   persona, tal como se acordó (sin reintentos en v1).
-- ═══════════════════════════════════════════════════════════════════════════════


BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════════
-- BLOQUE 1 · EVALUACIONES
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.eva_evaluaciones (
    id            SERIAL       PRIMARY KEY,
    titulo        VARCHAR(200) NOT NULL,
    modulo_tema   VARCHAR(150),
    empresa       VARCHAR(20),
    nota_minima   SMALLINT     NOT NULL DEFAULT 70,
    preguntas     JSONB        NOT NULL,
    activa        BOOLEAN      NOT NULL DEFAULT true,
    creado_por    INTEGER      NOT NULL REFERENCES public.usuarios(id),
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT chk_eva_nota_minima CHECK (nota_minima BETWEEN 1 AND 100),
    CONSTRAINT chk_eva_empresa     CHECK (empresa IS NULL OR empresa IN ('NOVONET', 'VELSA')),
    CONSTRAINT chk_eva_preguntas   CHECK (jsonb_typeof(preguntas) = 'array' AND jsonb_array_length(preguntas) > 0)
);

COMMENT ON TABLE  public.eva_evaluaciones             IS 'Evaluaciones de capacitación, opción múltiple, autocalificadas';
COMMENT ON COLUMN public.eva_evaluaciones.modulo_tema IS 'Texto libre: a qué módulo/tema del ERP corresponde (ej. "Nueva Venta", "Cobertura")';
COMMENT ON COLUMN public.eva_evaluaciones.empresa     IS 'NULL = aplica a NOVONET y VELSA. Si no, solo a la empresa indicada.';
COMMENT ON COLUMN public.eva_evaluaciones.preguntas   IS 'Array JSON: [{id, texto, opciones:[...], correcta:index}]. "correcta" nunca se expone al responder.';

CREATE INDEX IF NOT EXISTS idx_eva_evaluaciones_activa ON public.eva_evaluaciones (activa, empresa);


-- ═══════════════════════════════════════════════════════════════════════════════
-- BLOQUE 2 · INTENTOS
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.eva_intentos (
    id              SERIAL       PRIMARY KEY,
    evaluacion_id   INTEGER      NOT NULL REFERENCES public.eva_evaluaciones(id) ON DELETE CASCADE,
    usuario_id      INTEGER      NOT NULL REFERENCES public.usuarios(id),
    respuestas      JSONB        NOT NULL,
    total_preguntas SMALLINT     NOT NULL,
    correctas       SMALLINT     NOT NULL,
    nota            SMALLINT     NOT NULL,
    aprobado        BOOLEAN      NOT NULL,
    correo_enviado  BOOLEAN      NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT uq_eva_intentos_un_solo_intento UNIQUE (evaluacion_id, usuario_id),
    CONSTRAINT chk_eva_intentos_nota CHECK (nota BETWEEN 0 AND 100)
);

COMMENT ON TABLE  public.eva_intentos               IS 'Un intento por persona por evaluación (sin reintentos en v1)';
COMMENT ON COLUMN public.eva_intentos.correo_enviado IS 'Si el envío del correo de resultado/certificado falló, queda en false para poder reintentar manualmente.';

CREATE INDEX IF NOT EXISTS idx_eva_intentos_usuario     ON public.eva_intentos (usuario_id);
CREATE INDEX IF NOT EXISTS idx_eva_intentos_evaluacion  ON public.eva_intentos (evaluacion_id);


COMMIT;


-- ═══════════════════════════════════════════════════════════════════════════════
-- VERIFICACIÓN FINAL (opcional, ejecutar después del COMMIT)
-- ═══════════════════════════════════════════════════════════════════════════════
/*
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name LIKE 'eva_%'
ORDER BY table_name;
-- Esperado: eva_evaluaciones, eva_intentos
*/
