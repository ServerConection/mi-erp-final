-- Completa únicamente códigos vacíos del Jotform/ERP usando la identidad ya
-- vinculada al registro. No reemplaza códigos existentes.
WITH candidatos AS (
  SELECT e.id,
         (
           SELECT NULLIF(BTRIM(u.codigo_vendedor), '')
           FROM public.usuarios u
           WHERE NULLIF(BTRIM(u.codigo_vendedor), '') IS NOT NULL
             AND (u.id = e.usuario_id
                  OR UPPER(BTRIM(u.usuario)) = UPPER(BTRIM(e.usuario)))
             AND UPPER(BTRIM(COALESCE(u.empresa, ''))) LIKE
                 '%' || UPPER(BTRIM(e.distribuidor_autorizado)) || '%'
           ORDER BY (u.id = e.usuario_id) DESC, u.activo DESC, u.id DESC
           LIMIT 1
         ) AS codigo_vendedor
  FROM public.envios_ventas e
  WHERE NULLIF(BTRIM(e.codigo_asesor), '') IS NULL
    AND e.distribuidor_autorizado IN ('NOVONET', 'VELSA')
    AND e.origen_dato IN ('JOTFORM_NOVONET', 'JOTFORM_VELSA', 'ERP')
    AND public.parse_fecha_flex(e.fecha_registro_sistema::text) >= DATE '2026-10-01'
)
UPDATE public.envios_ventas e
SET codigo_asesor = candidatos.codigo_vendedor
FROM candidatos
WHERE candidatos.id = e.id
  AND candidatos.codigo_vendedor IS NOT NULL;
