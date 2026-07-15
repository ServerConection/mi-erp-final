# Columnas NOVONET (form 213356674788673)

Extraído de tu pipeline ya existente en `DesarrolloBaseDatos\JotForm\jotform-sync`
(tabla final `jotform_maestra_final`, cruzado con el mapeo de preguntas en
`sql/queries.js` y `jotform-analista-sync/queries_vistas.sql`).

Nota importante: esto NO es una lectura en vivo de Jotform (no tengo acceso a
la API de Jotform desde este entorno). Es la lista de columnas que tu propio
pipeline ya usa en producción, reconstruida a partir del código existente.
Si en el formulario de Jotform se agregó alguna pregunta nueva después de que
se escribió este código, no va a aparecer aquí — hay que correr el
diagnóstico contra la API real para confirmar el 100%.

| # | Columna | Pregunta Jotform (qid) | Notas |
|---|---|---|---|
| 1 | envio_id | id de la submission | PK |
| 2 | estatus_envio | data.status | |
| 3 | ip_origen | data.ip | |
| 4 | fecha_registro_sistema | created_at | |
| 5 | año_registro_sistema | derivado de created_at | |
| 6 | mes_registro_sistema | derivado de created_at | |
| 7 | dia_num_registro_sistema | derivado de created_at | |
| 8 | dia_abc_registro_sistema | derivado de created_at | |
| 9 | codigo_asesor | 4 | |
| 10 | id_bitrix | 179 | |
| 11 | distribuidor_autorizado | 122 | |
| 12 | supervisor | 123 | |
| 13 | origen_venta | 34 | |
| 14 | venta_nueva_o_reingreso | 134 | |
| 15 | turno | 83 | |
| 16 | nombre_atc | 84 | |
| 17 | clausulas | 202 | |
| 18 | lider_comercial | 131 | resuelto vía etiquetas_jotform |
| 19 | tipo_cliente | 47 | |
| 20 | genero_cliente | 207 | |
| 21 | tipo_documento | 7 | |
| 22 | numero_identificacion | 9 | |
| 23 | nombre_cliente_completo | 10 | |
| 24 | estado_civil | 11 | |
| 25 | fecha_nacimiento | 12 | |
| 26 | año_nacimiento | derivado de 12 | |
| 27 | mes_nacimiento | derivado de 12 | |
| 28 | dia_num_nacimiento | derivado de 12 | |
| 29 | dia_abc_nacimiento | derivado de 12 | |
| 30 | email_cliente | 48 | |
| 31 | aplica_descuento_3ra_edad | 15 | resuelto vía etiquetas_jotform |
| 32 | telf_celular_pin | 86 | |
| 33 | telf_celular_2 | 87 | |
| 34 | telf_fijo | 88 | |
| 35 | provincia | 146 | resuelto vía etiquetas_jotform |
| 36 | ciudad | 177 | |
| 37 | parroquia_barrio | 119 | |
| 38 | direccion_calles | 116 | |
| 39 | direccion_manzana_villa | 18 | |
| 40 | referencia_ubicacion | 118 | |
| 41 | coordenadas_gps | 36 | |
| 42 | tipo_vivienda | 14 | |
| 43 | regimen_vivienda | 16 | |
| 44 | plan_contratado_final | 29 / 31 / 32 / 33 / 49 / 120 (coalesce) | primer plan no vacío |
| 45 | servicios_digitales | 209 | |
| 46 | forma_pago | 24 | |
| 47 | detalle_bancario_ahorros | 107 | |
| 48 | valor_pago | 157 | |
| 49 | tipo_contrato | 130 | |
| 50 | estado_recaudacion | 153 | |
| 51 | fecha_recaudada | 161 | |
| 52 | año_recaudada | derivado de 161 | |
| 53 | mes_recaudada | derivado de 161 | |
| 54 | dia_num_recaudada | derivado de 161 | |
| 55 | dia_abc_recaudada | derivado de 161 | |
| 56 | netlife_login | 125 | |
| 57 | netlife_estatus_real | 128 | resuelto vía etiquetas_jotform |
| 58 | fecha_activacion_netlife | 129 | |
| 59 | año_activacion_netlife | derivado de 129 | |
| 60 | mes_activacion_netlife | derivado de 129 | |
| 61 | dia_num_activacion_netlife | derivado de 129 | |
| 62 | dia_abc_activacion_netlife | derivado de 129 | |
| 63 | calidad_venta_analista | 135 | resuelto vía etiquetas_jotform |
| 64 | novedades_atc | 133 | |
| 65 | venta_efectiva | 132 | |
| 66 | auditoria_documentos | 158 | resuelto vía etiquetas_jotform |
| 67 | auditado_por | 216 | resuelto vía etiquetas_jotform |
| 68 | inconsistencia_documental | 205 | resuelto vía etiquetas_jotform |
| 69 | observacion_auditoria | 219 | |
| 70 | errores_telcos | 159 | resuelto vía etiquetas_jotform |
| 71 | estatus_regularizacion | 186 | resuelto vía etiquetas_jotform |
| 72 | detalle_regularizacion | 180 | |
| 73 | fecha_regularizacion_atc | 213 | |
| 74 | año_regularizacion_atc | derivado de 213 | |
| 75 | mes_regularizacion_atc | derivado de 213 | |
| 76 | dia_num_regularizacion_atc | derivado de 213 | |
| 77 | dia_abc_regularizacion_atc | derivado de 213 | |
| 78 | mes_regularizacion | 217 | resuelto vía etiquetas_jotform |
| 79 | observacion_venta_original | 38 | |
| 80 | observacion_gestion_cobranza | 170 | |
| 81 | turno_agendado | 155 | |
| 82 | fecha_agenda | 156 | |
| 83 | año_agenda | derivado de 156 | |
| 84 | mes_agenda | derivado de 156 | |
| 85 | dia_num_agenda | derivado de 156 | |
| 86 | dia_abc_agenda | derivado de 156 | |
| 87 | links_documentos | 43 | JSON |
| 88 | updated_at_origen | updated_at | |
| 89 | respuestas_completas | todas las qid | JSON completo de respaldo |

Campos vistos en `vista_analisis_novonet` (otra vista, del proyecto
`jotform-analista-sync`) que NO están todavía en `jotform_maestra_final`:
qid 151 (nombre_empresa), qid 214 (rechazo_regularizacion), qid 215
(fecha_rechazo), qid 141 (bienvenida_cliente), qid 176 (fecha_bienvenida),
qid 171 (observacion_bienvenida), qid 106 (datos_tarjeta), qid 148
(plan_centro_comercial). Puede que sean preguntas agregadas después, o que
esa vista tenga cosas que la maestra final no adoptó todavía.
