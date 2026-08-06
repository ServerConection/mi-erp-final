-- ═══════════════════════════════════════════════════════════════════════════════
-- MÓDULO ARCHIVOS COMPARTIDOS (hojas colaborativas)  ·  Migración v1
-- ═══════════════════════════════════════════════════════════════════════════════
-- Base de datos : erp_database (Render / PostgreSQL)
-- Esquema       : public
-- Prefijo       : hoj_
--
-- CÓMO EJECUTARLO
--   1. Abre erp_database en pgAdmin / DBeaver con el usuario bdd_admin
--   2. Ejecuta primero el BLOQUE 0 (verificación) y revisa el resultado
--   3. Ejecuta el resto del archivo completo, de una sola vez
--
-- CARACTERÍSTICAS
--   · Idempotente: puedes correrlo varias veces sin romper nada
--   · No borra ni modifica ninguna tabla existente
--   · No toca la tabla `usuarios`: solo la referencia con claves foráneas
--   · Todo va envuelto en una transacción: si algo falla, no queda nada a medias
--
-- MODELO
--   hoj_hojas      1 ─── N  hoj_columnas
--   hoj_hojas      1 ─── N  hoj_filas
--   hoj_celdas     = intersección (fila × columna) con su valor
--   hoj_permisos   = quién puede ver/editar cada hoja
--   hoj_historial  = bitácora de todos los cambios
--
--   Guardar cada celda como una fila propia es lo que permite que dos personas
--   escriban a la vez en celdas distintas sin pisarse.
-- ═══════════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════════
-- BLOQUE 0 · VERIFICACIÓN PREVIA  (ejecuta esto SOLO y revisa antes de seguir)
-- ═══════════════════════════════════════════════════════════════════════════════
/*
SELECT current_database() AS base_datos, current_user AS usuario_conectado;

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'usuarios'
ORDER BY ordinal_position;

-- Esperado: tabla `usuarios` con al menos id, usuario, nombres, apellidos,
-- perfil, empresa, activo.
*/


BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════════
-- BLOQUE 1 · HOJAS
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.hoj_hojas (
    id           SERIAL       PRIMARY KEY,
    nombre       VARCHAR(150) NOT NULL,
    descripcion  TEXT,
    empresa      VARCHAR(30),
    color        VARCHAR(7)   NOT NULL DEFAULT '#2563EB',
    creado_por   INTEGER      NOT NULL REFERENCES public.usuarios(id),
    activo       BOOLEAN      NOT NULL DEFAULT true,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.hoj_hojas            IS 'Hojas colaborativas tipo planilla (Archivos Compartidos)';
COMMENT ON COLUMN public.hoj_hojas.empresa    IS 'NOVONET / VELSA / NULL = transversal. Solo informativo.';
COMMENT ON COLUMN public.hoj_hojas.creado_por IS 'Dueño de la hoja: siempre puede editarla y repartir permisos';
COMMENT ON COLUMN public.hoj_hojas.activo     IS 'false = archivada (borrado lógico, nunca se borra físico)';

CREATE INDEX IF NOT EXISTS idx_hoj_hojas_creado_por ON public.hoj_hojas (creado_por) WHERE activo;


-- ═══════════════════════════════════════════════════════════════════════════════
-- BLOQUE 2 · COLUMNAS  (la "estructura" de la hoja)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.hoj_columnas (
    id            SERIAL       PRIMARY KEY,
    hoja_id       INTEGER      NOT NULL REFERENCES public.hoj_hojas(id) ON DELETE CASCADE,
    nombre        VARCHAR(100) NOT NULL,
    tipo          VARCHAR(20)  NOT NULL DEFAULT 'TEXTO',
    opciones      JSONB        NOT NULL DEFAULT '[]'::jsonb,
    orden         INTEGER      NOT NULL DEFAULT 0,
    ancho         INTEGER      NOT NULL DEFAULT 180,
    solo_lectura  BOOLEAN      NOT NULL DEFAULT false,
    activo        BOOLEAN      NOT NULL DEFAULT true,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT chk_hoj_columnas_tipo
        CHECK (tipo IN ('TEXTO', 'LISTA', 'FECHA', 'USUARIO'))
);

COMMENT ON TABLE  public.hoj_columnas          IS 'Definición de columnas de cada hoja';
COMMENT ON COLUMN public.hoj_columnas.tipo     IS 'TEXTO | LISTA (desplegable) | FECHA | USUARIO (asesor del ERP)';
COMMENT ON COLUMN public.hoj_columnas.opciones IS 'Array JSON de opciones cuando tipo = LISTA. Ej: ["Contactado","No contesta"]';
COMMENT ON COLUMN public.hoj_columnas.ancho    IS 'Ancho en píxeles para la grilla del frontend';

CREATE INDEX IF NOT EXISTS idx_hoj_columnas_hoja ON public.hoj_columnas (hoja_id, orden) WHERE activo;


-- ═══════════════════════════════════════════════════════════════════════════════
-- BLOQUE 3 · FILAS
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.hoj_filas (
    id          BIGSERIAL   PRIMARY KEY,
    hoja_id     INTEGER     NOT NULL REFERENCES public.hoj_hojas(id) ON DELETE CASCADE,
    orden       INTEGER     NOT NULL DEFAULT 0,
    creado_por  INTEGER     REFERENCES public.usuarios(id),
    activo      BOOLEAN     NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.hoj_filas        IS 'Filas (registros) de cada hoja';
COMMENT ON COLUMN public.hoj_filas.activo IS 'false = fila eliminada. Nunca se borra físico, para poder auditar.';

CREATE INDEX IF NOT EXISTS idx_hoj_filas_hoja ON public.hoj_filas (hoja_id, orden) WHERE activo;


-- ═══════════════════════════════════════════════════════════════════════════════
-- BLOQUE 4 · CELDAS  (una fila de BD por cada celda escrita)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Solo se guardan las celdas con contenido. Una celda vacía simplemente no
-- existe en esta tabla, así una hoja de 500×10 con pocos datos pesa muy poco.

CREATE TABLE IF NOT EXISTS public.hoj_celdas (
    fila_id         BIGINT      NOT NULL REFERENCES public.hoj_filas(id)    ON DELETE CASCADE,
    columna_id      INTEGER     NOT NULL REFERENCES public.hoj_columnas(id) ON DELETE CASCADE,
    valor           TEXT,
    actualizado_por INTEGER     REFERENCES public.usuarios(id),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (fila_id, columna_id)
);

COMMENT ON TABLE  public.hoj_celdas       IS 'Valor de cada celda. PK compuesta: dos personas en celdas distintas nunca chocan.';
COMMENT ON COLUMN public.hoj_celdas.valor IS 'Siempre texto. FECHA se guarda ISO (YYYY-MM-DD), USUARIO guarda el id del usuario.';

CREATE INDEX IF NOT EXISTS idx_hoj_celdas_columna ON public.hoj_celdas (columna_id);


-- ═══════════════════════════════════════════════════════════════════════════════
-- BLOQUE 5 · PERMISOS  (quién ve y quién edita cada hoja)
-- ═══════════════════════════════════════════════════════════════════════════════
-- El dueño (hoj_hojas.creado_por) y los ADMINISTRADOR no necesitan registro aquí:
-- su acceso se resuelve en código. Esta tabla es para los invitados.

CREATE TABLE IF NOT EXISTS public.hoj_permisos (
    id           SERIAL      PRIMARY KEY,
    hoja_id      INTEGER     NOT NULL REFERENCES public.hoj_hojas(id) ON DELETE CASCADE,
    usuario_id   INTEGER     NOT NULL REFERENCES public.usuarios(id)  ON DELETE CASCADE,
    nivel        VARCHAR(10) NOT NULL DEFAULT 'LECTOR',
    otorgado_por INTEGER     REFERENCES public.usuarios(id),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_hoj_permisos_nivel CHECK (nivel IN ('EDITOR', 'LECTOR')),
    CONSTRAINT uq_hoj_permisos UNIQUE (hoja_id, usuario_id)
);

COMMENT ON TABLE  public.hoj_permisos       IS 'Usuarios invitados a una hoja';
COMMENT ON COLUMN public.hoj_permisos.nivel IS 'EDITOR = puede escribir celdas y agregar filas. LECTOR = solo ver.';

CREATE INDEX IF NOT EXISTS idx_hoj_permisos_usuario ON public.hoj_permisos (usuario_id);


-- ═══════════════════════════════════════════════════════════════════════════════
-- BLOQUE 6 · HISTORIAL  (bitácora de cambios)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.hoj_historial (
    id             BIGSERIAL   PRIMARY KEY,
    hoja_id        INTEGER     NOT NULL REFERENCES public.hoj_hojas(id) ON DELETE CASCADE,
    fila_id        BIGINT,
    columna_id     INTEGER,
    accion         VARCHAR(25) NOT NULL,
    valor_anterior TEXT,
    valor_nuevo    TEXT,
    usuario_id     INTEGER     REFERENCES public.usuarios(id),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_hoj_historial_accion CHECK (accion IN (
        'CELDA_EDITADA', 'FILA_CREADA', 'FILA_ELIMINADA',
        'COLUMNA_CREADA', 'COLUMNA_EDITADA', 'COLUMNA_ELIMINADA',
        'HOJA_CREADA', 'HOJA_EDITADA', 'PERMISO_OTORGADO', 'PERMISO_REVOCADO',
        'IMPORTACION'
    ))
);

COMMENT ON TABLE public.hoj_historial IS 'Bitácora completa: quién cambió qué y cuándo';

-- fila_id / columna_id sin FK a propósito: el historial debe sobrevivir
-- aunque la fila o la columna se eliminen.
CREATE INDEX IF NOT EXISTS idx_hoj_historial_hoja ON public.hoj_historial (hoja_id, created_at DESC);


-- ═══════════════════════════════════════════════════════════════════════════════
-- BLOQUE 7 · TRIGGER: mantener hoj_hojas.updated_at al día
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.hoj_touch_hoja() RETURNS trigger AS $$
BEGIN
    UPDATE public.hoj_hojas SET updated_at = now() WHERE id = NEW.hoja_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_hoj_touch_hoja ON public.hoj_historial;
CREATE TRIGGER trg_hoj_touch_hoja
    AFTER INSERT ON public.hoj_historial
    FOR EACH ROW EXECUTE FUNCTION public.hoj_touch_hoja();


COMMIT;


-- ═══════════════════════════════════════════════════════════════════════════════
-- VERIFICACIÓN FINAL (opcional, ejecutar después del COMMIT)
-- ═══════════════════════════════════════════════════════════════════════════════
/*
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name LIKE 'hoj_%'
ORDER BY table_name;
-- Esperado: hoj_celdas, hoj_columnas, hoj_filas, hoj_historial, hoj_hojas, hoj_permisos
*/
