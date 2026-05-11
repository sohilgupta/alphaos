"""
Update existing rows in the Google Sheets watchlists with the latest
valuation data: Fair Price, Verdict, Confidence.

Column mapping (defaults — apply to all watchlist tabs):
  US sheet:    B=Ticker  G=FairPrice  I=Verdict  J=Confidence
  India sheet: B=nse:xxx F=FairPrice  H=Verdict  I=Confidence

Per-tab overrides (portfolio tabs have different column layouts):
  US_portfolio:    B=Ticker  L=FairPrice  N=Verdict  O=Confidence
  India_portfolio: B=Ticker  Q=FairPrice  S=Verdict  T=Confidence

Uses batch_update per worksheet to stay under the 60 writes/min quota.

Usage:
    python scripts/update_sheet_valuations.py                      # all valuations
    python scripts/update_sheet_valuations.py MXL CRDO ZETA        # specific tickers
    python scripts/update_sheet_valuations.py --since 2026-05-10   # generated_at filter
    python scripts/update_sheet_valuations.py --dry-run            # preview only
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path

VAULT = Path(__file__).resolve().parent.parent.parent / "vault"
VALUATIONS_DIR = VAULT / "data" / "valuations"

CREDS_DIR = Path.home() / ".config" / "alphaos"
TOKEN_FILE = CREDS_DIR / "token.json"
CREDS_FILE = CREDS_DIR / "credentials.json"
SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]

SHEETS = {
    "us": {
        "id": "1HVEG6wtWsm68o3YMgznhhLrlENOARqF41kqrcbJlqq4",
        # Defaults (applied to every watchlist tab)
        "ticker_col_letter": "B",
        "fv_col":         "G",
        "verdict_col":    "I",
        "confidence_col": "J",
        # Per-tab overrides — exact tab title match
        "tab_overrides": {
            "US_portfolio": {
                "ticker_col_letter": "B",
                "fv_col":         "L",
                "verdict_col":    "N",
                "confidence_col": "O",
            },
        },
    },
    "india": {
        "id": "1ez7O6V_fK-7-s-QSgvZsiw2YJkhyYEi52K1L0rauuFM",
        "ticker_col_letter": "B",
        "fv_col":         "F",
        "verdict_col":    "H",
        "confidence_col": "I",
        "tab_overrides": {
            "India_portfolio": {
                "ticker_col_letter": "B",
                "fv_col":         "Q",
                "verdict_col":    "S",
                "confidence_col": "T",
            },
        },
    },
}


def resolve_tab_cfg(region_cfg: dict, tab_title: str) -> dict:
    """Return the column config for a worksheet, applying any per-tab override."""
    overrides = region_cfg.get("tab_overrides", {})
    if tab_title in overrides:
        return overrides[tab_title]
    return {
        "ticker_col_letter": region_cfg["ticker_col_letter"],
        "fv_col":         region_cfg["fv_col"],
        "verdict_col":    region_cfg["verdict_col"],
        "confidence_col": region_cfg["confidence_col"],
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
            flow = InstalledAppFlow.from_client_secrets_file(str(CREDS_FILE), SCOPES)
            creds = flow.run_local_server(port=0)
        TOKEN_FILE.write_text(creds.to_json())
    return creds


# ── Value normalization ───────────────────────────────────────────────────────
# Map raw decision-engine values to the canonical schema the dashboard reads.
# Keep these in sync with shared/SCHEMA.md. The dashboard parser is case-
# insensitive, but writing canonical title-case keeps the sheet clean for any
# future consumer.

VERDICT_MAP = {
    "STRONG BUY": "Strong Buy",
    "STRONGBUY":  "Strong Buy",
    "STRONG_BUY": "Strong Buy",
    "BUY":        "Buy",
    "WATCH":      "Watch",
    "WAIT":       "Watch",   # legacy synonym
    "HOLD":       "Hold",
    "REDUCE":     "Reduce",
    "AVOID":      "Avoid",
}

CONFIDENCE_MAP = {
    "HIGH":         "High",
    "MEDIUM":       "Medium",
    "MED":          "Medium",
    "LOW":          "Low",
    "MEDIUM-HIGH":  "High",   # round up
    "MED-HIGH":     "High",
    "MEDIUM-LOW":   "Low",    # round down
    "MED-LOW":      "Low",
}


def normalize_verdict(v):
    if not v:
        return None
    return VERDICT_MAP.get(str(v).strip().upper(), str(v).strip())


def normalize_confidence(c):
    if not c:
        return None
    return CONFIDENCE_MAP.get(str(c).strip().upper(), str(c).strip())


# ── Ticker normalization ──────────────────────────────────────────────────────

def normalize_ticker(raw: str) -> str:
    t = raw.strip()
    for prefix in ("nse:", "NSE:", "BSE:", "bse:", "BOM:", "bom:"):
        if t.startswith(prefix):
            t = t[len(prefix):]
            break
    for suffix in (".NS", ".BO", ".ns", ".bo"):
        if t.endswith(suffix):
            t = t[:-len(suffix)]
            break
    return t.upper()


# ── Main update logic ────────────────────────────────────────────────────────

def load_valuations(filter_tickers: set | None,
                    since: datetime | None) -> dict:
    """Load valuations from data/valuations/, optionally filtered."""
    out = {}
    for f in VALUATIONS_DIR.glob("*.json"):
        ticker = f.stem
        if filter_tickers is not None and ticker not in filter_tickers:
            continue
        try:
            d = json.loads(f.read_text())
        except Exception:
            continue
        if since is not None:
            gen = d.get("generated_at", "")
            try:
                gen_dt = datetime.strptime(gen[:10], "%Y-%m-%d")
                if gen_dt < since:
                    continue
            except Exception:
                continue
        if "weighted_fair_value" in d or "verdict" in d:
            out[ticker] = d
    return out


def find_ticker_rows(ws, ticker_col_letter: str) -> dict:
    """Return {normalized_ticker: row_number} for the given worksheet."""
    col_idx = ord(ticker_col_letter) - ord("A") + 1
    values = ws.col_values(col_idx)
    rows = {}
    for i, val in enumerate(values, start=1):
        if val.strip():
            norm = normalize_ticker(val)
            if norm and norm not in rows:  # first occurrence wins
                rows[norm] = i
    return rows


def build_updates_for_tab(ws, cfg: dict, valuations: dict) -> list[dict]:
    """Build a list of update dicts ready for batch_update."""
    ticker_rows = find_ticker_rows(ws, cfg["ticker_col_letter"])
    updates = []
    matched = []

    for ticker, val in valuations.items():
        row = ticker_rows.get(ticker)
        if row is None:
            continue

        fv = val.get("weighted_fair_value")
        verdict = normalize_verdict(val.get("verdict"))
        conf = normalize_confidence(val.get("confidence"))

        if fv is not None:
            updates.append({"range": f"{cfg['fv_col']}{row}",
                            "values": [[fv]]})
        if verdict:
            updates.append({"range": f"{cfg['verdict_col']}{row}",
                            "values": [[verdict]]})
        if conf:
            updates.append({"range": f"{cfg['confidence_col']}{row}",
                            "values": [[conf]]})
        matched.append((ticker, row, fv, verdict, conf))

    return updates, matched


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("tickers", nargs="*", help="Specific tickers to sync (default: all)")
    parser.add_argument("--since", help="Only valuations with generated_at >= this date (YYYY-MM-DD)")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from detect_region import detect_region

    filter_tickers = {t.upper() for t in args.tickers} if args.tickers else None
    since_dt = datetime.strptime(args.since, "%Y-%m-%d") if args.since else None

    valuations = load_valuations(filter_tickers, since_dt)
    if not valuations:
        print("No valuations match the filter.")
        return

    print(f"Loaded {len(valuations)} valuation(s)")

    # Split by region using detect_region
    by_region = {"us": {}, "india": {}}
    for ticker, val in valuations.items():
        region = val.get("region") or detect_region(ticker)
        if region in by_region:
            by_region[region][ticker] = val
        else:
            print(f"  ⚠️  {ticker}: unknown region — skipping")

    print(f"  US: {len(by_region['us'])}  |  India: {len(by_region['india'])}")
    if args.dry_run:
        print("  [DRY RUN — no writes]")

    # Connect & update
    import gspread
    gc = gspread.authorize(get_credentials())

    total_updates = 0
    total_matched = 0
    not_found = []

    for region, vals in by_region.items():
        if not vals:
            continue
        cfg = SHEETS[region]
        print(f"\n── {region.upper()} sheet ──")
        ss = gc.open_by_key(cfg["id"])

        # Aggregate matches across tabs
        region_matched: set = set()

        for ws in ss.worksheets():
            tab_cfg = resolve_tab_cfg(cfg, ws.title)
            updates, matched = build_updates_for_tab(ws, tab_cfg, vals)
            if not matched:
                continue
            print(f"  Tab: {ws.title!r:<40} → {len(matched)} ticker(s), {len(updates)} cell update(s)")
            for tkr, row, fv, verdict, conf in matched:
                fv_s   = f"FV={fv}" if fv is not None else ""
                ver_s  = f"V={verdict}" if verdict else ""
                conf_s = f"C={conf}" if conf else ""
                print(f"      {tkr:<10} row={row:<5}  {fv_s:<14} {ver_s:<14} {conf_s}")
                region_matched.add(tkr)

            if updates and not args.dry_run:
                # Single batch call per worksheet — quota-friendly
                ws.batch_update(updates, value_input_option="USER_ENTERED")
                total_updates += len(updates)

        total_matched += len(region_matched)
        missing = set(vals) - region_matched
        for tkr in missing:
            not_found.append(f"{tkr}({region})")

    print("\n" + "─" * 50)
    print(f"  Matched: {total_matched}/{len(valuations)}")
    if not args.dry_run:
        print(f"  Cells updated: {total_updates}")
    if not_found:
        print(f"  Not found in sheets: {', '.join(sorted(not_found))}")
    if args.dry_run:
        print("  (Dry run — no changes written)")


if __name__ == "__main__":
    main()
