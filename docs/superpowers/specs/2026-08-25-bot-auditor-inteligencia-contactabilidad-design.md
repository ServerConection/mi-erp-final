# Bot Auditor — Inteligencia de Contactabilidad

Fecha: 2026-08-25  
Estado: diseño aprobado para documentación; implementación pendiente

## Objetivo

Convertir la información histórica de Contactabilidad en un tablero gerencial y operativo que permita decidir qué orígenes producen leads más contactables, cómo responde cada asesor, en qué etapas se estancan las conversaciones y en qué días y horas existe mayor probabilidad de respuesta del cliente.

El tablero vivirá dentro de `Bot Auditor` y reutilizará las tablas `contactabilidad_leads` y `contactabilidad_mensajes`. No sustituirá la tabla operativa existente.

## Audiencia y decisiones

- Gerencia: comparar empresas, orígenes, asesores, etapas y períodos.
- Supervisión: detectar cargas desbalanceadas, tiempos altos y leads sin respuesta.
- Operación: identificar qué cliente requiere acción, quién es responsable y cuánto tiempo lleva pendiente.

## Estructura de la pantalla

### 1. Filtros globales

- Desde y hasta, interpretados en `America/Guayaquil`.
- Empresa: todas, NOVONET o VELSA.
- Origen.
- Asesor.
- Etapa.

Todos los bloques, tarjetas y tablas deben responder al mismo conjunto de filtros. La URL conservará los filtros para poder compartir una vista.

### 2. Resumen gerencial

- Leads totales.
- Leads contactados.
- Tasa de contactabilidad.
- Mensajes de clientes.
- Mensajes de asesores.
- Tiempo mediano de primera respuesta del asesor.
- Pendientes por asesor.
- Clientes esperando más de 30 minutos.

### 3. Análisis por origen

Tabla y gráfico con:

- Leads.
- Leads contactados.
- Tasa de contactabilidad.
- Mensajes de cliente por lead.
- Tiempo mediano de primera respuesta.
- Pendientes por asesor.
- Ventas subidas y conversión cuando la etapa permita identificarlas.

El ranking resaltará la muestra. Un origen con menos de 10 leads aparecerá como `muestra insuficiente` y no podrá declararse mejor o peor origen.

### 4. Análisis por asesor

- Leads asignados.
- Leads contactados.
- Mensajes enviados y recibidos.
- Tiempo mediano de primera respuesta.
- Tiempo mediano de respuesta por episodio.
- Pendientes actuales.
- Pendientes mayores a 30 minutos.
- Distribución por etapa.

No se usará el volumen bruto de mensajes como sinónimo de desempeño. Se mostrará junto con carga, contactabilidad y tiempos.

### 5. Análisis por etapa

- Leads actuales.
- Leads contactados.
- Tasa de contactabilidad.
- Mensajes cliente/asesor.
- Pendientes por asesor.
- Tiempo mediano desde el último mensaje del cliente.
- Ventas subidas identificadas por nombre normalizado de etapa.

Una segunda fase podrá utilizar `contactabilidad_etapas` para medir permanencia y transiciones históricas cuando esa tabla tenga cobertura suficiente.

### 6. Horas más contactables

Mapa de calor de lunes a domingo y horas 07:00–22:59 en `America/Guayaquil`.

Para evitar que un cliente muy conversador distorsione el resultado, cada lead contará como máximo una vez por día y hora. La métrica principal será `leads únicos que enviaron al menos un mensaje`. El tooltip mostrará también mensajes totales y tamaño de muestra.

### 7. Embudo conversacional

Estados calculados y mutuamente inclusivos:

1. Leads creados.
2. Cliente escribió.
3. Asesor respondió después del cliente.
4. Lead actualmente negociable.
5. Venta subida.

Las reglas de `negociable` y `venta subida` reutilizarán las normalizaciones existentes del ERP; no se crearán listas de etapas contradictorias.

### 8. Mesa operativa

Mantendrá la tabla actual y agregará prioridad:

- Cliente y ID Bitrix.
- Asesor e ID.
- Origen.
- Etapa.
- Fecha de creación.
- Mensajes cliente/asesor.
- Último mensaje de cada parte.
- Pendiente por.
- Minutos pendientes.
- Semáforo: normal, 30–60 minutos, más de 60 minutos.

## Definiciones y fórmulas

### Contactado

Un lead está contactado cuando tiene al menos un mensaje real clasificado como `CLIENTE`.

### Tasa de contactabilidad

`leads con al menos un mensaje de cliente / leads totales * 100`.

### Primera respuesta del asesor

Tiempo entre el primer mensaje del cliente y el primer mensaje posterior del asesor. Los mensajes del asesor anteriores al primer mensaje del cliente no cuentan como respuesta.

### Episodio de respuesta

Una secuencia de uno o más mensajes consecutivos del cliente termina con el primer mensaje posterior del asesor. El tiempo del episodio se mide desde el primer mensaje de esa secuencia. Secuencias todavía sin respuesta quedan pendientes y no se incluyen en promedios cerrados.

### Agregación de tiempos

La medida principal será la mediana, no el promedio, para reducir el efecto de valores extremos. Se podrá mostrar percentil 90 como indicador de riesgo.

### Pendiente mayor a 30 minutos

El último mensaje real pertenece al cliente y han transcurrido al menos 30 minutos en `America/Guayaquil` sin un mensaje posterior del asesor.

## Arquitectura

### Backend

Se agregará un endpoint analítico bajo `/api/bot-auditor/contactabilidad/analytics` que devolverá agregaciones, no mensajes crudos. Aceptará los filtros globales y responderá con:

- `resumen`
- `por_origen`
- `por_asesor`
- `por_etapa`
- `por_hora`
- `embudo`
- `operativo`
- `calidad_datos`

Las consultas usarán parámetros PostgreSQL, zona horaria explícita e índices existentes. Si el volumen crece, se dividirá en endpoints por bloque o se añadirá caché corta; no se introducirá una vista materializada hasta medir tiempos reales.

Los tiempos de respuesta se calcularán desde `contactabilidad_mensajes` mediante ventanas SQL. Los campos consolidados de `contactabilidad_leads` podrán actualizarse durante el recálculo, pero el endpoint no dependerá de valores incompletos.

### Frontend

La página `Contactabilidad` tendrá dos pestañas:

- `Inteligencia`: resumen, orígenes, asesores, etapas, horas y embudo.
- `Operación`: tabla detallada y alertas.

Se reutilizará la librería de gráficos ya instalada en el ERP y el estilo visual del sistema. Los gráficos recibirán datos preagregados del backend.

## Calidad y transparencia

- Mostrar fecha de última sincronización.
- Mostrar cobertura: leads con mensajes, asesor, origen y etapa.
- Indicar muestras insuficientes.
- Diferenciar cero real de dato no disponible.
- No presentar causalidad: un origen contactable no necesariamente es rentable o vendible.
- La futura puntuación de `lead vendible` será otro diseño y requerirá ventas, descartes y cobertura; no se inferirá solo con mensajes.

## Manejo de errores

- Si falla un bloque analítico, el endpoint responderá error controlado y registrará el bloque afectado.
- El frontend conservará los filtros y mostrará un estado de reintento.
- Una sincronización parcial no borrará resultados históricos existentes.
- Las consultas no expondrán texto de mensajes, teléfonos ni webhooks.

## Pruebas y aceptación

- Pruebas SQL/controlador para filtros de fecha Ecuador, empresa, origen, asesor y etapa.
- Casos de primera respuesta, ráfaga de mensajes, conversación sin respuesta y mensaje previo del asesor.
- Prueba de deduplicación por lead/día/hora.
- Prueba de muestra insuficiente por origen.
- Prueba de consistencia: las tarjetas y agrupaciones deben usar el mismo universo filtrado.
- Pruebas del frontend para cambio de filtros, estados vacíos y error.
- Compilación completa del frontend y pruebas existentes de Contactabilidad.

## Fuera de alcance inicial

- IA generativa o GPU.
- Lectura del contenido textual de los mensajes.
- Predicción automática de compra.
- Envío automático de mensajes o reasignación de asesores.
- Comparación económica de pauta sin integrar inversión y ventas verificadas.

## Despliegue

El cambio será aditivo: endpoint nuevo y ampliación de la página existente. No modifica ni elimina tablas actuales. Se desplegará primero el backend y después el frontend. La versión anterior de la tabla seguirá disponible en la pestaña `Operación`.
