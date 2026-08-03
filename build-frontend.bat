@echo off
setlocal
chcp 65001 >nul 2>&1

REM ============================================================
REM  OpenConstructionERP-simple - Frontend build (production)
REM  Usage: build-frontend.bat
REM ============================================================

set "ROOT=%~dp0"

if not exist "%ROOT%frontend\node_modules" (
    echo  [INFO] Installing frontend dependencies...
    pushd "%ROOT%frontend"
    call npm install --no-audit --no-fund
    if errorlevel 1 (
        echo  [ERROR] npm install failed.
        pause
        exit /b 1
    )
    popd
)

echo  [INFO] Building frontend (tsc + vite build)...
set NODE_OPTIONS=--max-old-space-size=8192
pushd "%ROOT%frontend"
call npm run build
if errorlevel 1 (
    echo  [ERROR] Frontend build failed.
    pause
    exit /b 1
)
popd

echo.
echo  [OK] Frontend built. Output: %ROOT%frontend\dist
echo.
pause
endlocal
