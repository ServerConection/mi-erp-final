# Guía de despliegue — ERP separado en procesos (Render)

Esta guía explica cómo cargar y crear en Render los distintos desarrollos que
acabamos de separar, **incluido WABOT**. La separación es **aditiva**: tu
monolito actual (`npm start` → `src/server.js`) sigue intacto y funcionando. Si
algo falla, puedes volver a él sin perder nada.

---

## 1. Qué se creó (mismo repo, sin reescribir lógica)

Se reusan tus controladores y rutas tal cual. Solo se agregaron *puntos de
arranque* que montan cada subconjunto:

```
backend/src/
  shared/
    createApp.js        ← middlewares compartidos (CORS, seguridad, rate limit, /health, errores)
    startHttp.js        ← arranque HTTP + timeouts + apagado limpio + Socket.io opcional
  entries/
    core.js             ← CORE ERP (conserva la URL actual; APIs externas intactas)
    analitica-velsa.js  ← Indicadores/redes VELSA (pool propio)
    analitica-novo.js   ← Indicadores/redes/forecast NOVONET (pool propio)
    wabot.js            ← WhatsApp/Baileys + broadcast + Socket.io (aislado)
    ingesta.js          ← Webhooks Bitrix/Jotform/gestionables
    workers.js          ← Cron de vistas materializadas + sync (sin HTTP)
    gateway.js          ← API Gateway: un solo URL para el frontend
```

Ediciones mínimas y retrocompatibles:

- `config/db.js` → el pool ahora lee `DB_POOL_MAX`/`DB_POOL_MIN` (si no existen,
  mantiene 20/2 → el monolito no cambia).
- `services/whatsapp.service.js` → `iniciarWhatsApp(app)` acepta la app del
  proceso WABOT (si no se pasa, cae al comportamiento anterior).
- `package.json` → nuevos scripts `start:*` y la dependencia `http-proxy-middleware`.

---

## 2. Los procesos y qué sirve cada uno

| Servicio Render | Proceso | Sirve |
|---|---|---|
| `erp-core` | `start:core` | auth, usuarios, ventas, inventario, tthh, backoffice, bitrix, mundialito, **consultor y consultor-velsa (APIs externas)** |
| `erp-analitica-velsa` | `start:analitica-velsa` | `/api/indicadores-velsa`, `/api/redes-velsa`, `/api/datos-adicionales` |
| `erp-analitica-novo` | `start:analitica-novo` | `/api/indicadores`, `/api/redes`, `/api/forecast`, `/api/coverage`, `/api/comparativa-indicadores`, `/api/cumplimiento-leads`, `/api/llamadas` |
| `erp-wabot` | `start:wabot` | `/api/wa`, `/api/broadcast`, `/wa-uploads`, Socket.io |
| `erp-ingesta` | `start:ingesta` | webhooks Bitrix/Jotform/gestionables |
| `erp-workers` | `start:workers` | cron de refresco de MV + sync Jotform (background) |
| `erp-gateway` | `start:gateway` | único URL para el frontend; enruta a los demás |

> **APIs externas sin cambios:** `/api/consultor/buscar` y
> `/api/consultor-velsa/buscar` viven en `erp-core` y también caen ahí a través
> del gateway (catch-all). Su URL y comportamiento no cambian.

---

## 3. Probar en local antes de subir

En dos terminales, con tu `.env` de siempre:

```bash
cd backend
npm install                 # instala http-proxy-middleware
DB_POOL_MAX=8 npm run start:analitica-novo   # p.ej. en PORT 3002
npm run start:core                            # en PORT 3000
```

Cada proceso expone `GET /health` con su nombre. Si responde, arrancó bien.

---

## 4. Desplegar en Render

Tienes dos caminos. El **A (Blueprint)** es el recomendado.

### Camino A — Blueprint (`render.yaml`)

1. Crea un **Environment Group** llamado `erp-shared` en Render con tus secretos
   actuales: `JWT_SECRET`, `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`,
   `DB_PORT`, `ALLOWED_ORIGINS`, y las demás que ya usas (SendGrid, Bitrix, etc.).
2. En el dashboard: **New + → Blueprint**, conecta el repo. Render leerá
   `render.yaml` (en la raíz de `V1`) y creará los 7 servicios.
3. Deja `autoDeploy: false` hasta validar; despliega en este orden:
   **core → analitica-velsa → analitica-novo → wabot → ingesta → workers → gateway**.
4. Tras desplegar los servicios internos, copia la URL pública de cada uno y
   pégala en las variables del `erp-gateway` (`CORE_URL`, `ANALITICA_VELSA_URL`,
   `ANALITICA_NOVO_URL`, `WABOT_URL`, `INGESTA_URL`). Redeploy del gateway.

### Camino B — Manual (servicio por servicio)

Por cada proceso: **New + → Web Service** (o **Background Worker** para
`workers`), mismo repo, **Root Directory = `backend`**, **Build =
`npm install`**, **Start = `npm run start:<proceso>`**, adjunta el grupo
`erp-shared` y su `DB_POOL_MAX`.

> Puedes reutilizar tu servicio actual como `erp-core` (así conserva su URL y las
> APIs externas ni se enteran): solo cambia su Start Command a `npm run start:core`.

---

## 5. Especial WABOT (lo más delicado)

- **Una sola instancia** (`numInstances: 1`). No escalar horizontalmente: las
  sesiones de Baileys son estado local con afinidad; dos instancias chocan y
  provocan 401/428.
- **Disco persistente** montado en `/var/data` con:
  `WA_AUTH_DIR=/var/data/auth_sessions` y `WA_UPLOADS_DIR=/var/data/wa_uploads`.
  Así un reinicio no obliga a re-escanear todos los QR.
- El QR y las conversaciones viajan por Socket.io: el gateway proxya
  `/socket.io` (WebSocket) hacia WABOT.

---

## 6. Frontend

Apunta el frontend al **`erp-gateway`** (una sola URL, como hoy). No necesitas
cambiar rutas: el gateway reparte internamente. Recuerda incluir la URL del
frontend en `ALLOWED_ORIGINS`.

---

## 7. Pendientes recomendados (fase 1.5, cuando esto ya corra)

1. **Redis** para: rate limit distribuido (hoy es en memoria por proceso),
   caché de KPIs, y el **adaptador de Socket.io** (`@socket.io/redis-adapter`)
   para que todos los procesos compartan el tiempo real.
2. **Réplica de lectura** de PostgreSQL: apunta el `DB_HOST` de los dos
   servicios de analítica a la réplica → dejan de competir con las escrituras.
3. **Materializar Novonet**: pasar `netlife_estatus_real` y
   `vista_analisis_novonet` a vistas materializadas (como ya tiene VELSA). Este
   es el mayor salto de velocidad para los indicadores.
4. **Colas (BullMQ)** en ingesta: validar y encolar el webhook, responder 200 al
   instante; los workers procesan.

---

## 8. Rollback

Si necesitas volver atrás: el monolito sigue intacto en `src/server.js`. Basta
con un servicio cuyo Start Command sea `npm start`. Nada de lo agregado lo pisa.

> Nota menor: quedó un archivo vacío `backend/err.txt` de una verificación; puedes
> borrarlo con `del backend\err.txt`.
