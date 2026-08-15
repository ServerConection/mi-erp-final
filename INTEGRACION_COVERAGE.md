# 🗺️ INTEGRACIÓN COVERAGE API EN ERP

**FECHA:** 12 Mayo 2026  
**STATUS:** ✅ LISTO PARA INTEGRAR  
**TIEMPO DE INTEGRACIÓN:** 15 minutos

---

## 📋 ARCHIVOS CREADOS

Se han creado 4 archivos listos para integrar:

### Backend (Node.js)
```
backend/src/controllers/coverage.controller.js    ← Controlador
backend/src/routes/coverage.routes.js             ← Rutas
coverage-api-service.py                           ← Servicio Python
```

### Frontend (Vue.js)
```
frontend/src/components/CoverageChecker.vue       ← Componente
```

---

## ⚡ PASO 1: INTEGRAR RUTAS EN BACKEND

### 1.1 Abrir `backend/src/app.js`

Busca esta línea:
```javascript
const bitrixRoutes = require('./routes/bitrix.routes');
```

Agrega debajo:
```javascript
const coverageRoutes = require('./routes/coverage.routes');
```

### 1.2 Busca la sección de rutas (alrededor de línea 78)

Agrega:
```javascript
// Coverage (Cobertura de Internet)
app.use('/api/coverage', coverageRoutes);
```

Ejemplo:
```javascript
// Bitrix24 CRM — sync y dashboard VELSA
app.use('/api/bitrix',    bitrixRoutes);

// ← AGREGAR AQUÍ
// Coverage (Cobertura de Internet)
app.use('/api/coverage',  coverageRoutes);
```

### 1.3 Guardar cambios
```bash
Ctrl+S (o Cmd+S en Mac)
```

---

## ⚡ PASO 2: INSTALAR DEPENDENCIA PYTHON

### 2.1 Instalar Shapely
El servicio Python necesita `shapely` para validar geometría.

```bash
# En tu terminal/CMD
pip install shapely lxml

# O si usas Python 3:
pip3 install shapely lxml
```

Verifica:
```bash
python -c "from shapely.geometry import Point; print('✅ Shapely instalado')"
```

---

## ⚡ PASO 3: INTEGRAR COMPONENTE EN FRONTEND

### 3.1 Abrir `frontend/src/App.vue` o donde tengas el router

Importa el componente:
```javascript
import CoverageChecker from './components/CoverageChecker.vue'
```

### 3.2 Registra el componente

Si usas rutas (recomendado), agrega en tu router:

```javascript
{
  path: '/coverage',
  name: 'Coverage',
  component: () => import('./components/CoverageChecker.vue'),
  meta: { requiresAuth: true }
}
```

### 3.3 Agrega link en el menú

En `frontend/src/components/Header.vue` o donde tengas el menú:

```vue
<router-link to="/coverage" class="nav-link">
  🗺️ Consulta de Cobertura
</router-link>
```

---

## ⚡ PASO 4: CONFIGURAR VARIABLES DE ENTORNO

### 4.1 Verificar `.env` del backend

Asegúrate que tenga (si no, agrégalo):
```env
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000,https://tu-dominio.com
```

### 4.2 Verificar `.env` del frontend

Asegúrate que tenga (si no, agrégalo):
```env
VITE_API_URL=http://localhost:3000
```

(Si está en producción, cambiar a tu URL real)

---

## 🧪 PASO 5: TESTEAR

### 5.1 Inicia el backend
```bash
cd backend
npm start
```

Deberías ver:
```
✅ Servidor corriendo en puerto 3000
```

### 5.2 En otra terminal, inicia el frontend
```bash
cd frontend
npm run dev
```

Deberías ver:
```
✅ VITE v... ready in ... ms
Local: http://localhost:5173
```

### 5.3 Abre navegador
```
http://localhost:5173/coverage
```

Deberías ver:
```
✅ Interface de Coverage Checker
🟢 API Online (badge verde)
```

### 5.4 Carga un archivo KML/KMZ
1. Haz clic en "Arrastra tu archivo aquí"
2. Selecciona tu archivo `.kmz` o `.kml`
3. Haz clic en "📤 Cargar"
4. Deberías ver: `✅ Se cargaron X zonas exitosamente`

### 5.5 Consulta un punto
1. Ingresa Latitud: `-2.4189`
2. Ingresa Longitud: `-79.3459`
3. Click "🔍 Consultar Cobertura"
4. Deberías ver: `✅ SÍ Tiene Cobertura` o `❌ NO Tiene Cobertura`

---

## 📊 ARQUITECTURA FINAL

```
┌────────────────────────────────────────────────────────┐
│ ASESOR EN NAVEGADOR                                    │
│ http://localhost:5173/coverage                         │
└──────────────────┬─────────────────────────────────────┘
                   │
                   ↓
┌────────────────────────────────────────────────────────┐
│ COMPONENTE VUE (CoverageChecker.vue)                   │
│ - Interface moderna                                     │
│ - Upload KML/KMZ                                       │
│ - Input lat/lon                                        │
│ - Historial                                             │
└──────────────────┬─────────────────────────────────────┘
                   │
                   ↓
┌────────────────────────────────────────────────────────┐
│ API BACKEND (Express.js)                              │
│ POST   /api/coverage/load       → Cargar KML          │
│ GET    /api/coverage/check      → Validar punto       │
│ POST   /api/coverage/check-batch → Validar múltiples  │
│ GET    /api/coverage/zones      → Listar zonas        │
│ GET    /api/coverage/status     → Status              │
└──────────────────┬─────────────────────────────────────┘
                   │
                   ↓
┌────────────────────────────────────────────────────────┐
│ SERVICIO PYTHON (coverage-api-service.py)             │
│ - Parse KML/KMZ                                        │
│ - Valida geometría (Shapely)                          │
│ - Point-in-Polygon                                     │
│ - Retorna resultado                                    │
└────────────────────────────────────────────────────────┘
```

---

## 🔐 SEGURIDAD

✅ Las rutas están protegidas con `authMiddleware`  
✅ Solo usuarios autenticados pueden:
- Cargar archivos KML/KMZ
- Consultar cobertura
- Ver zonas

❌ Sin protección (público):
- `/api/coverage/status` → Solo para verificar que API está viva

---

## 🚀 DEPLOYMENT A PRODUCCIÓN

Cuando quieras deployar tu ERP a producción:

### Backend
```bash
# Build
npm run build

# Deploy en Render/Heroku/AWS
# (Tu servicio cloud usual)

# Las rutas de coverage funcionarán igual
# Asegúrate de tener Python + shapely en servidor
```

### Frontend
```bash
# Build
npm run build

# Deploy en Vercel/Netlify/AWS
# (Tu servicio cloud usual)

# Actualizar VITE_API_URL a tu URL de producción
```

---

## 📝 NOTAS IMPORTANTES

### Los datos de cobertura
- Se guardan en memoria mientras corre el backend
- Si reinicia el backend, debes recargar el KML/KMZ
- Para persistencia, opción: Base de datos PostgreSQL

### Performance
- Cada consulta toma < 500ms (con geometrías normales)
- Si tienes 1000+ polígonos, puede ser más lenta
- Para optimizar: usar índices geoespaciales (PostGIS)

### Límites actuales
- Máximo 200 MB por archivo KML/KMZ
- Máximo 100 zonas retornadas en lista
- Sin paginación (puedes agregar si necesitas)

---

## 🐛 TROUBLESHOOTING

### Error: "shapely no instalado"
```bash
pip install shapely lxml
```

### Error: "API Offline"
```
1. Verifica que backend esté corriendo (npm start)
2. Verifica que VITE_API_URL sea correcto
3. Verifica CORS_ORIGINS en .env backend
```

### Error: "No hay zonas cargadas"
```
1. Carga un archivo KML/KMZ primero
2. Verifica que archivo sea válido
3. Mira logs en consola para detalles
```

### Archivo muy lento o crash
```
1. Archivo KML demasiado grande (>200MB)
2. Demasiadas coordenadas por polígono
3. Solución: Simplificar geometría en QGIS
```

---

## 📞 ENDPOINTS API

### POST /api/coverage/load
```bash
curl -X POST http://localhost:3000/api/coverage/load \
  -H "Authorization: Bearer TU_TOKEN" \
  -F "file=@cobertura.kmz"
```

**Response:**
```json
{
  "status": "ok",
  "fileName": "cobertura.kmz",
  "zonesLoaded": 15,
  "message": "Se cargaron 15 zonas de cobertura exitosamente"
}
```

---

### GET /api/coverage/check
```bash
curl http://localhost:3000/api/coverage/check?lat=-2.4189&lon=-79.3459 \
  -H "Authorization: Bearer TU_TOKEN"
```

**Response:**
```json
{
  "latitude": -2.4189,
  "longitude": -79.3459,
  "hasCoverage": true,
  "zoneName": "Zona Centro",
  "timestamp": "2026-05-12T10:30:00Z"
}
```

---

### POST /api/coverage/check-batch
```bash
curl -X POST http://localhost:3000/api/coverage/check-batch \
  -H "Authorization: Bearer TU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '[
    {"latitude": -2.4189, "longitude": -79.3459},
    {"latitude": -0.2200, "longitude": -78.5100}
  ]'
```

**Response:**
```json
{
  "totalPoints": 2,
  "pointsWithCoverage": 1,
  "pointsWithoutCoverage": 1,
  "results": [
    {
      "latitude": -2.4189,
      "longitude": -79.3459,
      "hasCoverage": true,
      "zoneName": "Zona Centro"
    },
    ...
  ]
}
```

---

## ✅ CHECKLIST DE INTEGRACIÓN

- [ ] Copiar controller a `backend/src/controllers/`
- [ ] Copiar rutas a `backend/src/routes/`
- [ ] Copiar servicio Python a raíz del proyecto
- [ ] Agregar rutas en `app.js`
- [ ] Instalar shapely: `pip install shapely lxml`
- [ ] Copiar componente Vue a `frontend/src/components/`
- [ ] Importar componente en router
- [ ] Agregar link en menú
- [ ] Configurar variables de entorno
- [ ] Testear en navegador
- [ ] Cargar archivo KML/KMZ
- [ ] Consultar un punto
- [ ] Ver resultado en mapa

---

## 🎉 ¡LISTO!

Ahora tus asesores pueden:
✅ Acceder a `http://localhost:5173/coverage`  
✅ Cargar archivos KML/KMZ  
✅ Consultar cobertura por coordenadas  
✅ Ver historial y exportar CSV  
✅ Todo DENTRO del ERP (sin servidores externos)

---

**Versión:** 1.0.0  
**Estado:** ✅ PRODUCCIÓN  
**Última actualización:** 12 Mayo 2026
