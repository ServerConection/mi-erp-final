# Inbox a comentarios internos de NOVONET

Al recibir del cliente o enviar desde Inbox en una conversación vinculada a una negociación de NOVONET,
el backend guarda un comentario en el historial de esa negociación. El comentario
incluye texto, cliente o asesor de ERP, número, hora de Ecuador y una referencia única.
La autoría técnica en Bitrix corresponde al usuario del webhook; el asesor real
figura en el texto. Los adjuntos se registran por nombre, sin copiar su contenido.

El destino se captura antes de enviar: cambiar después el ID del chat no mueve
los mensajes ya preparados. Al vincular un ID nuevo se valida su existencia en
NOVONET. Esta validación no demuestra que el asesor haya elegido al cliente correcto.

## Alcance

- Nuevos mensajes del cliente y envíos manuales de Inbox con ID de negociación y línea NOVONET.
- Líneas sin propietario usan la empresa del usuario que envía; sus entrantes no se copian porque no se puede determinar la empresa.
- No se importa historial ni se copian campañas, bots o envíos
  desde el teléfono. No se habilita Bitrix a WhatsApp.
- El comentario es interno al CRM, visible según permisos de la negociación.
- Los mensajes de texto admiten hasta 50 000 caracteres para evitar truncar la copia.

## Activación y despliegue

1. Integrar mediante PR y desplegar el commit en el servicio que ejecuta Wabot
   (`start:wabot` o el monolito `start`). Mantener una sola instancia de Wabot.
2. El servicio necesita la variable existente `BITRIX_NOVONET_URL`, correspondiente
   al portal `novonet.bitrix24.es`, con acceso CRM. No requiere OAuth ni Canales Abiertos.
3. La tabla `inbox_bitrix_notes` y sus índices se crean de forma idempotente al
   iniciar el trabajador o preparar el primer envío. También se puede aplicar
   `backend/src/migrations/inbox_bitrix_notes.sql` previamente.
4. Está habilitado por defecto cuando existe la credencial. Para desactivar tanto
   captura como procesamiento, establecer `WA_INBOX_BITRIX_NOTES=false` y reiniciar.
   Reactivar procesa los trabajos que ya estaban pendientes; no importa historial.
5. Probar un envío habitual en Inbox con un ID válido y verificar un único comentario
   en esa negociación. Comprobar tanto el texto como el asesor y la hora.

## Recuperación y seguimiento

La intención se persiste antes de enviar WhatsApp. Si falla ese guardado, el envío
no se ejecuta. Si WhatsApp rechaza el envío, el trabajo queda `failed` y no publica
un comentario de éxito. Si Bitrix falla, el envío de WhatsApp no se repite: solo se
reintenta el comentario con espera creciente hasta una hora. Los errores se guardan
por código, sin credenciales ni texto del mensaje en los logs de sincronización.

El trabajador inicia un ciclo cada 60 segundos y al arrancar el servicio. Procesa en serie hasta 100 notas o 45 segundos de trabajo por ciclo; una llamada en curso puede exceder ese tiempo. Con acumulación o errores la demora puede superar un minuto.
Reclama trabajos con `SKIP LOCKED`; tras un reinicio puede recuperar una reserva
abandonada en treinta minutos. Antes de repetir un POST ambiguo busca la referencia
en los comentarios existentes. Si la reconciliación excede cien páginas, conserva
el trabajo pendiente en lugar de arriesgar un duplicado.

El ID de WhatsApp se genera y persiste antes del envío. Las confirmaciones que no
se pueden guardar se reintentan al recuperarse PostgreSQL. Tras un reinicio, los
acuses de WhatsApp permiten confirmar la cola mediante ese ID aunque no exista
todavía el mensaje local; también se recupera desde `messages.metadata.inbox_bitrix_note_id`.
Si el proceso muere después de que WhatsApp acepte el envío y no vuelve a recibirse
ningún acuse ni existe recibo local, queda `waiting_send`: requiere comprobación
manual, nunca reenvío automático. Bitrix no ofrece una clave de idempotencia para
comentarios: la reconciliación reduce duplicados, pero no promete exactamente una
publicación si un POST remoto completa mucho después de agotar el tiempo de espera.

```sql
SELECT status, count(*), min(created_at) AS mas_antiguo
FROM inbox_bitrix_notes GROUP BY status;

SELECT id, status, attempts, last_error, created_at, updated_at
FROM inbox_bitrix_notes
WHERE status IN ('retry','waiting_send','processing')
ORDER BY created_at LIMIT 50;
```

Reversión: desactivar la variable anterior o desplegar el commit previo. Conservar
la tabla para trazabilidad y recuperación; no es necesario eliminar datos.

## Verificación automatizada

```sh
node --test backend/test/inbox-bitrix-notes.test.js backend/test/inbox-bitrix-controller.test.js
```

`backend/test/inbox-bitrix-postgres.test.js` se ejecuta con `TEST_DATABASE_URL`.
Usa tablas temporales que ocultan los nombres de producción dentro de una sola
conexión y termina con `ROLLBACK`; las llamadas Bitrix son simuladas. Comprueba
persistencia, reintento, ausencia de publicación antes de enviar, fallos WhatsApp
y recuperación de recibos, captura entrante, duplicados y exclusión de otras empresas. No inicia sesiones ni envía mensajes de WhatsApp reales.

Los entrantes se guardan junto con su nota pendiente en una sola operación SQL. Solo los mensajes insertados por primera vez generan notas. Se captura el ID vinculado en ese momento. Al reconectar WhatsApp pueden recuperarse mensajes de los últimos 15 minutos que aún no existan en Inbox; no se importa el historial completo.
