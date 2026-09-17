# WABOT-BITRIX para Velsa — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el módulo WABOT-BITRIX (instalación OAuth, pestaña "WABOT" en el
Deal, conector de Canales Abiertos) funcione también para el portal de Velsa
(`aclopecuador.bitrix24.es`), sin tocar el comportamiento actual de Novonet.

**Architecture:** `bitrixApp.service.js`, `bitrixConnector.service.js` y
`bitrixConnector.controller.js` pasan de módulos-singleton (una sola
configuración leída de variables de entorno) a **fábricas**: funciones que
reciben la configuración de un portal y devuelven un objeto con los mismos
métodos de siempre. Cada archivo sigue exportando, por compatibilidad, una
instancia "Novonet" idéntica a la de hoy — así ningún código existente
cambia. Se crea `bitrixPortales.js` con la instancia nueva de Velsa, y un
controlador + rutas nuevos (`/api/bitrix-connector-velsa/...`) que usan esa
instancia a través de la misma fábrica del controlador.

**Tech Stack:** Node.js (CommonJS), Express, `pg` (Postgres), sin framework
de tests (el repo no lo tiene — `backend/package.json` no define `test`).
La verificación de cada paso es `node --check` (sintaxis) más revisión
manual del diff; la prueba end-to-end real es el paso 4 del plan de
despliegue del spec (instalar en Bitrix Velsa y mandar un mensaje real).

**Spec:** `docs/superpowers/specs/2026-09-17-wabot-bitrix-velsa-design.md`

## Global Constraints

- No modificar el comportamiento de Novonet. Cada archivo que se refactoriza
  debe seguir exportando exactamente lo mismo que exporta hoy, para que
  `bitrixConnector.routes.js` (Novonet) no necesite ningún cambio.
- Sin migración de base de datos — la empresa de una línea se deriva de
  `lines.created_by → usuarios.empresa` (ya existe).
- No replicar la función `enviarAOpenLine` a ningún lugar nuevo: hoy no la
  llama nadie ni para Novonet (gap confirmado y aceptado por Bryan), y este
  plan no lo soluciona — solo no lo empeora ni lo duplica mal.
- Todas las rutas nuevas van bajo el prefijo `/api/bitrix-connector-velsa`.
- Variables de entorno nuevas (Render): `BITRIX_PORTAL_URL_VELSA`,
  `BITRIX_APP_CLIENT_ID_VELSA`, `BITRIX_APP_CLIENT_SECRET_VELSA`,
  `BITRIX_APP_TOKEN_VELSA`. Opcionales: `BITRIX_CONNECTOR_ID_VELSA`,
  `BITRIX_APP_BASE_URL_VELSA` (si no están, se usan los mismos valores que
  Novonet para `CONNECTOR_ID`/`BASE_URL`, que es seguro porque el namespace
  de `imconnector` es por portal).

---

### Task 1: `bitrixApp.service.js` → fábrica compatible con Novonet

**Files:**
- Modify: `backend/src/services/bitrixApp.service.js`

**Interfaces:**
- Produces: `crearBitrixApp({ portalUrl, clientId, clientSecret })` → objeto
  `{ llamar, guardarTokens, leerTokens, refrescar, tokenVigente,
  configurado, PORTAL, usuarioActualPorAuthId }` (mismos nombres y firmas
  que ya existen hoy).
- El `module.exports` sigue teniendo esas mismas claves para Novonet (spread
  de la instancia Novonet), más `crearBitrixApp` para que otros archivos
  puedan crear instancias nuevas.

- [ ] **Step 1: Reescribir el archivo completo**

Reemplazar TODO el contenido de `backend/src/services/bitrixApp.service.js`
por:

```js
/**
 * OAuth de una aplicación local de Bitrix24 — fábrica por portal
 * ---------------------------------------------------------------------------
 * POR QUÉ EXISTE ESTE ARCHIVO SI YA LLAMAMOS A BITRIX EN OTRO LADO
 *
 * El resto del ERP habla con Bitrix por WEBHOOK entrante (BITRIX_NOVONET_URL).
 * Eso sirve para crm.deal.get, crm.contact.get y todo lo que ya funciona, y NO
 * hay que tocarlo.
 *
 * Pero los métodos imconnector.* NO aceptan webhook. La documentación es
 * explícita: "The method works only in the context of an application", y si
 * lo intentás por webhook devuelve WRONG_AUTH_TYPE / "Application context
 * required". Por eso hace falta una app local con OAuth, que es lo único que
 * este módulo maneja.
 *
 * Los tokens viven en la tabla bitrix_oauth_tokens, no en memoria: si se
 * reinicia el servicio (cada deploy de Render lo hace) el refresh_token tiene
 * que sobrevivir, si no hay que reinstalar la app a mano. La tabla está
 * indexada por `portal`, así que varias apps (varios portales de Bitrix)
 * pueden convivir en la misma tabla sin chocar.
 *
 * ESTE ARCHIVO ES UNA FÁBRICA: `crearBitrixApp(cfg)` arma una instancia para
 * UN portal. Se sigue exportando, además, una instancia lista para Novonet
 * (leyendo las mismas variables de entorno de siempre) para que ningún
 * archivo existente tenga que cambiar.
 */
const pool = require('../config/db')

const OAUTH_URL = 'https://oauth.bitrix.info/oauth/token/'

// Margen para renovar antes de que venza de verdad: evita la carrera de que el
// token muera entre que lo leemos y que Bitrix procesa el request.
const MARGEN_SEG = 120

function crearBitrixApp({ portalUrl, clientId, clientSecret }) {
  const PORTAL        = (portalUrl || '').replace(/\/+$/, '')
  const CLIENT_ID     = clientId || ''
  const CLIENT_SECRET = clientSecret || ''

  const configurado = () => !!(PORTAL && CLIENT_ID && CLIENT_SECRET)

  /** Guarda el juego de tokens que devuelve Bitrix (instalación o refresh). */
  async function guardarTokens(t) {
    const expiraEn = Number(t.expires_in || 3600)
    await pool.query(
      `INSERT INTO bitrix_oauth_tokens (portal, access_token, refresh_token, expires_at, member_id, scope, updated_at)
       VALUES ($1, $2, $3, NOW() + ($4 || ' seconds')::interval, $5, $6, NOW())
       ON CONFLICT (portal) DO UPDATE
         SET access_token  = EXCLUDED.access_token,
             refresh_token = EXCLUDED.refresh_token,
             expires_at    = EXCLUDED.expires_at,
             member_id     = COALESCE(EXCLUDED.member_id, bitrix_oauth_tokens.member_id),
             scope         = COALESCE(EXCLUDED.scope, bitrix_oauth_tokens.scope),
             updated_at    = NOW()`,
      [PORTAL, t.access_token, t.refresh_token, String(expiraEn), t.member_id || null, t.scope || null]
    )
  }

  async function leerTokens() {
    const r = await pool.query('SELECT * FROM bitrix_oauth_tokens WHERE portal = $1', [PORTAL])
    return r.rows[0] || null
  }

  /** Renueva el access_token con el refresh_token. */
  async function refrescar() {
    const fila = await leerTokens()
    if (!fila) throw new Error('BITRIX_OAUTH_SIN_INSTALAR: la app local todavía no se instaló en el portal')

    const qs = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: fila.refresh_token,
    })
    const res = await fetch(`${OAUTH_URL}?${qs}`)
    const json = await res.json()
    if (json.error) {
      // Si el refresh_token murió no hay recuperación automática: alguien tiene
      // que reinstalar la app en el portal. Se dice claro en vez de reintentar.
      throw new Error(`BITRIX_OAUTH_REFRESH_FALLO: ${json.error_description || json.error} — hay que reinstalar la app local en Bitrix`)
    }
    await guardarTokens(json)
    return json.access_token
  }

  /** Devuelve un access_token vigente, renovando si está por vencer. */
  async function tokenVigente() {
    const fila = await leerTokens()
    if (!fila) throw new Error('BITRIX_OAUTH_SIN_INSTALAR: la app local todavía no se instaló en el portal')
    const venceEn = (new Date(fila.expires_at).getTime() - Date.now()) / 1000
    if (venceEn > MARGEN_SEG) return fila.access_token
    return refrescar()
  }

  /**
   * Llama a un método REST de Bitrix con OAuth.
   * Si el token venció igual (reloj corrido, refresh en paralelo), reintenta UNA
   * vez con token nuevo. No más: un bucle de reintentos contra un token muerto
   * solo consume rate limit.
   */
  async function llamar(metodo, params = {}, { _reintento = false } = {}) {
    if (!configurado()) {
      throw new Error('BITRIX_APP_NO_CONFIGURADA: faltan portalUrl, clientId o clientSecret')
    }
    const auth = await tokenVigente()
    const controlador = new AbortController()
    const t = setTimeout(() => controlador.abort(), 25000)
    try {
      const res = await fetch(`${PORTAL}/rest/${metodo}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...params, auth }),
        signal: controlador.signal,
      })
      const json = await res.json()
      if (json.error) {
        const cod = String(json.error).toLowerCase()
        if (!_reintento && (cod === 'expired_token' || cod === 'invalid_token')) {
          await refrescar()
          return llamar(metodo, params, { _reintento: true })
        }
        throw new Error(`Bitrix [${metodo}]: ${json.error_description || json.error}`)
      }
      return json.result
    } finally {
      clearTimeout(t)
    }
  }

  /**
   * ── SSO del placement (auto-login del asesor en el embed "WABOT Inbox") ────
   *
   * Cuando Bitrix abre el placement (CRM_DEAL_DETAIL_TAB) manda, entre otros
   * campos, AUTH_ID: el access_token de la SESIÓN DEL USUARIO QUE ABRIÓ LA
   * PESTAÑA (no el de nuestra app). Ese AUTH_ID es justamente lo que permite
   * preguntarle a Bitrix "¿quién sos realmente?" sin confiar en nada que venga
   * del navegador: se llama a user.current CON ESE auth, y la respuesta la
   * arma Bitrix, no el cliente.
   *
   * NO se recibe el dominio del request: cada instancia de esta fábrica sirve
   * UN solo portal, así que se usa siempre el PORTAL con el que se creó --
   * nunca un dato que venga del navegador. Confirmado en producción: Bitrix ya
   * no manda DOMAIN de forma confiable, y SERVER_ENDPOINT es el servidor
   * genérico de OAuth (oauth.bitrix.info), no el portal del cliente.
   */
  async function usuarioActualPorAuthId(authId) {
    if (!authId) throw new Error('BITRIX_SSO_FALTAN_DATOS')

    const portalHost = PORTAL.replace(/^https?:\/\//i, '').toLowerCase()
    if (!portalHost) throw new Error('BITRIX_SSO_PORTAL_NO_CONFIGURADO')

    const controlador = new AbortController()
    const t = setTimeout(() => controlador.abort(), 15000)
    try {
      const res = await fetch(`https://${portalHost}/rest/user.current.json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auth: authId }),
        signal: controlador.signal,
      })
      const json = await res.json()
      if (json.error || !json.result) {
        // No se loguea authId/AUTH_ID en texto plano: es un token de sesión.
        throw new Error(`BITRIX_SSO_AUTH_INVALIDO: ${json.error_description || json.error || 'sin resultado'}`)
      }
      return json.result // { ID, EMAIL, NAME, LAST_NAME, ACTIVE, ... }
    } finally {
      clearTimeout(t)
    }
  }

  return { llamar, guardarTokens, leerTokens, refrescar, tokenVigente, configurado, PORTAL, usuarioActualPorAuthId }
}

// ── Instancia Novonet: mismo comportamiento que antes de este refactor ─────
const novonet = crearBitrixApp({
  portalUrl: process.env.BITRIX_PORTAL_URL,
  clientId: process.env.BITRIX_APP_CLIENT_ID,
  clientSecret: process.env.BITRIX_APP_CLIENT_SECRET,
})

module.exports = { crearBitrixApp, ...novonet }
```

- [ ] **Step 2: Verificar sintaxis**

Run: `node --check backend/src/services/bitrixApp.service.js`
Expected: sin salida (sin errores).

- [ ] **Step 3: Confirmar que el export sigue teniendo las mismas claves que antes**

Run:
```bash
cd backend && node -e "
const m = require('./src/services/bitrixApp.service')
const esperadas = ['llamar','guardarTokens','leerTokens','refrescar','tokenVigente','configurado','PORTAL','usuarioActualPorAuthId','crearBitrixApp']
const faltan = esperadas.filter(k => typeof m[k] === 'undefined')
console.log(faltan.length ? 'FALTAN: ' + faltan.join(',') : 'OK: estan todas las claves')
"
```
Expected: `OK: estan todas las claves`

- [ ] **Step 4: Commit**

```bash
git add backend/src/services/bitrixApp.service.js
git commit -m "refactor(wabot): bitrixApp.service en fabrica por portal, compat con Novonet"
```

---

### Task 2: `bitrixConnector.service.js` → fábrica compatible con Novonet

**Files:**
- Modify: `backend/src/services/bitrixConnector.service.js`

**Interfaces:**
- Consumes: una instancia de `bitrixApp` como la que produce
  `crearBitrixApp` de la Task 1 (necesita `.llamar(metodo, params)`).
- Produces: `crearBitrixConnector({ bitrixApp, connectorId, connectorName,
  baseUrl })` → objeto `{ CONNECTOR_ID, registrar, activar, listarCanales,
  fijarDatos, enviarAOpenLine, marcarEntregado, renombrarChat }`.
- El `module.exports` sigue teniendo esas mismas claves para Novonet, más
  `crearBitrixConnector`.

- [ ] **Step 1: Reescribir el archivo completo**

Reemplazar TODO el contenido de
`backend/src/services/bitrixConnector.service.js` por:

```js
/**
 * WABOT-BITRIX — Conector de Canales Abiertos (fábrica por portal)
 * ---------------------------------------------------------------------------
 * Esto es lo que hace Wazzup por dentro: registra un conector propio en
 * Bitrix24 para que las conversaciones de WhatsApp aparezcan NATIVAS dentro
 * del CRM (en la negociación, en el contacto, en el chat del asesor).
 *
 * Flujo de alta, una sola vez por portal:
 *   registrar()  -> imconnector.register
 *   activar(N)   -> imconnector.activate  (por cada canal abierto que se use)
 *
 * Flujo por mensaje:
 *   ENTRANTE  WhatsApp -> BaileysManager -> enviarAOpenLine()
 *   SALIENTE  Bitrix   -> evento OnImConnectorMessageAdd -> bitrixConnector.controller
 *
 * IMPORTANTE SOBRE CANTIDAD DE CANALES
 * 30 líneas de WhatsApp NO necesitan 30 canales abiertos. Un mismo conector se
 * activa en varios canales, y varias líneas pueden entregar al MISMO canal: de
 * qué número entró se distingue por el nombre del chat y por chat.id. Se usan
 * canales distintos solo cuando querés colas o reglas de asignación distintas
 * (ej. ARTS a un equipo y VIDIKA a otro). Eso baja el costo de licencia.
 *
 * ESTE ARCHIVO ES UNA FÁBRICA: `crearBitrixConnector(cfg)` arma un conector
 * para UN portal (recibe la instancia de `bitrixApp` de ese portal). Se sigue
 * exportando, además, una instancia lista para Novonet, para que ningún
 * archivo existente tenga que cambiar.
 */
const pool = require('../config/db')

// SVG inline en Data URI — imconnector.register lo exige así, no acepta URL.
const ICONO = {
  DATA_IMAGE: 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">' +
    '<path fill="#25D366" d="M12 2a10 10 0 00-8.6 15L2 22l5.1-1.3A10 10 0 1012 2zm0 18a8 8 0 01-4.1-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8 8 0 1112 20z"/>' +
    '</svg>'
  ),
  COLOR: '#25D366',
}

// Bitrix rechaza nombres con dígitos o símbolos: solo letras, espacios,
// guiones y apóstrofes. Un nombre inválido tumba el mensaje entero.
function _limpiarNombre(s) {
  return String(s || '').replace(/[^\p{L} \-']/gu, '').trim().slice(0, 25)
}

// El mapeo es para trazabilidad y acuses; no depende del portal.
async function _guardarMapeo({ waMsgId, bitrixMsgId, direction, chatId }) {
  if (!waMsgId && !bitrixMsgId) return
  try {
    const conv = await pool.query(
      'SELECT id FROM conversations WHERE bitrix_chat_id = $1 LIMIT 1', [chatId]
    )
    await pool.query(
      `INSERT INTO bitrix_message_map (conversation_id, wa_msg_id, bitrix_msg_id, direction)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (wa_msg_id) WHERE wa_msg_id IS NOT NULL DO NOTHING`,
      [conv.rows[0]?.id || null, waMsgId || null, bitrixMsgId || null, direction]
    )
  } catch (e) {
    console.warn('[bitrixConnector] no se pudo guardar el mapeo de ids:', e.message)
  }
}

function crearBitrixConnector({ bitrixApp, connectorId, connectorName, baseUrl }) {
  const CONNECTOR_ID   = connectorId || 'wabot_bitrix'
  const CONNECTOR_NAME = connectorName || 'WABOT-BITRIX (WhatsApp)'
  const BASE_URL       = (baseUrl || '').replace(/\/+$/, '')

  /** Alta del conector en el portal. Idempotente: re-registrar solo actualiza. */
  async function registrar() {
    if (!BASE_URL) throw new Error('No hay URL pública HTTPS configurada para el handler de este conector')
    return bitrixApp.llamar('imconnector.register', {
      ID: CONNECTOR_ID,
      NAME: CONNECTOR_NAME,
      ICON: ICONO,
      PLACEMENT_HANDLER: `${BASE_URL}/settings`,
    })
  }

  /** Activa el conector en un canal abierto concreto. */
  async function activar(openLineId, activo = true) {
    return bitrixApp.llamar('imconnector.activate', {
      CONNECTOR: CONNECTOR_ID,
      LINE: Number(openLineId),
      ACTIVE: activo ? 1 : 0,
    })
  }

  /** Lista los canales abiertos del portal (para elegir a cuál entregar). */
  async function listarCanales() {
    const ids = await bitrixApp.llamar('imopenlines.config.list.get', {})
    return Array.isArray(ids) ? ids : []
  }

  /** Nombre visible del conector dentro de ese canal. */
  async function fijarDatos(openLineId, datos = {}) {
    return bitrixApp.llamar('imconnector.connector.data.set', {
      CONNECTOR: CONNECTOR_ID,
      LINE: Number(openLineId),
      DATA: { id: CONNECTOR_ID, url_im: BASE_URL, name: CONNECTOR_NAME, ...datos },
    })
  }

  /**
   * Empuja un mensaje ENTRANTE de WhatsApp hacia el canal abierto.
   *
   * `chat.id` es la clave de todo: Bitrix agrupa por ese id, así que tiene que
   * ser estable por conversación. Se usa `${lineId}:${waNumber}` para que el
   * MISMO cliente escribiendo a DOS líneas distintas abra DOS chats distintos —
   * que es justo lo que hace falta para saber por qué número/campaña entró.
   */
  async function enviarAOpenLine({ openLineId, lineId, waNumber, nombre, texto, waMsgId, fechaUnix, archivos = [], nombreChat }) {
    const chatId = `${lineId}:${waNumber}`
    const partes = String(nombre || '').trim().split(/\s+/)

    const mensaje = {
      user: {
        id: `wa_${waNumber}`,
        name: _limpiarNombre(partes[0]) || waNumber,
        last_name: _limpiarNombre(partes.slice(1).join(' ')),
        phone: `+${waNumber}`,
        // El número de WhatsApp ya viene normalizado a E.164 sin '+'; la
        // validación de Bitrix rechaza formatos locales y perderíamos el mensaje.
        skip_phone_validate: 'Y',
      },
      message: {
        id: String(waMsgId || `${chatId}:${Date.now()}`),
        date: Number(fechaUnix || Math.floor(Date.now() / 1000)),
        text: texto || '',
      },
      chat: { id: chatId, name: nombreChat || `WhatsApp ${waNumber}` },
    }
    if (archivos.length) mensaje.message.files = archivos.map((a) => ({ url: a.url, name: a.name }))

    const res = await bitrixApp.llamar('imconnector.send.messages', {
      CONNECTOR: CONNECTOR_ID,
      LINE: Number(openLineId),
      MESSAGES: [mensaje],
    })

    await _guardarMapeo({ waMsgId, bitrixMsgId: mensaje.message.id, direction: 'in', chatId })
    return res
  }

  /** Marca como entregado en Bitrix un mensaje que WhatsApp ya confirmó. */
  async function marcarEntregado({ openLineId, chatId, bitrixMsgIds = [] }) {
    if (!bitrixMsgIds.length) return null
    return bitrixApp.llamar('imconnector.send.status.delivery', {
      CONNECTOR: CONNECTOR_ID,
      LINE: Number(openLineId),
      MESSAGES: [{ chat: { id: chatId }, im: { message_id: bitrixMsgIds } }],
    })
  }

  /** Renombra el chat — así el asesor ve de qué campaña/línea vino. */
  async function renombrarChat({ openLineId, chatId, nombre }) {
    return bitrixApp.llamar('imconnector.chat.name.set', {
      CONNECTOR: CONNECTOR_ID,
      LINE: Number(openLineId),
      CHAT: { id: chatId, name: nombre },
    })
  }

  return {
    CONNECTOR_ID,
    registrar, activar, listarCanales, fijarDatos,
    enviarAOpenLine, marcarEntregado, renombrarChat,
  }
}

// ── Instancia Novonet: mismo comportamiento que antes de este refactor ─────
const bitrixAppNovonet = require('./bitrixApp.service')
const novonet = crearBitrixConnector({
  bitrixApp: bitrixAppNovonet,
  connectorId: process.env.BITRIX_CONNECTOR_ID,
  connectorName: process.env.BITRIX_CONNECTOR_NAME,
  baseUrl: process.env.BITRIX_APP_BASE_URL,
})

module.exports = { crearBitrixConnector, ...novonet }
```

Nota: el `PLACEMENT_HANDLER` original era
`` `${BASE_URL}/api/bitrix-connector/settings` ``. Como ahora `BASE_URL` es
solo la URL pública del backend (sin el prefijo de ruta), este archivo
arma `` `${BASE_URL}/settings` `` y es la instancia de arriba (Task 3) la
que arma el `BASE_URL` completo ya incluyendo el prefijo — ver Task 3.

- [ ] **Step 2: Verificar sintaxis**

Run: `node --check backend/src/services/bitrixConnector.service.js`
Expected: sin salida.

- [ ] **Step 3: Confirmar que el export sigue teniendo las mismas claves que antes**

Run:
```bash
cd backend && node -e "
const m = require('./src/services/bitrixConnector.service')
const esperadas = ['CONNECTOR_ID','registrar','activar','listarCanales','fijarDatos','enviarAOpenLine','marcarEntregado','renombrarChat','crearBitrixConnector']
const faltan = esperadas.filter(k => typeof m[k] === 'undefined')
console.log(faltan.length ? 'FALTAN: ' + faltan.join(',') : 'OK: estan todas las claves')
"
```
Expected: `OK: estan todas las claves`

- [ ] **Step 4: Commit**

```bash
git add backend/src/services/bitrixConnector.service.js
git commit -m "refactor(wabot): bitrixConnector.service en fabrica por portal, compat con Novonet"
```

---

### Task 3: `bitrixPortales.js` — instancia de Velsa + helper de empresa

**Files:**
- Create: `backend/src/services/bitrixPortales.js`

**Interfaces:**
- Consumes: `crearBitrixApp` (Task 1), `crearBitrixConnector` (Task 2).
- Produces: `{ bitrixApp: { novonet, velsa }, conector: { novonet, velsa },
  empresaDeLinea(lineId) }` — `empresaDeLinea` devuelve `'NOVONET'`,
  `'VELSA'` o `null`.

- [ ] **Step 1: Crear el archivo**

```js
/**
 * Registro de portales de Bitrix conectados a WABOT-BITRIX.
 * ---------------------------------------------------------------------------
 * Novonet usa las instancias "de compatibilidad" que ya exportan
 * bitrixApp.service.js y bitrixConnector.service.js (leen las variables de
 * entorno de siempre — cero cambios de comportamiento). Velsa es una
 * instancia nueva, con sus propias variables de entorno.
 */
const pool = require('../config/db')
const { crearBitrixApp } = require('./bitrixApp.service')
const { crearBitrixConnector } = require('./bitrixConnector.service')

const bitrixApp = {
  novonet: require('./bitrixApp.service'),
  velsa: crearBitrixApp({
    portalUrl: process.env.BITRIX_PORTAL_URL_VELSA,
    clientId: process.env.BITRIX_APP_CLIENT_ID_VELSA,
    clientSecret: process.env.BITRIX_APP_CLIENT_SECRET_VELSA,
  }),
}

// La URL pública del handler incluye el prefijo de ruta propio de cada
// portal — ver la nota al final de bitrixConnector.service.js (Task 2).
const BASE_URL_NOVONET = (process.env.BITRIX_APP_BASE_URL || '').replace(/\/+$/, '') + '/api/bitrix-connector'
const BASE_URL_VELSA   = (process.env.BITRIX_APP_BASE_URL_VELSA || process.env.BITRIX_APP_BASE_URL || '').replace(/\/+$/, '') + '/api/bitrix-connector-velsa'

const conector = {
  novonet: require('./bitrixConnector.service'),
  velsa: crearBitrixConnector({
    bitrixApp: bitrixApp.velsa,
    connectorId: process.env.BITRIX_CONNECTOR_ID_VELSA || process.env.BITRIX_CONNECTOR_ID,
    connectorName: process.env.BITRIX_CONNECTOR_NAME_VELSA || 'WABOT-BITRIX Velsa (WhatsApp)',
    baseUrl: BASE_URL_VELSA,
  }),
}

/**
 * Empresa dueña de una línea de WhatsApp ('NOVONET' | 'VELSA' | null).
 * Reutiliza el mismo join que ya usa wa_lines.controller.js
 * (lines.created_by -> usuarios.empresa). Una línea sin created_by (huérfana)
 * devuelve null — hoy ese caso se trata igual que Novonet en el resto del
 * ERP, así que quien use esto debe decidir el mismo fallback.
 */
async function empresaDeLinea(lineId) {
  const r = await pool.query(
    `SELECT UPPER(u.empresa) AS empresa
     FROM lines l LEFT JOIN usuarios u ON l.created_by = u.id
     WHERE l.id = $1`,
    [lineId]
  )
  return r.rows[0]?.empresa || null
}

module.exports = { bitrixApp, conector, empresaDeLinea }
```

Nota sobre `BASE_URL_NOVONET`: queda definida por completitud/documentación
pero no se usa en este plan (Novonet sigue usando su propia instancia de
`bitrixConnector.service.js`, que arma su `BASE_URL` directo de
`BITRIX_APP_BASE_URL` sin pasar por este archivo). No hace falta borrarla,
pero si un linter de "variable no usada" se queja, se puede quitar sin
romper nada.

- [ ] **Step 2: Verificar sintaxis**

Run: `node --check backend/src/services/bitrixPortales.js`
Expected: sin salida.

- [ ] **Step 3: Commit**

```bash
git add backend/src/services/bitrixPortales.js
git commit -m "feat(wabot): registro de portales Bitrix (Novonet/Velsa) y helper empresaDeLinea"
```

---

### Task 4: `bitrixConnector.controller.js` → fábrica compatible con Novonet

**Files:**
- Modify: `backend/src/controllers/bitrixConnector.controller.js`

**Interfaces:**
- Consumes: una instancia de `bitrixApp` (Task 1) y una de `conector`
  (Task 2).
- Produces: `crearControladorBitrixConnector({ bitrixApp, conector, appToken
  })` → objeto `{ install, settings, events, placementInbox,
  registrarConector, listarCanales, activarCanal, estado }`.
- El `module.exports` sigue teniendo esas mismas claves para Novonet, más
  `crearControladorBitrixConnector`. `bitrixConnector.routes.js` (Novonet)
  **no cambia**.

- [ ] **Step 1: Reescribir el archivo completo**

Reemplazar TODO el contenido de
`backend/src/controllers/bitrixConnector.controller.js` por:

```js
/**
 * WABOT-BITRIX — endpoints públicos que consume Bitrix24 (fábrica por portal)
 * ---------------------------------------------------------------------------
 *  POST .../install   Bitrix llama acá al instalar la app local. Trae los
 *                      tokens OAuth.
 *  POST .../events     Bitrix avisa acá cuando un asesor escribe desde el
 *                      CRM -> va a WhatsApp.
 *  GET  .../settings   Iframe de configuración (placement).
 *
 * Los tres son PÚBLICOS (sin verificarToken): los llama Bitrix, no el
 * frontend. La autenticidad se valida con application_token, que Bitrix
 * manda en cada request y es el único secreto compartido que tenemos con
 * el portal (cada portal tiene el suyo, por eso `appToken` es parámetro de
 * la fábrica, no una constante única).
 *
 * ESTE ARCHIVO ES UNA FÁBRICA: `crearControladorBitrixConnector(cfg)` arma
 * el controlador para UN portal. Se sigue exportando, además, el
 * controlador de Novonet listo para usar, para que
 * bitrixConnector.routes.js no tenga que cambiar.
 */
const crypto = require('crypto')
const pool = require('../config/db')

const FRONTEND_URL = (process.env.ERP_FRONTEND_URL || 'https://erp-frontend-v1.onrender.com').replace(/\/+$/, '')

function paginaRedirect(destino) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;background:#fff">
<script>window.location.replace(${JSON.stringify(destino)});</script>
<noscript><a href="${destino}">Abrir WABOT Inbox</a></noscript>
</body></html>`
}

function crearControladorBitrixConnector({ bitrixApp, conector, appToken }) {
  /** Bitrix manda application_token en cada evento; sin él no se procesa nada. */
  function tokenValido(req) {
    if (!appToken) return false
    const b = req.body || {}
    const t = b.auth?.application_token || b.application_token || b.APPLICATION_TOKEN || ''
    return t === appToken
  }

  // ── Instalación de la app local ───────────────────────────────────────
  async function install(req, res) {
    try {
      const b = req.body || {}
      const auth = b.auth || b
      if (!auth.access_token || !auth.refresh_token) {
        return res.status(400).send('Faltan tokens en el callback de instalación')
      }
      await bitrixApp.guardarTokens({
        access_token: auth.access_token,
        refresh_token: auth.refresh_token,
        expires_in: auth.expires_in || 3600,
        member_id: auth.member_id,
        scope: auth.scope,
      })
      console.log('[WABOT-BITRIX] App local instalada; tokens OAuth guardados. portal=%s', bitrixApp.PORTAL)
      // Bitrix espera HTML: este iframe es lo que ve el admin al instalar.
      res.set('Content-Type', 'text/html; charset=utf-8')
      return res.send('<html><body style="font-family:system-ui;padding:24px">'
        + '<h3>WABOT-BITRIX instalado</h3>'
        + '<p>Los tokens quedaron guardados. Ahora registra el conector desde el ERP.</p>'
        + '</body></html>')
    } catch (e) {
      console.error('[WABOT-BITRIX] install falló:', e.message)
      return res.status(500).send('Error en la instalación: ' + e.message)
    }
  }

  // ── Placement embebido (pestaña "WABOT" en el Deal) ─────────────────────
  // Bitrix abre los placements con POST, y el frontend (sitio estático) no
  // sabe responder POST -> devuelve vacío y la pestaña sale en blanco. Esta
  // ruta sí responde (GET y POST).
  //
  // Además hace el SSO: Bitrix manda AUTH_ID (la sesión del asesor que abrió
  // la pestaña). Con eso se le pregunta A BITRIX quién es de verdad
  // (user.current) — nunca se confía en un email o id que venga del cliente.
  // Si el correo de Bitrix coincide con un usuario ACTIVO del ERP, se emite un
  // código de un solo uso (60s de vida) y se redirige al embed del frontend
  // con ese código — jamás con el JWT real en la URL. Si algo falla o no
  // coincide, cae de forma segura al login manual normal.
  async function placementInbox(req, res) {
    res.set('Content-Type', 'text/html; charset=utf-8')
    const irALoginManual = () => res.send(paginaRedirect(`${FRONTEND_URL}/whatsapp/inbox`))

    try {
      const b = (req.body && Object.keys(req.body).length) ? req.body : (req.query || {})
      const authId = b.AUTH_ID || b.auth_id

      console.log('[WABOT-BITRIX] placementInbox llamado. portal=%s method=%s tieneAuthId=%s', bitrixApp.PORTAL, req.method, !!authId)

      if (!authId) {
        console.warn('[WABOT-BITRIX] placementInbox sin AUTH_ID, cae a login manual')
        return irALoginManual()
      }

      // 1) Confirmar identidad real contra Bitrix (nunca confiar en el cliente)
      const usuarioBitrix = await bitrixApp.usuarioActualPorAuthId(authId)
      const email = String(usuarioBitrix.EMAIL || '').trim().toLowerCase()
      if (!email) { console.warn('[WABOT-BITRIX] SSO: user.current sin EMAIL'); return irALoginManual() }

      // 2) Ese correo debe pertenecer a un usuario del ERP, activo
      const r = await pool.query(
        `SELECT id FROM usuarios WHERE LOWER(correo) = $1 AND activo = 'SI' LIMIT 1`,
        [email]
      )
      if (r.rows.length === 0) {
        console.warn('[WABOT-BITRIX] SSO: sin usuario ERP activo para ese correo de Bitrix')
        return irALoginManual()
      }
      const usuarioId = r.rows[0].id

      // 3) Código de un solo uso, vida corta: el frontend lo canjea por el JWT
      //    real en /api/auth/bitrix-exchange. El JWT nunca viaja en la URL.
      const code = crypto.randomBytes(32).toString('hex')
      await pool.query(
        `INSERT INTO bitrix_sso_codes (code, usuario_id, expires_at)
         VALUES ($1, $2, NOW() + INTERVAL '60 seconds')`,
        [code, usuarioId]
      )

      // 4) ID de la negociación desde la que se abrió la pestaña: Bitrix lo manda
      //    en PLACEMENT_OPTIONS (JSON) para el placement CRM_DEAL_DETAIL_TAB. NO
      //    es un dato sensible -- solo le dice al Inbox qué conversación filtrar;
      //    la identidad y el acceso a los chats los sigue decidiendo el backend
      //    con el JWT real (el code de arriba), nunca este ID. Si el formato no
      //    calza por lo que sea, se sigue de largo sin deal_id y cae al Inbox
      //    completo de siempre -- nunca rompe el login.
      let dealId = ''
      try {
        const opts = typeof b.PLACEMENT_OPTIONS === 'string' ? JSON.parse(b.PLACEMENT_OPTIONS) : b.PLACEMENT_OPTIONS
        dealId = String(opts?.ID || opts?.ENTITY_ID || opts?.entityId || b.ENTITY_ID || '').trim()
        if (!/^[1-9]\d{0,14}$/.test(dealId)) dealId = ''
      } catch (_) { /* sin deal_id -> Inbox completo, comportamiento de siempre */ }

      const qsDeal = dealId ? `&deal_id=${encodeURIComponent(dealId)}` : ''
      return res.send(paginaRedirect(`${FRONTEND_URL}/embed/inbox?code=${code}${qsDeal}`))
    } catch (e) {
      console.error('[WABOT-BITRIX] placementInbox SSO falló, cae a login manual:', e.message)
      return irALoginManual()
    }
  }

  // ── Iframe de configuración del conector ──────────────────────────────
  async function settings(req, res) {
    res.set('Content-Type', 'text/html; charset=utf-8')
    return res.send('<html><body style="font-family:system-ui;padding:24px">'
      + '<h3>WABOT-BITRIX</h3><p>Las líneas de WhatsApp se administran desde el ERP, en el módulo WhatsApp.</p>'
      + '</body></html>')
  }

  /**
   * Un asesor escribió desde el CRM -> hay que mandarlo por WhatsApp.
   * chat.id viene como `${lineId}:${waNumber}`, que es como lo armamos al
   * empujar el mensaje entrante en bitrixConnector.service.
   */
  async function _procesarSaliente(body, manager) {
    const data = body.data || {}
    const mensajes = data.MESSAGES || data.messages || []

    for (const m of mensajes) {
      const chatId = String(m.chat?.id || '')
      const texto  = m.message?.text || ''
      const sep = chatId.indexOf(':')
      if (sep < 0) { console.warn('[WABOT-BITRIX] chat.id con formato inesperado:', chatId); continue }

      const lineId   = chatId.slice(0, sep)
      const waNumber = chatId.slice(sep + 1)
      if (!texto.trim()) continue

      if (!manager) { console.error('[WABOT-BITRIX] BaileysManager no disponible; mensaje no enviado'); continue }
      try {
        await manager.sendText(lineId, waNumber, texto)
        const linea = await pool.query('SELECT open_line_id FROM lines WHERE id = $1', [lineId])
        const openLineId = linea.rows[0]?.open_line_id
        if (openLineId && m.im?.message_id) {
          await conector.marcarEntregado({ openLineId, chatId, bitrixMsgIds: [m.im.message_id] })
        }
      } catch (e) {
        console.error(`[WABOT-BITRIX] no se pudo enviar a ${waNumber} por la línea ${lineId}:`, e.message)
      }
    }
  }

  // ── Eventos de Bitrix (mensaje saliente del asesor) ─────────────────────
  async function events(req, res) {
    // Se responde 200 SIEMPRE y lo antes posible: Bitrix reintenta ante un no-200
    // y un reintento acá significa mandarle el mensaje dos veces al cliente.
    // El trabajo real va después de responder.
    const b = req.body || {}
    const evento = b.event || ''
    if (!tokenValido(req)) {
      console.warn('[WABOT-BITRIX] evento con application_token invalido, descartado:', evento)
      return res.status(401).json({ ok: false })
    }

    // Bitrix llama a esta MISMA ruta cuando alguien ABRE la app desde el menu:
    // no trae 'event', trae AUTH_ID/REFRESH_ID sueltos (son el access/refresh
    // token). Se aprovecha para guardar o refrescar los tokens OAuth cada vez
    // que alguien abre la app, sin depender de que el install inicial funcionara.
    if (!evento && b.AUTH_ID && b.REFRESH_ID) {
      try {
        await bitrixApp.guardarTokens({
          access_token: b.AUTH_ID,
          refresh_token: b.REFRESH_ID,
          expires_in: b.AUTH_EXPIRES || 3600,
          member_id: b.member_id,
          scope: b.APPLICATION_SCOPE,
        })
        console.log('[WABOT-BITRIX] Tokens OAuth guardados/refrescados desde la apertura de la app. portal=%s', bitrixApp.PORTAL)
      } catch (e) {
        console.error('[WABOT-BITRIX] no se pudo guardar tokens al abrir la app:', e.message)
      }
      res.set('Content-Type', 'text/html; charset=utf-8')
      return res.send('<html><body style="font-family:system-ui;padding:24px">'
        + '<h3>WABOT-BITRIX</h3><p>La app esta activa. Las lineas de WhatsApp se administran desde el ERP.</p>'
        + '</body></html>')
    }

    res.json({ ok: true })

    try {
      if (evento === 'ONIMCONNECTORMESSAGEADD') {
        await _procesarSaliente(b, req.app.get('baileysManager'))
      } else if (evento === 'ONAPPUNINSTALL') {
        await pool.query('DELETE FROM bitrix_oauth_tokens WHERE portal = $1', [bitrixApp.PORTAL])
        console.warn('[WABOT-BITRIX] la app fue desinstalada del portal; tokens borrados. portal=%s', bitrixApp.PORTAL)
      }
    } catch (e) {
      console.error(`[WABOT-BITRIX] error procesando ${evento}:`, e.message)
    }
  }

  // ── Administración (sí llevan verificarToken en las rutas) ─────────────
  async function registrarConector(req, res) {
    try { return res.json({ success: true, data: await conector.registrar() }) }
    catch (e) { return res.status(500).json({ success: false, message: e.message }) }
  }

  async function listarCanales(req, res) {
    try { return res.json({ success: true, canales: await conector.listarCanales() }) }
    catch (e) { return res.status(500).json({ success: false, message: e.message }) }
  }

  async function activarCanal(req, res) {
    try {
      const openLineId = Number(req.body.open_line_id)
      if (!openLineId) return res.status(400).json({ success: false, message: 'Falta open_line_id' })
      await conector.activar(openLineId, true)
      await conector.fijarDatos(openLineId)
      return res.json({ success: true })
    } catch (e) { return res.status(500).json({ success: false, message: e.message }) }
  }

  async function estado(req, res) {
    try {
      const tokens = await bitrixApp.leerTokens()
      return res.json({
        success: true,
        configurada: bitrixApp.configurado(),
        instalada: !!tokens,
        portal: bitrixApp.PORTAL || null,
        conector: conector.CONNECTOR_ID,
      })
    } catch (e) { return res.status(500).json({ success: false, message: e.message }) }
  }

  return { install, settings, events, placementInbox, registrarConector, listarCanales, activarCanal, estado }
}

// ── Instancia Novonet: mismo comportamiento que antes de este refactor ─────
const bitrixApp = require('../services/bitrixApp.service')
const conector = require('../services/bitrixConnector.service')
const controladorNovonet = crearControladorBitrixConnector({
  bitrixApp, conector, appToken: process.env.BITRIX_APP_TOKEN,
})

module.exports = { crearControladorBitrixConnector, ...controladorNovonet }
```

- [ ] **Step 2: Verificar sintaxis**

Run: `node --check backend/src/controllers/bitrixConnector.controller.js`
Expected: sin salida.

- [ ] **Step 3: Confirmar que el export sigue teniendo las mismas claves que antes**

Run:
```bash
cd backend && node -e "
const m = require('./src/controllers/bitrixConnector.controller')
const esperadas = ['install','settings','events','placementInbox','registrarConector','listarCanales','activarCanal','estado','crearControladorBitrixConnector']
const faltan = esperadas.filter(k => typeof m[k] === 'undefined')
console.log(faltan.length ? 'FALTAN: ' + faltan.join(',') : 'OK: estan todas las claves')
"
```
Expected: `OK: estan todas las claves`

- [ ] **Step 4: Commit**

```bash
git add backend/src/controllers/bitrixConnector.controller.js
git commit -m "refactor(wabot): bitrixConnector.controller en fabrica por portal, compat con Novonet"
```

---

### Task 5: Controlador y rutas nuevos para Velsa

**Files:**
- Create: `backend/src/controllers/bitrixConnectorVelsa.controller.js`
- Create: `backend/src/routes/bitrixConnectorVelsa.routes.js`

**Interfaces:**
- Consumes: `crearControladorBitrixConnector` (Task 4),
  `bitrixPortales.js` (Task 3).
- Produces: un router de Express montable en `/api/bitrix-connector-velsa`.

- [ ] **Step 1: Crear el controlador de Velsa**

```js
// backend/src/controllers/bitrixConnectorVelsa.controller.js
//
// Mismo controlador que Novonet (misma lógica, ver bitrixConnector.controller.js),
// pero atado a la instancia de Velsa. No duplica código: usa la fábrica.
const { crearControladorBitrixConnector } = require('./bitrixConnector.controller')
const { bitrixApp, conector } = require('../services/bitrixPortales')

module.exports = crearControladorBitrixConnector({
  bitrixApp: bitrixApp.velsa,
  conector: conector.velsa,
  appToken: process.env.BITRIX_APP_TOKEN_VELSA,
})
```

- [ ] **Step 2: Verificar sintaxis**

Run: `node --check backend/src/controllers/bitrixConnectorVelsa.controller.js`
Expected: sin salida.

- [ ] **Step 3: Crear las rutas de Velsa**

```js
// backend/src/routes/bitrixConnectorVelsa.routes.js
//
// Mismas rutas que bitrixConnector.routes.js (Novonet), montadas bajo
// /api/bitrix-connector-velsa en app.js, apuntando al controlador de Velsa.
const express = require('express')
const router = express.Router()
const {
  install, settings, events, placementInbox,
  registrarConector, listarCanales, activarCanal, estado,
} = require('../controllers/bitrixConnectorVelsa.controller')
const { verificarToken, noAsesor } = require('../middleware/auth')

// Públicas: las llama Bitrix24, no el frontend. Se autentican con
// application_token, que se valida dentro del controlador.
router.post('/install',  install)
router.get('/install',   install)
router.post('/events',   events)
router.get('/settings',  settings)
router.post('/settings', settings)
router.get('/placement-inbox',  placementInbox)
router.post('/placement-inbox', placementInbox)

// Administración desde el ERP.
router.get('/estado',    verificarToken, estado)
router.get('/canales',   verificarToken, listarCanales)
router.post('/registrar', verificarToken, noAsesor, registrarConector)
router.post('/activar',   verificarToken, noAsesor, activarCanal)

module.exports = router
```

- [ ] **Step 4: Verificar sintaxis**

Run: `node --check backend/src/routes/bitrixConnectorVelsa.routes.js`
Expected: sin salida.

- [ ] **Step 5: Commit**

```bash
git add backend/src/controllers/bitrixConnectorVelsa.controller.js backend/src/routes/bitrixConnectorVelsa.routes.js
git commit -m "feat(wabot-velsa): controlador y rutas de WABOT-BITRIX para el portal de Velsa"
```

---

### Task 6: Montar las rutas de Velsa en `app.js`

**Files:**
- Modify: `backend/src/app.js`

**Interfaces:**
- Consumes: `backend/src/routes/bitrixConnectorVelsa.routes.js` (Task 5).

- [ ] **Step 1: Agregar el require**

Buscar la línea (aprox. línea 27):
```js
const bitrixConnectorRoutes        = require('./routes/bitrixConnector.routes');
```
Y agregar justo debajo:
```js
const bitrixConnectorVelsaRoutes   = require('./routes/bitrixConnectorVelsa.routes');
```

- [ ] **Step 2: Extender la excepción de X-Frame-Options**

Buscar (aprox. línea 89):
```js
  if (!req.path.startsWith('/api/bitrix-connector/install') && !req.path.startsWith('/api/bitrix-connector/settings') && !req.path.startsWith('/api/bitrix-connector/placement-inbox')) {
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  }
```
Y reemplazar por:
```js
  const esEmbedBitrixSinFrameOptions = [
    '/api/bitrix-connector/install', '/api/bitrix-connector/settings', '/api/bitrix-connector/placement-inbox',
    '/api/bitrix-connector-velsa/install', '/api/bitrix-connector-velsa/settings', '/api/bitrix-connector-velsa/placement-inbox',
  ].some((p) => req.path.startsWith(p));
  if (!esEmbedBitrixSinFrameOptions) {
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  }
```

- [ ] **Step 3: Montar la ruta nueva**

Buscar (aprox. línea 167):
```js
app.use('/api/bitrix-connector', bitrixConnectorRoutes); // WABOT-BITRIX: install/events del conector imconnector
```
Y agregar justo debajo:
```js
app.use('/api/bitrix-connector-velsa', bitrixConnectorVelsaRoutes); // WABOT-BITRIX Velsa: mismo modulo, portal aclopecuador.bitrix24.es
```

- [ ] **Step 4: Verificar sintaxis**

Run: `node --check backend/src/app.js`
Expected: sin salida.

- [ ] **Step 5: Commit**

```bash
git add backend/src/app.js
git commit -m "feat(wabot-velsa): montar /api/bitrix-connector-velsa en app.js"
```

---

### Task 7: Verificación final

**Files:** (ninguno nuevo — revisión de todo lo anterior)

- [ ] **Step 1: Verificar sintaxis de todos los archivos tocados/creados en un solo comando**

Run:
```bash
cd backend && for f in \
  src/services/bitrixApp.service.js \
  src/services/bitrixConnector.service.js \
  src/services/bitrixPortales.js \
  src/controllers/bitrixConnector.controller.js \
  src/controllers/bitrixConnectorVelsa.controller.js \
  src/routes/bitrixConnectorVelsa.routes.js \
  src/app.js ; do
  node --check "$f" && echo "OK  $f" || echo "FALLO  $f"
done
```
Expected: `OK` para los siete archivos.

- [ ] **Step 2: Revisar el diff completo contra origin/main**

Run: `git diff origin/main --stat` y luego `git diff origin/main` para
leerlo entero — confirmar que NO aparece ningún archivo de Novonet con
cambios de comportamiento (solo refactors mecánicos: nombres de función
movidos adentro de una fábrica, mismo cuerpo).

- [ ] **Step 3: Confirmar que Novonet sigue exportando exactamente lo mismo (smoke test sin tocar la base de datos)**

Run:
```bash
cd backend && node -e "
const app = require('./src/controllers/bitrixConnector.controller')
const app2 = require('./src/controllers/bitrixConnectorVelsa.controller')
console.log('Novonet:', Object.keys(app).sort().join(','))
console.log('Velsa:  ', Object.keys(app2).sort().join(','))
"
```
Expected: ambas líneas muestran las mismas ocho claves
(`activarCanal,estado,events,install,listarCanales,placementInbox,registrarConector,settings`)
— Velsa NO trae `crearControladorBitrixConnector` porque ese archivo hace
`module.exports = crearControladorBitrixConnector(...)` directo, sin spread.

- [ ] **Step 4: Push y avisar a Bryan**

```bash
git push origin wabot-bitrix-velsa-design
```
(o el nombre de rama que se esté usando en ese momento — confirmar con
`git branch --show-current`).

Avisar a Bryan que el código está listo, y recordarle los 3 pasos que le
tocan a él (del spec, sección "Pasos manuales en Bitrix"): crear la app
local en `aclopecuador.bitrix24.es`, asignar los 6 permisos desde el
inicio, y pasar `client_id`/`client_secret` para cargarlos en Render junto
con `BITRIX_PORTAL_URL_VELSA` y `BITRIX_APP_TOKEN_VELSA` (este último lo
define Bryan al crear la app, igual que se hizo con Novonet).
