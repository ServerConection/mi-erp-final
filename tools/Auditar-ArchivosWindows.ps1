[CmdletBinding()]
param([string[]]$Rutas, [switch]$ExcluirOcultos)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Copia este archivo fuera del repositorio y pega el token en esa copia local.
$ApiUrl = 'https://erp-backend-v1-qhk2.onrender.com'
$Token = 'iat_9zAvQoMBj-VLfE0KtLz8ClKTYWcGTYGzu8H-kAtu_T4'
if ($Token -notmatch '^iat_[A-Za-z0-9_-]+$') {
    throw 'Configura el token iat_ en la variable $Token dentro del script.'
}

do {
    $Empresa = (Read-Host 'Empresa del equipo (NOVONET/VELSA)').Trim().ToUpperInvariant()
    if ($Empresa -notin @('NOVONET', 'VELSA')) {
        Write-Host 'Empresa invalida. Escribe NOVONET o VELSA.' -ForegroundColor Red
    }
} while ($Empresa -notin @('NOVONET', 'VELSA'))

$inicio = [DateTimeOffset]::Now
$errores = [System.Collections.Generic.List[object]]::new()
$archivos = [System.Collections.Generic.List[object]]::new()
$carpetas = [System.Collections.Generic.List[object]]::new()
$extensionesImagen = @('.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tif', '.tiff', '.heic')

if (-not $Rutas -or $Rutas.Count -eq 0) {
    $Rutas = @((Join-Path $env:USERPROFILE 'Downloads'),
        [Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('MyDocuments'))
}
$rutasValidas = @($Rutas | Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Container) } |
    ForEach-Object { (Resolve-Path -LiteralPath $_).Path } | Sort-Object -Unique)
if ($rutasValidas.Count -eq 0) { throw 'No se encontro ninguna ruta valida para auditar.' }

function Get-OrigenDescarga {
    param([string]$Ruta)
    $resultado = @{ origen_url = $null; referencia_url = $null }
    try {
        foreach ($linea in (Get-Content -LiteralPath ($Ruta + ':Zone.Identifier') -ErrorAction Stop)) {
            if ($linea -like 'HostUrl=*') { $resultado.origen_url = $linea.Substring(8) }
            elseif ($linea -like 'ReferrerUrl=*') { $resultado.referencia_url = $linea.Substring(12) }
        }
    } catch { }
    return $resultado
}

$archivosTotal = 0
$descargasTotal = 0
$imagenesTotal = 0
$opciones = @{ Recurse = $true; Force = -not [bool]$ExcluirOcultos; ErrorAction = 'SilentlyContinue' }

foreach ($raiz in $rutasValidas) {
    Write-Host "Revisando $raiz ..." -ForegroundColor Cyan
    try {
        $items = @(Get-ChildItem -LiteralPath $raiz @opciones)
        $files = @($items | Where-Object { -not $_.PSIsContainer })
        $dirs = @((Get-Item -LiteralPath $raiz)) + @($items | Where-Object { $_.PSIsContainer })
        $archivosTotal += $files.Count

        $directos = @{}; $recursivos = @{}; $imagenes = @{}
        foreach ($dir in $dirs) {
            $directos[$dir.FullName] = 0; $recursivos[$dir.FullName] = 0; $imagenes[$dir.FullName] = 0
        }

        foreach ($archivo in $files) {
            $extension = $archivo.Extension.ToLowerInvariant()
            $esImagen = $extensionesImagen -contains $extension
            $esDescarga = $archivo.FullName.StartsWith((Join-Path $env:USERPROFILE 'Downloads'), [StringComparison]::OrdinalIgnoreCase)
            if ($esImagen) { $imagenesTotal++ }
            if ($esDescarga) { $descargasTotal++ }

            if ($directos.ContainsKey($archivo.DirectoryName)) { $directos[$archivo.DirectoryName]++ }
            $actual = $archivo.DirectoryName
            while ($actual -and $recursivos.ContainsKey($actual)) {
                $recursivos[$actual]++
                if ($esImagen) { $imagenes[$actual]++ }
                $padre = [IO.Directory]::GetParent($actual)
                $actual = if ($null -eq $padre) { $null } else { $padre.FullName }
            }

            if ($esImagen -or $esDescarga) {
                $origen = Get-OrigenDescarga -Ruta $archivo.FullName
                $archivos.Add([pscustomobject]@{
                    ruta=$archivo.FullName; carpeta=$archivo.DirectoryName; nombre=$archivo.Name
                    extension=$extension; tamano_bytes=$archivo.Length; es_imagen=$esImagen
                    es_descarga=$esDescarga; creada_en=$archivo.CreationTimeUtc.ToString('o')
                    modificada_en=$archivo.LastWriteTimeUtc.ToString('o')
                    origen_url=$origen.origen_url; referencia_url=$origen.referencia_url
                })
            }
        }

        foreach ($dir in $dirs) {
            $rutaPadre = if ($null -eq $dir.Parent) { $null } else { $dir.Parent.FullName }
            $carpetas.Add([pscustomobject]@{
                ruta=$dir.FullName; ruta_padre=$rutaPadre; nombre=$dir.Name
                creada_en=$dir.CreationTimeUtc.ToString('o'); modificada_en=$dir.LastWriteTimeUtc.ToString('o')
                archivos_directos=[int]$directos[$dir.FullName]
                archivos_recursivos=[int]$recursivos[$dir.FullName]
                imagenes_recursivas=[int]$imagenes[$dir.FullName]
            })
        }
        Write-Host "Completado: $($files.Count) archivos." -ForegroundColor Green
    } catch {
        $errores.Add([pscustomobject]@{ ruta=$raiz; error=$_.Exception.Message })
        Write-Host "No se pudo revisar $raiz" -ForegroundColor Yellow
    }
}

$mac = @(Get-CimInstance Win32_NetworkAdapterConfiguration -ErrorAction SilentlyContinue |
    Where-Object { $_.IPEnabled -and $_.MACAddress } | Select-Object -First 1 -ExpandProperty MACAddress)
$esAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator)
$cuerpo = [ordered]@{
    empresa=$Empresa; equipo=$env:COMPUTERNAME; usuario_windows=$env:USERNAME
    perfil_usuario=$(if ($esAdmin) { 'ADMIN' } else { 'USUARIO' })
    mac=$(if ($mac.Count) { $mac[0] } else { $null }); raiz_perfil=$env:USERPROFILE
    rutas_auditadas=$rutasValidas; total_archivos=$archivosTotal; total_descargas=$descargasTotal
    total_imagenes=$imagenesTotal; total_carpetas=$carpetas.Count
    iniciada_en=$inicio.ToString('o'); finalizada_en=[DateTimeOffset]::Now.ToString('o')
    version_script='1.1.0'; errores=@($errores); carpetas=@($carpetas); archivos=@($archivos)
}

Write-Host 'Enviando auditoria al ERP ...' -ForegroundColor Cyan
$endpoint = $ApiUrl.TrimEnd('/') + '/api/inventario-activos/auditoria/archivos'
$json = $cuerpo | ConvertTo-Json -Depth 8 -Compress
$bytes = [Text.Encoding]::UTF8.GetBytes($json)
Write-Host ("Tamano del envio: {0:N2} MB" -f ($bytes.Length / 1MB)) -ForegroundColor Cyan
try {
    $respuesta = Invoke-RestMethod -Uri $endpoint -Method Post -ContentType 'application/json; charset=utf-8' `
        -Headers @{ Authorization = "Bearer $Token" } -Body $bytes
} catch {
    $detalle = $_.Exception.Message
    if ($_.Exception.Response) {
        try {
            $stream = $_.Exception.Response.GetResponseStream()
            $reader = [IO.StreamReader]::new($stream)
            $contenido = $reader.ReadToEnd()
            if ($contenido) { $detalle = $contenido }
        } catch { }
    }
    throw "El ERP rechazo la auditoria: $detalle"
}
Write-Host "Auditoria guardada. ID: $($respuesta.data.id)" -ForegroundColor Green
Write-Host "Archivos: $archivosTotal | Descargas: $descargasTotal | Imagenes: $imagenesTotal | Carpetas: $($carpetas.Count)"
