# Columnas VELSA (form 251603619851660)

Extraído de tu pipeline ya existente en
`DesarrolloBaseDatos\JotForm\jotform-sync-velsa\sql\01_crear_tabla_velsa.sql`
(tabla final `jotform_maestra_final_velsa`).

Diferencia importante con Novonet: para Velsa no encontré el `CREATE VIEW` de
`vw_jotform_velsa_netlife_completo` en ningún archivo del proyecto — esa
vista vive directo en la base de datos y no está en el código versionado.
Por eso aquí solo puedo darte el NOMBRE de cada columna (ya en texto,
resuelto), no el qid de Jotform detrás de cada una. Si quieres esa
trazabilidad, hay que pedir el `CREATE VIEW` directo desde pgAdmin
(`SELECT pg_get_viewdef('vw_jotform_velsa_netlife_completo')`) y te la
documento igual que la de Novonet.

Como con Novonet: esto no es una lectura en vivo de la API de Jotform, es lo
que tu pipeline ya usa en producción.

| # | Columna |
|---|---|
| 1 | submission_id (PK) |
| 2 | form_id |
| 3 | estatus_envio |
| 4 | ip_origen |
| 5 | device |
| 6 | browser |
| 7 | platform |
| 8 | fecha_registro_sistema |
| 9 | anio_registro_sistema |
| 10 | mes_registro_sistema |
| 11 | dia_num_registro_sistema |
| 12 | dia_abc_registro_sistema |
| 13 | codigo_asesor |
| 14 | nombre_y_codigo_asesor |
| 15 | distribuidor_autorizado |
| 16 | id_negociacion_bitrix |
| 17 | id_bitrix_ghl |
| 18 | supervisor |
| 19 | origen_venta |
| 20 | venta_nueva_reingreso |
| 21 | turno |
| 22 | nombre_atc |
| 23 | doc_atc |
| 24 | nombre_del_asesor |
| 25 | clausulas |
| 26 | chargebac_status |
| 27 | correo_respaldo_venta |
| 28 | tarea_administrativa |
| 29 | supervisor_tarea |
| 30 | cliente_tipo |
| 31 | nombre_empresa_ruc |
| 32 | tipo_documento_identidad |
| 33 | numero_identificacion |
| 34 | cliente_nombres |
| 35 | cliente_apellidos |
| 36 | cliente_nombre_completo |
| 37 | estado_civil |
| 38 | genero_cliente |
| 39 | fecha_nacimiento_dia |
| 40 | fecha_nacimiento_mes |
| 41 | fecha_nacimiento_anio |
| 42 | fecha_nacimiento_completa |
| 43 | fecha_nacimiento_formato |
| 44 | correo_cliente |
| 45 | telefono_pin |
| 46 | telefono_celular |
| 47 | telefono_adicional |
| 48 | provincia |
| 49 | ciudad |
| 50 | parroquia_barrio |
| 51 | calle_principal_numero |
| 52 | calle_secundaria |
| 53 | direccion_completa |
| 54 | manzana_villa_lote |
| 55 | referencia_como_llegar |
| 56 | tipo_vivienda_edificio |
| 57 | vivienda_propiedad |
| 58 | coordenadas_gps |
| 59 | plan_casa |
| 60 | plan_pyme |
| 61 | plan_profesional |
| 62 | plan_hogar_adulto_mayor |
| 63 | plan_pyme_corp |
| 64 | plan_centro_red_comercial |
| 65 | servicio_normales |
| 66 | servicio_empaquetado |
| 67 | forma_pago |
| 68 | cuenta_bancaria_info |
| 69 | tarjeta_credito |
| 70 | tarjeta_credito_estado |
| 71 | aplica_descuento |
| 72 | valor_descuento |
| 73 | mes_descuento |
| 74 | valor_pago |
| 75 | agendamiento_turnos |
| 76 | recaudadas_estado |
| 77 | fecha_recaudacion |
| 78 | fecha_recaudada |
| 79 | compromiso_pago_texto |
| 80 | compromiso_pago_textbox |
| 81 | compromiso_pago_opciones |
| 82 | fecha_compromiso_pago |
| 83 | inicio_sesion_netlife |
| 84 | estado_venta_netlife |
| 85 | observacion_telcos |
| 86 | ingreso_telcos_vendedores |
| 87 | errores_telcos |
| 88 | fecha_ingresa_telcos |
| 89 | fecha_activacion_telcos |
| 90 | auditado |
| 91 | auditado_por |
| 92 | auditado_velsa |
| 93 | atc_velsa_ingresa |
| 94 | auditoria_documentos |
| 95 | velsa_auditoria |
| 96 | auditoria_documentos_velsa |
| 97 | inconsistencia_documental |
| 98 | inconsistencia_velsa |
| 99 | calidad_venta |
| 100 | observacion_auditoria |
| 101 | observacion_auditoria_velsa |
| 102 | regularizar_estado |
| 103 | detalle_regularizacion |
| 104 | regularizado |
| 105 | estado_regularizacion_novo |
| 106 | motivo_regularizacion_interna |
| 107 | quien_pide_regularizar |
| 108 | mes_solicitud_interno |
| 109 | atc_meses_regularizar |
| 110 | excepcion_ingreso_venta |
| 111 | nombre_supervisor_excepcion |
| 112 | porque_rechaza_regularizacion |
| 113 | codigo_regulariza |
| 114 | velsa_requiere_regularizar |
| 115 | seguimiento_correo_velsa |
| 116 | fecha_solicitud_asesor_interna |
| 117 | fecha_atc_pide_regularizacion |
| 118 | fecha_rechazo |
| 119 | fecha_rechazo_regularizacion_velsa |
| 120 | documentos_enviados |
| 121 | documentos_enviados_html |
| 122 | documentos_enviados_adicionales |
| 123 | numero_guia_llamada |
| 124 | fecha_agenda |
| 125 | fecha_bienvenida |
| 126 | fecha_ultimo_contacto |
| 127 | fecha_descuento |
| 128 | observacion |
| 129 | observacion_venta |
| 130 | observacion_bienvenido |
| 131 | comentarios_1 |
| 132 | comentarios_2 |
| 133 | comentarios_3 |
| 134 | updated_at_origen |
| 135 | respuestas_completas (JSON completo de respaldo) |
| 136 | sincronizado_at |
