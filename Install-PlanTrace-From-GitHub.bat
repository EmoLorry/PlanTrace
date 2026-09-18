@echo off
setlocal
title PlanTrace GitHub Installer

set "SCRIPT=%~dp0scripts\install-from-github.ps1"

if exist "%SCRIPT%" goto RunInstaller

set "SCRIPT=%TEMP%\install-plantrace-from-github.ps1"
set "PT_SCRIPT=%SCRIPT%"

echo Downloading PlanTrace installer...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -UseBasicParsing -Uri 'https://raw.githubusercontent.com/EmoLorry/PlanTrace/main/scripts/install-from-github.ps1' -OutFile $env:PT_SCRIPT; exit 0 } catch { Write-Host $_.Exception.Message; exit 1 }"
if errorlevel 1 (
    echo.
    echo Failed to download installer from GitHub.
    pause
    exit /b 1
)

:RunInstaller
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%" -RepoOwner "EmoLorry" -RepoName "PlanTrace" -Branch "main"
if errorlevel 1 (
    echo.
    echo PlanTrace install failed.
    pause
    exit /b 1
)

exit /b 0
