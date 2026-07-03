# Webhooks de Bitrix24 por etapa — VELSA VENTAS NETLIFE

> **Actualización — multi-empresa:** el mismo endpoint ahora sirve para 2 Bitrix distintos (Novonet y Velsa). Cada URL debe llevar también `&empresa=novonet` o `&empresa=velsa` (si falta, el backend asume `novonet` por retro-compatibilidad con las automatizaciones ya configuradas). Para armar las URLs sin errores, usa las herramientas interactivas en la raíz del repo: **`webhooks_bitrix_etapas.html`** (Novonet, ya con `empresa=novonet`) y **`webhooks_bitrix_etapas_velsa.html`** (Velsa) — cada una tiene un botón "Copiar URL" por etapa. Esta guía en texto queda como referencia de las URLs de Novonet, pero las de Velsa solo están en su HTML.

El mismo endpoint del backend (`/bitrix_webhook.php`) sirve para las 53 etapas de Novonet. Todas las URLs son idénticas EXCEPTO el slug de la etapa, que aparece 2 veces (`event=` y `etapa=`). Copia la plantilla de abajo, reemplaza `SLUG_DE_LA_ETAPA` por el valor de la tabla (en los 2 lugares) y esa es la URL para pegar en esa automatización de Bitrix.

## Plantilla (reemplaza `SLUG_DE_LA_ETAPA` en los 2 lugares marcados)

```
https://erp-backend-v1-qhk2.onrender.com/bitrix_webhook.php?event=SLUG_DE_LA_ETAPA&etapa=SLUG_DE_LA_ETAPA&phone={{Contacto: Teléfono (texto)}}&id={{ID}}&source={{Origen}}&city={{Ciudad}}&repeated={{Negociación repetida}}&responsible={{Persona responsable (texto)}}&utm_source={{UTM Source}}&utm_medium={{UTM Medium}}&utm_campaign={{UTM Campaign}}&utm_content={{UTM Content}}&utm_term={{UTM Term}}&fecha_venta_subida={{Fecha Venta Subida}}&fecha_concretar={{Fecha Concretar}}&modificado_por={{Modificado por > friendly}}&creado_por={{Negociación creada por > friendly}}&creado_por_friendly={{Negociación creada por > friendly}}&pipeline={{Pipeline (texto)}}&etapa_bitrix={{Etapa (texto)}}&comentario={{Comentario}}&iniciado_el={{Iniciado el}}&otro_proveedor={{Otro proveedor (texto)}}&razon_descarte={{Razon Descarte (texto)}}&innegociable={{Innegociable (texto)}}&volver_a_llamar={{Volver a llamar (texto)}}&documentos_pendientes={{Documentos Pendientes (texto)}}&motivo_atc={{MOTIVO ATC (texto)}}&id_conversacion={{ID_CONVERSACION}}&token=bx-8fK2mQzR7pW4nL9x
```

Ejemplo ya armado para "CONTACTO NUEVO" (slug `contacto_nuevo`):

```
https://erp-backend-v1-qhk2.onrender.com/bitrix_webhook.php?event=contacto_nuevo&etapa=contacto_nuevo&phone={{Contacto: Teléfono (texto)}}&id={{ID}}&source={{Origen}}&city={{Ciudad}}&repeated={{Negociación repetida}}&responsible={{Persona responsable (texto)}}&utm_source={{UTM Source}}&utm_medium={{UTM Medium}}&utm_campaign={{UTM Campaign}}&utm_content={{UTM Content}}&utm_term={{UTM Term}}&fecha_venta_subida={{Fecha Venta Subida}}&fecha_concretar={{Fecha Concretar}}&modificado_por={{Modificado por > friendly}}&creado_por={{Negociación creada por > friendly}}&creado_por_friendly={{Negociación creada por > friendly}}&pipeline={{Pipeline (texto)}}&etapa_bitrix={{Etapa (texto)}}&comentario={{Comentario}}&iniciado_el={{Iniciado el}}&otro_proveedor={{Otro proveedor (texto)}}&razon_descarte={{Razon Descarte (texto)}}&innegociable={{Innegociable (texto)}}&volver_a_llamar={{Volver a llamar (texto)}}&documentos_pendientes={{Documentos Pendientes (texto)}}&motivo_atc={{MOTIVO ATC (texto)}}&id_conversacion={{ID_CONVERSACION}}&token=bx-8fK2mQzR7pW4nL9x
```

## Tabla de slugs (las 53 etapas)

| Etapa en Bitrix | slug (usar en `event=` y `etapa=`) |
|---|---|
| ATC | `atc` |
| ATC/SOPORTE | `atc_soporte` |
| CLIENTE 2 HORAS | `cliente_2_horas` |
| CLIENTE 4 HORAS | `cliente_4_horas` |
| CLIENTE 6 HORAS | `cliente_6_horas` |
| CLIENTE 8 HORAS | `cliente_8_horas` |
| CLIENTE CON ACUERDO | `cliente_con_acuerdo` |
| CLIENTE DISCAPACIDAD | `cliente_discapacidad` |
| CONTACTO NUEVO | `contacto_nuevo` |
| CONTRATO NETLIFE | `contrato_netlife` |
| DESCARTE | `descarte` |
| DESISTE DE COMPRA | `desiste_de_compra` |
| DOCUMENTOS PENDIENTES | `documentos_pendientes` |
| DUPLICADO | `duplicado` |
| FUERA DE COBERTURA | `fuera_de_cobertura` |
| GESTIÓN DIARIA | `gestion_diaria` |
| INNEGOCIABLE | `innegociable` |
| MANTIENE PROVEEDOR | `mantiene_proveedor` |
| NO INTERESA COSTO PLAN | `no_interesa_costo_plan` |
| NO VOLVER A CONTACTAR | `no_volver_a_contactar` |
| OPORTUNIDADES | `oportunidades` |
| OPORTUNIDADES SUPERVISOR | `oportunidades_supervisor` |
| OTRO ASESOR NOVONET | `otro_asesor_novonet` |
| OTRO PROVEEDOR | `otro_proveedor` |
| PENDIENTE CIERRE | `pendiente_cierre` |
| POSTVENTA NOVONET | `postventa_novonet` |
| VENTA SUBIDA | `venta_subida` |
| ZONAS PELIGROSAS | `zonas_peligrosas` |
| OPORTUNIDADES SUPERVISORES MES ACTUAL | `oportunidades_supervisores_mes_actual` |
| ZONA PELIGROSA | `zona_peligrosa` |
| VOLVER A LLAMAR NO CONTESTA | `volver_a_llamar_no_contesta` |
| SEGUIMIENTO NEGOCIACION | `seguimiento_negociacion` |
| ENVIO REQUISITOS/DOCUMENTOS PENDIENTES | `envio_requisitos_documentos_pendientes` |
| GESTION DIARIA/PENDIENTE CIERRE | `gestion_diaria_pendiente_cierre` |
| CONTACTO NUEVO /SUPERVISOR | `contacto_nuevo_supervisor` |
| MAS DE 15 DIAS PARA CIERRE | `mas_de_15_dias_para_cierre` |
| DESCARTE REMARKETIZADO | `descarte_remarketizado` |
| NO CONTESTA 15 MINUTOS | `no_contesta_15_minutos` |
| DUPLLICADO | `dupllicado` |
| CONTRATO NETLIFE OTRO ASESOR COMPAÑERO | `contrato_netlife_otro_asesor_companero` |
| CONTRATO NETLIFE POR OTRO CANAL | `contrato_netlife_por_otro_canal` |
| POSTVENTA | `postventa` |
| DESCARTE PLAN DE 200 | `descarte_plan_de_200` |
| NO INTERESA COSTO INSTALACIÓN | `no_interesa_costo_instalacion` |
| VENTA DIRECTA ECUANET | `venta_directa_ecuanet` |
| REGULARIZACION | `regularizacion` |
| REMARKETING DIRARIO ARIEL CURAY | `remarketing_dirario_ariel_curay` |
| NO CONTESTA 30 MINUTOS | `no_contesta_30_minutos` |
| URGENTE GESTION SUPERVISOR | `urgente_gestion_supervisor` |
| REMARKETING | `remarketing` |
| CONTRATO PARAMOUNT | `contrato_paramount` |
| PARAMOUNT SEGUMIENTO POR CERRAR | `paramount_segumiento_por_cerrar` |
| NO CONTESTA 60 MINUTOS | `no_contesta_60_minutos` |

## Qué campos trae cada webhook

Además de los datos originales (teléfono, origen, ciudad, responsable, UTMs), ahora también se capturan:

| Parámetro en la URL | Placeholder de Bitrix |
|---|---|
| `etapa_bitrix` | `{{Etapa (texto)}}` — nombre real de la etapa que reporta Bitrix (útil para comparar contra nuestro slug manual) |
| `fecha_venta_subida` | `{{Fecha Venta Subida}}` |
| `fecha_concretar` | `{{Fecha Concretar}}` |
| `modificado_por` | `{{Modificado por > friendly}}` |
| `creado_por` | `{{Negociación creada por > friendly}}` |
| `creado_por_friendly` | `{{Negociación creada por > friendly}}` |
| `pipeline` | `{{Pipeline (texto)}}` |
| `comentario` | `{{Comentario}}` |
| `iniciado_el` | `{{Iniciado el}}` |
| `otro_proveedor` | `{{Otro proveedor (texto)}}` |
| `razon_descarte` | `{{Razon Descarte (texto)}}` |
| `innegociable` | `{{Innegociable (texto)}}` |
| `volver_a_llamar` | `{{Volver a llamar (texto)}}` |
| `documentos_pendientes` | `{{Documentos Pendientes (texto)}}` |
| `motivo_atc` | `{{MOTIVO ATC (texto)}}` |
| `id_conversacion` | `{{ID_CONVERSACION}}` |

No se duplicó `{{Contacto: Teléfono (texto)}}` (ya estaba como `phone`) ni `{{Origen}}` (ya estaba como `source`).

**Actualización de campos (03/07/2026):** `responsible` ahora usa `{{Persona responsable (texto)}}` (antes `{{Persona responsable}}`), `modificado_por` usa `{{Modificado por > friendly}}` (antes `{{Modificado por}}`), y `creado_por` usa `{{Negociación creada por > friendly}}` (antes `{{Negociación creada por}}` sin " > friendly"). Nota: `creado_por` y `creado_por_friendly` quedan con el mismo placeholder — es intencional, así lo pidió el usuario.

## Cómo funciona la trazabilidad

- Cada webhook actualiza **`bitrix_webhook_leads`** (estado ACTUAL del lead) usando el `{{ID}}` de Bitrix como llave. Si el lead ya existía, TODOS sus campos y su etapa se actualizan — la etapa nueva reemplaza a la anterior.
- Además, **cada** webhook recibido se guarda también en **`bitrix_webhook_leads_historial`**, que nunca se sobreescribe. Ahí queda el recorrido completo (ej. `contacto_nuevo` → `seguimiento_negociacion` → `no_volver_a_contactar`, con fecha de cada cambio).
- Ver recorrido de un lead: `GET /api/bitrix-webhook/historial?bitrix_id=123` (requiere sesión del ERP).
- Ver estado actual de todos (opcionalmente filtrado por etapa): `GET /api/bitrix-webhook/leads?etapa=no_volver_a_contactar` (requiere sesión del ERP).

## Antes de activar los webhooks

1. Ejecutar `backend/src/db/migrations/bitrix_webhook_leads.sql` en la Postgres de Render (`bddgeneral`). Es seguro volver a correrlo aunque ya lo hayas ejecutado antes (usa `IF NOT EXISTS` en todo, incluidas las columnas nuevas).
2. En Render → `erp-backend-v1-qhk2` → Environment, agregar/actualizar `BITRIX_WEBHOOK_TOKEN=bx-8fK2mQzR7pW4nL9x` (mismo valor que ya está en `backend/.env`). **Ojo:** si cambias este token con automatizaciones ya activas en Bitrix, esas URLs viejas (con el token anterior) empiezan a fallar con 401 hasta que las actualices también con el token nuevo.
3. Commit + push de los cambios en `backend/` para que Render redeploye.
4. En cada etapa de Bitrix24 (Automatización → Webhook saliente), pegar la URL armada a partir de la plantilla + el slug de la tabla.

## Notas

- `DUPLICADO`/`DUPLLICADO` y `ZONA PELIGROSA`/`ZONAS PELIGROSAS` quedaron como slugs separados (tal cual me las pasaste). Si en realidad son la misma etapa duplicada por error en Bitrix, dime y unifico el slug.
- Si agregas una etapa nueva que no está en esta tabla, no hace falta tocar código: solo arma la URL con el slug que quieras y el sistema la guarda igual.
