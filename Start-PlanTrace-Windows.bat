@echo off
setlocal
title PlanTrace
cd /d "%~dp0"
set "PROJECT_DIR=%cd%"

call :RefreshPath
call :FindNode
if errorlevel 1 (
    echo Node.js is missing or not in PATH. Repairing PlanTrace now...
    call :RepairInstall
)

if not exist "%~dp0node_modules\vite\bin\vite.js" (
    echo Dependencies are missing. Repairing PlanTrace now...
    call :RepairInstall
)

call :RefreshPath
call :FindNode
if errorlevel 1 (
    echo.
    echo node.exe was still not found after repair.
    echo Please install Node.js LTS from https://nodejs.org/en/download and run this file again.
    pause
    exit /b 1
)

if not exist "%~dp0node_modules\vite\bin\vite.js" (
    echo.
    echo Vite was still not found after repair.
    echo Please run Install-PlanTrace-From-GitHub-Windows.bat again.
    pause
    exit /b 1
)

echo.
echo PlanTrace is starting.
echo Browser URL: http://localhost:5173
echo Keep this window open while using PlanTrace.
echo.

call "%NODE_CMD%" "%~dp0node_modules\vite\bin\vite.js" --host localhost --port 5173
if errorlevel 1 (
    echo.
    echo PlanTrace stopped or failed to start.
    pause
    exit /b 1
)

exit /b 0

:FindNode
set "NODE_CMD="
if exist "%ProgramFiles%\nodejs\node.exe" (
    set "NODE_CMD=%ProgramFiles%\nodejs\node.exe"
    exit /b 0
)
if exist "%ProgramFiles(x86)%\nodejs\node.exe" (
    set "NODE_CMD=%ProgramFiles(x86)%\nodejs\node.exe"
    exit /b 0
)
if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" (
    set "NODE_CMD=%LOCALAPPDATA%\Programs\nodejs\node.exe"
    exit /b 0
)
where node.exe >nul 2>nul
if not errorlevel 1 (
    set "NODE_CMD=node.exe"
    exit /b 0
)
exit /b 1

:RepairInstall
if not exist "%~dp0scripts\install-local.ps1" (
    echo.
    echo Missing installer script:
    echo   %~dp0scripts\install-local.ps1
    pause
    exit /b 1
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install-local.ps1" -ProjectDir "%PROJECT_DIR%" -CreateShortcut:$false
if errorlevel 1 (
    echo.
    echo PlanTrace repair failed.
    pause
    exit /b 1
)
call :RefreshPath
exit /b 0

:RefreshPath
for /f "usebackq delims=" %%P in (`powershell.exe -NoProfile -Command "[Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')"`) do set "PATH=%%P"
exit /b 0
