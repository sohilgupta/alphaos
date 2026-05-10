"""
Sync extracted tickers to the correct Google Sheet based on region.

Routing:
  US tickers  → US sheet  (cols B, C, D; G for fair price)
  India tickers → India sheet (cols A, B, C, D; F for fair price)

Deduplication: searches BOTH sheets before any insert.

Usage:
    python scripts/sync_watchlist.py                    # sync all scored ≥0.5
    python scripts/sync_watchlist.py --dry-run          # preview only
    python scripts/sync_watchlist.py --min-score 0.6
    python scripts/sync_watchlist.py --ticker MRVL
    python scripts/sync_watchlist.py --ticker HAL
"""
from __future__ import annotations

import argparse
import json
import time
from datetime import date
from pathlib import Path

VAULT = Path(__file__).resolve().parent.parent.parent / "vault"
SCORED_FILE = VAULT / "data" / "watchlists" / "scored.json"
SCENARIOS_DIR = VAULT / "data" / "scenarios"
FINANCIALS_DIR = VAULT / "data" / "financials"
VALUATIONS_DIR = VAULT / "data" / "valuations"
TICKERS_CACHE = VAULT / "data" / "watchlists" / "all_tickers.json"
ONTOLOGY_CACHE = VAULT / "data" / "watchlists" / "combined_ontology.json"

CREDS_DIR = Path.home() / ".config" / "alphaos"
TOKEN_FILE = CREDS_DIR / "token.json"
CREDS_FILE = CREDS_DIR / "credentials.json"
SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]

SHEET_IDS = {
    "us":    "1HVEG6wtWsm68o3YMgznhhLrlENOARqF41kqrcbJlqq4",
    "india": "1ez7O6V_fK-7-s-QSgvZsiw2YJkhyYEi52K1L0rauuFM",
}

HEADER_BG = {
    "us":    {"red": 0.149, "green": 0.267, "blue": 0.231},   # dark green
    "india": {"red": 0.851, "green": 0.329, "blue": 0.110},   # orange
}


# ── Auth ──────────────────────────────────────────────────────────────────────

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
                raise FileNotFoundError(
                    f"Run 'python scripts/setup_sheets.py' first.\n"
                    f"Credentials expected at: {CREDS_FILE}"
                )
            flow = InstalledAppFlow.from_client_secrets_file(str(CREDS_FILE), SCOPES)
            creds = flow.run_local_server(port=0)
        TOKEN_FILE.parent.mkdir(parents=True, exist_ok=True)
        TOKEN_FILE.write_text(creds.to_json())
    return creds


def open_sheets() -> dict:
    import gspread
    gc = gspread.authorize(get_credentials())
    return {region: gc.open_by_key(sid) for region, sid in SHEET_IDS.items()}


# ── Ontology ─────────────────────────────────────────────────────────────────

def load_existing_tickers() -> set[str]:
    """Load from cache if available; else return empty (caller handles rescan)."""
    if TICKERS_CACHE.exists():
        return set(json.loads(TICKERS_CACHE.read_text()))
    return set()


def find_section_end_row(ws, section: str, ontology_tab: dict) -> int:
    if section in ontology_tab:
        return ontology_tab[section]["end_row"] + 1
    rows = ws.get_all_values()
    return len(rows) + 1


# ── Ticker data ───────────────────────────────────────────────────────────────

def get_ticker_data(ticker: str, scored_row: dict, region: str) -> dict:
    fin_file = FINANCIALS_DIR / f"{ticker}.json"
    fin = json.loads(fin_file.read_text()) if fin_file.exists() else {}

    input_file = SCENARIOS_DIR / f"{ticker}_input.json"
    themes = scored_row.get("themes", [])
    if input_file.exists():
        payload = json.loads(input_file.read_text())
        themes = [t["theme"] for t in payload.get("theme_exposure", [])]

    val_file = VALUATIONS_DIR / f"{ticker}.json"
    valuation = json.loads(val_file.read_text()) if val_file.exists() else None

    name = fin.get("name") or scored_row.get("name") or ticker
    sector = fin.get("sector") or ""
    industry = fin.get("industry") or ""
    current_price = fin.get("price") if fin and "error" not in fin else None

    if region == "us":
        if industry and sector:
            desc = f"{industry}; {sector.lower()} sector"
        elif industry:
            desc = industry
        else:
            desc = sector
    else:
        desc = ""  # India sheet doesn't use description column

    weighted_fv = valuation.get("weighted_fair_value") if valuation and "error" not in valuation else None
    confidence = valuation.get("confidence") if valuation and "error" not in valuation else None

    return {
        "name": name,
        "desc": desc,
        "themes": themes,
        "sector": sector,
        "industry": industry,
        "current_price": current_price,
        "weighted_fair_value": weighted_fv,
        "confidence": confidence,
    }


# ── Row insertion ─────────────────────────────────────────────────────────────

def _safe_insert(ws, row: int, sheet_row_count: int):
    """Insert a blank row at `row`. Expands sheet grid if needed."""
    if row > sheet_row_count:
        ws.add_rows(max(10, row - sheet_row_count + 1))
        time.sleep(0.5)
    ws.insert_row([], row)


def insert_section_header(ws, row: int, section: str, region: str, dry_run: bool,
                          sheet_row_count: int = 9999):
    if dry_run:
        print(f"      [DRY] Section header '{section}' at row {row}")
        return
    _safe_insert(ws, row, sheet_row_count)
    ws.update(range_name=f"A{row}", values=[[section]])
    try:
        bg = HEADER_BG[region]
        ws.format(f"A{row}:Z{row}", {
            "backgroundColor": bg,
            "textFormat": {"bold": True, "foregroundColor": {"red": 1, "green": 1, "blue": 1}},
        })
    except Exception:
        pass
    time.sleep(1.2)


def insert_us_row(ws, row: int, ticker: str, name: str, desc: str,
                  fair_value: float | None, dry_run: bool,
                  sheet_row_count: int = 9999):
    fv_str = f"  FV=${fair_value}" if fair_value else ""
    if dry_run:
        print(f"      [DRY] US row: {ticker} | {name} | {desc[:45]}{fv_str}  row={row}")
        return
    _safe_insert(ws, row, sheet_row_count)
    ws.update(range_name=f"B{row}:D{row}", values=[[ticker, name, desc]])
    if fair_value is not None:
        ws.update(range_name=f"G{row}", values=[[fair_value]])
    time.sleep(1.2)


def insert_india_row(ws, row: int, ticker: str, name: str,
                     current_price: float | None, fair_value: float | None,
                     dry_run: bool, sheet_row_count: int = 9999):
    stock_code = f"nse:{ticker.lower()}"
    today = str(date.today())
    price_str = current_price or ""
    fv_str = f"  FV=₹{fair_value}" if fair_value else ""
    if dry_run:
        print(f"      [DRY] India row: {name} | {stock_code} | {today} | price={price_str}{fv_str}  row={row}")
        return
    _safe_insert(ws, row, sheet_row_count)
    # A=name, B=stock_code, C=date, D=baseline_price
    ws.update(range_name=f"A{row}:D{row}", values=[[name, stock_code, today, price_str]])
    if fair_value is not None:
        ws.update(range_name=f"F{row}", values=[[fair_value]])
    time.sleep(1.2)


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from classify_ticker import classify
    from detect_region import detect_region

    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--min-score", type=float, default=0.5)
    parser.add_argument("--ticker", help="Single ticker only")
    parser.add_argument("--rescan", action="store_true", help="Force fresh sheet scan")
    args = parser.parse_args()

    if not SCORED_FILE.exists():
        print("No scored.json. Run pipeline.py first.")
        return

    scored = json.loads(SCORED_FILE.read_text())
    if args.ticker:
        scored = [r for r in scored if r["ticker"] == args.ticker.upper()]
        if not scored:
            print(f"Ticker {args.ticker} not in scored list.")
            return

    candidates = [r for r in scored if r["score"] >= args.min_score]
    if not candidates:
        print(f"No candidates above score {args.min_score}.")
        return

    print(f"Candidates: {len(candidates)} tickers (score ≥ {args.min_score})")

    # Load or build existing tickers
    existing_tickers = load_existing_tickers()
    if not existing_tickers or args.rescan:
        print("\nScanning both sheets for existing tickers…")
        import sheet_scanner
        _, existing_tickers = sheet_scanner.scan_all()
    else:
        print(f"Using cached ontology ({len(existing_tickers)} tickers already in sheets)")

    print("\nConnecting to sheets…")
    sheets = open_sheets()

    # Load ontology for section end-row lookups
    ontology = {}
    if ONTOLOGY_CACHE.exists():
        raw = json.loads(ONTOLOGY_CACHE.read_text())
        ontology = raw

    added, skipped_dup, skipped_region = [], [], []

    for row in candidates:
        ticker = row["ticker"]

        if ticker in existing_tickers:
            skipped_dup.append(ticker)
            continue

        data = get_ticker_data(ticker, row, "")
        region = detect_region(ticker, themes=data["themes"])

        if region not in sheets:
            skipped_region.append(ticker)
            continue

        # Re-get data with correct region for desc formatting
        data = get_ticker_data(ticker, row, region)

        tab_name, section = classify(ticker, data["desc"], data["themes"], data["sector"], data["industry"], region=region)

        fv = data["weighted_fair_value"]
        conf = data["confidence"] or "—"
        fv_display = f"  FV={'$' if region=='us' else '₹'}{fv}  conf={conf}" if fv else ""
        print(f"\n  + {ticker:<14} [{region}] → {tab_name} / {section}{fv_display}")

        ss = sheets[region]
        try:
            ws = ss.worksheet(tab_name)
        except Exception:
            fallback = "US Stock Watchlist" if region == "us" else "Stock Watchlist 2"
            print(f"    Tab '{tab_name}' not found — using '{fallback}'")
            ws = ss.worksheet(fallback)
            tab_name = fallback
            section = "Uncategorized"

        tab_ontology = ontology.get(region, {}).get("tabs", {}).get(tab_name, {})
        insert_row = find_section_end_row(ws, section, tab_ontology)
        sheet_rows = len(ws.get_all_values())

        if section not in tab_ontology:
            insert_section_header(ws, insert_row, section, region, args.dry_run,
                                  sheet_row_count=sheet_rows)
            insert_row += 1
            sheet_rows += 1

        if region == "us":
            insert_us_row(ws, insert_row, ticker, data["name"], data["desc"], fv, args.dry_run,
                          sheet_row_count=sheet_rows)
        else:
            insert_india_row(ws, insert_row, ticker, data["name"], data["current_price"], fv, args.dry_run,
                             sheet_row_count=sheet_rows)

        existing_tickers.add(ticker)
        added.append(f"{ticker}({region})")

    print(f"\n{'─'*55}")
    print(f"  Added:        {len(added)} → {', '.join(added) or 'none'}")
    print(f"  Skipped (dup):{len(skipped_dup)}")
    if skipped_region:
        print(f"  Unknown region:{', '.join(skipped_region)}")
    if args.dry_run:
        print("\n  (Dry run — no changes written)")


if __name__ == "__main__":
    main()
