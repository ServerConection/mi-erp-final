# Fix módulo WhatsApp (envíos masivos) — 2026-06-10

Revisión completa del módulo nuevo. Se corrigieron 8 problemas **sin tocar la lógica existente del ERP** (todos los cambios son en archivos `wa_*`, servicios del módulo WA, o aditivos).

## Errores que impedían arrancar el backend (crash al boot)

1. **Requires a archivos inexistentes** (MODULE_NOT_FOUND):
   - `wa_campaigns.controller.js`, `wa_lists.controller.js`, `wa_scheduled.controller.js` pedían `./contacts.controller` → corregido a `./wa_contacts.controller`.
   - `BaileysManager.js` pedía `../engine/FlowEngine` → corregido a `./FlowEngine`.
   - `FlowEngine.js` pedía `webhook.service` que no existía → **creado** `src/services/webhook.service.js` (fetch con timeout 15s).

2. **`emailService.send` no existía** (FlowEngine, nodo email) → agregada función `send()` en `email.service.js`. `enviarOTP` queda intacto.

## Errores de runtime del módulo

3. **`config/db.js`**: los controladores `wa_*` destructuran `{ query, transaction }`, pero el módulo exportaba el pool crudo (query sin bind → TypeError; transaction → undefined). Se agregaron `pool.query` (bind) y `pool.transaction` de forma **aditiva**: `pool.query(...)` del código existente sigue idéntico.

4. **`app.set('baileysManager'/'campaignEngine')` nunca se llamaba** → todos los `req.app.get(...)` daban undefined (conectar línea, iniciar/pausar campaña, enviar desde inbox). Ahora `whatsapp.service.js` los registra al iniciar.

5. **`makeInMemoryStore` fue eliminado en Baileys v7** → reemplazado por un mini-store en memoria propio en `BaileysManager._createMessageStore()` (compatible con `bind` y `loadMessage` para reintentos y polls).

6. **Adjuntos de campañas**: el upload devuelve URLs `/wa-uploads/...` pero `CampaignEngine` solo resolvía `/uploads/...` → toda campaña con imagen/documento fallaba. Ahora resuelve `/wa-uploads/` (respetando `WA_UPLOADS_DIR`), `/uploads/`, rutas absolutas y URLs http(s).

7. **Variables de entorno de Render ignoradas**:
   - `BaileysManager` usaba `AUTH_SESSIONS_DIR`; ahora prioriza `WA_AUTH_DIR` (el disco persistente `/var/data/auth_sessions`).
   - El static `/wa-uploads` en `app.js` ahora respeta `WA_UPLOADS_DIR`.

8. **Guard en `wa_lines.getAll`**: ya no devuelve 500 si el módulo WA todavía está inicializando.

## ⚠️ Importante: node_modules local corrupto

En tu PC, **todos los archivos `index.js` dentro de `backend/node_modules` fueron borrados** (express, pg, baileys, jsonwebtoken, socket.io, etc.) — patrón típico de antivirus o herramienta de limpieza. Por eso nada corre localmente. Antes de la migración:

```
cd backend
rmdir /s /q node_modules
npm install
```

Y agrega una exclusión del antivirus para la carpeta del proyecto. Render no se afecta (instala fresco en cada deploy).

## Pasos siguientes (igual que el plan original)

1. `node src/migrations/run_whatsapp.js` (tras reinstalar node_modules)
2. Render: disco en `/var/data` + `WA_AUTH_DIR=/var/data/auth_sessions` + `WA_UPLOADS_DIR=/var/data/wa_uploads` (ahora el código sí las usa)
3. `git add . && git commit && git push`
