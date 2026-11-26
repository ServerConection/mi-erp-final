-- Cambio de reparto: KARINA MARICELA TORRES AMAGUAÑA
-- VELSA -> NOVONET, desde 2026-11-25 hasta 2026-11-30.
--
-- Este script se puede ejecutar más de una vez. Siempre dejará una sola fila
-- por día en NOVONET, con 0 gestionables permitidos y 50% de ATC máximo.

BEGIN;

-- 1. Retirar a la asesora del reparto VELSA para los días restantes del mes.
DELETE FROM public.velsa_gestionables_asesores
WHERE fecha_carga BETWEEN DATE '2026-11-25' AND DATE '2026-11-30'
  AND UPPER(BTRIM(nombre_bitrix_asesor)) IN (
    'KARINA MARICELA TORRES AMAGUAÑA',
    'KARINA MARICELA TORRES AMAGUANA',
    'KARINA TORRES'
  );

-- 2. Evitar duplicados si ya fue cargada en NOVONET con alguna variante del
-- nombre. Solo se interviene el rango solicitado; el historial no se modifica.
DELETE FROM public.gestionables_asesores
WHERE fecha_carga BETWEEN DATE '2026-11-25' AND DATE '2026-11-30'
  AND UPPER(BTRIM(nombre_bitrix_asesor)) IN (
    'KARINA MARICELA TORRES AMAGUAÑA',
    'KARINA MARICELA TORRES AMAGUANA',
    'KARINA TORRES'
  );

-- 3. Cargarla en NOVONET desde hoy hasta el último día de noviembre.
INSERT INTO public.gestionables_asesores (
  nombre_bitrix_asesor,
  gestionables_permitidos,
  fecha_carga,
  porcentaje_atc_max
)
SELECT
  'KARINA MARICELA TORRES AMAGUAÑA',
  0,
  dia::date,
  50
FROM generate_series(
  DATE '2026-11-25',
  DATE '2026-11-30',
  INTERVAL '1 day'
) AS fechas(dia);

COMMIT;

-- Verificación: debe devolver 0 filas para VELSA y 6 filas para NOVONET.
SELECT
  'VELSA' AS empresa,
  nombre_bitrix_asesor,
  gestionables_permitidos,
  porcentaje_atc_max,
  fecha_carga
FROM public.velsa_gestionables_asesores
WHERE fecha_carga BETWEEN DATE '2026-11-25' AND DATE '2026-11-30'
  AND UPPER(BTRIM(nombre_bitrix_asesor)) IN (
    'KARINA MARICELA TORRES AMAGUAÑA',
    'KARINA MARICELA TORRES AMAGUANA',
    'KARINA TORRES'
  )

UNION ALL

SELECT
  'NOVONET' AS empresa,
  nombre_bitrix_asesor,
  gestionables_permitidos,
  porcentaje_atc_max,
  fecha_carga
FROM public.gestionables_asesores
WHERE fecha_carga BETWEEN DATE '2026-11-25' AND DATE '2026-11-30'
  AND UPPER(BTRIM(nombre_bitrix_asesor)) IN (
    'KARINA MARICELA TORRES AMAGUAÑA',
    'KARINA MARICELA TORRES AMAGUANA',
    'KARINA TORRES'
  )
ORDER BY empresa, fecha_carga;
