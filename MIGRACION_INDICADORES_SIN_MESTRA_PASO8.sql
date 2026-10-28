-- ============================================================================
-- PASO 8 — Ajusta SOLO la vista nueva vw_mestra_novonet_live (creada en el paso 5).
-- Las ventas creadas en el ERP buscan el histórico Bitrix por j_id_bitrix,
-- igual que hoy lo hace vw_ev_live_mestra. No toca nada existente.
-- ============================================================================
CREATE OR REPLACE VIEW public.vw_mestra_novonet_live AS
SELECT
    'EV-' || ev.id                                              AS id_unificado,
    COALESCE(CASE WHEN ev.origen_dato = 'ERP' THEN be.b_id ELSE bh.b_id END, ev.id_bitrix)    AS b_id,
    COALESCE(CASE WHEN ev.origen_dato = 'ERP' THEN be.b_persona_responsable ELSE bh.b_persona_responsable END,
             CASE WHEN ev.origen_dato = 'ERP' THEN ev.nombre_atc END) AS b_persona_responsable,
    CASE WHEN ev.origen_dato = 'ERP' THEN be.b_etapa_de_la_negociacion ELSE bh.b_etapa_de_la_negociacion END AS b_etapa_de_la_negociacion,
    CASE WHEN ev.origen_dato = 'ERP' THEN be.b_origen ELSE bh.b_origen END AS b_origen,
    CASE WHEN ev.origen_dato = 'ERP' THEN be.b_creado_el_fecha ELSE bh.b_creado_el_fecha END AS b_creado_el_fecha,
    CASE WHEN ev.origen_dato = 'ERP' THEN be.b_creado_el_hora ELSE bh.b_creado_el_hora END AS b_creado_el_hora,
    CASE WHEN ev.origen_dato = 'ERP' THEN be.b_modificado_el_fecha ELSE bh.b_modificado_el_fecha END AS b_modificado_el_fecha,
    CASE WHEN ev.origen_dato = 'ERP' THEN be.b_modificado_el_hora ELSE bh.b_modificado_el_hora END AS b_modificado_el_hora,
    CASE WHEN ev.origen_dato = 'ERP' THEN be.b_cerrado ELSE bh.b_cerrado END AS b_cerrado,
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
-- Ventas JOTFORM: histórico por b_id (regla de mestra_bitrix_ev)
LEFT JOIN public.mv_bitrix_hist_novonet bh
       ON ev.origen_dato <> 'ERP' AND bh._k = BTRIM(ev.id_bitrix)
-- Ventas ERP: histórico por j_id_bitrix (regla de vw_ev_live_mestra)
LEFT JOIN LATERAL (
    SELECT bk.b_id, bk.b_persona_responsable, bk.b_etapa_de_la_negociacion, bk.b_origen,
           bk.b_creado_el_fecha, bk.b_creado_el_hora, bk.b_modificado_el_fecha,
           bk.b_modificado_el_hora, bk.b_cerrado
    FROM public.mestra_bitrix_jotform_bkp bk
    WHERE ev.origen_dato = 'ERP'
      AND NULLIF(BTRIM(ev.id_bitrix), '') IS NOT NULL
      AND BTRIM(bk.j_id_bitrix::text) = BTRIM(ev.id_bitrix)
    ORDER BY (NULLIF(BTRIM(bk.b_persona_responsable), '') IS NOT NULL) DESC
    LIMIT 1
) be ON true
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
