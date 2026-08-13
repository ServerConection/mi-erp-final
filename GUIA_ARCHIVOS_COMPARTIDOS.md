# Archivos Compartidos — guía de despliegue

Módulo de planillas colaborativas: varias personas editan la misma hoja al mismo
tiempo, con permisos por usuario, historial y Excel. Sin fórmulas: es un registro
de datos, no una hoja de cálculo.

---

## 1. Qué se agregó

### Backend

| Archivo | Qué hace |
|---|---|
| `src/migrations/hojas_compartidas.sql` | Crea las 6 tablas `hoj_*` |
| `src/middleware/hojasAcceso.js` | Resuelve el nivel de acceso. Única fuente de verdad de permisos |
| `src/services/hojas.service.js` | Historial + emisión de eventos + validación de valores |
| `src/services/hojasSocket.js` | Salas por hoja, presencia y foco de celda |
| `src/controllers/hojas.controller.js` | Hojas y permisos |
| `src/controllers/hojasDatos.controller.js` | Columnas, filas, celdas, Excel, historial |
| `src/routes/hojas.routes.js` | `/api/hojas` |

Modificados: `src/app.js`, `src/entries/core.js` (registro de rutas) y
`src/config/socket.js` (una llamada que engancha los handlers del módulo).

### Frontend

| Archivo | Qué hace |
|---|---|
| `src/hooks/useHojas.js` | Cliente HTTP + socket compartido |
| `src/pages/Hojas/index.jsx` | Lista de archivos |
| `src/pages/Hojas/HojaEditor.jsx` | La grilla colaborativa |
| `src/pages/Hojas/Celda.jsx` | Una celda según su tipo |
| `src/pages/Hojas/ColumnasModal.jsx` | Definir la estructura |
| `src/pages/Hojas/PermisosModal.jsx` | Repartir accesos |
| `src/pages/Hojas/HistorialPanel.jsx` | Bitácora |
| `src/pages/Hojas/NuevaHojaModal.jsx` | Crear con plantillas |
| `src/pages/Hojas/ui.jsx` | Badges, modal, formatos |

Modificados: `src/App.jsx` (ruta `/archivos-compartidos`) y
`src/layouts/DashboardLayout.jsx` (ítem de menú).

**No se tocó ningún archivo existente del ERP más allá de esas cuatro líneas de
registro.** Ninguna tabla existente se modifica.

---

## 2. Modelo de permisos

| Nivel | Quién | Puede |
|---|---|---|
| `ADMIN` | perfil `ADMINISTRADOR` | Ver y editar **todas** las hojas, siempre |
| `DUENO` | quien creó la hoja | Editar, definir columnas, repartir accesos |
| `EDITOR` | invitado con escritura | Escribir celdas, agregar y borrar filas |
| `LECTOR` | invitado de lectura | Solo ver, exportar y consultar historial |
| — | el resto | No ve ni el nombre de la hoja |

Pueden **crear** hojas: `ADMINISTRADOR`, `GERENCIA`, `ANALISTA`, `SUPERVISOR`.
Se cambia en una sola línea: `PERFILES_CREADORES` en `middleware/hojasAcceso.js`.

Una hoja inexistente y una hoja sin acceso devuelven el mismo `404`: nadie puede
deducir qué archivos existen sondeando ids.

---

## 3. Cómo desplegarlo

### Paso 1 — Base de datos (primero, siempre)

Abre `erp_database` en pgAdmin con `bdd_admin`:

1. Ejecuta el **BLOQUE 0** del archivo `backend/src/migrations/hojas_compartidas.sql`
   (está comentado) y confirma que la tabla `usuarios` es la esperada.
2. Ejecuta el archivo completo de una sola vez.
3. Verifica con la consulta del final: deben salir las 6 tablas `hoj_*`.

El script es idempotente y transaccional: si algo falla no queda nada a medias, y
correrlo dos veces no rompe nada.

### Paso 2 — Backend

No hay dependencias nuevas: `multer`, `xlsx`, `socket.io` y `pg` ya estaban en
`package.json`. No hay variables de entorno nuevas.

```bash
cd backend
npm install          # por si acaso
npm run dev          # local
```

Verificación rápida con un token válido:

```bash
curl -H "Authorization: Bearer TU_TOKEN" http://localhost:PORT/api/hojas
# → {"success":true,"puedeCrear":true,"data":[]}
```

### Paso 3 — Frontend

```bash
cd frontend
npm run build
```

Sin dependencias nuevas: `socket.io-client`, `xlsx` y `lucide-react` ya estaban.

### Paso 4 — Render

El backend y el frontend se despliegan igual que siempre. En el dashboard de
Render, servicio por servicio: **Manual Deploy → Deploy latest commit**
(`autoDeploy` está en `false`).

Orden: primero la migración SQL, luego backend, luego frontend.

---

## 4. Nota importante sobre el tiempo real

El módulo asume que **el mismo proceso** que atiende `/api/hojas` es el que tiene
socket.io. Hoy eso se cumple: el frontend apunta a un backend único
(`VITE_API_URL`) y ahí conviven HTTP y websocket.

Si algún día se activa el `render.yaml` con el gateway y los procesos separados,
hay que hacer **una** de estas dos cosas, o los cambios dejarán de verse en vivo
(los datos se guardarán bien igual, solo habría que recargar):

- **Opción A (simple):** enrutar `/api/hojas/**` en `entries/gateway.js` al mismo
  proceso al que va `/socket.io/**` (hoy `TARGETS.WABOT`).
- **Opción B (correcta a largo plazo):** añadir el adaptador de Redis de
  socket.io (`@socket.io/redis-adapter`) para que los eventos crucen entre
  procesos.

Está anotado también en la cabecera de `services/hojasSocket.js`.

---

## 5. Cómo se usa

1. Un supervisor entra a **📗 Archivos Compartidos → Nuevo archivo**.
2. Elige la plantilla *Llamadas ejecutadas* (o define sus propias columnas).
3. **Compartir →** busca a sus asesores y les da *Puede editar* o *Solo lectura*.
4. Los asesores ven el archivo en su menú y escriben. Los cambios aparecen en la
   pantalla de todos al instante, con el nombre de quien está en cada celda.

**Teclado en la grilla:** flechas para moverse, `Enter` para editar y bajar,
`Tab` para editar y avanzar, `Escape` para cancelar. Escribir directamente sobre
una celda seleccionada entra en edición, como en Excel.

---

## 6. Decisiones de diseño (por si alguien pregunta el porqué)

**Cada celda es una fila en `hoj_celdas`, con PK `(fila_id, columna_id)`.**
Dos personas escribiendo en celdas distintas nunca chocan porque tocan filas
distintas de la BD. Si dos escriben en la misma celda gana la última escritura y
ambas ven el valor final: igual que Google Sheets.

**El guardado espera medio segundo.** Mientras alguien teclea no se dispara una
petición por letra. Si el guardado falla, la celda se revierte sola y aparece el
error: nunca queda en pantalla un valor que el servidor no tenga.

**El socket no guarda nada.** Todo cambio va por HTTP y el servidor lo reemite.
Un websocket caído nunca pierde información, solo retrasa el aviso a los demás.

**El tipo de una columna no se puede cambiar.** Cambiarlo dejaría sin sentido los
valores ya guardados. Si hace falta otro tipo, se crea otra columna.

**Nada se borra físicamente.** Filas, columnas y hojas usan borrado lógico para
que el historial siga teniendo sentido.

**Sin fórmulas y sin virtualización de filas.** Lo primero porque no se pidió; lo
segundo porque a 500 filas no aporta nada y sí complica el código.

---

## 7. Pendiente conocido

`frontend/src/pages/AppSheetModule.jsx` (el iframe a AppSheet, ruta `/appsheet`)
queda obsoleto con este módulo, pero **no se tocó**. Cuando confirmes que ya no
lo usa nadie, se puede eliminar junto con su ruta en `App.jsx`.
