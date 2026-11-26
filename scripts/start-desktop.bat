@echo off
setlocal
REM Console fallback. Prefer tray: start-tray.vbs
cd /d "%~dp0.."
start "" wscript "%~dp0start-tray.vbs"
