@echo off
setlocal EnableExtensions
chcp 65001 >nul 2>&1

REM ============================================================
REM  OpenConstructionERP-simple - Simplified SIGNAL-like build
REM  One-click launcher: backend (embedded PG) + frontend (Vite)
REM ============================================================

set "ROOT=%~dp0"
set "VENV=%ROOT%.venv"
set "DATA=%ROOT%.data"
set "BACKEND_PORT=8080"
set "FRONTEND_PORT=5173"
set "BACKEND_URL=http://127.0.0.1:%BACKEND_PORT%"

echo.
echo  ============================================================
echo   OpenConstructionERP-simple  ^|  simplified SIGNAL-like build
echo  ============================================================
echo.

REM ---- 1. Checks --------------------------------------------------
if not exist "%VENV%\Scripts\python.exe" (
    echo  [ERROR] Virtual environment not found at %VENV%
    echo          Run:  py -3.14 -m venv .venv
    echo                .venv\Scripts\python.exe -m pip install -e "%~dp0backend[server]"
    echo                .venv\Scripts\python.exe -m pip install --upgrade pip
    pause
    exit /b 1
)

if not exist "%VENV%\Scripts\openconstructionerp.exe" (
    echo  [ERROR] openconstructionerp CLI not found in %VENV%\Scripts
    echo          The backend package is probably not installed editable.
    echo          Run:  .venv\Scripts\python.exe -m pip install -e "%~dp0backend[server]"
    pause
    exit /b 1
)

if not exist "%ROOT%frontend\node_modules" (
    echo  [INFO] Frontend dependencies missing, installing (first run only)...
    pushd "%ROOT%frontend"
    call npm install
    if errorlevel 1 (
        echo  [ERROR] npm install failed. Check Node.js ^>=20 and network access.
        pause
        exit /b 1
    )
    popd
)

REM ---- 2. Kill stale processes on our ports ----------------------
for /f "tokens=5" %%p in ('netstat -ano ^| findstr "LISTENING" ^| findstr ":8080 "') do (
    taskkill /f /pid %%p >nul 2>&1
)
for /f "tokens=5" %%p in ('netstat -ano ^| findstr "LISTENING" ^| findstr ":5173 "') do (
    taskkill /f /pid %%p >nul 2>&1
)

REM ---- 3. Start backend (embedded PostgreSQL) --------------------
echo  [1/3] Starting backend on %BACKEND_URL%  (embedded PostgreSQL 16)...
start "OpenConstructionERP-Backend" /min cmd /c ""%VENV%\Scripts\openconstructionerp.exe" serve --host 127.0.0.1 --port %BACKEND_PORT% --data-dir "%DATA%""

REM ---- 4. Wait for backend health --------------------------------
echo  [2/3] Waiting for the backend (first run: PG init + migrations may take a few minutes)...
set /a tries=0
:wait_backend
set /a tries+=1
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:%BACKEND_PORT%/api/v1/auth/first-run/' -UseBasicParsing -TimeoutSec 3; if ($r.StatusCode -eq 200) { exit 0 } } catch { exit 1 }" >nul 2>&1
if not errorlevel 1 goto backend_ready
if %tries% GEQ 180 (
    echo  [ERROR] Backend did not become ready within 300s.
    echo          Check the backend window for errors.
    pause
    exit /b 1
)
timeout /t 2 /nobreak >nul
goto wait_backend

:backend_ready
echo  [OK] Backend is ready at %BACKEND_URL%

REM ---- 5. Start frontend (Vite dev server) -----------------------
echo  [3/3] Starting frontend at http://127.0.0.1:%FRONTEND_PORT%
pushd "%ROOT%frontend"
start "OpenConstructionERP-Frontend" /min cmd /c "set VITE_API_TARGET=%BACKEND_URL%&& set NODE_OPTIONS=--max-old-space-size=8192&& npm run dev"
popd

echo.
echo  ============================================================
echo   The app is starting. Frontend: http://127.0.0.1:%FRONTEND_PORT%
echo   API docs:      %BACKEND_URL%/api/docs
echo   Demo login:    demo@openconstructionerp.com / DemoPass1234!
echo   (Actual demo password is written to %DATA%\.demo_credentials.json)
echo  ============================================================
echo.

timeout /t 8 /nobreak >nul
start "" "http://127.0.0.1:%FRONTEND_PORT%"

echo  Done. Close the two "OpenConstructionERP-*" windows to stop.
echo.
pause
endlocal
