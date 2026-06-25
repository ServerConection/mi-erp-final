-- ================================================================
-- EJECUTA ESTO EN SUPABASE → SQL Editor
-- "Drive" compartido del módulo Talento Humano (TTHH): carpetas libres
-- (como Google Drive) donde TTHH y ADMINISTRADOR pueden subir, ver y
-- descargar archivos entre ellos. Los binarios viven en el servidor de
-- almacenamiento local (storageClient); aquí solo se guarda la
-- estructura de carpetas y los metadatos de cada archivo.
-- ================================================================

CREATE TABLE IF NOT EXISTS public.tthh_drive_carpetas (
  id                SERIAL PRIMARY KEY,
  nombre            TEXT NOT NULL,
  carpeta_padre_id  INTEGER REFERENCES public.tthh_drive_carpetas(id) ON DELETE CASCADE,
  creado_por        TEXT,
  creado_en         TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tthh_drive_carpetas_padre ON public.tthh_drive_carpetas (carpeta_padre_id);

CREATE TABLE IF NOT EXISTS public.tthh_drive_archivos (
  id                SERIAL PRIMARY KEY,
  carpeta_id        INTEGER REFERENCES public.tthh_drive_carpetas(id) ON DELETE CASCADE,
  nombre_original   TEXT NOT NULL,
  archivo_url       TEXT NOT NULL,     -- ruta interna: /api/tthh/archivo/drive/<archivo-en-disco>
  tipo_mime         TEXT,
  tamano_bytes      INTEGER,
  subido_por        TEXT NOT NULL,
  fecha_subida      TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tthh_drive_archivos_carpeta ON public.tthh_drive_archivos (carpeta_id);
