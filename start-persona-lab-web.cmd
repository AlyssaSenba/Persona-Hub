@echo off
cd /d "%~dp0"

if not exist "node_modules" (
  echo Installing dependencies for the first time...
  call npm.cmd install
  if errorlevel 1 goto :error
)

if not exist "out\renderer\index.html" (
  echo Web UI build is missing.
  echo Please tell the assistant to rebuild the web UI.
  goto :error
)

echo Starting Persona Lab (web)...
echo Keep this window open while you use it.
node --experimental-strip-types --no-warnings server\index.mts
if errorlevel 1 goto :error
goto :eof

:error
echo.
echo Something went wrong. Copy the error above and send it to the assistant.
echo Do NOT paste your API Key.
pause
