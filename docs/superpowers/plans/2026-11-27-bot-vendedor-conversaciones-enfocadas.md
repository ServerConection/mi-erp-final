# Bot Vendedor Conversaciones Enfocadas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agrupar mensajes, conservar estado comercial por conversación y recuperar fallos de IA sin alterar los flujos existentes de WABOT o asesores.

**Architecture:** Dos módulos pequeños y comprobables aislarán el estado comercial y la coordinación temporal. `botVendedor.service.js` seguirá siendo el límite con la IA; `botVendedorWa.service.js` seguirá siendo el adaptador de WhatsApp y consumirá ambos módulos.

**Tech Stack:** Node.js 20 CommonJS, `node:test`, PostgreSQL, Express, React/Vite.

**Spec:** `docs/superpowers/specs/2026-11-27-bot-vendedor-conversaciones-enfocadas-design.md`

## Global Constraints

- No hacer push, merge ni despliegue.
- No iniciar conversaciones ni contactar clientes reales.
- No borrar ni sobrescribir configuración existente de `bv_config`.
- Mantener la pausa cuando interviene un asesor humano.
- Usar migraciones SQL idempotentes.

---

### Task 1: Estado comercial validado y persistente

**Files:**
- Create: `backend/src/services/botVendedorEstado.service.js`
- Modify: `backend/src/migrations/bot_vendedor.sql`
- Test: `backend/test/bot-vendedor-estado.test.js`

**Interfaces:**
- Produces: `normalizarEstado(input)`, `fusionarEstado(actual, cambios)`, `calcularPaso(estado)`, `calcularAvance(estado)`, `leerEstado(pool, conversationId)`, `guardarEstado(pool, conversationId, cambios)`.

- [ ] **Step 1: Write failing tests** for normalization, non-destructive merging, next-step selection and progress.
- [ ] **Step 2: Run** `node --test test/bot-vendedor-estado.test.js` from `backend` and verify failures are caused by the missing module.
- [ ] **Step 3: Implement** the pure functions, PostgreSQL read/upsert functions and idempotent `bv_conversation_state` table.
- [ ] **Step 4: Run** the focused test and verify all assertions pass.

### Task 2: Structured model response and state-aware context

**Files:**
- Modify: `backend/src/services/botVendedor.service.js`
- Test: `backend/test/bot-vendedor-respuesta.test.js`

**Interfaces:**
- Produces: `interpretarRespuestaModelo(texto)` returning `{ texto, estado, imagenesRaw, ventaCerrada }` without exposing internal JSON to the customer.
- Extends: `responder(historial, opciones)` where `opciones.estado` and `opciones.conversationId` are optional for backward compatibility.

- [ ] **Step 1: Write failing tests** for valid structured output, malformed output fallback and removal of internal metadata.
- [ ] **Step 2: Run** the focused test and observe the expected missing-export failure.
- [ ] **Step 3: Implement** validated structured parsing and inject a concise state snapshot into the system messages.
- [ ] **Step 4: Run** both state and response tests.

### Task 3: Message batching coordinator

**Files:**
- Create: `backend/src/services/botVendedorAgrupador.js`
- Modify: `backend/src/services/botVendedorWa.service.js`
- Test: `backend/test/bot-vendedor-agrupador.test.js`

**Interfaces:**
- Produces: `crearAgrupador({ esperaMs, procesar, setTimer, clearTimer })` with `agregar(clave, payload)`, `cancelar(clave)` and `pendientes()`.
- The processed payload contains ordered `mensajes` and the most recent WhatsApp envelope.

- [ ] **Step 1: Write failing tests** proving rapid messages become one ordered batch and separated messages become two batches.
- [ ] **Step 2: Run** the focused test and verify failure because the coordinator is absent.
- [ ] **Step 3: Implement** the timer coordinator and integrate it before the existing per-conversation queue.
- [ ] **Step 4: Run** batching and existing conversation-lock tests.

### Task 4: State integration and deterministic failure recovery

**Files:**
- Modify: `backend/src/services/botVendedorWa.service.js`
- Test: `backend/test/bot-vendedor-recuperacion.test.js`

**Interfaces:**
- Consumes: state functions from Task 1 and batching from Task 3.
- Produces: `crearEjecutorConReintento({ ejecutar, alAgotar, esperasMs })` for bounded retries and single exhaustion callback.

- [ ] **Step 1: Write failing tests** for recovery on a later attempt, one exhaustion callback and cancellation after human intervention.
- [ ] **Step 2: Run** the focused test and verify the missing behavior fails.
- [ ] **Step 3: Implement** a single retry layer, persist state after valid model output, and cancel pending work when a human is active.
- [ ] **Step 4: Run** all four bot-vendedor test files.

### Task 5: Operational visibility

**Files:**
- Modify: `backend/src/routes/botVendedor.routes.js`
- Modify: `frontend/src/pages/BotVendedor.jsx`
- Test: `backend/test/bot-vendedor-metricas.test.js`

**Interfaces:**
- Conversation list adds `paso_actual`, `avance`, `reintentos`, `mensajes_agrupados` and `actualizado_en` without removing existing fields.

- [ ] **Step 1: Write a failing route-query contract test** showing the metrics are included.
- [ ] **Step 2: Run** it and verify failure because fields are missing.
- [ ] **Step 3: Extend** the read query and display compact badges/details in the existing conversation UI.
- [ ] **Step 4: Run** the backend test and `npm run build` in `frontend`.

### Task 6: Full verification

**Files:**
- Review only all files listed above.

- [ ] **Step 1: Run** all `backend/test/bot-vendedor-*.test.js` files plus `backend/test/wabot.conversation-lock.test.js`.
- [ ] **Step 2: Run** `node --check` on every changed backend JavaScript file.
- [ ] **Step 3: Run** `npm run build` in `frontend`.
- [ ] **Step 4: Run** `git diff --check` on only the files changed for this feature.
- [ ] **Step 5: Inspect** `git diff` and confirm no unrelated file was modified by this implementation.
