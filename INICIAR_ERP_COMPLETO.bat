@echo off
cd /d "%~dp0"
echo =====================================================
echo  INICIAR ERP NOVONET - Backend + Frontend
echo =====================================================
echo.

echo [1/2] Iniciando backend (puerto 3000)...
cd backend
start "ERP-Backend" /MIN cmd /c "npm install --silent && npm start"
cd ..

timeout /t 3 /nobreak >nul

echo [2/2] Iniciando frontend (puerto 5173)...
cd frontend
start "ERP-Frontend" /MIN cmd /c "npm install --silent && npm run dev"
cd ..

echo.
echo =====================================================
echo Listo. En unos segundos abre:
echo   http://localhost:5173   (ERP frontend)
echo   http://localhost:3000   (API backend)
echo =====================================================
timeout /t 5
