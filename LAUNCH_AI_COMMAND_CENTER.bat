@echo off
setlocal

title AI Command Center Launcher
color 0A

set "ROOT=%~dp0"
set "APP_RELEASE=%ROOT%src-tauri\target\release\app.exe"
set "APP_DEBUG=%ROOT%src-tauri\target\debug\app.exe"
set "APP_EXE="

echo.
echo ============================================================
echo  AI Command Center Launcher
echo ============================================================
echo.

tasklist /fi "imagename eq app.exe" | find /i "app.exe" >nul
if %errorlevel%==0 (
  echo [INFO] AI Command Center appears to already be running.
  echo [INFO] Close the current window first if you want a fresh start.
  echo.
  exit /b 0
)

if exist "%APP_RELEASE%" set "APP_EXE=%APP_RELEASE%"
if not defined APP_EXE if exist "%APP_DEBUG%" set "APP_EXE=%APP_DEBUG%"

if not defined APP_EXE (
  echo [ERROR] Could not find app executable.
  echo.
  echo Checked:
  echo   %APP_RELEASE%
  echo   %APP_DEBUG%
  echo.
  echo Build first, then run this launcher again.
  echo.
  exit /b 1
)

echo [OK] Launching:
echo   %APP_EXE%
echo.

start "" "%APP_EXE%"
timeout /t 2 /nobreak >nul
tasklist /fi "imagename eq app.exe" | find /i "app.exe" >nul
if %errorlevel% neq 0 (
  echo [WARN] Launch command was sent, but app.exe is not running.
  echo [WARN] If a window flashed and closed, check runtime dependencies.
  echo.
  exit /b 1
)

echo [OK] Launch command sent.
echo.
exit /b 0
