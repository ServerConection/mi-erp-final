# 🏆 Mundialito - Guía de Uso

Programa de Aceleración Comercial. Módulo de torneo entre asesores estilo mundial, visible **solo para perfil ADMINISTRADOR**.

---

## 1. Instalación (un solo paso)

Ejecuta la migración SQL en tu BD de Render:

```bash
psql $DATABASE_URL -f backend/src/migrations/mundialito.sql
```

Crea 7 tablas nuevas: `mundialito_torneos`, `mundialito_grupos`, `mundialito_participantes`, `mundialito_partidos`, `mundialito_goles`, `mundialito_premios`, `mundialito_top10` + 1 vista `v_mundialito_posiciones`. **No toca tablas existentes.**

---

## 2. Flujo de uso (orden recomendado)

### Paso 1: Crear torneo
- Entra a `/mundialito` (aparece en menú lateral solo si eres ADMIN)
- Selecciona empresa: NOVONET o VELSA
- Tab **Configuración** → crea torneo (fase GRUPOS, fechas 1-13 junio)
- Al crear, automáticamente se generan los 5 grupos: TITANES, ÁGUILAS, DRAGONES, COBRAS, OSOS

### Paso 2: Agregar participantes
- Tab **Participantes**
- Escribe el nombre del asesor + "Agregar". Repite para todos.
- Cada participante queda sin grupo hasta que hagas el sorteo

### Paso 3: Realizar sorteo
- Tab **Participantes** → botón "🎲 Realizar Sorteo"
- Reparte aleatoriamente todos los participantes en los 5 grupos (Fisher-Yates + round-robin)
- Confetti se dispara al confirmar

### Paso 4: Generar partidos diarios
- Tab **Partidos** → "+ Generar Partidos del Día"
- Te pide la fecha (default: hoy). Empareja aleatoriamente dentro de cada grupo

### Paso 5: Registrar goles
- Tab **Goles en vivo** → selecciona asesor + tipo + click "⚽ Registrar Gol"
- Tipos disponibles:
  - **VENTA** (+1 gol) → venta normal
  - **BONO_90MIN** (+2 goles) → venta ingresada en menos de 90 min
  - **BONO_MISMO_DIA** (+1 gol) → venta del mismo día en Jot+Telcos
  - **MANUAL** → cualquier ajuste
- Al registrar gol: **dispara overlay "¡GOOOL!" en pantalla completa + confetti + sonido** (si está activado)
- Otros admins conectados ven la animación en vivo (Socket.IO)

### Paso 6: Cerrar partidos
- Tab **Partidos** → cada tarjeta tiene botón "Cerrar"
- Al cerrar: calcula automáticamente puntos según reglas (3 pts ganador / 1 empate / 0 perdedor)
- Los goles del partido se suman desde los registrados ese día

### Paso 7: Ver tabla de posiciones
- Tab **Posiciones** (la pantalla principal estilo la imagen)
- Muestra: rango con corona/medallas, asesor, grupo con color, KPIs (Eficiencia/Velocidad/Conversión), PJ/PG/PE/PP, goles, total puntos
- Fila #1 con efecto shimmer dorado
- Refresh manual o automático cuando hay goles

### Paso 8: Calcular Top 10 y Premios
- Tab **Top 10** → "📊 Recalcular Top 10" → guarda los 10 mejores (premio: horario flexible)
- Tab **Premios** → "💵 Recalcular Premios" → calcula USD acumulados:
  - $1.00 por cada gol tipo VENTA
  - $1.50 por cada gol tipo BONO_*
- Exportable visualmente (la tabla queda ordenada por monto)

---

## 3. Efectos especiales incluidos

| Efecto | Cuándo se dispara |
|---|---|
| Overlay "¡GOOOL!" a pantalla completa | Cada gol registrado (vía Socket.IO) |
| Confetti animado | Goles + sorteo |
| Sonido de estadio (WebAudio sintetizado) | Goles, solo si "🔊 Sonido ON" |
| Shimmer dorado en líder | Siempre en fila #1 de Posiciones |
| Corona pulsante 👑 | Posición #1 |
| Medallas 🥈🥉 | Posiciones #2 y #3 |
| Ticker scroll de últimos 10 goles | Bajo el header |
| Pelotas rodando ⚽ en fondo del header | Decoración constante |
| Glows y transiciones | Botones, tarjetas, filas |

---

## 4. Endpoints disponibles (todos requieren `Bearer token` + perfil ADMIN)

```
GET    /api/mundialito/torneos?empresa=NOVONET
POST   /api/mundialito/torneos
PUT    /api/mundialito/torneos/:id/cerrar
PUT    /api/mundialito/torneos/:id/reglas

GET    /api/mundialito/torneos/:torneoId/grupos
GET    /api/mundialito/torneos/:torneoId/participantes
POST   /api/mundialito/torneos/:torneoId/participantes
DELETE /api/mundialito/participantes/:id
POST   /api/mundialito/torneos/:torneoId/sorteo

GET    /api/mundialito/torneos/:torneoId/partidos
POST   /api/mundialito/torneos/:torneoId/partidos/generar
PUT    /api/mundialito/partidos/:id/cerrar

POST   /api/mundialito/torneos/:torneoId/goles
GET    /api/mundialito/torneos/:torneoId/goles?limit=50

GET    /api/mundialito/torneos/:torneoId/posiciones
GET    /api/mundialito/torneos/:torneoId/top10
POST   /api/mundialito/torneos/:torneoId/top10/calcular

GET    /api/mundialito/torneos/:torneoId/premios
POST   /api/mundialito/torneos/:torneoId/premios/calcular
```

---

## 5. Reglas configurables (en `mundialito_torneos.reglas_json`)

```json
{
  "gol_por_venta": 1,
  "bono_90min_goles": 2,
  "bono_mismo_dia_goles": 1,
  "pts_victoria": 3,
  "pts_empate": 1,
  "pts_derrota": 0,
  "bono_kpi_eficiencia_pct": 85,
  "bono_kpi_eficiencia_pts": 5,
  "bono_kpi_velocidad_min": 2,
  "bono_kpi_velocidad_pts": 3,
  "bono_kpi_conversion_pct": 18,
  "bono_kpi_conversion_pts": 3,
  "premio_dia_normal": 1.00,
  "premio_dia_acelerado": 1.50
}
```

Modificables por endpoint `PUT /api/mundialito/torneos/:id/reglas` con body `{ reglas: {...} }`.

---

## 6. Pendientes (futuras versiones)

- ⏳ **Auto-registro de goles desde Bitrix**: actualmente los goles se registran manualmente. Falta un sync que monitorice `bitrix_deals` y dispare goles automáticamente cuando entre una venta nueva. Requiere conocer los campos `fecha_jotform` y `fecha_telcos`.
- ⏳ **KPIs reales**: actualmente los tres KPIs (Eficiencia/Velocidad/Conversión) son placeholders calculados. Falta conectarlos a los indicadores reales que ya tienes.
- ⏳ **Foto del asesor**: hoy se muestran iniciales. Cuando subas las fotos, agrega la URL al participante.
- ⏳ **Fases sucesivas**: cada fase es un torneo independiente. Para Octavos crea nuevo torneo con fase='OCTAVOS'.

---

## 7. Archivos creados/modificados

**Nuevos:**
- `backend/src/migrations/mundialito.sql`
- `backend/src/controllers/mundialito.controller.js`
- `backend/src/routes/mundialito.routes.js`
- `frontend/src/pages/Mundialito.jsx`

**Modificados (mínimamente):**
- `backend/src/app.js` → agregada importación + `app.use('/api/mundialito', ...)`
- `frontend/src/App.jsx` → agregada ruta lazy `/mundialito`
- `frontend/src/layouts/DashboardLayout.jsx` → agregado ítem de menú "🏆 Mundialito" (solo ADMIN)

**Cero impacto en módulos existentes.**
