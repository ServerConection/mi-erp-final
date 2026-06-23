# 🐳 Guía: Automatizaciones con Docker

> Con esta configuración, las 11 automatizaciones se inician **solas** cada vez que enciendas la PC y Docker Desktop arranque. Ya no necesitas abrir CMD manualmente.

---

## ⚙️ PASO 1 — Configurar Docker Desktop para inicio automático

1. Abre **Docker Desktop**
2. Clic en el ícono ⚙️ **Settings** (arriba a la derecha)
3. Ve a **General**
4. Activa ✅ **Start Docker Desktop when you sign in to your computer**
5. Clic en **Apply & restart**

---

## 📁 PASO 2 — Colocar el archivo en la carpeta correcta

Copia el archivo `docker-compose-automatizaciones.yml` a:

```
C:\Users\Usuario-PC\Desktop\AREA_DESARROLLO\AREA_DESARROLLO\DesarrolloBaseDatos\
```

Y **renómbralo** a simplemente `docker-compose.yml`

---

## 🚀 PASO 3 — Primera vez: levantar todos los servicios

Abre una terminal (CMD o PowerShell) en la carpeta `DesarrolloBaseDatos` y ejecuta:

```bash
docker compose up -d
```

Esto:
- Descarga la imagen `node:20-slim` (una sola vez, ~200 MB)
- Instala las dependencias de cada servicio en Linux
- Arranca los 11 servicios en segundo plano
- Los marca como `restart: always` → se reinician solos con Docker

---

## 📋 COMANDOS DEL DÍA A DÍA

### Ver si todos están corriendo
```bash
docker compose ps
```

### Ver los logs de todos en vivo
```bash
docker compose logs -f
```

### Ver logs de un servicio específico
```bash
docker compose logs -f bitrix-backend
docker compose logs -f ghl-sync-backend
docker compose logs -f jotform-sync
```

### Reiniciar un servicio
```bash
docker compose restart bitrix-backend
```

### Detener todo (sin eliminar)
```bash
docker compose stop
```

### Volver a levantar todo
```bash
docker compose start
```

### Apagar y eliminar contenedores
```bash
docker compose down
```

---

## 🔑 SOBRE LAS VARIABLES DE ENTORNO (.env)

Cada servicio lee su propio archivo `.env` desde su carpeta (ya montada como volumen). **No necesitas cambiar nada.** Tus variables de entorno existentes funcionan igual.

---

## 🆘 SOLUCIÓN DE PROBLEMAS

### Un servicio no arranca (sale "Exited")
```bash
# Ver por qué falló
docker compose logs nombre-del-servicio
```
El error en los logs te dirá exactamente qué pasó.

### Error "Cannot find module"
```bash
# Forzar reinstalación de dependencias
docker compose rm -sf nombre-del-servicio
docker volume rm desbasededatos_nombre_del_servicio_nm
docker compose up -d nombre-del-servicio
```

### Verificar que todos están "Up"
```bash
docker compose ps
```
Todos deben mostrar `Up` en la columna STATUS.

---

## 📊 LOS 11 SERVICIOS

| # | Nombre en Docker | Carpeta | Comando |
|---|-----------------|---------|---------|
| 1 | `bitrix-backend` | Bitrix24/bitrix_backend | node index.js |
| 2 | `ghl-sync-backend` | HoGiLevel/ghl-sync-backend | node server.js |
| 3 | `ghl-sync-netlife` | HoGiLevel/ghl-sync-NetLife | npm start |
| 4 | `jotform-sync-netlife` | JotForm/HGL/jotform-sync-netlife | npm start |
| 5 | `sync-maestras-netlife` | JotForm/HGL/sync-maestras-netlife | npm start |
| 6 | `jotform-base` | JotForm/JotForm/Base | node sync_jotform.js |
| 7 | `jotform-analista` | JotForm/JotForm/jotform-analista-sync | node sync.js |
| 8 | `jotform-sync` | JotForm/jotform-sync | node index.js |
| 9 | `maestra-bitrix-etl` | apache_superset/mestra-bitrix-etl | npm start |
| 10 | `maestra-velsa-netlife` | apache_superset/maestra-velsa-netlife-sync | node app.js |
| 11 | `reporte-automatizado` | apache_superset/reporte-automatizado | node index.js |

---

> **Nota técnica:** Los `node_modules` se instalan en volúmenes Docker separados (Linux), no en tu carpeta de Windows. Esto evita conflictos con módulos nativos compilados para Windows.
