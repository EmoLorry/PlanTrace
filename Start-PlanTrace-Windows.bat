@echo off
setlocal
title PlanTrace
cd /d "%~dp0"
set "PROJECT_DIR=%cd%"

call :FindNpm
if errorlevel 1 (
    echo Node.js/npm is missing or not in PATH. Repairing PlanTrace now...
    call :RepairInstall
)

if not exist "%~dp0node_modules\vite\bin\vite.js" (
    echo Dependencies are missing. Repairing PlanTrace now...
    call :RepairInstall
)

call :FindNpm
if errorlevel 1 (
    echo.
    echo npm.cmd was still not found after repair.
    echo Please install Node.js LTS from https://nodejs.org/en/download and run this file again.
    pause
    exit /b 1
)

echo.
echo PlanTrace is starting.
echo Browser URL: http://localhost:5173
echo Keep this window open while using PlanTrace.
echo.

call "%NPM_CMD%" run start
if errorlevel 1 (
    echo.
    echo PlanTrace stopped or failed to start.
    pause
    exit /b 1
)

exit /b 0

:FindNpm
set "NPM_CMD="
where npm.cmd >nul 2>nul
if not errorlevel 1 (
    set "NPM_CMD=npm.cmd"
    exit /b 0
)
if exist "%ProgramFiles%\nodejs\npm.cmd" (
    set "NPM_CMD=%ProgramFiles%\nodejs\npm.cmd"
    exit /b 0
)
if exist "%ProgramFiles(x86)%\nodejs\npm.cmd" (
    set "NPM_CMD=%ProgramFiles(x86)%\nodejs\npm.cmd"
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
