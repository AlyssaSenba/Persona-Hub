@echo off
cd /d "%~dp0"
set ELECTRON_RUN_AS_NODE=

echo Starting Persona Lab...
echo.

if not exist "node_modules" (
  echo Installing dependencies for the first time...
  call npm.cmd install
  if errorlevel 1 goto :error
)

if not exist "node_modules\electron\dist\electron.exe" (
  echo Downloading Electron binary...
  set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
  node node_modules\electron\install.js
  if errorlevel 1 goto :error
)

call npm.cmd run dev
if errorlevel 1 goto :error
goto :eof

:error
echo.
echo Something went wrong. Copy the error above and send it to the assistant.
echo Do NOT paste your API Key.
pause
