# Contactabilidad Collector Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Crear un worker aislado que recopile leads, mensajes y etapas de NOVONET y VELSA desde Bitrix, y llene idempotentemente las tablas de Contactabilidad.

**Architecture:** Un entrypoint `start:contactabilidad` ejecutará exclusivamente el recolector, separado del monolito y de `erp-workers`. El adaptador Bitrix entregará datos normalizados, el repositorio PostgreSQL persistirá eventos y consolidados dentro de transacciones, y un coordinador controlará intervalos, exclusión mutua, fallos parciales y activación gradual.

**Tech Stack:** Node.js 20 CommonJS, PostgreSQL (`pg`), API REST Bitrix24, `node:test`, Render background worker.

**Spec:** `docs/superpowers/specs/2026-08-24-bot-auditor-contactabilidad-design.md`

## Global Constraints

- Servicio independiente; no montar el recolector en `app.js`, `core.js`, `workers.js` ni `wabot.js`.
- Apagado por defecto con `CONTACTABILIDAD_ENABLED=false`.
- Carga desde `CONTACTABILIDAD_FECHA_DESDE=2026-07-01`.
- Ciclo incremental cada `CONTACTABILIDAD_INTERVALO_MINUTOS=15`.
- Activación independiente con `CONTACTABILIDAD_NOVONET_ENABLED` y `CONTACTABILIDAD_VELSA_ENABLED`.
- Un fallo de Bitrix o PostgreSQL se registra y no termina otros servicios ni el ciclo de la otra empresa.
- No guardar teléfono ni texto original; solo texto anonimizado cuando se habilite explícitamente.
- Deduplicar por `(empresa, chat_id, mensaje_externo_id)`.
- Conservar todas las etapas; no reutilizar el filtro ATC/DESCARTE de Auditoría IA.
- Limitar concurrencia y evitar ciclos superpuestos.
- No ejecutar una carga histórica completa hasta validar primero un rango de dos días.

---

### Task 1: Normalización pura de mensajes y leads

**Files:**
- Create: `backend/src/contactabilidad/contactabilidad.normalizer.js`
- Test: `backend/test/contactabilidad.normalizer.test.js`

**Interfaces:**
- Produces: `normalizarEmpresa(value)`, `normalizarMensaje(message, users, context)`, `resumirMensajes(messages)`, `calcularPendientePor(summary)` y `normalizarLead(deal, contact, stage, source)`.

- [ ] Escribir pruebas fallidas para: cliente (`connector` o `extranet`), asesor interno, exclusión de mensajes de sistema, conservación del ID/fecha, contadores separados y pendiente por la parte que debe responder.
- [ ] Ejecutar `node --test test/contactabilidad.normalizer.test.js` y confirmar fallos por funciones ausentes.
- [ ] Implementar las funciones puras sin acceso a red o base de datos.
- [ ] Repetir la prueba y confirmar cero fallos.
- [ ] Commit: `feat: normalizar mensajes de contactabilidad`.

### Task 2: Adaptador Bitrix independiente de Auditoría IA

**Files:**
- Create: `backend/src/contactabilidad/contactabilidad.bitrix.js`
- Test: `backend/test/contactabilidad.bitrix.test.js`

**Interfaces:**
- Consumes: configuración `{ empresa, webhook, categoryId, campoChat }`.
- Produces: `listarDeals(crm, { desde, start })`, `obtenerContacto(crm, contactId)`, `obtenerChat(crm, chatId)`, `resolverChatsLead(crm, deal)` y `crearClienteBitrix({ request })`.

- [ ] Escribir pruebas fallidas con una función `request` inyectada que verifiquen que `crm.deal.list` selecciona `ID`, `TITLE`, `DATE_CREATE`, `STAGE_ID`, `ASSIGNED_BY_ID`, `CONTACT_ID`, `SOURCE_ID` y no filtra por etapa.
- [ ] Probar que los IDs de chat se deduplican y que los errores de un candidato no eliminan candidatos válidos.
- [ ] Implementar paginación de deals en bloques de 50 y mensajes hasta el límite soportado por la respuesta real de Bitrix.
- [ ] Mantener timeouts de 30 segundos y errores sin incluir el webhook.
- [ ] Ejecutar las pruebas y confirmar cero fallos.
- [ ] Commit: `feat: agregar adaptador Bitrix de contactabilidad`.

### Task 3: Repositorio PostgreSQL idempotente

**Files:**
- Create: `backend/src/contactabilidad/contactabilidad.repository.js`
- Test: `backend/test/contactabilidad.repository.test.js`

**Interfaces:**
- Consumes: pool compatible con `pool.query` y `pool.transaction`.
- Produces: `iniciarSync(empresa)`, `finalizarSync(id, resultado)`, `upsertLead(client, lead)`, `insertarMensaje(client, message)`, `registrarEtapa(client, stageEvent)`, `recalcularLead(client, key)` y `guardarSnapshot(client, key)`.

- [ ] Escribir pruebas fallidas con un cliente registrador de SQL que verifiquen `ON CONFLICT`, parámetros separados y ninguna interpolación de datos externos.
- [ ] Implementar `insertarMensaje` con `ON CONFLICT (empresa, chat_id, mensaje_externo_id) DO NOTHING RETURNING id`.
- [ ] Implementar cierre de la etapa abierta solo cuando cambie `etapa_id`, seguido de inserción idempotente del nuevo periodo.
- [ ] Recalcular contadores, últimas fechas, primera respuesta y pendiente desde mensajes persistidos dentro de la misma transacción.
- [ ] Ejecutar pruebas y confirmar cero fallos.
- [ ] Commit: `feat: persistir contactabilidad de forma idempotente`.

### Task 4: Coordinador de sincronización con activación gradual

**Files:**
- Create: `backend/src/contactabilidad/contactabilidad.collector.js`
- Test: `backend/test/contactabilidad.collector.test.js`

**Interfaces:**
- Consumes: adaptador Bitrix, repositorio y lista de CRM.
- Produces: `crearRecolector({ bitrix, repository, crms, logger })` con métodos `ejecutarCiclo({ desde, hasta })` y `estaEjecutando()`.

- [ ] Escribir pruebas fallidas que demuestren exclusión de ciclos simultáneos, continuidad de VELSA si NOVONET falla y finalización `PARCIAL` con contadores.
- [ ] Procesar cada lead en una transacción corta; no mantener transacciones abiertas durante llamadas HTTP.
- [ ] Insertar el lead antes de mensajes y etapa para satisfacer claves foráneas.
- [ ] Crear un snapshot por lead al finalizar un procesamiento correcto.
- [ ] Limitar la secuencia a un lead por vez inicialmente.
- [ ] Ejecutar pruebas y confirmar cero fallos.
- [ ] Commit: `feat: coordinar ciclos de contactabilidad`.

### Task 5: Entry point aislado y configuración

**Files:**
- Create: `backend/src/entries/contactabilidad.js`
- Modify: `backend/package.json`
- Modify: `render.yaml`
- Test: `backend/test/contactabilidad.config.test.js`

**Interfaces:**
- Produces: comando `npm run start:contactabilidad` y worker Render `erp-contactabilidad`.

- [ ] Probar que `CONTACTABILIDAD_ENABLED` debe ser exactamente `true` para iniciar.
- [ ] Validar presencia de webhooks únicamente para empresas habilitadas.
- [ ] Ejecutar un ciclo al arranque y programar el siguiente con `setTimeout` después de terminar el anterior, evitando solapamiento.
- [ ] Manejar `SIGTERM`/`SIGINT` cerrando el pool tras el ciclo activo.
- [ ] Añadir worker Render con `DB_POOL_MAX=3`, `CONTACTABILIDAD_ENABLED=false`, `CONTACTABILIDAD_NOVONET_ENABLED=false` y `CONTACTABILIDAD_VELSA_ENABLED=false`.
- [ ] Ejecutar pruebas y confirmar cero fallos.
- [ ] Commit: `feat: aislar worker de contactabilidad`.

### Task 6: Validación controlada y carga histórica

**Files:**
- Create: `backend/src/scripts/runContactabilidadOnce.js`
- Modify: `backend/package.json`

**Interfaces:**
- Produces: `npm run contactabilidad:once -- --empresa=NOVONET --desde=YYYY-MM-DD --hasta=YYYY-MM-DD`.

- [ ] Rechazar rangos inválidos, fechas futuras y ejecuciones sin empresa explícita.
- [ ] Ejecutar todas las pruebas `node --test test/contactabilidad.*.test.js`.
- [ ] Ejecutar primero NOVONET para los dos días más recientes con datos y revisar `contactabilidad_sync_runs`.
- [ ] Comparar manualmente tres leads contra Bitrix: nombres, asesor, origen, etapa y contadores.
- [ ] Activar VELSA para el mismo rango y repetir la comparación.
- [ ] Solo después, ejecutar el histórico por ventanas semanales desde `2026-07-01` hasta hoy.
- [ ] Activar el cron en Render una empresa a la vez.
- [ ] Commit: `feat: agregar ejecucion controlada de contactabilidad`.

## Verification Gate

- `node --test test/contactabilidad.*.test.js` termina con cero fallos.
- El escaneo de `render.yaml`, `app.js`, `entries/core.js`, `entries/workers.js` y `entries/wabot.js` confirma que solo el nuevo entrypoint inicia el recolector.
- Ejecutar dos veces el mismo rango no incrementa `contactabilidad_mensajes`.
- Una respuesta de cliente posterior a la del asesor deja `pendiente_por='ASESOR'`.
- Los nombres y contadores de tres leads por empresa coinciden con Bitrix.
- Los logs no contienen webhooks, API keys, teléfonos ni texto original.
- El worker puede apagarse poniendo `CONTACTABILIDAD_ENABLED=false` y desplegando de nuevo.
