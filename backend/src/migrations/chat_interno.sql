-- ═══════════════════════════════════════════════════════════════════════════════
-- MÓDULO CHAT INTERNO (mensajería estilo Teams)  ·  Migración v1
-- ═══════════════════════════════════════════════════════════════════════════════
-- Base de datos : bddgeneral (Render / PostgreSQL) — la misma que usa el resto
--                 del ERP vía backend/src/config/db.js. NO es erp_database.
-- Esquema       : public
-- Prefijo       : chat_
--
-- CÓMO EJECUTARLO
--   1. Abre bddgeneral en pgAdmin / DBeaver con el usuario admin
--   2. Ejecuta el archivo completo, de una sola vez
--
-- CARACTERÍSTICAS
--   · Idempotente: puedes correrlo varias veces sin romper nada
--   · No borra ni modifica ninguna tabla existente
--   · No toca la tabla `usuarios`: solo la referencia con claves foráneas
--
-- MODELO
--   chat_conversaciones  1 ─── N  chat_participantes
--   chat_conversaciones  1 ─── N  chat_mensajes
--
--   tipo = 'DIRECTA' → siempre 2 participantes (1 a 1)
--   tipo = 'GRUPO'   → 2 o más participantes, con nombre propio
--
-- AISLAMIENTO POR EMPRESA
--   Se resuelve en el backend, no en la base: un usuario normal solo puede
--   armar conversaciones con gente de su misma empresa; ADMINISTRADOR puede
--   cruzar NOVONET/VELSA libremente. Por eso no hay columna `empresa` en
--   estas tablas — la empresa de cada participante ya vive en `usuarios`.
-- ═══════════════════════════════════════════════════════════════════════════════


BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════════
-- BLOQUE 1 · CONVERSACIONES
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.chat_conversaciones (
    id          SERIAL       PRIMARY KEY,
    tipo        VARCHAR(10)  NOT NULL,
    nombre      VARCHAR(150),
    creado_por  INTEGER      NOT NULL REFERENCES public.usuarios(id),
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT chk_chat_conv_tipo   CHECK (tipo IN ('DIRECTA', 'GRUPO')),
    CONSTRAINT chk_chat_conv_nombre CHECK (tipo = 'DIRECTA' OR (nombre IS NOT NULL AND length(trim(nombre)) >= 3))
);

COMMENT ON TABLE  public.chat_conversaciones        IS 'Conversaciones del chat interno: directas (1 a 1) o grupos';
COMMENT ON COLUMN public.chat_conversaciones.nombre IS 'Solo aplica a tipo GRUPO. Las directas se nombran en el frontend con el otro participante.';
COMMENT ON COLUMN public.chat_conversaciones.updated_at IS 'Se actualiza con cada mensaje nuevo — es el orden del sidebar.';

CREATE INDEX IF NOT EXISTS idx_chat_conv_updated ON public.chat_conversaciones (updated_at DESC);


-- ═══════════════════════════════════════════════════════════════════════════════
-- BLOQUE 2 · PARTICIPANTES
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.chat_participantes (
    conversacion_id  INTEGER      NOT NULL REFERENCES public.chat_conversaciones(id) ON DELETE CASCADE,
    usuario_id       INTEGER      NOT NULL REFERENCES public.usuarios(id)            ON DELETE CASCADE,
    ultimo_leido_id  BIGINT,
    activo           BOOLEAN      NOT NULL DEFAULT true,
    unido_en         TIMESTAMPTZ  NOT NULL DEFAULT now(),
    PRIMARY KEY (conversacion_id, usuario_id)
);

COMMENT ON TABLE  public.chat_participantes                  IS 'Quién está en cada conversación';
COMMENT ON COLUMN public.chat_participantes.ultimo_leido_id  IS 'id del último chat_mensajes que este usuario vio. Con esto se calculan los "no leídos" sin tabla de recibos.';
COMMENT ON COLUMN public.chat_participantes.activo           IS 'false = salió del grupo (se conserva para no romper el historial de mensajes ya enviados)';

CREATE INDEX IF NOT EXISTS idx_chat_participantes_usuario ON public.chat_participantes (usuario_id) WHERE activo;


-- ═══════════════════════════════════════════════════════════════════════════════
-- BLOQUE 3 · MENSAJES
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.chat_mensajes (
    id               BIGSERIAL    PRIMARY KEY,
    conversacion_id  INTEGER      NOT NULL REFERENCES public.chat_conversaciones(id) ON DELETE CASCADE,
    usuario_id       INTEGER      NOT NULL REFERENCES public.usuarios(id),
    contenido        TEXT         NOT NULL,
    eliminado        BOOLEAN      NOT NULL DEFAULT false,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT chk_chat_mensajes_contenido CHECK (length(trim(contenido)) BETWEEN 1 AND 4000)
);

COMMENT ON TABLE  public.chat_mensajes           IS 'Mensajes de texto. v1: sin adjuntos.';
COMMENT ON COLUMN public.chat_mensajes.eliminado IS 'Borrado lógico — reservado para cuando se habilite "eliminar mensaje" (fuera de alcance v1)';

CREATE INDEX IF NOT EXISTS idx_chat_mensajes_conversacion ON public.chat_mensajes (conversacion_id, id DESC);


-- ═══════════════════════════════════════════════════════════════════════════════
-- BLOQUE 4 · TRIGGER: mantener chat_conversaciones.updated_at al día
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.chat_touch_conversacion() RETURNS trigger AS $$
BEGIN
    UPDATE public.chat_conversaciones SET updated_at = now() WHERE id = NEW.conversacion_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_chat_touch_conversacion ON public.chat_mensajes;
CREATE TRIGGER trg_chat_touch_conversacion
    AFTER INSERT ON public.chat_mensajes
    FOR EACH ROW EXECUTE FUNCTION public.chat_touch_conversacion();


COMMIT;


-- ═══════════════════════════════════════════════════════════════════════════════
-- VERIFICACIÓN FINAL (opcional, ejecutar después del COMMIT)
-- ═══════════════════════════════════════════════════════════════════════════════
/*
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name LIKE 'chat_%'
ORDER BY table_name;
-- Esperado: chat_conversaciones, chat_mensajes, chat_participantes
*/
