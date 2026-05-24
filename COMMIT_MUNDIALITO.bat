@echo off
REM ============================================================================
REM COMMIT_MUNDIALITO.bat
REM ============================================================================
REM Script que:
REM  1. Normaliza line endings (Windows CRLF)
REM  2. Descarta archivos que NO toque (solo cambiaron por CRLF/LF)
REM  3. Excluye carpeta de backups del repo
REM  4. Agrega solo los archivos nuevos/modificados intencionalmente
REM  5. Hace el commit con mensaje descriptivo
REM
REM Para usarlo: doble-click sobre este archivo.
REM ============================================================================

setlocal EnableDelayedExpansion
cd /d "%~dp0"

echo.
echo === PASO 1: Configurando git para line endings de Windows ===
git config core.autocrlf true

echo.
echo === PASO 2: Descartando cambios solo de line endings ===
echo (Esto deja intactos solo los archivos que realmente toque)

REM Restaurar los controllers no tocados
git checkout -- backend/src/controllers/alerta.controller.js 2>nul
git checkout -- backend/src/controllers/analista.controller.js 2>nul
git checkout -- backend/src/controllers/auth.controller.js 2>nul
git checkout -- backend/src/controllers/bitrix.controller.js 2>nul
git checkout -- backend/src/controllers/comparativaIndicadores.controller.js 2>nul
git checkout -- backend/src/controllers/coverage.controller.js 2>nul
git checkout -- backend/src/controllers/forecast.controller.js 2>nul
git checkout -- backend/src/controllers/indicadores.controller.js 2>nul
git checkout -- backend/src/controllers/indicadoresNuevoController.js 2>nul
git checkout -- backend/src/controllers/indicadoresVelsa.controller.ACTUALIZADO.js 2>nul
git checkout -- backend/src/controllers/indicadoresVelsaMaterialized.controller.js 2>nul
git checkout -- backend/src/controllers/inventario.controller.js 2>nul
git checkout -- backend/src/controllers/monitoreoController.js 2>nul
git checkout -- backend/src/controllers/redes.controller.js 2>nul
git checkout -- backend/src/controllers/usuarios.controller.js 2>nul
git checkout -- backend/src/controllers/ventas.controller.js 2>nul

REM Restaurar config no tocada
git checkout -- backend/src/config/permisos.config.js 2>nul
git checkout -- backend/src/config/socket.js 2>nul

REM Restaurar middleware no tocado
git checkout -- backend/src/middleware/isAdmin.js 2>nul
git checkout -- backend/src/middleware/requierePermiso.js 2>nul

REM Restaurar models, jobs, services, utils
git checkout -- backend/src/models/ 2>nul
git checkout -- backend/src/jobs/ 2>nul
git checkout -- backend/src/services/ 2>nul
git checkout -- backend/src/utils/ 2>nul
git checkout -- backend/src/routes/ 2>nul
git checkout -- backend/src/db/ 2>nul

REM Restaurar migraciones existentes (no las nuevas)
git checkout -- backend/src/migrations/add_indicadores_indexes.sql 2>nul
git checkout -- backend/src/migrations/coverage_cache.sql 2>nul
git checkout -- backend/src/migrations/forecast.sql 2>nul
git checkout -- backend/src/migrations/inventario.sql 2>nul

REM Restaurar archivos raíz no tocados
git checkout -- backend/MIGRACIONES_SEGURIDAD.sql 2>nul
git checkout -- backend/bitrix-discover-fields.js 2>nul
git checkout -- backend/check_views.js 2>nul
git checkout -- backend/fix_trigger_envios_ventas.sql 2>nul
git checkout -- backend/migrar_cobertura_v2.sql 2>nul
git checkout -- backend/migrate.js 2>nul
git checkout -- backend/migration-v2.js 2>nul
git checkout -- backend/sync-bitrix.js 2>nul
git checkout -- backend/Dockerfile 2>nul
git checkout -- backend/.dockerignore 2>nul
git checkout -- backend/package.json 2>nul
git checkout -- backend/package-lock.json 2>nul

REM Restaurar archivos raíz documentación no tocada
git checkout -- CAMBIOS_REALIZADOS.md 2>nul
git checkout -- DOCUMENTACION_PROYECTO.md 2>nul
git checkout -- GUIA_DOCKER_AUTOMATIZACIONES.md 2>nul
git checkout -- INTEGRACION_COVERAGE.md 2>nul
git checkout -- LISTO_PARA_USAR.txt 2>nul
git checkout -- SETUP_MATERIALIZED_VIEW.md 2>nul
git checkout -- README.md 2>nul
git checkout -- requirements.txt 2>nul
git checkout -- runtime.txt 2>nul
git checkout -- bitrix-explore.js 2>nul
git checkout -- coverage-api-service.py 2>nul
git checkout -- docker-compose-automatizaciones.yml 2>nul
git checkout -- ejemplo-cobertura.kml 2>nul
git checkout -- ersUsuario-PCoriginal_con_jotform.js 2>nul

REM Restaurar frontend no tocado
git checkout -- frontend/src/App.css 2>nul
git checkout -- frontend/src/index.css 2>nul
git checkout -- frontend/src/main.jsx 2>nul
git checkout -- frontend/src/assets/ 2>nul
git checkout -- frontend/src/components/ 2>nul
git checkout -- frontend/src/hooks/ 2>nul
git checkout -- frontend/src/jobs/ 2>nul
git checkout -- frontend/src/styles/ 2>nul
git checkout -- frontend/index.html 2>nul
git checkout -- frontend/eslint.config.js 2>nul
git checkout -- frontend/postcss.config.js 2>nul
git checkout -- frontend/tailwind.config.js 2>nul
git checkout -- frontend/package.json 2>nul
git checkout -- frontend/package-lock.json 2>nul
git checkout -- frontend/README.md 2>nul
git checkout -- frontend/public/ 2>nul

REM Restaurar páginas frontend que NO se tocaron
for %%F in (
  AppSheetModule Automarcador Backoffice BitrixLive BroadcastNovonet
  BroadcastPanel BroadcastVelsa ComparativaSupervisores CoverageChecker
  Forecast GerenciaComparativo GlobalFilters Guiaplanesmarzo HomeModules
  Indicadores IndicadoresVelsa Inventario JotFormulario Login Modules
  Notificaciones NuevaVenta Redes ResumenNovonet ResumenVelsa
  Seguimientovelsa Seguimientoventas TVMode TabAnalisisPautas
  TabAsesorVsPauta TabComparativo TabMetas TabReporteData VentasFormulario
  VidikaEmbed VistaAsesor VistaAsesorVelsa
) do (
  git checkout -- "frontend/src/pages/%%F.jsx" 2>nul
)

echo.
echo === PASO 3: Excluyendo backups del repositorio ===
findstr /C:".backups_optimizacion/" .gitignore >nul 2>&1
if errorlevel 1 (
    echo .backups_optimizacion/ >> .gitignore
    echo Agregado .backups_optimizacion/ al .gitignore
)
git rm -r --cached .backups_optimizacion/ 2>nul

echo.
echo === PASO 4: Agregando archivos reales del modulo Mundialito ===
git add .gitignore
git add backend/src/app.js
git add backend/src/server.js
git add backend/src/middleware/auth.js
git add backend/src/config/db.js
git add backend/src/controllers/mundialito.controller.js
git add backend/src/routes/mundialito.routes.js
git add backend/src/migrations/mundialito.sql
git add frontend/vite.config.js
git add frontend/src/App.jsx
git add frontend/src/pages/Mundialito.jsx
git add frontend/src/layouts/DashboardLayout.jsx
git add MUNDIALITO_GUIA.md
git add CHANGELOG_MEJORAS_SEGURIDAD_PERFORMANCE.md

echo.
echo === PASO 5: Estado final antes del commit ===
git status --short

echo.
echo === PASO 6: Realizando commit ===
git commit -m "feat: modulo Mundialito + mejoras seguridad/performance" -m "- Nuevo modulo Mundialito (incentivo asesores estilo mundial) solo ADMIN" -m "- 7 tablas SQL nuevas + vista de posiciones" -m "- Backend CRUD completo con Socket.IO live" -m "- Frontend con UI futurista, confetti, sonido WebAudio, animaciones" -m "- Headers de seguridad nativos (sin helmet)" -m "- Cache LRU de auth (60s) para reducir queries a BD" -m "- Pool de PG con statement_timeout y keepAlive" -m "- Validacion de env vars criticas al arranque" -m "- Vite con chunk splitting y drop console en produccion"

echo.
echo ============================================================================
echo  COMMIT CREADO - REVISA ARRIBA QUE NO HAYA ERRORES
echo ============================================================================
echo.
echo SIGUIENTES PASOS:
echo   1. git push origin (rama que prefieras)
echo   2. Render desplegara automaticamente
echo   3. Ejecutar la migracion SQL en la BD de Render:
echo      psql "TU_DATABASE_URL" -f backend/src/migrations/mundialito.sql
echo.
pause
