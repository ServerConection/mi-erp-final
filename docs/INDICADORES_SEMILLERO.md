# Indicadores Semillero

Ruta frontend: `/indicadores-semillero`. API autenticada: `/api/semillero/dashboard`.

Lee exclusivamente `bddgeneral.public.bitrix_webhook_leads`, con `LOWER(BTRIM(empresa)) = 'semillero'`. No utiliza la vista ni las tablas Jotform de VELSA. No requiere migraciones. Desplegar frontend y backend monolítico o CORE; el gateway ya dirige este prefijo a CORE.

Filtros: fechas desde/hasta, responsable, origen, etapa e ID/teléfono/responsable mediante búsqueda. Las cuentas ASESOR se limitan a su nombre autenticado. Página de 50 leads; el resumen, las gráficas y el desglose por origen cubren todo el resultado filtrado.

La fecha de creación se toma de `created_at` en horario America/Guayaquil, siguiendo la definición de los reportes de webhooks existentes. La carga histórica debe haber conservado en esa columna la fecha real de creación en Bitrix. Si el script guardó la fecha de importación, será necesario corregir el histórico antes de interpretar los indicadores.

Las etapas se resuelven desde `etapa_bitrix`, con fallback a `etapa`; los slugs se presentan con espacios y mayúsculas. Gestionables y Descarte usan las reglas compartidas de etapas del ERP. El total incluye todas las etapas. La tasa mostrada es Venta Subida / Gestionables. No se presentan activaciones ni ingresos Jotform, porque esta tabla no aporta esos datos.

## Uso del dashboard

Los accesos Hoy, Últimos 7 días y Este mes preparan el período; Aplicar filtros actualiza los resultados. Un aviso identifica los cambios pendientes. Los filtros activos se muestran como etiquetas que permiten quitarlos individualmente.

Las vistas Resumen e indicadores y Detalle de leads conservan los mismos filtros. Las tarjetas muestran cantidades y su porcentaje del total. Un denominador cero se presenta como «—». La gráfica diaria incluye los días sin leads.

Pulsar una etapa o un responsable aplica ese filtro. El KPI por responsable permite ordenar por leads, gestionables o ventas y exportar el resultado completo a CSV. En el detalle, Exportar esta página descarga únicamente los registros de la página actual. El diálogo de detalle presenta etiquetas legibles y permite cerrarse con Escape.
