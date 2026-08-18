# Correo para el área comercial — Líneas de envío WhatsApp

**Asunto sugerido:** Líneas de envío WhatsApp: cómo nombrarlas y qué avisarnos

---

Equipo,

Les cuento un cambio en las líneas de envío masivo por WhatsApp y qué necesitamos de ustedes para que funcione.

**Qué cambió**

Cada línea de envío ahora sale a internet por su propia conexión, separada de las demás. Antes todas salían por la misma: si WhatsApp bloqueaba un número, dejaba en riesgo a los otros. Ahora cada una va por su lado, así que un bloqueo ya no arrastra al resto.

Para que quede claro: esto **no evita los bloqueos, los contiene**. Un número se sigue bloqueando si envía a personas que lo reportan, si es muy nuevo o si manda demasiado en poco tiempo. Lo que ganamos es que el problema quede aislado en esa línea.

**Cómo nombrar las líneas nuevas (esto es lo importante)**

La protección se activa **solo si la línea se llama `ENVIO_` seguido de un número**. Si se le pone otro nombre, queda sin protección y no nos vamos a dar cuenta.

Hoy están ocupados **ENVIO_1, ENVIO_2, ENVIO_3 y ENVIO_4**. Entonces:

- La próxima línea que creen debe llamarse **ENVIO_5**
- La siguiente, **ENVIO_6**, y así sucesivamente

**No reutilicen un número ya usado**, aunque esa línea haya sido bloqueada y dada de baja. Siempre continúen con el siguiente disponible.

**Avísennos a Desarrollo**

Cada vez que creen una línea nueva, escríbannos con estos tres datos:

1. Nombre de la línea (ej. ENVIO_5)
2. Número de WhatsApp que van a vincular
3. Quién la va a operar

Lo pedimos porque la cantidad de conexiones protegidas es **limitada**. Si se crean líneas sin avisar, podemos quedarnos sin cupo sin enterarnos, y a partir de ahí las nuevas quedarían desprotegidas — que es justo lo que estamos tratando de evitar.

Cualquier duda me escriben.

Saludos,

**Bryan Pineda**
Desarrollo — ERP

---

## Notas internas (no enviar)

- Ajusta la firma y el destinatario antes de enviar.
- Si más adelante cambias el patrón de nombres (variable `PROXY_PATRON_LINEA`),
  actualiza este correo antes de reenviarlo.
- El límite real hoy: 30 IPs móviles de Ecuador en el pool contratado.
  Conviene revisar periódicamente cuántas se han quemado:
  `SELECT motivo, COUNT(*) FROM proxy_puertos_quemados GROUP BY motivo;`
