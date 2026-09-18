@echo off
setlocal
title PlanTrace Installer
cd /d "%~dp0"

echo.
echo PlanTrace local installer
echo -------------------------
echo Project: %cd%
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install-local.ps1" -ProjectDir "%~dp0" -Launch -CreateShortcut
if errorlevel 1 (
    echo.
    echo PlanTrace install failed.
    pause
    exit /b 1
)

exit /b 0
