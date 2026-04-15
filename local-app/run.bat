@echo off
cd /d "%~dp0"

where python >nul 2>nul
if errorlevel 1 (
    echo ERROR: Python not found. Please install Python 3.9 or later from python.org
    pause
    exit /b 1
)

if not exist ".venv" (
    echo Setting up virtual environment (first run only)...
    python -m venv .venv
)

call .venv\Scripts\activate.bat

if not exist ".venv\.requirements_installed" (
    echo Installing requirements (first run only)...
    pip install -q -r requirements.txt
    type nul > .venv\.requirements_installed
)

echo Starting National Pipeline Manager...
echo Open http://localhost:8501 in your browser
echo Press Ctrl+C to stop
echo.
streamlit run app.py --server.headless false
pause
