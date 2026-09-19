@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
title PlanTrace 更新程序

:: ════════════════════════════════════════════════════════════════════════════
::  PlanTrace — Update-PlanTrace.bat
::
::  放在 PlanTrace 项目根目录中（与 start.bat 同级）。
::  双击即可一键更新到 GitHub 最新版本。
::
::  ✅ 更新内容：src\ public\ index.html package.json eslint.config.js
::  ✅ 自动运行 npm install 以安装新依赖
::  ❌ 不会触碰：backups\ start.bat .gitignore 等用户数据
::  ❌ 不会触碰：浏览器 localStorage 中的任务/日记数据
:: ════════════════════════════════════════════════════════════════════════════

:: 安装目录 = 此脚本所在目录
set "INSTALL_DIR=%~dp0"
:: 去掉末尾反斜杠
if "!INSTALL_DIR:~-1!"=="\" set "INSTALL_DIR=!INSTALL_DIR:~0,-1!"

echo.
echo  ╔═══════════════════════════════════════════════════╗
echo  ║        PlanTrace  一键更新程序                    ║
echo  ╚═══════════════════════════════════════════════════╝
echo.
echo  安装目录: !INSTALL_DIR!
echo.

:: ── 确认当前版本 ────────────────────────────────────────────────────────────
set "PKG_JSON=!INSTALL_DIR!\package.json"
set "LOCAL_VER=未知"
if exist "!PKG_JSON!" (
    for /f "tokens=2 delims=:," %%v in ('findstr /i "\"version\"" "!PKG_JSON!"') do (
        set "LOCAL_VER=%%v"
        set "LOCAL_VER=!LOCAL_VER: =!"
        set "LOCAL_VER=!LOCAL_VER:"=!"
    )
)
echo  当前版本: v!LOCAL_VER!

:: ── 检查 Node.js ─────────────────────────────────────────────────────────────
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo  [!] 未检测到 Node.js，请先安装后重试。
    start https://nodejs.org/zh-cn/download
    pause & exit /b 1
)

:: ── 检查 PowerShell ──────────────────────────────────────────────────────────
powershell -Command "exit 0" >nul 2>&1
if %errorlevel% neq 0 (
    echo  [!] 需要 PowerShell，请更新系统后重试。
    pause & exit /b 1
)

:: ── 从 GitHub 获取最新版本号 ─────────────────────────────────────────────────
echo.
echo  正在检查最新版本...
set "VERSION_URL=https://raw.githubusercontent.com/EmoLorry/PlanTrace/main/public/version.json"
set "TMP_VER=%TEMP%\pt_version_%RANDOM%.json"

powershell -NoProfile -Command ^
    "try { Invoke-WebRequest -Uri '%VERSION_URL%' -OutFile '%TMP_VER%' -UseBasicParsing -TimeoutSec 10 } catch { exit 1 }" >nul 2>&1

if not exist "%TMP_VER%" (
    echo.
    echo  [!] 无法连接到 GitHub，请检查网络后重试。
    echo      （用户数据未受影响，可正常使用 PlanTrace）
    pause & exit /b 1
)

:: 读取远端版本号
set "REMOTE_VER=未知"
for /f "tokens=2 delims=:," %%v in ('findstr /i "\"version\"" "%TMP_VER%"') do (
    set "REMOTE_VER=%%v"
    set "REMOTE_VER=!REMOTE_VER: =!"
    set "REMOTE_VER=!REMOTE_VER:"=!"
)
del "%TMP_VER%" >nul 2>&1

echo  最新版本: v!REMOTE_VER!
echo.

if "!LOCAL_VER!"=="!REMOTE_VER!" (
    echo  ✅ 当前已是最新版本，无需更新。
    echo.
    pause & exit /b 0
)

:: ── 用户确认 ─────────────────────────────────────────────────────────────────
echo  发现新版本 v!REMOTE_VER!（当前 v!LOCAL_VER!）
echo.
set /p "CONFIRM=  确认开始更新？(Y/n): "
if /i "!CONFIRM!"=="n" (
    echo  已取消。
    pause & exit /b 0
)
echo.

:: ── 下载 ZIP ─────────────────────────────────────────────────────────────────
echo [1/4] 下载最新版本...
set "ZIP_URL=https://github.com/EmoLorry/PlanTrace/archive/refs/heads/main.zip"
set "TMP_ZIP=%TEMP%\PlanTrace-update-%RANDOM%.zip"
set "TMP_EXTRACT=%TEMP%\PlanTrace-update-extract-%RANDOM%"

powershell -NoProfile -Command ^
    "try { " ^
    "  $ProgressPreference = 'SilentlyContinue'; " ^
    "  Invoke-WebRequest -Uri '%ZIP_URL%' -OutFile '%TMP_ZIP%' -UseBasicParsing -TimeoutSec 120 " ^
    "} catch { Write-Host $_.Exception.Message; exit 1 }"

if not exist "%TMP_ZIP%" (
    echo  [!] 下载失败，请检查网络连接后重试。
    pause & exit /b 1
)
echo      下载完成 ✓

:: ── 解压 ─────────────────────────────────────────────────────────────────────
echo [2/4] 解压文件...
if exist "%TMP_EXTRACT%" rmdir /s /q "%TMP_EXTRACT%"
powershell -NoProfile -Command ^
    "$ProgressPreference='SilentlyContinue'; Expand-Archive -Path '%TMP_ZIP%' -DestinationPath '%TMP_EXTRACT%' -Force"
if %errorlevel% neq 0 (
    echo  [!] 解压失败。
    del "%TMP_ZIP%" >nul 2>&1
    pause & exit /b 1
)

:: 找到内层目录 (PlanTrace-main)
set "SRC_DIR="
for /d %%d in ("%TMP_EXTRACT%\*") do set "SRC_DIR=%%d"
if not exist "!SRC_DIR!\src\" (
    echo  [!] 解压内容结构异常，找不到 src\ 目录。
    goto :cleanup_fail
)
echo      解压完成 ✓

:: ── 应用更新（只覆盖代码文件）────────────────────────────────────────────────
echo [3/4] 应用更新...
powershell -NoProfile -Command ^
    "$src = '!SRC_DIR!'; $dst = '!INSTALL_DIR!'; " ^
    "foreach ($dir in @('src','public')) { " ^
    "  $s = Join-Path $src $dir; $d = Join-Path $dst $dir; " ^
    "  if (Test-Path $s) { " ^
    "    Remove-Item $d -Recurse -Force -ErrorAction SilentlyContinue; " ^
    "    Copy-Item $s $dst -Recurse -Force; " ^
    "    Write-Host ('  已更新 ' + $dir + '\ ✓') " ^
    "  } " ^
    "} " ^
    "foreach ($f in @('index.html','package.json','eslint.config.js','vite.config.js','Update-PlanTrace.bat')) { " ^
    "  $s = Join-Path $src $f; $d = Join-Path $dst $f; " ^
    "  if (Test-Path $s) { Copy-Item $s $d -Force; Write-Host ('  已更新 ' + $f + ' ✓') } " ^
    "}"

if %errorlevel% neq 0 (
    echo  [!] 文件更新失败。
    goto :cleanup_fail
)

:: ── npm install ───────────────────────────────────────────────────────────────
echo [4/4] 更新依赖包...
cd /d "!INSTALL_DIR!"
npm install --prefer-offline --loglevel warn
if %errorlevel% neq 0 (
    echo  [!] 依赖安装失败，尝试清理缓存...
    npm cache clean --force
    npm install --loglevel warn
    if %errorlevel% neq 0 (
        echo  [!] 依赖安装仍失败，请检查网络后重试。
        goto :cleanup_fail
    )
)
echo      依赖更新完成 ✓

:: ── 清理临时文件 ──────────────────────────────────────────────────────────────
del "%TMP_ZIP%" >nul 2>&1
rmdir /s /q "%TMP_EXTRACT%" >nul 2>&1

:: ── 完成 ─────────────────────────────────────────────────────────────────────
echo.
echo ════════════════════════════════════════════════════════
echo   ✅ PlanTrace 已成功更新到 v!REMOTE_VER!
echo.
echo   重新启动即可使用新版本：
echo     双击 start.bat  或  双击桌面 PlanTrace 图标
echo ════════════════════════════════════════════════════════
echo.
set /p "LAUNCH=现在启动 PlanTrace？(Y/n): "
if /i not "!LAUNCH!"=="n" (
    start "" "!INSTALL_DIR!\start.bat"
)
goto :eof

:cleanup_fail
del "%TMP_ZIP%" >nul 2>&1
if exist "%TMP_EXTRACT%" rmdir /s /q "%TMP_EXTRACT%" >nul 2>&1
echo.
echo  ❌ 更新未能完成，请重试。用户数据未受影响。
pause
exit /b 1
