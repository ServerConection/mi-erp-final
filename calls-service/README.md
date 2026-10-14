# calls-service — Llamadas WhatsApp (NOVONET / VELSA)

Softphone para que los asesores llamen y reciban llamadas de WhatsApp (Business Calling API), con dashboard comercial y módulo de configuración para vincular cuentas (p. ej. la cuenta de producción de la jefa) sin tocar código.

Sigue el mismo patrón que `erp-wabot`: **servicio aparte en Render, mismo repo, misma base y mismo login del ERP**. Un deploy del ERP no corta llamadas en curso.

## Cómo se integra con el ERP
| Pieza | Dónde |
|---|---|
| Menú **WaBot Masivos → Llamadas WA** | `frontend/src/layouts/DashboardLayout.jsx` |
| Página que embebe el módulo (iframe) | `frontend/src/pages/LlamadasWhatsApp.jsx` → ruta `/whatsapp/llamadas` |
| Login | Mismo JWT del ERP (`JWT_SECRET`). No hay usuarios aparte |
| Base | `bddgeneral` (variables `DB_*`). Tablas propias con prefijo `calls_` |
| Usuarios | Tabla `usuarios` del ERP (solo lectura) + `calls_agents` (quién puede llamar y con qué cuenta) |

Roles: `ADMINISTRADOR` → admin (configura todo) · `ASESOR` → asesor (solo lo suyo) · demás perfiles → supervisor (ve dashboard de todos).

## Módulos
- **Llamar**: marcar, permiso de llamada, colgar/silenciar, entrantes con "Contestar" (el primero que contesta se la queda), tipificación al terminar, "Mi día".
- **Dashboard**: tasa de contacto, duración, ventas y conversión, costo (pulsos de 6 s), costo por contacto/venta, mejor hora, ranking de asesores, llamadas sin tipificar, entrantes perdidas y lectura automática.
- **Historial**: filtros y exportación CSV (Excel).
- **Configuración** (admin): cuentas WhatsApp (token cifrado, probar conexión, activar llamadas, webhook), asesores habilitados + cuenta, tipificaciones y textos.

## Desplegar en Render
Servicio `calls-service` (ver `render.yaml`): Root Directory `calls-service`, Build `npm install`, Start `npm start`, Health `/health`, 1 instancia.

Variables:
- Environment Group **erp-shared** (DB_*, JWT_SECRET) — ya existe.
- `CALLS_ENCRYPTION_KEY`: 32+ caracteres aleatorios. **No cambiarla después** de vincular cuentas.
- `PUBLIC_URL`: URL pública del servicio (para el webhook).
- `ERP_ORIGINS`: URL(s) del frontend del ERP que pueden embeberlo, separadas por coma.
- `DB_POOL_MAX=4` (comparte el límite de conexiones de Postgres con el ERP).

En el **frontend del ERP**: `VITE_CALLS_URL` = URL pública del calls-service.

Las tablas `calls_*` se crean solas al arrancar (también está `MIGRACION_CALLS_WHATSAPP.sql` para correr en pgAdmin si prefieres).

## Vincular la cuenta de la jefa
1. ERP → Llamadas WA → Configuración → Cuentas WhatsApp → Phone Number ID, WABA ID, token permanente (usuario del sistema) y App Secret.
2. **Probar conexión** → debe mostrar nombre verificado y calidad.
3. Meta Developers → Webhook = `PUBLIC_URL/webhook` + verify token de la cuenta; suscribir el campo `calls`.
4. **Activar llamadas** → Configuración → Asesores: habilitar a los 2 asesores del piloto con esa cuenta.

## Atajo "LLAMAR" desde otras pantallas
`/whatsapp/llamadas?to=5939XXXXXXXX&name=Nombre&ref=ID_TRATO`

## Correr local
```bash
cp .env.example .env   # DB_* y JWT_SECRET iguales al backend del ERP + CALLS_ENCRYPTION_KEY
npm install
npm run dev            # http://localhost:3090 (abrirlo desde el ERP local con VITE_CALLS_URL=http://localhost:3090)
```

## Notas
- Solo se cobran las llamadas que inicia la empresa; las del cliente son gratis. Tarifa Ecuador por defecto 0.01392 USD/min (editable por cuenta).
- El cliente debe dar permiso de llamada antes de que se le pueda llamar (botón **Permiso**).
