@echo off
setlocal enabledelayedexpansion

REM ADB Helper Windows Build Script
REM This script builds the ADB Helper application for Windows (Win32 x64).
REM
REM Usage:
REM   build-windows.bat
REM
REM Requirements:
REM   - Node.js v18+
REM   - npm
REM
REM Output:
REM   release\adb-helper-win32-x64\ directory containing the packaged application.

echo ==============================================
echo   ADB Helper - Windows Build
echo ==============================================
echo.

REM Get the script directory
set "SCRIPT_DIR=%~dp0"
set "PROJECT_DIR=%SCRIPT_DIR%.."

REM Navigate to the project root
cd /d "%PROJECT_DIR%"

REM Check Node.js
echo -^> Checking Node.js...
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed. Please install Node.js v18+ first.
    exit /b 1
)
for /f "delims=" %%i in ('node -v') do set "NODE_VERSION=%%i"
echo   Node.js version: %NODE_VERSION%

REM Check npm
echo -^> Checking npm...
where npm >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: npm is not found.
    exit /b 1
)
echo   npm available

REM Install dependencies
echo.
echo -^> Installing dependencies...
call npm ci 2>nul || call npm install
if %errorlevel% neq 0 (
    echo ERROR: Dependency installation failed.
    exit /b 1
)
echo   Dependencies installed.

REM Build the project
echo.
echo -^> Building the project...
call npm run build
if %errorlevel% neq 0 (
    echo ERROR: Build failed.
    exit /b 1
)
echo   Build completed.

REM Package for Windows
echo.
echo -^> Packaging for Windows (Win32 x64)...
call npm run package:win
if %errorlevel% neq 0 (
    echo ERROR: Packaging failed.
    exit /b 1
)
echo   Packaging completed.

REM Verify output
echo.
if exist "release\adb-helper-win32-x64" (
    echo ==============================================
    echo   ✓ Build successful!
    echo   Output: release\adb-helper-win32-x64
    echo ==============================================
) else (
    echo ✗ Build may have failed. Please check the output above.
    exit /b 1
)

endlocal