# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Contains a Parts Analysis Dashboard that processes raw National QuoteData and Development Booking xlsx files to generate Natman Bookings, National PDSync, and a combined analysis with New Deals vs PD Info split.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Python**: 3.11 (for analysis script)
- **Frontend**: React + Vite + Tailwind CSS + shadcn/ui + Recharts

## Artifacts

### Parts Analysis Dashboard (`artifacts/parts-dashboard`)
- React + Vite data visualization dashboard at preview path `/`
- Dark navy sidebar UI (National Pipeline Manager branding)
- Drag-and-drop file upload for National QuoteData (.xlsx) and Development Booking (.xlsx)
- Configurable parameters: Quote Cutoff Year, FAI Threshold, Pipedrive Sync toggle
- Tabbed results: Sales Analytics, Charts, All Parts, New Deals, PD Info
- Sidebar tabs for generated outputs: National PDSync, Natman Bookings
- Download buttons for all generated files (Combined Analysis, PDSync, Natman Bookings)
- KPI cards, pie charts, bar charts for sales analytics

### API Server (`artifacts/api-server`)
- Express 5 backend
- `POST /api/analysis/run` — accepts xlsx file uploads (multipart: `national_file`, `booking_file`), runs Python analysis, returns JSON
- `GET /api/analysis/download?path=...` — serves generated Excel files for download
- `GET /api/healthz` — health check

## Python Analysis Script

Located at `scripts/src/combine_parts_analysis.py`. Accepts two raw xlsx files directly:
- **National QuoteData**: Raw quote export (~130 columns, quote/part/customer data)
- **Development Booking**: Raw booking data (19 columns, sales orders)

### Pipeline Flow
1. Process Development Booking → generates **Natman_Bookings** output (4 sheets: MAIN, UNIQUE, TOTALS, LANDMARK)
2. Transform National QuoteData → consolidated rows → generates **National_PDSync_PDUploadPreview** output
3. Search Pipedrive for each unique customer part ID to find existing deals
4. Split by PD_ID: rows without PD match → **New_Deals**, rows with PD match → **PD_Info**
5. Generate combined Parts_Analysis Excel (3 sheets: All_Unique_Parts, New_Deals, PD_Info)

### CLI Arguments
- `--national-file`: Path to National QuoteData xlsx
- `--booking-file`: Path to Development Booking xlsx
- `--output-dir`: Output directory for Excel files
- `--cutoff-year`: Quote date cutoff year (default: 2021)
- `--fai-threshold`: FAI threshold 0-1 (default: 0.50)
- `--json-output`: Path to write JSON summary for dashboard consumption
- `--pd-cache-file`: Optional path to pd_cache.json (skips Pipedrive search)

### Output Files
- `Natman_Bookings_YYYYMMDD.xlsx` — Processed bookings (MAIN/UNIQUE/TOTALS/LANDMARK)
- `National_PDSync_PDUploadPreview_YYYYMMDD.xlsx` — Consolidated PDSync output
- `Parts_Analysis_YYYYMMDD_HHMMSS.xlsx` — Combined analysis (All_Unique_Parts/New_Deals/PD_Info)
- JSON summary with analytics (when `--json-output` is specified)

### CALC_LABEL Logic
- If `Mapped_Probability` = NC → "New Customer"
- If `Mapped_PD_P2_Time` > `FIRST_ORDER_DATE` and probability != NC → "Repeat"
- Everything else → "New Part"

### Pipedrive Integration
- Uses `PIPEDRIVE_API_KEY` environment secret
- Bundled `scripts/src/pd_cache.json` — 2438 entries (489 with PD deal IDs, 1949 without)
- Script auto-discovers bundled pd_cache.json if no `--pd-cache-file` argument provided
- Live Pipedrive API fetch gated behind `FETCH_PD_DETAILS=true` env var (avoids timeout on ~200+ deals)
- PD cache maps customer_part → deal_id for split into New_Deals vs PD_Info

### Reference Data
- `scripts/src/org_ids.csv` — 143 org ID mappings (bundled)
- `scripts/src/pd_cache.json` — Pipedrive deal cache (bundled)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally
- `python3 scripts/src/combine_parts_analysis.py --national-file <file> --booking-file <file> --output-dir <dir>` — run analysis directly

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
