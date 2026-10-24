@echo off
setlocal EnableDelayedExpansion
title Crypt-Crawler: Tactical Turn-Based Dungeon

cd /d "%~dp0"

:: -----------------------------------------------------------------
:: 1. Detect Python executable
:: -----------------------------------------------------------------
set "PYTHON_EXE="

where py >nul 2>&1
if !ERRORLEVEL! EQU 0 (
    py -3 -c "import sys" >nul 2>&1
    if !ERRORLEVEL! EQU 0 (
        set "PYTHON_EXE=py -3"
        goto :python_ready
    )
)

where python >nul 2>&1
if !ERRORLEVEL! EQU 0 (
    python -c "import sys" >nul 2>&1
    if !ERRORLEVEL! EQU 0 (
        set "PYTHON_EXE=python"
        goto :python_ready
    )
)

where python3 >nul 2>&1
if !ERRORLEVEL! EQU 0 (
    python3 -c "import sys" >nul 2>&1
    if !ERRORLEVEL! EQU 0 (
        set "PYTHON_EXE=python3"
        goto :python_ready
    )
)

for %%D in (
    "C:\Python314\python.exe"
    "C:\Python313\python.exe"
    "C:\Python312\python.exe"
    "C:\Python311\python.exe"
    "C:\Python310\python.exe"
    "%LOCALAPPDATA%\Programs\Python\Python314\python.exe"
    "%LOCALAPPDATA%\Programs\Python\Python313\python.exe"
    "%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
    "%LOCALAPPDATA%\Programs\Python\Python311\python.exe"
    "%LOCALAPPDATA%\Programs\Python\Python310\python.exe"
) do (
    if exist %%D (
        set "PYTHON_EXE=%%~D"
        goto :python_ready
    )
)

echo [ERROR] Python 3 was not detected on this machine.
echo Please install Python 3.10 or higher from https://python.org
echo.
pause
exit /b 1

:python_ready
echo ============================================================
echo   Starting Crypt-Crawler Web Server and Opening Browser...
echo ============================================================
%PYTHON_EXE% run.py --open
if errorlevel 1 (
    echo.
    echo Server stopped with an error code.
    pause
)
