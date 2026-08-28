# DICCIONARIO DE INDICADORES — ERP NOVONET / VELSA

**Versión:** 2026-08-17
**Fuente del código:**
`backend/src/shared/etapas.js` (reglas de etapas) ·
`backend/src/controllers/indicadores.controller.js` (Novonet) ·
`backend/src/controllers/indicadoresVelsaMaterialized.controller.js` (Velsa) ·
`frontend/src/pages/Indicadores.jsx` / `IndicadoresVelsa.jsx` (tarjetas)

---

## 0. LO PRIMERO: LAS 3 BASES DE FECHA

Casi todos los errores de "no cuadra" vienen de mezclar bases de fecha. Hay tres:

| Clave | Qué es | Novonet | Velsa |
|---|---|---|---|
| **FECHA CRM** | Cuándo se creó la negociación en Bitrix | `b_creado_el_fecha` (`_bc_date`) | `fecha_creacion_crm::date` |
| **FECHA JOT** | Cuándo se registró la venta en Jotform | `j_fecha_registro_sistema` (`_jf_date`) | `(fecha_registro_jotform − 5 h)::date` |
| **FECHA ACTIVACIÓN** | Cuándo Netlife activó el servicio | `j_fecha_activacion_netlife` (`_jfact_date`) | `fecha_activacion::date` |

> Velsa resta 5 horas porque `fecha_registro_jotform` viene en UTC.
> Novonet ya viene en hora local.

**Regla de oro:** un indicador del lado CRM (leads, gestionables, descarte) usa FECHA CRM.
Un indicador del lado Jotform (ingresos, activas, tarjeta, 3ra edad) usa FECHA JOT.
Comparar uno contra otro sin entender esto es la causa #1 de descuadres.

---

## 1. TABLA DE ETAPAS (fuente única: `shared/etapas.js`)

### 1.1 Etapas que NO cuentan como lead
Regla de gerencia 2026-08-15. No son leads nuevos, son ruido que infla el denominador.

```
DUPLICADO · DUPLLICADO (typo real) · REGULARIZACION · REGULARIZACIÓN · REMARKETING
```

### 1.2 Etapas NO gestionables
Todo lo que **no** está en esta lista es gestionable.

```
ATC · ATC/SOPORTE · FUERA DE COBERTURA · ZONA PELIGROSA · ZONAS PELIGROSAS
POSTVENTA (exacto — "POSTVENTA NOVONET" SÍ es gestionable)
CONTRATO PARAMOUNT · PARAMOUNT SEGU(I)MIENTO POR CERRAR
+ las 5 del punto 1.1
```

⚠️ **INNEGOCIABLE — única diferencia real entre empresas:**

| | INNEGOCIABLE cuenta como gestionable |
|---|---|
| **Novonet** (dashboard) | **SÍ** (`innegociableEsGestionable: true`) |
| **Velsa** | **NO** |
| Resto de módulos (D-1, monitoreo, forecast) | NO |

Con el export del 01→17 ago: son 36 leads. Velsa da 40,3 % de gestionables; si se igualara a Novonet daría 42,1 %.

### 1.3 Etapas de DESCARTE (subconjunto de gestionables)

```
CONTRATO NETLIFE · DESCARTE · DESISTE DE COMPRA · MANTIENE PROVEEDOR
NO INTERESA COSTO PLAN · NO VOLVER A CONTACTAR · OTRO PROVEEDOR
DESCARTE REMARKETIZADO · CONTRATO NETLIFE POR OTRO CANAL · DESCARTE PLAN DE 200
NO INTERESA COSTO INSTALACIÓN / INSTALACION
```

La comparación es **siempre** `UPPER(TRIM(etapa))`, así no importa el casing.

---

## 2. INDICADORES DE VOLUMEN (lado CRM)

### 2.1 LEADS TOTALES
```
COUNT(DISTINCT id_crm)
WHERE  FECHA CRM ∈ [desde, hasta]
  AND  etapa NOT IN (lista 1.1)
```
- `COUNT(DISTINCT id)` y **no** `COUNT(*)`: un lead con 5 servicios Jotform aparece en 5 filas.
- **Novonet añade** `sumaReporteExpr` → descarta el origen literal `REMARKETING`.
- **Velsa NO filtra por origen** (decisión tuya: "leads totales trae todo lo que entra").

### 2.2 GESTIONABLES
```
COUNT(DISTINCT id_crm)
WHERE  FECHA CRM ∈ [desde, hasta]      ← misma base que leads totales
  AND  etapa NOT IN (lista 1.2)
```
Usa la **misma** base de fecha que leads totales, para que siempre sea un subconjunto.
(Antes usaba una ventana más amplia y gestionables llegaba a superar a leads totales.)

### 2.3 % GEST. VS TOTALES
```
Gestionables ÷ Leads Totales × 100
```
Se calcula en el frontend sumando todas las filas (supervisores) primero, no promediando porcentajes.

### 2.4 VENTAS CRM (Ingresos CRM)
```
COUNT(DISTINCT id_crm)
WHERE  etapa = 'VENTA SUBIDA'
  AND  FECHA CRM ∈ [desde, hasta]
```
Cambio 2026-07-28: va por **fecha de creación**, no por fecha de cerrado.

### 2.5 DESCARTE %
```
COUNT(etapas de descarte, por FECHA CRM)
────────────────────────────────────────  × 100
        GESTIONABLES (ventana AMPLIA)
```
⚠️ **El denominador NO es el número "Gestionables" que ves en pantalla.**
La ventana amplia es `FECHA JOT ∈ rango  OR  FECHA CRM ∈ rango`.
Esto viene de Novonet y Velsa lo replica igual (`GEST_AMPLIO`) para que ambos den lo mismo.
Unificar los dos criterios es decisión de gerencia, no técnica.

---

## 3. INDICADORES DE INGRESO (lado Jotform)

### 3.1 INGRESOS TOT. JOT (`ingresos_reales`)
```
COUNT(*)  WHERE FECHA JOT ∈ [desde, hasta]
```
Aquí sí `COUNT(*)`: cada fila Jotform es una venta distinta.

### 3.2 INGRESOS CRM DÍA (`ventas_del_dia`)
```
COUNT(DISTINCT id_crm)
WHERE  etapa = 'VENTA SUBIDA'
  AND  FECHA JOT ∈ [desde, hasta]
  AND  FECHA CRM = FECHA JOT      ← creado y vendido el MISMO día
```

### 3.3 INGRESOS JOT DÍA (`ventas_dia_form`)
Mismo número que 3.2. Novonet lo emite en `mergeVentasDia`; Velsa en `mergeBacklog`.
*(Corregido el 2026-08-17: Velsa no lo devolvía y la tarjeta salía siempre en 0.)*

### 3.4 INGRESOS JOT SEG. (`venta_seguimiento`)
```
max(0,  Ingresos Tot. Jot  −  Ventas del día)
```
Ventas que no se cerraron el mismo día que entró el lead.

---

## 4. INDICADORES DE EFECTIVIDAD

| Indicador | Numerador | Denominador |
|---|---|---|
| **Efect. vs Gestion.** (`efectividad`) | Ingresos Tot. Jot | Gestionables (pantalla) |
| **Efect. vs Leads Tot.** | Ingresos Tot. Jot | Leads Totales |
| `efectividad_real` (tabla KPI) | Ingresos Tot. Jot | Gestionables **ventana amplia** |
| `efectividad_realz` | Ingresos Tot. Jot | Gestionables (FECHA CRM) |
| **Eficiencia %** | Ingresos Jot con estado ∉ (PRESERVICIO, DESISTE DEL SERVICIO) | Gestionables (FECHA CRM) |

> **"Efic. Pauta"** (`efectividad_activas_vs_pauta` = Activas ÷ Gest. amplio) fue **retirada**.
> Novonet la reemplazó por *Efect. vs Leads Tot.*; Velsa la arrastraba y por eso tenía una tarjeta de más. Ya se eliminó.

---

## 5. INDICADORES DE ACTIVACIÓN (Netlife)

Definición de gerencia, ajustada 2026-08-13.

| Indicador | Cálculo |
|---|---|
| **Activas Total** (`real_mes`) | `COUNT(*) WHERE FECHA ACTIVACIÓN ∈ rango AND estado = 'ACTIVO'` |
| **Activas Mes** (`activa_mes`) | Igual, **y además** FECHA JOT ∈ rango |
| **Activas Backlog** | `max(0, Activas Total − Activas Mes)` → activadas en el rango pero registradas en un mes anterior |

⚠️ **No sumar** Activas Mes + Backlog para obtener el total: `real_mes` **ya incluye** el backlog. Ese doble conteo fue un bug real del frontend.

| | |
|---|---|
| **Tasa Inst. %** | Activos (por FECHA JOT) ÷ Ingresos Tot. Jot × 100 |

---

## 6. INDICADORES DE CALIDAD

| Indicador | Cálculo |
|---|---|
| **Tarjeta %** | ventas con forma de pago tarjeta de crédito (FECHA JOT) ÷ Ingresos Tot. Jot × 100 |
| **3ra Edad %** | ventas con descuento tercera edad **y** estado ACTIVO (FECHA JOT) ÷ Activas Total × 100 |
| **Por Regularizar** | `COUNT(*) WHERE FECHA JOT ∈ rango AND estatus_regularizacion = 'POR REGULARIZAR'` |
| `regularizacion` (columna REGU. de la tabla) | Igual, pero **excluyendo** estado ∈ (FUERA DE COBERTURA, DESISTE DEL SERVICIO, RECHAZADO) |

> La tarjeta usa `por_regularizar`; la columna de la tabla usa `regularizacion`. Son dos números distintos a propósito.
> *(Corregido el 2026-08-17: Velsa usaba `regularizacion` en la tarjeta y por eso no coincidía con Novonet.)*

---

## 7. PLANES POR CATEGORÍA

Base de fecha: **FECHA JOT**. "Activos" añade `estado_venta = 'ACTIVO'`.

| Categoría | Columnas |
|---|---|
| HOGAR | `plan_casa` |
| PYMES | `plan_pyme` **o** `plan_pyme_corp` |
| ADULTO MAYOR | `plan_hogar_adulto_mayor` |

Un registro cuenta si la columna no es NULL ni cadena vacía.

*(Corregido el 2026-08-17: en Velsa el JOIN a Jotform usaba `id_negociacion_bitrix`, columna que está 100 % NULL — la llave real es `id_bitrix_ghl`. Resultado: todos los planes salían en 0.)*

---

## 8. FUENTES DE DATOS

| | Novonet | Velsa |
|---|---|---|
| Lado CRM | `vw_bitrix_novonet` ← `bitrix_webhook_leads` (webhook, tiempo real) | `vw_bitrix_velsa` ← `bitrix_webhook_leads` (`empresa = 'velsa'`) |
| Lado Jotform | `mestra_bitrix` (columnas `j_*`) | `vw_jotform_velsa_netlife_completo` |
| Unión | FULL OUTER JOIN en la vista | MV `mv_indicadores_velsa_completo` (FULL JOIN por `id_bitrix_ghl`) |

Los leads de **ambas** empresas viven en la misma tabla `bitrix_webhook_leads`, separados por la columna `empresa`. Jotform sí son dos fuentes distintas.

---

## 9. METAS

Las metas **no se calculan**, están configuradas:

- Novonet → `METAS_COMERCIALES` en `frontend/src/pages/Indicadores.jsx`
- Velsa → `METAS_COMERCIALES_VELSA` en `frontend/src/pages/IndicadoresVelsa.jsx`

`metaDinamica()` prorratea la meta mensual según los días del filtro:
```
meta_mostrada = floor( meta_mensual × días_del_filtro ÷ días_del_mes )
```

*(Pendiente: moverlas a base de datos + pantalla de carga, para no depender de un deploy cada vez que gerencia cambia una meta.)*

---

## 10. DIFERENCIAS QUE QUEDAN ENTRE NOVONET Y VELSA

| # | Diferencia | Estado |
|---|---|---|
| 1 | INNEGOCIABLE cuenta como gestionable en Novonet, no en Velsa | **Abierta — decisión de gerencia** |
| 2 | Novonet excluye el origen `REMARKETING` de leads/gestionables; Velsa no filtra orígenes | **Intencional** (pedido tuyo) |
| 3 | Denominador de descarte / efectividad_real usa ventana amplia ≠ gestionables en pantalla | **Abierta** — heredada de Novonet, replicada en Velsa para que cuadren |
| 4 | 51 % de los orígenes de Novonet no mapean a ningún canal → Monitoreo Redes los descarta | **Abierta — decisión de marketing** |

---

## 11. EFECTIVIDAD DIARIA (por agencia)

**Versión:** 2026-08-28 · Pestaña nueva al lado de CONSULTA, en Indicadores Novonet y Velsa.
**Código:** `backend/src/controllers/efectividadDiaria.controller.js` · `frontend/src/components/EfectividadDiaria.jsx`
**Verificación en pgAdmin:** `VERIFICAR_EFECTIVIDAD_DIARIA.sql`

Una tabla por **agencia de publicidad**, una columna por **día**, cuatro filas fijas.
Responde una sola pregunta: de lo que entró ese día por esa agencia, ¿cuánto se pudo gestionar y cuánto se convirtió en venta subida?

### 11.1 Base de fecha — una sola

Las cuatro filas usan **FECHA CRM (fecha de creación del lead)**, en hora Ecuador.
Una venta subida se atribuye al día en que **entró** el lead, no al día en que se cerró.
Es la única forma de leer una columna como un embudo cerrado (`gestionables ⊆ leads`, `ventas ⊆ gestionables`).

### 11.2 Las cuatro filas

| Fila | Cálculo | Meta |
|---|---|---|
| **TOTAL LEADS** | `COUNT(DISTINCT bitrix_id)` con etapa que suma a lead (§1.1) | — (es el 100 %) |
| **GESTIONABLE** | `COUNT(DISTINCT bitrix_id)` con etapa gestionable (§1.2) | **50 %** de los leads totales |
| **INGRESOS CRM** | `COUNT(DISTINCT bitrix_id)` con etapa `VENTA SUBIDA` | **30 %** de la *meta* de gestionables |
| **FALTANTE** | `max(0, meta_ingresos − ingresos_crm)` | 0 |

```
meta_gestionables = round(total_leads × 50 %)
meta_ingresos     = floor(meta_gestionables × 30 %)     ← floor, no round
faltante          = max(0, meta_ingresos − ingresos_crm)
```

⚠️ El 30 % se calcula sobre la **meta** de gestionables, no sobre los gestionables reales.
Es lo que hace cuadrar el ejemplo de gerencia: `55 × 0,30 = 16,5 → 16`, con 15 ventas el faltante es **1**.
Si se calculara sobre los gestionables reales (`50 × 0,30 = 15`) el faltante daría 0 y el indicador premiaría tener pocos gestionables.

### 11.3 Cómo se lee una celda

`50 (45%/50%)` → **valor (% real / % meta)**

- GESTIONABLE: el % real es sobre **TOTAL LEADS**.
- INGRESOS CRM y FALTANTE: el % real es sobre **GESTIONABLE**.

Cuadre de referencia entregado por gerencia:

| | Leads | Gestionable | Ingresos CRM | Faltante |
|---|---|---|---|---|
| 1/8 | 110 | 50 (45,5 %) | 15 (30 %) | **1** (2 %) |
| 2/8 | 100 | 50 (50 %) | 30 (60 %) | **0** ← cuadre perfecto |

### 11.4 Fuente de datos y agencia

| | Novonet | Velsa |
|---|---|---|
| Leads | `public.bitrix_webhook_leads` (`empresa='novonet'`) | ídem (`empresa='velsa'`) |
| Agencia | `novonet_lineas_canal` (origen → agencia) | `velsa_lineas_canal` |
| Origen sin asignar | `SIN AGENCIA ASIGNADA` | `VELSA` (todo origen nuevo cae acá) |
| Filtro de origen | excluye el literal `REMARKETING` (§2.1) | no filtra orígenes |

Se lee de `bitrix_webhook_leads` y **no** de `mestra_bitrix`: esa tabla quedó congelada a inicios de agosto y dejaría la pantalla ciega a los leads nuevos. Mismo criterio que ya usa Redes.

La agencia se administra desde el módulo **Redes → pestaña "Agencias"**. Un origen nuevo sin asignar aparece en el bucket por defecto hasta que alguien lo mapee — en Novonet eso significa que puede haber una fila "SIN AGENCIA ASIGNADA" con volumen real.

### 11.5 Endpoints

```
GET /api/indicadores/efectividad-diaria?fechaDesde&fechaHasta&agencia
GET /api/indicadores/efectividad-diaria/agencias
GET /api/indicadores-velsa/efectividad-diaria?fechaDesde&fechaHasta&agencia
GET /api/indicadores-velsa/efectividad-diaria/agencias
```

Solo lectura. No tocan ningún KPI ni tabla existente.
