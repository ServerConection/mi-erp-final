# Leads: fuente real de Bitrix (webhook_leads) — Implementation Plan

> **Contexto de ejecución:** este plan corre contra el proyecto real del usuario en su máquina (Windows), montado vía device bridge en `$HOME/mnt/V1`. No hay suite de tests automatizados para estos controllers — la verificación es por SQL de comparación (antes/después) y por smoke-check manual del dashboard, siguiendo el mismo patrón que ya usa este repo en `backend/src/migrations/FIX_vw_bitrix_novonet.sql` (bloque "PASO 3: VERIFICACIÓN").

**Goal:** que todo conteo de "leads creados" (total, por origen, por etapa) en los dashboards de Novonet y Velsa refleje exactamente lo que hay en `bitrix_webhook_leads` (la fuente viva del webhook), sin inflarse por los JOIN con datos de Jotform. Los datos de Jotform (ventas, activaciones, forma de pago, etc.) siguen viniendo de donde ya vienen hoy — eso no tiene el bug y no se toca.

**Architecture:** el bug es el mismo patrón en los dos lados: una vista/vista-materializada hace `FULL OUTER JOIN` entre la tabla de Bitrix y la tabla/vista de Jotform. Cuando un mismo lead de Bitrix tiene más de una fila de Jotform enganchada (reingreso, regularización, otra venta sobre el mismo deal), la vista devuelve ese lead N veces. Cualquier query que cuente filas (`COUNT(*)`) en vez de leads distintos (`COUNT(DISTINCT ...)`), o que exporte filas crudas sin deduplicar, muestra más leads de los que realmente existen en Bitrix. La corrección es: para todo lo que sea puramente "dato de Bitrix" (identidad del lead, etapa, origen, fecha de creación, responsable), leer `bitrix_webhook_leads` directo cuando se pueda (sin pasar por el JOIN), o forzar deduplicación cuando la query ya depende de filtros compartidos con el lado Jotform.

**Tech Stack:** Node.js + `pg` (Postgres), Render Postgres (bddgeneral). Sin ORM — SQL crudo en los controllers.

**Spec:** conversación con el usuario (2026-08-27) — confirmó con esta query que `bitrix_webhook_leads` tiene data completa y viva para las dos empresas:

```sql
SELECT empresa, COUNT(*), MIN(created_at), MAX(created_at)
FROM public.bitrix_webhook_leads
GROUP BY empresa;
-- novonet | 29060 | 2025-05-01 10:31:18-05 | 2026-08-26 19:52:13-05
-- velsa   | 14973 | 2026-05-05 07:33:24-05 | 2026-08-26 19:44:04-05
```

## Global Constraints

- NUNCA usar `COUNT(*)` para contar "leads" sobre una vista que joinea con datos de Jotform — siempre `COUNT(DISTINCT <id_del_lead>)`, o mejor, leer la tabla de Bitrix directo si la query no necesita ningún campo de Jotform.
- Los datos de Jotform (ventas, activaciones, forma de pago, planes) NO cambian de fuente — el usuario confirmó explícitamente que ahí no hay problema.
- Cualquier query que comparta un string de filtros (`filtersJoin`/`filtersNoJoin`/`filters`) con columnas de Jotform (`j_id_bitrix`, `j_netlife_estatus_real`, etc.) NO se puede migrar a leer `bitrix_webhook_leads` a secas sin romper esos filtros — en esos casos la corrección es deduplicar con `SELECT DISTINCT`, no cambiar el FROM.
- Cada cambio se commitea por separado (un archivo/función por commit), para poder revertir uno sin afectar los demás.
- Antes de cada fix: correr la query vieja y la nueva contra el mismo rango de fechas y comparar el total. Después de deployar: comparar contra el número real de Bitrix (Bitrix24 → filtro por origen/fecha).

---

## Task 1 — Novonet: lista de orígenes (`getEtapasCache`) ✅ YA APLICADO

**Files:**
- Modified: `backend/src/controllers/indicadores.controller.js:109-135` (función `getEtapasCache`)

**Qué se hizo:** la query `resOrigenes` leía de `public.vw_bitrix_novonet` con `COUNT(*)`, lo que infla el total cuando un lead tiene más de una fila Jotform enganchada. Se cambió a leer `bitrix_webhook_leads` directo (esta query no tiene ningún filtro compartido con Jotform, así que el cambio de tabla es 100% seguro):

```sql
-- ANTES
SELECT b_origen AS origen, COUNT(*)::int AS total
FROM public.vw_bitrix_novonet
WHERE NULLIF(TRIM(b_origen), '') IS NOT NULL
GROUP BY 1
ORDER BY total DESC, origen ASC

-- DESPUÉS
SELECT source AS origen, COUNT(*)::int AS total
FROM public.bitrix_webhook_leads
WHERE empresa = 'novonet' AND NULLIF(TRIM(source), '') IS NOT NULL
GROUP BY 1
ORDER BY total DESC, origen ASC
```

- [x] Cambio aplicado en el archivo.
- [ ] **Pendiente:** commitear (ver comandos git al final del plan).
- [ ] **Pendiente:** verificar en el dashboard (pantalla que usa el filtro de orígenes de Novonet) que la lista y los totales bajaron y ahora cuadran con Bitrix.

---

## Task 2 — Novonet: export crudo de leads (`queryCRM` en `getIndicadoresDashboard`)

**Files:**
- Modify: `backend/src/controllers/indicadores.controller.js` (función `getIndicadoresDashboard`, bloque `queryCRM`, ~línea 856-873 después del cambio del Task 1)

**Por qué NO se puede cambiar el FROM aquí:** esta query comparte `filtersJoin` con otras queries de la misma función que sí filtran por columnas de Jotform (`mb.j_netlife_estatus_real`, `mb.j_id_bitrix`, el filtro de "canal" que hace un `OR` contra `mestra_bitrix`). Si se cambia `FROM public.vw_bitrix_novonet mb` por `bitrix_webhook_leads`, cualquier request que use el filtro `etapaJotform`, `idBitrix` o `canal` va a tirar un error de SQL ("column mb.j_id_bitrix does not exist"). La corrección segura es deduplicar la salida: como `queryCRM` NO selecciona ninguna columna de Jotform, dos filas que sólo difieren en el `j_*` (no seleccionado) son idénticas en todo lo que sí se muestra — un `DISTINCT` las colapsa en 1 sin cambiar nada más.

**Interfaces:**
- Consumes: `filtersJoin` (string ya armado más arriba en la misma función — no se toca).
- Produces: mismo shape de fila que hoy (`ID_CRM`, `ETAPA_CRM`, `FECHA_CREACION_CRM`, `ASESOR`, `HORA_CREACION`, `SUPERVISOR_ASIGNADO`, `FECHA_MODIFICACION`, `HORA_MODIFICACION`, `ORIGEN`) — el frontend no necesita cambios.

- [ ] **Paso 1: localizar el bloque exacto**

```bash
grep -n "const queryCRM = " backend/src/controllers/indicadores.controller.js
```

- [ ] **Paso 2: editar — agregar `DISTINCT`**

```js
// ANTES
const queryCRM = `
    SELECT
        mb.b_id AS "ID_CRM",
        mb.b_etapa_de_la_negociacion AS "ETAPA_CRM",
        mb.b_creado_el_fecha AS "FECHA_CREACION_CRM",
        mb.b_persona_responsable AS "ASESOR",
        mb.b_creado_el_hora AS "HORA_CREACION",
        e.supervisor AS "SUPERVISOR_ASIGNADO",
        mb.b_modificado_el_fecha AS "FECHA_MODIFICACION",
        mb.b_modificado_el_hora AS "HORA_MODIFICACION",
        mb.b_origen AS "ORIGEN"
    FROM public.vw_bitrix_novonet mb
    ${joinEmpleadosDedup}
    WHERE mb.b_creado_el_fecha BETWEEN $1::date AND $2::date ${filtersJoin}
    LIMIT 6000
`;

// DESPUÉS
// FIX (leads reales): vw_bitrix_novonet puede repetir un mismo lead cuando
// tiene N filas de Jotform enganchadas al mismo bitrix_id (reingreso,
// regularización, otra venta sobre el mismo deal). Esta query no muestra
// NINGUNA columna de Jotform, así que dos filas del mismo lead son
// idénticas en todo lo que se selecciona aquí — DISTINCT las colapsa en 1
// sin tocar los filtros compartidos con las queries de Jotform de esta
// misma función.
const queryCRM = `
    SELECT DISTINCT
        mb.b_id AS "ID_CRM",
        mb.b_etapa_de_la_negociacion AS "ETAPA_CRM",
        mb.b_creado_el_fecha AS "FECHA_CREACION_CRM",
        mb.b_persona_responsable AS "ASESOR",
        mb.b_creado_el_hora AS "HORA_CREACION",
        e.supervisor AS "SUPERVISOR_ASIGNADO",
        mb.b_modificado_el_fecha AS "FECHA_MODIFICACION",
        mb.b_modificado_el_hora AS "HORA_MODIFICACION",
        mb.b_origen AS "ORIGEN"
    FROM public.vw_bitrix_novonet mb
    ${joinEmpleadosDedup}
    WHERE mb.b_creado_el_fecha BETWEEN $1::date AND $2::date ${filtersJoin}
    LIMIT 6000
`;
```

- [ ] **Paso 3: verificar contra la BD (pgAdmin, antes de deployar)**

```sql
-- Filas totales vs leads distintos en un rango con actividad reciente:
-- si estos dos numeros difieren, confirma el bug y que el fix aplica.
SELECT COUNT(*) AS filas, COUNT(DISTINCT b_id) AS leads_distintos
FROM public.vw_bitrix_novonet
WHERE b_creado_el_fecha BETWEEN CURRENT_DATE - 30 AND CURRENT_DATE;
```

- [ ] **Paso 4: commit**

```bash
git add backend/src/controllers/indicadores.controller.js
git commit -m "fix: deduplicar export de leads Novonet (queryCRM) para que coincida con Bitrix"
```

---

## Task 3 — Velsa: lista de orígenes (`qOrigenes`)

**Files:**
- Modify: `backend/src/controllers/indicadoresVelsaMaterialized.controller.js` (bloque `qOrigenes`, dentro de la función que arma `getEtapasCache`/equivalente Velsa, ~línea 518-524)

**Por qué SÍ se puede cambiar el FROM aquí:** a diferencia de `queryCRM`, `qOrigenes` no tiene ningún `${filters}` — es una query fija, sin parámetros. Cero riesgo de romper un filtro compartido.

- [ ] **Paso 1: localizar**

```bash
grep -n "const qOrigenes = " backend/src/controllers/indicadoresVelsaMaterialized.controller.js
```

- [ ] **Paso 2: editar**

```js
// ANTES
const qOrigenes = `
  SELECT mv.origen AS origen, COUNT(*)::int AS total
  FROM ${MV}
  WHERE NULLIF(TRIM(mv.origen), '') IS NOT NULL
  GROUP BY 1
  ORDER BY total DESC, origen ASC
`;

// DESPUÉS
// FIX (leads reales, mismo bug que Novonet): mv_indicadores_velsa_completo
// hace FULL OUTER JOIN con el lado Jotform y puede repetir un lead N veces.
// bitrix_webhook_leads (empresa='velsa') es 1 fila por lead y es la fuente
// viva del webhook — no hace falta el JOIN para un conteo puro de origen.
const qOrigenes = `
  SELECT source AS origen, COUNT(*)::int AS total
  FROM public.bitrix_webhook_leads
  WHERE empresa = 'velsa' AND NULLIF(TRIM(source), '') IS NOT NULL
  GROUP BY 1
  ORDER BY total DESC, origen ASC
`;
```

- [ ] **Paso 3: verificar — comparar los nombres de origen, no solo el total**

`mv.origen` viene de `negociaciones_reporteria.fuente` (un sync aparte, poll cada 15 min a la API de Bitrix24), mientras que `source` viene del webhook en vivo. Pueden tener textos distintos para el mismo canal (mayúsculas, espacios, nombres viejos). Correr ANTES de deployar:

```sql
-- Orígenes que están en el webhook pero no en la vista materializada (o viceversa)
SELECT DISTINCT source FROM public.bitrix_webhook_leads
WHERE empresa='velsa' AND NULLIF(TRIM(source),'') IS NOT NULL
EXCEPT
SELECT DISTINCT origen FROM public.mv_indicadores_velsa_completo
WHERE NULLIF(TRIM(origen),'') IS NOT NULL;
```

Si esta query devuelve filas, hay orígenes que necesitan revisión de nombre antes de confiar en el nuevo total por origen (avisar antes de continuar — no es motivo para no aplicar el fix, pero sí para revisar el catálogo de orígenes de Velsa).

- [ ] **Paso 4: commit**

```bash
git add backend/src/controllers/indicadoresVelsaMaterialized.controller.js
git commit -m "fix: leer origenes de leads Velsa desde bitrix_webhook_leads (fuente real)"
```

---

## Task 4 — Velsa: export crudo "Detalle CRM" (mismo patrón que Task 2)

**Files:**
- Modify: `backend/src/controllers/indicadoresVelsaMaterialized.controller.js` (bloque `[DETALLE-CRM-VELSA]`, ~línea 1084-1091)

**Mismo razonamiento que Task 2:** esta query usa `${filters}` compartido (`buildFilters(req.query, values)`), así que no se cambia el FROM — se agrega `DISTINCT`.

```js
// ANTES
const result = await pool.query(`
  SELECT
    mv.id_crm AS "ID_CRM", mv.etapa_crm AS "ETAPA_CRM",
    mv.fecha_creacion_crm AS "FECHA_CREACION_CRM",
    mv.asesor AS "ASESOR", mv.supervisor AS "SUPERVISOR_ASIGNADO",
    mv.fecha_modificacion_crm AS "FECHA_MODIFICACION", mv.origen AS "ORIGEN"
  FROM ${MV}
  WHERE mv.fecha_creacion_crm::date BETWEEN $1::date AND $2::date ${filters}
  ORDER BY mv.fecha_creacion_crm DESC LIMIT 6000
`, values);

// DESPUÉS
const result = await pool.query(`
  SELECT DISTINCT
    mv.id_crm AS "ID_CRM", mv.etapa_crm AS "ETAPA_CRM",
    mv.fecha_creacion_crm AS "FECHA_CREACION_CRM",
    mv.asesor AS "ASESOR", mv.supervisor AS "SUPERVISOR_ASIGNADO",
    mv.fecha_modificacion_crm AS "FECHA_MODIFICACION", mv.origen AS "ORIGEN"
  FROM ${MV}
  WHERE mv.fecha_creacion_crm::date BETWEEN $1::date AND $2::date ${filters}
  ORDER BY mv.fecha_creacion_crm DESC LIMIT 6000
`, values);
```

Nota: `SELECT DISTINCT` + `ORDER BY mv.fecha_creacion_crm` puede requerir que el `ORDER BY` sea parte del `SELECT` en algunos motores — en Postgres esto funciona sin problema porque `fecha_creacion_crm` ya está en el SELECT.

- [ ] Aplicar el cambio.
- [ ] Commit: `git commit -m "fix: deduplicar export Detalle CRM Velsa"`

---

## Task 5 (FUERA DE ALCANCE DE ESTE PLAN — plan aparte) — Velsa: migrar `mv_indicadores_velsa_completo` para que el lado CRM salga de `bitrix_webhook_leads`

Los Tasks 1-4 arreglan el síntoma (conteo inflado por el JOIN). Pero en Velsa el lado CRM de la vista materializada sale de `negociaciones_reporteria`, que es un **sync aparte cada 15 minutos contra la API de Bitrix24** — no el webhook. Aunque ya no infle, sigue sin ser exactamente "lo que dice bitrix_webhook_leads en este instante" (puede ir unos minutos atrás, o tener algún lead que el poll no trajo bien).

Por qué esto merece su propio plan y no se hace hoy:
1. `negociaciones_reporteria.responsable_id` es un FK numérico a `employees` — `bitrix_webhook_leads.responsible` es solo texto. Hay que migrar ese cruce a comparación por nombre (como ya lo resuelve Novonet en otro lado), y auditar que no cambien los supervisores mostrados en ventas históricas.
2. Hay que remapear columna por columna (`nr.fuente`→`source`, `nr.etapa`→`etapa_bitrix`, `nr.creado_en`→`created_at`, etc.) dentro de `backend/src/jobs/refreshVelsa.materialized.sql`, y decidir qué pasa con los leads que estén en `negociaciones_reporteria` pero no en `bitrix_webhook_leads` (¿el webhook de Velsa ya cubre el 100% de las automatizaciones de ese Bitrix, o hay etapas/pipelines que todavía no disparan el webhook?).
3. Toca el refresh cron (`refreshVelsaMaterialized.cron.js`) y probablemente varias de las ~30 queries de `indicadoresVelsaMaterialized.controller.js` que asumen las columnas actuales de `negociaciones_reporteria`.

**Recomendación:** aplicar Tasks 1-4 ahora (arreglan el 90% del síntoma reportado — el conteo inflado), y agendar Task 5 como su propio plan cuando haya tiempo para probarlo con calma (ideal: correr la vista nueva EN PARALELO a la vieja unos días, comparando totales, antes de reemplazarla).

---

## Orden de ejecución sugerido

1. Task 1 — ya aplicado, solo falta commit + verificación visual.
2. Task 2 — Novonet queryCRM.
3. Task 3 — Velsa qOrigenes.
4. Task 4 — Velsa Detalle CRM.
5. Push a Render (rama `main`, servicios `core`/`analitica-novo`/`analitica-velsa` según corresponda — confirmar en qué proceso vive cada controller antes de asumir auto-deploy).
6. Task 5 — plan aparte, no ejecutar todavía.
