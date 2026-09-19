@echo off
setlocal
title PlanTrace Updater
cd /d "%~dp0"
set "PROJECT_DIR=%cd%"

echo.
echo PlanTrace updater
echo -----------------
echo Project: %PROJECT_DIR%
echo.

if not exist "%~dp0scripts\update-from-github.ps1" (
    echo Missing updater script:
    echo   %~dp0scripts\update-from-github.ps1
    echo.
    echo Please reinstall PlanTrace or download the latest project files.
    pause
    exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\update-from-github.ps1" -ProjectDir "%PROJECT_DIR%" -RepoOwner "EmoLorry" -RepoName "PlanTrace" -Branch "main"
if errorlevel 1 (
    echo.
    echo PlanTrace update failed.
    pause
    exit /b 1
)

echo.
echo PlanTrace updater finished.
pause
exit /b 0
