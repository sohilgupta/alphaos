"""
Update fair price columns for tickers already in either watchlist sheet.

  India sheet → col F   (ticker matched via col B nse:/NSE:/BOM: code)
  US sheet    → col G   (ticker matched via col B plain ticker)

Usage:
    python scripts/update_fair_prices.py             # all tickers with valuations
    python scripts/update_fair_prices.py --dry-run   # preview only
    python scripts/update_fair_prices.py --ticker HAL
    python scripts/update_fair_prices.py --region us
    python scripts/update_fair_prices.py --region india
"""
from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

VAULT = Path(__file__).resolve().parent.parent.parent / "vault"
VALUATIONS_DIR = VAULT / "data" / "valuations"

SHEET_IDS = {
    "us":    "1HVEG6wtWsm68o3YMgznhhLrlENOARqF41kqrcbJlqq4",
    "india": "1ez7O6V_fK-7-s-QSgvZsiw2YJkhyYEi52K1L0rauuFM",
}
FAIR_PRICE_COL = {"us": "G", "india": "F"}
VERDICT_COL    = {"us": "I", "india": "H"}
CONFIDENCE_COL = {"us": "J", "india": "I"}

# US Stock Watchlist has a different schema (no Verdict/Confidence) — skip verdict/conf there
VERDICT_SKIP_TABS = {"US Stock Watchlist"}

US_TABS    = ["AI Stocks", "Robotics Stocks", "Penny Stocks", "High Growth",
              "Space Exploration", "Rare Earth Metals", "US Stock Watchlist"]
INDIA_TABS = ["Stock Watchlist 2", "Stock Watchlist 3"]

CREDS_DIR = Path.home() / ".config" / "alphaos"
TOKEN_FILE = CREDS_DIR / "token.json"
CREDS_FILE = CREDS_DIR / "credentials.json"
SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]

# India sheet: vault ticker → possible stock codes in col B
INDIA_CODE_MAP: dict[str, list[str]] = {
    "ZENTEC":     ["nse:zentec",   "NSE:ZENTEC"],
    "PARAS":      ["nse:paras",    "NSE:PARAS"],
    "HAL":        ["nse:hal",      "NSE:HAL"],
    "BDL":        ["nse:bdl",      "NSE:BDL"],
    "BEL":        ["nse:bel",      "NSE:BEL"],
    "SOLARINDS":  ["nse:solarinds","NSE:SOLARINDS"],
    "ASTRAMICRO": ["NSE:ASTRAMICRO","nse:astramicro"],
    "BEML":       ["NSE:beml",     "nse:beml",    "NSE:BEML"],
    "DATAPATTNS": ["NSE:DATAPATTNS","nse:datapattns"],
    "APOLLOMICRO":["nse:apollo",   "NSE:APOLLO",  "nse:apollomicro"],
    "KRISHNADEF": ["NSE:KRISHNADEF","nse:krishnadef"],
    "WAAREE":     ["BOM:534618",   "bom:534618",  "NSE:WAAREEENER","nse:waareeener"],
}


def get_credentials():
    from google.oauth2.credentials import Credentials
    from google_auth_oauthlib.flow import InstalledAppFlow
    from google.auth.transport.requests import Request

    creds = None
    if TOKEN_FILE.exists():
        creds = Credentials.from_authorized_user_file(str(TOKEN_FILE), SCOPES)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            if not CREDS_FILE.exists():
                raise FileNotFoundError(f"No credentials at {CREDS_FILE}")
            flow = InstalledAppFlow.from_client_secrets_file(str(CREDS_FILE), SCOPES)
            creds = flow.run_local_server(port=0)
        TOKEN_FILE.parent.mkdir(parents=True, exist_ok=True)
        TOKEN_FILE.write_text(creds.to_json())
    return creds


def find_us_rows(ws, ticker: str) -> list[int]:
    rows = ws.get_all_values()
    return [i+1 for i, row in enumerate(rows)
            if len(row) > 1 and row[1].strip().upper() == ticker.upper()]


def find_india_rows(ws, ticker: str) -> list[tuple[int, str]]:
    codes = {c.strip().lower() for c in INDIA_CODE_MAP.get(ticker, [f"nse:{ticker.lower()}"])}
    rows = ws.get_all_values()
    return [(i+1, row[1]) for i, row in enumerate(rows)
            if len(row) > 1 and row[1].strip().lower() in codes]


def load_valuations(region_filter: str | None, ticker_filter: str | None) -> dict[str, dict]:
    result = {}
    for f in VALUATIONS_DIR.glob("*.json"):
        data = json.loads(f.read_text())
        if "error" in data or not data.get("weighted_fair_value"):
            continue
        if ticker_filter and data["ticker"] != ticker_filter:
            continue
        if region_filter and data.get("region") != region_filter:
            continue
        result[data["ticker"]] = data
    return result


def update_sheet(gc, region: str, valuations: dict, dry_run: bool):
    """Scan each tab ONCE, accumulate all updates, send ONE batchUpdate per tab."""
    import googleapiclient.discovery
    from google.oauth2.credentials import Credentials as GCreds

    raw_creds = GCreds.from_authorized_user_file(str(CREDS_DIR / "token.json"), SCOPES)
    service = googleapiclient.discovery.build('sheets', 'v4', credentials=raw_creds)

    ss = gc.open_by_key(SHEET_IDS[region]) if not dry_run else None
    tabs = US_TABS if region == "us" else INDIA_TABS
    fp_col = FAIR_PRICE_COL[region]
    v_col  = VERDICT_COL[region]
    c_col  = CONFIDENCE_COL[region]
    currency = "$" if region == "us" else "₹"

    if dry_run:
        for ticker, val in valuations.items():
            fv  = val["weighted_fair_value"]
            usd = val.get("upside_pct", 0)
            sign = "+" if usd >= 0 else ""
            print(f"  {ticker:<12} FV={currency}{fv:<8} ({sign}{usd}%)  "
                  f"verdict={val.get('verdict',''):<6} conf={val.get('confidence','')}")
        return list(valuations.keys()), []

    # Step 1: scan all tabs once
    index: dict[str, list[tuple[str, int, str]]] = {}
    for tab_name in tabs:
        try:
            ws = ss.worksheet(tab_name)
            time.sleep(1.2)
            rows = ws.get_all_values()
        except Exception as e:
            print(f"  [skip {tab_name}: {e}]")
            continue
        for i, row in enumerate(rows, start=1):
            cell_val = row[1].strip() if len(row) > 1 else ""
            if not cell_val:
                continue
            if region == "us":
                # Normalise "NASDAQ:SMCI" → "SMCI", "NYSE:XYZ" → "XYZ"
                norm = cell_val.upper()
                if ":" in norm:
                    norm = norm.split(":", 1)[1]
                index.setdefault(norm, []).append((tab_name, i, cell_val))
            else:
                cell_lower = cell_val.lower()
                matched = False
                for t, codes in INDIA_CODE_MAP.items():
                    if cell_lower in {c.lower() for c in codes}:
                        index.setdefault(t, []).append((tab_name, i, cell_val))
                        matched = True
                        break
                if not matched:
                    # Generic fallback: "nse:hal" → HAL, "NSE:HAL" → HAL, "HAL" → HAL
                    if ":" in cell_lower:
                        bare = cell_val.split(":", 1)[1].upper()
                    else:
                        bare = cell_val.upper()
                    if bare:
                        index.setdefault(bare, []).append((tab_name, i, cell_val))

    # Step 2: build per-tab update lists (no API calls yet)
    tab_data: dict[str, list[dict]] = {}  # tab_name → [ValueRange, ...]
    updated, not_found = [], []

    for ticker, val in valuations.items():
        fv      = val["weighted_fair_value"]
        verdict = val.get("verdict", "")
        conf    = val.get("confidence", "")
        upside  = val.get("upside_pct", 0)
        sign    = "+" if upside >= 0 else ""

        lookup = ticker if region == "india" else ticker.upper()
        matches = index.get(lookup, [])
        if not matches:
            not_found.append(ticker)
            print(f"  – {ticker:<12} not in sheet")
            continue

        seen = set()
        for tab_name, row_num, code in matches:
            if (tab_name, row_num) in seen:
                continue
            seen.add((tab_name, row_num))
            td = tab_data.setdefault(tab_name, [])
            td.append({"range": f"'{tab_name}'!{fp_col}{row_num}", "values": [[fv]]})
            if tab_name not in VERDICT_SKIP_TABS and verdict:
                td.append({"range": f"'{tab_name}'!{v_col}{row_num}", "values": [[verdict]]})
                td.append({"range": f"'{tab_name}'!{c_col}{row_num}", "values": [[conf]]})
            print(f"  ✓ {ticker:<12} FV={currency}{fv:<8} "
                  f"verdict={verdict:<6} conf={conf:<8} → {tab_name} row {row_num}")
        updated.append(ticker)

    # Step 3: ONE batchUpdate call per tab (not per ticker)
    sheet_id = SHEET_IDS[region]
    for tab_name, value_ranges in tab_data.items():
        service.spreadsheets().values().batchUpdate(
            spreadsheetId=sheet_id,
            body={"valueInputOption": "USER_ENTERED", "data": value_ranges}
        ).execute()
        n_cells = len(value_ranges)
        print(f"    → batch wrote {n_cells} cells to '{tab_name}'")
        time.sleep(1.5)

    return updated, not_found


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--ticker", help="Single ticker")
    parser.add_argument("--region", choices=["us", "india"], help="Only update one sheet")
    args = parser.parse_args()

    ticker_filter = args.ticker.upper() if args.ticker else None
    valuations = load_valuations(args.region, ticker_filter)

    if not valuations:
        print("No matching valuations found.")
        return

    regions = [args.region] if args.region else ["india", "us"]

    import gspread
    gc = gspread.authorize(get_credentials()) if not args.dry_run else None

    total_updated, total_missing = [], []

    for region in regions:
        region_vals = {t: v for t, v in valuations.items() if v.get("region") == region}
        if not region_vals:
            continue
        print(f"\n[{region.upper()}] {len(region_vals)} valuations")
        updated, missing = update_sheet(gc, region, region_vals, args.dry_run)
        total_updated.extend(updated)
        total_missing.extend(missing)

    print(f"\n{'─'*55}")
    print(f"  Updated:          {len(total_updated)}")
    if total_missing:
        print(f"  Not in sheet yet: {len(total_missing)} → run sync_watchlist.py for these")
        print(f"    {', '.join(total_missing)}")
    if args.dry_run:
        print("\n  (Dry run — no changes written)")


if __name__ == "__main__":
    main()
