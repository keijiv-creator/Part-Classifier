#!/usr/bin/env python3
"""
refresh_pd_data.py — Refresh Pipedrive data files for the Parts Analysis app.

Fetches all deals from Pipedrive, builds a fresh pd_cache.json (customer part →
deal ID mapping) and a fresh pd_deals_export.json (full deal details), then
writes both files to local-app/data/.

Usage:
    export PIPEDRIVE_API_KEY=your_token_here
    python local-app/refresh_pd_data.py

Or run from within local-app/:
    PIPEDRIVE_API_KEY=your_token_here python refresh_pd_data.py
"""

import os
import sys
import json
import time
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


def fetch_all_deals():
    """Fetch every deal from Pipedrive using paginated requests.

    Returns a list of raw deal dicts.
    """
    if not API_TOKEN:
        print("ERROR: PIPEDRIVE_API_KEY is not set in the environment.")
        print("       Export it before running this script:")
        print("         export PIPEDRIVE_API_KEY=your_token_here")
        sys.exit(1)

    print("Fetching all deals from Pipedrive...")
    all_deals = []
    start = 0
    limit = 500
    page = 0

    while True:
        page += 1
        try:
            resp = requests.get(
                f'{BASE_URL}/deals',
                params={
                    'api_token': API_TOKEN,
                    'status': 'all',
                    'start': start,
                    'limit': limit,
                },
                timeout=30,
            )
        except requests.RequestException as exc:
            print(f"  Network error on page {page}: {exc}")
            sys.exit(1)

        if resp.status_code == 429:
            print("  Rate limited — waiting 15 s...")
            time.sleep(15)
            continue

        if resp.status_code != 200:
            print(f"  Unexpected status {resp.status_code} from Pipedrive: {resp.text[:200]}")
            sys.exit(1)

        payload = resp.json()
        data = payload.get('data') or []
        all_deals.extend(data)

        additional = payload.get('additional_data', {}).get('pagination', {})
        more_items = additional.get('more_items_in_collection', False)
        next_start = additional.get('next_start')

        print(f"  Page {page}: fetched {len(data)} deals (total so far: {len(all_deals)})")

        if not more_items or not next_start:
            break

        start = next_start
        time.sleep(0.3)

    print(f"  Total deals fetched: {len(all_deals)}")
    return all_deals


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


def build_deals_export(deal_ids):
    """Fetch detailed info for each deal ID and return the deals export dict.

    Keys are string deal IDs; values are the detail dicts returned by
    cpa.fetch_deal_details(), which uses the same structure as pd_deals_export.json.
    """
    deal_details = cpa.fetch_deal_details(deal_ids)
    return {str(k): v for k, v in deal_details.items()}


def write_json(path, data, label):
    with open(path, 'w', encoding='utf-8') as fh:
        json.dump(data, fh, indent=2, default=str)
    size_kb = os.path.getsize(path) / 1024
    print(f"  Wrote {label}: {path} ({size_kb:.1f} KB, {len(data)} entries)")


def main():
    print("=" * 60)
    print("Pipedrive data refresh")
    print("=" * 60)

    if not API_TOKEN:
        print("\nERROR: PIPEDRIVE_API_KEY is not set in the environment.")
        print("       Export it before running this script:")
        print("         export PIPEDRIVE_API_KEY=your_token_here")
        sys.exit(1)

    all_deals = fetch_all_deals()

    print("\nBuilding pd_cache.json...")
    pd_cache = build_cache(all_deals)

    print("\nFetching deal details for pd_deals_export.json...")
    deal_ids = list(set(pd_cache.values()))
    pd_deals_export = build_deals_export(deal_ids)

    print("\nWriting files to data/...")
    write_json(CACHE_FILE, pd_cache, 'pd_cache.json')
    write_json(DEALS_FILE, pd_deals_export, 'pd_deals_export.json')

    print("\nDone. Both files are up to date.")
    print(f"  pd_cache.json     — {len(pd_cache)} parts")
    print(f"  pd_deals_export.json — {len(pd_deals_export)} deals")


if __name__ == '__main__':
    main()
