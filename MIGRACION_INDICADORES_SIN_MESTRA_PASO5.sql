-- ============================================================================
-- PASO 5 — Crea 2 objetos NUEVOS. No modifica ni borra nada existente.
-- (mestra_bitrix, su refresco y los indicadores actuales siguen igual)
--
-- 1) mv_bitrix_hist_novonet: histórico Bitrix (asesor, etapa, origen, fechas)
--    de mestra_bitrix_jotform_bkp, 1 fila por negociación. Esa tabla es fija,
--    así que esta MV no necesita refrescarse.
-- 2) vw_mestra_novonet_live: mismo contenido que mestra_bitrix, pero las
--    ventas salen EN VIVO de envios_ventas (sin esperar refresco).
--
-- REVERTIR (solo borra lo creado aquí):
--   DROP VIEW public.vw_mestra_novonet_live;
--   DROP MATERIALIZED VIEW public.mv_bitrix_hist_novonet;
-- ============================================================================

CREATE MATERIALIZED VIEW public.mv_bitrix_hist_novonet AS
SELECT DISTINCT ON (BTRIM(bk.b_id))
       BTRIM(bk.b_id)               AS _k,
       bk.b_id, bk.b_persona_responsable, bk.b_etapa_de_la_negociacion, bk.b_origen,
       bk.b_creado_el_fecha, bk.b_creado_el_hora, bk.b_modificado_el_fecha,
       bk.b_modificado_el_hora, bk.b_cerrado
FROM public.mestra_bitrix_jotform_bkp bk
WHERE NULLIF(BTRIM(bk.b_id), '') IS NOT NULL
ORDER BY BTRIM(bk.b_id), (NULLIF(BTRIM(bk.b_persona_responsable), '') IS NOT NULL) DESC;

CREATE UNIQUE INDEX uq_mv_bitrix_hist_novonet_k ON public.mv_bitrix_hist_novonet (_k);
ANALYZE public.mv_bitrix_hist_novonet;

CREATE VIEW public.vw_mestra_novonet_live AS
SELECT
    'EV-' || ev.id                                              AS id_unificado,
    COALESCE(b.b_id, ev.id_bitrix)                              AS b_id,
    COALESCE(b.b_persona_responsable,
             CASE WHEN ev.origen_dato = 'ERP' THEN ev.nombre_atc END) AS b_persona_responsable,
    b.b_etapa_de_la_negociacion, b.b_origen,
    b.b_creado_el_fecha, b.b_creado_el_hora, b.b_modificado_el_fecha,
    b.b_modificado_el_hora, b.b_cerrado,
    (to_jsonb(ev.id_bitrix) #>> '{}')                           AS j_id_bitrix,
    to_char(ev.ts_local, 'YYYY-MM-DD HH24:MI:SS')               AS j_fecha_registro_sistema,
    COALESCE(ev.f_act::text, ev.fecha_activacion_netlife::text) AS j_fecha_activacion_netlife,
    (to_jsonb(ev.netlife_estatus_real) #>> '{}')                AS j_netlife_estatus_real,
    (to_jsonb(ev.estatus_regularizacion) #>> '{}')              AS j_estatus_regularizacion,
    (to_jsonb(ev.detalle_regularizacion) #>> '{}')              AS j_detalle_regularizacion,
    CASE WHEN TRANSLATE(UPPER(BTRIM(ev.forma_pago)),'ÁÉÍÓÚ.','AEIOU') = 'TARJETA DE CREDITO'
         THEN 'TARJETA DE CREDITO.' ELSE (to_jsonb(ev.forma_pago) #>> '{}') END AS j_forma_pago,
    CASE WHEN UPPER(ev.aplica_descuento_3ra_edad) IN ('SÍ','SI')
         THEN 'SI POR TERCERA EDAD' ELSE (to_jsonb(ev.aplica_descuento_3ra_edad) #>> '{}') END AS j_aplica_descuento_3ra_edad,
    (to_jsonb(ev.netlife_login) #>> '{}')                       AS j_netlife_login,
    (to_jsonb(ev.ciudad) #>> '{}')                              AS j_ciudad,
    (to_jsonb(ev.novedades_atc) #>> '{}')                       AS j_novedades_atc,
    (to_jsonb(ev.fecha_agenda) #>> '{}')                        AS j_fecha_agenda
FROM (
    SELECT e.*,
           CASE WHEN e.origen_dato = 'JOTFORM_NOVONET' THEN NULLIF(e.fecha_registro_sistema, '')::timestamp
                ELSE (NULLIF(e.fecha_registro_sistema, '')::timestamptz AT TIME ZONE 'America/Guayaquil') END AS ts_local,
           public.parse_fecha_flex(e.fecha_activacion_netlife) AS f_act
    FROM public.envios_ventas e
    WHERE e.distribuidor_autorizado = 'NOVONET'
      AND e.origen_dato IN ('JOTFORM_NOVONET', 'ERP')
      AND e.estatus_envio IS DISTINCT FROM 'BORRADOR'
) ev
LEFT JOIN public.mv_bitrix_hist_novonet b ON b._k = BTRIM(ev.id_bitrix)
UNION ALL
-- filas solo-Bitrix (sin venta), tal cual están en mestra_bitrix
SELECT bk.id_unificado, bk.b_id, bk.b_persona_responsable, bk.b_etapa_de_la_negociacion, bk.b_origen,
       bk.b_creado_el_fecha, bk.b_creado_el_hora, bk.b_modificado_el_fecha, bk.b_modificado_el_hora, bk.b_cerrado,
       bk.j_id_bitrix::text, bk.j_fecha_registro_sistema::text, bk.j_fecha_activacion_netlife::text,
       bk.j_netlife_estatus_real::text, bk.j_estatus_regularizacion::text, bk.j_detalle_regularizacion::text,
       bk.j_forma_pago::text, bk.j_aplica_descuento_3ra_edad::text, bk.j_netlife_login::text,
       bk.j_ciudad::text, bk.j_novedades_atc::text, bk.j_fecha_agenda::text
FROM public.mestra_bitrix_jotform_bkp bk
WHERE NULLIF(BTRIM(bk.j_fecha_registro_sistema), '') IS NULL
  AND NULLIF(BTRIM(bk.j_id_bitrix), '') IS NULL;

SELECT 'vw_mestra_novonet_live' AS objeto, COUNT(*) AS filas FROM public.vw_mestra_novonet_live
UNION ALL SELECT 'mestra_bitrix (actual)', COUNT(*) FROM public.mestra_bitrix;
