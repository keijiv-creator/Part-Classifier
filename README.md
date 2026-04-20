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

In two separate terminals:

```bash
# Terminal 1 — API server
pnpm --filter @workspace/api-server run dev

# Terminal 2 — Web dashboard
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

`local-app/data/` contains the following files used by the analysis engine:

| File | Included in repo | Description |
|------|-----------------|-------------|
| `org_ids.csv` | Yes | Organisation ID reference data — bundled |
| `pd_cache.json` | No | Pipedrive part-to-deal mapping cache |
| `pd_deals_export.json` | No | Pipedrive deal details export |

The app runs without `pd_cache.json` and `pd_deals_export.json`, but **Pipedrive enrichment and deal matching will be skipped** — parts won't be linked to Pipedrive deal IDs. To enable full PD matching, place updated exports in `local-app/data/` before running.

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
