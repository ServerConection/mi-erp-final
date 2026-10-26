# Instalador del Agente de Llamadas (PILOTO) para la PC del asesor. NO requiere administrador.
# Uso: doble clic en instalar.bat (debe estar junto a AgenteLlamadas.exe).
$ErrorActionPreference = "Stop"
$origen = Split-Path -Parent $MyInvocation.MyCommand.Path
$exe = Join-Path $origen "AgenteLlamadas.exe"
if (-not (Test-Path $exe)) { throw "No encuentro AgenteLlamadas.exe junto a este instalador." }

$clave = (Read-Host "Pega la CLAVE DE PC (modulo Piloto Llamadas del ERP)").Trim()
if ($clave -notmatch '^[0-9a-f]{48}$') { throw "La clave no tiene el formato correcto (48 caracteres)." }

$destino = Join-Path $env:LOCALAPPDATA "AgenteLlamadas"
New-Item -ItemType Directory -Force -Path $destino | Out-Null
Get-Process AgenteLlamadas -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 1
Copy-Item $exe (Join-Path $destino "AgenteLlamadas.exe") -Force

$cfg = [ordered]@{
  backend  = "https://erp-backend-v1-qhk2.onrender.com"
  origenes = @("https://erp-frontend-v1.onrender.com")
  clave    = $clave
} | ConvertTo-Json
Set-Content -Path (Join-Path $destino "config.json") -Value $cfg -Encoding UTF8

# WhatsApp Desktop (WebView2) no debe "dormir" estando fuera de pantalla.
[Environment]::SetEnvironmentVariable("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
  "--disable-features=CalculateNativeWinOcclusion --disable-backgrounding-occluded-windows --disable-renderer-backgrounding", "User")

# Arranque automático al iniciar sesión.
$sh = New-Object -ComObject WScript.Shell
$lnk = $sh.CreateShortcut((Join-Path ([Environment]::GetFolderPath("Startup")) "AgenteLlamadas.lnk"))
$lnk.TargetPath = Join-Path $destino "AgenteLlamadas.exe"
$lnk.WorkingDirectory = $destino
$lnk.Save()

# Reinicia WhatsApp para que tome el ajuste y arranca el agente.
Get-Process WhatsApp* -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Process (Join-Path $destino "AgenteLlamadas.exe")
Write-Host ""
Write-Host "Listo. Abre WhatsApp Desktop desde Inicio y prueba 'Llamar (PC)' en el ERP." -ForegroundColor Green
Read-Host "Pulsa Enter para cerrar"
