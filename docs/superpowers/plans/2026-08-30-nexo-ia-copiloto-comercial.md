# NEXO IA Copiloto Comercial Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Crear un copiloto comercial seguro que audite conversaciones y genere borradores para NOVONET y VELSA sin enviar mensajes.

**Architecture:** Contactabilidad produce eventos; una cola PostgreSQL idempotente prioriza tiempo real y un worker aislado consulta Groq. La API y UI exponen sugerencias, configuracion, documentos y feedback sin modificar los modulos existentes.

**Tech Stack:** Node.js 20, Express 5, PostgreSQL, React/Vite, Groq SDK/HTTP, multer, pdf-parse, mammoth, node:test.

**Spec:** `docs/superpowers/specs/2026-08-30-nexo-ia-copiloto-comercial-design.md`

## Global Constraints

- Nunca enviar mensajes ni cambiar etapas en Bitrix.
- Procesar leads creados desde `2026-08-15` del mas reciente al mas antiguo.
- Excluir VENTA SUBIDA, DUPLICADO, REMARKETING y REGULARIZACION con normalizacion amplia.
- Esperar 60 segundos antes de la generacion automatica.
- Mantener concurrencia inicial en 1 y priorizar tiempo real.
- Aislar datos por empresa y conversaciones por asesor.
- No registrar secretos ni conversaciones completas.

---

### Task 1: Dominio y migracion idempotente

**Files:**
- Create: `backend/src/migrations/nexo_ia.sql`
- Create: `backend/src/nexoIa/nexoIa.etapas.js`
- Test: `backend/test/nexo-ia-etapas.test.js`

**Interfaces:**
- Produces: `normalizarEtapa(nombre): string`, `etapaExcluida(nombre): boolean` y tablas `nexo_ia_*`.

- [ ] Escribir pruebas con variantes de tildes, espacios, singular/plural y etapas permitidas como DESCARTE.
- [ ] Ejecutar `node --test backend/test/nexo-ia-etapas.test.js` y verificar fallo.
- [ ] Implementar normalizacion y la migracion con indices parciales, checks, claves foraneas y `IF NOT EXISTS`.
- [ ] Ejecutar la prueba y revisar la migracion dentro de una transaccion descartable.
- [ ] Commit: `feat(nexo-ia): add domain schema and stage rules`.

### Task 2: Configuracion, documentos y contrato de prompt

**Files:**
- Create: `backend/src/nexoIa/nexoIa.config.js`
- Create: `backend/src/nexoIa/nexoIa.documentos.js`
- Create: `backend/src/nexoIa/nexoIa.prompt.js`
- Test: `backend/test/nexo-ia-prompt.test.js`
- Modify: `backend/package.json`

**Interfaces:**
- Consumes: `nexo_ia_config`, `nexo_ia_documentos`.
- Produces: `construirPrompt({ config, conversacion, lead, documentos, tipo }): string`, `extraerDocumento(buffer, mime): Promise<string>`.

- [ ] Probar que el prompt separa reglas fijas, reglas editables y documentos no confiables.
- [ ] Probar rechazo por tipo, 10 MB, texto vacio y checksum duplicado.
- [ ] Instalar versiones compatibles de `groq-sdk`, `pdf-parse` y `mammoth` y registrar lockfile.
- [ ] Implementar extractores sin guardar binarios y sanitizar/controlar longitud del texto.
- [ ] Sembrar por empresa el prompt aprobado y conservar un contrato JSON fijo.
- [ ] Ejecutar pruebas y auditoria de dependencias.
- [ ] Commit: `feat(nexo-ia): add configurable prompt and knowledge documents`.

### Task 3: Cola, limites y proveedor Groq

**Files:**
- Create: `backend/src/nexoIa/nexoIa.repository.js`
- Create: `backend/src/nexoIa/nexoIa.queue.js`
- Create: `backend/src/nexoIa/nexoIa.groq.js`
- Test: `backend/test/nexo-ia-queue.test.js`
- Test: `backend/test/nexo-ia-groq.test.js`

**Interfaces:**
- Produces: `encolarTrabajo(input)`, `reclamarSiguiente(workerId)`, `procesarTrabajo(job)`, `generarSugerencia(contexto)`.

- [ ] Probar idempotencia por mensaje/configuracion y orden TIEMPO_REAL antes de HISTORICO.
- [ ] Probar bloqueo con `FOR UPDATE SKIP LOCKED`, recuperacion de jobs vencidos y concurrencia uno.
- [ ] Probar timeout, 429, backoff con jitter, limite diario, JSON invalido y circuito abierto.
- [ ] Implementar repositorio, cola y adaptador Groq con inyeccion de dependencias.
- [ ] Ejecutar ambas suites sin red usando proveedor simulado.
- [ ] Commit: `feat(nexo-ia): add resilient suggestion queue`.

### Task 4: Productor en vivo y backfill

**Files:**
- Create: `backend/src/nexoIa/nexoIa.producer.js`
- Create: `backend/src/jobs/nexoIa.cron.js`
- Modify: `backend/src/contactabilidad/contactabilidad.processor.js`
- Test: `backend/test/nexo-ia-producer.test.js`

**Interfaces:**
- Consumes: eventos normalizados de Contactabilidad y `encolarTrabajo`.
- Produces: `registrarActividadCliente(evento)` y `encolarBackfillLote({ empresa, limite })`.

- [ ] Probar debounce de 60 segundos, solo ultimo mensaje CLIENTE y exclusiones de etapa.
- [ ] Probar backfill desde `2026-08-15`, orden descendente, prioridad baja y cursor reanudable.
- [ ] Implementar un hook tolerante a fallos: cualquier error NEXO se registra y Contactabilidad continua.
- [ ] Implementar cron con feature flag apagado por defecto para el backfill.
- [ ] Ejecutar pruebas de regresion de Contactabilidad.
- [ ] Commit: `feat(nexo-ia): enqueue live and historical conversations`.

### Task 5: API, permisos y montaje productivo

**Files:**
- Create: `backend/src/controllers/nexoIa.controller.js`
- Create: `backend/src/routes/nexoIa.routes.js`
- Modify: `backend/src/app.js`
- Modify: `backend/src/entries/core.js`
- Modify: `backend/src/entries/gateway.js` only if its catch-all does not already include `/api/nexo-ia`.
- Test: `backend/test/nexo-ia-api.test.js`

**Interfaces:**
- Produces: endpoints de listado, detalle, generar, feedback, config y documentos bajo `/api/nexo-ia`.

- [ ] Probar ASESOR propio, perfiles de empresa, ADMINISTRADOR global y config solo admin.
- [ ] Probar que generar nunca llama rutas de envio ni muta Bitrix.
- [ ] Implementar validacion estricta de payload, upload y respuestas `{ success, data|error }`.
- [ ] Montar rutas tanto en monolito como core y verificar el gateway.
- [ ] Ejecutar pruebas y smoke test local autenticado.
- [ ] Commit: `feat(nexo-ia): expose secure copiloto API`.

### Task 6: Interfaz del copiloto

**Files:**
- Create: `frontend/src/pages/NexoIa.jsx`
- Create: `frontend/src/pages/nexoIa/NexoIaConversation.jsx`
- Create: `frontend/src/pages/nexoIa/NexoIaSuggestion.jsx`
- Create: `frontend/src/pages/nexoIa/NexoIaConfig.jsx`
- Create: `frontend/src/pages/nexoIa/NexoIaKnowledge.jsx`
- Modify: `frontend/src/App.jsx`
- Modify: menu/sidebar file discovered from the existing BotAuditor entry.
- Test: `frontend/src/pages/nexoIa/nexoIa.test.js`

**Interfaces:**
- Consumes: `/api/nexo-ia/*`.
- Produces: ruta `/nexo-ia` con estados PENDIENTE, GENERANDO, LISTA y FALLIDA.

- [ ] Probar visibilidad por perfil, copiar, util/no util, regenerar y seguimiento manual.
- [ ] Implementar lista, filtros, conversacion, borrador, diagnostico y siguiente accion.
- [ ] Implementar panel admin independiente por empresa y carga/versionado de documentos.
- [ ] Asegurar estados vacios, errores, teclado, contraste y adaptacion movil.
- [ ] Ejecutar pruebas y `npm run build` en frontend.
- [ ] Commit: `feat(nexo-ia): add copiloto commercial workspace`.

### Task 7: Integracion, seguridad y despliegue controlado

**Files:**
- Modify: `render.yaml` only if a worker/variables declarative change is required.
- Create: `docs/NEXO_IA_OPERACION.md`
- Test: all NEXO and affected Contactabilidad tests.

**Interfaces:**
- Produces: runbook de migracion, variables, rollback, activacion y observabilidad.

- [ ] Ejecutar todas las pruebas NEXO, regresiones de Contactabilidad y build frontend.
- [ ] Escanear secretos, rutas de envio, SQL destructivo y diff completo.
- [ ] Aplicar `nexo_ia.sql` en produccion y verificar tablas/indices antes de habilitar workers.
- [ ] Desplegar backend y frontend; mantener backfill deshabilitado.
- [ ] Hacer smoke test NOVONET y VELSA con una conversacion controlada por empresa.
- [ ] Habilitar generacion en vivo; observar errores, latencia y cuota.
- [ ] Habilitar backfill en lotes pequenos, deteniendolo automaticamente ante trabajo en vivo.
- [ ] Commit: `docs(nexo-ia): add production operations runbook`.

