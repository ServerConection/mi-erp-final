# Orquestador ↔ ERP V1 — Mapa de Impacto y Análisis

> **Documento generado:** 2026-08-05
> **Fuente A:** `Orquestador.txt` (runbook de 12 microservicios de ingesta)
> **Fuente B:** código de `ERP\V1` (backend Node/Express + frontend React/Vite)
> **Estado del esquema de BD:** ⚠️ NO verificado contra Postgres real (ver §9). Todo lo
> referente a tablas se dedujo leyendo el código y las migraciones del repo.

---

## 1. Resumen ejecutivo

El archivo **Orquestador.txt no contiene código**: es un *runbook* — una lista de 12
procesos Node que se arrancan a mano, cada uno desde una carpeta distinta bajo
`...\DesarrolloBaseDatos\`. **Ninguno de esos procesos vive dentro de `ERP\V1`.**

La relación entre ambos mundos es **indirecta pero total**, y ocurre en un solo punto:

```
         ORQUESTADOR                    POSTGRES (Render)                V1
    12 procesos de ingesta   ──ESCRIBEN──▶  bddgeneral      ◀──LEEN──   backend ERP
    (Bitrix, GHL, JotForm)                  erp_database                 (dashboards)
```

**Consecuencia central:** V1 **no llama** a ningún servicio del orquestador, y el
orquestador **no llama** a V1. Se comunican exclusivamente a través de tablas
compartidas en la misma instancia Postgres de Render (`dpg-d5l6jvh4tr6s738gfr60-a`,
bases `bddgeneral` y `erp_database`).

**Por eso el impacto es silencioso y peligroso:** si un proceso del orquestador se
detiene, V1 **no da error**. Sigue respondiendo 200 OK, pero con datos congelados.
Un dashboard con datos de hace 3 días se ve exactamente igual que uno al día.

---

## 2. Inventario del orquestador

| # | Servicio | Ruta | Arranque | Origen | Destino probable (BD) |
|---|----------|------|----------|--------|----------------------|
| 1 | Bitrix24 Novonet | `Bitrix24\bitrix_backend` | `node index.js` | Bitrix24 CRM | `bitrix_deals`, `bitrix_usuarios_novonet` |
| 2 | GoHighLevel Velsa | `HoGiLevel\ghl-sync-backend` | `node server.js` | GHL API | `negociaciones_reporteria` |
| 3 | GHL Netlife Velsa | `HoGiLevel\ghl-sync-NetLife` | `npm start` | GHL API (Netlife) | tablas Netlife/Velsa |
| 4 | JotForm GHL Velsa Netlife | `JotForm\HGL\jotform-sync-netlife` | `npm start` | JotForm | base de `vw_jotform_velsa_netlife_completo` |
| 5 | JotForm GHL Velsa Netlife **Maestra** | `JotForm\HGL\sync-maestras-netlife` | `npm start` | JotForm | tablas maestras Netlife |
| 6 | JotForm→Bitrix24 Novonet | `JotForm\JotForm\Base` | `node sync_jotform.js` | JotForm | `jotform_submissions` |
| 7 | JotForm→Bitrix24 **analista** | `JotForm\JotForm\jotform-analista-sync` | `node sync.js` | JotForm | insumo de `vista_analisis_novonet` |
| 8 | JotForm→Bitrix24 sincronización | `JotForm\jotform-sync` | `node index.js` | JotForm | `jotform_submissions*` |
| 11 | Proyecto Consulta (Telecom) | `PROYECTO_TELECOM\backend` + `frontend` | `node server.js` / `npm start` | — | proyecto independiente |
| A | Maestra Bitrix ETL | `apache_superset\mestra-bitrix-etl` | `npm start` | Bitrix24 | **`mestra_bitrix`** ⭐ |
| B | Maestra Velsa Netlife Sync | `apache_superset\maestra-velsa-netlife-sync` | `node app.js` | GHL/JotForm | maestras Velsa |
| C | Reporte automatizado | `apache_superset\reporte-automatizado` | `node index.js` | Postgres local | `velsa_inversion_diaria` |

> **Nota:** faltan los números 9 y 10 en el runbook original. Puede ser un salto de
> numeración o servicios eliminados — **conviene confirmarlo**, porque si existen y
> nadie los arranca, hay datos que nunca se actualizan.

> **Nota 2:** las rutas apuntan a `C:\Users\Admin\...` pero el equipo actual es
> `C:\Users\Usuario-PC\...`. El runbook está desactualizado o se escribió en otra máquina.

---

## 3. El punto de acoplamiento: configuración de BD en V1

V1 abre **tres** pools de Postgres distintos:

| Pool | Archivo | Base | Uso |
|------|---------|------|-----|
| Principal | `backend/src/config/db.js` | `bddgeneral` @ Render | Todo el ERP. Pool de 20 conex. (configurable con `DB_POOL_MAX`) |
| Secundario | `backend/src/config/dbErp.js` | `erp_database` @ Render (mismo host) | Réplica de escrituras del webhook Bitrix |
| Local | `backend/src/config/dbLocal.js` | `localhost` | Solo `bitrix_contacts` y `velsa_inversion_diaria` |

⚠️ **`dbLocal.js` es un punto de quiebre conocido.** Apunta a `localhost`. Si V1 corre
en Render (no en la PC), esas consultas fallan siempre. El código lo maneja con error
controlado (no tumba el ERP), pero los endpoints de `datosAdicionales.controller.js`
devuelven 500 de forma permanente en producción. **El servicio C del orquestador
(`reporte-automatizado`) escribe justamente ahí** → ese dato nunca llega a la nube.

---

## 4. Mapa de impacto: tabla → consumidores en V1

Ordenado por criticidad (nº de referencias en el código de V1).

### 4.1 ⭐ `mestra_bitrix` — 78 referencias. **La tabla más crítica del ERP.**

Alimentada por: **servicio A — `mestra-bitrix-etl`** (y el webhook de Bitrix de V1).

Si esta tabla se queda sin actualizar, se congela:

| Archivo V1 | Qué se rompe para el usuario |
|---|---|
| `controllers/indicadores.controller.js` | Dashboard Indicadores Novonet |
| `controllers/redes.controller.js` | Reporte de Redes |
| `controllers/cumplimientoLeads.controller.js` | Cumplimiento de Leads + **metas** |
| `controllers/forecast.controller.js` | Forecast |
| `controllers/comparativaIndicadores.controller.js` | Comparativa de supervisores |
| `controllers/reporteJefatura.controller.js` | Reporte de Jefatura |
| `controllers/reporteDetalle.controller.js` | Reporte de Detalle |
| `controllers/monitoreoController.js` | Monitoreo (MVs de publicidad/hora/ciudad) |
| `controllers/consultor.controller.js` | **API EXTERNA `/api/consultor`** ← clientes fuera del ERP |
| `controllers/backofficeJotform.controller.js` | Backoffice JotForm |
| `services/alertas.service.js` | Alertas en tiempo real (Socket.io) |
| `services/asistente.service.js` | Asistente IA |
| `services/broadcast.service.js` | Campañas de difusión WhatsApp |
| `routes/tthh.routes.js` | Módulo Talento Humano |

### 4.2 `vw_jotform_velsa_netlife_completo` — 23 referencias

Alimentada por: **servicios 4 y 5** (`jotform-sync-netlife`, `sync-maestras-netlife`).

Consumida por `analista.controller.js`, `consultorVelsa.controller.js`
(**API externa `/api/consultor-velsa`**), `indicadoresVelsa*`, `backofficeJotform`.

🔗 **Cadena de dependencia crítica:** esta vista es la fuente de la vista materializada
`mv_indicadores_velsa_completo` (ver `jobs/refreshVelsa.materialized.sql`). O sea:

```
JotForm ──(svc 4,5)──▶ tablas base ──▶ vw_jotform_velsa_netlife_completo
                                              │
                            (cron refreshVelsaMaterialized)
                                              ▼
                                  mv_indicadores_velsa_completo ──▶ 8 controllers de V1
```

Hay **dos** puntos de falla en serie: el servicio de ingesta *y* el cron de refresco.

### 4.3 `mv_indicadores_velsa_completo` — 16 referencias

Vista materializada. Refrescada por `jobs/refreshVelsaMaterialized.cron.js`
(proceso `workers`).

⚠️ **Está apagada por defecto.** En `entries/workers.js`:
> `initVelsaAutoRefresh(); // apagado por defecto salvo VELSA_MV_AUTOREFRESH=on`

**Si `VELSA_MV_AUTOREFRESH` no está en `on` en Render, todos los indicadores VELSA
muestran una foto congelada del momento del último refresco manual.** Verificar esto
es probablemente la acción de mayor impacto/menor esfuerzo de todo el documento.

### 4.4 Resto

| Tabla/Vista | Refs | Alimentada por | Consumida en V1 por |
|---|---|---|---|
| `negociaciones_reporteria` | 14 | svc 2 (GHL Velsa) | `indicadoresVelsa.controller.ACTUALIZADO.js`, MV Velsa |
| `vista_analisis_novonet` | 11 | svc 7 (analista) | `analista`, `indicadores`, `backofficeJotform` |
| `bitrix_deals` | 10 | svc 1 (bitrix_backend) | `bitrix`, `llamadas`, `bitrix.service` |
| `mv_monitoreo_*` (5 MVs) | ~40 | derivadas de `mestra_bitrix` | `monitoreoController` |
| `mv_consultor_velsa` | — | cron propio de V1 | API externa `/api/consultor-velsa` |
| `velsa_inversion_redes` | 4 | svc B / C | `redesVelsa.controller.js` |
| `bitrix_usuarios_novonet` | 3 | svc 1 | `llamadas`, `bitrix.service` |
| `velsa_inversion_diaria` | — | svc C | vía `dbLocal` ⚠️ (roto en Render) |

### 4.5 Lo que V1 alimenta por su cuenta (NO depende del orquestador)

Para evitar confusión, estos dominios son 100 % propios de V1:
`usuarios`, `ventas_registros`, `envios_ventas`, `tar_*` (Tareas), `hoj_*` (Hojas),
`wa_*` / `conversations` / `messages` / `campaigns` (WhatsApp), `tthh_*`,
`mundialito_*`, `polla_*`, `coverage_*`, `inventario`, `asesores_metas`.

V1 además tiene su **propia ingesta** en `entries/ingesta.js`: webhooks en vivo de
Bitrix (`bitrixWebhook.controller.js`), JotForm (`jotformWebhook.controller.js`) y
Gestionables. **Esto se solapa parcialmente con los servicios 1, 6, 7 y 8 del
orquestador** → ver §7, hallazgo H2.

---

## 5. Matriz "si se cae X, se rompe Y"

| Si se detiene… | Deja de actualizarse | Se ve afectado (sin dar error) | Severidad |
|---|---|---|---|
| **svc A — mestra-bitrix-etl** | `mestra_bitrix` | Indicadores, Redes, Forecast, Cumplimiento, Jefatura, Detalle, Monitoreo, Alertas, **API Consultor** | 🔴 CRÍTICA |
| **svc 4/5 — jotform netlife** | `vw_jotform_velsa_netlife_completo` → MV Velsa | Todo VELSA + **API Consultor Velsa** | 🔴 CRÍTICA |
| **cron `refreshVelsaMaterialized`** | `mv_indicadores_velsa_completo` | Indicadores/Redes/Reportes VELSA | 🔴 CRÍTICA |
| **svc 2 — ghl-sync-backend** | `negociaciones_reporteria` | Indicadores VELSA (detalle) | 🟠 ALTA |
| **svc 1 — bitrix_backend** | `bitrix_deals`, `bitrix_usuarios_novonet` | Módulo Llamadas, BitrixLive | 🟠 ALTA |
| **svc 7 — jotform-analista** | `vista_analisis_novonet` | Vista Analista | 🟠 ALTA |
| **svc C — reporte-automatizado** | `velsa_inversion_diaria` (BD local) | Datos adicionales / inversión | 🟡 MEDIA (ya roto en Render) |
| **svc 11 — Proyecto Telecom** | — | Nada en V1 (independiente) | ⚪ NULA |

---

## 6. Respuestas a tus consultas

### 6.1 «¿Se pueden colocar metas? Antes sí se hacía»

**Sí, y sigue funcionando.** Hay **tres** sistemas de metas distintos y desconectados
entre sí:

**a) `asesores_metas` — metas de gestionables por asesor (NOVONET)**

- Migración: `backend/src/migrations/cumplimiento_leads_metas.sql`
- Columnas: `codigo_ejecutivo`, `asesor`, `supervisor`, `meta_gestionables`, `activo`, `actualizado_en`
- Trigger `trg_asesores_metas_actualizado_en` actualiza la marca de tiempo
- La migración trae un `INSERT` de metas iniciales (semilla)

Endpoints activos (`routes/cumplimientoLeads.routes.js`, montado en `analitica-novo`):

| Método | Ruta | Acción |
|---|---|---|
| GET | `/api/cumplimiento-leads/metas` | listar |
| POST | `/api/cumplimiento-leads/metas` | crear/actualizar (UPSERT por `codigo_ejecutivo`) |
| PUT | `/api/cumplimiento-leads/metas/:id` | editar `meta_gestionables` / `activo` |
| GET | `/api/cumplimiento-leads/reporte` | reporte que hace `LEFT JOIN asesores_metas` |
| GET | `/api/cumplimiento-leads/export` | exportar a Excel |

Protegido por `verificarToken` + `noAsesor` (ni ASESOR ni CONSULTOR entran).

**b) `tthh_metas` — meta mensual de productividad (Talento Humano)**
`migrations/tthh_module.sql`, columna `meta_mensual` (default 10), configurable por TTHH.

**c) `forecast_objetivos` — objetivos de forecast**
Usada solo por `controllers/forecast.controller.js`.

> **Si "antes sí se hacía" y ahora no:** el código está intacto. Las causas más probables,
> en orden: (1) el frontend `TabMetas.jsx` **no tiene ninguna llamada a la API** — no
> encontré ni `axios` ni `fetch` en ese archivo, así que probablemente recibe datos por
> props desde otra pantalla o quedó huérfano; (2) tu perfil de usuario cambió y `noAsesor`
> te bloquea; (3) la migración `cumplimiento_leads_metas.sql` nunca se corrió en la base
> que estás usando. **Para descartar (3):** `SELECT COUNT(*) FROM public.asesores_metas;`

### 6.2 «¿Cómo se crean nuevos usuarios? ¿De dónde nacen?»

**Nacen de un solo lugar: un `INSERT` manual vía API, hecho por un ADMINISTRADOR.**
No hay ninguna alimentación automática desde Bitrix, GHL ni JotForm.

**Flujo completo:**

```
ADMINISTRADOR ──POST /api/usuarios──▶ routes/usuarios.routes.js
                                          │  valida perfil === 'ADMINISTRADOR'
                                          │  valida 8 campos obligatorios
                                          │  valida password >= 6 caracteres
                                          │  verifica que usuario/correo no existan
                                          │  bcrypt.hash(password, 12)
                                          ▼
                                  INSERT INTO usuarios (...) activo='SI'
```

**Tabla `usuarios`** (40 referencias en el código) — columnas:
`id`, `nombres`, `apellidos`, `correo`, `cargo`, `perfil`, `empresa`, `activo`,
`usuario`, `contraseña`

**CRUD completo** en `routes/usuarios.routes.js` — GET `/`, POST `/`, PUT `/:id`,
DELETE `/:id`. Los cuatro exigen `perfil === 'ADMINISTRADOR'`.

**Permisos** (`config/permisos.config.js`): la matriz es `empresa × perfil → módulos`.
- Empresas: `NOVONET`, `VELSA`
- Perfiles: `USUARIO`, `CONSULTOR`, `SUPERVISOR`, `ANALISTA`, `GERENCIA`, `ADMINISTRADOR`
- ~19 módulos (`VistaAsesor`, `Indicadores`, `Redes`, `RRHH`, `Comisiones`, …)
- Los permisos **no están en la BD** — están hardcodeados en ese archivo JS

**Autenticación:** JWT (`utils/token.js`, `JWT_SECRET`) + OTP por correo
(`login.otp.routes.js`, `verify.otp.routes.js`, tabla `otp_login`) + recuperación de
contraseña (`forgotPassword.routes.js`, tabla `password_resets`).

⚠️ **Hallazgo importante:** **no existe pantalla en el frontend para gestionar usuarios.**
Busqué `api/usuarios` en todo `frontend/src` y no hay ni una sola llamada. Es decir: hoy
los usuarios se crean con Postman/curl o con SQL directo en la base. Esto explicaría
por qué "antes se hacía" y ahora cuesta.

---

## 7. Hallazgos y riesgos

| ID | Hallazgo | Severidad | Evidencia |
|---|---|---|---|
| **H1** | **Credenciales de producción en texto plano.** `Orquestador.txt` termina con el host de Render y lo que parece ser la contraseña de `bdd_admin`. Ese mismo usuario aparece en `backend/.env`, que **está dentro del repo**. | 🔴 CRÍTICA | `Orquestador.txt:71-72`, `backend/.env` |
| **H2** | **Doble ingesta.** V1 tiene webhooks propios de Bitrix/JotForm (`entries/ingesta.js`) *y* el orquestador tiene servicios que hacen lo mismo (svc 1, 6, 7, 8). Riesgo de duplicados, condiciones de carrera o sobrescritura mutua. | 🔴 CRÍTICA | `entries/ingesta.js` vs `Orquestador.txt` |
| **H3** | **Refresco de MV VELSA apagado por defecto.** `VELSA_MV_AUTOREFRESH` debe valer `on`. Si no, los indicadores VELSA están congelados. | 🔴 CRÍTICA | `entries/workers.js` |
| **H4** | **Arranque 100 % manual.** 12 procesos que alguien inicia a mano en una PC de escritorio. Si esa PC se reinicia, la ingesta muere en silencio y nadie se entera. | 🔴 CRÍTICA | `Orquestador.txt` |
| **H5** | **Tres copias del CRUD de usuarios.** `usuarios.routes.js` (montado), `users.routes.js` y `usuarios.js` (huérfanos) tienen el mismo `INSERT INTO usuarios` con código **distinto**. Si parcheas la de seguridad equivocada, no pasa nada. | 🟠 ALTA | `grep "INSERT INTO usuarios"` |
| **H6** | `controllers/usuarios.controller.js` **está vacío (0 bytes)**. La lógica vive en el archivo de rutas. | 🟡 MEDIA | `wc -c` |
| **H7** | `dbLocal.js` apunta a `localhost` → endpoints permanentemente rotos en Render. | 🟠 ALTA | `config/dbLocal.js` |
| **H8** | **Sin observabilidad.** Nadie sabe cuándo fue la última escritura de cada tabla. El fallo es silencioso por diseño. | 🟠 ALTA | — |
| **H9** | Faltan los servicios **9 y 10** en el runbook. | 🟡 MEDIA | `Orquestador.txt` |
| **H10** | `indicadoresVelsa.controller.ACTUALIZADO.js` — sufijo `.ACTUALIZADO` sugiere versión paralela sin consolidar. | 🟡 MEDIA | `controllers/` |
| **H11** | Rutas del runbook apuntan a `C:\Users\Admin\` pero la máquina es `Usuario-PC`. | 🟡 MEDIA | `Orquestador.txt` |

---

## 8. Mejoras propuestas (priorizadas por impacto/esfuerzo)

### Quick wins — horas

1. **Rotar la contraseña de `bdd_admin`** y sacar `.env` del repo (`git rm --cached`,
   añadir a `.gitignore`, mover secretos al Environment Group `erp-shared` de Render).
   → mitiga H1.
2. **Verificar `VELSA_MV_AUTOREFRESH=on`** en Render. Una variable de entorno que
   probablemente esté desincronizando todos los indicadores VELSA. → mitiga H3.
3. **Borrar `users.routes.js`, `usuarios.js` y `usuarios.controller.js`** (huérfanos).
   → mitiga H5, H6.
4. **Confirmar si existen los servicios 9 y 10.** → H9.

### Corto plazo — días

5. **Tabla de heartbeat de ingesta.** Que cada servicio del orquestador escriba
   `INSERT INTO ingesta_heartbeat(servicio, ts, filas_afectadas)` al terminar. Luego un
   endpoint `/api/salud-ingesta` en V1 que compare contra un umbral por servicio.
   Convierte el fallo silencioso en una alerta. → mitiga H8.
6. **Pantalla de administración de usuarios en el frontend.** El backend ya está listo;
   falta la UI. Bajo esfuerzo, alto valor operativo.
7. **Resolver la doble ingesta (H2).** Decidir por cada fuente: ¿webhook de V1 o
   servicio del orquestador? Tener ambos activos sobre la misma tabla es una fuente
   silenciosa de descuadres.
8. **Migrar `velsa_inversion_diaria` de la Postgres local a Render** y retirar
   `dbLocal.js`. → mitiga H7.

### Medio plazo — semanas

9. **PM2 con `ecosystem.config.js` + arranque automático** para los 12 servicios, o
   mejor: **migrarlos a Render como Cron Jobs / Background Workers**. Elimina la
   dependencia de una PC encendida. → mitiga H4.
10. **Mover la matriz de permisos a la BD.** Hoy cada cambio de permisos requiere un
    deploy (`permisos.config.js`).
11. **Réplica de lectura en Postgres** para `analitica-velsa` y `analitica-novo`
    (el `render.yaml` ya lo tiene previsto en un comentario).
12. **Consolidar `.ACTUALIZADO`** y limpiar los `vite.config.js.timestamp-*` del frontend.

---

## 9. Pendiente: esquema real de la BD

**No pude conectarme a Postgres.** El entorno donde ejecuto código no tiene salida a
internet (sin DNS ni TCP saliente) — lo verifiqué. Esto es independiente de credenciales
o del *allowlist* de Render.

**Sobre el rol de solo lectura:** el `CREATE ROLE claude_ro …` es correcto y conviene
tenerlo igual, pero **no resuelve este bloqueo**. Y algo importante: **no le quites
permisos de escritura a `bdd_admin`** — es el usuario que usan los 12 servicios del
orquestador y el backend de V1. Si lo cambias, se cae toda la ingesta.

**La vía práctica:** ejecuta esto en tu PC (que sí llega a Render) y deja el resultado
en la carpeta V1 para que yo lo lea:

```bat
set PGPASSWORD=tu_password
pg_dump -h dpg-d5l6jvh4tr6s738gfr60-a.oregon-postgres.render.com -U bdd_admin ^
        -d bddgeneral --schema-only --no-owner --no-privileges ^
        -f "C:\Users\Usuario-PC\Desktop\AREA_DESARROLLO\AREA_DESARROLLO\ERP\V1\esquema_bddgeneral.sql"
```

Con ese archivo puedo verificar todo lo marcado como "probable" en este documento:
tablas reales, columnas, índices, vistas materializadas y claves foráneas.

Si además quieres saber **qué tan fresca** está cada tabla (lo más útil para validar el
orquestador), corre esto en pgAdmin y pásame la salida:

```sql
SELECT relname AS tabla,
       n_live_tup AS filas,
       last_autovacuum, last_analyze
FROM pg_stat_user_tables
ORDER BY n_live_tup DESC
LIMIT 40;
```

---

## 10. Preguntas abiertas

1. ¿Existen los servicios **9 y 10**? Si sí, ¿alguien los arranca?
2. ¿Los 12 procesos corren hoy en una PC de escritorio o ya están en algún servidor?
3. ¿Con qué frecuencia corre cada uno? ¿Tienen cron interno o son de un solo disparo?
4. Sobre la doble ingesta (H2): ¿los webhooks de V1 sustituyeron a los servicios del
   orquestador, o conviven a propósito?
5. Metas: ¿qué pantalla exacta usabas antes para colocarlas?
6. ¿La Postgres local (`velsa_inversion_diaria`, `bitrix_contacts`) sigue en uso?
