-- ============================================================
-- Vista "ancha" de jotform_submissions — una columna por pregunta
-- real del formulario 213356674788673, en vez del JSONB comprimido.
-- Es una VIEW (no una tabla nueva): se recalcula sola cada vez que
-- la consultas, siempre con los datos más recientes de
-- jotform_submissions. No requiere tocar el código del webhook.
--
-- Ejecutar conectado a "erp_database" (pgAdmin > Query Tool > F5).
-- Uso: SELECT * FROM jotform_submissions_wide ORDER BY submitted_at DESC;
-- ============================================================

CREATE OR REPLACE VIEW jotform_submissions_wide AS
SELECT
  id,
  submission_id,
  form_id,
  submitted_at,

  data->>'q4_codigoDel'                       AS codigo_del_asesor,
  data->>'q196_codigoAsesor'                  AS codigo_asesor,
  data->>'q179_idDe'                          AS id_negociacion_bitrix,
  data->>'q122_nombreDel122'                  AS distribuidor_autorizado,
  data->>'q202_biometrico'                    AS biometrico,
  data->>'q47_clienteNatural47'               AS cliente_natural_juridico,
  data->>'q151_nombreDe'                      AS nombre_empresa_ruc,
  data->>'q7_documentoDe'                     AS tipo_documento,
  data->>'q9_numeroDe'                        AS numero_identificacion,

  data->'q10_nombresY'->>'first'              AS nombre_cliente,
  data->'q10_nombresY'->>'last'               AS apellido_cliente,

  data->>'q207_generoCliente'                 AS genero_cliente,
  data->>'q11_estadoCivil'                    AS estado_civil,

  NULLIF(data->'q12_fechaDe'->>'year', '') || '-' ||
  LPAD(NULLIF(data->'q12_fechaDe'->>'month', ''), 2, '0') || '-' ||
  LPAD(NULLIF(data->'q12_fechaDe'->>'day', ''), 2, '0')     AS fecha_nacimiento,

  data->>'q14_siEl'                           AS tipo_vivienda,
  data->>'q16_elCliente'                      AS vivienda_propia_arrendada,
  data->>'q15_aplicaDescuento'                AS aplica_descuento,

  data->'q116_direccionDel116'->>'first'      AS direccion_principal,
  data->'q116_direccionDel116'->>'last'       AS direccion_secundaria,

  data->>'q146_provincia'                     AS provincia,
  data->>'q177_ciudad177'                     AS ciudad,
  data->>'q119_parroquiaO119'                 AS parroquia_barrio,
  data->>'q18_manzanaVilla18'                 AS manzana_villa_lote,
  data->>'q118_referenciaDe'                  AS referencia_direccion,

  data->>'q86_1Telefono'                      AS telefono_titular,
  data->>'q87_2Telefono'                      AS telefono_instalacion,
  data->>'q88_3Numero'                        AS telefono_adicional,
  data->>'q48_correoDel'                      AS correo_cliente,

  data->>'q24_formaDe'                        AS forma_pago,
  data->>'q106_tarjetaDe'                     AS tarjeta_credito,
  data->>'q107_ahorros'                       AS ahorros_corriente,

  data->>'q29_planCasa'                       AS plan_casa,
  data->>'q32_planProfesional'                AS plan_profesional,
  data->>'q31_planPyme'                       AS plan_pyme,
  data->>'q148_planGamer'                     AS plan_gamer,
  data->>'q49_planPyme49'                     AS plan_pyme_corp,
  data->>'q33_planHogar'                      AS plan_hogar_adulto_mayor,
  data->>'q209_servicioDigital209'            AS servicio_empaquetado,
  data->>'q120_servicioQue'                   AS servicio_adicional,

  data->>'q34_origenDe'                       AS origen_venta,
  data->>'q36_coordenadasGps'                 AS coordenadas_gps,
  data->>'q152_ingresoA'                      AS ingreso_telcos_vendedores,
  data->>'q38_observacionDe'                  AS observacion_venta,
  data->>'q123_supervisor123'                 AS supervisor,
  data->>'q134_ventaNueva'                    AS venta_nueva_reingreso,

  data->'documentosEnviados'                  AS documentos_urls

FROM jotform_submissions;
