-- ================================================================
-- EJECUTA ESTO EN SUPABASE → SQL Editor
-- Módulo TALENTO HUMANO (TTHH): productividad de asesores (basada en
-- los datos de auditoría de Backoffice), documentos de control
-- (por asesor y generales), y una "tabla compartida" tipo Excel
-- (mini hoja de cálculo en SQL) de acceso exclusivo para perfil TTHH.
-- ================================================================

-- ─── Documentos de control (por asesor y generales del área) ─────────────────
CREATE TABLE IF NOT EXISTS public.tthh_documentos (
  id              SERIAL PRIMARY KEY,
  tipo            TEXT NOT NULL CHECK (tipo IN ('ASESOR','GENERAL')),
  empresa         TEXT,                 -- 'NOVONET' | 'VELSA' | NULL (aplica a ambas)
  codigo_asesor   TEXT,                 -- solo cuando tipo = 'ASESOR'
  nombre_asesor   TEXT,
  categoria       TEXT,                 -- ej: CONTRATO, LLAMADO_ATENCION, EVALUACION, POLITICA, MANUAL
  titulo          TEXT NOT NULL,
  descripcion     TEXT,
  archivo_url     TEXT NOT NULL,
  subido_por      TEXT NOT NULL,
  fecha_subida    TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tthh_documentos_tipo     ON public.tthh_documentos (tipo);
CREATE INDEX IF NOT EXISTS idx_tthh_documentos_asesor   ON public.tthh_documentos (codigo_asesor);

-- ─── Metas de productividad (configurables por TTHH) ──────────────────────────
-- codigo_asesor = NULL  →  meta por defecto para toda la empresa.
CREATE TABLE IF NOT EXISTS public.tthh_metas (
  id              SERIAL PRIMARY KEY,
  empresa         TEXT NOT NULL CHECK (empresa IN ('NOVONET','VELSA')),
  codigo_asesor   TEXT,
  meta_mensual    INTEGER NOT NULL DEFAULT 10,
  actualizado_por TEXT,
  actualizado_en  TIMESTAMP DEFAULT NOW(),
  UNIQUE (empresa, codigo_asesor)
);

-- ─── Tabla compartida tipo "Excel" (solo perfil TTHH) ─────────────────────────
-- Columnas dinámicas definidas por TTHH; cada fila guarda sus valores en JSONB
-- usando como llave el id de la columna (como texto).
CREATE TABLE IF NOT EXISTS public.tthh_tabla_columnas (
  id          SERIAL PRIMARY KEY,
  nombre      TEXT NOT NULL,
  orden       INTEGER NOT NULL DEFAULT 0,
  ancho       INTEGER DEFAULT 160,
  creado_en   TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.tthh_tabla_filas (
  id              SERIAL PRIMARY KEY,
  datos           JSONB NOT NULL DEFAULT '{}'::jsonb,
  orden           INTEGER NOT NULL DEFAULT 0,
  creado_por      TEXT,
  actualizado_por TEXT,
  creado_en       TIMESTAMP DEFAULT NOW(),
  actualizado_en  TIMESTAMP DEFAULT NOW()
);

-- Columnas iniciales sugeridas (solo se crean si la tabla está vacía)
INSERT INTO public.tthh_tabla_columnas (nombre, orden)
SELECT * FROM (VALUES
  ('Asesor', 1),
  ('Empresa', 2),
  ('Observación', 3),
  ('Estado', 4)
) AS v(nombre, orden)
WHERE NOT EXISTS (SELECT 1 FROM public.tthh_tabla_columnas);
