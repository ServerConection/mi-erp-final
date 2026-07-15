# Sincronizacion Jotform -> Postgres (NOVONET / VELSA)

## Que hace

Trae TODAS las submissions de dos formularios de Jotform:

- NOVONET: form id `213356674788673` -> tabla `public.jotform_submissions`
- VELSA: form id `251603619851660` -> tabla `public.jotform_submissions_velsa`

y las guarda en Postgres. Para los campos de seleccion (radio, dropdown,
checkbox) guarda el **texto visible** (ej. "ACTIVO") en vez del ID/valor
crudo que a veces devuelve la API de Jotform.

## Setup

1. Crear las tablas (una sola vez):
   ```
   psql -h TU_HOST -U TU_USUARIO -d TU_BASE -f sql/create_tables.sql
   ```
2. Instalar dependencias:
   ```
   pip install -r requirements.txt
   ```
3. Copiar `.env.example` a `.env` y completar los datos de conexion a Postgres
   (la API key de Jotform ya viene puesta).

## Antes de sincronizar de verdad: diagnostico

Corre primero esto para ver exactamente que preguntas tiene cada formulario,
sus opciones, y como llega una respuesta real:

```
python sync_jotform.py --diagnose novonet
python sync_jotform.py --diagnose velsa
```

Al final del reporte, si aparece un bloque `[ATENCION] Campos que NO se
pudieron resolver automaticamente`, significa que ese campo especifico es
probablemente un dropdown conectado a **otra tabla/fuente de datos dentro de
Jotform** (no una lista fija de opciones). En ese caso el ID que llega no se
puede traducir solo con las opciones del formulario: hay que identificar cual
es esa tabla origen en el builder de Jotform (Field Settings -> Data Source) y
yo agrego la resolucion contra esa fuente especifica. Pasame ese resultado del
diagnostico y lo ajustamos.

## Sincronizacion real

```
python sync_jotform.py
```

Hace upsert por `submission_id`: inserta lo nuevo y actualiza lo que ya existia
(no duplica).

## Importante sobre la programacion cada 20 minutos

Se probo ejecutar llamadas a `api.jotform.com` desde el sandbox de Cowork y el
proxy las bloquea (`blocked-by-allowlist`). Eso quiere decir que una tarea
programada de Cowork **no va a poder** llegar a la API de Jotform desde ahi.

Recomendacion: programar este script con el **Programador de tareas de
Windows** en tu propio equipo (o en el servidor donde corra el ERP), asi corre
con tu conexion normal a internet:

1. Abrir "Programador de tareas" de Windows.
2. Crear tarea basica -> Desencadenador: Diario, repetir cada 20 minutos.
3. Accion: iniciar programa
   - Programa: ruta a tu `python.exe`
   - Argumentos: `sync_jotform.py`
   - Iniciar en: esta carpeta (`...\ERP\V1\jotform_sync`)

Si prefieres, tambien se puede correr como servicio o con `schtasks` desde
linea de comandos. Cualquiera de las dos formas usa este mismo script.
