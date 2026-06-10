@echo off
REM ============================================================
REM  Repara node_modules (corrupto por antivirus) y ejecuta
REM  la migracion del modulo WhatsApp contra la DB de Render.
REM  Doble clic y listo.
REM ============================================================
cd /d "%~dp0"

echo.
echo === PASO 1/3: Borrando node_modules corrupto ===
if exist node_modules rmdir /s /q node_modules
if exist package-lock.json del /q package-lock.json

echo.
echo === PASO 2/3: Instalando dependencias (puede tardar varios minutos) ===
call npm install
if errorlevel 1 (
  echo.
  echo *** ERROR en npm install. Revisa tu conexion a internet. ***
  pause
  exit /b 1
)

echo.
echo === PASO 3/3: Ejecutando migracion WhatsApp (DB de Render) ===
node src\migrations\run_whatsapp.js
if errorlevel 1 (
  echo.
  echo *** ERROR en la migracion. Revisa las credenciales del .env ***
  pause
  exit /b 1
)

echo.
echo ============================================================
echo  TODO LISTO. Dependencias reparadas y migracion ejecutada.
echo  Ya puedes hacer git add / commit / push.
echo ============================================================
pause
