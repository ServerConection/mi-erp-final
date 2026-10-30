-- PASO 6 — SOLO LECTURA. Compara TODAS las columnas que usa Indicadores
-- (asesor, etapa, origen, fechas Bitrix + datos Jotform) entre
-- mestra_bitrix (actual) y vw_mestra_novonet_live (nueva).
-- Excluye ventas editadas en los últimos 15 min (desfase normal del refresco).
-- Esperado: difiere_actual = 0 y difiere_nueva = 0 (o solo las 3 ya conocidas).
WITH recientes AS (
  SELECT 'EV-' || id AS id_unificado FROM public.envios_ventas
  WHERE fecha_ultima_actualizacion > now() - interval '15 minutes'
),
cols AS (SELECT 1),
actual AS (
  SELECT id_unificado::text, b_id::text, b_persona_responsable::text, b_etapa_de_la_negociacion::text,
         b_origen::text, b_creado_el_fecha::text, b_creado_el_hora::text, b_modificado_el_fecha::text,
         b_modificado_el_hora::text, b_cerrado::text,
         j_id_bitrix::text, j_fecha_registro_sistema::text, j_fecha_activacion_netlife::text,
         j_netlife_estatus_real::text, j_estatus_regularizacion::text, j_detalle_regularizacion::text,
         j_forma_pago::text, j_aplica_descuento_3ra_edad::text, j_netlife_login::text,
         j_ciudad::text, j_novedades_atc::text, j_fecha_agenda::text
  FROM public.mestra_bitrix
  WHERE id_unificado IS NULL OR id_unificado NOT IN (SELECT id_unificado FROM recientes)
),
nueva AS (
  SELECT id_unificado::text, b_id::text, b_persona_responsable::text, b_etapa_de_la_negociacion::text,
         b_origen::text, b_creado_el_fecha::text, b_creado_el_hora::text, b_modificado_el_fecha::text,
         b_modificado_el_hora::text, b_cerrado::text,
         j_id_bitrix::text, j_fecha_registro_sistema::text, j_fecha_activacion_netlife::text,
         j_netlife_estatus_real::text, j_estatus_regularizacion::text, j_detalle_regularizacion::text,
         j_forma_pago::text, j_aplica_descuento_3ra_edad::text, j_netlife_login::text,
         j_ciudad::text, j_novedades_atc::text, j_fecha_agenda::text
  FROM public.vw_mestra_novonet_live
  WHERE id_unificado IS NULL OR id_unificado NOT IN (SELECT id_unificado FROM recientes)
),
d_act AS (SELECT * FROM actual EXCEPT ALL SELECT * FROM nueva),
d_nue AS (SELECT * FROM nueva EXCEPT ALL SELECT * FROM actual)
SELECT 'difiere_actual' AS medida, COUNT(*) AS valor, string_agg(id_unificado, ', ') FILTER (WHERE id_unificado IS NOT NULL) AS ids FROM d_act
UNION ALL
SELECT 'difiere_nueva', COUNT(*), string_agg(id_unificado, ', ') FILTER (WHERE id_unificado IS NOT NULL) FROM d_nue
UNION ALL
SELECT 'difiere_solo_asesor', COUNT(*), string_agg(a.id_unificado, ', ')
FROM actual a JOIN nueva n USING (id_unificado)
WHERE a.b_persona_responsable IS DISTINCT FROM n.b_persona_responsable;
