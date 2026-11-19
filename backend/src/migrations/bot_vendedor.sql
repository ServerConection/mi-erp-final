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
