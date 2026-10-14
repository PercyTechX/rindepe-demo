@echo off
chcp 65001 >nul
title RindePe - Demo
cd /d "%~dp0"

echo.
echo   RindePe - demo local
echo   ---------------------
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo   No se encontro Node.js. Instala Node.js 22 o superior desde https://nodejs.org
  echo.
  pause
  exit /b 1
)

if not exist "backend\node_modules" (
  echo   Primera vez: instalando el servidor...
  call npm install --prefix backend --no-audit --no-fund
  if errorlevel 1 goto error
)

if not exist "frontend\node_modules" (
  echo   Primera vez: instalando la interfaz...
  call npm install --prefix frontend --no-audit --no-fund
  if errorlevel 1 goto error
)

rem Se recompila si no existe la version compilada o si se pide con: "Iniciar RindePe.bat" build
if "%~1"=="build" goto compilar
if not exist "frontend\dist\index.html" goto compilar
goto iniciar

:compilar
echo   Preparando la interfaz...
call npm run build --prefix frontend
if errorlevel 1 goto error

:iniciar
rem Abre el navegador unos segundos despues, cuando el servidor ya esta escuchando.
start "" /b cmd /c "timeout /t 3 /nobreak >nul & start "" http://localhost:4000"
node --disable-warning=ExperimentalWarning backend\server.js
echo.
echo   El servidor se detuvo.
pause
exit /b 0

:error
echo.
echo   Ocurrio un error. Revisa los mensajes de arriba.
pause
exit /b 1
