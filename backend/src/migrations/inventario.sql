-- ════════════════════════════════════════════════════════════════════════════
-- MÓDULO DE INVENTARIO
-- Ejecutar en la base de datos de producción (Render / pgAdmin / psql)
-- ════════════════════════════════════════════════════════════════════════════

-- 1. Categorías de equipos
CREATE TABLE IF NOT EXISTS public.inv_categorias (
  id          SERIAL PRIMARY KEY,
  nombre      VARCHAR(100) NOT NULL,
  descripcion TEXT,
  color       VARCHAR(20)  DEFAULT '#6366f1',
  icono       VARCHAR(10)  DEFAULT '📦',
  activo      BOOLEAN      DEFAULT TRUE,
  created_at  TIMESTAMPTZ  DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  DEFAULT NOW()
);

-- 2. Equipos / materiales / planos  ← tabla principal
CREATE TABLE IF NOT EXISTS public.equipos (
  id              SERIAL PRIMARY KEY,
  codigo          VARCHAR(50),
  nombre          VARCHAR(200) NOT NULL,
  descripcion     TEXT,
  unidad          VARCHAR(30)   DEFAULT 'unidad',
  stock_actual    NUMERIC(12,2) DEFAULT 0,
  stock_minimo    NUMERIC(12,2) DEFAULT 0,
  precio_unitario NUMERIC(12,2) DEFAULT 0,
  ubicacion       VARCHAR(100),
  activo          BOOLEAN       DEFAULT TRUE,
  categoria_id    INTEGER REFERENCES public.inv_categorias(id),
  created_at      TIMESTAMPTZ   DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS equipos_codigo_uq
  ON public.equipos(codigo) WHERE codigo IS NOT NULL;

-- 3. Movimientos de stock (entradas, salidas, ajustes)
CREATE TABLE IF NOT EXISTS public.equipos_movimientos (
  id          SERIAL PRIMARY KEY,
  equipo_id   INTEGER NOT NULL REFERENCES public.equipos(id),
  tipo        VARCHAR(10) NOT NULL CHECK (tipo IN ('ENTRADA','SALIDA','AJUSTE')),
  cantidad    NUMERIC(12,2) NOT NULL,
  motivo      TEXT,
  referencia  VARCHAR(100),
  usuario_id  INTEGER REFERENCES public.usuarios(id),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS equipos_mov_equipo_idx
  ON public.equipos_movimientos(equipo_id);

CREATE INDEX IF NOT EXISTS equipos_mov_created_idx
  ON public.equipos_movimientos(created_at DESC);

-- ════════════════════════════════════════════════════════════════════════════
-- Categorías iniciales de ejemplo (puedes editarlas o borrarlas)
-- ════════════════════════════════════════════════════════════════════════════
INSERT INTO public.inv_categorias (nombre, descripcion, color, icono) VALUES
  ('Equipos de red', 'ONTs, routers, switches',        '#3b82f6', '🖥️'),
  ('Cables',         'Fibra óptica, coaxial, UTP',     '#10b981', '🔌'),
  ('Accesorios',     'Conectores, splitters',           '#f59e0b', '🔧'),
  ('Planos',         'Documentos, mapas y planos',      '#8b5cf6', '📋'),
  ('Herramientas',   'Herramientas de instalación',     '#ef4444', '🛠️')
ON CONFLICT DO NOTHING;
