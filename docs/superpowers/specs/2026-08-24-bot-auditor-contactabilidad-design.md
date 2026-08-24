# Diseño: separación de Bot Auditor y analítica de contactabilidad

**Estado:** Aprobado
**Fecha:** 2026-08-24
**Empresas:** NOVONET y VELSA

## 1. Objetivo

Separar las dos funcionalidades actualmente mezcladas dentro de Bot Auditor y añadir un tercer módulo de analítica de contactabilidad. El nuevo módulo debe medir de forma verificable la interacción entre cliente y asesor, conservar la evolución por etapa y permitir comparar la calidad de los leads por origen, empresa, asesor y periodo.

La solución debe responder, como mínimo:

- Cuántos mensajes envió el cliente y cuántos envió el asesor.
- Cuándo escribió por última vez cada parte y cuánto tiempo ha transcurrido.
- Quién tiene pendiente responder.
- Cuánto tardó el asesor en responder por primera vez y en promedio.
- En qué etapa está el lead y cuánto tiempo lleva allí.
- Qué orígenes producen leads más contactables y cuáles acumulan más casos sin respuesta.
- Cómo evolucionó cada lead a través de sus etapas.

## 2. Alcance funcional

La solución cubrirá todas las etapas y todos los orígenes de NOVONET y VELSA. El usuario podrá filtrar por empresa, origen, asesor, etapa y rango de fechas.

Bot Auditor quedará dividido en tres áreas independientes:

1. **Auditoría IA:** evaluación, clasificación y puntuación de conversaciones mediante las reglas y el servicio actuales.
2. **Indicador de códigos:** búsqueda y clasificación por códigos de origen, separada de la auditoría IA.
3. **Contactabilidad:** contadores, tiempos, pendientes, historial por etapa, rankings y alertas operativas.

Las tres áreas podrán permanecer agrupadas bajo Bot Auditor en el menú del ERP, pero tendrán componentes, rutas y controladores separados.

## 3. Decisión arquitectónica

Se usará un modelo de eventos de mensajes más resúmenes derivados. No se calcularán los indicadores consultando todo Bitrix cuando el usuario abra el tablero, ni se conservará únicamente el último resumen del lead.

El servicio recolector consultará Bitrix de forma incremental, persistirá cada mensaje nuevo de manera idempotente, registrará los cambios de etapa y actualizará el estado consolidado del lead. PostgreSQL será la fuente de consulta del tablero.

Esta decisión permite:

- Evitar contadores falsos por ejecuciones repetidas.
- Reconstruir métricas históricas.
- Calcular resultados totales y por etapa.
- Añadir modelos de contactabilidad o intención comercial sin rediseñar la ingesta.
- Mantener el tablero disponible cuando Bitrix tenga una falla temporal.

## 4. Alternativas descartadas

### 4.1 Consultar Bitrix al abrir el tablero

Es sencilla inicialmente, pero aumenta la latencia, consume la API externa, falla si Bitrix no responde y no conserva historia confiable.

### 4.2 Guardar solamente un resumen periódico por lead

Reduce el volumen de datos, pero pierde eventos, dificulta deduplicar, no permite reconstruir cambios de etapa y limita la inteligencia futura.

### 4.3 Eventos y resúmenes derivados — seleccionada

Requiere más estructura de base de datos, pero ofrece exactitud, trazabilidad, rendimiento de consulta y extensibilidad.

## 5. Modelo de datos conceptual

### 5.1 `contactabilidad_leads`

Estado consolidado actual de una negociación:

- Empresa e ID de Bitrix.
- Nombre del cliente.
- ID y nombre del asesor asignado.
- Origen de la negociación.
- Fecha y hora de creación.
- Etapa actual y fecha de entrada en la etapa.
- Contadores históricos de mensajes del cliente y del asesor.
- Contadores de la etapa actual.
- Fecha y hora del último mensaje del cliente y del asesor.
- Fecha y hora de la primera respuesta del asesor.
- Tiempo promedio y máximo de respuesta.
- Parte que tiene pendiente responder.
- Fecha y resultado de la última sincronización.

La identidad lógica será `(empresa, id_bitrix)` porque los IDs pueden repetirse entre los dos CRM.

### 5.2 `contactabilidad_mensajes`

Historial deduplicado de mensajes:

- Empresa, lead, chat e ID externo del mensaje.
- Tipo de emisor: `CLIENTE` o `ASESOR`.
- ID y nombre del emisor cuando Bitrix los entregue.
- Fecha y hora original del mensaje.
- Etapa del lead en el momento de la captura.
- Metadatos necesarios para el canal y la secuencia de respuesta.
- Texto anonimizado únicamente cuando sea necesario para análisis de intención.

La clave idempotente debe incluir la empresa, el chat y el ID externo del mensaje. Si Bitrix no entrega un ID estable en algún canal, se utilizará una huella determinista documentada a partir de campos estables.

### 5.3 `contactabilidad_etapas`

Historial de permanencia por etapa:

- Empresa y lead.
- ID y nombre de etapa.
- Fecha y hora de entrada.
- Fecha y hora de salida.
- Contadores de mensajes de cada parte durante la etapa.
- Estado abierto o cerrado.

### 5.4 `contactabilidad_snapshots`

Resumen periódico para tendencias y auditoría de indicadores. No sustituye los eventos; evita recalcular series históricas completas para cada consulta.

### 5.5 `contactabilidad_sync_runs`

Bitácora de cada ciclo:

- Fecha y hora de inicio y finalización.
- Empresa procesada.
- Estado: completado, parcial o fallido.
- Leads y mensajes leídos, insertados, actualizados y omitidos.
- Error resumido sin secretos.

## 6. Flujo de datos

1. El recolector consulta los leads modificados y sus conversaciones en Bitrix cada 15 minutos.
2. Clasifica de forma determinista cada mensaje como cliente o asesor.
3. Inserta únicamente mensajes no registrados.
4. Detecta y registra cambios de etapa sin eliminar estados anteriores.
5. Actualiza el consolidado del lead y los contadores de la etapa actual.
6. Calcula alertas y resúmenes consultables.
7. El frontend solicita datos a PostgreSQL y refresca la vista cada 30 minutos.
8. El tablero muestra la fecha y hora de la última sincronización correcta.

El intervalo de ingesta y el de actualización visual serán configurables mediante variables de entorno, con valores iniciales de 15 y 30 minutos respectivamente.

## 7. Tabla operativa

La tabla principal mostrará:

- Empresa.
- ID de Bitrix.
- Nombre del cliente.
- Nombre e ID del asesor.
- Origen.
- Fecha y hora de creación.
- Etapa actual.
- Tiempo en la etapa.
- Mensajes del cliente y del asesor, históricos y en la etapa.
- Fecha y hora del último mensaje del cliente.
- Fecha y hora del último mensaje del asesor.
- Tiempo transcurrido desde ambos mensajes.
- Pendiente por cliente o pendiente por asesor.
- Primera respuesta y tiempo promedio de respuesta.
- Fecha y hora de la última sincronización.

Las fechas se presentarán en la zona horaria `America/Guayaquil`; la base conservará instantes con zona horaria para evitar cálculos inconsistentes.

## 8. Indicadores

### 8.1 Indicadores operativos

- Tasa de contactabilidad: leads donde el cliente respondió al menos una vez dividido para los leads intentados.
- Leads sin contacto: ningún mensaje real del cliente.
- Pendientes del asesor: el cliente escribió último.
- Pendientes del cliente: el asesor escribió último.
- Tiempo de primera respuesta del asesor.
- Tiempo promedio y máximo de respuesta.
- Antigüedad del último contacto.
- Volumen y equilibrio de mensajes entre cliente y asesor.
- Tiempo promedio en cada etapa.

### 8.2 Comparaciones

Todos los indicadores podrán agruparse por:

- Empresa.
- Origen.
- Asesor.
- Etapa.
- Rango de fechas.

El ranking de orígenes combinará tasas y tiempos, no solamente cantidades absolutas. Cuando las etapas finales sean comparables, también mostrará la conversión contactado → gestionado → venta.

### 8.3 Alertas

La primera regla será: cliente pendiente de respuesta del asesor durante más de 30 minutos. El umbral será configurable.

Una alerta se cerrará automáticamente cuando el asesor responda o cuando el lead alcance una etapa terminal configurada. Las alertas no enviarán mensajes al cliente; inicialmente serán indicadores visuales para supervisión.

### 8.4 Temperatura e inteligencia futura

La primera clasificación será transparente y basada en reglas: `FRÍO`, `TIBIO` o `CALIENTE`. Considerará respuesta del cliente, recencia, ritmo de conversación, etapa y señales de avance disponibles.

No se presentará una probabilidad de venta como dato objetivo hasta disponer de suficiente historial con resultados finales. Una fase posterior podrá entrenar o validar un modelo usando conversión real. No se necesita GPU para la primera versión; los cálculos se ejecutarán en Node.js y PostgreSQL. El análisis semántico opcional puede continuar usando Groq con texto anonimizado.

## 9. Privacidad y acceso

- No se persistirán teléfonos ni datos personales que no sean necesarios.
- El texto original no se guardará por defecto en las nuevas tablas.
- Cuando el análisis semántico requiera contenido, se utilizará texto anonimizado.
- El nombre del cliente se mostrará por necesidad operativa y estará protegido por autenticación y permisos del ERP.
- NOVONET y VELSA respetarán el aislamiento de empresa aplicado por el backend.
- Los errores y logs no incluirán webhooks, tokens ni credenciales.

## 10. Manejo de fallos

- Una falla de Bitrix no eliminará ni reemplazará información válida.
- Un ciclo parcial quedará registrado como tal y se retomará en el siguiente intervalo.
- La idempotencia permitirá reintentar sin duplicar mensajes o etapas.
- Una empresa podrá fallar sin impedir que se procese la otra.
- El frontend mostrará datos conservados junto con la antigüedad de la sincronización.
- El proceso recolector evitará ciclos concurrentes, siguiendo el patrón actual de Bot Auditor.

## 11. Despliegue y recursos

La primera versión no requiere GPU. Los recursos relevantes son:

- Acceso vigente a los webhooks de Bitrix de ambas empresas.
- Permisos para consultar mensajes, usuarios, clientes, etapas y orígenes.
- Capacidad adicional en PostgreSQL para eventos e historial.
- Un solo recolector activo para evitar trabajo duplicado.
- Variables de entorno y despliegue controlado del servicio.

Antes de implementar se verificará el volumen esperado de mensajes y la estabilidad de los IDs externos para definir índices y política de retención. No se escalará horizontalmente el proceso sin incorporar un mecanismo explícito de exclusión distribuida.

## 12. Validación y pruebas

La implementación deberá comprobar:

- Reprocesar el mismo mensaje no cambia los contadores.
- Cliente y asesor se identifican correctamente en ambos CRM.
- El nombre e ID del asesor y el nombre del cliente se obtienen sin mezclas entre empresas.
- Las fechas y duraciones son correctas en `America/Guayaquil`.
- Los cambios de etapa conservan el historial y cierran la etapa anterior.
- Los contadores históricos y por etapa coinciden con conversaciones controladas.
- La alerta de 30 minutos se activa y se cierra correctamente.
- Una falla parcial no corrompe el consolidado existente.
- Los filtros de empresa, origen, asesor, etapa y fechas producen resultados coherentes.
- Los permisos impiden que un usuario vea datos de otra empresa.

## 13. Criterios de aceptación

El diseño se considerará implementado cuando:

1. Auditoría IA, Indicador de códigos y Contactabilidad estén separados en frontend y backend.
2. La tabla de Contactabilidad muestre los campos operativos aprobados para NOVONET y VELSA.
3. Los contadores de cliente y asesor sean idempotentes y verificables.
4. Existan métricas históricas y por etapa.
5. Los tiempos y pendientes se calculen con fechas reales de mensajes.
6. El origen pueda compararse por contactabilidad, tiempos y conversión disponible.
7. La alerta de 30 minutos funcione sin enviar mensajes automáticamente.
8. El tablero informe la última sincronización y degrade de forma segura ante fallos.
9. Las pruebas críticas estén automatizadas y el flujo existente de auditoría continúe funcionando.

## 14. Fuera de alcance inicial

- Envío automático de mensajes o reasignación automática de leads.
- Entrenamiento de un modelo predictivo con GPU.
- Declarar una probabilidad de venta sin validación histórica.
- Sustituir los sistemas de mensajería o CRM actuales.
- Cambiar las reglas externas de las APIs `/api/consultor` o `/api/consultor-velsa`.
