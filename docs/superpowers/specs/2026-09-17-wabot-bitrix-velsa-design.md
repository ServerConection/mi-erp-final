# WABOT-BITRIX para Velsa (segundo portal de Bitrix24)

Fecha: 2026-09-17
Estado: Aprobado por Bryan, listo para plan de implementación.

## Contexto

WABOT-BITRIX ya funciona en producción para el portal de Novonet
(`novonet.bitrix24.es`): una app local de Bitrix con OAuth propio, un
conector de Canales Abiertos (`imconnector`) que mete las conversaciones
de WhatsApp dentro del CRM, y una pestaña "WABOT" en el detalle de la
Negociación que muestra la conversación filtrada a esa Negociación
(placement `CRM_DEAL_DETAIL_TAB`).

Bryan quiere el mismo módulo para Velsa, que tiene su propio portal de
Bitrix24 separado: `aclopecuador.bitrix24.es`.

Todo el código actual de este módulo asume **un solo portal**: lee
`BITRIX_PORTAL_URL`, `BITRIX_APP_CLIENT_ID`, `BITRIX_APP_CLIENT_SECRET` y
`BITRIX_APP_TOKEN` como variables de entorno únicas, a nivel de módulo
(`backend/src/services/bitrixApp.service.js`,
`backend/src/services/bitrixConnector.service.js`). La tabla
`bitrix_oauth_tokens` sí está preparada para varios portales (clave
primaria por `portal`), pero nada más lo está.

## Decisiones ya validadas con Bryan

- **No** se crea un servicio/deploy aparte para Velsa (duplicaría
  mantenimiento). **No** se hace multi-tenant dinámico con detección de
  portal en runtime (ya sufrimos lo poco confiable que es el `DOMAIN`
  que manda Bitrix — ver spec de WABOT-BITRIX original).
- Se usa el **mismo backend, misma base de datos**, pero cada portal
  tiene su **propia URL pública** de handler
  (`/api/bitrix-connector/...` para Novonet,
  `/api/bitrix-connector-velsa/...` para Velsa) y sus **propias
  credenciales**. Así cada request ya sabe de qué portal es, por la ruta
  que lo recibió — cero ambigüedad, cero necesidad de confiar en datos
  que manda el navegador.
- Velsa usará **líneas de WhatsApp nuevas y separadas** de las de
  Novonet (números y sesiones Baileys propias).
- Bryan es administrador de `aclopecuador.bitrix24.es` y creará ahí la
  app local de Bitrix desde cero (no existe todavía).

## Arquitectura

### 1. `bitrixApp.service.js` → fábrica en vez de singleton

Hoy expone funciones a nivel de módulo que leen `PORTAL`/`CLIENT_ID`/
`CLIENT_SECRET` fijos. Se convierte en una función
`crearBitrixApp({ nombrePortal, portalUrl, clientId, clientSecret })`
que devuelve un objeto con los mismos métodos que ya existen (`llamar`,
`guardarTokens`, `leerTokens`, `refrescar`, `tokenVigente`,
`usuarioActualPorAuthId`, `configurado`, `PORTAL`), pero cerrados sobre
esa configuración en vez de sobre variables de módulo.

`guardarTokens`/`leerTokens` ya usan `portal` como clave en
`bitrix_oauth_tokens`, así que dos instancias (Novonet y Velsa) conviven
sin chocar, sin tocar el esquema de esa tabla.

Se crean dos instancias en un único punto (ej.
`backend/src/services/bitrixPortales.js`):
```js
const novonet = crearBitrixApp({
  nombrePortal: 'novonet',
  portalUrl: process.env.BITRIX_PORTAL_URL,
  clientId: process.env.BITRIX_APP_CLIENT_ID,
  clientSecret: process.env.BITRIX_APP_CLIENT_SECRET,
})
const velsa = crearBitrixApp({
  nombrePortal: 'velsa',
  portalUrl: process.env.BITRIX_PORTAL_URL_VELSA,
  clientId: process.env.BITRIX_APP_CLIENT_ID_VELSA,
  clientSecret: process.env.BITRIX_APP_CLIENT_SECRET_VELSA,
})
```
Los módulos que hoy hacen `require('../services/bitrixApp.service')`
directo (Novonet) **no cambian**: `bitrixApp.service.js` sigue
existiendo tal cual, exportando la instancia Novonet por compatibilidad,
para no tocar nada que ya funciona.

### 2. `bitrixConnector.service.js` → misma idea

`CONNECTOR_ID`, `CONNECTOR_NAME` y `BASE_URL` pasan a ser parte de la
configuración de la fábrica en vez de constantes de módulo. El
`CONNECTOR_ID` puede repetirse igual (`wabot_bitrix`) entre portales,
porque el namespace de `imconnector` es por portal — no chocan.

### 3. Rutas y controlador nuevos para Velsa

Se agregan `backend/src/controllers/bitrixConnectorVelsa.controller.js`
y `backend/src/routes/bitrixConnectorVelsa.routes.js`, montados en
`/api/bitrix-connector-velsa`. Internamente reutilizan la MISMA lógica
que ya existe (`install`, `settings`, `events`, `placementInbox`,
`registrarConector`, `listarCanales`, `activarCanal`, `estado`) pero
parametrizada con la instancia `velsa` de `bitrixApp`/`bitrixConnector`
en vez de la de Novonet — no se copian los ~250 líneas del controlador
actual, se extrae la lógica compartida a funciones que reciben la
instancia como parámetro, y cada archivo de rutas monta esas funciones
ya "atadas" a su portal.

`tokenValido()` (que hoy compara contra un único `BITRIX_APP_TOKEN`)
también se parametriza: cada portal valida contra su propio
`BITRIX_APP_TOKEN_*`, ya que cada instalación de Bitrix genera el suyo.

### 4. Base de datos

Migración nueva: columna `empresa VARCHAR(20) NOT NULL DEFAULT 'novonet'`
en la tabla `lines`, con `CHECK (empresa IN ('novonet','velsa'))`. Así
el sistema sabe, por línea, a qué portal/conector de Bitrix debe
entregar y desde cuál escuchar eventos. Todas las líneas existentes
quedan en `'novonet'` automáticamente (default), sin romper nada.

`enviarAOpenLine` y el resto de `bitrixConnector.service.js` reciben
la instancia correcta según `lines.empresa` de la línea que originó el
mensaje.

### 5. Variables de entorno nuevas (Render)

- `BITRIX_PORTAL_URL_VELSA`
- `BITRIX_APP_CLIENT_ID_VELSA`
- `BITRIX_APP_CLIENT_SECRET_VELSA`
- `BITRIX_APP_TOKEN_VELSA`

(`BITRIX_CONNECTOR_ID`/`BITRIX_APP_BASE_URL` se derivan o se agregan sus
variantes `_VELSA` solo si hace falta distinguir el nombre visible del
conector.)

### 6. Pasos manuales en Bitrix (Velsa) — Bryan

1. Crear la app local en `aclopecuador.bitrix24.es` (Bitrix24 →
   Desarrollo → Otro → Aplicación local).
2. Handler de instalación apuntando a
   `https://erp-backend-v1-qhk2.onrender.com/api/bitrix-connector-velsa/install`.
3. Asignar permisos desde el inicio: CRM, Conectores de mensajería
   externos, Canales Abiertos, Chat y Notificaciones, Incorporación de
   aplicaciones, **Usuarios** (los seis — para no repetir el problema
   que tuvimos con Novonet, donde faltó "Usuarios").
4. Guardar y pasarme `client_id`/`client_secret`.
5. Registrar el placement `CRM_DEAL_DETAIL_TAB` apuntando a
   `/api/bitrix-connector-velsa/settings` (esto se automatiza igual que
   con Novonet, vía `placement.bind` al reinstalar).

## Plan de despliegue

1. Cambios de código (fábrica + rutas Velsa) + migración de `lines`,
   en una rama, sin tocar el comportamiento de Novonet.
2. Bryan crea la app en Bitrix Velsa y comparte credenciales.
3. Variables de entorno en Render.
4. Prueba con una línea de WhatsApp de prueba: instalar la app, ver que
   llegan tokens, registrar conector, activar un canal, mandar un
   mensaje de prueba y confirmar que aparece en el CRM de Velsa.

## Fuera de alcance

- No se toca el flujo de Novonet.
- No se cambia el pool de proxies (ya confirmado que el rango de
  puertos sticky funciona y no depende de esto).
- No se decide todavía en qué pipeline/categoría de Velsa va la pestaña
  WABOT — se define al registrar el placement, no requiere cambios de
  diseño.
