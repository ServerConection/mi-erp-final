# Webhook "Gestionables Permitidos" — Bitrix24 NOVONET

Escribe automáticamente en cada negociación (deal) el cupo diario de
"gestionables permitidos" del asesor asignado, apenas la negociación entra a
la etapa **CONTACTO NUEVO** del pipeline **NETLIFE NUEVO**.

Flujo: Bitrix → `POST /bitrix_webhook_gestionables.php` (con `{{ID}}` y
`{{Nombre Asesor}}`) → el backend busca en `erp_database.gestionables_asesores`
el cupo cargado más reciente (≤ hoy) para ese nombre → llama `crm.deal.update`
para escribirlo en el campo personalizado del deal.

## 0. Requisito: nombre del asesor debe coincidir EXACTO

`nombre_bitrix_asesor` en la tabla se compara tal cual contra el valor que
Bitrix manda en `{{Nombre Asesor}}` (sin recortar espacios raros, mayúsculas
sí importan — la comparación en el código es exacta). Carga la tabla con el
mismo texto que aparece en el campo "Nombre Asesor" del deal.

## 1. Crear la tabla en Postgres (erp_database)

Ya está creado el archivo `backend/src/db/migrations/gestionables_asesores.sql`.
Aplícalo con:

```bash
cd backend
node scripts/migrar_gestionables.js
```

(Es seguro correrlo varias veces — no duplica filas ni rompe si ya existe.)
Al final imprime las filas cargadas para que confirmes.

Para cargar más asesores por tu propio script, usa upsert por si vuelves a
cargar el mismo día:

```sql
INSERT INTO gestionables_asesores (nombre_bitrix_asesor, gestionables_permitidos, fecha_carga)
VALUES ('NOMBRE ASESOR', 5, CURRENT_DATE)
ON CONFLICT (nombre_bitrix_asesor, fecha_carga)
DO UPDATE SET gestionables_permitidos = EXCLUDED.gestionables_permitidos;
```

## 2. Descubrir IDs de Bitrix y crear el campo personalizado

Este paso necesita red hacia `novonet.bitrix24.es`, así que **córrelo tú**
(tu máquina o la consola de Render), no se puede ejecutar desde acá:

```bash
cd backend
node scripts/setup_gestionables_bitrix.js
```

Busca el pipeline `NETLIFE NUEVO` y la etapa `CONTACTO NUEVO`, y crea (si no
existe) el campo del deal `UF_CRM_GESTIONABLES` — tipo número entero, label
"Gestionables Permitidos". Al final imprime 3 líneas:

```
GESTIONABLES_FIELD_NAME=UF_CRM_GESTIONABLES
GESTIONABLES_CATEGORY_ID=<id real>
GESTIONABLES_STAGE_ID=<id real, ej. C12:NEW>
```

Cópialas en `backend/.env` (ya dejé el bloque comentado esperándolas, al
final del archivo) **y** en Render → tu servicio backend → Environment.
`GESTIONABLES_STAGE_ID` es opcional pero recomendado: si está definida, el
backend confirma que el deal sigue en esa etapa antes de escribir el campo
(evita pisar el dato si el lead ya avanzó de etapa antes de que el webhook
terminara de procesarse).

Si el script no encuentra el pipeline o la etapa por nombre exacto, imprime
la lista real disponible — usa esos nombres tal cual aparecen ahí.

## 3. Deploy

Commit + push de `backend/` para que Render redeploye con el nuevo endpoint
y las variables de entorno nuevas ya cargadas ahí.

## 4. Configurar la automatización en Bitrix24

En el Kanban de Negociaciones → pipeline **NETLIFE NUEVO** → columna
**CONTACTO NUEVO** → ⚙️ (Automatización de esta etapa) → **Agregar acción**
→ **Webhook saliente** (o "Solicitud REST", el nombre varía según versión).

URL (reemplaza el dominio si tu backend en Render tiene otro nombre):

```
https://erp-backend-v1-qhk2.onrender.com/bitrix_webhook_gestionables.php?id={{ID}}&nombre_asesor={{Nombre Asesor}}&token=bx-8fK2mQzR7pW4nL9x
```

- `{{ID}}` y `{{Nombre Asesor}}` son placeholders reales de Bitrix (el
  segundo aparece en el selector de placeholders porque así se llama tu
  campo personalizado — no hace falta el código `UF_CRM_...` para leerlo,
  solo para escribirlo, y de eso ya se encarga el backend).
- El `token` es el mismo que ya usas en las otras automatizaciones
  (`BITRIX_WEBHOOK_TOKEN` en `.env`), no hace falta uno nuevo.
- Este endpoint es independiente del que ya usas para las 53 etapas
  (`/bitrix_webhook.php`) — puedes tener ambas automatizaciones activas a la
  vez en la misma etapa sin que se pisen.

Guarda la automatización. Prueba moviendo (o creando) una negociación de
prueba en esa etapa con un asesor que ya tenga cupo cargado, y revisa el
campo "Gestionables Permitidos" en el deal.

## 5. Verificar / debuggear

Consulta el log de cada intento directamente en Postgres:

```sql
SELECT * FROM gestionables_webhook_log ORDER BY creado_en DESC LIMIT 20;
```

Columnas clave: `encontrado` (si había cupo cargado para ese asesor),
`actualizado_en_bitrix` (si se logró escribir en el deal), `error` (motivo
si algo falló — asesor sin cupo cargado, token inválido, etapa ya cambiada,
etc.).
