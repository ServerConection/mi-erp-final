# Bot Vendedor: conversaciones enfocadas y resilientes

## Objetivo

Mejorar la continuidad y el enfoque comercial del Bot Vendedor sin reemplazar el flujo existente, sin perder configuraciones guardadas y sin afectar WABOT, asesores humanos ni otros módulos del ERP.

## Alcance

- Agrupar mensajes consecutivos del cliente antes de solicitar una respuesta a la IA.
- Mantener un estado comercial persistente por conversación.
- Incluir ese estado en cada solicitud al modelo y actualizarlo de forma segura.
- Evitar preguntas repetidas y seleccionar el siguiente dato comercial faltante.
- Recuperar conversaciones cuando el proveedor de IA falla.
- Exponer métricas operativas y de avance en la pantalla actual.
- Añadir pruebas automatizadas de los comportamientos anteriores.

No incluye cambios a campañas, FlowEngine, Automarcador, credenciales, despliegues, merges ni publicación de ramas.

## Compatibilidad y preservación

- Las tablas nuevas y columnas adicionales se crearán con SQL idempotente.
- `bv_config`, `bv_conocimiento`, `bv_planes`, `bv_lineas` y `bv_nocturno` conservarán sus datos actuales.
- El prompt guardado en PostgreSQL continuará siendo la fuente activa; el archivo del repositorio seguirá siendo únicamente la semilla inicial.
- Las conversaciones que no tengan estado persistente continuarán funcionando y crearán su estado al recibir el siguiente mensaje.
- Cuando un asesor humano intervenga, se conservará la pausa actual del bot.
- Las respuestas seguirán usando los proveedores y modelos configurados actualmente.

## Diseño

### 1. Agrupación de mensajes

Cada conversación tendrá un acumulador en memoria. Al llegar un mensaje se reiniciará una ventana de espera configurable, con valor predeterminado de 5 segundos. Los mensajes recibidos durante esa ventana se combinarán en orden y se procesarán una sola vez.

La cola existente continuará garantizando exclusión mutua por conversación. El agrupador deberá descartar mensajes antiguos, grupos, broadcasts y conversaciones donde ya intervino un asesor, respetando las reglas actuales.

### 2. Estado comercial persistente

Se añadirá `public.bv_conversation_state`, identificada por `conversation_id`, con un documento JSONB versionado. Guardará únicamente datos comerciales necesarios:

- motivo y segmento;
- ciudad, sector y dirección;
- número de personas y usos;
- plan recomendado o elegido;
- forma de pago;
- documentos recibidos;
- paso actual, cierre y escalamiento;
- resumen corto y fecha de actualización.

El estado no almacenará claves, PIN, CVV ni códigos. Las actualizaciones deberán fusionar datos nuevos sin borrar valores válidos anteriores con campos vacíos.

### 3. Decisión del siguiente paso

Antes de generar la respuesta se construirá un contexto con:

1. prompt y reglas actuales;
2. conocimiento recuperado;
3. estado comercial persistente;
4. mensajes recientes agrupados.

El modelo devolverá texto para el cliente y un bloque interno estructurado. El servidor validará ese bloque, conservará solo campos admitidos y calculará el paso siguiente. La respuesta contestará primero cualquier pregunta directa y terminará con una sola pregunta sobre el siguiente dato faltante.

Si el bloque estructurado falta o es inválido, se enviará el texto válido y se mantendrá el estado previo; nunca se borrará información por una salida defectuosa del modelo.

### 4. Recuperación ante fallos

Los reintentos del proveedor se centralizarán para evitar ciclos anidados y esperas excesivas. Si los proveedores fallan:

- se registrará el error y la conversación quedará pendiente;
- se enviará como máximo un aviso temporal por ventana;
- se programará un reintento acotado mientras el proceso siga activo;
- al agotar el límite, se enviará el mensaje de escalamiento y se pausará el bot para esa conversación.

Los temporizadores se limpiarán al completar, escalar o detectar intervención humana.

### 5. Observabilidad

La vista de conversaciones mostrará, sin cambiar su control de acceso:

- paso comercial actual;
- porcentaje orientativo de avance;
- último error y cantidad de reintentos;
- mensajes agrupados;
- preguntas repetidas detectadas;
- cierres y escalamientos.

Las métricas serán operativas y no afirmarán una venta únicamente porque el modelo lo diga: el cierre seguirá requiriendo confirmación explícita del cliente.

## Pruebas

Las pruebas se escribirán antes de la implementación y cubrirán:

- tres mensajes rápidos producen una respuesta y una entrada combinada;
- mensajes separados fuera de la ventana producen respuestas independientes;
- datos existentes no se borran con valores vacíos;
- ciudad, uso o pago ya conocidos no vuelven a preguntarse;
- se responde primero la pregunta directa del cliente;
- una intervención humana cancela respuesta y reintentos;
- una caída temporal se recupera sin duplicar mensajes;
- una caída definitiva escala una sola vez;
- el cierre solo se marca después de confirmación explícita;
- migraciones repetidas no destruyen ni duplican datos.

También se ejecutarán comprobaciones de sintaxis del backend, pruebas específicas del bot y build del frontend.

## Criterios de aceptación

- Un grupo de mensajes rápidos recibe una sola respuesta coherente.
- El bot conserva y reutiliza los datos comerciales durante toda la conversación.
- No repite una pregunta cuya respuesta esté registrada en el estado.
- Siempre realiza como máximo una pregunta comercial por respuesta.
- Los fallos de IA terminan en recuperación o escalamiento, no en espera indefinida.
- La intervención humana sigue silenciando al bot.
- La configuración y los datos actuales permanecen intactos.
- Todas las pruebas nuevas y verificaciones existentes aplicables finalizan correctamente.

## Despliegue seguro

La implementación quedará solamente en el árbol local. No se hará push, merge ni despliegue. Antes de publicar se deberá revisar el diff, respaldar la configuración activa y ejecutar una prueba piloto con números controlados, sin contactar clientes reales hasta recibir autorización explícita.
