# Carga de Metas Comerciales (Excel mensual de gerencia)

Menú: **Administración → Carga de Metas** (`/carga-metas`). Solo ADMINISTRADOR y GERENCIA.

## Instalación (una sola vez)
1. pgAdmin → ejecutar `backend/src/migrations/20261005_carga_metas_comerciales.sql` (solo agrega tablas/columnas).
2. Deploy manual de `erp-backend-v1` (monolito: la ruta está en `app.js`) y del frontend.

## Uso mensual
1. Elegir empresa, mes, año y subir el Excel → **Analizar** (no guarda nada).
2. Revisar avisos (periodo del Excel, subtotales que no cuadran, metas en 0).
3. Resolver los asesores en amarillo/rojo: buscar su nombre en Bitrix, "usar nombre del Excel" (asesor nuevo) u "Omitir".
4. **Aplicar metas** → una sola transacción.

## Cómo cruza los nombres (Bitrix no tiene código de vendedor)
Orden: alias confirmado antes → código (Velsa, vía Jotform) → exacto (sin mayúsculas/tildes/espacios)
→ "contiene" (todas las palabras, como ILIKE por partes, tolera 1 letra: CRISTINA/CRISTIANA) → sugerencia manual.
Lo confirmado se guarda en `asesor_alias_bitrix` (nombre Excel ↔ nombre Bitrix ↔ código), así el mes siguiente sale solo.

## Qué escribe
| Tabla | Para qué | Quién la lee |
|---|---|---|
| `metas_asesor` | Pto por asesor (una fila por cada escritura del nombre en Bitrix) | KPI Comercial / Reporte D-1 |
| `empleados` (NOVONET, codigo = mes) | supervisor por nombre exacto | Reporte D-1, KPI, alertas, forecast, comparativa |
| `catalogo_asesores_velsa` (VELSA) | supervisor por código y periodo | Indicadores Velsa |
| `metas_supervisor`, `metas_empresa` | metas de equipo y empresa | (fase 2: cabecera del D-1) |

## Sin pérdida de información
- Nunca borra. Lo que sobra del mismo mes en `metas_asesor` queda `activo = false`.
- Cada carga guarda en `metas_cargas.snapshot_previo` cómo estaban las tablas antes (para revertir).
