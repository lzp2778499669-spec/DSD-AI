@echo off
title 蝶讯 AI-D.SD - 本地服务
echo ==========================================
echo   蝶讯 AI-D.SD 本地服务
echo   本机访问：http://localhost:3000
echo   局域网访问：http://本机IP:3000
echo   关闭这个黑窗口 = 停止服务
echo ==========================================
echo.

cd /d "%~dp0web"

echo 正在构建最新版本，请稍候...
call "%APPDATA%\npm\bun.cmd" run build
if errorlevel 1 (
    echo.
    echo 构建失败，请把上面的报错发给我。
    pause
    exit /b 1
)

echo.
echo 构建完成，正在启动服务...
echo.

call "%APPDATA%\npm\bun.cmd" run start

echo.
echo 服务已停止，按任意键关闭窗口。
pause
