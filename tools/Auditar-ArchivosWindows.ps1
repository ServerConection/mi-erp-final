[CmdletBinding()]
param(
    [string[]]$Rutas,
    [switch]$ExcluirOcultos
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# CONFIGURACION: pega aqui el token generado una sola vez.
$ApiUrl = 'https://erp-backend-v1-qhk2.onrender.com'
$Token = 'iat_9HIcMZTG'
if ($Token -notmatch '^iat_[A-Za-z0-9_-]+$') {
    throw 'Configura el token iat_ en la variable $Token dentro del script.'
}

do {
    $Empresa = (Read-Host 'Empresa del equipo (NOVONET/VELSA)').Trim().ToUpperInvariant()
    if ($Empresa -notin @('NOVONET', 'VELSA')) {
        Write-Host 'Empresa invalida. Escribe NOVONET o VELSA.' -ForegroundColor Red
    }
} while ($Empresa -notin @('NOVONET', 'VELSA'))

$versionScript = '1.0.0'
$inicio = [DateTimeOffset]::Now
$errores = [System.Collections.Generic.List[object]]::new()
$extensionesImagen = @('.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tif', '.tiff', '.heic')

if (-not $Rutas -or $Rutas.Count -eq 0) {
    $Rutas = @(
        (Join-Path $env:USERPROFILE 'Downloads'),
        [Environment]::GetFolderPath('Desktop'),
        [Environment]::GetFolderPath('MyDocuments')
    )
}

$rutasValidas = @($Rutas | Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Container) } |
    ForEach-Object { (Resolve-Path -LiteralPath $_).Path } | Sort-Object -Unique)
if ($rutasValidas.Count -eq 0) { throw 'No se encontro ninguna ruta valida para auditar.' }

function Get-OrigenDescarga {
    param([string]$Ruta)
    $resultado = @{ origen_url = $null; referencia_url = $null }
    try {
        $zona = Get-Content -LiteralPath ($Ruta + ':Zone.Identifier') -ErrorAction Stop
        foreach ($linea in $zona) {
            if ($linea -like 'HostUrl=*') { $resultado.origen_url = $linea.Substring(8) }
            elseif ($linea -like 'ReferrerUrl=*') { $resultado.referencia_url = $linea.Substring(12) }
        }
    } catch { }
    return $resultado
}

$archivos = [System.Collections.Generic.List[object]]::new()
$carpetas = [System.Collections.Generic.List[object]]::new()
$opciones = @{ Recurse = $true; Force = -not [bool]$ExcluirOcultos; ErrorAction = 'SilentlyContinue' }

foreach ($raiz in $rutasValidas) {
    try {
        $items = @(Get-ChildItem -LiteralPath $raiz @opciones)
        $filesRaiz = @($items | Where-Object { -not $_.PSIsContainer })
        $dirs = @((Get-Item -LiteralPath $raiz)) + @($items | Where-Object { $_.PSIsContainer })
        foreach ($archivo in $filesRaiz) {
            $origen = Get-OrigenDescarga -Ruta $archivo.FullName
            $esDescarga = $archivo.FullName.StartsWith((Join-Path $env:USERPROFILE 'Downloads'), [StringComparison]::OrdinalIgnoreCase)
            $esImagen = $extensionesImagen -contains $archivo.Extension.ToLowerInvariant()
            if ($esImagen -or $esDescarga) { $archivos.Add([ordered]@{
                ruta = $archivo.FullName; carpeta = $archivo.DirectoryName; nombre = $archivo.Name
                extension = $archivo.Extension.ToLowerInvariant(); tamano_bytes = $archivo.Length
                es_imagen = $esImagen
                es_descarga = $esDescarga; creada_en = $archivo.CreationTimeUtc.ToString('o')
                modificada_en = $archivo.LastWriteTimeUtc.ToString('o')
                origen_url = $origen.origen_url; referencia_url = $origen.referencia_url
            }) }
        }
        foreach ($dir in $dirs) {
            $prefijo = $dir.FullName.TrimEnd('\') + '\'
            $recursivos = @($filesRaiz | Where-Object { $_.FullName.StartsWith($prefijo, [StringComparison]::OrdinalIgnoreCase) })
            $directos = @($filesRaiz | Where-Object { $_.DirectoryName -eq $dir.FullName }).Count
            $imagenes = @($recursivos | Where-Object { $extensionesImagen -contains $_.Extension.ToLowerInvariant() }).Count
            $carpetas.Add([ordered]@{
                ruta = $dir.FullName; ruta_padre = $dir.Parent.FullName; nombre = $dir.Name
                creada_en = $dir.CreationTimeUtc.ToString('o'); modificada_en = $dir.LastWriteTimeUtc.ToString('o')
                archivos_directos = $directos; archivos_recursivos = $recursivos.Count
                imagenes_recursivas = $imagenes
            })
        }
    } catch {
        $errores.Add(@{ ruta = $raiz; error = $_.Exception.Message })
    }
}

$imagenesTotal = @($archivos | Where-Object { $_.es_imagen }).Count
$descargasTotal = @($archivos | Where-Object { $_.es_descarga }).Count
$archivosTotal = ($carpetas | Where-Object { $rutasValidas -contains $_.ruta } |
    Measure-Object -Property archivos_recursivos -Sum).Sum
$mac = @(Get-CimInstance Win32_NetworkAdapterConfiguration -ErrorAction SilentlyContinue |
    Where-Object { $_.IPEnabled -and $_.MACAddress } | Select-Object -First 1 -ExpandProperty MACAddress)
$esAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator)

$cuerpo = [ordered]@{
    empresa = $Empresa; equipo = $env:COMPUTERNAME; usuario_windows = $env:USERNAME
    perfil_usuario = $(if ($esAdmin) { 'ADMIN' } else { 'USUARIO' })
    mac = $(if ($mac.Count) { $mac[0] } else { $null }); raiz_perfil = $env:USERPROFILE
    rutas_auditadas = $rutasValidas; total_archivos = [int]$archivosTotal
    total_descargas = $descargasTotal; total_imagenes = $imagenesTotal; total_carpetas = $carpetas.Count
    iniciada_en = $inicio.ToString('o'); finalizada_en = [DateTimeOffset]::Now.ToString('o')
    version_script = $versionScript; errores = @($errores); carpetas = @($carpetas); archivos = @($archivos)
}

$endpoint = $ApiUrl.TrimEnd('/') + '/api/inventario-activos/auditoria/archivos'
$json = $cuerpo | ConvertTo-Json -Depth 8 -Compress
$respuesta = Invoke-RestMethod -Uri $endpoint -Method Post -ContentType 'application/json; charset=utf-8' `
    -Headers @{ Authorization = "Bearer $Token" } -Body ([Text.Encoding]::UTF8.GetBytes($json))

Write-Host "Auditoria guardada. ID: $($respuesta.data.id)"
Write-Host "Archivos: $archivosTotal | Descargas: $descargasTotal | Imagenes: $imagenesTotal | Carpetas: $($carpetas.Count)"
