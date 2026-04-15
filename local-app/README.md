# National Pipeline Manager — Local App

A portable, self-contained analysis tool that runs entirely on your machine.
No internet connection required. No server. No database.

## Requirements

- Python 3.9 or later ([python.org](https://www.python.org/downloads/))

## Quick Start

**Mac / Linux:**
```bash
chmod +x run.sh
./run.sh
```

**Windows:**
Double-click `run.bat`

A browser window will open at `http://localhost:8501` automatically.

> **First run:** The launcher creates a virtual environment and installs
> dependencies automatically. This takes ~1 minute. Subsequent runs are instant.

## How to Use

1. **Upload files** in the left sidebar:
   - **National QuoteData** — the raw quote export (.xlsx)
   - **Development Booking** — the development booking export (.xlsx)
2. **Set options**: cutoff year, FAI threshold, report date
3. Click **▶ Run Analysis**
4. View KPI cards, charts, and data tables in the main area
5. Download the output Excel from the **Dashboard** tab

## Run History

Every analysis is automatically saved as a JSON file in the `runs/` folder.
Click **Load** next to any past run in the sidebar to view it.
Use **🗑 Clear All History** to delete all saved runs.

## Output Files

- Excel output is saved to the `output/` folder
- Run history JSON files are stored in `runs/`

## What's Included

| File | Description |
|------|-------------|
| `app.py` | Streamlit GUI |
| `combine_parts_analysis.py` | Core analysis engine |
| `pd_cache.json` | Pipedrive part-to-deal cache |
| `pd_deals_export.json` | Pipedrive deal details export |
| `org_ids.csv` | Organisation ID reference data |
| `requirements.txt` | Python package list |
| `run.sh` | Mac/Linux launcher |
| `run.bat` | Windows launcher |

## Distributing

Zip the entire `local-app/` folder and share it.
Recipients only need Python installed — everything else is self-contained.
