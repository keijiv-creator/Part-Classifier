#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Use python3 if available, fall back to python
if command -v python3 &>/dev/null; then
    PYTHON=python3
elif command -v python &>/dev/null; then
    PYTHON=python
else
    echo "ERROR: Python not found. Please install Python 3.9 or later."
    exit 1
fi

# Create virtual environment if it doesn't exist
if [ ! -d ".venv" ]; then
    echo "Setting up virtual environment (first run only)..."
    $PYTHON -m venv .venv
fi

# Activate and install requirements
source .venv/bin/activate
pip install -q -r requirements.txt

# Launch Streamlit
echo "Starting National Pipeline Manager..."
echo "Open http://localhost:8501 in your browser"
echo "Press Ctrl+C to stop"
echo ""
streamlit run app.py --server.headless false
