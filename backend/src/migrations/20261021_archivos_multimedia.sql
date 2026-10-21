-- Audios/videos de envios_ventas (Otro 1–4) guardados en PostgreSQL.
-- El backend la crea solo al primer uso; este script es por si el usuario de BD
-- no tiene permiso CREATE. Se puede ejecutar varias veces sin problema.
CREATE TABLE IF NOT EXISTS public.archivos_multimedia (
  id          BIGSERIAL PRIMARY KEY,
  carpeta     VARCHAR(40)  NOT NULL,
  archivo     VARCHAR(200) NOT NULL,
  mime        VARCHAR(80)  NOT NULL,
  bytes       INTEGER      NOT NULL,
  nombre_original VARCHAR(200),
  datos       BYTEA        NOT NULL,
  creado_en   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (carpeta, archivo)
);
