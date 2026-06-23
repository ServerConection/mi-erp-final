# Servidor de almacenamiento local (ERP)

Servicio pequeño que corre en **tu servidor local** (no en Render) y guarda los
archivos del ERP (cédulas, carnets, resúmenes de venta, documentos de TTHH)
en disco, organizados por carpeta de cliente/asesor. El backend principal
(Render) le habla solo a través de una API key — nunca se expone directo a
navegadores ni a internet sin autenticación.

## 1. Instalación

```bash
cd local-storage-server
npm install
cp .env.example .env
```

Edita `.env`:

```
PORT=4500
API_KEY=<genera una clave larga, ej: openssl rand -hex 32>
STORAGE_DIR=./storage
```

Genera la clave en PowerShell:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## 2. Ejecutar

```bash
npm start
```

Deberías ver:

```
[STORAGE] Servicio de almacenamiento local escuchando en http://localhost:4500
[STORAGE] Carpeta de almacenamiento: C:\...\local-storage-server\storage
```

Para que siga corriendo aunque cierres la consola, usa [pm2](https://pm2.keymetrics.io/):

```bash
npm install -g pm2
pm2 start server.js --name storage-local
pm2 save
pm2 startup   # configura inicio automático con Windows/servicio
```

## 3. Exponerlo a internet con Cloudflare Tunnel

Render necesita una URL pública HTTPS para llegar a este servicio. Cloudflare
Tunnel crea esa URL sin que tengas que abrir puertos en tu router ni tener IP
fija.

### Instalar cloudflared (Windows)

Descarga el instalador desde:
https://github.com/cloudflare/cloudflared/releases (archivo `cloudflared-windows-amd64.exe`)

O con winget:

```powershell
winget install --id Cloudflare.cloudflared
```

### Opción rápida (URL temporal, para probar)

```powershell
cloudflared tunnel --url http://localhost:4500
```

Esto imprime una URL tipo `https://algo-aleatorio.trycloudflare.com`. Sirve
para probar, pero **cambia cada vez que reinicias el comando** — no es para
producción.

### Opción estable (URL fija, recomendada para producción)

1. Inicia sesión:
   ```powershell
   cloudflared tunnel login
   ```
   (te abre el navegador para autorizar contra tu cuenta/dominio de Cloudflare)

2. Crea el túnel:
   ```powershell
   cloudflared tunnel create erp-storage
   ```

3. Crea `config.yml` (ej. en `C:\cloudflared\config.yml`):
   ```yaml
   tunnel: erp-storage
   credentials-file: C:\Users\<tu_usuario>\.cloudflared\<TUNNEL_ID>.json

   ingress:
     - hostname: storage.tudominio.com
       service: http://localhost:4500
     - service: http_status:404
   ```

4. Enruta el subdominio (requiere tener un dominio en Cloudflare):
   ```powershell
   cloudflared tunnel route dns erp-storage storage.tudominio.com
   ```

5. Corre el túnel como servicio:
   ```powershell
   cloudflared service install
   ```

   Esto deja `https://storage.tudominio.com` apuntando siempre a tu
   `localhost:4500`, incluso si tu IP de internet cambia.

Si no tienes dominio propio, usa la opción rápida (`trycloudflare.com`) pero
ten en cuenta que la URL cambia con cada reinicio — tendrías que actualizar
`STORAGE_SERVER_URL` en Render cada vez. Para producción real, lo recomendado
es comprar/usar un dominio en Cloudflare y la opción estable.

## 4. Configurar el backend principal (Render)

En las variables de entorno de Render, agrega:

```
STORAGE_SERVER_URL=https://storage.tudominio.com
STORAGE_API_KEY=<la misma clave que pusiste en API_KEY aquí>
```

El backend usará esto para subir y leer archivos a través de
`backend/src/utils/storageClient.js`.

## 5. Verificar que funciona

```bash
curl https://storage.tudominio.com/health
```

Debe responder `{"ok":true,"ts":...}`. Este endpoint no requiere API key
(solo confirma que el servicio está vivo).

## Notas de seguridad

- Este servicio **nunca** debe ser llamado directamente desde el navegador
  del usuario final — solo el backend de Render lo consume (server-to-server),
  usando la API key como `x-api-key` en cada request.
- Los nombres de carpeta/archivo se validan estrictamente (solo letras,
  números, puntos, guiones) para evitar path traversal (`../../etc/passwd`).
- Los permisos de "quién puede ver qué archivo" los sigue controlando el
  backend principal (`verificarToken`, `noAsesor`, `soloTTHH`) — este servicio
  solo sabe "tengo la API key correcta", no sabe nada de usuarios ni roles.
