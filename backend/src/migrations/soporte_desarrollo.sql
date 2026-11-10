-- Soporte Desarrollo (mesa de ayuda): incidencias y solicitudes al área de desarrollo.
-- El backend la crea sola al arrancar (CREATE IF NOT EXISTS); este archivo es
-- referencia por si se quiere ejecutar a mano en pgAdmin.
CREATE TABLE IF NOT EXISTS public.sop_tickets (
  id                 SERIAL PRIMARY KEY,
  tipo               VARCHAR(30)  NOT NULL,             -- INCIDENCIA | CREACION_USUARIO | ELIMINACION_USUARIO
  modulo             VARCHAR(80),
  titulo             VARCHAR(150) NOT NULL,
  descripcion        TEXT         NOT NULL,
  datos              JSONB        NOT NULL DEFAULT '{}'::jsonb,
  estado             VARCHAR(20)  NOT NULL DEFAULT 'SIN_ATENDER', -- SIN_ATENDER | EN_PROCESO | ATENDIDO
  creado_por         VARCHAR(100) NOT NULL,
  creado_por_nombre  VARCHAR(200),
  empresa            VARCHAR(50),
  perfil             VARCHAR(50),
  creado_en          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  tomado_por         VARCHAR(100),
  en_proceso_en      TIMESTAMPTZ,
  atendido_por       VARCHAR(100),
  atendido_en        TIMESTAMPTZ,
  respuesta          TEXT,
  visto_por_usuario  BOOLEAN      NOT NULL DEFAULT TRUE,
  actualizado_en     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sop_tickets_estado  ON public.sop_tickets(estado, creado_en);
CREATE INDEX IF NOT EXISTS idx_sop_tickets_creador ON public.sop_tickets(creado_por, creado_en DESC);

CREATE TABLE IF NOT EXISTS public.sop_adjuntos (
  id               SERIAL PRIMARY KEY,
  ticket_id        INTEGER NOT NULL REFERENCES public.sop_tickets(id) ON DELETE CASCADE,
  nombre           VARCHAR(255),
  storage_carpeta  VARCHAR(100) NOT NULL,
  storage_archivo  VARCHAR(255) NOT NULL,
  tipo_mime        VARCHAR(100),
  tamano_bytes     BIGINT,
  creado_en        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sop_adjuntos_ticket ON public.sop_adjuntos(ticket_id);
