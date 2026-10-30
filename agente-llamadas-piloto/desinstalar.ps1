# Desinstala el Agente de Llamadas (PILOTO) de la PC del asesor.
# Detiene agente y vigilante, borra config y clave, quita el arranque automático
# y revierte el ajuste de WhatsApp. Tras esto, WhatsApp Desktop se ve normal.
# NO requiere administrador. Se ejecuta con la sesión de Windows del asesor.
$ErrorActionPreference = "SilentlyContinue"

Get-Process AgenteVigilante, AgenteLlamadas | Stop-Process -Force
Start-Sleep -Seconds 1

# Quita el acceso directo de arranque automático
Remove-Item (Join-Path ([Environment]::GetFolderPath("Startup")) "AgenteLlamadas.lnk") -Force

# Revierte el ajuste de WebView2 (WhatsApp vuelve a su comportamiento normal)
[Environment]::SetEnvironmentVariable("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", $null, "User")

# Reactiva las notificaciones de WhatsApp en Windows
$aumid = "5319275A.WhatsAppDesktop_cv1g1gvanyjgm!App"
$reg = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Notifications\Settings\$aumid"
if (Test-Path $reg) { Set-ItemProperty -Path $reg -Name "Enabled" -Value 1 -Type DWord }

# Borra la carpeta del agente (exe, config con la clave, logs)
$destino = Join-Path $env:LOCALAPPDATA "AgenteLlamadas"
if (Test-Path $destino) { Remove-Item $destino -Recurse -Force }

# Reinicia WhatsApp para que se vea normal desde ya
Get-Process WhatsApp* | Stop-Process -Force
Start-Sleep -Seconds 1
try { Start-Process "shell:AppsFolder\$aumid" } catch {}

Write-Host ""
Write-Host "Desinstalado. WhatsApp Desktop vuelve a verse normal en esta PC." -ForegroundColor Green
Read-Host "Pulsa Enter para cerrar"
