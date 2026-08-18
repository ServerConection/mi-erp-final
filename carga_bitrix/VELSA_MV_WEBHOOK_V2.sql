-- ============================================================================
-- VELSA — la MV pasa a leer del WEBHOOK  (bitrix_webhook_leads, empresa='velsa')
-- ============================================================================
-- ANTES: leia public.negociaciones_reporteria (fuente vieja, ETL atrasado).
-- AHORA: lee public.bitrix_webhook_leads WHERE empresa='velsa' — la misma
--        tabla que Novonet, actualizada en tiempo real por el webhook.
--
-- TODAS las columnas de la MV se conservan EXACTAMENTE igual, incluidas las
-- ~130 de Jotform. El unico cambio es de donde sale el lado CRM.
-- El cruce con Jotform sigue siendo por id_bitrix_ghl (que es el que tiene
-- datos: 1.301 de 1.302; id_negociacion_bitrix esta 100% vacio).
--
-- Se recrean tambien los 2 objetos que dependen de la MV, con su definicion
-- actual sin cambios: vw_bitrix_velsa y mv_monitoreo_redes_velsa.
--
-- No se pierde ninguna columna ni ningun objeto.
-- ============================================================================

DROP MATERIALIZED VIEW IF EXISTS public.mv_indicadores_velsa_completo CASCADE;

CREATE MATERIALIZED VIEW public.mv_indicadores_velsa_completo AS
WITH nr AS (
  -- Reemplazo de negociaciones_reporteria por el webhook.
  -- Emite los MISMOS nombres de columna para que el SELECT de abajo quede igual.
  SELECT
    w.bitrix_id::bigint                                   AS id,
    NULLIF(BTRIM(w.responsible), '')::text                AS responsable_nombre,
    CASE
      WHEN w.etapa IN ('inegociable', 'innegociable') THEN 'INNEGOCIABLE'
      WHEN w.etapa = 'regularizacion'                 THEN 'REGULARIZACION'
      ELSE UPPER(BTRIM(w.etapa_bitrix))
    END                                                   AS etapa,
    -- Se suman 8h porque el SELECT de abajo resta 8h (asi estaba la MV original).
    -- Resultado final: hora America/Guayaquil, identico a antes.
    (w.created_at AT TIME ZONE 'America/Guayaquil') + '08:00:00'::interval AS creado_en,
    (w.updated_at AT TIME ZONE 'America/Guayaquil') + '08:00:00'::interval AS modificado_en,
    NULLIF(BTRIM(w.source), '')::text                     AS fuente,
    NULL::text                                            AS cerrado,
    w.comentario                                          AS comentarios
  FROM public.bitrix_webhook_leads w
  WHERE w.empresa = 'velsa'
)
SELECT
    COALESCE(nr.id::bigint, jf.id) AS id_registro,
    nr.id AS id_crm,
    jf.id AS id_jotform,
        CASE
            WHEN (nr.responsable_nombre IS NULL OR TRIM(BOTH FROM nr.responsable_nombre) = ''::text) AND jf.id IS NOT NULL THEN COALESCE(ca.asesor, jf.nombre_del_asesor::character varying)::text
            ELSE nr.responsable_nombre
        END AS asesor,
    nr.etapa AS etapa_crm,
    nr.creado_en - '08:00:00'::interval AS fecha_creacion_crm,
    nr.modificado_en - '08:00:00'::interval AS fecha_modificacion_crm,
    (nr.creado_en - '08:00:00'::interval)::date AS fecha_creacion_date,
    (nr.modificado_en - '08:00:00'::interval)::date AS fecha_modificacion_date,
    nr.fuente AS origen,
    nr.cerrado AS cerrado_crm,
    nr.comentarios AS comentarios_crm,
    jf.nombre_del_asesor AS asesor_jotform,
    COALESCE(us.supervisor_nombre, jf.supervisor::character varying) AS supervisor,
    jf.estado_venta_netlife AS estado_venta,
    replace(replace(COALESCE(jf.estado_regularizacion_novo, ''::text), '{kzzvj20ufy}'::text, 'POR REGULARIZAR'::text), '{yzom82705kp}'::text, 'INGRESO REGULARIZADO'::text) AS estado_regularizacion,
    jf.forma_pago,
    jf.aplica_descuento,
    jf.inicio_sesion_netlife,
    jf.observacion_telcos,
    jf.observacion,
    jf.created_at AS created_at_utc,
    jf.created_at - '05:00:00'::interval AS fecha_registro_jotform,
    (jf.created_at - '05:00:00'::interval)::date AS fecha_registro_date,
    jf.fecha_activacion_telcos AS fecha_activacion,
    jf.fecha_activacion_telcos::date AS fecha_activacion_date,
    CURRENT_TIMESTAMP AS refresh_timestamp,
    jf._sync_id, jf._synced_at, jf.submission_id, jf.form_id, jf.updated_at, jf.status,
    jf.synced_at, jf.answers, jf.raw_payload, jf.ip, jf.device, jf.browser, jf.platform,
    jf.payload_created_at, jf.payload_updated_at, jf.flag, jf.is_new, jf.notes,
    jf.codigo_asesor, jf.nombre_y_codigo_asesor, jf.distribuidor_autorizado,
    jf.id_negociacion_bitrix, jf.id_bitrix_ghl, jf.clausulas, jf.chargebac_status,
    jf.cliente_tipo, jf.nombre_empresa_ruc, jf.tipo_documento_identidad,
    jf.numero_identificacion, jf.cliente_nombres, jf.cliente_apellidos,
    jf.cliente_nombre_completo, jf.estado_civil, jf.genero_cliente,
    jf.fecha_nacimiento_dia, jf.fecha_nacimiento_mes, jf.fecha_nacimiento_anio,
    jf.fecha_nacimiento_completa, jf.fecha_nacimiento_formato, jf.correo_cliente,
    jf.telefono_pin, jf.telefono_celular, jf.telefono_adicional, jf.provincia, jf.ciudad,
    jf.parroquia_barrio, jf.calle_principal_numero, jf.calle_secundaria,
    jf.direccion_completa, jf.manzana_villa_lote, jf.referencia_como_llegar,
    jf.tipo_vivienda_edificio, jf.vivienda_propiedad, jf.coordenadas_gps,
    jf.plan_casa, jf.plan_pyme, jf.plan_profesional, jf.plan_hogar_adulto_mayor,
    jf.plan_pyme_corp, jf.plan_centro_red_comercial, jf.servicio_normales,
    jf.servicio_empaquetado_feb2025, jf.cuenta_bancaria_info, jf.tarjeta_credito,
    jf.tarjeta_credito_estado, jf.valor_descuento, jf.mes_descuento, jf.origen_venta,
    jf.venta_nueva_reingreso, jf.observacion_venta, jf.correo_respaldo_venta,
    jf.tarea_administrativa, jf.supervisor_tarea, jf.documentos_enviados,
    jf.documentos_enviados_html, jf.documentos_enviados_adicionales, jf.turno,
    jf.doc_atc, jf.nombre_atc, jf.auditado_por, jf.auditado, jf.auditado_velsa,
    jf.atc_velsa_ingresa, jf.auditoria_documentos, jf.velsa_auditoria,
    jf.auditoria_documentos_velsa, jf.inconsistencia_documental, jf.inconsistencia_velsa,
    jf.calidad_venta, jf.regularizar_estado, jf.detalle_regularizacion, jf.regularizado,
    jf.estado_regularizacion_novo, jf.motivo_regularizacion_interna,
    jf.quien_pide_regularizar, jf.mes_solicitud_interno, jf.atc_meses_regularizar,
    jf.excepcion_ingreso_venta, jf.nombre_supervisor_excepcion,
    jf.porque_rechaza_regularizacion, jf.observacion_auditoria,
    jf.observacion_auditoria_velsa, jf.codigo_regulariza, jf.velsa_requiere_regularizar,
    jf.seguimiento_correo_velsa, jf.ingreso_telcos_vendedores, jf.errores_telcos,
    jf.recaudadas_estado, jf.valor_pago, jf.agendamiento_turnos, jf.compromiso_pago_texto,
    jf.compromiso_pago_textbox, jf.compromiso_pago_opciones, jf.observacion_bienvenido,
    jf.comentarios_1, jf.comentarios_2, jf.comentarios_3, jf.numero_guia_llamada,
    jf.fecha_solicitud_asesor_interna, jf.fecha_atc_pide_regularizacion, jf.fecha_rechazo,
    jf.fecha_rechazo_regularizacion_velsa, jf.fecha_ingresa_telcos, jf.fecha_agenda,
    jf.fecha_recaudacion, jf.fecha_recaudada, jf.fecha_compromiso_pago,
    jf.fecha_ultimo_contacto, jf.fecha_bienvenida, jf.fecha_descuento
   FROM nr
     FULL JOIN vw_jotform_velsa_netlife_completo jf ON nr.id::text = jf.id_bitrix_ghl
     LEFT JOIN usuarios_supervisor us ON lower(us.nombre_usuario::text) = lower(nr.responsable_nombre)
     LEFT JOIN codigos_asesores ca ON upper(TRIM(BOTH FROM jf.codigo_asesor)) = upper(TRIM(BOTH FROM ca.codigo)) AND (nr.responsable_nombre IS NULL OR TRIM(BOTH FROM nr.responsable_nombre) = ''::text) AND jf.id IS NOT NULL;

CREATE INDEX idx_mv_velsa_id_crm     ON public.mv_indicadores_velsa_completo(id_crm);
CREATE INDEX idx_mv_velsa_id_jotform ON public.mv_indicadores_velsa_completo(id_jotform);
CREATE INDEX idx_mv_velsa_etapa      ON public.mv_indicadores_velsa_completo(etapa_crm);
CREATE INDEX idx_mv_velsa_estado     ON public.mv_indicadores_velsa_completo(estado_venta);
CREATE INDEX idx_mv_velsa_fecha_crm  ON public.mv_indicadores_velsa_completo(fecha_creacion_date);
CREATE INDEX idx_mv_velsa_fecha_jot  ON public.mv_indicadores_velsa_completo(fecha_registro_date);
CREATE INDEX idx_mv_velsa_ts_crm     ON public.mv_indicadores_velsa_completo(fecha_creacion_crm);
CREATE INDEX idx_mv_velsa_ts_jot     ON public.mv_indicadores_velsa_completo(fecha_registro_jotform);

GRANT SELECT ON public.mv_indicadores_velsa_completo TO PUBLIC;


-- ── Se recrea vw_bitrix_velsa (definicion actual, sin cambios) ───────────────
CREATE OR REPLACE VIEW public.vw_bitrix_velsa AS
 WITH wh AS (
         SELECT w_1.bitrix_id AS b_id,
            upper(TRIM(BOTH FROM w_1.etapa_bitrix)) AS b_etapa_bitrix,
            w_1.etapa AS b_etapa_slug,
            (w_1.created_at AT TIME ZONE 'America/Guayaquil'::text)::date AS b_creado_el_fecha,
            (w_1.updated_at AT TIME ZONE 'America/Guayaquil'::text)::date AS b_modificado_el_fecha,
            NULLIF(TRIM(BOTH FROM w_1.responsible), ''::text) AS b_responsable_wh,
            NULLIF(TRIM(BOTH FROM w_1.source), ''::text) AS b_origen_wh,
            NULLIF(TRIM(BOTH FROM w_1.pipeline), ''::text) AS b_pipeline,
            NULLIF(TRIM(BOTH FROM w_1.phone), ''::text) AS b_telefono,
            NULLIF(TRIM(BOTH FROM w_1.razon_descarte), ''::text) AS b_razon_descarte,
            w_1.created_at,
            w_1.updated_at
           FROM bitrix_webhook_leads w_1
          WHERE w_1.empresa::text = 'velsa'::text AND w_1.etapa::text <> 'duplicado'::text
        )
 SELECT COALESCE(w.b_id, mv.id_crm::text::character varying) AS b_id,
    COALESCE(w.b_etapa_bitrix, upper(TRIM(BOTH FROM mv.etapa_crm))) AS b_etapa_de_la_negociacion,
    w.b_etapa_slug,
    COALESCE(w.b_creado_el_fecha, mv.fecha_creacion_crm::date) AS b_creado_el_fecha,
    w.b_modificado_el_fecha,
    COALESCE(w.b_responsable_wh, mv.asesor) AS b_persona_responsable,
    COALESCE(w.b_origen_wh, mv.origen) AS b_origen,
    w.b_pipeline,
    w.b_telefono,
    w.b_razon_descarte,
    w.created_at,
    w.updated_at,
    mv.supervisor AS sup_mv,
    mv.codigo_asesor,
    mv.fecha_registro_jotform::text AS j_fecha_registro_sistema,
    mv.id_crm::text AS j_id_bitrix,
    mv.estado_venta AS j_netlife_estatus_real,
    mv.fecha_activacion::text AS j_fecha_activacion_netlife,
    mv.estado_regularizacion AS j_estatus_regularizacion,
    mv.detalle_regularizacion AS j_detalle_regularizacion,
    mv.forma_pago AS j_forma_pago,
    mv.aplica_descuento AS j_aplica_descuento_3ra_edad,
    mv.inicio_sesion_netlife AS j_netlife_login,
    mv.fecha_agenda::text AS j_fecha_agenda,
    mv.ciudad AS j_ciudad,
    COALESCE(mv.plan_casa, mv.plan_profesional, mv.plan_pyme, mv.plan_pyme_corp, mv.plan_hogar_adulto_mayor, mv.plan_centro_red_comercial) AS j_plan_contratado_final
   FROM wh w
     FULL JOIN mv_indicadores_velsa_completo mv ON mv.id_crm::text = w.b_id::text;


-- ── Se recrea mv_monitoreo_redes_velsa (definicion actual, sin cambios) ──────
CREATE MATERIALIZED VIEW public.mv_monitoreo_redes_velsa AS
 WITH base AS (
         SELECT v.fecha_creacion_date AS fecha,
            TRIM(BOTH FROM to_char(v.fecha_creacion_date::timestamp without time zone, 'Day'::text)) AS dia_semana,
            EXTRACT(day FROM v.fecha_creacion_date)::integer AS dia_mes,
            EXTRACT(month FROM v.fecha_creacion_date)::integer AS mes,
            EXTRACT(year FROM v.fecha_creacion_date)::integer AS anio,
            COALESCE(NULLIF(TRIM(BOTH FROM v.origen_venta), ''::text), NULLIF(TRIM(BOTH FROM v.origen), ''::text), 'SIN ORIGEN'::text) AS canal_publicidad,
            count(*) AS n_leads,
            count(*) FILTER (WHERE v.etapa_crm ~~* '%ATC%'::text) AS atc,
            count(*) FILTER (WHERE v.etapa_crm ~~* '%FUERA DE COBERTURA%'::text) AS fuera_cobertura,
            count(*) FILTER (WHERE v.etapa_crm ~~* '%ZONA%PELIGROS%'::text) AS zona_peligrosa,
            count(*) FILTER (WHERE v.etapa_crm ~~* '%INNEGOCIABLE%'::text) AS innegociable,
            count(*) FILTER (WHERE v.etapa_crm ~~* '%DUPLICADO%'::text) AS duplicado,
            count(*) FILTER (WHERE v.etapa_crm ~~* '%DESCARTE%'::text) AS descarte,
            count(*) FILTER (WHERE v.etapa_crm ~~* '%VENTA SUBIDA%'::text) AS venta_subida,
            count(*) FILTER (WHERE v.etapa_crm ~~* '%SEGUIMIENTO%'::text) AS seguimiento_negociacion,
            count(*) FILTER (WHERE v.etapa_crm ~~* '%REGULARIZAC%'::text) AS regularizacion,
            count(*) FILTER (WHERE v.etapa_crm ~~* '%15 DIAS%'::text) AS mas_15_dias_cierre,
            count(*) FILTER (WHERE v.etapa_crm ~~* '%CONTACTO NUEVO%'::text) AS contacto_nuevo_supervisor,
            count(*) FILTER (WHERE v.etapa_crm ~~* '%URGENTE%'::text) AS urgente_gestion_supervisor,
            count(*) FILTER (WHERE v.etapa_crm ~~* '%ENVIO REQUISITOS%'::text OR v.etapa_crm ~~* '%DOCUMENTOS PENDIENTES%'::text) AS envio_requisitos,
            count(*) FILTER (WHERE v.estado_venta ~~* '%ACTIVO%'::text) AS activos_jotform,
            count(*) FILTER (WHERE v.estado_venta ~~* '%FIN DE GESTI%'::text) AS fin_gestion_jotform,
            count(*) FILTER (WHERE v.estado_venta ~~* '%RECHAZADO%'::text) AS rechazado_jotform,
            count(*) FILTER (WHERE v.estado_venta ~~* '%DESISTE%'::text) AS desiste_servicio_jotform
           FROM mv_indicadores_velsa_completo v
          WHERE v.fecha_creacion_date IS NOT NULL
          GROUP BY v.fecha_creacion_date, (TRIM(BOTH FROM to_char(v.fecha_creacion_date::timestamp without time zone, 'Day'::text))), (EXTRACT(day FROM v.fecha_creacion_date)::integer), (EXTRACT(month FROM v.fecha_creacion_date)::integer), (EXTRACT(year FROM v.fecha_creacion_date)::integer), (COALESCE(NULLIF(TRIM(BOTH FROM v.origen_venta), ''::text), NULLIF(TRIM(BOTH FROM v.origen), ''::text), 'SIN ORIGEN'::text))
        )
 SELECT fecha, dia_semana, dia_mes, mes, anio, canal_publicidad, n_leads, atc,
    fuera_cobertura, zona_peligrosa, innegociable, duplicado, descarte, venta_subida,
    seguimiento_negociacion, regularizacion, mas_15_dias_cierre,
    contacto_nuevo_supervisor, urgente_gestion_supervisor, envio_requisitos,
    activos_jotform, fin_gestion_jotform, rechazado_jotform, desiste_servicio_jotform,
    round(venta_subida::numeric / NULLIF(n_leads, 0)::numeric, 4) AS pct_venta_subida,
    round(atc::numeric / NULLIF(n_leads, 0)::numeric, 4) AS pct_atc,
    round((fuera_cobertura + zona_peligrosa + innegociable + duplicado + descarte)::numeric / NULLIF(n_leads, 0)::numeric, 4) AS pct_descartado
   FROM base
  ORDER BY fecha DESC, n_leads DESC;

GRANT SELECT ON public.mv_monitoreo_redes_velsa TO PUBLIC;


-- ── VERIFICACION ────────────────────────────────────────────────────────────
SELECT etapa_crm, COUNT(*) AS leads
FROM public.mv_indicadores_velsa_completo
WHERE fecha_creacion_date >= DATE '2026-08-01'
GROUP BY 1 ORDER BY 2 DESC;

-- Comparalo contra Bitrix VELSA filtrando por "Creado" desde el 01/08.
