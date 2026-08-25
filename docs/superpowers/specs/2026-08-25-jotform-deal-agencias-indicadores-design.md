# Enlace canónico Jotform–Bitrix para Redes e Indicadores

Fecha: 2026-08-25

## Objetivo

Unificar la atribución de ventas Jotform de Novonet y Velsa mediante el ID de negociación Bitrix. Redes e Indicadores utilizarán la misma definición de ingreso Jotform, asesor, supervisor, origen y agencia, sin perder el histórico existente y permitiendo retirar `mestra_bitrix` posteriormente.

## Evidencia actual

- Novonet: `mestra_bitrix.j_id_bitrix` coincide con `bitrix_webhook_leads.bitrix_id` en 3.078 de 3.123 deals distintos; 45 quedan sin vínculo y 94 deals tienen más de un registro Jotform.
- Velsa: el campo válido es `vw_jotform_velsa_netlife_completo.id_bitrix_ghl`; sus 1.289 IDs distintos coinciden con Bitrix. `id_negociacion_bitrix` no contiene IDs utilizables.
- Las tablas webhook nuevas `jotform_submissions` y `jotform_submissions_velsa` no existen aún en producción. No pueden ser la fuente inicial ni conservar por sí solas el histórico.
- Los controladores actuales mezclan `mestra_bitrix`, vistas Jotform y vistas materializadas, permitiendo diferencias entre pantallas.

## Decisión arquitectónica

Se creará `public.jotform_deals_canonico`, una tabla operacional independiente de las fuentes antiguas. Se poblará inicialmente mediante backfill y después recibirá UPSERT desde la sincronización/webhook Jotform.

La tabla no reemplaza inmediatamente las fuentes actuales: primero funcionará en paralelo, se compararán totales y solo entonces Redes e Indicadores migrarán sus lecturas.

## Esquema canónico

Columnas mínimas:

- `id` bigint identity, clave primaria.
- `empresa` text, restringida a `novonet` o `velsa`.
- `canonical_key` text: `DEAL:<deal_id>` si existe ID y `SUBMISSION:<submission_id>` si no existe.
- `deal_id` y `submission_id` text nullable.
- `submitted_at` timestamptz y `submitted_at_ecuador` timestamp.
- `codigo_asesor_jotform`, `origen_venta_jotform` y `estado_jotform` text nullable.
- `fecha_activacion` timestamp nullable.
- `payload_jotform` jsonb para campos operativos no normalizados.
- `fuente` text (`backfill_mestra`, `backfill_velsa`, `webhook`, `sync`).
- `created_at` y `updated_at` timestamptz.

Restricciones e índices:

- único por `(empresa, canonical_key)`;
- índice parcial por `(empresa, deal_id)` donde `deal_id IS NOT NULL`;
- índices por `(empresa, submitted_at)` y `submission_id`.

Los datos Bitrix y la agencia no se copiarán permanentemente. Una vista enriquecida los resolverá en lectura para reflejar cambios de asesor, origen o agencia sin reescribir Jotform.

## Backfill inicial

### Novonet

- Fuente: campos `j_*` de `public.mestra_bitrix`.
- ID: `j_id_bitrix` normalizado como texto.
- Fecha: `j_fecha_registro_sistema` usando `parse_fecha_flex` cuando sea necesario.
- Ante varios registros del mismo deal prevalece el más reciente por fecha Jotform y luego por identificador estable.
- Registros sin ID usan una clave de submission confiable. Si no existe, se reportan como excepción; nunca se inventa una unión.

### Velsa

- Fuente: `public.vw_jotform_velsa_netlife_completo`.
- ID: `id_bitrix_ghl` normalizado como texto.
- Fecha y campos operativos: columnas actuales de la vista.
- Ante duplicados prevalece el registro más reciente con la misma regla.

El backfill será idempotente mediante `INSERT ... ON CONFLICT (empresa, canonical_key) DO UPDATE`. Antes y después emitirá conteos de filas fuente, deals distintos, duplicados descartados, vinculados y sin vínculo.

## Ingesta futura y transición

1. Crear la tabla canónica y ejecutar el backfill completo.
2. Adaptar `jotformSync.service` y/o los webhooks para hacer UPSERT canónico además de su escritura actual.
3. Mantener temporalmente ambas escrituras y comparar conteos diarios.
4. Migrar Redes e Indicadores cuando la cobertura sea equivalente.
5. Retirar la escritura antigua solo en una entrega posterior con validación específica.

La extracción futura usará `q179_idDe` en Novonet y `q228_idDe228` en Velsa.

## Vista enriquecida

Se creará `public.vw_jotform_deals_enriquecido` sobre la tabla canónica:

- unión Bitrix por `empresa` y `deal_id = bitrix_webhook_leads.bitrix_id`;
- una sola fila Bitrix por empresa/deal;
- asesor, supervisor, etapa y origen actuales desde Bitrix;
- agencia actual por origen normalizado desde `novonet_lineas_canal` o `velsa_lineas_canal`;
- Velsa usa `VELSA` como agencia predeterminada conforme a la regla existente;
- `estado_vinculo` será `VINCULADO` o `SIN VINCULO BITRIX`.

La normalización recorta extremos, colapsa espacios y compara sin distinguir mayúsculas. Una selección lateral por coincidencia exacta y actualización más reciente evita multiplicar filas ante variantes del mismo origen.

## Reglas de negocio

- Un `deal_id` cuenta una sola vez por empresa y conserva el Jotform más reciente.
- Dos ventas del mismo cliente con `deal_id` distintos cuentan por separado.
- Un mismo ID en Novonet y Velsa representa registros distintos.
- Los registros sin vínculo se incluyen en el total general Jotform.
- Sin vínculo no se atribuye agencia, asesor ni supervisor y aparece como `SIN VINCULO BITRIX`.
- La agencia es dinámica: reasignar un origen reclasifica consultas históricas.
- Ingreso Jotform se fecha por `submitted_at` en horario de Ecuador.
- Leads y etapas CRM conservan sus fuentes y fechas actuales.
- Activaciones, regularización y backlog conservan su semántica vigente; la tabla canónica almacena campos necesarios, pero no redefine esas reglas.

## Integración en Redes

Redes Novonet y Velsa obtendrán `ingreso_jot` desde `vw_jotform_deals_enriquecido`, agrupado por empresa, fecha y agencia/origen. No volverán a unir Jotform independientemente ni contarán una negociación más de una vez.

La inversión permanece en sus tablas actuales y los leads CRM en `bitrix_webhook_leads`. Los tres conjuntos comparten la agencia resuelta por el mismo catálogo normalizado.

## Integración en Indicadores

Indicadores Novonet y Velsa usarán la vista enriquecida para:

- total de ingresos Jotform;
- ingresos por asesor y supervisor;
- efectividades cuyo numerador sea ingreso Jotform;
- detalle auditable con deal, submission, vínculo, origen y agencia.

Los denominadores CRM mantienen la fuente oficial y las reglas compartidas de etapas. Estados de venta, activaciones, regularización y pagos continuarán leyendo los campos operativos canónicos backfilleados; durante la transición se compararán contra las vistas actuales antes de sustituirlas.

## Compatibilidad, errores y rollback

- Las respuestas públicas conservarán sus nombres actuales.
- Se añadirá metadata no disruptiva: fuente, vinculados, sin vínculo y duplicados descartados.
- Una migración faltante generará un error identificable; no se devolverán ceros silenciosos.
- La migración será idempotente y no eliminará tablas, vistas ni datos existentes.
- Rollback: los controladores pueden volver a la fuente anterior; detener la doble escritura no destruye la tabla canónica.

## Pruebas y aceptación

Pruebas automatizadas:

- extracción del ID correcto por empresa;
- deduplicación por empresa/deal usando el envío más reciente;
- deals distintos del mismo cliente e IDs iguales entre empresas;
- IDs vacíos y sin coincidencia;
- idempotencia del backfill y UPSERT;
- normalización de origen y resolución única de agencia;
- igualdad del total Jotform entre Redes e Indicadores para empresa/período equivalentes;
- conservación de denominadores CRM y reglas de etapas.

Criterios iniciales, sujetos a nuevos registros posteriores a la medición:

- Novonet: 3.123 deals distintos con ID; 3.078 vinculados y 45 sin vínculo; los 94 deals con duplicados cuentan una vez.
- Velsa: 1.289 IDs enlazados mediante `id_bitrix_ghl`.
- Ningún registro sin vínculo se atribuye a agencia o asesor.
- Toda diferencia debe explicarse en la comparación paralela antes de migrar un endpoint.