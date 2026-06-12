@echo off
rem Archie launcher (Windows double-click).
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js is not installed.
  echo.
  echo   1. Go to https://nodejs.org and download the LTS installer ^(version 22 or newer^).
  echo   2. Install it, then run this script again.
  echo.
  pause
  exit /b 1
)

node scripts\start.mjs %*
if errorlevel 1 pause
