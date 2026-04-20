# National Pipeline Manager

A monorepo for analysing National QuoteData and Development Booking exports. It processes raw `.xlsx` files, matches parts against Pipedrive deal data, tracks changes across runs, and surfaces results through a web dashboard or a self-contained local app.

---

## What it does

- Ingests National QuoteData and Development Booking `.xlsx` exports
- Splits data into **New Deals** and **PD Info** categories
- Compares successive runs to highlight NEW, CHANGED, and REMOVED parts
- Generates Excel output files (Natman Bookings, PDSync, Combined Analysis)
- Provides a React web dashboard with KPI cards, charts, and diff tables
- Includes a standalone Streamlit app for offline / no-server use

---

## Repository layout

```
artifacts/
  api-server/          Express API — triggers analysis, stores run metadata
  parts-dashboard/     React + Vite web dashboard
local-app/             Self-contained Streamlit app (no Node/DB required)
  data/                Reference files (pd_cache.json, pd_deals_export.json, org_ids.csv)
lib/
  db/                  Drizzle ORM schema and migrations (PostgreSQL)
  api-spec/            OpenAPI spec
  api-zod/             Zod schemas generated from the spec
  api-client-react/    React Query hooks generated from the spec
scripts/               Python analysis engine
```

---

## Option A — Web dashboard (full stack)

> The web dashboard is designed to run inside the Replit environment, which handles path-based proxy routing between the dashboard and API server. Running it locally outside Replit requires additional proxy configuration.

### Prerequisites

| Tool | Version |
|------|---------|
| Node.js | 18 or later |
| pnpm | 9 or later |
| PostgreSQL | 14 or later |
| Python | 3.9 or later |

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure environment secrets

On Replit, set these in the **Secrets** panel. For a local clone, export them in your shell before starting each process.

**API server** (`artifacts/api-server`):

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string, e.g. `postgres://user:pass@localhost:5432/natman` |
| `PORT` | Port the API server listens on (e.g. `3001`) |

Optional for API server:

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_LEVEL` | `info` | Pino log level (`debug`, `info`, `warn`, `error`) |

**Web dashboard** (`artifacts/parts-dashboard`):

| Variable | Description |
|----------|-------------|
| `PORT` | Port the Vite dev server listens on (e.g. `5173`) |
| `BASE_PATH` | URL base path for the app, e.g. `/` or `/dashboard` |

### 3. Set up the database

Push the schema to your PostgreSQL database (creates tables if they don't exist):

```bash
pnpm --filter @workspace/db run push
```

### 4. Start both servers

Start the API server and web dashboard together with a single command:

```bash
pnpm dev
```

This launches both processes in parallel with colour-coded output. To start each server individually instead:

```bash
# API server only
pnpm --filter @workspace/api-server run dev

# Web dashboard only
pnpm --filter @workspace/parts-dashboard run dev
```

The dashboard will be available at the host and port you configured in `PORT`. The dashboard calls the API via the `/api` path prefix — in Replit this is routed automatically by the platform proxy.

---

## Option B — Local Streamlit app (no server required)

A fully self-contained version that runs on your machine with no Node.js, no database, and no internet connection needed.

### Prerequisites

- Python 3.9 or later — [python.org/downloads](https://www.python.org/downloads/)
  - Windows: tick **"Add Python to PATH"** during installation

### Quick start

**Mac / Linux:**
```bash
cd local-app
chmod +x run.sh
./run.sh
```

**Windows:**
```
Double-click  local-app\run.bat
```

The launcher automatically creates a virtual environment and installs dependencies on the first run (~1 minute). Subsequent runs start immediately.

The app opens at `http://localhost:8501`.

### Reference data files

`local-app/data/` contains three reference files used by the analysis engine:

| File | In repo | Description |
|------|---------|-------------|
| `org_ids.csv` | Yes | Maps customer names to Pipedrive organisation IDs |
| `pd_cache.json` | No | Maps each customer part number to its Pipedrive deal ID |
| `pd_deals_export.json` | No | Full deal details (title, value, status, stage, labels, …) keyed by deal ID |

The app runs without `pd_cache.json` and `pd_deals_export.json`. When both files are absent, the script falls back to live Pipedrive API lookups if `PIPEDRIVE_API_KEY` is set in the environment — otherwise **Pipedrive enrichment and deal matching are skipped entirely** and parts won't be linked to Pipedrive deal IDs. For offline use without an API token, place the exported files in `local-app/data/` before running.

---

#### `org_ids.csv` — Organisation ID mapping

**What it contains:** A two-column CSV with the header row `NAME,ORG ID` that maps customer names (upper-cased) to their numeric Pipedrive organisation ID. The script uses this during the quote-data transformation step to associate each part row with the correct organisation.

**It is bundled in the repository** and only needs to be refreshed when new customers are added to Pipedrive or existing ones are renamed.

**How to refresh:**
1. In Pipedrive, go to **Contacts → Organisations**.
2. Use the column selector to show at minimum **Name** and **ID**.
3. Export to CSV (Pipedrive → "…" menu → Export).
4. Open the exported CSV and rename the name column to `NAME` and the ID column to `ORG ID` — these exact header names are required by the script.
5. Replace `local-app/data/org_ids.csv` with the updated file.

---

#### `pd_cache.json` — Part-to-deal mapping cache

**What it contains:** A JSON object mapping each `CUSTOMER_PART_ID` (upper-cased string) to a numeric Pipedrive deal ID, e.g.:

```json
{
  "ABC-12345": 4821,
  "XYZ-99001": 5103
}
```

The script uses this file so it can match parts to Pipedrive deals without calling the API on every run.

**How the script uses it:** If `pd_cache.json` is present in `local-app/data/`, the script loads it and skips any live Pipedrive search. If the file is absent and `PIPEDRIVE_API_KEY` is set, the script searches Pipedrive live for each unique customer part — but **the results are only used in memory for the current run and are not written back to disk**.

**How to obtain or refresh:**

Option 1 — obtain from the project maintainer (recommended):

Ask the maintainer to share the latest `pd_cache.json` and place it in `local-app/data/`. This is the standard approach for anyone without direct Pipedrive API access.

Option 2 — live API search (no persistent file needed):

If you have a Pipedrive API token, you can run the analysis without `pd_cache.json` and the script will search Pipedrive live on each run:

**Mac / Linux:**
```bash
export PIPEDRIVE_API_KEY=your_token_here
cd local-app
./run.sh
```

**Windows (Command Prompt):**
```bat
set PIPEDRIVE_API_KEY=your_token_here
cd local-app
run.bat
```

**Windows (PowerShell):**
```powershell
$env:PIPEDRIVE_API_KEY = "your_token_here"
cd local-app
.\run.bat
```

Note: because the live results are not saved to disk, each run will re-query Pipedrive. For large part lists this can take several minutes.

Option 3 — build a persistent cache file:

After a successful live run (Option 2), you can capture the results by adding a brief export step or by modifying the script to write `pd_cache` to disk. Refer to the `search_pipedrive_deals()` function in `local-app/data/combine_parts_analysis.py` for the data structure.

**Pipedrive API token:** Personal API tokens are found in Pipedrive under **Your name → Personal preferences → API**. The environment variable name expected by the script is `PIPEDRIVE_API_KEY`.

---

#### `pd_deals_export.json` — Deal details export

**What it contains:** A JSON object keyed by deal ID (as a string), where each value is a dict of deal metadata used to populate the `PD_Info` sheet in the output Excel file:

```json
{
  "4821": {
    "title": "ABC Corp – New Part",
    "value": 15000,
    "status": "open",
    "stage_id": "Sampling",
    "org_name": "ABC Corporation",
    ...
  }
}
```

The fields captured are: `title`, `value`, `status`, `won_time`, `org_name`, `org_id`, `stage_id`, `label`, `platform_company`, `deal_type`, `mfg_type`, `industry`, `quote_number`, `po_number`, and phase-milestone timestamps (`p1_time` – `p5_time`).

**How the script uses it:** If `pd_deals_export.json` is present in `local-app/data/`, the script looks up each matched deal ID in the file and uses the stored metadata to populate the `PD_Info` sheet — no API calls required. If the file is absent, the script can fetch deal details live when `FETCH_PD_DETAILS=true` and `PIPEDRIVE_API_KEY` are both set, but **the fetched details are only used in memory and are not written back to disk as `pd_deals_export.json`**.

**How to obtain or refresh:**

Option 1 — obtain from the project maintainer (recommended):

Ask the maintainer to share the latest `pd_deals_export.json` and place it in `local-app/data/`. This avoids API calls entirely and is the fastest option for offline use.

Option 2 — live API fetch per run:

If you have a Pipedrive API token and a valid `pd_cache.json`, you can have the script fetch deal details live on every run:

**Mac / Linux:**
```bash
export PIPEDRIVE_API_KEY=your_token_here
export FETCH_PD_DETAILS=true
cd local-app
./run.sh
```

**Windows (Command Prompt):**
```bat
set PIPEDRIVE_API_KEY=your_token_here
set FETCH_PD_DETAILS=true
cd local-app
run.bat
```

**Windows (PowerShell):**
```powershell
$env:PIPEDRIVE_API_KEY = "your_token_here"
$env:FETCH_PD_DETAILS = "true"
cd local-app
.\run.bat
```

The script calls `GET /v1/deals/{id}` for each matched deal. Results are used to build the `PD_Info` sheet in the output Excel but are not saved to disk; the next run will fetch again.

Option 3 — build a persistent export file:

To create a reusable `pd_deals_export.json`, you can add a short script (or modify `local-app/data/combine_parts_analysis.py`) to call `fetch_deal_details()` and write the result to disk with `json.dump`. Refer to that function for the exact data structure expected.

### How to use

1. Upload files in the left sidebar:
   - **National QuoteData** — the raw quote export (`.xlsx`)
   - **Development Booking** — the development booking export (`.xlsx`)
2. Set options: cutoff year, FAI threshold, report date
3. Click **▶ Run Analysis**
4. View KPI cards, charts, and data tables in the main area
5. Download the output Excel from the **Dashboard** tab

Output files are saved to `local-app/output/`. Run history JSON files are stored in `local-app/runs/`.

---

## Features at a glance

- KPI summary cards (total parts, new deals, PD matches, FAI flags)
- Interactive charts — part distribution, booking trends, deal stage breakdown
- Line-by-line diff view between any two analysis runs
- One-click Excel export (Combined Analysis, Natman Bookings, PDSync)
- Run history with load / delete controls
- Offline-capable local app requiring only Python

---

## Common issues

**`DATABASE_URL must be set`** — The API server could not find a database URL. Ensure the `DATABASE_URL` secret is set before starting the server.

**`PORT environment variable is required`** — Set the `PORT` secret/env var before starting the API server or dashboard.

**`BASE_PATH environment variable is required`** — Set the `BASE_PATH` secret/env var before starting the dashboard (e.g. `BASE_PATH=/`).

**`Python not found`** (local app) — Install Python 3.9+ and ensure it is on your `PATH`.

**`pip install` fails** (local app) — Check your internet connection. Delete `local-app/.venv` and run the launcher again to retry from scratch.
