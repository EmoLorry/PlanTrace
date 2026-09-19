@echo off
setlocal
title PlanTrace Installer
cd /d "%~dp0"
set "PROJECT_DIR=%cd%"

echo.
echo PlanTrace local installer
echo -------------------------
echo Project: %PROJECT_DIR%
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install-local.ps1" -ProjectDir "%PROJECT_DIR%" -Launch -CreateShortcut
if errorlevel 1 (
    echo.
    echo PlanTrace install failed.
    pause
    exit /b 1
)

exit /b 0
