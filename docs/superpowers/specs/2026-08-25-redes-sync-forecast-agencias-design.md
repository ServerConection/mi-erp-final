# Sincronización manual y forecast de inversión por agencia

## Objetivo

Permitir que un administrador recupere inmediatamente la inversión de todas las agencias WinTracker configuradas, vea el resultado de cada consulta y mantenga actualizados Monitoreo, Reporte Data y Agencias sin depender exclusivamente del cron de 30 minutos.

## Alcance

- NOVONET: ARTS y VIDIKA, además de futuras agencias incluidas en la configuración WinTracker.
- Botón `Forzar inversión` disponible en Redes y en la pestaña Agencias.
- Botón `Actualizar líneas` en Agencias para releer orígenes, asignaciones y resumen.
- Forecast mensual por agencia dentro de Reporte Data.
- No cambia las reglas actuales de leads, gestionables, Jotform ni indicadores comerciales.

## Backend

Se añadirá un endpoint autenticado y restringido a usuarios que no sean asesores. El endpoint llamará al servicio WinTracker existente para el rango solicitado, por defecto desde el primer día del mes hasta hoy en Ecuador.

La sincronización devolverá un resultado independiente por agencia con estado, monto del último día, fechas consultadas, días guardados y error seguro. La falla de una agencia no bloqueará las demás. Un bloqueo en memoria impedirá ejecutar dos sincronizaciones manuales simultáneas en la misma instancia.

El servicio usará la zona horaria `America/Guayaquil` para determinar el día actual. Las claves API continuarán únicamente en variables de entorno; nunca se enviarán al frontend ni se escribirán en logs.

Reporte Data seguirá usando `novonet_inversion_redes` como fuente primaria y la vista materializada como respaldo. Su respuesta incorporará un resumen por agencia con:

- inversión acumulada;
- días con datos;
- primera y última fecha disponible;
- promedio diario observado;
- días transcurridos y restantes;
- proyección de cierre mensual;
- gasto proyectado restante;
- indicador de atraso cuando la última fecha sea anterior a hoy.

La fórmula aprobada es `promedio diario observado × días totales del mes`. El promedio usa exclusivamente los días con inversión registrada para esa agencia. El gasto restante es `máximo(proyección - acumulado, 0)`.

## Frontend

El botón `Forzar inversión` mostrará estado de carga y un resumen por agencia. Al finalizar correctamente, incrementará el ciclo de actualización de Redes y volverá a solicitar Reporte Data y Agencias.

En Agencias, `Actualizar líneas` volverá a consultar la lista de orígenes y el resumen por agencia. Las operaciones de asignar, cambiar o quitar una agencia usarán el mismo refresco para que la pantalla no conserve datos anteriores.

Reporte Data añadirá un bloque compacto de forecast por agencia con última actualización, acumulado, proyección, restante y estado. Las agencias sin clave o sin datos mostrarán una alerta explícita, no un cero ambiguo.

## Errores y seguridad

- HTTP 409 si ya existe una sincronización manual en curso.
- HTTP 502 solo cuando ninguna agencia pueda consultarse; los éxitos parciales responderán 200 con detalle.
- Mensajes seguros sin API keys ni URL con credenciales.
- El botón conservará los datos visibles si la consulta falla.
- El endpoint exige JWT y el middleware `noAsesor`.

## Pruebas y validación

- Prueba del servicio: resultados independientes por agencia y fechas Ecuador.
- Prueba del controlador: éxito total, parcial, bloqueo concurrente y error total.
- Prueba del forecast: consolidación ARTS/VIDIKA, proyección, restante y atraso.
- Prueba del frontend o utilidad: recarga posterior a una sincronización exitosa.
- Verificación real en modo lectura/escritura idempotente contra WinTracker y la tabla de inversión.
- Build del frontend y revisión de `git diff --check` antes de entregar comandos Git.

## Despliegue

Requiere desplegar el backend analítico que expone `/api/redes` y `erp-workers`. `erp-workers` debe contener `WINTRACKER_APIKEY_ARTS` y `WINTRACKER_APIKEY_VIDIKA`. La sincronización manual funcionará desde el backend analítico únicamente si ese servicio también dispone de ambas variables; por ello las mismas claves deberán configurarse allí.
