# Revisión: módulo Indicadores — VELSA vs NOVONET

**Fecha:** 2026-08-15
**Criterio:** Novonet es la referencia. Velsa debe calcular lo mismo, solo cambiando las tablas de origen.
**Archivos:** `backend/src/controllers/indicadores.controller.js` (Novonet) vs `backend/src/controllers/indicadoresVelsaMaterialized.controller.js` (Velsa)

---

## 1. Las fuentes de datos — confirmado, y con una corrección a tu hipótesis

Tenías razón en el lado Jotform, pero **no** en el lado Bitrix.

| Lado | NOVONET | VELSA |
|---|---|---|
| **Bitrix / CRM** | `bitrix_webhook_leads` **WHERE empresa = 'novonet'** | `negociaciones_reporteria` ← **otra tabla** |
| **Jotform** | `mestra_bitrix` (columnas `j_*`) | `vw_jotform_velsa_netlife_completo` |
| **Objeto que consume el controlador** | vista `vw_bitrix_novonet` (FULL OUTER JOIN de los dos) | MV `mv_indicadores_velsa_completo` |

**Jotform sí son dos fuentes distintas** — correcto.

**Bitrix NO comparten tabla hoy.** Novonet migró al webhook (`bitrix_webhook_leads`, tiempo real) justamente porque el ETL viejo iba atrasado — el comentario en `indicadores.controller.js` dice *"el ETL de mestra_bitrix va atrasado (6 leads contra 279 del webhook para el mismo día)"*. **Velsa sigue leyendo `negociaciones_reporteria`, que es la fuente vieja.** Si `bitrix_webhook_leads` tiene filas con `empresa = 'velsa'`, Velsa está mostrando datos atrasados mientras Novonet muestra datos vivos.

> Además: `kpiComercial.controller.js` línea 254 ya apunta a una vista **`vw_bitrix_velsa`** que no existe en el repo. O ya la creaste en la BD, o ese endpoint está fallando en silencio para Velsa.

**Esto no lo pude decidir yo** — necesita una consulta a la BD. Está en `VERIFICAR_FUENTES_VELSA.sql`, paso 1.

---

## 2. Hallazgo más grave: Velsa contaba leads DOBLE

`mv_indicadores_velsa_completo` hace `FULL OUTER JOIN` contra `vw_jotform_velsa_netlife_completo` **sin deduplicar**. Esa vista tiene **varias filas por negociación** cuando el cliente contrató más de un servicio — el propio controlador lo documenta en `JOIN_JF_VELSA_MV`.

Resultado: un lead con 3 servicios generaba **3 filas** en la MV, y Velsa usaba `COUNT(*)` → ese lead contaba **3 veces** en leads totales, gestionables y ventas CRM.

Novonet nunca tuvo el problema porque usa `COUNT(DISTINCT b_id)`. **Corregido:** Velsa ahora usa `COUNT(DISTINCT mv.id_crm)` en todos los indicadores del lado CRM.

Este solo cambio ya hace que los números de Velsa **bajen** — igual que el fix de las etapas. Es corrección, no pérdida de datos.

---

## 3. Diferencias de fórmula encontradas (todas corregidas)

| Indicador | NOVONET (correcto) | VELSA (antes) | Estado |
|---|---|---|---|
| **Leads totales** | `COUNT(DISTINCT b_id)`, excluye etapas + excluye origen REMARKETING | `COUNT(*)`, sin excluir origen | ✅ alineado |
| **Gestionables** | `COUNT(DISTINCT b_id)` + excluye origen | `COUNT(*)`, sin excluir origen | ✅ alineado |
| **Ventas del día** | VENTA SUBIDA + fecha creación CRM = fecha registro Jotform | VENTA SUBIDA + fecha creación = **fecha modificación CRM** | ✅ alineado — medía otra cosa |
| **Tasa de instalación** | activas (por fecha registro Jotform) / ingresos Jotform | real_mes (por **fecha de activación**) / ingresos | ✅ alineado |
| **Eficiencia** | ingresos Jot sin PRESERVICIO/DESISTE ÷ gestionables | activas ÷ **leads totales** | ✅ alineado — era otra métrica |
| **Efectividad activas vs pauta** | activas ÷ gestionables (ventana amplia) | real_mes ÷ gestionables | ✅ alineado |
| **Descarte %** | descarte ÷ gestionables (ventana amplia) | descarte ÷ gestionables (ventana corta) | ✅ alineado |
| **Total activas calculada** | activas por fecha de registro Jotform | = real_mes (fecha de activación) | ✅ alineado |
| **Regularización** | excluye FUERA DE COBERTURA / DESISTE / RECHAZADO | contaba cualquier `%REGULARIZAR%` | ✅ alineado |
| **Por regularizar** | existe | **no existía** | ✅ agregado |
| **Efectividad realz** | existe | **no existía** | ✅ agregado |
| **Orden de la tabla** | por gestionables DESC | por ingresos DESC | ✅ alineado |

Además: los porcentajes de Velsa se calculaban **en JavaScript** (`mergeBacklog`) con denominadores propios, mientras Novonet los calcula en SQL. Ahora Velsa los calcula en SQL con las fórmulas idénticas y JS solo los pasa.

---

## 4. Mi feedback, sin filtro

**a) Novonet tiene una inconsistencia interna que ahora copié a Velsa.**
El KPI **"gestionables" que se muestra en pantalla** usa solo fecha de creación CRM. Pero los **denominadores** de descarte %, efectividad real y efectividad activas vs pauta usan una ventana **más amplia** (creación CRM **O** registro Jotform). Son dos números distintos con el mismo nombre.

Consecuencia práctica: si gerencia toma "gestionables" de la tabla y divide a mano, **no le va a dar el % que muestra el sistema**. Lo repliqué en Velsa porque me pediste "conforme a Novonet", pero **esto hay que unificarlo** — y es decisión de gerencia cuál de los dos criterios es el bueno. Yo recomiendo el corto (solo fecha de creación CRM), que es el que ya usa `leads_totales`.

**b) La MV de Velsa se refresca cada 15 minutos.**
Novonet lee la vista en vivo. Aunque las fórmulas ahora sean idénticas, **Velsa siempre irá hasta 15 min atrás**. Para el D-1 no importa; para "hoy en curso" sí, y explica descuadres que no son bugs.

**c) Zona horaria: se manejan distinto.**
Velsa resta `INTERVAL '5 hours'` a la fecha de Jotform (la MV guarda UTC). Novonet usa `parse_fecha_flex` sobre texto, sin ajuste. Si la fuente Novonet guardara UTC también, Novonet estaría corriendo el corte del día 5 horas. Vale la pena verificarlo con un lead conocido de las 20:00–23:59.

**d) `tarjeta_credito` compara distinto.**
Novonet: `= 'TARJETA DE CREDITO.'` (exacto, **con punto final**). Velsa: `ILIKE '%TARJETA DE CREDITO%'`. Dejé el de Velsa porque el catálogo puede diferir, pero **el de Novonet es frágil**: si un registro viene sin el punto, no cuenta. Sugiero pasar Novonet a `ILIKE`.

**e) `indicadoresNuevoController.js` sigue existiendo y apunta a la misma MV de Velsa**, con fórmulas viejas (gestionables con ventana amplia, sin varios de los fixes). Si está ruteado, es una tercera versión de la verdad. Recomiendo borrarlo o marcarlo como muerto.

---

## 5. Lo que falta y no puedo hacer sin la BD

1. **Decidir la fuente Bitrix de Velsa** (`negociaciones_reporteria` vs `bitrix_webhook_leads WHERE empresa='velsa'`) → `VERIFICAR_FUENTES_VELSA.sql`, pasos 1 y 2.
2. **Deduplicar la MV** en origen (mejor que parchear cada `COUNT`) → paso 3 del mismo SQL.
3. **Confirmar que existe `vw_bitrix_velsa`** que espera `kpiComercial.controller.js` → paso 4.
4. Las vistas `mv_monitoreo_*` del fix anterior (`FIX_ETAPAS_MV_MONITOREO.sql`) siguen pendientes.

---

## 6. Qué esperar al desplegar

Los números de **Velsa van a bajar** en leads totales, gestionables y ventas CRM (fin del doble conteo + exclusión de etapas y origen), y **los porcentajes van a cambiar** en descarte, eficiencia, tasa de instalación y efectividad. Es la corrección, no una regresión. Corré el paso 5 del SQL de verificación **antes** de desplegar para tener el antes/después que te van a pedir las gerencias.
