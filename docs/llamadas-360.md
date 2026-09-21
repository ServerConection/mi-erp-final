# Llamadas 360

## Operación

Abrir **Llamadas** en la portada o menú lateral (`/llamadas`). Acceso para perfiles autenticados excepto `ASESOR` y `USUARIO` (perfil histórico de asesores). Únicamente `ADMINISTRADOR` puede importar. Las restricciones se verifican en el servidor con el usuario autenticado, no solo ocultando botones.

El administrador selecciona de 1 a 8 CSV UTF-8, hasta 10 MB por archivo, 100.000 filas por archivo y 200.000 filas por carga. Se admiten nombres como `inbound_Netlife_20260701_20260919.csv`, `outbound_Ecuanet_20260701_20260919.csv` y sus equivalentes con prefijo `cdr_`. Las fechas del nombre pueden cambiar diariamente. XLSX es el formato de descarga; la carga conserva el formato CSV entregado por el proveedor.

Se valida la estructura de todos los archivos antes de escribir. Filas con fechas, números o estructura inválida se rechazan y contabilizan, con una muestra de hasta 25 errores por archivo. Un error de estructura de archivo cancela el lote completo. Un fallo de base de datos revierte todas las llamadas y auditorías del lote. Los números marcados cortos o excesivamente largos se conservan como intentos y se señalan en calidad de datos.

Cada carga registra usuario, fecha, nombre/hash del archivo y cantidades nuevas, repetidas y rechazadas. El tablero muestra las últimas 30 cargas; la base conserva el historial completo. Se pueden cargar archivos acumulativos o de días separados.

## Cálculos y límites

- Contestadas: `Disposicion = ANSWERED`; tasa = contestadas / todos los intentos filtrados × 100. No prueba contacto humano ni venta.
- Teléfonos únicos: valores marcados normalizados; no equivale a clientes válidos. Se normaliza `0` nacional a `593` cuando tiene diez dígitos y se corrige el prefijo redundante `5930` en números de trece dígitos. No se adivinan otros prefijos ni se eliminan intentos fallidos.
- Intentos por teléfono: intentos / teléfonos únicos del conjunto filtrado.
- Duración: suma literal de Duracion. Facturados: suma de Segundos Facturados. No se etiquetan como tiempo de conversación ni ocupación.
- Espera media: promedio de Tiempo Espera en llamadas entrantes. Salientes carecen de este dato; se muestran sin valor.
- Horarios: hora de origen sin conversión. La zona del proveedor no está verificada. Mejores horas son una orientación por porcentaje de ANSWERED con al menos 30 intentos.
- Calidad: números fuera de 8 a 15 dígitos se señalan como atípicos, no como necesariamente inválidos. Todos los intentos permanecen en el denominador.
- Costos: valores reportados sin asumir moneda; cero no demuestra gratuidad.
- Cobertura muestra el histórico completo por empresa y dirección, independiente del filtro de fechas. Días sin llamadas no demuestran indisponibilidad técnica.
- No hay información para ocupación, disponibilidad del sistema, contacto humano confirmado o conversión comercial.
- El CSV no incluye identificador de llamada. La huella incluye empresa, dirección, fecha, agente normalizado, teléfono, duración, segundos facturados, espera, resultado y costo. Filas idénticas cuentan una vez, incluso entre archivos `cdr_`. Una corrección con valores diferentes se considera otra observación; sin ID no es posible conciliarla inequívocamente. No subir archivos históricos corregidos esperando un reemplazo automático.
- Exportación XLSX: hasta 100.000 filas filtradas, con 11 hojas: resumen, empresas, diario, agentes, horas, día/hora, resultados, detalle, cobertura, últimas cargas y metodología. Para más registros dividir el período. Teléfonos exportados como texto.

## Activación

1. Con autorización para la base destino, ejecutar `backend/src/migrations/20260919_llamadas_analitica.sql`. Crea solamente `llamadas_cdr`, `llamadas_cdr_cargas` e índices; no modifica tablas existentes. Se probó en PostgreSQL 18 temporal local.
2. Publicar backend y frontend del mismo cambio. La ruta `/api/llamadas/analitica` se integra en `llamadas.routes.js`, ya montado por el monolito y el servicio de analítica NOVONET; el gateway existente cubre esa ruta.
3. Configurar `VITE_API_URL` apuntando al backend (con o sin sufijo `/api`). Si frontend y API comparten origen se admite valor vacío.
4. Iniciar sesión como administrador, cargar los CSV y confirmar el resumen. Verificar un perfil de supervisión sin carga y un asesor sin acceso. La migración ausente devuelve un error 503 explícito, no un tablero de ceros.

No se aplicó la migración ni se cargaron datos en producción durante el desarrollo. No se hizo push ni despliegue.

## Verificación local

Pruebas unitarias y JWT real (BD simulada para identidad):

```powershell
cd backend
node --test test/llamadasAnalitica.test.js test/llamadasAnalitica.auth.test.js
```

Pruebas integradas opcionales: requieren PostgreSQL descartable en `127.0.0.1:55439`, usuario `llamadas_test`. El test limpia las dos tablas del módulo de esa base temporal. Nunca usar la URL de producción.

```powershell
$env:LLAMADAS_TEST_DATABASE_URL='postgresql://llamadas_test@127.0.0.1:55439/postgres'
$env:LLAMADAS_TEST_CSV_DIR='C:\Users\Usuario-PC\Downloads'
node --test test/llamadasAnalitica.test.js test/llamadasAnalitica.auth.test.js test/llamadasAnalitica.integration.test.js
```

Los ocho CSV originales: 109.714 filas, 54.857 únicas, 54.857 repetidas, 0 rechazadas; segunda carga: 0 nuevas. 44.574 registros ANSWERED; 10 intentos con números atípicos. Los agregados SQL se reconciliaron con un cálculo independiente en JavaScript. Se verificaron límites de fecha, filtros, reversión transaccional, autorización HTTP, carga multipart de ocho archivos, y Excel leído de nuevo con 54.857 filas.

Entorno de pruebas: Node 24.14.1 instalado localmente; el repositorio declara Node 20–22. No se verificó ejecución en esos runtimes. Frontend compilado con Vite. Vista local del componente conectada a PostgreSQL temporal, con identidad ficticia aislada; no equivale a verificación del ERP desplegado.

## Entrega del 21 de septiembre de 2026

Se agregó `backend/scripts/llamadas-db.js` para comprobar e instalar exclusivamente las tablas de Llamadas. No se ejecuta al arrancar el ERP. No carga `config/db`, evitando sus tareas automáticas.

Desde `backend`:

```powershell
node scripts/llamadas-db.js --check
# Ejecutar únicamente tras autorizar la base destino:
node scripts/llamadas-db.js --apply
```

La conexión usa `LLAMADAS_DATABASE_URL` explícita o los valores DB_* de `backend/.env`. No imprime credenciales. `--check` es de lectura: devuelve las tablas y columnas faltantes. `--apply` ejecuta la migración versionada; se verificó dos veces sobre PostgreSQL temporal con resultados correctos. La comprobación valida presencia de columnas, no sustituye una auditoría completa de tipos o restricciones si alguien modifica esas tablas manualmente.

Verificación del 21/09: 15 pruebas aprobadas con los ocho CSV; compilación Vite correcta. Advertencia ajena al módulo: clave zIndex duplicada en BroadcastPanelCanal.jsx. Consulta de solo lectura a bddgeneral: ambas tablas de Llamadas ausentes. Ninguna migración ni carga ejecutada en esa base.