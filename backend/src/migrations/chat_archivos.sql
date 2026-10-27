BEGIN;

CREATE TABLE IF NOT EXISTS public.chat_archivos (
    id              BIGSERIAL PRIMARY KEY,
    mensaje_id      INTEGER NOT NULL UNIQUE REFERENCES public.chat_mensajes(id) ON DELETE CASCADE,
    nombre_original VARCHAR(255) NOT NULL,
    mime_type       VARCHAR(150) NOT NULL DEFAULT 'application/octet-stream',
    tamano_bytes    INTEGER NOT NULL CHECK (tamano_bytes > 0 AND tamano_bytes <= 26214400),
    datos           BYTEA NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_archivos_mensaje
    ON public.chat_archivos (mensaje_id);

COMMENT ON TABLE public.chat_archivos IS
    'Adjuntos privados del chat interno; descarga restringida a participantes activos.';

COMMIT;
