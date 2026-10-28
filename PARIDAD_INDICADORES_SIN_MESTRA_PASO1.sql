-- ============================================================================
-- PARIDAD PASO 1 — Indicadores NOVONET: mestra_bitrix (actual) vs envios_ventas (nueva)
-- SOLO LECTURA. No modifica nada. Ejecutar en pgAdmin sobre bddgeneral.
-- Compara fila por fila (por id de venta) todas las columnas j_* que usa
-- indicadores.controller.js, aplicando las mismas reglas que mestra_bitrix_ev.
-- Se excluyen ventas tocadas en los últimos 15 min (desfase normal del refresco).
-- Resultado esperado: solo_actual = 0 y solo_nueva = 0.
-- ============================================================================
WITH recientes AS (
  SELECT 'EV-' || id AS id_unificado
  FROM public.envios_ventas
  WHERE fecha_ultima_actualizacion > now() - interval '15 minutes'
),
ev AS (
  SELECT e.*,
         CASE WHEN e.origen_dato = 'JOTFORM_NOVONET' THEN NULLIF(e.fecha_registro_sistema,'')::timestamp
              ELSE (NULLIF(e.fecha_registro_sistema,'')::timestamptz AT TIME ZONE 'America/Guayaquil') END AS ts_local,
         public.parse_fecha_flex(e.fecha_activacion_netlife) AS f_act
  FROM public.envios_ventas e
  WHERE e.distribuidor_autorizado = 'NOVONET'
    AND e.origen_dato IN ('JOTFORM_NOVONET','ERP')
    AND e.estatus_envio IS DISTINCT FROM 'BORRADOR'
),
nueva AS (
  SELECT 'EV-' || ev.id                                              AS id_unificado,
         to_jsonb(ev.id_bitrix) #>> '{}'                             AS j_id_bitrix,
         to_char(ev.ts_local, 'YYYY-MM-DD HH24:MI:SS')               AS j_fecha_registro_sistema,
         COALESCE(ev.f_act::text, ev.fecha_activacion_netlife::text) AS j_fecha_activacion_netlife,
         to_jsonb(ev.netlife_estatus_real) #>> '{}'                  AS j_netlife_estatus_real,
         to_jsonb(ev.estatus_regularizacion) #>> '{}'                AS j_estatus_regularizacion,
         to_jsonb(ev.detalle_regularizacion) #>> '{}'                AS j_detalle_regularizacion,
         CASE WHEN TRANSLATE(UPPER(BTRIM(ev.forma_pago)),'ÁÉÍÓÚ.','AEIOU') = 'TARJETA DE CREDITO'
              THEN 'TARJETA DE CREDITO.' ELSE to_jsonb(ev.forma_pago) #>> '{}' END AS j_forma_pago,
         CASE WHEN UPPER(ev.aplica_descuento_3ra_edad) IN ('SÍ','SI')
              THEN 'SI POR TERCERA EDAD' ELSE to_jsonb(ev.aplica_descuento_3ra_edad) #>> '{}' END AS j_aplica_descuento_3ra_edad,
         to_jsonb(ev.netlife_login) #>> '{}'                         AS j_netlife_login,
         to_jsonb(ev.ciudad) #>> '{}'                                AS j_ciudad,
         to_jsonb(ev.novedades_atc) #>> '{}'                         AS j_novedades_atc
  FROM ev
  WHERE 'EV-' || ev.id NOT IN (SELECT id_unificado FROM recientes)
),
actual AS (
  SELECT mb.id_unificado,
         mb.j_id_bitrix::text, mb.j_fecha_registro_sistema::text, mb.j_fecha_activacion_netlife::text,
         mb.j_netlife_estatus_real::text, mb.j_estatus_regularizacion::text, mb.j_detalle_regularizacion::text,
         mb.j_forma_pago::text, mb.j_aplica_descuento_3ra_edad::text, mb.j_netlife_login::text,
         mb.j_ciudad::text, mb.j_novedades_atc::text
  FROM public.mestra_bitrix mb
  WHERE mb.id_unificado LIKE 'EV-%'
    AND mb.id_unificado NOT IN (SELECT id_unificado FROM recientes)
)
SELECT 'filas_actual' AS medida, COUNT(*) AS valor FROM actual
UNION ALL SELECT 'filas_nueva', COUNT(*) FROM nueva
UNION ALL SELECT 'solo_actual (difiere)', COUNT(*) FROM (SELECT * FROM actual EXCEPT SELECT * FROM nueva) x
UNION ALL SELECT 'solo_nueva (difiere)',  COUNT(*) FROM (SELECT * FROM nueva EXCEPT SELECT * FROM actual) y
UNION ALL SELECT 'mestra_filas_no_EV (solo Bitrix)', COUNT(*) FROM public.mestra_bitrix WHERE id_unificado NOT LIKE 'EV-%' OR id_unificado IS NULL;
