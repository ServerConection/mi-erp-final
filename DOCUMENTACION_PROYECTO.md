# 📚 DOCUMENTACIÓN DEL PROYECTO ERP

**Versión:** 1.0  
**Fecha:** 2026-04-21  
**Stack:** Node.js + Express + PostgreSQL + React (JSX) + Socket.io

---

## 📋 TABLA DE CONTENIDOS

1. [Estructura del Proyecto](#estructura-del-proyecto)
2. [Sistema de Permisos](#sistema-de-permisos)
3. [Autenticación](#autenticación)
4. [API Endpoints](#api-endpoints)
5. [Base de Datos](#base-de-datos)
6. [Frontend](#frontend)
7. [Guía de Desarrollo](#guía-de-desarrollo)
8. [Cómo Agregar Nuevos Módulos](#cómo-agregar-nuevos-módulos)

---

## 📁 ESTRUCTURA DEL PROYECTO

```
ERP/V1/
├── backend/
│   ├── src/
│   │   ├── config/              # 🔧 Configuraciones globales
│   │   │   ├── db.js            # Conexión PostgreSQL
│   │   │   ├── socket.js        # WebSockets (tiempo real)
│   │   │   └── permisos.config.js # Sistema de permisos por empresa
│   │   │
│   │   ├── middleware/          # 🛡️ Validaciones y seguridad
│   │   │   ├── auth.js          # Validar JWT
│   │   │   ├── isAdmin.js       # Solo administradores
│   │   │   └── requierePermiso.js # Validar acceso a módulos
│   │   │
│   │   ├── routes/              # 🛣️ Rutas API
│   │   │   ├── auth.routes.js   # Login, logout
│   │   │   ├── usuarios.routes.js # CRUD usuarios
│   │   │   ├── indicadores.routes.js # Datos NOVONET
│   │   │   ├── indicadoresVelsa.routes.js # Datos VELSA
│   │   │   ├── ventas.routes.js # Ventas y comisiones
│   │   │   ├── redes.routes.js  # Análisis de redes
│   │   │   ├── alertas.routes.js # Notificaciones
│   │   │   └── ... (más rutas)
│   │   │
│   │   ├── controllers/         # 🎮 Lógica de negocios
│   │   │   ├── auth.controller.js
│   │   │   ├── usuarios.controller.js
│   │   │   └── ... (8 controllers)
│   │   │
│   │   ├── services/            # 📦 Funciones reutilizables
│   │   │   ├── email.service.js # Enviar emails (SendGrid)
│   │   │   ├── whatsapp.service.js # WhatsApp (Baileys)
│   │   │   ├── correo.service.js # Mailing
│   │   │   ├── alertas.service.js # Sistema de alertas
│   │   │   └── ... (más services)
│   │   │
│   │   ├── jobs/                # ⏰ Tareas automáticas
│   │   │   └── alertas.cron.js  # Cron cada 15 minutos
│   │   │
│   │   ├── utils/               # 🛠️ Utilidades
│   │   │   ├── generarOTP.js    # Generar códigos OTP
│   │   │   └── token.js         # Gestión de JWT
│   │   │
│   │   ├── models/              # 📊 Modelos de datos
│   │   │   └── notificaciones.js
│   │   │
│   │   ├── app.js               # 🚀 Configuración Express
│   │   └── server.js            # 🌐 Iniciar servidor
│   │
│   ├── package.json
│   ├── .env                     # Variables de entorno (OCULTO)
│   └── node_modules/
│
├── frontend/
│   ├── src/
│   │   ├── pages/               # 📄 Páginas React
│   │   │   ├── Login.jsx        # Pantalla login
│   │   │   ├── HomeModules.jsx  # Panel módulos
│   │   │   ├── Indicadores.jsx  # Indicadores NOVONET
│   │   │   ├── IndicadoresVelsa.jsx # Indicadores VELSA
│   │   │   ├── Redes.jsx        # Análisis redes
│   │   │   ├── Ventas.jsx       # Módulo ventas
│   │   │   ├── VistaAsesor.jsx  # Vista supervisor
│   │   │   ├── BroadcastPanel.jsx # TV broadcast
│   │   │   └── ... (más páginas)
│   │   │
│   │   ├── layouts/             # 🎨 Layouts compartidos
│   │   │   └── DashboardLayout.jsx # Menú + main
│   │   │
│   │   ├── App.jsx              # Componente raíz
│   │   └── main.jsx             # Punto de entrada
│   │
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── node_modules/
│
└── .git/                        # Control de versiones

```

---

## 🔐 SISTEMA DE PERMISOS

Tu ERP tiene **permisos granulares por empresa y perfil**.

### Empresas Configuradas:
- **NOVONET** - Empresa 1
- **VELSA** - Empresa 2

### Perfiles por Empresa:
1. **USUARIO** - Acceso básico
2. **SUPERVISOR** - Supervisa equipo
3. **ANALISTA** - Análisis avanzado + gerencial
4. **GERENCIA** - Acceso gerencial
5. **ADMINISTRADOR** - Acceso total

### Módulos Disponibles:

| Módulo | USUARIO | SUPERVISOR | ANALISTA | GERENCIA | ADMIN |
|--------|---------|-----------|----------|----------|-------|
| VistaAsesor | ✅ | ✅ | ✅ | ✅ | ✅ |
| SeguimientoVentas | ✅ | ✅ | ✅ | ✅ | ✅ |
| Indicadores | ❌ | ✅ | ✅ | ✅ | ✅ |
| Redes | ❌ | ❌ | ✅ | ✅ | ✅ |
| VentasFormulario | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Módulos Gerenciales** | ❌ | ❌ | ✅ | ✅ | ✅ |

**Módulos Gerenciales:** Ventas, RRHH, Horarios, Billetera, Comisiones

### Cómo Funcionan los Permisos:

```javascript
// 1. Usuario hace login con empresa y perfil
const usuario = { id: 1, empresa: 'NOVONET', perfil: 'SUPERVISOR', ... }

// 2. El JWT incluye empresa y perfil
const token = jwt.sign({ id, empresa, perfil }, SECRET)

// 3. En cada ruta protegida, validamos:
router.get('/indicadores', 
  auth,                              // Validar JWT existe
  requierePermiso('Indicadores'),    // Validar acceso al módulo
  controlador
)

// 4. requierePermiso valida:
//    - Si usuario está autenticado
//    - Si empresa tiene ese módulo configurado
//    - Si perfil de usuario tiene acceso
```

### Archivo Clave: `permisos.config.js`

Este archivo define **qué módulos puede ver cada perfil según empresa**.

**Para agregar un nuevo módulo:**

```javascript
const MODULOS = {
  // ... módulos existentes ...
  MI_NUEVO_MODULO: 'MiNuevoModulo',  // ← Agregar
};

const PERMISOS_POR_EMPRESA_PERFIL = {
  NOVONET: {
    USUARIO: [
      // ... módulos actuales ...
      MODULOS.MI_NUEVO_MODULO,  // ← Agregar aquí
    ],
    // Agregar en otros perfiles también
  },
  VELSA: {
    // Configurar para VELSA si aplica
  }
};
```

---

## 🔑 AUTENTICACIÓN

### Flujo de Login:

```
1. Usuario ingresa username/password
   ↓
2. Backend busca usuario en tabla 'users'
   ↓
3. Valida contraseña con bcrypt
   ↓
4. Genera JWT con: { id, empresa, perfil, rol }
   ↓
5. Frontend guarda JWT en localStorage
   ↓
6. Cada request incluye: Authorization: Bearer <TOKEN>
   ↓
7. Middleware 'auth' valida JWT válido
```

### Archivos Relacionados:

- **`routes/auth.routes.js`** - Endpoint /login
- **`middleware/auth.js`** - Validar JWT en cada request
- **`utils/token.js`** - Funciones de JWT
- **`services/email.service.js`** - Enviar códigos OTP

### Variables en JWT:

```javascript
{
  id: 1,                    // ID usuario
  rol: "SUPERVISOR",        // Rol actual
  empresa: "NOVONET",       // Empresa asignada
  perfil: "SUPERVISOR",     // Perfil (puede ser diferente de rol)
  iat: 1234567890,          // Timestamp creación
  exp: 1234567890 + 28800   // Expira en 8 horas
}
```

---

## 🛣️ API ENDPOINTS

### Autenticación

```
POST /api/auth/login
Body: { usuario, contraseña } o { username, password }
Response: { success, token, user: { id, usuario, perfil, nombre, url_reporte } }

POST /api/otp/generar
Generar código OTP para 2FA

POST /api/otp/verificar
Verificar código OTP
```

### Usuarios (solo ADMIN)

```
GET /api/usuarios
Listar todos los usuarios

POST /api/usuarios
Body: { nombres, apellidos, correo, cargo, perfil, empresa, usuario, password }

PUT /api/usuarios/:id
Actualizar usuario

DELETE /api/usuarios/:id
Eliminar usuario
```

### Indicadores NOVONET

```
GET /api/indicadores
Obtener indicadores NOVONET
```

### Indicadores VELSA

```
GET /api/indicadores-velsa
Obtener indicadores VELSA
```

### Redes

```
GET /api/redes
Análisis de redes
```

### Ventas

```
GET /api/ventas
Datos de ventas

POST /api/ventas
Crear venta
```

### Alertas

```
GET /api/alertas
Obtener alertas

POST /api/alertas
Crear alerta
```

### Broadcast (TV)

```
GET /api/broadcast
Contenido para pantalla
```

---

## 💾 BASE DE DATOS

### Tablas Principales:

#### `users` (Autenticación)
```sql
id, username, password_hash, nombres_completos, empresa, rol, activo, created_at
```

#### `usuarios` (Gestión)
```sql
id, nombres, apellidos, correo, cargo, perfil, empresa, usuario, contraseña, activo
```

#### `indicadores` (Datos NOVONET)
```sql
id, supervisor, asesor, mes, meta, realizado, ...
```

#### `indicadores_velsa` (Datos VELSA)
```sql
id, supervisor, asesor, mes, meta, realizado, ...
```

#### `ventas` (Registro de ventas)
```sql
id, usuario_id, monto, fecha, estado, ...
```

#### `alertas` (Notificaciones)
```sql
id, usuario_id, tipo, mensaje, leido, created_at
```

---

## 🎨 FRONTEND

### Páginas Principales:

1. **Login.jsx** - Autenticación (usuario/contraseña o OTP)
2. **HomeModules.jsx** - Dashboard con módulos disponibles
3. **Indicadores.jsx** - Métricas NOVONET
4. **IndicadoresVelsa.jsx** - Métricas VELSA
5. **Redes.jsx** - Análisis de redes
6. **VistaAsesor.jsx** - Supervisores ven equipo
7. **Ventas.jsx** - Registro de ventas
8. **BroadcastPanel.jsx** - Contenido para pantalla TV

### Stack Frontend:
- **React** - Componentes UI
- **Vite** - Build tool
- **Tailwind** - Estilos CSS
- **Axios** - Requests HTTP
- **Socket.io client** - Tiempo real

### Layouts:

**DashboardLayout.jsx** - Wrapper con menú + main content
```
┌─────────────────────────────┐
│ Header (Usuario, Logout)    │
├──────────┬──────────────────┤
│  Menú    │  Página actual   │
│          │                  │
│ • Inicio │                  │
│ • Ventas │                  │
│ • Redes  │                  │
│ • ...    │                  │
└──────────┴──────────────────┘
```

---

## 🚀 GUÍA DE DESARROLLO

### Cómo Correr el Proyecto Localmente:

#### Backend:
```bash
cd backend
npm install
npm run dev
# Abre en http://localhost:5000
```

#### Frontend:
```bash
cd frontend
npm install
npm run dev
# Abre en http://localhost:5173
```

### Variables de Entorno (.env):

```env
# SERVIDOR
NODE_ENV=development
PORT=5000

# JWT (Muy importante, cambiar en producción)
JWT_SECRET=tu_jwt_secret_aqui_minimo_32_caracteres

# BASE DE DATOS
DB_HOST=localhost
DB_USER=postgres
DB_PASSWORD=tu_contraseña
DB_NAME=erp_dev
DB_PORT=5432

# EMAIL (SendGrid)
SENDGRID_API_KEY=SG.xxxxxxxx
EMAIL_FROM=noreply@tudominio.com

# WhatsApp (Baileys)
WHATSAPP_NUMBER=5491234567890

# CORS
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
```

---

## 🆕 CÓMO AGREGAR NUEVOS MÓDULOS

### Paso 1: Definir el Módulo en Permisos

**Archivo:** `backend/src/config/permisos.config.js`

```javascript
const MODULOS = {
  // ... existentes ...
  MI_NUEVO_MODULO: 'MiNuevoModulo',  // ← AGREGAR AQUÍ
};
```

### Paso 2: Configurar Permisos por Perfil

```javascript
const PERMISOS_POR_EMPRESA_PERFIL = {
  NOVONET: {
    USUARIO: [ /* ... */ ],
    SUPERVISOR: [ /* ... */, MODULOS.MI_NUEVO_MODULO ],  // ← AGREGAR
    ANALISTA: [ /* ... */, MODULOS.MI_NUEVO_MODULO ],    // ← AGREGAR
    // ... resto
  },
  VELSA: {
    // Configurar si aplica para VELSA
  }
};
```

### Paso 3: Crear Ruta

**Archivo:** `backend/src/routes/miNuevoModulo.routes.js` (NUEVO)

```javascript
const express = require('express');
const auth = require('../middleware/auth');
const requierePermiso = require('../middleware/requierePermiso');
const router = express.Router();

// Ruta protegida: requiere estar autenticado + tener permiso
router.get('/', auth, requierePermiso('MiNuevoModulo'), async (req, res) => {
  try {
    // Lógica aquí
    res.json({ success: true, data: [] });
  } catch (error) {
    console.error('[miNuevoModulo] GET /:', error);
    res.status(500).json({ success: false, error: 'Error obteniendo datos' });
  }
});

module.exports = router;
```

### Paso 4: Registrar en app.js

**Archivo:** `backend/src/app.js`

```javascript
const miNuevoModuloRoutes = require('./routes/miNuevoModulo.routes');

// ... después del cors() ...
app.use('/api/mi-nuevo-modulo', miNuevoModuloRoutes);
```

### Paso 5: Crear Página en Frontend

**Archivo:** `frontend/src/pages/MiNuevoModulo.jsx` (NUEVO)

```jsx
import { useEffect, useState } from 'react';
import axios from 'axios';

export default function MiNuevoModulo() {
  const [datos, setDatos] = useState([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    const fetchDatos = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await axios.get('/api/mi-nuevo-modulo', {
          headers: { Authorization: `Bearer ${token}` }
        });
        setDatos(response.data.data);
      } catch (error) {
        console.error('Error:', error);
      } finally {
        setCargando(false);
      }
    };

    fetchDatos();
  }, []);

  if (cargando) return <div>Cargando...</div>;

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-4">Mi Nuevo Módulo</h1>
      {/* Contenido aquí */}
    </div>
  );
}
```

### Paso 6: Agregar Enlace en Menú

**Archivo:** `frontend/src/layouts/DashboardLayout.jsx`

Agregar en el menú:
```jsx
<li>
  <a href="/mi-nuevo-modulo">Mi Nuevo Módulo</a>
</li>
```

---

## 🛠️ TECNOLOGÍAS UTILIZADAS

### Backend:
- **Express.js** - Framework web
- **PostgreSQL** - Base de datos
- **JWT** - Autenticación
- **bcrypt** - Hash de contraseñas
- **Socket.io** - Comunicación tiempo real
- **Baileys** - WhatsApp
- **SendGrid** - Email
- **Node-cron** - Tareas automáticas
- **Multer** - Carga de archivos

### Frontend:
- **React** - UI framework
- **Vite** - Build tool
- **Tailwind CSS** - Estilos
- **Axios** - HTTP client
- **Socket.io-client** - Tiempo real

---

## 📞 CONTACTO Y SOPORTE

Para preguntas o problemas:
- Revisar la documentación de cada archivo
- Chequear logs en console
- Verificar variables de entorno (.env)

---

**Última actualización:** 2026-04-21  
**Mantenedor:** Tu nombre
