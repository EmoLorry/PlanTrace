@echo off
title PlanTrace Dev Server
cd /d "%~dp0"
echo.
echo   =============================
echo     PlanTrace - Starting...
echo   =============================
echo.
npm run dev
pause
