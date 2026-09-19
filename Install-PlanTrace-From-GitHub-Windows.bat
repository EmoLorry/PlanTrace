@echo off
setlocal
title PlanTrace GitHub Installer

set "SCRIPT=%~dp0scripts\install-from-github.ps1"

if exist "%SCRIPT%" goto RunInstaller

set "SCRIPT=%TEMP%\install-plantrace-from-github.ps1"
set "PT_SCRIPT=%SCRIPT%"

echo Downloading PlanTrace installer...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $urls = @('https://raw.githubusercontent.com/EmoLorry/PlanTrace/main/scripts/install-from-github.ps1','https://cdn.jsdelivr.net/gh/EmoLorry/PlanTrace@main/scripts/install-from-github.ps1'); foreach ($u in $urls) { try { Invoke-WebRequest -UseBasicParsing -Uri $u -OutFile $env:PT_SCRIPT -TimeoutSec 30; exit 0 } catch {} }; try { $r = Invoke-WebRequest -UseBasicParsing -Uri 'https://api.github.com/repos/EmoLorry/PlanTrace/contents/scripts/install-from-github.ps1?ref=main' -TimeoutSec 30; $p = $r.Content | ConvertFrom-Json; $encoded = [string]$p.content -replace '\s',''; [IO.File]::WriteAllText($env:PT_SCRIPT, [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($encoded))); exit 0 } catch { Write-Host $_.Exception.Message; exit 1 }"
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
