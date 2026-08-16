# Fix: "fetch failed" al subir documentos en Nueva Venta

**Fecha:** 16 de agosto de 2026
**Síntoma reportado:** en `/nueva-venta`, sección 8 (Documentos de respaldo), al elegir
una imagen aparece el banner rojo **`fetch failed`** y el archivo no se carga.

---

## 1. Diagnóstico

Reproducido en producción sobre `https://erp-frontend-v1.onrender.com/nueva-venta`:

```
POST https://erp-backend-v1-qhk2.onrender.com/api/envios-ventas/upload
→ 500  {"success":false,"error":"fetch failed"}
```

Descartado con pruebas:

| Hipótesis | Resultado |
|---|---|
| Los `<input type="file">` están rotos o deshabilitados | ❌ Los 4 existen, habilitados, `accept` correcto |
| El backend está caído | ❌ `GET /health` → `{"ok":true}` |
| Falta el token de sesión | ❌ Sin token da 401; aquí da 500 |
| Es el tamaño o el formato del archivo | ❌ Falla igual con un PNG de **70 bytes** |

### Causa raíz

`fetch failed` es el mensaje genérico de **undici** (el `fetch` nativo de Node 18+).
No lo genera el navegador: lo genera **el backend** cuando su propia llamada saliente
falla a nivel de red.

La cadena real es:

```
Navegador ──POST /upload──> Backend (Render)
                              │
                              └──POST ${STORAGE_SERVER_URL}/upload──> local-storage-server
                                                                      (equipo local, vía túnel)
                                          ▲
                                          └── AQUÍ MUERE
```

`backend/src/utils/storageClient.js` reenvía el archivo al **servidor de almacenamiento
local** que corre en el equipo del cliente, expuesto por un túnel. Esa llamada está
fallando, y el mensaje `fetch failed` viajaba tal cual hasta el navegador porque el
`catch` devolvía `err.message` — la causa real vive en `err.cause`, que se descartaba.

Evidencia de apoyo: en `ngrok_tunnels.yml` **no existe ningún túnel para el puerto
4500**, que es donde escucha `local-storage-server`. Solo hay `app3000` (3000) y
`ollama` (11434).

---

## 2. Lo que hay que hacer para que vuelva a funcionar

El código ya no es el bloqueo: el bloqueo es **operativo**. Los tres puntos:

### a) Levantar el servidor de almacenamiento local

```bash
cd local-storage-server
npm install          # obligatorio: se subió multer a 2.x
npm start
```

Debe imprimir:

```
[STORAGE] Servicio de almacenamiento escuchando en http://127.0.0.1:4500
[STORAGE] Bind a loopback: solo accesible desde este equipo (y desde el túnel local). ✅
```

Verifica que `STORAGE_DIR` (hoy `C:\ALMACENAMIENTO_ERP`) exista y tenga permisos de
escritura.

### b) Exponerlo con un túnel

En `ngrok_tunnels.yml` falta la entrada. Añade:

```yaml
  storage:
    proto: http
    addr: 4500
    domain: <tu-dominio-reservado>.ngrok-free.dev
```

> Usa un **dominio reservado**. Con dominio aleatorio, cada reinicio de ngrok cambia
> la URL y el backend en Render se queda apuntando al vacío — que es exactamente el
> fallo de hoy. Cloudflare Tunnel con un subdominio propio es la opción estable.

### c) Configurar el backend en Render

En **Render → erp-backend-v1 → Environment**:

| Variable | Valor |
|---|---|
| `STORAGE_SERVER_URL` | `https://<dominio-del-túnel>` (sin barra final, **https**) |
| `STORAGE_API_KEY` | idéntica a `API_KEY` de `local-storage-server/.env` |

Redeploy. Al arrancar, el log debe mostrar:

```
[STORAGE] Destino configurado: https://<host> (timeout 20000ms, 2 reintentos)
```

Si en cambio ves `⚠️ STORAGE_SERVER_URL / STORAGE_API_KEY no están definidas`,
las variables no llegaron al servicio.

### d) Comprobar

Endpoint nuevo de diagnóstico (perfiles no-asesor):

```
GET /api/envios-ventas/storage-estado
→ { "success": true, "arriba": true, "codigo": "OK", "ms": 180 }
```

Si algo falla, `codigo` dice exactamente qué: `ECONNREFUSED` (servicio local
apagado), `ENOTFOUND` (dominio del túnel mal o cambiado), `ETIMEDOUT` (equipo
apagado), `CERT_HAS_EXPIRED` (TLS), `STORAGE_API_KEY_INVALIDA` (claves
desincronizadas).

---

## 3. Cambios aplicados en el código

### `backend/src/utils/storageClient.js`

- **Causa real en el log.** Se lee `err.cause.code` y se traduce a un mensaje
  accionable en castellano en lugar de propagar `fetch failed`.
- **Timeout de 20 s** por intento (`AbortController`). Antes una petición al túnel
  podía quedarse colgada hasta el timeout de la plataforma.
- **2 reintentos con backoff** solo ante fallos de red. Nunca ante 4xx: un 401 por
  API key mala no mejora reintentando.
- **Se exige `https://`** salvo destino localhost. La API key viaja en una cabecera;
  sobre `http://` plano es interceptable. Escape: `STORAGE_PERMITIR_HTTP=1`.
- **Aviso si `STORAGE_API_KEY` < 24 caracteres.**
- **Separación `message` / `publico`.** Lo que llega al navegador ya no contiene la
  URL del túnel, el host interno ni la clave. La API key se redacta de todo log.
- **`estado()`** nuevo, para el endpoint de diagnóstico.

### `backend/src/utils/fileSignature.js` *(nuevo)*

Validación por **firma binaria (magic bytes)**, sin dependencias.

El `mimetype` de multer sale del `Content-Type` que declara el navegador: es un dato
que controla el cliente y se falsifica con un flag de curl. Confiar en él es
*unrestricted file upload* (**CWE-434 / OWASP A04**). Ahora se lee el encabezado real
del buffer.

Acepta: JPEG, PNG, WEBP, GIF, HEIC/HEIF, PDF. Todo lo demás se rechaza.
Los PDF con contenido activo (`/JavaScript`, `/JS`, `/Launch`, `/EmbeddedFile`,
`/RichMedia`) se rechazan — una cédula escaneada nunca los lleva. Desactivable con
`UPLOAD_PDF_STRICT=0`.

Verificado con 11 casos:

```
ACEPTA   PNG real / JPEG real / WEBP real / HEIC iPhone / PDF limpio
RECHAZA  PDF con JavaScript      → PDF_CON_CONTENIDO_ACTIVO
RECHAZA  PHP renombrado a .png   → FIRMA_DESCONOCIDA
RECHAZA  SVG con onload=alert()  → FIRMA_DESCONOCIDA
RECHAZA  HTML disfrazado         → FIRMA_DESCONOCIDA
RECHAZA  Ejecutable (MZ)         → FIRMA_DESCONOCIDA
RECHAZA  Archivo vacío           → ARCHIVO_VACIO
```

### `backend/src/utils/rateLimit.js` *(nuevo)*

Ventana deslizante en memoria, sin dependencias. Sin límite, una cuenta comprometida
podía llenar el disco del equipo local y saturar el túnel con subidas de 15 MB
(**CWE-770**).
*Limitación:* el contador vive en el proceso; si Render escala a varias instancias, el
límite efectivo se multiplica. Suficiente como primera barrera.

### `backend/src/routes/envios-ventas.routes.js`

- **Validación por firma** antes de reenviar al almacenamiento.
- **Extensión derivada de la firma**, nunca de `originalname`. Se acabó poder dejar
  `cedula.png.php` o `cedula.svg` en el almacén.
- **`carpeta` restringida** a `^[0-9]{1,20}$` o `^temp_[0-9]{1,12}$`.
- **Rate limit**: 30 subidas / 5 min y 200 descargas / 5 min por usuario.
- **Límites de multer** endurecidos: `files: 1`, `fields: 10`, `parts: 15`.
- **Errores con referencia.** Al navegador va un mensaje neutro + un `ref` de 8
  caracteres; el detalle técnico queda solo en el log del servidor. El usuario dice
  "me salió el error `7f3a2b`" y soporte lo localiza, sin filtrar infraestructura.
- **🔴 IDOR corregido (CWE-639).** Antes, *cualquier* usuario autenticado podía leer
  la cédula de *cualquier* cliente si conocía `carpeta/archivo` — y la carpeta es el
  número de cédula, o sea adivinable. Ahora:
  - perfiles no-asesor (backoffice, admin, supervisor, analista): acceso completo,
    que es lo que su función exige;
  - **ASESOR**: solo archivos referenciados en ventas suyas, o que él mismo subió en
    las últimas 12 h (para poder previsualizar antes de guardar la venta).

  Se responde **404, no 403**, para no confirmarle a quien sondea que el archivo
  existe. Desactivable con `ARCHIVO_STRICT_OWNERSHIP=0`.
- **Neutralización de contenido al servir.** El `Content-Type` ya no se copia de la
  respuesta del almacenamiento (dato no confiable): se deriva de la extensión contra
  lista blanca, y lo desconocido baja como `application/octet-stream` + `attachment`.
  Con `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none';
  sandbox` y `X-Frame-Options: DENY`, un archivo malicioso que llegara a colarse no
  puede ejecutar script en el dominio del ERP (**XSS almacenado**).
- **`GET /api/envios-ventas/storage-estado`** para diagnóstico.

### `local-storage-server/server.js`

Este proceso custodia cédulas y datos personales de clientes reales.

- **🔴 Bind a `127.0.0.1` por defecto.** Antes escuchaba en `0.0.0.0`: cualquier
  equipo de la red local podía golpear el puerto 4500 a fuerza bruta contra la API
  key. El túnel corre en la misma máquina, así que nada se rompe. Escape:
  `HOST=0.0.0.0 PERMITIR_BIND_PUBLICO=1`.
- **Comparación de API key en tiempo constante** (`timingSafeEqual` sobre digests).
  `key !== API_KEY` filtra información por tiempo de respuesta (**CWE-208**).
- **Arranque abortado** si la API key mide menos de 24 caracteres.
- **Validación por firma binaria** también aquí (defensa en profundidad: el servicio
  no debe asumir que su único cliente es el backend).
- **Nombre de archivo 100 % generado por el servidor**, con `crypto.randomBytes`
  (antes `Math.random()`, predecible) y extensión derivada de la firma.
- **Escritura con `flag: 'wx'`** (no sobrescribe en silencio) y **`mode: 0o600`**.
- **Contención de ruta con `path.relative`.** `filePath.startsWith(STORAGE_DIR)` tiene
  un fallo conocido: `/almacen` también hace prefijo de `/almacen_publico`.
- **`lstat` en la descarga**: un symlink dentro del almacén ya no se sigue a ciegas.
- **El manejador de errores ya no devuelve `err.message`**, que incluía rutas
  absolutas del disco del cliente.
- Cabeceras de seguridad, `x-powered-by` desactivado, rate limit por IP, 404
  explícito y apagado ordenado (no corta una subida a la mitad).

### `local-storage-server/package.json`

`multer` **1.4.5-lts.1 → ^2.0.1**. La rama 1.x está sin mantenimiento y arrastra
vulnerabilidades de denegación de servicio con peticiones multipart malformadas. La
API es la misma para este uso. **Requiere `npm install`.**

### `frontend/src/pages/NuevaVenta.jsx`

- **El archivo ya no se pierde cuando falla la subida.** Antes el input se limpiaba y
  el asesor tenía que volver a buscarlo en el disco en cada intento. Ahora queda en
  memoria y aparece un botón **🔄 Reintentar subida**.
- **El botón de reintentar solo aparece cuando reintentar sirve** (5xx o 429). Ante un
  415 (archivo rechazado) no se ofrece, porque el mismo archivo va a fallar igual.
- **Validación local previa** de tamaño y tipo, para feedback inmediato.
- **Se muestra la referencia del error** para que el asesor la pueda dictar a soporte.

---

## 4. 🔴 Acción urgente aparte: credencial expuesta en el repositorio

`ngrok_tunnels.yml` **está rastreado por git** y contiene el `authtoken` de ngrok en
texto plano. Cualquiera con acceso al repositorio (o a su historial, aunque el archivo
se borre hoy) puede levantar túneles con esa cuenta.

Pasos, en orden:

1. **Rotar el token ahora** en el panel de ngrok. Rotarlo es lo que corta el riesgo;
   borrar el archivo no.
2. Sacarlo del seguimiento y del repositorio:

   ```bash
   git rm --cached ngrok_tunnels.yml
   # añadir a .gitignore (ya incluido en este cambio)
   git commit -m "seguridad: dejar de rastrear ngrok_tunnels.yml (contenía authtoken)"
   ```

3. Dejar en el repo un `ngrok_tunnels.example.yml` con `authtoken: <PON_EL_TUYO>`.
4. El histórico sigue teniendo el token. Si el repositorio es o fue público, o lo ha
   clonado alguien fuera del equipo, hay que limpiarlo con `git filter-repo` — pero
   **solo después de rotar**.

---

## 5. Pendientes recomendados (no incluidos en este cambio)

| # | Tema | Por qué |
|---|---|---|
| 1 | La carpeta de almacenamiento es el **número de cédula** | El nombre de la carpeta es en sí mismo un dato personal, y es enumerable. Mejor un identificador opaco (HMAC de la cédula) con la relación guardada en BD. |
| 2 | **Cifrado en reposo** de `C:\ALMACENAMIENTO_ERP` | Son cédulas de clientes en un disco de oficina. BitLocker sobre el volumen es el mínimo. |
| 3 | **Retención y borrado** | Hoy nada se borra nunca. Define cuánto tiempo deben vivir estos documentos y automatiza la purga. |
| 4 | **Copia de seguridad** del almacén | Un único disco local sin respaldo es un punto de fallo total para la evidencia documental de las ventas. |
| 5 | El token de sesión vive en `localStorage` | Accesible desde cualquier XSS. Una cookie `httpOnly` + `SameSite` es más resistente. |
| 6 | `npm audit` en backend y frontend | No se revisó en este cambio. |
