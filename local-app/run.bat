@echo off
cd /d "%~dp0"

echo ============================================================
echo  National Pipeline Manager - Local App
echo ============================================================
echo.

REM Check Python is available
where python >nul 2>nul
if errorlevel 1 (
    echo ERROR: Python was not found on your system.
    echo Please install Python 3.9 or later from https://www.python.org/downloads/
    echo Make sure to check "Add Python to PATH" during installation.
    echo.
    pause
    exit /b 1
)

echo Python found. Checking version...
python --version
echo.

REM Create virtual environment if needed
if not exist ".venv" (
    echo Creating virtual environment...
    python -m venv .venv
    if errorlevel 1 (
        echo ERROR: Failed to create virtual environment.
        echo Make sure Python venv module is available.
        pause
        exit /b 1
    )
    echo Virtual environment created.
    echo.
)

REM Activate the virtual environment
echo Activating virtual environment...
call .venv\Scripts\activate.bat
if errorlevel 1 (
    echo ERROR: Could not activate virtual environment.
    echo Try deleting the .venv folder and running again.
    pause
    exit /b 1
)

REM Install requirements (only once, using a marker file)
if not exist ".venv\.requirements_installed" (
    echo Installing required packages (first run only, may take a minute)...
    pip install -r requirements.txt
    if errorlevel 1 (
        echo ERROR: Package installation failed.
        echo Check your internet connection and try again.
        pause
        exit /b 1
    )
    type nul > .venv\.requirements_installed
    echo Packages installed successfully.
    echo.
)

echo Starting National Pipeline Manager...
echo.
echo Your browser will open at: http://localhost:8501
echo Press Ctrl+C in this window to stop the server.
echo.
streamlit run app.py --server.headless false

if errorlevel 1 (
    echo.
    echo The app exited with an error. See output above for details.
)
pause
