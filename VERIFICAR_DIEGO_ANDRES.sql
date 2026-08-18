-- ============================================================================
-- VERIFICAR — ¿ya quedó Diego Geovanni Benitez Sango con Javier Navarrete
-- y Andrés Rodríguez Jácome con Andrés Rodríguez? (mes 8)
--
-- Corre SOLO esto. Si las dos filas de abajo aparecen con el supervisor
-- correcto, ya estaba corrido y no hay que hacer nada más.
-- Si NO aparecen (o aparecen con otro supervisor / no aparecen filas),
-- avísame y te paso de nuevo el SQL para cargarlas.
-- ============================================================================

SELECT nombre_completo, supervisor, codigo
FROM public.empleados
WHERE codigo = '8'
  AND (
        nombre_completo ILIKE '%benitez%sango%'
     OR nombre_completo ILIKE '%rodriguez%jacome%'
     OR nombre_completo ILIKE '%rodríguez%jácome%'
      )
ORDER BY nombre_completo;
