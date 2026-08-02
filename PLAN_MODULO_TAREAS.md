# Módulo de Tareas y Acuerdos — Plan Técnico v1

**Proyecto:** ERP V1
**Fecha:** 01/08/2026
**Estado:** Pendiente de aprobación

---

## 1. Resumen

Módulo de gestión de tareas y acuerdos inspirado en el modelo conceptual de Asana (jerarquía Proyecto → Tarea → Subtarea, responsable único, estados, comentarios, historial), con implementación, nomenclatura, esquema de datos e interfaz **100% propios**. No se copia código, marcas, iconografía ni textos de Asana.

**Decisiones ya tomadas:**

| Tema | Decisión |
|---|---|
| Organización | Área + Cargo como catálogos separados |
| Visibilidad | Usuario / Jefe de área / Administrador |
| Alcance v1 | Proyectos + Tareas + Subtareas |
| Acuerdos | Mismo objeto con campo `tipo` |
| Estados | PENDIENTE → EN PROCESO → EN REVISIÓN → COMPLETADA |
| Notificaciones | In-app con campanita (socket.io) |
| Empresa | Aislado por empresa (NOVONET / VELSA) |
| Vistas | Mis Tareas · Lista + Excel · Dashboard |
| Asignación | Todos pueden asignar a todos |
| Áreas | 1 responsable + N áreas involucradas |
| Adjuntos | Solo comentarios de texto (sin archivos) |

---

## 2. Stack sobre el que se construye

Detectado en tu proyecto, no se agrega ninguna dependencia nueva:

- **Backend:** Node ≥20, Express 5 (CommonJS), PostgreSQL vía `pg`, JWT, `socket.io`, `xlsx`
- **Frontend:** React 19, Vite, Tailwind 3, react-router-dom 7, axios, lucide-react, recharts, socket.io-client, xlsx
- **Patrón backend:** `routes/*.routes.js` → `controllers/*.controller.js` → `services/`
- **Auth:** middleware `verificarToken` (inyecta `req.user = {id, usuario, empresa, perfil, activo}`) + `requierePermiso('Modulo')`
- **Permisos:** matriz en `backend/src/config/permisos.config.js`

---

## 3. Supuestos que necesito que confirmes

> Estos 3 puntos los asumí. Si alguno está mal, corrígelo antes de que escriba código.

**3.1 — Normalización de tu lista de 13 items**

Tu lista mezclaba áreas y cargos. La normalicé así:

**ÁREAS (8)**

| Código | Nombre |
|---|---|
| `GERENCIA_GENERAL` | Gerencia General |
| `GERENCIA_COMERCIAL` | Gerencia Comercial |
| `GERENCIA_FINANCIERA` | Gerencia Financiera |
| `CONTABILIDAD` | Contabilidad |
| `BACKOFFICE` | Backoffice |
| `CALIDAD` | Calidad |
| `TTHH` | Talento Humano |
| `DESARROLLO` | Desarrollo |

**CARGOS (6)**

| Código | Nombre | Nivel | ¿Es jefatura? |
|---|---|---|---|
| `GERENTE` | Gerente | 1 | Sí |
| `SUPERVISOR` | Supervisor | 2 | Sí |
| `COORDINADOR` | Coordinador | 2 | Sí |
| `ANALISTA` | Analista | 3 | No |
| `ASISTENTE` | Asistente | 4 | No |
| `ASESOR` | Asesor | 4 | No |

Con esto, "Supervisor Comercial" = área `GERENCIA_COMERCIAL` + cargo `SUPERVISOR`. "Analista TTHH" = área `TTHH` + cargo `ANALISTA`. Etc.

**❓ Confirma:** ¿Supervisor Comercial y Coordinador Comercial pertenecen a Gerencia Comercial, o Comercial es un área aparte de la Gerencia Comercial?

---

**3.2 — El estado VENCIDA no se guarda, se calcula**

Recomendación técnica: si guardas `VENCIDA` como estado en la tabla, **pierdes la información de en qué estado real quedó la tarea**. Una tarea vencida puede estar Pendiente (nadie la tocó) o En Proceso (se está trabajando, va tarde) — y eso es información valiosa para el dashboard.

Propuesta: el estado guardado nunca es VENCIDA. Se calcula al vuelo:

```sql
esta_vencida = (fecha_limite < CURRENT_DATE
                AND estado NOT IN ('COMPLETADA','CANCELADA'))
```

En la interfaz se ve como una etiqueta roja "Vencida (3 días)" junto al estado real. Cero cron jobs, cero datos inconsistentes.

**❓ Confirma:** ¿Te sirve así, o necesitas VENCIDA como estado guardado por algún reporte específico?

---

**3.3 — Las áreas involucradas dan visibilidad**

Si marcas a Contabilidad como área involucrada en una tarea de Desarrollo, propongo que **el Gerente y Coordinador de Contabilidad puedan verla** (aunque no sean responsables). Si no, marcarlas como involucradas no serviría de nada.

**❓ Confirma:** ¿Los jefes de un área involucrada ven la tarea?

---

## 4. Modelo de datos

Prefijo `tar_` para todas las tablas nuevas. Verificado: no colisiona con ninguna tabla existente.

### 4.1 Diagrama de relaciones

```
tar_areas ──┐
            ├──> usuarios (area_id, cargo_id)
tar_cargos ─┘         │
                      │
tar_proyectos <───────┤
      │               │
      v               v
   tar_tareas ──────────────┐
      │  │  │               │
      │  │  └──> tar_tareas (tarea_padre_id → subtareas)
      │  │
      │  ├──> tar_tarea_areas ──> tar_areas   (N áreas involucradas)
      │  ├──> tar_comentarios
      │  ├──> tar_historial
      │  └──> tar_notificaciones
```

### 4.2 `tar_areas`

| Columna | Tipo | Notas |
|---|---|---|
| `id` | SERIAL PK | |
| `codigo` | VARCHAR(50) UNIQUE | `TTHH`, `DESARROLLO`… |
| `nombre` | VARCHAR(100) | Talento Humano |
| `color` | VARCHAR(7) | `#3B82F6`, para badges |
| `orden` | INT | Orden de despliegue |
| `activo` | BOOLEAN DEFAULT true | |
| `created_at` | TIMESTAMPTZ DEFAULT now() | |

### 4.3 `tar_cargos`

| Columna | Tipo | Notas |
|---|---|---|
| `id` | SERIAL PK | |
| `codigo` | VARCHAR(50) UNIQUE | `COORDINADOR` |
| `nombre` | VARCHAR(100) | Coordinador |
| `nivel` | SMALLINT | 1 = más alto |
| `es_jefatura` | BOOLEAN DEFAULT false | **Clave para la visibilidad** |
| `activo` | BOOLEAN DEFAULT true | |

### 4.4 Modificación a `usuarios` (no destructiva)

```sql
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS area_id  INT REFERENCES tar_areas(id);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS cargo_id INT REFERENCES tar_cargos(id);
```

La columna `cargo` (texto libre) existente **no se toca ni se borra** — sigue funcionando para el resto del ERP. Se agrega un script opcional que intenta mapear el texto libre a `cargo_id` por coincidencia, y deja un reporte de los que no pudo mapear para que los asignes a mano.

### 4.5 `tar_proyectos`

| Columna | Tipo | Notas |
|---|---|---|
| `id` | SERIAL PK | |
| `nombre` | VARCHAR(200) | |
| `descripcion` | TEXT | |
| `empresa` | VARCHAR(20) | `NOVONET` / `VELSA` |
| `area_id` | INT FK | Área dueña del proyecto |
| `color` | VARCHAR(7) | |
| `estado` | VARCHAR(20) | `ACTIVO` / `ARCHIVADO` |
| `creado_por` | INT FK usuarios | |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

Los proyectos son **opcionales**: una tarea puede existir sin proyecto (`proyecto_id IS NULL`) y aparece en "Sin proyecto".

### 4.6 `tar_tareas` (tabla central)

| Columna | Tipo | Notas |
|---|---|---|
| `id` | SERIAL PK | |
| `codigo` | VARCHAR(20) UNIQUE | `TAR-2026-00001`, autogenerado |
| `tipo` | VARCHAR(20) | `TAREA` / `ACUERDO` / `SOLICITUD` |
| `proyecto_id` | INT FK NULL | |
| `tarea_padre_id` | INT FK NULL → self | Si no es NULL, es subtarea |
| `titulo` | VARCHAR(300) NOT NULL | |
| `descripcion` | TEXT | |
| `empresa` | VARCHAR(20) NOT NULL | Aislamiento |
| `solicitante_id` | INT FK usuarios NOT NULL | Quién la pide |
| `responsable_id` | INT FK usuarios NOT NULL | **Único**, quién responde |
| `area_responsable_id` | INT FK tar_areas | Snapshot del área del responsable |
| `estado` | VARCHAR(20) NOT NULL | Ver §5 |
| `prioridad` | VARCHAR(20) | `BAJA`/`MEDIA`/`ALTA`/`URGENTE` |
| `fecha_solicitud` | DATE NOT NULL DEFAULT CURRENT_DATE | Desde cuándo se pide |
| `fecha_inicio` | DATE NULL | Cuándo arranca |
| `fecha_limite` | DATE NOT NULL | Hasta cuándo debe entregar |
| `fecha_completada` | TIMESTAMPTZ NULL | Se sella al pasar a COMPLETADA |
| `progreso` | SMALLINT DEFAULT 0 | 0–100, con CHECK |
| `orden` | INT DEFAULT 0 | Orden manual dentro del proyecto |
| `creado_por` / `actualizado_por` | INT FK usuarios | Auditoría |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

**Campo calculado clave** (expuesto por la vista `v_tar_tareas`):

```sql
CASE WHEN fecha_limite < CURRENT_DATE
      AND estado NOT IN ('COMPLETADA','CANCELADA')
     THEN true ELSE false END AS esta_vencida,
(CURRENT_DATE - fecha_limite) AS dias_retraso
```

**Índices:**

```sql
idx_tar_tareas_responsable   (responsable_id, estado)
idx_tar_tareas_solicitante   (solicitante_id)
idx_tar_tareas_empresa_est   (empresa, estado)
idx_tar_tareas_fecha_limite  (fecha_limite) WHERE estado NOT IN ('COMPLETADA','CANCELADA')
idx_tar_tareas_proyecto      (proyecto_id)
idx_tar_tareas_padre         (tarea_padre_id)
idx_tar_tareas_area          (area_responsable_id)
idx_tar_tareas_busqueda      GIN (to_tsvector('spanish', titulo || ' ' || descripcion))
```

### 4.7 `tar_tarea_areas` (áreas involucradas)

| Columna | Tipo |
|---|---|
| `tarea_id` | INT FK ON DELETE CASCADE |
| `area_id` | INT FK |
| PK compuesta | `(tarea_id, area_id)` |

### 4.8 `tar_comentarios`

| Columna | Tipo | Notas |
|---|---|---|
| `id` | SERIAL PK | |
| `tarea_id` | INT FK CASCADE | |
| `usuario_id` | INT FK usuarios | |
| `comentario` | TEXT NOT NULL | |
| `eliminado` | BOOLEAN DEFAULT false | Borrado lógico |
| `created_at` / `editado_at` | TIMESTAMPTZ | |

### 4.9 `tar_historial` (auditoría inmutable)

| Columna | Tipo | Notas |
|---|---|---|
| `id` | SERIAL PK | |
| `tarea_id` | INT FK CASCADE | |
| `usuario_id` | INT FK usuarios | Quién hizo el cambio |
| `accion` | VARCHAR(30) | `CREACION`, `CAMBIO_ESTADO`, `REASIGNACION`, `CAMBIO_FECHA`, `EDICION`, `COMENTARIO` |
| `campo` | VARCHAR(50) NULL | |
| `valor_anterior` | TEXT NULL | |
| `valor_nuevo` | TEXT NULL | |
| `created_at` | TIMESTAMPTZ DEFAULT now() | |

Se escribe **siempre desde el backend**, nunca editable por el usuario. Es lo que te permite defender un acuerdo gerencial: "el 12 de marzo Juan movió la fecha del 15 al 30".

### 4.10 `tar_notificaciones`

| Columna | Tipo | Notas |
|---|---|---|
| `id` | SERIAL PK | |
| `usuario_id` | INT FK usuarios | Destinatario |
| `tarea_id` | INT FK CASCADE | |
| `tipo` | VARCHAR(30) | `ASIGNACION`, `COMENTARIO`, `CAMBIO_ESTADO`, `PROXIMO_VENCIMIENTO`, `VENCIDA` |
| `mensaje` | VARCHAR(300) | |
| `leida` | BOOLEAN DEFAULT false | |
| `created_at` | TIMESTAMPTZ | |

Índice: `(usuario_id, leida) WHERE leida = false`.

---

## 5. Máquina de estados

```
                  ┌──────────────┐
                  │  PENDIENTE   │◄──────────┐
                  └──────┬───────┘           │
                         │ iniciar           │ devolver
                         ▼                   │
                  ┌──────────────┐           │
        ┌────────►│  EN PROCESO  │───────────┘
        │         └──────┬───────┘
        │ rechazar       │ enviar a revisión
        │                ▼
        │         ┌──────────────┐
        └─────────┤ EN REVISIÓN  │
                  └──────┬───────┘
                         │ aprobar  ← solo SOLICITANTE o ADMIN
                         ▼
                  ┌──────────────┐
                  │  COMPLETADA  │
                  └──────────────┘

  Desde PENDIENTE / EN PROCESO / EN REVISIÓN ──► CANCELADA
  COMPLETADA ──► EN PROCESO  (reapertura, solo solicitante o admin)
```

**Reglas duras (validadas en backend, no solo en la UI):**

| Transición | Quién puede |
|---|---|
| `PENDIENTE → EN_PROCESO` | Responsable, solicitante, jefe del área, admin |
| `EN_PROCESO → EN_REVISION` | Responsable, admin |
| `EN_REVISION → COMPLETADA` | **Solo solicitante o admin** |
| `EN_REVISION → EN_PROCESO` | Solicitante (rechaza), admin |
| `* → CANCELADA` | Solicitante, admin |
| `COMPLETADA → EN_PROCESO` | Solicitante, admin |

**Regla de subtareas:** una tarea padre no puede pasar a `COMPLETADA` si tiene subtareas abiertas. El backend responde 409 con el listado de subtareas pendientes.

**Efectos automáticos:**
- Al entrar a `COMPLETADA`: se sella `fecha_completada`, `progreso = 100`
- Al entrar a `EN_PROCESO` la primera vez: se sella `fecha_inicio` si estaba vacía
- Todo cambio de estado escribe en `tar_historial` y dispara notificación

---

## 6. Matriz de visibilidad

Se implementa como un **único predicado SQL** reutilizado por todos los endpoints de lectura. Un solo lugar que auditar.

```sql
-- Base: siempre filtra por empresa del usuario
t.empresa = :empresaUsuario
AND (
  -- 1. ADMINISTRADOR ve todo
  :esAdmin
  -- 2. Soy responsable o solicitante
  OR t.responsable_id = :userId
  OR t.solicitante_id  = :userId
  -- 3. Soy jefatura (cargo.es_jefatura) y la tarea es de mi área
  OR (:esJefatura AND t.area_responsable_id = :miAreaId)
  -- 4. Soy jefatura y mi área está marcada como involucrada
  OR (:esJefatura AND EXISTS (
        SELECT 1 FROM tar_tarea_areas ta
        WHERE ta.tarea_id = t.id AND ta.area_id = :miAreaId))
)
```

### Resumen por perfil

| Quién | Qué ve | Qué puede hacer |
|---|---|---|
| Analista / Asistente / Asesor | Sus tareas asignadas + las que él pidió | Crear, asignar a cualquiera, comentar, mover estado de las suyas |
| Coordinador / Supervisor | Lo anterior + **todo lo de su área** + tareas donde su área está involucrada | Además: reasignar y cambiar fechas dentro de su área |
| Gerente | Igual que Coordinador (sobre su gerencia) | Igual |
| Administrador | **Todo, de su empresa** | Todo, incluido eliminar y editar catálogos |

**Nota sobre perfiles existentes:** tu ERP ya tiene `perfil` (USUARIO, CONSULTOR, SUPERVISOR, ANALISTA, GERENCIA, ADMINISTRADOR). El módulo usa `perfil = 'ADMINISTRADOR'` para el nivel admin, y **`cargo.es_jefatura`** para el nivel jefe de área. Son dos ejes independientes y no se pisan.

---

## 7. API — endpoints

Todos bajo `/api/tareas`, todos detrás de `verificarToken` + `requierePermiso('Tareas')`.

### Tareas

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/mis-tareas` | Bandeja personal, agrupada en `vencidas / hoy / semana / despues / sin_fecha`. Incluye contadores. |
| `GET` | `/` | Lista con filtros: `?estado=&prioridad=&tipo=&area_id=&responsable_id=&solicitante_id=&proyecto_id=&desde=&hasta=&vencidas=1&q=&page=&limit=` |
| `GET` | `/:id` | Detalle: tarea + subtareas + áreas involucradas + comentarios + historial |
| `POST` | `/` | Crear tarea o subtarea |
| `PATCH` | `/:id` | Editar campos (registra cada cambio en historial) |
| `PATCH` | `/:id/estado` | Cambiar estado (valida transición y permiso) |
| `PATCH` | `/:id/reasignar` | Cambiar responsable |
| `DELETE` | `/:id` | Cancelar (borrado lógico → estado CANCELADA) |

### Comentarios e historial

| Método | Ruta |
|---|---|
| `POST` | `/:id/comentarios` |
| `PATCH` | `/comentarios/:comentarioId` |
| `DELETE` | `/comentarios/:comentarioId` |
| `GET` | `/:id/historial` |

### Proyectos

| Método | Ruta |
|---|---|
| `GET` | `/proyectos` |
| `POST` | `/proyectos` |
| `PATCH` | `/proyectos/:id` |
| `PATCH` | `/proyectos/:id/archivar` |

### Dashboard y reportes

| Método | Ruta | Devuelve |
|---|---|---|
| `GET` | `/dashboard` | `% cumplimiento a tiempo`, `total por estado`, `vencidas por área`, `carga por persona`, `tendencia últimos 6 meses` |
| `GET` | `/exportar` | Archivo `.xlsx` con los mismos filtros que la lista |

### Catálogos y notificaciones

| Método | Ruta |
|---|---|
| `GET` | `/catalogos` (áreas, cargos, usuarios asignables, proyectos activos — una sola llamada) |
| `GET` | `/notificaciones` |
| `PATCH` | `/notificaciones/:id/leida` |
| `PATCH` | `/notificaciones/leer-todas` |

**Formato de respuesta:** se respeta tu convención actual `{ success: true, data: ... }` / `{ success: false, error: '...' }`.

---

## 8. Notificaciones in-app

- Se insertan en `tar_notificaciones` dentro de la **misma transacción** que genera el evento (si falla la tarea, no queda notificación huérfana).
- Se emiten por `socket.io` a la sala `user:{id}`. **Verificado:** tu `backend/src/config/socket.js` ya hace `socket.join('user:' + socket.userId)` en la línea 83. **No hay que modificar nada de sockets** — solo llamar `getIO().to('user:'+id).emit('tarea_notificacion', payload)`.
- La campanita del `DashboardLayout` muestra el contador de no leídas y hace polling de respaldo cada 60s por si el socket se cae.

**Eventos que notifican:**

| Evento | A quién |
|---|---|
| Te asignaron una tarea | Responsable |
| Comentaron tu tarea | Responsable + solicitante (menos el autor) |
| Cambió el estado | Responsable + solicitante (menos quien lo cambió) |
| Enviada a revisión | Solicitante |
| Vence mañana | Responsable |
| Venció | Responsable + solicitante |

Los dos últimos los genera un `node-cron` diario a las 08:00 (ya usas `node-cron` en `src/jobs/`).

---

## 9. Interfaz

Ruta base `/tareas`, con 3 pestañas dentro de una sola página contenedora.

### 9.1 Mis Tareas (`/tareas`) — pantalla de entrada

```
┌──────────────────────────────────────────────────────────────────┐
│  Tareas y Acuerdos          [ Mis Tareas ][ Lista ][ Dashboard ] │
├──────────────────────────────────────────────────────────────────┤
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐    [+ Nueva tarea]  │
│  │Vencidas│ │  Hoy   │ │ Semana │ │ Total  │                     │
│  │   3    │ │   5    │ │   12   │ │   28   │                     │
│  └────────┘ └────────┘ └────────┘ └────────┘                     │
│                                                                  │
│  ( Asignadas a mí )  ( Que yo pedí )                             │
│                                                                  │
│  ▼ VENCIDAS (3)                                                  │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │ 🔴 URGENTE · ACUERDO · TAR-2026-00042                    │    │
│  │ Enviar conciliación bancaria de julio                    │    │
│  │ Pidió: G. Financiera · Vence: 28 jul (4 días tarde)      │    │
│  │ Áreas: Contabilidad, Backoffice        [En proceso ▾]    │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ▼ VENCE HOY (5)      ▼ ESTA SEMANA (12)      ▼ MÁS ADELANTE     │
└──────────────────────────────────────────────────────────────────┘
```

- Grupos colapsables
- Cambio de estado directo desde la tarjeta (dropdown), sin abrir el detalle
- Clic en la tarjeta → panel lateral con el detalle completo

### 9.2 Detalle (panel lateral deslizable)

Encabezado con código, tipo y estado. Cuerpo con: título editable, descripción, responsable, solicitante, áreas involucradas (chips de colores), fechas, prioridad, progreso, subtareas con checkbox, y abajo dos pestañas: **Comentarios** e **Historial**.

Botón de acción principal contextual según el estado y tu rol:
- Si eres responsable y está EN PROCESO → `Enviar a revisión`
- Si eres solicitante y está EN REVISIÓN → `Aprobar y completar` / `Devolver`

### 9.3 Lista (`/tareas/lista`)

Tabla densa con barra de filtros persistentes (área, responsable, estado, prioridad, tipo, rango de fechas, buscador). Columnas ordenables. Botón **Exportar a Excel** que respeta los filtros activos. Paginación del lado del servidor.

### 9.4 Dashboard (`/tareas/dashboard`)

Solo visible para jefaturas y administrador.

- 4 tarjetas KPI: cumplimiento a tiempo %, tareas abiertas, vencidas, promedio de días de retraso
- Barras: tareas por área (apiladas por estado)
- Dona: distribución por estado
- Barras horizontales: carga por persona (abiertas vs vencidas)
- Línea: tendencia de cumplimiento últimos 6 meses

Todo con `recharts`, que ya usas.

---

## 10. Archivos

### Nuevos — backend

```
backend/src/migrations/tareas.sql                  ← DDL + seeds + índices
backend/src/config/tareas.config.js                ← estados, transiciones, prioridades, tipos
backend/src/routes/tareas.routes.js
backend/src/controllers/tareas.controller.js
backend/src/controllers/tareasProyectos.controller.js
backend/src/controllers/tareasDashboard.controller.js
backend/src/services/tareas.service.js             ← lógica de negocio + transiciones
backend/src/services/tareasVisibilidad.service.js  ← el predicado SQL de §6, un solo lugar
backend/src/services/tareasNotificaciones.service.js
backend/src/jobs/tareasVencimientos.cron.js        ← cron 08:00
```

### Nuevos — frontend

```
frontend/src/pages/Tareas/index.jsx                ← contenedor con pestañas
frontend/src/pages/Tareas/MisTareas.jsx
frontend/src/pages/Tareas/TareasLista.jsx
frontend/src/pages/Tareas/TareasDashboard.jsx
frontend/src/pages/Tareas/components/TareaCard.jsx
frontend/src/pages/Tareas/components/TareaDetallePanel.jsx
frontend/src/pages/Tareas/components/TareaFormModal.jsx
frontend/src/pages/Tareas/components/FiltrosBar.jsx
frontend/src/pages/Tareas/components/EstadoBadge.jsx
frontend/src/pages/Tareas/components/PrioridadBadge.jsx
frontend/src/pages/Tareas/components/ComentariosPanel.jsx
frontend/src/pages/Tareas/components/HistorialPanel.jsx
frontend/src/hooks/useTareas.js
frontend/src/hooks/useNotificaciones.js
```

### Modificados (cambios mínimos y aditivos)

| Archivo | Cambio |
|---|---|
| `backend/src/entries/core.js` | +1 línea: `app.use('/api/tareas', require('../routes/tareas.routes'))` |
| `backend/src/config/permisos.config.js` | +`TAREAS: 'Tareas'` en MODULOS y en la lista de todos los perfiles de ambas empresas |
| `frontend/src/App.jsx` | +3 rutas bajo el layout protegido |
| `frontend/src/pages/HomeModules.jsx` | +1 tarjeta de acceso al módulo |
| `frontend/src/layouts/DashboardLayout.jsx` | +campanita de notificaciones |

**Nada existente se rompe.** Todos los cambios son aditivos.

### Verificación de colisiones (ejecutada sobre tu repo)

| Comprobación | Resultado |
|---|---|
| Prefijo de tablas `tar_` | ✅ Libre, ninguna coincidencia en el proyecto |
| Ruta backend `/api/tareas` | ✅ Libre |
| Ruta frontend `/tareas` | ✅ Libre |
| Archivo `tareas.routes.js` | ✅ No existe |
| Sala socket `user:{id}` | ✅ Ya existe en `config/socket.js:83`, se reutiliza sin tocarla |
| Columnas `area_id` / `cargo_id` en `usuarios` | ✅ No existen, se agregan con `IF NOT EXISTS` |
| Columna `cargo` (texto) en `usuarios` | ⚠️ Existe y **se conserva intacta** |

---

## 11. Fases de implementación

| Fase | Entregable | Cómo lo validas |
|---|---|---|
| **1. Base de datos** | `tareas.sql` con DDL, seeds de áreas y cargos, índices y vista | Lo corres en pgAdmin y revisas las tablas |
| **2. Backend core** | Rutas + controladores + servicio de visibilidad + CRUD + transiciones | Pruebas con Postman/Thunder Client |
| **3. Frontend Mis Tareas** | Pantalla principal + formulario + panel de detalle + comentarios | Creas y mueves tareas reales |
| **4. Lista + Excel** | Tabla con filtros y exportación | Filtras y descargas |
| **5. Dashboard + notificaciones** | KPIs, gráficos, campanita, cron de vencimientos | Revisas los números |

Cada fase queda funcionando por sí sola. Puedes parar en la 3 y ya tienes un módulo usable.

---

## 12. Sobre derechos de autor

Lo que se toma de Asana son **ideas y patrones de interacción no protegibles**: la jerarquía proyecto/tarea/subtarea, la noción de responsable único, estados de flujo y comentarios con historial. Estos patrones son estándar de la industria (Jira, Monday, ClickUp, Trello, Linear los comparten) y no están sujetos a copyright.

Lo que **no** se usa: código fuente, esquema de base de datos, nombres de API, marca, logotipo, iconografía, paleta de colores, textos de interfaz ni assets de Asana. La nomenclatura es propia y en español (`tar_tareas`, `EN_REVISION`, `area_responsable_id`), y el diseño visual sigue tu sistema Tailwind existente.

---

## 13. Fuera de alcance en v1

Registrado para una v2 si lo necesitas:

- Adjuntos de archivos (descartado en esta versión)
- Vista Kanban arrastrable
- Vista Gantt / línea de tiempo
- Dependencias entre tareas (bloquea / bloqueada por)
- Tareas recurrentes
- Plantillas de proyecto
- Campos personalizados
- Notificaciones por correo y WhatsApp
- Menciones `@usuario` en comentarios
- Tareas cruzadas entre NOVONET y VELSA

---

## ✅ Para aprobar

Responde a esto y arranco con la Fase 1:

1. ¿Las 8 áreas y 6 cargos de §3.1 están bien? ¿Comercial va dentro de Gerencia Comercial?
2. ¿VENCIDA calculada en vez de guardada? (§3.2)
3. ¿Los jefes de un área involucrada ven la tarea? (§3.3)
4. ¿Empiezo por la Fase 1 (SQL) o prefieres que entregue las fases 1–3 completas de una vez?
