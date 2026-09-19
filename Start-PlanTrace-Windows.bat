@echo off
setlocal
title PlanTrace
cd /d "%~dp0"
set "PROJECT_DIR=%cd%"

if not exist "%~dp0node_modules\vite\bin\vite.js" (
    echo Dependencies are missing. Installing them now...
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install-local.ps1" -ProjectDir "%PROJECT_DIR%" -CreateShortcut:$false
    if errorlevel 1 (
        echo.
        echo Dependency install failed.
        pause
        exit /b 1
    )
)

echo.
echo PlanTrace is starting.
echo Browser URL: http://localhost:5173
echo Keep this window open while using PlanTrace.
echo.

npm.cmd run start
if errorlevel 1 (
    echo.
    echo PlanTrace stopped or failed to start.
    pause
    exit /b 1
)
