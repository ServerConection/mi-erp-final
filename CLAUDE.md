# ERP V1 — Contexto del proyecto

> Este archivo se carga automáticamente al inicio de cada sesión.
> **Antes de tocar algo relacionado con datos, ingesta o dashboards, lee
> `ORQUESTADOR_IMPACTO_V1.md`** — ahí está el mapa completo de qué depende de qué.

---

## Qué es esto

ERP interno de **Novonet** y **Velsa** (dos empresas en el mismo sistema).

- **Backend:** Node/Express, `backend/` — Postgres en Render
- **Frontend:** React + Vite + Tailwind, `frontend/`
- **Despliegue:** Render, definido en `render.yaml`

## Arquitectura: 7 procesos, un solo repo

`backend/src/entries/` define los entrypoints. Todos corren el mismo código,
cambia el `startCommand` (patrón *Strangler Fig*):

| Proceso | `npm run` | Qué hace |
|---|---|---|
| `gateway.js` | `start:gateway` | Proxy único para el frontend. Enruta por prefijo de path |
| `core.js` | `start:core` | Auth, usuarios, ventas, tareas, hojas, TTHH + **APIs externas** |
| `analitica-novo.js` | `start:analitica-novo` | Indicadores/Redes/Forecast Novonet |
| `analitica-velsa.js` | `start:analitica-velsa` | Indicadores/Redes Velsa |
| `ingesta.js` | `start:ingesta` | Webhooks Bitrix / JotForm / Gestionables |
| `wabot.js` | `start:wabot` | WhatsApp (Baileys) + Socket.io + alertas |
| `workers.js` | `start:workers` | Crons: refresco de vistas materializadas, sync JotForm |

**Al agregar una ruta nueva:** móntala en el `entries/*.js` correcto **y**
añade su prefijo al `pathFilter` de `gateway.js`. Si solo haces lo primero,
el frontend recibe "Endpoint no encontrado".

### ⚠️ Lo que hay REALMENTE desplegado en Render (verificado 2026-08-06)

El `render.yaml` describe 7 servicios, pero **solo 3 de los nuevos existen**.
La migración Strangler Fig está a medias:

| Servicio en Render | Qué corre | Estado |
|---|---|---|
| `erp-gateway` | `start:gateway` | ✅ separado |
| `erp-analitica-novo` | `start:analitica-novo` | ✅ separado |
| `erp-analitica-velsa` | `start:analitica-velsa` | ✅ separado |
| **`erp-backend-v1`** | **el monolito (`app.js`)** | ⚠️ **sigue haciendo core + ingesta + workers + wabot** |
| `bot-whatsapp` | WhatsApp | servicio aparte |
| `velsa-backend`, `botnuevo` | legacy | 4mo / 1mo sin tocar |

**No existen** `erp-core`, `erp-ingesta` ni `erp-workers`. Sus responsabilidades
viven dentro de `erp-backend-v1`, que es a donde apunta `CORE_URL` del gateway.

**Consecuencias prácticas:**

- Una ruta montada solo en `entries/core.js` **no llega a producción**. Para el
  monolito hay que montarla también en `app.js`.
- Los crons corren dentro del monolito (se ve `[REFRESH-MV-CONSULTOR-VELSA]`
  en sus logs), no en un worker aparte.
- `app.js` y `entries/core.js` tienen en el working tree un
  `require('./routes/hojas.routes')` **cuyo archivo no está en git**. Commitear
  cualquiera de los dos sin subir el módulo Hojas completo tumba el arranque
  con `MODULE_NOT_FOUND`. Ojo con esto.
- `autoDeploy: false`: cada servicio se despliega a mano desde el dashboard.

## Reglas que no se rompen

1. **`/api/consultor` y `/api/consultor-velsa` son APIs EXTERNAS** con URL pública
   fija, consumidas por clientes fuera del ERP. Viven en `core.js`. **No mover, no
   renombrar, no proxear.**
2. **`wabot` no escala.** `numInstances: 1` en `render.yaml`. Las sesiones de Baileys
   son estado local en disco (`/var/data`). Escalarlo rompe WhatsApp.
3. **Secretos fuera del repo.** `backend/.env` y `frontend/.env` no deben commitearse.
   En Render van en el Environment Group `erp-shared`.
4. **Los pools secundarios nunca tumban el proceso.** `dbErp.js` y `dbLocal.js` fallan
   de forma controlada (`pool.on('error')`). Mantener ese patrón.

## Base de datos

| Pool | Archivo | Base | Uso |
|---|---|---|---|
| Principal | `config/db.js` | `bddgeneral` @ Render | Todo el ERP |
| Secundario | `config/dbErp.js` | `erp_database` @ Render (mismo host) | Réplica del webhook Bitrix |
| Local | `config/dbLocal.js` | `localhost` ⚠️ | `bitrix_contacts`, `velsa_inversion_diaria` — **roto en Render** |

**Tabla más crítica: `mestra_bitrix`** (78 referencias). La alimenta un servicio
externo, no V1. Si se congela, se congelan casi todos los dashboards **sin dar error**.

## Dependencia externa: el orquestador

Hay **12 procesos Node fuera de este repo** (en `...\DesarrolloBaseDatos\`) que
alimentan las tablas que V1 lee. No hay llamadas de código entre ellos y V1: se
acoplan solo por Postgres.

**Consecuencia:** un fallo de ingesta no produce ningún error en V1. Los dashboards
simplemente muestran datos viejos. Ver `ORQUESTADOR_IMPACTO_V1.md` §4 y §5.

## Deuda técnica conocida (no la repliques)

- **3 copias del CRUD de usuarios:** solo `routes/usuarios.routes.js` está montado.
  `routes/users.routes.js` y `routes/usuarios.js` son huérfanos con código distinto.
- `controllers/usuarios.controller.js` está **vacío** — la lógica vive en el archivo de rutas.
- `controllers/indicadoresVelsa.controller.ACTUALIZADO.js` — versión paralela sin consolidar.
- Los permisos están **hardcodeados** en `config/permisos.config.js`, no en la BD.
  Cambiar permisos = deploy.
- `frontend/vite.config.js.timestamp-*` — archivos basura, se pueden borrar.

## Puntos de configuración que suelen estar mal

- **`VELSA_MV_AUTOREFRESH`** debe valer `on` en Render. Por defecto el refresco de
  `mv_indicadores_velsa_completo` está **apagado** (ver `entries/workers.js`).
- `DB_POOL_MAX` se dimensiona por proceso. El total de todos los servicios no debe
  superar el límite de conexiones del plan de Postgres.

## Convenciones

- Respuestas de API: `{ success: true, data }` / `{ success: false, error }`
- Auth: JWT (`middleware/auth.js`) + OTP por correo. Perfiles en `permisos.config.js`
- Middlewares de acceso: `verificarToken`, `isAdmin`, `noAsesor`, `requierePermiso`
- Migraciones SQL sueltas en `backend/src/migrations/` — se corren a mano en pgAdmin,
  no hay runner automático
- Comentarios y nombres en español. Mantener el estilo

## Documentos de referencia

| Archivo | Para qué |
|---|---|
| `ORQUESTADOR_IMPACTO_V1.md` | **Mapa de impacto**: qué tabla alimenta qué pantalla, matriz de fallos, metas, usuarios |
| `GUIA_DESPLIEGUE_MICROSERVICIOS_RENDER.md` | Despliegue en Render |
| `DOCUMENTACION_PROYECTO.md` | Documentación general |
| `PLAN_MODULO_TAREAS.md` | Módulo de Tareas |
| `render.yaml` | Definición de los 7 servicios |
