@echo off
setlocal
chcp 65001 >nul
title Job Inbox
cd /d "%~dp0.."

echo [Job Inbox] Postgres...
docker compose up -d
if errorlevel 1 (
  echo.
  echo Docker Compose failed. Is Docker Desktop running?
  pause
  exit /b 1
)

echo [Job Inbox] Opening browser in a few seconds...
start "" cmd /c "timeout /t 6 /nobreak >nul && start http://localhost:5173/"

echo [Job Inbox] API + UI. Close this window or Ctrl+C to stop.
echo.
call npm run dev

echo.
echo Job Inbox stopped.
pause
