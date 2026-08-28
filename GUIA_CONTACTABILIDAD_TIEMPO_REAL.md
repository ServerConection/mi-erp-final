# Contactabilidad en tiempo real — guía de puesta en marcha

Objetivo: que **la hora del último mensaje del cliente y del asesor** esté al día
al segundo, y que el tablero muestre quién está esperando, hace cuánto y con qué
gravedad — sin reventar el límite de la API de Bitrix24.

---

## 1. Cómo se mantiene fresco el dato (tres capas)

| Capa | Qué hace | Latencia | Si falla |
|---|---|---|---|
| **Webhook Bitrix** | Bitrix empuja cada mensaje de Open Lines; el backend actualiza SOLO ese lead | segundos | lo cubre el cron corto |
| **Cron corto** | Cada 1–2 min refresca los chats "vivos" (pendientes + actividad reciente) y reintenta los eventos fallidos | 1–2 min | lo cubre el ciclo largo |
| **Ciclo largo** | Barrido completo de Bitrix cada 30 min (el que ya existía) | 30 min | queda registro en `contactabilidad_sync_runs` |

Ninguna capa depende de las otras. Ese es el punto: si una se cae, el número que
ve el usuario sigue siendo correcto, solo llega un poco más tarde.

**Salvaguardas incluidas**

- `pg_try_advisory_lock`: dos instancias del backend (Render escala procesos) nunca
  refrescan a la vez.
- Tope de leads por ciclo + concurrencia 3: no se supera el rate limit de Bitrix.
- Backoff exponencial: si Bitrix falla, el cron se espacia solo en vez de insistir.
- Inbox idempotente: un evento reenviado por Bitrix no duplica mensajes.
- Reintentos acotados (3): un evento imposible no entra en bucle infinito.

---

## 2. Migración de base de datos

Ejecutar en pgAdmin sobre `bddgeneral`, **después** de `contactabilidad.sql`:

```
backend/src/migrations/contactabilidad_tiempo_real.sql
```

Es idempotente: se puede volver a ejecutar sin romper nada.

Qué agrega: umbrales de SLA configurables, `chat_id` en el lead, tabla
`contactabilidad_eventos_inbox`, tabla `contactabilidad_vistas` (filtros
guardados), índices operativos y trazabilidad del origen de cada ciclo.

---

## 3. Variables de entorno (`backend/.env`)

```env
# --- Ya existentes ---
CONTACTABILIDAD_ENABLED=true
CONTACTABILIDAD_INTERVALO_MINUTOS=30
CONTACTABILIDAD_NOVONET_ENABLED=true
CONTACTABILIDAD_VELSA_ENABLED=true

# --- Nuevas: tiempo real ---
CONTACTABILIDAD_TIEMPO_REAL_ENABLED=true
CONTACTABILIDAD_TIEMPO_REAL_MINUTOS=2      # 1 a 30; 2 es un buen equilibrio
CONTACTABILIDAD_LEADS_POR_CICLO=60         # tope de chats por ciclo
CONTACTABILIDAD_VENTANA_ACTIVA_HORAS=48    # qué se considera un chat "vivo"

# --- Token del webhook (genera uno largo y aleatorio por empresa) ---
CONTACTABILIDAD_WEBHOOK_TOKEN_NOVONET=<64 caracteres aleatorios>
CONTACTABILIDAD_WEBHOOK_TOKEN_VELSA=<64 caracteres aleatorios>
```

Generar un token:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

> Si no defines los tokens, el webhook responde 404 y el sistema sigue
> funcionando solo con los crons. Nada se rompe.

---

## 4. Registrar el webhook en Bitrix24

En cada portal (NOVONET y VELSA):

1. **Aplicaciones → Desarrolladores → Otro → Webhook saliente**
2. **URL del manejador**:
   ```
   https://<tu-dominio>/api/webhooks/contactabilidad/NOVONET?token=<TOKEN_NOVONET>
   ```
3. **Eventos**:
   - `ONIMOPENLINESMESSAGEADD`  ← el importante (mensaje nuevo en el chat)
   - `ONCRMDEALUPDATE`          ← opcional, refresca al cambiar de etapa
4. Guardar.

**Verificación rápida**: abre en el navegador
`https://<tu-dominio>/api/webhooks/contactabilidad/NOVONET`
→ debe responder `{"success":true,"listo":true,"empresa":"NOVONET"}`.

Luego escribe un mensaje de prueba en un chat de Open Lines y revisa:

```sql
SELECT evento, estado, chat_id, recibido_at
FROM contactabilidad_eventos_inbox
ORDER BY recibido_at DESC LIMIT 10;
```

Debe aparecer una fila `PROCESADO`. Si aparece `FALLIDO`, la columna
`error_detalle` dice exactamente por qué.

> El webhook está montado **antes** del rate limit global: Bitrix envía todos los
> eventos desde una sola IP y el límite por IP lo cortaría en horas pico.

---

## 5. Umbrales de gravedad

Se configuran en base de datos y el tablero los lee solo (cache de 60 s):

```sql
UPDATE contactabilidad_config
SET sla_alerta_minutos = 15,   -- amarillo
    sla_grave_minutos  = 30,   -- naranja
    sla_critico_minutos = 60   -- rojo
WHERE id = 1;
```

La regla es única y vive en `contactabilidad.severidad.js`: la usan el tablero,
los filtros, las alertas y el export. No hay dos definiciones de "crítico".

---

## 6. Endpoints

Todos bajo `/api/bot-auditor/contactabilidad` (requieren sesión y permiso
`BotAuditor`):

| Método | Ruta | Para qué |
|---|---|---|
| GET | `/analytics` | Inteligencia completa + semáforo de gravedad |
| GET | `/alertas` | Consulta ligera, apta para auto-refresco cada 30 s |
| GET | `/filtros` | Catálogos reales con cascada por empresa y fechas |
| GET | `/estado` | Salud del pipeline: ciclos, eventos, frescura |
| GET | `/export` | CSV de lo que el usuario está viendo |
| GET/POST/DELETE | `/vistas` | Filtros guardados (propios y compartidos) |
| POST | `/refrescar/:empresa/:id` | Botón ⟳ por fila: trae ESE chat de Bitrix |
| POST | `/refrescar` | Solo ADMINISTRADOR: ciclo forzado (cooldown 60 s) |

Público, autenticado por token:

| POST | `/api/webhooks/contactabilidad/:empresa?token=…` | Eventos de Bitrix |

---

## 7. Qué ve el usuario

- **Alertas** (pestaña por defecto): tarjetas Crítico / Grave / En alerta / Al día,
  y desglose por **asesor**, **etapa** y **origen**. Un clic filtra el tablero.
- **Inteligencia**: rankings, heatmap horario, embudo y calidad de datos.
- **Operación**: detalle lead por lead con botón ⟳ individual.
- **Barra superior**: Actualizar, Traer de Bitrix (admin), selector de
  auto-refresco (30 s / 1 min / 5 min / apagado), "Datos hace X" e indicador de
  si el tiempo real está activo.
- **Cronómetros en vivo**: los minutos de espera avanzan en el navegador cada
  15 s, sin pedir datos al servidor.
- **Filtros**: empresa, origen, asesor, etapa, búsqueda libre, pendiente por,
  gravedad, tiempo esperando, temperatura, solo con conversación.
  Vistas guardadas (compartibles con el equipo) y enlace copiable.

---

## 8. Qué revisar si algo no cuadra

```sql
-- ¿Están llegando eventos del webhook?
SELECT estado, COUNT(*), MAX(recibido_at)
FROM contactabilidad_eventos_inbox
WHERE recibido_at >= NOW() - INTERVAL '1 hour' GROUP BY estado;

-- ¿Corren los ciclos?
SELECT empresa, origen, estado, iniciado_at, finalizado_at, error_resumen
FROM contactabilidad_sync_runs ORDER BY iniciado_at DESC LIMIT 20;

-- ¿Qué tan fresco está cada lead y por qué vía se actualizó?
SELECT empresa, origen_ultimo_dato, COUNT(*), MAX(actualizado_at)
FROM contactabilidad_leads GROUP BY 1,2;
```

El endpoint `GET /estado` devuelve las tres cosas juntas, y la barra del tablero
muestra "Tiempo real activo" o "Solo ciclo programado" según lo que encuentre.

---

## 9. Pruebas

```bash
cd backend  && node --test test/contactabilidad.*.test.js
cd frontend && node --test src/utils/contactabilidadAnalytics.test.js
```
