# Construye AgenteLlamadas.exe (se ejecuta UNA vez en la PC de Desarrollo).
# Resultado: carpeta "paquete" con AgenteLlamadas.exe + instalar.bat + instalar.ps1
$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $MyInvocation.MyCommand.Path)
python -m pip install --upgrade pyinstaller pywinauto comtypes pywin32
python -m PyInstaller --noconfirm --onefile --noconsole --name AgenteLlamadas `
  --collect-all pywinauto --collect-all comtypes --hidden-import win32timezone agente_piloto.py
python -m PyInstaller --noconfirm --onefile --noconsole --name AgenteVigilante vigilante.py
New-Item -ItemType Directory -Force -Path paquete | Out-Null
Copy-Item dist\AgenteLlamadas.exe, dist\AgenteVigilante.exe, instalar.bat, instalar.ps1, desinstalar.bat, desinstalar.ps1 paquete -Force
Write-Host "Paquete listo en: $(Resolve-Path paquete)" -ForegroundColor Green
