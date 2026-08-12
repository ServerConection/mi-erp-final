-- ============================================================================
-- ASIGNACION ASESOR -> SUPERVISOR — NOVONET, AGOSTO 2026 (codigo = '8')
-- PASO 5 — Continuación de ASIGNACION_ASESORES_AGOSTO.sql
--
-- Contexto (PASO 4 del script anterior): quedaban "SIN ASIGNAR" cuentas
-- genéricas (no son asesores individuales), la más grande "Novonet Ecuador"
-- con 2.911 leads entre sus 2 escrituras. Se decidió:
--
--   1. Cada supervisor (Andrés, Javier, Jonathan) también gestiona leads a
--      su propio nombre — esos leads deben contar dentro de SU equipo, no
--      caer a "SIN ASIGNAR" (que hoy se ve como Adriana Salvatore).
--   2. "Novonet Ecuador" pasa a ser su PROPIO grupo ("solito"): ya no cae
--      en el cajón de Adriana, pero tampoco se reparte entre los 3 equipos.
--   3. "Redesnovonet" (usuario/cuenta genérica) se asigna al equipo de
--      Jonathan Simbaña — es su usuario dentro del sistema.
--   4. Todo lo demás que hoy cae "SIN ASIGNAR" se queda como está (con
--      Adriana Salvatore) — no se toca.
--
-- Tabla: public.empleados (nombre_completo, supervisor, codigo)
-- Recordatorio del propio script anterior: el JOIN es por NOMBRE EXACTO
-- contra mestra_bitrix.b_persona_responsable. Por eso PASO 5A corre primero
-- un diagnóstico — para no adivinar mayúsculas/acentos y meter otra fila
-- muerta que no engancha con nada.
--
-- ⚠️ OJO — spelling inconsistente encontrado en los scripts existentes:
--   ASIGNACION_ASESORES_AGOSTO.sql usa "JONATHAN SIMBAÑA" (con H) como
--   supervisor del equipo Dragones.
--   DIAGNOSTICO_ASIGNACION_ASESORES.sql (sección A5) usa "JONATAN SIMBAÑA"
--   (sin H) en un par de filas.
--   Este script usa "JONATHAN SIMBAÑA" (con H) para quedar consistente con
--   el equipo YA cargado en agosto. Verificar con PASO 5A que así es como
--   aparece si Jonathan gestiona leads a su propio nombre.
--
-- Ejecutar en pgAdmin sobre bddgeneral, en este orden: 5A -> revisar -> 5B -> 5C.
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- PASO 5A — Diagnóstico: ver EXACTAMENTE cómo está escrito cada nombre en
-- Bitrix este mes, antes de insertar nada. Pásame el resultado si algo no
-- calza con lo que asumí abajo (ver nota JONATHAN/JONATAN arriba).
-- ────────────────────────────────────────────────────────────────────────────
SELECT
    mb.b_persona_responsable AS nombre_en_bitrix,
    COUNT(*)::int            AS leads_agosto,
    e.supervisor             AS supervisor_actual
FROM public.mestra_bitrix mb
LEFT JOIN LATERAL (
    SELECT e2.supervisor
    FROM public.empleados e2
    WHERE e2.nombre_completo = mb.b_persona_responsable
    ORDER BY CASE WHEN e2.codigo = '8' THEN 0 ELSE 1 END, e2.codigo::int DESC
    LIMIT 1
) e ON TRUE
WHERE public.parse_fecha_flex(mb.b_creado_el_fecha::text)
      BETWEEN '2026-08-01' AND CURRENT_DATE
  AND (
        mb.b_persona_responsable ILIKE '%andres rodriguez%'
     OR mb.b_persona_responsable ILIKE '%javier%navarrete%'
     OR mb.b_persona_responsable ILIKE '%jonat%simba%'
     OR mb.b_persona_responsable ILIKE '%novonet ecuador%'
     OR mb.b_persona_responsable ILIKE '%redesnovonet%'
     OR mb.b_persona_responsable ILIKE '%redes novonet%'
      )
GROUP BY 1, 3
ORDER BY leads_agosto DESC;


-- ────────────────────────────────────────────────────────────────────────────
-- PASO 5B — Carga
-- Transaccional. Solo toca las filas de codigo='8' de los nombres de abajo,
-- no toca a nadie más.
-- ────────────────────────────────────────────────────────────────────────────
BEGIN;

-- 5B.1 — Autoasignación de los supervisores a su propio equipo.
-- "JAVIER FRANCISCO NAVARRETE" confirmado por el usuario como su nombre
-- completo en Bitrix. Andrés y Jonathan quedan con el MISMO valor que ya
-- se usa como etiqueta de supervisor (ANDRES RODRIGUEZ / JONATHAN SIMBAÑA):
-- si en Bitrix su nombre como asesor es distinto (con segundo nombre, etc.),
-- corregir aquí con el resultado de PASO 5A antes de correr.
WITH autoasignacion(nombre_completo, supervisor) AS (VALUES
    ('ANDRES RODRIGUEZ',           'ANDRES RODRIGUEZ'),
    ('JAVIER FRANCISCO NAVARRETE', 'JAVIER NAVARRETE'),
    ('JONATHAN SIMBAÑA',           'JONATHAN SIMBAÑA')
),
borrado_auto AS (
    DELETE FROM public.empleados e
    USING autoasignacion a
    WHERE e.nombre_completo = a.nombre_completo
      AND e.codigo = '8'
    RETURNING 1
)
INSERT INTO public.empleados (nombre_completo, supervisor, codigo)
SELECT nombre_completo, supervisor, '8' FROM autoasignacion;

-- 5B.2 — "Novonet Ecuador" pasa a ser su propio grupo ("solito").
-- Dinámico (no hardcodeo mayúsculas): toma TODAS las escrituras que existan
-- en Bitrix este mes y las mete con supervisor = 'NOVONET ECUADOR' (ella
-- misma), para que deje de caer en el cajón de Adriana Salvatore.
DELETE FROM public.empleados e
WHERE e.codigo = '8'
  AND e.nombre_completo IN (
      SELECT DISTINCT TRIM(mb.b_persona_responsable)
      FROM public.mestra_bitrix mb
      WHERE mb.b_persona_responsable ILIKE 'novonet ecuador'
  );

INSERT INTO public.empleados (nombre_completo, supervisor, codigo)
SELECT DISTINCT TRIM(mb.b_persona_responsable), 'NOVONET ECUADOR', '8'
FROM public.mestra_bitrix mb
WHERE mb.b_persona_responsable ILIKE 'novonet ecuador';

-- 5B.3 — "Redesnovonet" (usuario de Jonathan Simbaña) se suma a su equipo.
-- Mismo enfoque dinámico, por si tiene más de una escritura.
DELETE FROM public.empleados e
WHERE e.codigo = '8'
  AND e.nombre_completo IN (
      SELECT DISTINCT TRIM(mb.b_persona_responsable)
      FROM public.mestra_bitrix mb
      WHERE mb.b_persona_responsable ILIKE 'redesnovonet'
         OR mb.b_persona_responsable ILIKE 'redes novonet'
  );

INSERT INTO public.empleados (nombre_completo, supervisor, codigo)
SELECT DISTINCT TRIM(mb.b_persona_responsable), 'JONATHAN SIMBAÑA', '8'
FROM public.mestra_bitrix mb
WHERE mb.b_persona_responsable ILIKE 'redesnovonet'
   OR mb.b_persona_responsable ILIKE 'redes novonet';

COMMIT;


-- ────────────────────────────────────────────────────────────────────────────
-- PASO 5C — Verificar
-- ────────────────────────────────────────────────────────────────────────────
SELECT supervisor, nombre_completo
FROM public.empleados
WHERE codigo = '8'
  AND supervisor IN ('ANDRES RODRIGUEZ', 'JAVIER NAVARRETE', 'JONATHAN SIMBAÑA', 'NOVONET ECUADOR')
ORDER BY supervisor, nombre_completo;

-- Quién sigue "SIN ASIGNAR" después de esto (debería ya no incluir
-- Novonet Ecuador ni Redesnovonet; el resto se deja para Adriana Salvatore
-- a propósito, según lo pedido).
SELECT mb.b_persona_responsable AS sin_asignar, COUNT(*)::int AS leads
FROM public.mestra_bitrix mb
WHERE public.parse_fecha_flex(mb.b_creado_el_fecha::text)
      BETWEEN '2026-08-01' AND CURRENT_DATE
  AND NULLIF(TRIM(mb.b_persona_responsable), '') IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM public.empleados e
      WHERE e.nombre_completo = mb.b_persona_responsable AND e.codigo = '8'
  )
GROUP BY 1
ORDER BY leads DESC;
