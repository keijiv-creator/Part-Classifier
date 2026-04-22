#!/usr/bin/env python3
"""
refresh_pd_data.py — Refresh Pipedrive data files for the Parts Analysis app.

Fetches deals from Pipedrive, builds a fresh pd_cache.json (customer part →
deal ID mapping) and a fresh pd_deals_export.json (full deal details), then
writes both files to local-app/data/.

Usage:
    export PIPEDRIVE_API_KEY=your_token_here
    python local-app/refresh_pd_data.py              # full refresh
    python local-app/refresh_pd_data.py --incremental  # incremental (auto-falls back to full)
    python local-app/refresh_pd_data.py --full       # explicit full refresh

Auto-detection: if --incremental is not passed, the script checks whether a
metadata file (data/pd_refresh_meta.json) exists. If it does, it runs
incrementally; otherwise it runs a full refresh.
"""

import argparse
import os
import sys
import json
import time
import datetime
import requests

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(SCRIPT_DIR, 'data')

sys.path.insert(0, DATA_DIR)
import combine_parts_analysis as cpa

API_TOKEN = os.environ.get('PIPEDRIVE_API_KEY', '')
BASE_URL = cpa.BASE_URL
PD_FIELDS = cpa.PD_FIELDS

CACHE_FILE = os.path.join(DATA_DIR, 'pd_cache.json')
DEALS_FILE = os.path.join(DATA_DIR, 'pd_deals_export.json')
META_FILE  = os.path.join(DATA_DIR, 'pd_refresh_meta.json')


# ---------------------------------------------------------------------------
# Metadata helpers
# ---------------------------------------------------------------------------

def load_meta():
    """Return the metadata dict from disk, or an empty dict if not present."""
    if not os.path.exists(META_FILE):
        return {}
    try:
        with open(META_FILE, 'r', encoding='utf-8') as fh:
            return json.load(fh)
    except (json.JSONDecodeError, OSError):
        return {}


def save_meta(meta):
    """Write the metadata dict to disk."""
    with open(META_FILE, 'w', encoding='utf-8') as fh:
        json.dump(meta, fh, indent=2)
    print(f"  Metadata saved: {META_FILE}")


# ---------------------------------------------------------------------------
# Pipedrive API helpers
# ---------------------------------------------------------------------------

def _fetch_deals_page(params):
    """Make a single paginated request to /deals and return (data, pagination)."""
    try:
        resp = requests.get(
            f'{BASE_URL}/deals',
            params=params,
            timeout=30,
        )
    except requests.RequestException as exc:
        return None, str(exc)

    if resp.status_code == 429:
        return 'rate_limit', None

    if resp.status_code != 200:
        return None, f"HTTP {resp.status_code}: {resp.text[:200]}"

    payload = resp.json()
    data = payload.get('data') or []
    pagination = payload.get('additional_data', {}).get('pagination', {})
    return data, pagination


def fetch_deals(updated_after=None):
    """Fetch deals from Pipedrive using paginated requests.

    Args:
        updated_after: If given (an ISO 8601 string, e.g. "2024-01-01T12:00:00Z"),
                       only deals updated at or after this time are fetched via the
                       Pipedrive `updated_after` query parameter. Otherwise all deals
                       are fetched.

    Returns:
        A list of raw deal dicts.
    """
    if not API_TOKEN:
        print("ERROR: PIPEDRIVE_API_KEY is not set in the environment.")
        print("       Export it before running this script:")
        print("         export PIPEDRIVE_API_KEY=your_token_here")
        sys.exit(1)

    if updated_after:
        print(f"Fetching deals updated after {updated_after} from Pipedrive...")
        print(f"  (API filter: updated_after={updated_after})")
    else:
        print("Fetching all deals from Pipedrive...")

    all_deals = []
    start = 0
    limit = 500
    page = 0

    while True:
        page += 1
        params = {
            'api_token': API_TOKEN,
            'status': 'all',
            'start': start,
            'limit': limit,
        }
        if updated_after:
            params['updated_after'] = updated_after

        data, pagination = _fetch_deals_page(params)

        if data == 'rate_limit':
            print("  Rate limited — waiting 15 s...")
            time.sleep(15)
            continue

        if data is None:
            print(f"  Network/API error on page {page}: {pagination}")
            sys.exit(1)

        all_deals.extend(data)

        more_items = pagination.get('more_items_in_collection', False)
        next_start  = pagination.get('next_start')

        print(f"  Page {page}: fetched {len(data)} deals (total so far: {len(all_deals)})")

        if not more_items or not next_start:
            break

        start = next_start
        time.sleep(0.3)

    print(f"  Total deals fetched: {len(all_deals)}")
    return all_deals


# ---------------------------------------------------------------------------
# Cache / export builders
# ---------------------------------------------------------------------------

def build_cache(all_deals):
    """Build pd_cache.json from all deals.

    Only includes deals that have the customer_part custom field populated.
    Returns a dict mapping CUSTOMER_PART_ID (upper-cased) → deal_id (int).
    """
    customer_part_field = PD_FIELDS['customer_part']
    pd_cache = {}
    skipped = 0

    for deal in all_deals:
        cust_part = str(deal.get(customer_part_field) or '').strip().upper()
        deal_id = deal.get('id')
        if not cust_part or not deal_id:
            skipped += 1
            continue
        if cust_part in pd_cache:
            existing = pd_cache[cust_part]
            if deal_id > existing:
                pd_cache[cust_part] = deal_id
        else:
            pd_cache[cust_part] = deal_id

    print(f"  Cache built: {len(pd_cache)} unique customer parts ({skipped} deals skipped — no customer part field)")
    return pd_cache


def merge_cache(existing_cache, new_deals):
    """Merge newly fetched deals into an existing cache dict.

    For each deal in new_deals, if the customer part is already in the cache
    the entry is replaced only when the incoming deal ID is higher (same
    tie-breaking rule as build_cache). New parts are added as usual.

    Returns the (mutated) existing_cache and counts of added/updated entries.
    """
    customer_part_field = PD_FIELDS['customer_part']
    added = updated = skipped = 0

    for deal in new_deals:
        cust_part = str(deal.get(customer_part_field) or '').strip().upper()
        deal_id = deal.get('id')
        if not cust_part or not deal_id:
            skipped += 1
            continue
        if cust_part in existing_cache:
            if deal_id > existing_cache[cust_part]:
                existing_cache[cust_part] = deal_id
                updated += 1
        else:
            existing_cache[cust_part] = deal_id
            added += 1

    print(f"  Cache merge: {added} added, {updated} updated, {skipped} skipped")
    return existing_cache


def build_deals_export(deal_ids):
    """Fetch detailed info for each deal ID and return the deals export dict."""
    deal_details = cpa.fetch_deal_details(deal_ids)
    return {str(k): v for k, v in deal_details.items()}


def write_json(path, data, label):
    with open(path, 'w', encoding='utf-8') as fh:
        json.dump(data, fh, indent=2, default=str)
    size_kb = os.path.getsize(path) / 1024
    print(f"  Wrote {label}: {path} ({size_kb:.1f} KB, {len(data)} entries)")


def load_json_file(path, label):
    """Load a JSON file from disk. Returns empty dict on failure."""
    if not os.path.exists(path):
        print(f"  {label} not found — will create from scratch.")
        return {}
    try:
        with open(path, 'r', encoding='utf-8') as fh:
            data = json.load(fh)
        print(f"  Loaded {label}: {len(data)} entries")
        return data
    except (json.JSONDecodeError, OSError) as exc:
        print(f"  WARNING: could not read {label} ({exc}) — starting fresh.")
        return {}


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Refresh Pipedrive data files.")
    mode_group = parser.add_mutually_exclusive_group()
    mode_group.add_argument(
        '--incremental', action='store_true',
        help='Only fetch deals modified since the last successful refresh. '
             'Falls back to a full refresh when no metadata file exists.',
    )
    mode_group.add_argument(
        '--full', action='store_true',
        help='Force a full refresh even if a metadata file exists.',
    )
    args = parser.parse_args()

    print("=" * 60)
    print("Pipedrive data refresh")
    print("=" * 60)

    if not API_TOKEN:
        print("\nERROR: PIPEDRIVE_API_KEY is not set in the environment.")
        print("       Export it before running this script:")
        print("         export PIPEDRIVE_API_KEY=your_token_here")
        sys.exit(1)

    # -----------------------------------------------------------------------
    # Decide mode: full vs incremental
    # -----------------------------------------------------------------------
    meta = load_meta()
    last_refresh = meta.get('last_refresh_utc')

    if args.full:
        incremental = False
        print("\nMode: FULL refresh (--full flag set)")
    elif args.incremental:
        if last_refresh:
            incremental = True
            print(f"\nMode: INCREMENTAL (--incremental flag set, last refresh: {last_refresh})")
        else:
            incremental = False
            print("\nMode: FULL refresh (--incremental requested but no metadata found — falling back)")
    else:
        # Auto-detect based on metadata presence
        if last_refresh:
            incremental = True
            print(f"\nMode: INCREMENTAL (auto-detected; last refresh: {last_refresh})")
        else:
            incremental = False
            print("\nMode: FULL refresh (no metadata file found)")

    # -----------------------------------------------------------------------
    # Guard: if incremental mode was chosen but either base data file is
    # absent, the merge would produce a partial/empty dataset. Force a full
    # refresh so the output is always complete.
    # -----------------------------------------------------------------------
    if incremental and (not os.path.exists(CACHE_FILE) or not os.path.exists(DEALS_FILE)):
        print("\n  WARNING: base data file(s) missing — forcing FULL refresh to ensure completeness.")
        incremental = False

    # -----------------------------------------------------------------------
    # Record the start time *before* fetching so we don't miss fast updates.
    # Store in ISO 8601 format — this is what Pipedrive's `updated_after`
    # parameter expects.
    # -----------------------------------------------------------------------
    run_start_utc = datetime.datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')

    # -----------------------------------------------------------------------
    # Fetch
    # -----------------------------------------------------------------------
    if incremental:
        new_deals = fetch_deals(updated_after=last_refresh)

        if not new_deals:
            print("\nNo deals changed since last refresh. Files are already up to date.")
            # Still bump the metadata timestamp so the window stays short.
            meta['last_refresh_utc'] = run_start_utc
            meta['last_refresh_mode'] = 'incremental'
            save_meta(meta)
            return

        print(f"\nLoading existing cached files...")
        existing_cache = load_json_file(CACHE_FILE, 'pd_cache.json')
        existing_export = load_json_file(DEALS_FILE, 'pd_deals_export.json')

        print("\nMerging new deals into pd_cache.json...")
        pd_cache = merge_cache(existing_cache, new_deals)

        # Identify deal IDs that need their details refreshed
        changed_deal_ids = [
            d.get('id') for d in new_deals if d.get('id') is not None
        ]
        # Also include any deal IDs now in the cache that aren't in the export
        cache_ids = set(pd_cache.values())
        export_ids = set(int(k) for k in existing_export.keys() if k.isdigit())
        missing_from_export = cache_ids - export_ids
        deal_ids_to_refresh = list(set(changed_deal_ids) | missing_from_export)

        print(f"\nFetching details for {len(deal_ids_to_refresh)} changed/new deals...")
        new_export_entries = build_deals_export(deal_ids_to_refresh)

        # Merge into existing export
        existing_export.update(new_export_entries)
        pd_deals_export = existing_export

        print(f"\nWriting merged files to data/...")
        write_json(CACHE_FILE, pd_cache, 'pd_cache.json')
        write_json(DEALS_FILE, pd_deals_export, 'pd_deals_export.json')

        print(f"\nIncremental refresh complete.")
        print(f"  Deals fetched/merged : {len(new_deals)}")
        print(f"  Deal details updated : {len(new_export_entries)}")
        print(f"  pd_cache.json        — {len(pd_cache)} parts total")
        print(f"  pd_deals_export.json — {len(pd_deals_export)} deals total")

    else:
        all_deals = fetch_deals()

        print("\nBuilding pd_cache.json...")
        pd_cache = build_cache(all_deals)

        print("\nFetching deal details for pd_deals_export.json...")
        deal_ids = list(set(pd_cache.values()))
        pd_deals_export = build_deals_export(deal_ids)

        print("\nWriting files to data/...")
        write_json(CACHE_FILE, pd_cache, 'pd_cache.json')
        write_json(DEALS_FILE, pd_deals_export, 'pd_deals_export.json')

        print("\nFull refresh complete.")
        print(f"  pd_cache.json        — {len(pd_cache)} parts")
        print(f"  pd_deals_export.json — {len(pd_deals_export)} deals")

    # -----------------------------------------------------------------------
    # Persist metadata for next incremental run
    # -----------------------------------------------------------------------
    meta['last_refresh_utc'] = run_start_utc
    meta['last_refresh_mode'] = 'incremental' if incremental else 'full'
    save_meta(meta)


if __name__ == '__main__':
    main()
