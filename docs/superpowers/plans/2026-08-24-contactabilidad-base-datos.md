# Contactabilidad Database Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Crear una migración PostgreSQL idempotente y verificable que soporte leads, mensajes, etapas, snapshots, sincronizaciones y alertas de contactabilidad para NOVONET y VELSA.

**Architecture:** PostgreSQL conservará eventos inmutables de mensajes y periodos de etapa, mientras una tabla consolidada mantendrá el estado consultable de cada lead. Las claves compuestas incluirán `empresa` para impedir colisiones entre CRM, y las restricciones e índices harán segura la reejecución desde pgAdmin.

**Tech Stack:** PostgreSQL, SQL transaccional, pgAdmin 4, Node.js 20 y `pg` en las fases posteriores.

**Spec:** `docs/superpowers/specs/2026-08-24-bot-auditor-contactabilidad-design.md`

## Global Constraints

- Cubrir todas las etapas y todos los orígenes de NOVONET y VELSA.
- Usar `(empresa, id_bitrix)` como identidad lógica de un lead.
- Conservar fechas como `TIMESTAMPTZ`; presentar después en `America/Guayaquil`.
- No guardar teléfonos ni texto original en las nuevas tablas.
- Admitir texto anonimizado opcional para análisis semántico.
- Hacer la migración idempotente y segura para reejecutarla desde pgAdmin.
- No modificar las tablas actuales `auditorias`, `messages` ni `conversations` en esta fase.
- La alerta inicial representa más de 30 minutos esperando respuesta del asesor, pero el umbral se almacena como configuración.
- No enviar mensajes ni reasignar leads automáticamente.

---

## File Structure

- Create: `backend/src/migrations/contactabilidad.sql` — esquema, restricciones, índices, comentarios y configuración inicial.
- Create: `backend/src/migrations/contactabilidad_verificacion.sql` — consultas de verificación no destructivas para pgAdmin.

---

### Task 1: Definir el contrato de datos y las tablas principales

**Files:**
- Create: `backend/src/migrations/contactabilidad.sql`

**Interfaces:**
- Consumes: PostgreSQL y la identidad `(empresa, id_bitrix)` aprobada en la especificación.
- Produces: tablas `contactabilidad_leads`, `contactabilidad_mensajes`, `contactabilidad_etapas`, `contactabilidad_snapshots`, `contactabilidad_sync_runs`, `contactabilidad_alertas` y `contactabilidad_config`.

- [ ] **Step 1: Escribir el encabezado transaccional y los dominios válidos**

```sql
BEGIN;

CREATE TABLE IF NOT EXISTS contactabilidad_config (
  id                         SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  intervalo_ingesta_minutos  INTEGER NOT NULL DEFAULT 15 CHECK (intervalo_ingesta_minutos > 0),
  intervalo_tablero_minutos  INTEGER NOT NULL DEFAULT 30 CHECK (intervalo_tablero_minutos > 0),
  alerta_asesor_minutos       INTEGER NOT NULL DEFAULT 30 CHECK (alerta_asesor_minutos > 0),
  fecha_desde                 DATE NOT NULL DEFAULT DATE '2026-07-01',
  actualizado_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_por             VARCHAR(255)
);
```

- [ ] **Step 2: Crear el consolidado de leads**

```sql
CREATE TABLE IF NOT EXISTS contactabilidad_leads (
  empresa                         VARCHAR(20) NOT NULL CHECK (empresa IN ('NOVONET', 'VELSA')),
  id_bitrix                       VARCHAR(50) NOT NULL,
  nombre_cliente                  VARCHAR(255),
  asesor_id                       VARCHAR(50),
  asesor_nombre                   VARCHAR(255),
  origen_id                       VARCHAR(100),
  origen_nombre                   VARCHAR(255),
  fecha_creacion                  TIMESTAMPTZ,
  etapa_id                        VARCHAR(100),
  etapa_nombre                    VARCHAR(255),
  etapa_ingreso_at                TIMESTAMPTZ,
  mensajes_cliente_total          INTEGER NOT NULL DEFAULT 0 CHECK (mensajes_cliente_total >= 0),
  mensajes_asesor_total           INTEGER NOT NULL DEFAULT 0 CHECK (mensajes_asesor_total >= 0),
  mensajes_cliente_etapa          INTEGER NOT NULL DEFAULT 0 CHECK (mensajes_cliente_etapa >= 0),
  mensajes_asesor_etapa           INTEGER NOT NULL DEFAULT 0 CHECK (mensajes_asesor_etapa >= 0),
  primer_mensaje_cliente_at       TIMESTAMPTZ,
  primera_respuesta_asesor_at     TIMESTAMPTZ,
  ultimo_mensaje_cliente_at       TIMESTAMPTZ,
  ultimo_mensaje_asesor_at        TIMESTAMPTZ,
  tiempo_primera_respuesta_seg    BIGINT CHECK (tiempo_primera_respuesta_seg IS NULL OR tiempo_primera_respuesta_seg >= 0),
  tiempo_respuesta_promedio_seg   BIGINT CHECK (tiempo_respuesta_promedio_seg IS NULL OR tiempo_respuesta_promedio_seg >= 0),
  tiempo_respuesta_maximo_seg     BIGINT CHECK (tiempo_respuesta_maximo_seg IS NULL OR tiempo_respuesta_maximo_seg >= 0),
  pendiente_por                   VARCHAR(10) CHECK (pendiente_por IS NULL OR pendiente_por IN ('CLIENTE', 'ASESOR')),
  temperatura                     VARCHAR(10) CHECK (temperatura IS NULL OR temperatura IN ('FRIO', 'TIBIO', 'CALIENTE')),
  ultima_sincronizacion_at        TIMESTAMPTZ,
  creado_at                       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (empresa, id_bitrix)
);
```

- [ ] **Step 3: Crear el historial idempotente de mensajes**

```sql
CREATE TABLE IF NOT EXISTS contactabilidad_mensajes (
  id                    BIGSERIAL PRIMARY KEY,
  empresa               VARCHAR(20) NOT NULL CHECK (empresa IN ('NOVONET', 'VELSA')),
  id_bitrix             VARCHAR(50) NOT NULL,
  chat_id               VARCHAR(100) NOT NULL,
  mensaje_externo_id    VARCHAR(255) NOT NULL,
  emisor_tipo           VARCHAR(10) NOT NULL CHECK (emisor_tipo IN ('CLIENTE', 'ASESOR')),
  emisor_id             VARCHAR(100),
  emisor_nombre         VARCHAR(255),
  mensaje_at            TIMESTAMPTZ NOT NULL,
  etapa_id              VARCHAR(100),
  etapa_nombre          VARCHAR(255),
  canal                 VARCHAR(100),
  texto_anonimizado     TEXT,
  metadata              JSONB NOT NULL DEFAULT '{}'::jsonb,
  creado_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_contactabilidad_mensaje_lead
    FOREIGN KEY (empresa, id_bitrix)
    REFERENCES contactabilidad_leads (empresa, id_bitrix)
    ON DELETE CASCADE,
  CONSTRAINT uq_contactabilidad_mensaje
    UNIQUE (empresa, chat_id, mensaje_externo_id)
);
```

- [ ] **Step 4: Crear el historial de etapas**

```sql
CREATE TABLE IF NOT EXISTS contactabilidad_etapas (
  id                       BIGSERIAL PRIMARY KEY,
  empresa                  VARCHAR(20) NOT NULL CHECK (empresa IN ('NOVONET', 'VELSA')),
  id_bitrix                VARCHAR(50) NOT NULL,
  etapa_id                 VARCHAR(100) NOT NULL,
  etapa_nombre             VARCHAR(255),
  ingreso_at               TIMESTAMPTZ NOT NULL,
  salida_at                TIMESTAMPTZ,
  mensajes_cliente         INTEGER NOT NULL DEFAULT 0 CHECK (mensajes_cliente >= 0),
  mensajes_asesor          INTEGER NOT NULL DEFAULT 0 CHECK (mensajes_asesor >= 0),
  creado_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_contactabilidad_etapa_lead
    FOREIGN KEY (empresa, id_bitrix)
    REFERENCES contactabilidad_leads (empresa, id_bitrix)
    ON DELETE CASCADE,
  CONSTRAINT chk_contactabilidad_etapa_fechas
    CHECK (salida_at IS NULL OR salida_at >= ingreso_at),
  CONSTRAINT uq_contactabilidad_periodo_etapa
    UNIQUE (empresa, id_bitrix, etapa_id, ingreso_at)
);
```

- [ ] **Step 5: Cerrar la migración base y comprobar sintaxis manualmente**

```sql
COMMIT;
```

Run: abrir `backend/src/migrations/contactabilidad.sql` en pgAdmin y usar **Explain/Parse** sin ejecutar.

Expected: no aparecen errores de sintaxis ni referencias a tablas inexistentes.

- [ ] **Step 6: Commit**

```bash
git add backend/src/migrations/contactabilidad.sql
git commit -m "feat: crear esquema base de contactabilidad"
```

---

### Task 2: Añadir snapshots, sincronizaciones, alertas e índices

**Files:**
- Modify: `backend/src/migrations/contactabilidad.sql`

**Interfaces:**
- Consumes: claves de `contactabilidad_leads` creadas en Task 1.
- Produces: bitácora de ciclos, series históricas, alertas y rutas de consulta indexadas.

- [ ] **Step 1: Añadir la bitácora de sincronización**

```sql
CREATE TABLE IF NOT EXISTS contactabilidad_sync_runs (
  id                    BIGSERIAL PRIMARY KEY,
  empresa               VARCHAR(20) NOT NULL CHECK (empresa IN ('NOVONET', 'VELSA')),
  iniciado_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finalizado_at         TIMESTAMPTZ,
  estado                VARCHAR(10) NOT NULL DEFAULT 'ACTIVO'
                          CHECK (estado IN ('ACTIVO', 'COMPLETO', 'PARCIAL', 'FALLIDO')),
  leads_leidos          INTEGER NOT NULL DEFAULT 0 CHECK (leads_leidos >= 0),
  leads_actualizados    INTEGER NOT NULL DEFAULT 0 CHECK (leads_actualizados >= 0),
  mensajes_leidos       INTEGER NOT NULL DEFAULT 0 CHECK (mensajes_leidos >= 0),
  mensajes_insertados   INTEGER NOT NULL DEFAULT 0 CHECK (mensajes_insertados >= 0),
  mensajes_omitidos     INTEGER NOT NULL DEFAULT 0 CHECK (mensajes_omitidos >= 0),
  error_resumen         TEXT,
  CONSTRAINT chk_contactabilidad_sync_fechas
    CHECK (finalizado_at IS NULL OR finalizado_at >= iniciado_at)
);
```

- [ ] **Step 2: Añadir snapshots y alertas**

```sql
CREATE TABLE IF NOT EXISTS contactabilidad_snapshots (
  id                         BIGSERIAL PRIMARY KEY,
  empresa                    VARCHAR(20) NOT NULL,
  id_bitrix                  VARCHAR(50) NOT NULL,
  snapshot_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  etapa_id                   VARCHAR(100),
  origen_nombre              VARCHAR(255),
  asesor_id                  VARCHAR(50),
  mensajes_cliente_total     INTEGER NOT NULL DEFAULT 0,
  mensajes_asesor_total      INTEGER NOT NULL DEFAULT 0,
  pendiente_por              VARCHAR(10),
  temperatura                VARCHAR(10),
  CONSTRAINT fk_contactabilidad_snapshot_lead
    FOREIGN KEY (empresa, id_bitrix)
    REFERENCES contactabilidad_leads (empresa, id_bitrix)
    ON DELETE CASCADE,
  CONSTRAINT uq_contactabilidad_snapshot
    UNIQUE (empresa, id_bitrix, snapshot_at)
);

CREATE TABLE IF NOT EXISTS contactabilidad_alertas (
  id                    BIGSERIAL PRIMARY KEY,
  empresa               VARCHAR(20) NOT NULL,
  id_bitrix             VARCHAR(50) NOT NULL,
  tipo                  VARCHAR(50) NOT NULL CHECK (tipo IN ('ASESOR_SIN_RESPONDER')),
  abierta_at            TIMESTAMPTZ NOT NULL,
  cerrada_at            TIMESTAMPTZ,
  estado                VARCHAR(10) NOT NULL DEFAULT 'ABIERTA' CHECK (estado IN ('ABIERTA', 'CERRADA')),
  umbral_minutos        INTEGER NOT NULL CHECK (umbral_minutos > 0),
  detalle               JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT fk_contactabilidad_alerta_lead
    FOREIGN KEY (empresa, id_bitrix)
    REFERENCES contactabilidad_leads (empresa, id_bitrix)
    ON DELETE CASCADE,
  CONSTRAINT chk_contactabilidad_alerta_fechas
    CHECK (cerrada_at IS NULL OR cerrada_at >= abierta_at)
);
```

- [ ] **Step 3: Añadir índices alineados con los filtros aprobados**

```sql
CREATE INDEX IF NOT EXISTS idx_contactabilidad_leads_etapa
  ON contactabilidad_leads (empresa, etapa_id);
CREATE INDEX IF NOT EXISTS idx_contactabilidad_leads_origen
  ON contactabilidad_leads (empresa, origen_nombre);
CREATE INDEX IF NOT EXISTS idx_contactabilidad_leads_asesor
  ON contactabilidad_leads (empresa, asesor_id);
CREATE INDEX IF NOT EXISTS idx_contactabilidad_leads_creacion
  ON contactabilidad_leads (empresa, fecha_creacion DESC);
CREATE INDEX IF NOT EXISTS idx_contactabilidad_leads_pendiente
  ON contactabilidad_leads (empresa, pendiente_por, ultimo_mensaje_cliente_at DESC);
CREATE INDEX IF NOT EXISTS idx_contactabilidad_mensajes_lead_fecha
  ON contactabilidad_mensajes (empresa, id_bitrix, mensaje_at);
CREATE INDEX IF NOT EXISTS idx_contactabilidad_mensajes_emisor
  ON contactabilidad_mensajes (empresa, emisor_tipo, mensaje_at DESC);
CREATE INDEX IF NOT EXISTS idx_contactabilidad_etapas_abiertas
  ON contactabilidad_etapas (empresa, etapa_id, ingreso_at DESC)
  WHERE salida_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_contactabilidad_etapa_abierta
  ON contactabilidad_etapas (empresa, id_bitrix)
  WHERE salida_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_contactabilidad_sync_empresa_fecha
  ON contactabilidad_sync_runs (empresa, iniciado_at DESC);
CREATE INDEX IF NOT EXISTS idx_contactabilidad_alertas_abiertas
  ON contactabilidad_alertas (empresa, abierta_at DESC)
  WHERE estado = 'ABIERTA';
CREATE UNIQUE INDEX IF NOT EXISTS uq_contactabilidad_alerta_abierta
  ON contactabilidad_alertas (empresa, id_bitrix, tipo)
  WHERE estado = 'ABIERTA';
```

- [ ] **Step 4: Sembrar la configuración sin sobrescribir decisiones posteriores**

```sql
INSERT INTO contactabilidad_config
  (id, intervalo_ingesta_minutos, intervalo_tablero_minutos, alerta_asesor_minutos, fecha_desde)
VALUES (1, 15, 30, 30, DATE '2026-07-01')
ON CONFLICT (id) DO NOTHING;
```

- [ ] **Step 5: Añadir comentarios de contrato**

```sql
COMMENT ON TABLE contactabilidad_leads IS 'Estado consolidado por empresa y negociación Bitrix';
COMMENT ON TABLE contactabilidad_mensajes IS 'Mensajes Bitrix deduplicados; no guarda teléfono ni texto original';
COMMENT ON COLUMN contactabilidad_mensajes.texto_anonimizado IS 'Contenido opcional sin datos personales para análisis semántico';
COMMENT ON TABLE contactabilidad_etapas IS 'Periodos históricos de permanencia del lead en cada etapa';
COMMENT ON TABLE contactabilidad_sync_runs IS 'Bitácora de ciclos del recolector Bitrix';
COMMENT ON TABLE contactabilidad_alertas IS 'Alertas operativas; no ejecutan envíos ni reasignaciones';
```

- [ ] **Step 6: Ejecutar la migración dos veces en una base de prueba**

Run: ejecutar todo `backend/src/migrations/contactabilidad.sql` dos veces desde pgAdmin.

Expected: ambas ejecuciones terminan con `COMMIT`; la segunda no crea duplicados ni produce errores.

- [ ] **Step 7: Commit**

```bash
git add backend/src/migrations/contactabilidad.sql
git commit -m "feat: completar persistencia de contactabilidad"
```

---

### Task 3: Crear verificación no destructiva para pgAdmin

**Files:**
- Create: `backend/src/migrations/contactabilidad_verificacion.sql`

**Interfaces:**
- Consumes: las siete tablas y sus restricciones creadas en Tasks 1 y 2.
- Produces: una salida de diagnóstico que el usuario puede copiar después de ejecutar la migración.

- [ ] **Step 1: Verificar existencia y configuración**

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'contactabilidad_config', 'contactabilidad_leads',
    'contactabilidad_mensajes', 'contactabilidad_etapas',
    'contactabilidad_snapshots', 'contactabilidad_sync_runs',
    'contactabilidad_alertas'
  )
ORDER BY table_name;

SELECT id, intervalo_ingesta_minutos, intervalo_tablero_minutos,
       alerta_asesor_minutos, fecha_desde
FROM contactabilidad_config
WHERE id = 1;
```

Expected: aparecen siete tablas y una configuración `15 | 30 | 30 | 2026-07-01`.

- [ ] **Step 2: Verificar restricciones e índices**

```sql
SELECT indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename LIKE 'contactabilidad_%'
ORDER BY tablename, indexname;

SELECT conrelid::regclass AS tabla, conname, contype
FROM pg_constraint
WHERE conrelid::regclass::text LIKE 'contactabilidad_%'
ORDER BY tabla::text, conname;
```

Expected: aparecen las claves primarias, foráneas, `CHECK`, restricciones únicas e índices parciales.

- [ ] **Step 3: Comprobar que las tablas comienzan vacías**

```sql
SELECT
  (SELECT COUNT(*) FROM contactabilidad_leads) AS leads,
  (SELECT COUNT(*) FROM contactabilidad_mensajes) AS mensajes,
  (SELECT COUNT(*) FROM contactabilidad_etapas) AS etapas,
  (SELECT COUNT(*) FROM contactabilidad_snapshots) AS snapshots,
  (SELECT COUNT(*) FROM contactabilidad_sync_runs) AS sincronizaciones,
  (SELECT COUNT(*) FROM contactabilidad_alertas) AS alertas;
```

Expected: todos los contadores valen `0` antes de implementar el recolector.

- [ ] **Step 4: Commit**

```bash
git add backend/src/migrations/contactabilidad_verificacion.sql
git commit -m "test: agregar verificacion SQL de contactabilidad"
```

---

### Task 4: Entrega controlada para pgAdmin

**Files:**
- Verify: `backend/src/migrations/contactabilidad.sql`
- Verify: `backend/src/migrations/contactabilidad_verificacion.sql`

**Interfaces:**
- Consumes: migración y diagnóstico terminados.
- Produces: base preparada para el recolector incremental de la fase 2.

- [ ] **Step 1: Revisar que la migración no toca datos existentes**

Run:

```bash
rg -n "DROP|TRUNCATE|DELETE FROM|UPDATE auditorias|ALTER TABLE auditorias|ALTER TABLE messages|ALTER TABLE conversations" backend/src/migrations/contactabilidad.sql
```

Expected: no hay coincidencias.

- [ ] **Step 2: Ejecutar la migración en pgAdmin sobre `bddgeneral`**

Run: abrir Query Tool, pegar el contenido completo de `backend/src/migrations/contactabilidad.sql` y presionar **Execute** una sola vez.

Expected: pgAdmin muestra `Query returned successfully` y la transacción termina en `COMMIT`.

- [ ] **Step 3: Ejecutar la verificación**

Run: pegar `backend/src/migrations/contactabilidad_verificacion.sql` en una nueva pestaña y ejecutar.

Expected: siete tablas, configuración con fecha inicial `2026-07-01`, índices y tablas operativas vacías.

- [ ] **Step 4: Registrar el resultado antes de iniciar la fase 2**

Copiar la cuadrícula de configuración y los seis contadores. No insertar datos manuales; el recolector será el único responsable de poblar las tablas operativas.

