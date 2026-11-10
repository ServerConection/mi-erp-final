-- Carpeta Compartida (drive interno): manuales y documentos para todo el ERP.
-- El backend la crea sola al arrancar (CREATE IF NOT EXISTS); este archivo es
-- solo referencia por si se quiere ejecutar a mano en pgAdmin.
CREATE TABLE IF NOT EXISTS public.cc_carpetas (
  id               SERIAL PRIMARY KEY,
  nombre           VARCHAR(150) NOT NULL,
  carpeta_padre_id INTEGER REFERENCES public.cc_carpetas(id) ON DELETE CASCADE,
  creado_por       VARCHAR(100),
  creado_en        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS public.cc_archivos (
  id               SERIAL PRIMARY KEY,
  carpeta_id       INTEGER REFERENCES public.cc_carpetas(id) ON DELETE CASCADE,
  nombre_original  VARCHAR(255) NOT NULL,
  storage_carpeta  VARCHAR(100) NOT NULL,
  storage_archivo  VARCHAR(255) NOT NULL,
  tipo_mime        VARCHAR(100),
  tamano_bytes     BIGINT,
  subido_por       VARCHAR(100),
  fecha_subida     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cc_carpetas_padre ON public.cc_carpetas(carpeta_padre_id);
CREATE INDEX IF NOT EXISTS idx_cc_archivos_carpeta ON public.cc_archivos(carpeta_id);
