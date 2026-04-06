# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Contains a Parts Analysis Dashboard that combines data from Natman Bookings and Python National to generate repeat vs. new business analysis.

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
- Drag-and-drop file upload for Natman Bookings and Python National zip files
- Configurable parameters: Quote Cutoff Year, FAI Threshold
- Tabbed results: Sales Analytics, Charts, All Parts, New Deals, PD Info
- KPI cards, pie charts, bar charts for sales analytics
- Excel file download capability

### API Server (`artifacts/api-server`)
- Express 5 backend
- `POST /api/analysis/run` — accepts file uploads (multipart), runs Python analysis, returns JSON
  - **Smart caching**: Check A (file name match) + Check B (row count match) + params match → returns last successful run's cached result
  - **Exact hash cache**: SHA-256 hash of both files + params used as cache key
  - Returns `cached: true` and `cacheReason` when serving from cache
- `GET /api/analysis/history` — returns run log (last 50 runs)
- `GET /api/analysis/history/:id` — loads cached result for a specific historical run
- `GET /api/analysis/download?path=...` — serves generated Excel files for download
- `GET /api/healthz` — health check
- **Run Log** (`/tmp/analysis_runs.json`): Tracks fileName, rowCount, uploadTime, status, errorSummary, cacheKey, result stats

## Python Analysis Script

Located at `scripts/src/combine_parts_analysis.py`. Combines data from two source zip files:
- **Natman Bookings**: Contains LANDMARK sheet with first order dates
- **Python National**: Contains quote data, org_ids.csv, pd_cache.json

### CLI Arguments
- `--bookings-zip`: Path to Natman Bookings zip
- `--national-zip`: Path to Python National zip
- `--output-dir`: Output directory for Excel file
- `--cutoff-year`: Quote date cutoff year (default: 2021)
- `--fai-threshold`: FAI threshold 0-1 (default: 0.50)
- `--json-output`: Path to write JSON summary for dashboard consumption

### Output
- 3-sheet Excel file: All_Unique_Parts, New_Deals, PD_Info
- JSON summary with analytics (when `--json-output` is specified)

### CALC_LABEL Logic
- If `Mapped_Probability` = NC → "New Customer"
- If `Mapped_PD_P2_Time` > `FIRST_ORDER_DATE` and probability != NC → "Repeat"
- Everything else → "New Part"

### Pipedrive Integration
- Uses `PIPEDRIVE_API_KEY` environment secret
- Fetches deal details for PD-matched parts
- Translates field option IDs to human-readable labels (label, industry, deal_type, mfg_type, platform_company, stage_id)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally
- `python3 scripts/src/combine_parts_analysis.py` — run analysis directly

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
