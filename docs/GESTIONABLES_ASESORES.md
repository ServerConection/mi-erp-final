# Gestionables por asesor

Módulo `/gestionables-asesores`, disponible en Administración y en las tarjetas del dashboard para ADMINISTRADOR, ANALISTA, COORDINADOR, GERENCIA y SUPERVISOR.

Utiliza la conexión `backend/src/config/dbErp.js` y la tabla existente `erp_database.gestionables_asesores`. No requiere una nueva tabla. Desplegar frontend y backend (monolito o CORE).

## Archivo TXT

UTF-8, con encabezado obligatorio y separador de punto y coma o tabulación (exportación desde Excel):

```text
id;nombre_bitrix_asesor;gestionables_permitidos;fecha_carga
3002;BRIAN PINEDA;4;2026-09-17
3003;NOMBRE COMPLETO DEL ASESOR;0;2026-09-17
```

El ID se ingresa manualmente. La pantalla muestra el mayor ID existente y permite descargar una plantilla. Utilizar el nombre exacto de Bitrix. Un registro por asesor y fecha; para corregirlo, conservar su ID, nombre y fecha. Cantidades enteras no negativas. Máximo 5000 registros por carga y 500 KB por archivo en la interfaz. Un error cancela toda la transacción.

## Ajustes diarios

Seleccionar una fecha, ajustar cuotas con − y +, y pulsar Actualizar. Solo se guardan las filas modificadas. Si otro usuario cambió una de esas cuotas, se rechaza la actualización y se debe consultar nuevamente.

El consumo se calcula desde `bddgeneral.public.mestra_bitrix`, por `b_creado_el_fecha`, responsable y la definición compartida de etapas gestionables del reporte de cumplimiento. Es una consulta del reporte del ERP, no una reserva de cupos del distribuidor de leads. Si el conteo falla, se muestra una advertencia y no se presenta cero como consumo.

Las cuotas se guardan en la tabla que ya consulta el webhook de gestionables. El webhook conserva su comportamiento de seleccionar la última cuota con fecha menor o igual a hoy; este módulo no ejecuta automatizaciones ni redistribuye leads existentes.

## Verificación

`node backend/test/gestionables-carga.test.js`

`npm.cmd run build` desde frontend.
