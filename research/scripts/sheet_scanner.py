"""
Scan BOTH Google Sheets and build a combined ontology map.
Used by sync_watchlist.py for deduplication and section detection.

Saves:
  /data/watchlists/combined_ontology.json
  /data/watchlists/all_tickers.json   (flat set for fast lookup)

Usage:
    python scripts/sheet_scanner.py
    python scripts/sheet_scanner.py --print
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

VAULT = Path(__file__).resolve().parent.parent.parent / "vault"
OUT_ONTOLOGY = VAULT / "data" / "watchlists" / "combined_ontology.json"
OUT_TICKERS = VAULT / "data" / "watchlists" / "all_tickers.json"

SHEETS = {
    "us": {
        "id": "1HVEG6wtWsm68o3YMgznhhLrlENOARqF41kqrcbJlqq4",
        "ticker_col": 1,    # col B (0-indexed)
        "name_col": 2,      # col C
        "section_col": 0,   # col A
    },
    "india": {
        "id": "1ez7O6V_fK-7-s-QSgvZsiw2YJkhyYEi52K1L0rauuFM",
        "ticker_col": 1,    # col B (nse:xxx code)
        "name_col": 0,      # col A (company name IS in A)
        "section_col": 0,   # col A (sections also in A, detected by empty B)
    },
}

CREDS_DIR = Path.home() / ".config" / "alphaos"
TOKEN_FILE = CREDS_DIR / "token.json"
CREDS_FILE = CREDS_DIR / "credentials.json"
SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]


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
            flow = InstalledAppFlow.from_client_secrets_file(str(CREDS_FILE), SCOPES)
            creds = flow.run_local_server(port=0)
        TOKEN_FILE.write_text(creds.to_json())
    return creds


def normalize_ticker(raw: str, region: str) -> str:
    """Normalize a stock code to a plain uppercase ticker for lookup."""
    t = raw.strip()
    # Strip NSE/BSE prefix for dedup purposes
    for prefix in ("nse:", "NSE:", "BSE:", "bse:", "BOM:", "bom:", "NSE:"):
        if t.startswith(prefix):
            t = t[len(prefix):]
            break
    # Strip .NS / .BO suffix
    for suffix in (".NS", ".BO", ".ns", ".bo"):
        if t.endswith(suffix):
            t = t[:-len(suffix)]
            break
    return t.upper()


def scan_sheet(spreadsheet, region: str, cfg: dict) -> tuple[dict, set[str]]:
    """
    Returns:
      ontology: {tab_name: {section_name: {start_row, end_row, tickers[]}}}
      tickers:  flat set of normalized ticker strings
    """
    ontology = {}
    tickers: set[str] = set()

    tcol = cfg["ticker_col"]
    scol = cfg["section_col"]

    for ws in spreadsheet.worksheets():
        tab = ws.title
        ontology[tab] = {"_meta": {"worksheet_id": ws.id}}
        rows = ws.get_all_values()
        current_section = None

        for i, row in enumerate(rows, start=1):
            while len(row) <= max(tcol, scol):
                row.append("")

            sec_val = row[scol].strip()
            tick_val = row[tcol].strip()

            if sec_val and not tick_val:
                # Section header
                current_section = sec_val
                ontology[tab][current_section] = {
                    "start_row": i, "end_row": i, "tickers": []
                }
            elif tick_val and current_section:
                norm = normalize_ticker(tick_val, region)
                if norm:
                    ontology[tab][current_section]["tickers"].append(norm)
                    ontology[tab][current_section]["end_row"] = i
                    tickers.add(norm)
            elif tick_val and not current_section:
                norm = normalize_ticker(tick_val, region)
                if norm:
                    if "_loose" not in ontology[tab]:
                        ontology[tab]["_loose"] = {"tickers": [], "end_row": i}
                    ontology[tab]["_loose"]["tickers"].append(norm)
                    tickers.add(norm)

    return ontology, tickers


def scan_all() -> tuple[dict, set[str]]:
    import gspread
    creds = get_credentials()
    gc = gspread.authorize(creds)

    combined: dict[str, dict] = {}
    all_tickers: set[str] = set()

    for region, cfg in SHEETS.items():
        print(f"  Scanning {region} sheet…", end=" ", flush=True)
        ss = gc.open_by_key(cfg["id"])
        ontology, tickers = scan_sheet(ss, region, cfg)
        combined[region] = {"sheet_id": cfg["id"], "tabs": ontology}
        all_tickers |= tickers
        ticker_count = sum(
            len(sec.get("tickers", []))
            for tab in ontology.values()
            for sec in tab.values()
            if isinstance(sec, dict)
        )
        print(f"{ticker_count} tickers across {len(ontology)} tabs")

    return combined, all_tickers


def main(print_summary: bool = False):
    OUT_ONTOLOGY.parent.mkdir(parents=True, exist_ok=True)

    print("Scanning sheets…")
    combined, all_tickers = scan_all()

    # Save ontology (strip _meta for cleanliness)
    clean = {}
    for region, data in combined.items():
        clean[region] = {
            "sheet_id": data["sheet_id"],
            "tabs": {
                tab: {s: v for s, v in secs.items() if not s.startswith("_")}
                for tab, secs in data["tabs"].items()
            }
        }
    OUT_ONTOLOGY.write_text(json.dumps(clean, indent=2))
    OUT_TICKERS.write_text(json.dumps(sorted(all_tickers), indent=2))

    print(f"\n  {len(all_tickers)} unique tickers total")
    print(f"  → {OUT_ONTOLOGY.relative_to(VAULT)}")
    print(f"  → {OUT_TICKERS.relative_to(VAULT)}")

    if print_summary:
        for region, data in clean.items():
            print(f"\n  [{region.upper()}]")
            for tab, secs in data["tabs"].items():
                sections = [s for s in secs if not s.startswith("_")]
                if sections:
                    print(f"    {tab}: {', '.join(sections)}")

    return combined, all_tickers


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--print", action="store_true")
    args = parser.parse_args()
    main(print_summary=args.print)
