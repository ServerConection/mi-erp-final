# Bot Auditor Intelligence Contactability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir dentro de Bot Auditor un dashboard gerencial y operativo de Contactabilidad por origen, asesor, etapa y horario, basado en mensajes reales y filtros consistentes.

**Architecture:** PostgreSQL calculará universos filtrados, episodios de respuesta y agregaciones. Un endpoint analítico único devolverá bloques preagregados; React presentará dos pestañas (`Inteligencia` y `Operación`) con Recharts y componentes separados. El recolector existente seguirá siendo la única fuente de escritura.

**Tech Stack:** Node.js CommonJS, Express 5, PostgreSQL 16, React 19, Vite 5, Recharts 3, `node:test`.

**Spec:** `docs/superpowers/specs/2026-08-25-bot-auditor-inteligencia-contactabilidad-design.md`

## Global Constraints

- Interpretar filtros y horas en `America/Guayaquil`.
- No exponer texto de mensajes, teléfonos, tokens ni webhooks.
- Contactabilidad = `leads con al menos un mensaje CLIENTE / leads totales * 100`.
- Usar mediana como indicador principal de tiempo; percentil 90 como riesgo.
- Un lead cuenta máximo una vez por día y hora en el mapa de calor.
- Orígenes con menos de 10 leads deben marcarse `muestra_insuficiente: true`.
- Reutilizar la normalización existente de etapas negociables y `Venta Subida`.
- No añadir dependencias frontend; usar `recharts` ya instalado.
- No modificar ni eliminar tablas actuales.

---

### Task 1: Constructor único de filtros analíticos

**Files:**
- Create: `backend/src/contactabilidad/contactabilidad.analytics.js`
- Create: `backend/test/contactabilidad.analytics.test.js`

**Interfaces:**
- Produces: `construirFiltros(query) -> { whereSql, params }`.
- `whereSql` referencia el alias `l` de `contactabilidad_leads`.
- Accepted query fields: `desde`, `hasta`, `empresa`, `origen`, `asesor_id`, `etapa`.

- [ ] **Step 1: Write the failing tests**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { construirFiltros } = require('../src/contactabilidad/contactabilidad.analytics');

test('construye filtros parametrizados y fechas Ecuador', () => {
  const result = construirFiltros({
    desde: '2026-08-01', hasta: '2026-08-25', empresa: 'novonet',
    origen: 'WEB', asesor_id: '20', etapa: 'ATC',
  });
  assert.deepEqual(result.params, ['NOVONET', 'WEB', '20', 'ATC', '2026-08-01', '2026-08-25']);
  assert.match(result.whereSql, /l\.empresa = \$1/);
  assert.match(result.whereSql, /America\/Guayaquil/);
  assert.doesNotMatch(result.whereSql, /novonet|WEB|ATC/);
});

test('rechaza fechas invalidas', () => {
  assert.throws(() => construirFiltros({ desde: '25/08/2026' }), /YYYY-MM-DD/);
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run:

```bash
cd backend
node --test test/contactabilidad.analytics.test.js
```

Expected: FAIL because `contactabilidad.analytics.js` does not exist.

- [ ] **Step 3: Implement the minimal filter builder**

```js
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

function construirFiltros(query = {}) {
  const params = [];
  const where = [];
  const add = (value, clause) => { params.push(value); where.push(clause(params.length)); };

  if (query.empresa) add(String(query.empresa).toUpperCase(), (n) => `l.empresa = $${n}`);
  if (query.origen) add(String(query.origen), (n) => `COALESCE(l.origen_nombre,'') = $${n}`);
  if (query.asesor_id) add(String(query.asesor_id), (n) => `l.asesor_id = $${n}`);
  if (query.etapa) add(String(query.etapa), (n) => `COALESCE(l.etapa_nombre,l.etapa_id,'') = $${n}`);
  for (const key of ['desde', 'hasta']) {
    if (query[key] && !FECHA.test(query[key])) throw new TypeError(`${key} debe usar YYYY-MM-DD`);
  }
  if (query.desde) add(query.desde, (n) => `(l.fecha_creacion AT TIME ZONE 'America/Guayaquil')::date >= $${n}::date`);
  if (query.hasta) add(query.hasta, (n) => `(l.fecha_creacion AT TIME ZONE 'America/Guayaquil')::date <= $${n}::date`);
  return { whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

module.exports = { construirFiltros };
```

- [ ] **Step 4: Run the tests and verify GREEN**

Run: `node --test test/contactabilidad.analytics.test.js`  
Expected: 2 passing, 0 failing.

- [ ] **Step 5: Commit**

```bash
git add backend/src/contactabilidad/contactabilidad.analytics.js backend/test/contactabilidad.analytics.test.js
git commit -m "feat: agregar filtros analiticos de contactabilidad"
```

---

### Task 2: Consultas de episodios y agregaciones gerenciales

**Files:**
- Modify: `backend/src/contactabilidad/contactabilidad.analytics.js`
- Modify: `backend/test/contactabilidad.analytics.test.js`

**Interfaces:**
- Consumes: `construirFiltros(query)` from Task 1.
- Consumes: `esGestionableExpr('l.etapa_nombre')` from `backend/src/shared/etapas.js`; Venta Subida uses normalized `UPPER(TRIM(COALESCE(l.etapa_nombre,''))) = 'VENTA SUBIDA'`.
- Produces: `obtenerAnalytics(pool, query) -> Promise<AnalyticsPayload>`.
- `AnalyticsPayload` contains `resumen`, `por_origen`, `por_asesor`, `por_etapa`, `por_hora`, `embudo`, `operativo`, `calidad_datos`.

- [ ] **Step 1: Add a failing contract test with a recording pool**

```js
test('devuelve todos los bloques del contrato analitico', async () => {
  const calls = [];
  const pool = { query: async (sql, params) => {
    calls.push({ sql, params });
    return { rows: [] };
  } };
  const data = await obtenerAnalytics(pool, { empresa: 'NOVONET' });
  assert.deepEqual(Object.keys(data), [
    'resumen', 'por_origen', 'por_asesor', 'por_etapa',
    'por_hora', 'embudo', 'operativo', 'calidad_datos',
  ]);
  assert.ok(calls.every((call) => call.params[0] === 'NOVONET'));
  assert.ok(calls.some((call) => call.sql.includes('PERCENTILE_CONT(0.5)')));
  assert.ok(calls.some((call) => call.sql.includes("AT TIME ZONE 'America/Guayaquil'")));
});
```

- [ ] **Step 2: Verify RED**

Run: `node --test test/contactabilidad.analytics.test.js`  
Expected: FAIL because `obtenerAnalytics` is not exported.

- [ ] **Step 3: Implement the filtered lead universe and response episodes**

Use this CTE at the start of response-time queries:

```sql
WITH universo AS (
  SELECT l.*
  FROM contactabilidad_leads l
  ${whereSql}
), ordenados AS (
  SELECT m.empresa, m.id_bitrix, m.emisor_tipo, m.mensaje_at,
         LAG(m.emisor_tipo) OVER (
           PARTITION BY m.empresa, m.id_bitrix ORDER BY m.mensaje_at, m.id
         ) AS emisor_anterior
  FROM contactabilidad_mensajes m
  JOIN universo u ON u.empresa = m.empresa AND u.id_bitrix = m.id_bitrix
), inicios_cliente AS (
  SELECT *, SUM(CASE WHEN emisor_tipo = 'CLIENTE'
                          AND emisor_anterior IS DISTINCT FROM 'CLIENTE'
                     THEN 1 ELSE 0 END)
       OVER (PARTITION BY empresa, id_bitrix ORDER BY mensaje_at) AS episodio
  FROM ordenados
), episodios AS (
  SELECT empresa, id_bitrix, episodio,
         MIN(mensaje_at) FILTER (WHERE emisor_tipo = 'CLIENTE') AS cliente_at,
         MIN(mensaje_at) FILTER (WHERE emisor_tipo = 'ASESOR') AS asesor_at
  FROM inicios_cliente
  WHERE episodio > 0
  GROUP BY empresa, id_bitrix, episodio
), respuestas AS (
  SELECT *, EXTRACT(EPOCH FROM (asesor_at - cliente_at))::bigint AS respuesta_seg
  FROM episodios
  WHERE asesor_at > cliente_at
)
```

For first response, calculate per lead from the first `CLIENTE` and first later `ASESOR`. For medians use:

```sql
PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY respuesta_seg)
```

and for risk:

```sql
PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY respuesta_seg)
```

- [ ] **Step 4: Implement the eight preaggregated blocks**

Required shapes:

```js
{
  resumen: {
    leads: 0, contactados: 0, tasa_contactabilidad: 0,
    mensajes_cliente: 0, mensajes_asesor: 0,
    mediana_primera_respuesta_seg: null, p90_respuesta_seg: null,
    pendientes_asesor: 0, pendientes_30m: 0, ultima_sincronizacion: null,
  },
  por_origen: [{ origen, leads, contactados, tasa_contactabilidad, mensajes_cliente_por_lead, mediana_primera_respuesta_seg, pendientes_asesor, ventas_subidas, muestra_insuficiente }],
  por_asesor: [{ asesor_id, asesor_nombre, leads, contactados, mensajes_cliente, mensajes_asesor, mediana_primera_respuesta_seg, mediana_respuesta_episodio_seg, pendientes_asesor, pendientes_30m }],
  por_etapa: [{ etapa_id, etapa_nombre, leads, contactados, tasa_contactabilidad, mensajes_cliente, mensajes_asesor, pendientes_asesor, mediana_espera_cliente_seg }],
  por_hora: [{ dia_semana_iso, dia_nombre, hora, leads_unicos, mensajes_cliente }],
  embudo: [{ clave, etiqueta, leads }],
  operativo: [{ empresa, id_bitrix, nombre_cliente, asesor_id, asesor_nombre, origen_nombre, etapa_id, etapa_nombre, fecha_creacion, mensajes_cliente_total, mensajes_asesor_total, ultimo_mensaje_cliente_at, ultimo_mensaje_asesor_at, pendiente_por, minutos_pendiente }],
  calidad_datos: { leads, con_origen, con_asesor, con_etapa, con_mensajes, ultima_sincronizacion },
}
```


The `operativo` query returns at most 100 rows ordered by unanswered adviser priority and recent activity. Calculate pending minutes only when `pendiente_por = 'ASESOR'`:

```sql
CASE WHEN l.pendiente_por = 'ASESOR'
     THEN FLOOR(EXTRACT(EPOCH FROM (NOW() - l.ultimo_mensaje_cliente_at)) / 60)::int
     ELSE NULL END AS minutos_pendiente
```
Use `COUNT(DISTINCT (m.empresa, m.id_bitrix, (m.mensaje_at AT TIME ZONE 'America/Guayaquil')::date, EXTRACT(HOUR FROM m.mensaje_at AT TIME ZONE 'America/Guayaquil')))` for the heatmap universe.

- [ ] **Step 5: Run backend tests**

```bash
node --test test/contactabilidad.analytics.test.js test/contactabilidad.*.test.js
```

Expected: all Contactabilidad tests pass.

- [ ] **Step 6: Commit**

```bash
git add backend/src/contactabilidad/contactabilidad.analytics.js backend/test/contactabilidad.analytics.test.js
git commit -m "feat: calcular inteligencia de contactabilidad"
```

---

### Task 3: Endpoint analítico autenticado

**Files:**
- Modify: `backend/src/controllers/contactabilidad.controller.js`
- Modify: `backend/src/routes/contactabilidad.routes.js`
- Create: `backend/test/contactabilidad.controller.analytics.test.js`

**Interfaces:**
- Consumes: `obtenerAnalytics(pool, req.query)`.
- Produces: `GET /api/bot-auditor/contactabilidad/analytics`.
- Success: `{ success: true, data: AnalyticsPayload }`.
- Invalid filter: HTTP 400. Database error: HTTP 500 with no SQL details.

- [ ] **Step 1: Write failing controller tests**

```js
test('analytics responde el contrato del servicio', async () => {
  const req = { query: { empresa: 'NOVONET' } };
  const sent = {};
  const res = { status(code) { sent.status = code; return this; }, json(body) { sent.body = body; } };
  await analytics(req, res, { obtener: async () => ({ resumen: { leads: 7 } }) });
  assert.equal(sent.body.success, true);
  assert.equal(sent.body.data.resumen.leads, 7);
});

test('analytics devuelve 400 para fecha invalida', async () => {
  const req = { query: { desde: '25/08/2026' } };
  const sent = {};
  const res = { status(code) { sent.status = code; return this; }, json(body) { sent.body = body; } };
  await analytics(req, res, { obtener: async () => { throw new TypeError('desde debe usar YYYY-MM-DD'); } });
  assert.equal(sent.status, 400);
});
```

- [ ] **Step 2: Verify RED**

Run: `node --test test/contactabilidad.controller.analytics.test.js`  
Expected: FAIL because `analytics` is not exported.

- [ ] **Step 3: Implement controller and route**

```js
async function analytics(req, res, deps = {}) {
  const obtener = deps.obtener || ((query) => obtenerAnalytics(pool, query));
  try {
    const data = await obtener(req.query);
    res.json({ success: true, data });
  } catch (error) {
    const status = error instanceof TypeError ? 400 : 500;
    console.error('[contactabilidad] analytics:', error.message);
    res.status(status).json({ success: false, error: status === 400 ? error.message : 'Error calculando inteligencia de Contactabilidad' });
  }
}
```

Register before `router.get('/')`:

```js
router.get('/analytics', analytics);
```

- [ ] **Step 4: Verify controller and existing routes**

Run:

```bash
node --check src/controllers/contactabilidad.controller.js
node --test test/contactabilidad.controller.analytics.test.js test/contactabilidad.*.test.js
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/controllers/contactabilidad.controller.js backend/src/routes/contactabilidad.routes.js backend/test/contactabilidad.controller.analytics.test.js
git commit -m "feat: exponer analitica de contactabilidad"
```

---

### Task 4: Cliente frontend, filtros compartibles y formateadores

**Files:**
- Create: `frontend/src/utils/contactabilidadAnalytics.js`
- Create: `frontend/src/utils/contactabilidadAnalytics.test.js`

**Interfaces:**
- Produces: `buildAnalyticsQuery(filters)`, `formatDuration(seconds)`, `readFilters(search)`, `writeFilters(filters)`.
- Filter shape: `{ desde, hasta, empresa, origen, asesor_id, etapa }`.

- [ ] **Step 1: Write failing utility tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAnalyticsQuery, formatDuration, readFilters } from './contactabilidadAnalytics.js';

test('serializa solo filtros con valor', () => {
  assert.equal(buildAnalyticsQuery({ empresa: 'NOVONET', origen: '', desde: '2026-08-01' }), 'empresa=NOVONET&desde=2026-08-01');
});

test('formatea segundos de respuesta', () => {
  assert.equal(formatDuration(90), '1 min 30 s');
  assert.equal(formatDuration(null), 'Sin datos');
});

test('lee filtros permitidos desde la URL', () => {
  assert.deepEqual(readFilters('?empresa=NOVONET&hack=x'), { desde: '', hasta: '', empresa: 'NOVONET', origen: '', asesor_id: '', etapa: '' });
});
```

- [ ] **Step 2: Verify RED**

Run: `node --test src/utils/contactabilidadAnalytics.test.js`  
Expected: FAIL because utility does not exist.

- [ ] **Step 3: Implement the utilities**

Use a fixed allowlist:

```js
export const FILTER_KEYS = ['desde', 'hasta', 'empresa', 'origen', 'asesor_id', 'etapa'];

export function buildAnalyticsQuery(filters) {
  const p = new URLSearchParams();
  FILTER_KEYS.forEach((key) => filters[key] && p.set(key, filters[key]));
  return p.toString();
}
```

`formatDuration` must output seconds below one minute, minutes/hours below one day, and days otherwise.

- [ ] **Step 4: Verify GREEN**

Run: `node --test src/utils/contactabilidadAnalytics.test.js`  
Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/contactabilidadAnalytics.js frontend/src/utils/contactabilidadAnalytics.test.js
git commit -m "feat: agregar utilidades del dashboard de contactabilidad"
```

---

### Task 5: Shell del dashboard, pestañas y filtros globales

**Files:**
- Create: `frontend/src/pages/contactabilidad/ContactabilidadFilters.jsx`
- Create: `frontend/src/pages/contactabilidad/ContactabilidadKpis.jsx`
- Modify: `frontend/src/pages/Contactabilidad.jsx`

**Interfaces:**
- `ContactabilidadFilters({ filters, options, onChange, onReset })`.
- `ContactabilidadKpis({ resumen, loading })`.
- `Contactabilidad` fetches `/api/bot-auditor/contactabilidad/analytics?<query>`; `data.operativo` alimenta la mesa operativa y elimina la segunda consulta duplicada.

- [ ] **Step 1: Extend utility tests for URL round-trip**

```js
test('los filtros sobreviven ida y vuelta por URL', () => {
  const original = { desde: '2026-08-01', hasta: '2026-08-25', empresa: 'NOVONET', origen: 'WEB', asesor_id: '20', etapa: 'ATC' };
  assert.deepEqual(readFilters(`?${buildAnalyticsQuery(original)}`), original);
});
```

- [ ] **Step 2: Verify RED and implement URL round-trip**

Run: `node --test src/utils/contactabilidadAnalytics.test.js`  
Expected before implementation: FAIL. Expected after implementation: PASS.

- [ ] **Step 3: Build the page shell**

State:

```jsx
const [tab, setTab] = useState('inteligencia');
const [filters, setFilters] = useState(() => readFilters(window.location.search));
const [analytics, setAnalytics] = useState(null);
const [loadingAnalytics, setLoadingAnalytics] = useState(true);
```

On filter change, call:

```js
window.history.replaceState(null, '', `${window.location.pathname}?${buildAnalyticsQuery(filters)}`);
```

Fetch analytics with `AbortController` and refresh every 30 minutes. Do not allow a stale response to overwrite newer filters.

- [ ] **Step 4: Build filters and KPI cards**

Cards must be:

```js
[
  ['Leads', resumen.leads],
  ['Contactados', resumen.contactados],
  ['Contactabilidad', `${resumen.tasa_contactabilidad}%`],
  ['Mediana 1ª respuesta', formatDuration(resumen.mediana_primera_respuesta_seg)],
  ['Pendientes asesor', resumen.pendientes_asesor],
  ['Más de 30 min', resumen.pendientes_30m],
]
```

Options for origins, advisers and stages come from the analytical response, deduplicated and sorted.

- [ ] **Step 5: Build and verify**

```bash
node --test src/utils/contactabilidadAnalytics.test.js
npm run build
```

Expected: tests pass; Vite exits 0.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/Contactabilidad.jsx frontend/src/pages/contactabilidad/ContactabilidadFilters.jsx frontend/src/pages/contactabilidad/ContactabilidadKpis.jsx frontend/src/utils/contactabilidadAnalytics.js frontend/src/utils/contactabilidadAnalytics.test.js
git commit -m "feat: crear shell de inteligencia de contactabilidad"
```

---

### Task 6: Rankings por origen, asesor y etapa

**Files:**
- Create: `frontend/src/pages/contactabilidad/ContactabilidadRankings.jsx`
- Modify: `frontend/src/pages/Contactabilidad.jsx`
- Modify: `frontend/src/utils/contactabilidadAnalytics.js`
- Modify: `frontend/src/utils/contactabilidadAnalytics.test.js`

**Interfaces:**
- `ContactabilidadRankings({ porOrigen, porAsesor, porEtapa })`.
- Produces three Recharts panels and sortable detail tables.

- [ ] **Step 1: Write failing ranking tests**

```js
test('ordena origenes validos antes de muestras insuficientes', () => {
  const rows = rankOrigins([
    { origen: 'A', tasa_contactabilidad: 90, leads: 2, muestra_insuficiente: true },
    { origen: 'B', tasa_contactabilidad: 60, leads: 20, muestra_insuficiente: false },
  ]);
  assert.equal(rows[0].origen, 'B');
});
```

- [ ] **Step 2: Verify RED and implement `rankOrigins`**

Valid samples sort by contactability descending, then leads descending; insufficient samples remain at the bottom.

- [ ] **Step 3: Build the three chart panels**

- Origin: horizontal `BarChart` with contactability percentage and sample badge.
- Adviser: composed horizontal bars for pending leads and median response.
- Stage: bars for leads with contactability in tooltip.

Every tooltip must show numerator and denominator; never show only a percentage.

- [ ] **Step 4: Add sortable detail tables**

Use buttons in headers, not clickable `<th>` without keyboard behavior. Default sorts:

- Origin: contactability descending, valid samples first.
- Adviser: pending over 30 minutes descending.
- Stage: leads descending.

- [ ] **Step 5: Verify**

```bash
node --test src/utils/contactabilidadAnalytics.test.js
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/Contactabilidad.jsx frontend/src/pages/contactabilidad/ContactabilidadRankings.jsx frontend/src/utils/contactabilidadAnalytics.js frontend/src/utils/contactabilidadAnalytics.test.js
git commit -m "feat: agregar rankings de contactabilidad"
```

---

### Task 7: Mapa horario, embudo, calidad y mesa operativa

**Files:**
- Create: `frontend/src/pages/contactabilidad/ContactabilidadHeatmap.jsx`
- Create: `frontend/src/pages/contactabilidad/ContactabilidadFunnel.jsx`
- Create: `frontend/src/pages/contactabilidad/ContactabilidadQuality.jsx`
- Create: `frontend/src/pages/contactabilidad/ContactabilidadOperationalTable.jsx`
- Modify: `frontend/src/pages/Contactabilidad.jsx`
- Modify: `frontend/src/utils/contactabilidadAnalytics.js`
- Modify: `frontend/src/utils/contactabilidadAnalytics.test.js`

**Interfaces:**
- `ContactabilidadHeatmap({ data })` renders 7 × 16 cells for 07:00–22:59.
- `ContactabilidadFunnel({ data })` renders ordered stage widths.
- `ContactabilidadQuality({ data })` exposes coverage and last sync.
- `ContactabilidadOperationalTable({ rows, loading })` preserves the current table and adds priority.

- [ ] **Step 1: Write failing heatmap and priority tests**

```js
test('crea una matriz completa aunque falten horas', () => {
  const matrix = buildHeatmap([{ dia_semana_iso: 1, hora: 9, leads_unicos: 3 }]);
  assert.equal(matrix.length, 7);
  assert.equal(matrix[0].hours.length, 16);
  assert.equal(matrix[0].hours.find((h) => h.hora === 9).leads_unicos, 3);
});

test('clasifica prioridad por minutos pendientes', () => {
  assert.equal(pendingPriority({ pendiente_por: 'ASESOR', minutos_pendiente: 75 }), 'critico');
  assert.equal(pendingPriority({ pendiente_por: 'ASESOR', minutos_pendiente: 45 }), 'alerta');
  assert.equal(pendingPriority({ pendiente_por: 'CLIENTE', minutos_pendiente: 90 }), 'normal');
});
```

- [ ] **Step 2: Verify RED and implement helpers**

`buildHeatmap` must generate days 1–7 and hours 7–22. `pendingPriority` thresholds are `critico >= 60`, `alerta >= 30`, otherwise `normal`, only when pending belongs to adviser.

- [ ] **Step 3: Build heatmap and funnel**

Heatmap cell color is based on `leads_unicos`; tooltip includes day, hour, unique leads and total client messages. Funnel order must use the API order and show absolute count plus conversion against `Leads creados`.

- [ ] **Step 4: Move current table into operational component**

Add columns `Min. pendiente` and `Prioridad`. Keep customer, adviser, origin, stage, creation date and both message timestamps. Empty state text:

```text
No existen leads para los filtros seleccionados. Revisa el rango de fechas o la última sincronización.
```

- [ ] **Step 5: Add quality panel**

Display coverage ratios:

```js
[
  ['Con origen', calidad.con_origen, calidad.leads],
  ['Con asesor', calidad.con_asesor, calidad.leads],
  ['Con etapa', calidad.con_etapa, calidad.leads],
  ['Con mensajes', calidad.con_mensajes, calidad.leads],
]
```

- [ ] **Step 6: Verify frontend**

```bash
node --test src/utils/contactabilidadAnalytics.test.js
npm run build
```

Expected: utilities pass and production bundle builds.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/Contactabilidad.jsx frontend/src/pages/contactabilidad frontend/src/utils/contactabilidadAnalytics.js frontend/src/utils/contactabilidadAnalytics.test.js
git commit -m "feat: completar dashboard de contactabilidad"
```

---

### Task 8: Validación con datos reales y preparación de despliegue

**Files:**
- Modify only if evidence requires a correction: files introduced in Tasks 1–7.

**Interfaces:**
- Validates the complete contract from PostgreSQL to React.

- [ ] **Step 1: Run the complete backend Contactabilidad suite**

```bash
cd backend
node --test test/contactabilidad.*.test.js
```

Expected: 0 failures.

- [ ] **Step 2: Validate analytics against PostgreSQL read-only**

```bash
node -e "require('dotenv').config(); const pool=require('./src/config/db'); const {obtenerAnalytics}=require('./src/contactabilidad/contactabilidad.analytics'); obtenerAnalytics(pool,{empresa:'NOVONET',desde:'2026-07-01'}).then(d=>{console.log({leads:d.resumen.leads,origenes:d.por_origen.length,asesores:d.por_asesor.length,etapas:d.por_etapa.length,horas:d.por_hora.length});return pool.end()}).catch(e=>{console.error(e);process.exit(1)})"
```

Expected: non-negative counts; no message text or credentials in output.

- [ ] **Step 3: Check invariants**

Verify in a read-only script:

```js
assert.ok(data.resumen.contactados <= data.resumen.leads);
assert.equal(data.embudo[0].leads, data.resumen.leads);
assert.ok(data.por_origen.every((row) => row.contactados <= row.leads));
assert.ok(data.por_hora.every((row) => row.hora >= 7 && row.hora <= 22));
```

- [ ] **Step 4: Run frontend tests and build**

```bash
cd ../frontend
node --test src/utils/contactabilidadAnalytics.test.js
npm run build
```

Expected: tests pass and Vite exits 0.

- [ ] **Step 5: Inspect staged scope**

```bash
git diff --check
git status --short
```

Stage only files named in this plan; preserve unrelated working-tree changes.

- [ ] **Step 6: Final commit if validation required corrections**

```bash
git add backend/src/contactabilidad/contactabilidad.analytics.js backend/src/controllers/contactabilidad.controller.js backend/src/routes/contactabilidad.routes.js backend/test/contactabilidad.analytics.test.js backend/test/contactabilidad.controller.analytics.test.js frontend/src/pages/Contactabilidad.jsx frontend/src/pages/contactabilidad frontend/src/utils/contactabilidadAnalytics.js frontend/src/utils/contactabilidadAnalytics.test.js
git commit -m "fix: validar inteligencia de contactabilidad"
```

- [ ] **Step 7: Push and deploy**

```bash
git push origin main
```

Deploy backend first, verify `GET /api/bot-auditor/contactabilidad/analytics`, deploy frontend second, then use `Ctrl + F5`. Do not change `CONTACTABILIDAD_*` environment variables during this dashboard deployment.
