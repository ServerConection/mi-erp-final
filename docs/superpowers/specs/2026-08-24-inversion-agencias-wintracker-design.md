# Diseño: inversión por agencia desde WinTracker

Fecha: 2026-08-24

## Objetivo

Integrar la inversión diaria de las agencias ARTS, VIDIKA y VELSA con el módulo Redes, manteniendo separados los orígenes reales de Bitrix y los totales de pauta entregados por WinTracker.

La solución debe permitir asignar cada línea/origen a una agencia, consultar automáticamente las tres API, mostrar inversión y métricas por agencia, y evitar repartir artificialmente un total de agencia entre líneas individuales.

## Alcance

- Novonet tendrá las agencias ARTS y VIDIKA.
- Velsa tendrá la agencia VELSA.
- Los orígenes de Novonet salen de `bitrix_webhook_leads` con `empresa = 'novonet'`.
- Los orígenes de Velsa salen de su fuente viva vigente y se mantienen separados de Novonet.
- Las tablas actuales de asignación origen-agencia se reutilizan.
- La inversión deja de depender de orígenes sintéticos como `__WINTRACKER_ARTS__`.
- No se elimina todavía `mestra_bitrix` ni se modifica la migración general CRM/Jotform.

## Modelo de datos

Se creará una tabla canónica de inversión diaria por agencia con las siguientes columnas conceptuales:

- `empresa`: `NOVONET` o `VELSA`.
- `agencia`: `ARTS`, `VIDIKA` o `VELSA`.
- `fecha`: día reportado por WinTracker.
- `monto_usd`: inversión consolidada diaria.
- `fuente`: `wintracker_api` o `manual`.
- `sincronizado_en`: fecha y hora de la última escritura.
- `creado_por`: proceso o usuario responsable.

La restricción única será `(empresa, agencia, fecha)`. Una resincronización actualizará la fila existente mediante UPSERT y nunca duplicará la inversión.

Las API keys permanecerán únicamente en variables de entorno:

- `WINTRACKER_APIKEY_ARTS`
- `WINTRACKER_APIKEY_VIDIKA`
- `WINTRACKER_APIKEY_VELSA`

## Flujo de datos

1. El usuario asigna cada origen real a una agencia en la pestaña Agencias.
2. El sincronizador consulta WinTracker para ARTS, VIDIKA y VELSA de forma independiente.
3. De cada respuesta consume `consolidado_diario[].fecha` y `consolidado_diario[].inversion`.
4. Guarda un valor por empresa, agencia y fecha en la tabla canónica.
5. Redes agrupa los leads de los orígenes asignados a cada agencia.
6. El resumen cruza esos leads con la inversión diaria de la misma empresa y agencia.
7. Calcula CPL, costo por gestionable y costo por venta usando el total real de agencia.

La inversión no se divide entre líneas. Las líneas sirven para atribuir leads a una agencia; el gasto permanece en el nivel entregado por la API.

## Sincronización

- Frecuencia automática: cada 30 minutos.
- Ventana móvil: se vuelven a consultar al menos los últimos cuatro días para capturar ajustes históricos de plataformas publicitarias.
- Ejecución inicial: una vez al arrancar el proceso de workers.
- Ejecución manual: botón `Actualizar inversión ahora` por empresa/agencia.
- Bloqueo manual: tres minutos por agencia para evitar llamadas repetidas.
- La pantalla siempre lee la base del ERP; recargar el navegador no consulta directamente WinTracker.

El cron debe vivir en el proceso `workers`. No se ejecutará simultáneamente en el servidor HTTP para evitar sincronizaciones duplicadas cuando la aplicación esté desplegada en procesos separados.

## Interfaz

La pestaña Agencias mostrará:

- Origen/línea real.
- Empresa.
- Agencia asignada.
- Estado pendiente cuando no tenga agencia.
- Última sincronización de inversión por agencia.
- Inversión acumulada del rango.
- Botón de actualización manual con estado cargando, éxito, error y tiempo restante del bloqueo.

Los orígenes sin asignación permanecerán visibles y sus leads no se perderán. Se agruparán como `SIN AGENCIA ASIGNADA`, sin atribuirles inversión.

## Manejo de errores

- Cada agencia se sincroniza de forma aislada.
- Un fallo de ARTS no bloquea VIDIKA ni VELSA.
- Un error no borra ni reemplaza el último valor válido.
- Respuestas HTTP inválidas, `ok !== true`, ausencia de `consolidado_diario`, fechas inválidas o montos no numéricos se registran como fallo.
- La API y los logs nunca exponen API keys.
- El endpoint manual requiere autenticación y perfiles no asesores.
- El bloqueo de tres minutos se valida en backend, no solo en la interfaz.

## Migración y compatibilidad

1. Crear la tabla canónica sin eliminar las tablas actuales.
2. Activar el nuevo sincronizador con escritura dual opcional durante validación.
3. Comparar por fecha los totales nuevos contra Arts y Velsa ya almacenados.
4. Configurar y probar `WINTRACKER_APIKEY_VIDIKA` fuera de Git.
5. Cambiar los resúmenes de Redes para leer la tabla canónica.
6. Mantener temporalmente las rutas manuales actuales como respaldo.
7. Retirar orígenes sintéticos solamente después de verificar un período completo.

La migración es aditiva y reversible: si el nuevo resumen falla, las tablas y consultas anteriores permanecen disponibles durante la transición.

## Pruebas y criterios de aceptación

- Las tres API responden con `ok = true` y `consolidado_diario` válido.
- La suma de inversión diaria coincide con `kpis.inversion` para el mismo rango.
- Dos sincronizaciones del mismo rango no duplican filas.
- Un ajuste histórico actualiza el monto existente.
- El fallo de una agencia no interrumpe las otras.
- Novonet nunca mezcla inversión o líneas de Velsa.
- ARTS y VIDIKA pueden tener múltiples líneas asignadas sin duplicar su inversión.
- Un origen nuevo aparece como pendiente sin necesidad de actualizar catálogos.
- El botón manual respeta el bloqueo de tres minutos.
- El cron se registra una sola vez en `workers` y corre cada 30 minutos.
- Los resultados antiguos y nuevos se comparan en un rango controlado antes de activar el nuevo resumen.

## Seguridad operacional

La API key de Arts expuesta durante la conversación debe rotarse antes del despliegue. Las nuevas claves se configurarán únicamente en el gestor de secretos del entorno y nunca se incluirán en commits, URLs registradas o respuestas del backend.
