-- Bot Vendedor IA: prompt, reglas y base de conocimiento editables desde el ERP.
-- El backend crea las tablas solo al arrancar (CREATE IF NOT EXISTS); este
-- archivo es solo referencia por si se quiere ejecutar a mano en pgAdmin.
CREATE TABLE IF NOT EXISTS public.bv_config (
  clave           VARCHAR(50) PRIMARY KEY,
  valor           TEXT NOT NULL DEFAULT '',
  actualizado_por VARCHAR(100),
  actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Documentos de conocimiento. "siempre_incluir" = se envia completo en cada
-- respuesta (catalogos cortos, reglas); el resto se busca por palabras clave.
-- No se borran: se archivan con activo = FALSE.
CREATE TABLE IF NOT EXISTS public.bv_conocimiento (
  id              SERIAL PRIMARY KEY,
  nombre          VARCHAR(255) NOT NULL,
  origen          VARCHAR(20)  NOT NULL DEFAULT 'texto',  -- 'archivo' | 'texto'
  contenido       TEXT NOT NULL DEFAULT '',
  siempre_incluir BOOLEAN NOT NULL DEFAULT FALSE,
  activo          BOOLEAN NOT NULL DEFAULT TRUE,
  creado_por      VARCHAR(100),
  creado_en       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bv_conocimiento_activo ON public.bv_conocimiento(activo);

-- Lineas de WABOT donde responde el bot vendedor (las elige el administrador).
CREATE TABLE IF NOT EXISTS public.bv_lineas (
  line_id         UUID PRIMARY KEY,
  activo          BOOLEAN NOT NULL DEFAULT FALSE,
  actualizado_por VARCHAR(100),
  actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Planes con imagen: el bot envia la imagen del plan cuando lo recomienda.
CREATE TABLE IF NOT EXISTS public.bv_planes (
  id              SERIAL PRIMARY KEY,
  nombre          VARCHAR(150) NOT NULL,          -- nombre tal como esta en la guia comercial
  velocidad_mbps  INTEGER,
  segmento        VARCHAR(50) NOT NULL DEFAULT 'HOME',
  descripcion     VARCHAR(500),                   -- resumen corto (precio, equipo) para el bot
  imagen          BYTEA,
  imagen_mime     VARCHAR(50),
  activo          BOOLEAN NOT NULL DEFAULT TRUE,
  orden           INTEGER NOT NULL DEFAULT 0,
  actualizado_por VARCHAR(100),
  actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Horario por linea (HH:MM, hora Ecuador). Vacio = todo el dia. Si inicio > fin, cruza medianoche (22:30 -> 07:00).
ALTER TABLE public.bv_lineas ADD COLUMN IF NOT EXISTS horario_inicio VARCHAR(5);
ALTER TABLE public.bv_lineas ADD COLUMN IF NOT EXISTS horario_fin    VARCHAR(5);

-- Atencion nocturna: deals nuevos de NOVONET a los que el bot les escribe primero.
-- grupo BOT = el bot le escribio; CONTROL = se deja para el asesor (prueba A/B).
CREATE TABLE IF NOT EXISTS public.bv_nocturno (
  bitrix_id    VARCHAR(30) PRIMARY KEY,
  empresa      VARCHAR(20) NOT NULL DEFAULT 'novonet',
  telefono     VARCHAR(30),
  grupo        VARCHAR(10) NOT NULL,              -- 'BOT' | 'CONTROL'
  line_id      UUID,
  estado       VARCHAR(20) NOT NULL DEFAULT 'pendiente', -- pendiente | enviado | error | control
  detalle      TEXT,
  deal_creado  TIMESTAMPTZ,
  creado_en    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  enviado_en   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_bv_nocturno_creado ON public.bv_nocturno(creado_en);

-- Carrera bot vs asesor: momento en que el cliente confirmo la venta con el bot.
ALTER TABLE public.bv_nocturno ADD COLUMN IF NOT EXISTS bot_venta_en TIMESTAMPTZ;

-- Etapa de Bitrix recomendada por la IA para cada conversacion que atendio el bot.
CREATE TABLE IF NOT EXISTS public.bv_clasificacion (
  conversation_id UUID PRIMARY KEY,
  etapa           VARCHAR(80) NOT NULL,
  motivo          TEXT,
  modelo          VARCHAR(80),
  creado_en       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
