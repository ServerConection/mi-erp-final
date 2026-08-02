-- ═══════════════════════════════════════════════════════════════════════════════
-- MÓDULO DE TAREAS Y ACUERDOS  ·  Migración v1
-- ═══════════════════════════════════════════════════════════════════════════════
-- Base de datos : erp_database (Render / PostgreSQL)
-- Esquema       : public
-- Fecha         : 2026-08-01
--
-- CÓMO EJECUTARLO
--   1. Abre erp_database en pgAdmin / DBeaver con el usuario bdd_admin
--   2. Ejecuta primero el BLOQUE 0 (verificación) y revisa el resultado
--   3. Ejecuta el resto del archivo completo, de una sola vez
--
-- CARACTERÍSTICAS
--   · Idempotente: puedes correrlo varias veces sin romper nada
--   · No borra ni modifica ninguna tabla existente
--   · Sobre `usuarios` solo AGREGA dos columnas (area_id, cargo_id).
--     La columna `cargo` de texto libre NO se toca.
--   · Todo va envuelto en una transacción: si algo falla, no queda nada a medias
-- ═══════════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════════
-- BLOQUE 0 · VERIFICACIÓN PREVIA  (ejecuta esto SOLO y revisa antes de seguir)
-- ═══════════════════════════════════════════════════════════════════════════════
/*
SELECT current_database() AS base_datos, current_user AS usuario_conectado;

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'usuarios'
ORDER BY ordinal_position;

-- Esperado: que exista la tabla `usuarios` con las columnas
-- id, usuario, nombres, apellidos, correo, cargo, perfil, empresa, activo
--
-- NOTA: si `usuarios.id` es bigint en vez de integer, el script funciona igual.
-- PostgreSQL permite claves foráneas entre integer y bigint.
*/


BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════════
-- BLOQUE 1 · CATÁLOGOS: ÁREAS Y CARGOS
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.tar_areas (
    id          SERIAL PRIMARY KEY,
    codigo      VARCHAR(50)  NOT NULL UNIQUE,
    nombre      VARCHAR(100) NOT NULL,
    color       VARCHAR(7)   NOT NULL DEFAULT '#6B7280',
    orden       INTEGER      NOT NULL DEFAULT 0,
    activo      BOOLEAN      NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.tar_areas          IS 'Áreas/departamentos de la organización';
COMMENT ON COLUMN public.tar_areas.color    IS 'Color hex para los badges en la interfaz';


CREATE TABLE IF NOT EXISTS public.tar_cargos (
    id           SERIAL PRIMARY KEY,
    codigo       VARCHAR(50)  NOT NULL UNIQUE,
    nombre       VARCHAR(100) NOT NULL,
    nivel        SMALLINT     NOT NULL DEFAULT 5,
    es_jefatura  BOOLEAN      NOT NULL DEFAULT false,
    activo       BOOLEAN      NOT NULL DEFAULT true,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.tar_cargos             IS 'Cargos/puestos, independientes del área';
COMMENT ON COLUMN public.tar_cargos.nivel       IS '1 = más alto en la jerarquía';
COMMENT ON COLUMN public.tar_cargos.es_jefatura IS 'true = ve todas las tareas de su área';


-- ── Seed de ÁREAS ──────────────────────────────────────────────────────────────
-- Si necesitas Comercial como área separada de Gerencia Comercial,
-- descomenta la última línea antes de ejecutar.
INSERT INTO public.tar_areas (codigo, nombre, color, orden) VALUES
    ('GERENCIA_GENERAL',   'Gerencia General',    '#1E293B',  1),
    ('GERENCIA_COMERCIAL', 'Gerencia Comercial',  '#2563EB',  2),
    ('GERENCIA_FINANCIERA','Gerencia Financiera', '#059669',  3),
    ('CONTABILIDAD',       'Contabilidad',        '#0891B2',  4),
    ('BACKOFFICE',         'Backoffice',          '#7C3AED',  5),
    ('CALIDAD',            'Calidad',             '#DB2777',  6),
    ('TTHH',               'Talento Humano',      '#EA580C',  7),
    ('DESARROLLO',         'Desarrollo',          '#0D9488',  8)
    -- ,('COMERCIAL',      'Comercial',           '#3B82F6',  9)
ON CONFLICT (codigo) DO NOTHING;


-- ── Seed de CARGOS ─────────────────────────────────────────────────────────────
INSERT INTO public.tar_cargos (codigo, nombre, nivel, es_jefatura) VALUES
    ('GERENTE',     'Gerente',     1, true),
    ('SUPERVISOR',  'Supervisor',  2, true),
    ('COORDINADOR', 'Coordinador', 2, true),
    ('ANALISTA',    'Analista',    3, false),
    ('ASISTENTE',   'Asistente',   4, false),
    ('ASESOR',      'Asesor',      4, false)
ON CONFLICT (codigo) DO NOTHING;


-- ═══════════════════════════════════════════════════════════════════════════════
-- BLOQUE 2 · EXTENDER `usuarios`  (aditivo, no destructivo)
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.usuarios
    ADD COLUMN IF NOT EXISTS area_id  INTEGER REFERENCES public.tar_areas(id)  ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS cargo_id INTEGER REFERENCES public.tar_cargos(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.usuarios.area_id  IS 'FK tar_areas · usado por el módulo de tareas';
COMMENT ON COLUMN public.usuarios.cargo_id IS 'FK tar_cargos · usado por el módulo de tareas. La columna `cargo` de texto libre se conserva intacta';

CREATE INDEX IF NOT EXISTS idx_usuarios_area  ON public.usuarios (area_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_cargo ON public.usuarios (cargo_id);


-- ═══════════════════════════════════════════════════════════════════════════════
-- BLOQUE 3 · PROYECTOS
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.tar_proyectos (
    id           SERIAL PRIMARY KEY,
    nombre       VARCHAR(200) NOT NULL,
    descripcion  TEXT,
    empresa      VARCHAR(20)  NOT NULL,
    area_id      INTEGER      REFERENCES public.tar_areas(id) ON DELETE SET NULL,
    color        VARCHAR(7)   NOT NULL DEFAULT '#6B7280',
    estado       VARCHAR(20)  NOT NULL DEFAULT 'ACTIVO',
    creado_por   INTEGER      REFERENCES public.usuarios(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT chk_tar_proyectos_estado  CHECK (estado  IN ('ACTIVO','ARCHIVADO')),
    CONSTRAINT chk_tar_proyectos_empresa CHECK (empresa IN ('NOVONET','VELSA'))
);

COMMENT ON TABLE public.tar_proyectos IS 'Agrupador opcional de tareas. Una tarea puede no tener proyecto';

CREATE INDEX IF NOT EXISTS idx_tar_proyectos_empresa ON public.tar_proyectos (empresa, estado);
CREATE INDEX IF NOT EXISTS idx_tar_proyectos_area    ON public.tar_proyectos (area_id);


-- ═══════════════════════════════════════════════════════════════════════════════
-- BLOQUE 4 · TAREAS  (tabla central)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.tar_tareas (
    id                   SERIAL PRIMARY KEY,
    codigo               VARCHAR(20)  UNIQUE,

    tipo                 VARCHAR(20)  NOT NULL DEFAULT 'TAREA',
    proyecto_id          INTEGER      REFERENCES public.tar_proyectos(id) ON DELETE SET NULL,
    tarea_padre_id       INTEGER      REFERENCES public.tar_tareas(id)    ON DELETE CASCADE,

    titulo               VARCHAR(300) NOT NULL,
    descripcion          TEXT,
    empresa              VARCHAR(20)  NOT NULL,

    solicitante_id       INTEGER      NOT NULL REFERENCES public.usuarios(id)  ON DELETE RESTRICT,
    responsable_id       INTEGER      NOT NULL REFERENCES public.usuarios(id)  ON DELETE RESTRICT,
    area_responsable_id  INTEGER      REFERENCES public.tar_areas(id)          ON DELETE SET NULL,

    estado               VARCHAR(20)  NOT NULL DEFAULT 'PENDIENTE',
    prioridad            VARCHAR(20)  NOT NULL DEFAULT 'MEDIA',

    fecha_solicitud      DATE         NOT NULL DEFAULT CURRENT_DATE,
    fecha_inicio         DATE,
    fecha_limite         DATE         NOT NULL,
    fecha_completada     TIMESTAMPTZ,

    progreso             SMALLINT     NOT NULL DEFAULT 0,
    orden                INTEGER      NOT NULL DEFAULT 0,

    creado_por           INTEGER      REFERENCES public.usuarios(id) ON DELETE SET NULL,
    actualizado_por      INTEGER      REFERENCES public.usuarios(id) ON DELETE SET NULL,
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT chk_tar_tareas_tipo      CHECK (tipo   IN ('TAREA','ACUERDO','SOLICITUD')),
    CONSTRAINT chk_tar_tareas_estado    CHECK (estado IN ('PENDIENTE','EN_PROCESO','EN_REVISION','COMPLETADA','CANCELADA')),
    CONSTRAINT chk_tar_tareas_prioridad CHECK (prioridad IN ('BAJA','MEDIA','ALTA','URGENTE')),
    CONSTRAINT chk_tar_tareas_empresa   CHECK (empresa IN ('NOVONET','VELSA')),
    CONSTRAINT chk_tar_tareas_progreso  CHECK (progreso BETWEEN 0 AND 100),
    CONSTRAINT chk_tar_tareas_fechas    CHECK (fecha_limite >= fecha_solicitud)
);

-- ⚠️ NOTA SOBRE chk_tar_tareas_fechas
-- La fecha límite no puede ser anterior a la fecha de solicitud.
-- Para registrar un ACUERDO retroactivo que YA está vencido, debes indicar
-- también la fecha real en que se pidió. Ejemplo válido:
--
--   INSERT INTO tar_tareas (tipo, titulo, empresa, solicitante_id, responsable_id,
--                           fecha_solicitud, fecha_limite)
--   VALUES ('ACUERDO','Conciliación de julio','NOVONET', 3, 2,
--           CURRENT_DATE - 20,   -- se acordó hace 20 días
--           CURRENT_DATE - 4);   -- vencía hace 4 días  → queda como VENCIDA
--
-- Si solo pusieras fecha_limite en el pasado dejando fecha_solicitud = hoy,
-- el CHECK lo rechaza (no tiene sentido pedir hoy algo que venció ayer).

COMMENT ON TABLE  public.tar_tareas                     IS 'Tareas, acuerdos y solicitudes. Las subtareas son filas con tarea_padre_id';
COMMENT ON COLUMN public.tar_tareas.codigo              IS 'TAR-AAAA-NNNNN · autogenerado por trigger';
COMMENT ON COLUMN public.tar_tareas.area_responsable_id IS 'Snapshot del área del responsable al momento de asignar';
COMMENT ON COLUMN public.tar_tareas.estado              IS 'VENCIDA NO se guarda aquí: se calcula en la vista v_tar_tareas';


-- ── Áreas involucradas (N por tarea) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tar_tarea_areas (
    tarea_id  INTEGER NOT NULL REFERENCES public.tar_tareas(id) ON DELETE CASCADE,
    area_id   INTEGER NOT NULL REFERENCES public.tar_areas(id)  ON DELETE CASCADE,
    PRIMARY KEY (tarea_id, area_id)
);

COMMENT ON TABLE public.tar_tarea_areas IS 'Áreas involucradas. Sus jefaturas pueden ver la tarea';

CREATE INDEX IF NOT EXISTS idx_tar_tarea_areas_area ON public.tar_tarea_areas (area_id);


-- ═══════════════════════════════════════════════════════════════════════════════
-- BLOQUE 5 · COMENTARIOS
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.tar_comentarios (
    id          SERIAL PRIMARY KEY,
    tarea_id    INTEGER     NOT NULL REFERENCES public.tar_tareas(id) ON DELETE CASCADE,
    usuario_id  INTEGER     NOT NULL REFERENCES public.usuarios(id)   ON DELETE RESTRICT,
    comentario  TEXT        NOT NULL,
    eliminado   BOOLEAN     NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    editado_at  TIMESTAMPTZ,

    CONSTRAINT chk_tar_comentarios_texto CHECK (length(btrim(comentario)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_tar_comentarios_tarea
    ON public.tar_comentarios (tarea_id, created_at DESC)
    WHERE eliminado = false;


-- ═══════════════════════════════════════════════════════════════════════════════
-- BLOQUE 6 · HISTORIAL  (auditoría, solo escritura desde el backend)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.tar_historial (
    id              SERIAL PRIMARY KEY,
    tarea_id        INTEGER     NOT NULL REFERENCES public.tar_tareas(id) ON DELETE CASCADE,
    usuario_id      INTEGER     REFERENCES public.usuarios(id) ON DELETE SET NULL,
    accion          VARCHAR(30) NOT NULL,
    campo           VARCHAR(50),
    valor_anterior  TEXT,
    valor_nuevo     TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_tar_historial_accion CHECK (accion IN (
        'CREACION','CAMBIO_ESTADO','REASIGNACION','CAMBIO_FECHA',
        'EDICION','COMENTARIO','CANCELACION','REAPERTURA'
    ))
);

COMMENT ON TABLE public.tar_historial IS 'Registro inmutable de cambios. Nunca se edita ni se borra';

CREATE INDEX IF NOT EXISTS idx_tar_historial_tarea ON public.tar_historial (tarea_id, created_at DESC);


-- ═══════════════════════════════════════════════════════════════════════════════
-- BLOQUE 7 · NOTIFICACIONES
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.tar_notificaciones (
    id          SERIAL PRIMARY KEY,
    usuario_id  INTEGER      NOT NULL REFERENCES public.usuarios(id)   ON DELETE CASCADE,
    tarea_id    INTEGER      NOT NULL REFERENCES public.tar_tareas(id) ON DELETE CASCADE,
    tipo        VARCHAR(30)  NOT NULL,
    mensaje     VARCHAR(300) NOT NULL,
    leida       BOOLEAN      NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT chk_tar_notif_tipo CHECK (tipo IN (
        'ASIGNACION','COMENTARIO','CAMBIO_ESTADO','ENVIADA_REVISION',
        'APROBADA','DEVUELTA','PROXIMO_VENCIMIENTO','VENCIDA'
    ))
);

CREATE INDEX IF NOT EXISTS idx_tar_notif_pendientes
    ON public.tar_notificaciones (usuario_id, created_at DESC)
    WHERE leida = false;


-- ═══════════════════════════════════════════════════════════════════════════════
-- BLOQUE 8 · FUNCIONES Y TRIGGERS
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 8.1 · updated_at automático ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tar_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tar_tareas_updated    ON public.tar_tareas;
CREATE TRIGGER trg_tar_tareas_updated
    BEFORE UPDATE ON public.tar_tareas
    FOR EACH ROW EXECUTE FUNCTION public.tar_set_updated_at();

DROP TRIGGER IF EXISTS trg_tar_proyectos_updated ON public.tar_proyectos;
CREATE TRIGGER trg_tar_proyectos_updated
    BEFORE UPDATE ON public.tar_proyectos
    FOR EACH ROW EXECUTE FUNCTION public.tar_set_updated_at();


-- ── 8.2 · Código correlativo TAR-AAAA-NNNNN ───────────────────────────────────
-- ⚠️ El correlativo es ÚNICO pero NO es consecutivo sin huecos.
-- Las secuencias de PostgreSQL no hacen rollback: si un INSERT falla por una
-- validación, ese número se pierde. Es normal ver TAR-2026-00002 seguido de
-- TAR-2026-00008. Sirve para identificar, no para auditoría numérica.
CREATE SEQUENCE IF NOT EXISTS public.tar_tareas_codigo_seq;

CREATE OR REPLACE FUNCTION public.tar_generar_codigo()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.codigo IS NULL OR btrim(NEW.codigo) = '' THEN
        NEW.codigo := 'TAR-' || to_char(now(), 'YYYY') || '-' ||
                      lpad(nextval('public.tar_tareas_codigo_seq')::text, 5, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tar_tareas_codigo ON public.tar_tareas;
CREATE TRIGGER trg_tar_tareas_codigo
    BEFORE INSERT ON public.tar_tareas
    FOR EACH ROW EXECUTE FUNCTION public.tar_generar_codigo();


-- ── 8.3 · Validación de jerarquía (máximo 2 niveles, sin auto-referencia) ──────
CREATE OR REPLACE FUNCTION public.tar_valida_jerarquia()
RETURNS TRIGGER AS $$
DECLARE
    v_abuelo INTEGER;
BEGIN
    IF NEW.tarea_padre_id IS NULL THEN
        RETURN NEW;
    END IF;

    IF NEW.tarea_padre_id = NEW.id THEN
        RAISE EXCEPTION 'Una tarea no puede ser subtarea de sí misma';
    END IF;

    SELECT tarea_padre_id INTO v_abuelo
    FROM public.tar_tareas WHERE id = NEW.tarea_padre_id;

    IF v_abuelo IS NOT NULL THEN
        RAISE EXCEPTION 'Solo se permiten 2 niveles: tarea y subtarea';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tar_tareas_jerarquia ON public.tar_tareas;
CREATE TRIGGER trg_tar_tareas_jerarquia
    BEFORE INSERT OR UPDATE OF tarea_padre_id ON public.tar_tareas
    FOR EACH ROW EXECUTE FUNCTION public.tar_valida_jerarquia();


-- ── 8.4 · Sellado automático de fechas según el estado ────────────────────────
CREATE OR REPLACE FUNCTION public.tar_sella_fechas_estado()
RETURNS TRIGGER AS $$
BEGIN
    -- Primera vez que entra a EN_PROCESO
    IF NEW.estado = 'EN_PROCESO' AND NEW.fecha_inicio IS NULL THEN
        NEW.fecha_inicio := CURRENT_DATE;
    END IF;

    -- Al completar
    IF NEW.estado = 'COMPLETADA' AND (OLD.estado IS DISTINCT FROM 'COMPLETADA') THEN
        NEW.fecha_completada := now();
        NEW.progreso         := 100;
    END IF;

    -- Al reabrir, se limpia el sello
    IF NEW.estado <> 'COMPLETADA' AND OLD.estado = 'COMPLETADA' THEN
        NEW.fecha_completada := NULL;
        IF NEW.progreso = 100 THEN
            NEW.progreso := 90;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tar_tareas_fechas_estado ON public.tar_tareas;
CREATE TRIGGER trg_tar_tareas_fechas_estado
    BEFORE UPDATE OF estado ON public.tar_tareas
    FOR EACH ROW EXECUTE FUNCTION public.tar_sella_fechas_estado();


-- ── 8.5 · Autocompletar area_responsable_id desde el responsable ──────────────
CREATE OR REPLACE FUNCTION public.tar_asigna_area_responsable()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.area_responsable_id IS NULL THEN
        SELECT area_id INTO NEW.area_responsable_id
        FROM public.usuarios WHERE id = NEW.responsable_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tar_tareas_area_resp ON public.tar_tareas;
CREATE TRIGGER trg_tar_tareas_area_resp
    BEFORE INSERT OR UPDATE OF responsable_id ON public.tar_tareas
    FOR EACH ROW EXECUTE FUNCTION public.tar_asigna_area_responsable();


-- ═══════════════════════════════════════════════════════════════════════════════
-- BLOQUE 9 · ÍNDICES DE CONSULTA
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_tar_tareas_responsable
    ON public.tar_tareas (responsable_id, estado);

CREATE INDEX IF NOT EXISTS idx_tar_tareas_solicitante
    ON public.tar_tareas (solicitante_id, estado);

CREATE INDEX IF NOT EXISTS idx_tar_tareas_empresa_estado
    ON public.tar_tareas (empresa, estado);

CREATE INDEX IF NOT EXISTS idx_tar_tareas_area
    ON public.tar_tareas (area_responsable_id, estado);

CREATE INDEX IF NOT EXISTS idx_tar_tareas_proyecto
    ON public.tar_tareas (proyecto_id);

CREATE INDEX IF NOT EXISTS idx_tar_tareas_padre
    ON public.tar_tareas (tarea_padre_id)
    WHERE tarea_padre_id IS NOT NULL;

-- Solo indexa tareas abiertas: mucho más pequeño y es el 95% de las consultas
CREATE INDEX IF NOT EXISTS idx_tar_tareas_vencimiento
    ON public.tar_tareas (fecha_limite)
    WHERE estado NOT IN ('COMPLETADA','CANCELADA');

CREATE INDEX IF NOT EXISTS idx_tar_tareas_busqueda
    ON public.tar_tareas
    USING GIN (to_tsvector('spanish', coalesce(titulo,'') || ' ' || coalesce(descripcion,'')));


-- ═══════════════════════════════════════════════════════════════════════════════
-- BLOQUE 10 · VISTA v_tar_tareas
-- ═══════════════════════════════════════════════════════════════════════════════
-- Aquí es donde se calcula VENCIDA. El backend lee de esta vista, no de la tabla.

CREATE OR REPLACE VIEW public.v_tar_tareas AS
SELECT
    t.id,
    t.codigo,
    t.tipo,
    t.titulo,
    t.descripcion,
    t.empresa,
    t.estado,
    t.prioridad,
    t.progreso,
    t.orden,

    t.fecha_solicitud,
    t.fecha_inicio,
    t.fecha_limite,
    t.fecha_completada,

    -- ── Campos calculados ──────────────────────────────────────────────────────
    (t.fecha_limite < CURRENT_DATE
     AND t.estado NOT IN ('COMPLETADA','CANCELADA'))          AS esta_vencida,

    (CURRENT_DATE - t.fecha_limite)                            AS dias_retraso,
    (t.fecha_limite - CURRENT_DATE)                            AS dias_restantes,

    CASE
        WHEN t.estado IN ('COMPLETADA','CANCELADA') THEN 'CERRADA'
        WHEN t.fecha_limite <  CURRENT_DATE          THEN 'VENCIDA'
        WHEN t.fecha_limite =  CURRENT_DATE          THEN 'HOY'
        WHEN t.fecha_limite <= CURRENT_DATE + 7      THEN 'SEMANA'
        ELSE 'DESPUES'
    END                                                        AS grupo_vencimiento,

    -- ¿Se entregó a tiempo? NULL si aún no se completa
    CASE
        WHEN t.estado = 'COMPLETADA'
        THEN (t.fecha_completada::date <= t.fecha_limite)
        ELSE NULL
    END                                                        AS entregada_a_tiempo,

    -- ── Jerarquía ──────────────────────────────────────────────────────────────
    t.tarea_padre_id,
    (t.tarea_padre_id IS NOT NULL)                             AS es_subtarea,
    (SELECT count(*) FROM public.tar_tareas s
      WHERE s.tarea_padre_id = t.id)                           AS total_subtareas,
    (SELECT count(*) FROM public.tar_tareas s
      WHERE s.tarea_padre_id = t.id
        AND s.estado NOT IN ('COMPLETADA','CANCELADA'))        AS subtareas_abiertas,

    -- ── Proyecto ───────────────────────────────────────────────────────────────
    t.proyecto_id,
    p.nombre                                                   AS proyecto_nombre,
    p.color                                                    AS proyecto_color,

    -- ── Responsable ────────────────────────────────────────────────────────────
    t.responsable_id,
    btrim(coalesce(ur.nombres,'') || ' ' || coalesce(ur.apellidos,'')) AS responsable_nombre,
    ur.usuario                                                 AS responsable_usuario,
    t.area_responsable_id,
    ar.nombre                                                  AS area_responsable_nombre,
    ar.color                                                   AS area_responsable_color,
    cr.codigo                                                  AS responsable_cargo,
    coalesce(cr.es_jefatura, false)                            AS responsable_es_jefatura,

    -- ── Solicitante ────────────────────────────────────────────────────────────
    t.solicitante_id,
    btrim(coalesce(us.nombres,'') || ' ' || coalesce(us.apellidos,'')) AS solicitante_nombre,
    us.usuario                                                 AS solicitante_usuario,
    asol.nombre                                                AS solicitante_area_nombre,

    -- ── Agregados ──────────────────────────────────────────────────────────────
    (SELECT count(*) FROM public.tar_comentarios c
      WHERE c.tarea_id = t.id AND c.eliminado = false)         AS total_comentarios,

    (SELECT coalesce(json_agg(json_build_object(
                'id', a2.id, 'codigo', a2.codigo,
                'nombre', a2.nombre, 'color', a2.color)
             ORDER BY a2.orden), '[]'::json)
       FROM public.tar_tarea_areas ta
       JOIN public.tar_areas a2 ON a2.id = ta.area_id
      WHERE ta.tarea_id = t.id)                                AS areas_involucradas,

    t.creado_por,
    t.actualizado_por,
    t.created_at,
    t.updated_at

FROM public.tar_tareas t
LEFT JOIN public.tar_proyectos p    ON p.id    = t.proyecto_id
LEFT JOIN public.usuarios      ur   ON ur.id   = t.responsable_id
LEFT JOIN public.usuarios      us   ON us.id   = t.solicitante_id
LEFT JOIN public.tar_areas     ar   ON ar.id   = t.area_responsable_id
LEFT JOIN public.tar_areas     asol ON asol.id = us.area_id
LEFT JOIN public.tar_cargos    cr   ON cr.id   = ur.cargo_id;

COMMENT ON VIEW public.v_tar_tareas IS 'Vista de lectura del módulo. Calcula esta_vencida, grupo_vencimiento y entregada_a_tiempo';


COMMIT;


-- ═══════════════════════════════════════════════════════════════════════════════
-- BLOQUE 11 · VERIFICACIÓN POSTERIOR  (ejecuta esto después del COMMIT)
-- ═══════════════════════════════════════════════════════════════════════════════
/*
-- 11.1 · ¿Se crearon las 8 tablas?
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name LIKE 'tar_%'
ORDER BY table_name;
-- Esperado: tar_areas, tar_cargos, tar_comentarios, tar_historial,
--           tar_notificaciones, tar_proyectos, tar_tarea_areas, tar_tareas

-- 11.2 · Catálogos
SELECT id, codigo, nombre, color, orden FROM public.tar_areas  ORDER BY orden;
SELECT id, codigo, nombre, nivel, es_jefatura FROM public.tar_cargos ORDER BY nivel, codigo;

-- 11.3 · ¿Se agregaron las columnas a usuarios?
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema='public' AND table_name='usuarios'
  AND column_name IN ('area_id','cargo_id','cargo');

-- 11.4 · La vista responde
SELECT * FROM public.v_tar_tareas LIMIT 1;
*/


-- ═══════════════════════════════════════════════════════════════════════════════
-- BLOQUE 12 · ASIGNAR ÁREA Y CARGO A TUS USUARIOS  (paso manual, obligatorio)
-- ═══════════════════════════════════════════════════════════════════════════════
-- El módulo NO funciona hasta que cada usuario tenga area_id y cargo_id.
-- Ejecuta 12.1 para ver qué tienes hoy, luego usa 12.2 y 12.3.
/*

-- 12.1 · Ver usuarios activos y su cargo actual en texto libre
SELECT id, usuario, nombres, apellidos, empresa, perfil, cargo, area_id, cargo_id
FROM public.usuarios
WHERE activo = 'SI'
ORDER BY empresa, cargo NULLS LAST, id;


-- 12.2 · Intento de mapeo automático del cargo en texto libre
--        Revisa el resultado ANTES de aplicarlo.
UPDATE public.usuarios u
SET cargo_id = c.id
FROM public.tar_cargos c
WHERE u.cargo_id IS NULL
  AND u.cargo IS NOT NULL
  AND upper(unaccent(u.cargo)) LIKE '%' || c.codigo || '%';
-- Si `unaccent` no está instalado, usa esta variante:
-- AND upper(u.cargo) LIKE '%' || c.codigo || '%';


-- 12.3 · Asignación manual, uno por uno (la forma segura)
-- Reemplaza el usuario y los códigos según corresponda:
UPDATE public.usuarios
SET area_id  = (SELECT id FROM public.tar_areas  WHERE codigo = 'DESARROLLO'),
    cargo_id = (SELECT id FROM public.tar_cargos WHERE codigo = 'COORDINADOR')
WHERE usuario = 'bryan';

-- Asignación masiva por área (ejemplo: todo Contabilidad):
-- UPDATE public.usuarios
-- SET area_id = (SELECT id FROM public.tar_areas WHERE codigo = 'CONTABILIDAD')
-- WHERE id IN (12, 15, 18);


-- 12.4 · Quiénes quedaron sin asignar (deben quedar en cero)
SELECT id, usuario, nombres, apellidos, empresa, cargo
FROM public.usuarios
WHERE activo = 'SI' AND (area_id IS NULL OR cargo_id IS NULL)
ORDER BY empresa, id;

*/


-- ═══════════════════════════════════════════════════════════════════════════════
-- BLOQUE 13 · ROLLBACK  (solo si necesitas deshacer todo)
-- ═══════════════════════════════════════════════════════════════════════════════
-- ⚠️ BORRA TODAS LAS TAREAS. No lo ejecutes en producción con datos reales.
/*
BEGIN;
DROP VIEW  IF EXISTS public.v_tar_tareas;
DROP TABLE IF EXISTS public.tar_notificaciones CASCADE;
DROP TABLE IF EXISTS public.tar_historial      CASCADE;
DROP TABLE IF EXISTS public.tar_comentarios    CASCADE;
DROP TABLE IF EXISTS public.tar_tarea_areas    CASCADE;
DROP TABLE IF EXISTS public.tar_tareas         CASCADE;
DROP TABLE IF EXISTS public.tar_proyectos      CASCADE;
ALTER TABLE public.usuarios DROP COLUMN IF EXISTS area_id;
ALTER TABLE public.usuarios DROP COLUMN IF EXISTS cargo_id;
DROP TABLE IF EXISTS public.tar_areas          CASCADE;
DROP TABLE IF EXISTS public.tar_cargos         CASCADE;
DROP SEQUENCE IF EXISTS public.tar_tareas_codigo_seq;
DROP FUNCTION IF EXISTS public.tar_set_updated_at()          CASCADE;
DROP FUNCTION IF EXISTS public.tar_generar_codigo()          CASCADE;
DROP FUNCTION IF EXISTS public.tar_valida_jerarquia()        CASCADE;
DROP FUNCTION IF EXISTS public.tar_sella_fechas_estado()     CASCADE;
DROP FUNCTION IF EXISTS public.tar_asigna_area_responsable() CASCADE;
COMMIT;
*/
