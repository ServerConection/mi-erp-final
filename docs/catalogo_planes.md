# Módulo: Catálogo de Planes y Precios

Notas de referencia rápida para no tener que re-explorar el repo cada vez que
se toca este módulo.

## Ubicación de archivos

- Backend (ruta + parser + upload + tabla): `backend/src/routes/planes-catalogo.routes.js`
  - Se registra en `backend/src/app.js` (buscar `planes-catalogo` si hace falta
    confirmar el prefijo de la ruta, ej. `/api/planes-catalogo`).
- Frontend (pantalla "Catálogo de planes"): `frontend/src/pages/CatalogoPlanes.jsx`
- Tabla en Postgres: `public.catalogo_planes` (se crea sola vía `CREATE TABLE IF NOT EXISTS`
  al primer upload o al hacer `GET`).
- El módulo relacionado que **consume** este catálogo para armar el formulario
  de venta es `frontend/src/pages/NuevaVenta.jsx` (usa `GET /api/planes-catalogo`).

## Cómo funciona

1. Un asesor/admin sube el Excel mensual `PRECIOS <MES> MATERIAL ASESORES.xlsx`
   desde la pantalla de Catálogo de planes.
2. `POST /api/planes-catalogo/upload` (middleware `noAsesor`) lee el `.xlsx` en
   memoria con la librería `xlsx`, corre un parser por cada pestaña
   (HOME, TERCERA EDAD, GAMER, PRO, PYME), borra `catalogo_planes` completo y
   reinserta todo dentro de una transacción.
3. `GET /api/planes-catalogo` devuelve el catálogo vigente para el formulario
   de Nueva Venta.

## ⚠️ Punto frágil: el parser usa letras de columna fijas (A, B, C…)

Cada pestaña se lee con `XLSX.utils.sheet_to_json(ws, { header: 'A', range: N })`,
es decir, el código asume que cada dato SIEMPRE cae en la misma letra de columna
mes a mes. **Si Contabilidad/Comercial reordena, inserta o borra una columna en
el Excel, el parser se desalinea sin avisar** (llena el campo equivocado, o en
el peor caso intenta meter un valor con decimales en una columna `INT` de la
base — eso fue justo el bug del 2026-08-12, ver abajo).

Si vuelve a fallar la carga, **lo primero que hay que hacer es comparar los
headers reales del Excel contra las letras que usa cada `parseXxx()`** en
`planes-catalogo.routes.js`, no asumir que es otro tipo de problema.

### Estructura verificada del Excel "PRECIOS AGOSTO 2026" (referencia)

| Hoja | Fila headers | Fila datos desde | Columnas clave |
|---|---|---|---|
| HOME | 5 | 6 | A=plan, B=velocidad, C=equipo, D=adicionales, E=plan promoción, F=subtotal, **J**=%dsto TC, **K**=facturas TC, **O**=PVP promo TC, **Q**=%dsto CTA, **R**=facturas CTA, **V**=PVP promo CTA |
| TERCERA EDAD | 5 | 6 | A=plan, B=velocidad, C=equipo, D=adicionales, E=plan promoción, G=precio sin IVA |
| GAMER | 4 | 5 | A=plan, B=features, C=subtotal, D=IVA, E=total, F=equipo |
| PRO | 5 | 6 | B=plan, C=velocidad, D=incluidos, E=subtotal, G=total, H=wifi |
| PYME | 6 | 7 | A=plan, B=velocidad, C=incluidos (puede traer "X o Y"), D=subtotal, F=total, G=wifi |

## Historial de incidentes

### 2026-08-12 — Error al subir Excel de agosto: `invalid input syntax for type integer: "7.696499999999999"`

**Causa raíz:** en `parseHome()`, las columnas de promociones (TC y Cuenta)
estaban leídas con letras corridas respecto a los headers reales del Excel de
agosto (ej. `tc_facturas` leía la columna "Promocion Valor" — un monto con
decimales — en vez de la columna "Facturas promocion", que es un entero). Al
insertar ese decimal en la columna `tc_facturas INT` de Postgres, la base
rechazaba el insert y toda la carga fallaba (la transacción se revierte
completa, por eso ni siquiera las otras pestañas quedaban guardadas).

De paso se encontraron y corrigieron, en el mismo archivo:
- `equipo` y `plan_promocion` venían intercambiados en la hoja HOME.
- `parseTerceraEdad()` filtraba por la columna equivocada (`r.B` en vez de
  `r.A`), lo que hacía que **ninguna fila de esa hoja se importara** (0
  opciones, sin error visible).
- `parsePyme()` leía una columna de "alternativas" que ya no existe en el
  formato actual (todo quedó junto en una sola columna de "incluidos"), y
  tomaba el IVA como si fuera el subtotal.
- `parseTerceraEdad()` y `parsePyme()` arrancaban a leer una fila antes de lo
  debido y colaban la fila de encabezados como si fuera un plan más.

**Fix:** commit local ya aplicado en
`backend/src/routes/planes-catalogo.routes.js` (letras de columna corregidas
para las 5 hojas + rango de inicio de datos corregido en TERCERA EDAD y PYME).
Verificado corriendo los 5 parsers contra el Excel real de agosto: 47 opciones
generadas, 0 errores de tipo, sin filas de encabezado coladas.

**Pendiente para que el fix quede activo:** el archivo se corrigió en el
repo local (`C:\...\ERP\V1\backend\src\routes\planes-catalogo.routes.js`).
Falta: `git add` + `commit` + `push`, y volver a desplegar el backend en el
servidor donde corre (Render u otro) para que el endpoint tome el cambio —
mientras no se redeploye, el servidor sigue corriendo la versión con el bug.
