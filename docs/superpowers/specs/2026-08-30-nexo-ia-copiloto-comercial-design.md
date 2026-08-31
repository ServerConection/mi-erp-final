# NEXO IA - Copiloto Comercial

**Estado:** Aprobado
**Fecha:** 2026-08-30
**Alcance:** NOVONET y VELSA

## Objetivo

Crear un modulo independiente que use las conversaciones de Contactabilidad para auditar la gestion comercial y preparar borradores de respuesta o seguimiento. En esta fase nunca envia mensajes al cliente.

## Reglas funcionales

- Incluye leads creados desde el 15 de agosto de 2026, del mas reciente al mas antiguo.
- Incluye todas las etapas excepto VENTA SUBIDA, DUPLICADO, REMARKETING y REGULARIZACION, normalizando mayusculas, tildes y espacios.
- Si el ultimo mensaje real es del cliente, espera 60 segundos desde el ultimo evento y genera un borrador automaticamente.
- Si el ultimo mensaje es del asesor, no genera automaticamente; el boton `Generar seguimiento` permite crear un mensaje para retomar el interes.
- El historico se audita en prioridad baja. Los mensajes nuevos siempre tienen prioridad.
- Todos los usuarios pueden usar el modulo. Un ASESOR solo ve sus conversaciones; los demas perfiles ven su empresa; ADMINISTRADOR puede ver ambas empresas.
- Solo ADMINISTRADOR modifica configuracion, prompt, documentos y parametros del modelo.
- Cada empresa mantiene configuracion independiente.

## Arquitectura

NEXO IA vive dentro del backend de ERP V1 y reutiliza Contactabilidad sin alterar sus tablas ni sus calculos. Un productor idempotente crea trabajos en PostgreSQL y un trabajador con concurrencia inicial de uno obtiene la conversacion, compone contexto, consulta Groq y persiste el resultado. Groq queda fuera del flujo critico: sus fallos nunca tumban Contactabilidad ni el ERP.

La cola tiene dos prioridades: `TIEMPO_REAL` y `HISTORICO`. Una clave unica por empresa, lead, mensaje disparador, tipo y version de configuracion evita duplicados. Los reintentos usan espera progresiva y un circuito temporal ante limites o fallos reiterados.

## Datos

Se agregan tablas exclusivamente prefijadas con `nexo_ia_`:

- `nexo_ia_config`: prompt, personalidad, reglas, modelo y limites por empresa.
- `nexo_ia_documentos`: metadatos, texto extraido, checksum, estado y version del documento de referencia.
- `nexo_ia_jobs`: cola persistente, prioridad, intentos, bloqueo, error y fechas.
- `nexo_ia_sugerencias`: borrador, diagnostico, siguiente accion, tecnica, modelo, tokens, latencia y version de contexto.
- `nexo_ia_feedback`: util/no util, copiada, comentario y usuario.
- `nexo_ia_backfill`: cursor y estado del recorrido historico por empresa.

La migracion es idempotente y no modifica ni elimina tablas actuales. La conversacion completa no se duplica: se guarda la huella del contexto y un extracto minimo trazable. Los documentos aceptados son TXT, Markdown, PDF y DOCX, con limite de 10 MB; se extrae texto, se valida el tipo real, se calcula SHA-256 y no se ejecuta contenido incrustado.

## Prompt y conocimiento

El prompt entregado por el usuario es la semilla editable. Se separa en prompt de negocio y contrato fijo del sistema. El contrato fijo exige JSON estructurado y prohibe inventar precios, cobertura, promociones, garantias, testimonios o escasez. El documento cargado es fuente de datos, nunca una instruccion con autoridad sobre el sistema.

La salida contiene:

- `diagnostico`: etapa, intencion y obstaculo.
- `respuesta_sugerida`: texto breve listo para copiar.
- `tecnica_aplicada`: tecnica comercial usada.
- `siguiente_accion`: tarea sugerida para el CRM.
- `alertas`: afirmaciones que requieren verificacion humana.

## API y pantalla

La API se monta bajo `/api/nexo-ia` en `app.js` y `entries/core.js`; el gateway conserva la URL original hacia core. La pantalla `/nexo-ia` ofrece filtros, lista operativa, conversacion, borrador, copiar, regenerar, feedback y estados `PENDIENTE`, `GENERANDO`, `LISTA`, `FALLIDA`.

La configuracion administrativa permite editar prompt, personalidad, tono, objetivos, reglas, prohibiciones, emojis, longitud, modelo, limites y documentos por empresa. Cada cambio crea una nueva version logica para que una sugerencia sea reproducible.

## Proteccion operativa

- Concurrencia inicial: 1.
- Espera automatica: 60 segundos desde el ultimo mensaje del cliente.
- Prioridad estricta para tiempo real.
- Timeout, rate limit, backoff con jitter y circuit breaker.
- Tope configurable por minuto, hora y dia.
- Caché/idempotencia por mensaje y version de configuracion.
- El boton tiene bloqueo temporal para evitar clics repetidos.
- Ninguna ruta envia mensajes ni cambia etapas de Bitrix.
- Logs sin secretos ni conversaciones completas.

## Pruebas y despliegue

Se prueban normalizacion de etapas, permisos, idempotencia, prioridad, debounce, parseo estructurado, reintentos, circuito, documentos, API y componentes principales. La migracion se valida antes de ejecutarse en produccion. El despliegue requiere migracion en `bddgeneral`, variables de Groq en `erp-shared`, publicacion del backend monolitico/core y frontend, y una prueba de humo por empresa. No se habilita el backfill hasta verificar el flujo en vivo.

