@echo off
title Cloud Messenger Launcher
COLOR 0B
cls

echo =======================================================
echo          Cloud Messenger Local Launcher
echo =======================================================
echo.

:: Check if Node.js is installed
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed!
    echo Please install Node.js from https://nodejs.org first.
    echo.
    pause
    exit /b
)

:: Install dependencies if node_modules doesn't exist
if not exist "node_modules\" (
    echo [INFO] First-time setup: Installing package dependencies with npm ci...
    echo Please wait, this might take a minute...
    call npm ci
    if %errorlevel% neq 0 (
        echo [WARN] npm ci encountered an issue, trying npm install...
        call npm install
    )
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to install dependencies.
        pause
        exit /b
    )
    echo [SUCCESS] Dependencies installed!
    echo.
)

echo =======================================================
echo               SECURITY & HTTPS GUIDANCE
echo =======================================================
echo  - Local development runs on http://localhost:3000
echo  - In PRODUCTION or across external networks, ALWAYS run
echo    behind an HTTPS reverse proxy (Nginx, Caddy, Cloudflare)
echo    to protect authentication cookies (__Host- / secure)
echo    and prevent credential / session eavesdropping.
echo =======================================================
echo.
echo Starting development server...
echo.

call npm run dev

pause
