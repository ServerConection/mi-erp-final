# Auditoría de archivos de Windows

La auditoría registra cada ejecución en una sola fila de `public.auditoria_archivos_windows`. Los flujos de carpetas y los detalles de imágenes y descargas se guardan en columnas JSONB.

## Preparación

1. Ejecutar `backend/src/migrations/20261123_auditoria_archivos_windows.sql` en la base del ERP.
2. Crear un token de auditoría (`iat_`) con empresa `POR DEFINIR`. El token se muestra una sola vez y puede revocarse; esta modalidad permite usar el mismo token para NOVONET y VELSA.
3. Pegar el token completo en la variable `$Token` de `tools/Auditar-ArchivosWindows.ps1` y copiar el archivo al equipo que se va a revisar.

## Ejecución

Abrir PowerShell como el usuario que se auditará y ejecutar una sola línea:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\Auditar-ArchivosWindows.ps1"
```

El script preguntará `Empresa del equipo (NOVONET/VELSA)` y no continuará hasta recibir uno de esos dos valores.

Por defecto revisa `Downloads`, Escritorio y Documentos del perfil actual, incluidos elementos ocultos. Para rutas específicas:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\Auditar-ArchivosWindows.ps1" -Rutas "C:\Users\supervisor\Desktop","C:\Users\supervisor\Downloads"
```

La procedencia se obtiene del flujo NTFS `Zone.Identifier` (`HostUrl` y `ReferrerUrl`). El dato puede ser nulo si el navegador, una copia o el sistema de archivos eliminó esa metadata; no se infiere una procedencia inexistente.

## Consultas rápidas

```sql
SELECT id, empresa, equipo, usuario_windows, total_archivos, total_descargas,
       total_imagenes, total_carpetas, iniciada_en
FROM public.auditoria_archivos_windows
ORDER BY iniciada_en DESC;

SELECT carpetas
FROM public.auditoria_archivos_windows
WHERE id = :id;

SELECT archivos
FROM public.auditoria_archivos_windows
WHERE id = :id;
```
