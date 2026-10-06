# WABOT como servicio externo en Render

Objetivo: que un deploy del ERP ya no tumbe WhatsApp. El ERP conserva su URL;
el frontend y Bitrix24 **no cambian**.

## Cómo funciona
- `erp-backend` (monolito, URL actual) reenvía `/api/wa/*`, `/api/bitrix-connector*` y
  `/wa-uploads/*` (si el archivo no está en su disco) al servicio `erp-wabot`.
- `erp-wabot` corre Baileys, campañas, chatbots, inbox, programados y el conector Bitrix.
- Los eventos en vivo (mensajes, QR, estados) cruzan entre servicios con el
  adaptador Postgres de Socket.io. El navegador sigue conectado al socket del ERP.
- Todo se enciende con variables de entorno. Sin ellas, el ERP funciona igual que antes.

## Variables
| Servicio | Variable | Valor |
|---|---|---|
| erp-backend | `WABOT_REMOTE_URL` | URL pública de erp-wabot (https://erp-wabot-xxxx.onrender.com) |
| erp-backend | `WABOT_INTERNAL_KEY` | texto aleatorio largo (igual en ambos) |
| erp-backend | `SOCKET_PG_ADAPTER` | `on` |
| erp-wabot | *todas las del erp-backend* | copiar |
| erp-wabot | `WABOT_ACTIVO` | `false` al crear, `true` en el corte |
| erp-wabot | `SOCKET_PG_ADAPTER` | `on` |
| erp-wabot | `WABOT_INTERNAL_KEY` | mismo valor |
| erp-wabot | `WA_AUTH_STORE` | `pg` |
| erp-wabot | `DB_POOL_MAX` | `5` |

erp-wabot: Root Directory `backend`, Build `npm install`, Start `npm run start:wabot`,
Health check `/health`, 1 instancia, disco en `/var/data`, Auto-Deploy con Build Filter
solo para archivos de WhatsApp (o manual).

## Orden del corte
0. (Solo si hoy `WA_AUTH_STORE` no es `pg`) poner `WA_AUTH_STORE=pg` en erp-backend y
   desplegar: las sesiones del disco se suben solas a Postgres. Verificar líneas conectadas.
1. Mergear esta rama. Con las variables apagadas no cambia nada.
2. Crear erp-wabot con `WABOT_ACTIVO=false`. Verificar `/health`.
3. En erp-backend agregar `WABOT_REMOTE_URL`, `WABOT_INTERNAL_KEY`, `SOCKET_PG_ADAPTER=on` → deploy.
   (WhatsApp queda apagado unos minutos: es el único corte.)
4. En erp-wabot poner `WABOT_ACTIVO=true` → deploy. Las líneas se levantan desde Postgres.

## Rollback
Borrar `WABOT_REMOTE_URL` del erp-backend (deploy) y poner `WABOT_ACTIVO=false` en erp-wabot.
