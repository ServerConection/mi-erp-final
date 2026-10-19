<#
.SYNOPSIS
    Script de auditoria de hardware y seguridad para ERP Novo Core.
    Compatible con Windows 10/11 sin instalaciones previas.
#>

$ApiUrl = "https://erp-backend-v1-qhk2.onrender.com/api/inventario-activos/auditoria"
$ApiToken = "iat_F3xEA3E6Iw2v2kQooZEAVa5VTy0xYWNV8xWV2Q4zJEI"

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13
$ErrorActionPreference = "SilentlyContinue"

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "   RECOLECCION DE AUDITORIA TI - PRODUCCION  " -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan

# 1. Direccion MAC activa fisica
$adapters = Get-CimInstance Win32_NetworkAdapterConfiguration | Where-Object { 
    $_.IPEnabled -eq $true -and $_.MACAddress -and $_.Description -notmatch "Virtual|VPN|Loopback|Hyper-V|TAP|Npcap" 
}
$netAdapter = $adapters | Select-Object -First 1
if (-not $netAdapter) {
    $netAdapter = Get-CimInstance Win32_NetworkAdapterConfiguration | Where-Object { $_.IPEnabled -eq $true -and $_.MACAddress } | Select-Object -First 1
}
$mac = if ($netAdapter) { $netAdapter.MACAddress.ToUpper() } else { "NO_DETECTADA" }

# 2. Fabricante, Modelo y Tipo (Laptop vs CPU)
$cs = Get-CimInstance Win32_ComputerSystem
$bios = Get-CimInstance Win32_BIOS

$marca = if ($cs.Manufacturer) { $cs.Manufacturer.Trim().ToUpper() } else { "GENERICA" }
$modelo = if ($cs.Model) { $cs.Model.Trim().ToUpper() } else { "DESCONOCIDO" }

$chassis = Get-CimInstance Win32_SystemEnclosure
$isLaptop = $false
if ($chassis.ChassisTypes) {
    $laptopTypes = @(8, 9, 10, 11, 12, 14, 18, 21, 30, 31, 32)
    foreach ($type in $chassis.ChassisTypes) {
        if ($laptopTypes -contains $type) { $isLaptop = $true; break }
    }
}
$tipo = if ($isLaptop) { "LAPTOP" } else { "CPU" }

# Fecha de fabricacion aproximada (BIOS ReleaseDate con fallback a OS InstallDate)
$fechaFabricacion = $null
if ($bios.ReleaseDate) {
    try {
        if ($bios.ReleaseDate -is [datetime]) {
            $fechaFabricacion = $bios.ReleaseDate.ToString("yyyy-MM-dd")
        } elseif ($bios.ReleaseDate.Length -ge 8 -and $bios.ReleaseDate.Substring(0,8) -match "^\d{8}$") {
            $fechaFabricacion = ([datetime]::ParseExact($bios.ReleaseDate.Substring(0,8), "yyyyMMdd", $null)).ToString("yyyy-MM-dd")
        } else {
            $fechaFabricacion = (Get-Date $bios.ReleaseDate).ToString("yyyy-MM-dd")
        }
    } catch {
        $fechaFabricacion = $null
    }
}
if (-not $fechaFabricacion) {
    try {
        $osInfo = Get-CimInstance Win32_OperatingSystem
        if ($osInfo.InstallDate) {
            $fechaFabricacion = (Get-Date $osInfo.InstallDate).ToString("yyyy-MM-dd")
        }
    } catch {
        $fechaFabricacion = $null
    }
}

# 3. Procesador
$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
$procesador = if ($cpu.Name) { $cpu.Name.Trim().ToUpper() } else { "DESCONOCIDO" }

# 4. RAM exacta en GB
$totalRamBytes = $cs.TotalPhysicalMemory
if (-not $totalRamBytes) {
    $ramModules = Get-CimInstance Win32_PhysicalMemory
    $totalRamBytes = ($ramModules | Measure-Object -Property Capacity -Sum).Sum
}
$ramGb = [math]::Round(($totalRamBytes / 1GB), 2)

# 5. Disco Principal (Tipo y Espacio en GB)
$discoPrincipal = Get-CimInstance Win32_DiskDrive | Where-Object { $_.Index -eq 0 -or $_.DeviceID -match "DRIVE0" } | Select-Object -First 1
if (-not $discoPrincipal) {
    $discoPrincipal = Get-CimInstance Win32_DiskDrive | Select-Object -First 1
}
$discoGb = if ($discoPrincipal.Size) { [math]::Round(($discoPrincipal.Size / 1GB), 2) } else { 0 }

$discoTipo = "OTRO"
$physicalDisk = Get-PhysicalDisk | Where-Object { $_.DeviceNumber -eq 0 } | Select-Object -First 1
if ($physicalDisk -and $physicalDisk.MediaType) {
    if ($physicalDisk.MediaType -eq "SSD") { $discoTipo = "SOLIDO" }
    elseif ($physicalDisk.MediaType -eq "HDD") { $discoTipo = "MECANICO" }
} else {
    if ($discoPrincipal.Model -match "SSD|NVMe|Solid State") {
        $discoTipo = "SOLIDO"
    } elseif ($discoPrincipal.Model -match "HDD|WDC|ST[0-9]|Hitachi|Toshiba") {
        $discoTipo = "MECANICO"
    }
}

# 6. Perfil Windows (ADMIN vs USUARIO)
$currentIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($currentIdentity)
$isAdmin = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
$perfilWindows = if ($isAdmin) { "ADMIN" } else { "USUARIO" }
$usuarioWindows = $env:USERNAME.ToUpper()

# 7. Verificacion de Bloqueo USB
$usbReg = Get-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Services\USBSTOR" -ErrorAction SilentlyContinue
$usbBloqueado = if ($usbReg -and $usbReg.Start -eq 4) { $true } else { $false }

# 8. Descargas Metricas: Hoy, 7 dias, 30 dias y promedio diario
$downloadsPath = Join-Path $env:USERPROFILE "Downloads"
$descargasHoy = 0
$descargas7Dias = 0
$descargas30Dias = 0
$totalArchivos = 0
$promedioPorDia = 0

if (Test-Path $downloadsPath) {
    $archivos = Get-ChildItem -Path $downloadsPath -File -Recurse -ErrorAction SilentlyContinue
    $totalArchivos = ($archivos | Measure-Object).Count

    if ($totalArchivos -gt 0) {
        $ahora = Get-Date
        $hace24h = $ahora.AddDays(-1)
        $hace7d = $ahora.AddDays(-7)
        $hace30d = $ahora.AddDays(-30)

        $descargasHoy = ($archivos | Where-Object { $_.CreationTime -ge $hace24h } | Measure-Object).Count
        $descargas7Dias = ($archivos | Where-Object { $_.CreationTime -ge $hace7d } | Measure-Object).Count
        $descargas30Dias = ($archivos | Where-Object { $_.CreationTime -ge $hace30d } | Measure-Object).Count

        $archivoMasAntiguo = ($archivos | Sort-Object CreationTime | Select-Object -First 1).CreationTime
        $diasTranscurridos = [math]::Max(1, [math]::Round(($ahora - $archivoMasAntiguo).TotalDays))
        $promedioPorDia = [math]::Round(($totalArchivos / $diasTranscurridos), 2)
    }
}

# 9. Deteccion y lista de paginas bloqueadas en hosts
$hostsPath = "$env:SystemRoot\System32\drivers\etc\hosts"
$paginasBloqueadas = @()
$paginasBloqueadasOk = $false

if (Test-Path $hostsPath) {
    $hostsLines = Get-Content $hostsPath -ErrorAction SilentlyContinue
    foreach ($line in $hostsLines) {
        $lineTrim = $line.Trim()
        if (-not $lineTrim.StartsWith("#") -and $lineTrim -match "^(127\.0\.0\.1|0\.0\.0\.0)\s+(.+)$") {
            $dominio = $matches[2].Trim().ToLower()
            if ($dominio -notmatch "localhost|broadcasthost|local") {
                $paginasBloqueadas += $dominio
            }
        }
    }
    if ($paginasBloqueadas.Count -gt 0) {
        $paginasBloqueadasOk = $true
    }
}

# 10. Datos Extra
$os = Get-CimInstance Win32_OperatingSystem
$antivirus = Get-CimInstance -Namespace "root\SecurityCenter2" -ClassName "AntiVirusProduct" -ErrorAction SilentlyContinue | Select-Object -First 1

$datosExtra = @{
    WINDOWS            = if ($os.Caption) { $os.Caption.Trim() } else { "WINDOWS" }
    VERSION_OS         = if ($os.Version) { $os.Version } else { "" }
    ANTIVIRUS          = if ($antivirus.displayName) { $antivirus.displayName } else { "WINDOWS DEFENDER / OTRO" }
    PAGINAS_BLOQUEADAS = $paginasBloqueadas
    DESCARGAS_DETALLE  = @{
        HOY_ULTIMAS_24H      = $descargasHoy
        ULTIMOS_7_DIAS       = $descargas7Dias
        ULTIMOS_30_DIAS      = $descargas30Dias
        PROMEDIO_DIARIO      = $promedioPorDia
        TOTAL_HISTORICO      = $totalArchivos
    }
}

# Construccion de Payload
$payload = @{
    mac                   = $mac
    tipo                  = $tipo
    marca                 = $marca
    modelo                = $modelo
    procesador            = $procesador
    ram_gb                = [double]$ramGb
    disco_tipo            = $discoTipo
    disco_gb              = [double]$discoGb
    fecha_fabricacion     = $fechaFabricacion
    perfil_windows        = $perfilWindows
    usb_bloqueado         = $usbBloqueado
    descargas_totales     = [int]$descargasHoy
    accesos               = @{
        descargas_hoy        = $descargasHoy
        descargas_7_dias     = $descargas7Dias
        descargas_30_dias    = $descargas30Dias
        promedio_diario      = $promedioPorDia
        total_historico      = $totalArchivos
        total_bloqueos_hosts = $paginasBloqueadas.Count
    }
    paginas_bloqueadas_ok = $paginasBloqueadasOk
    usuario_windows       = $usuarioWindows
    datos_extra           = $datosExtra
}

$jsonBody = $payload | ConvertTo-Json -Depth 5

Write-Host "MAC: $mac" -ForegroundColor Yellow
Write-Host "Dispositivo: $tipo | $marca $modelo" -ForegroundColor Yellow
Write-Host "Hardware: $procesador | RAM: $ramGb GB | Disco: $discoTipo $discoGb GB" -ForegroundColor Yellow
Write-Host "Fecha estimada: $fechaFabricacion" -ForegroundColor Yellow
Write-Host "Seguridad: Perfil $perfilWindows | USB Bloqueado: $usbBloqueado" -ForegroundColor Yellow
Write-Host "Descargas: $descargasHoy hoy | $descargas7Dias ultimos 7 dias" -ForegroundColor Yellow
if ($paginasBloqueadasOk) {
    Write-Host "Paginas bloqueadas: $($paginasBloqueadas -join ', ')" -ForegroundColor DarkGreen
} else {
    Write-Host "Paginas bloqueadas: NINGUNA DETECTADA EN HOSTS" -ForegroundColor DarkYellow
}
Write-Host "`nConectando con Render..." -ForegroundColor Cyan

# Envio con reintentos
$headers = @{
    "Authorization" = "Bearer $ApiToken"
    "Content-Type"  = "application/json; charset=utf-8"
}

$intentos = 0
$maxIntentos = 3
$enviado = $false

while (-not $enviado -and $intentos -lt $maxIntentos) {
    $intentos++
    try {
        $bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($jsonBody)
        $response = Invoke-RestMethod -Uri $ApiUrl -Method Post -Headers $headers -Body $bodyBytes -TimeoutSec 90
        Write-Host "OK - Auditoria registrada exitosamente en el ERP." -ForegroundColor Green
        if ($response.data -and $response.data.activo) {
            Write-Host "Codigo de Activo: $($response.data.activo.id)" -ForegroundColor Green
        }
        $enviado = $true
    } catch {
            Write-Host "Intento $intentos fallido: $($_.Exception.Message)" -ForegroundColor Red
            if ($intentos -lt $maxIntentos) {
                Write-Host "Esperando 10 segundos antes de reintentar..." -ForegroundColor DarkYellow
                Start-Sleep -Seconds 10
            } else {
                Write-Host "No se pudo conectar con el servidor tras $maxIntentos intentos." -ForegroundColor Red
            }
        }
    }
