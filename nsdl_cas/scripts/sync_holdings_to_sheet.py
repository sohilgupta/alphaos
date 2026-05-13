"""
Sync latest NSDL CAS holdings → Google Sheets so the alphaos dashboard works
on Vercel (where the local SQLite + JSON files aren't available).

Reads from:  vault/nsdl/data/net_worth.db (latest snapshot only by default)
Writes to:   India sheet 1ez7O6V_fK-7-s-QSgvZsiw2YJkhyYEi52K1L0rauuFM,
             tab "nsdl_holdings". (Cannot write to the NSDL net-worth sheet
             1KOE… directly because it is an uploaded .xlsx, not a native
             Google Sheet — Sheets API rejects writes to .xlsx files.)

Tab is recreated each run with the canonical column order:
  A: snapshot_date  B: asset_name  C: asset_type  D: value

Uses the same OAuth credentials as research/scripts (~/.config/alphaos/).

Usage:
    python nsdl_cas/scripts/sync_holdings_to_sheet.py
    python nsdl_cas/scripts/sync_holdings_to_sheet.py --date 2026-04-30
    python nsdl_cas/scripts/sync_holdings_to_sheet.py --dry-run
"""
from __future__ import annotations

import argparse
import sqlite3
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
DEFAULT_DB = REPO_ROOT / "vault" / "nsdl" / "data" / "net_worth.db"
DEFAULT_SHEET_ID = "1ez7O6V_fK-7-s-QSgvZsiw2YJkhyYEi52K1L0rauuFM"  # India sheet (native)
DEFAULT_TAB = "nsdl_holdings"

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


def load_holdings(db_path: Path, snapshot_date: str | None) -> tuple[str, float, list[tuple[str, str, float]]]:
    """Return (snapshot_date, total_value, rows[(name, type, value)…])."""
    with sqlite3.connect(db_path) as con:
        if snapshot_date:
            row = con.execute(
                "SELECT date, total_value FROM snapshots WHERE date=?", (snapshot_date,)
            ).fetchone()
        else:
            row = con.execute(
                "SELECT date, total_value FROM snapshots ORDER BY date DESC LIMIT 1"
            ).fetchone()
        if not row:
            raise SystemExit(f"No snapshot found for date={snapshot_date or 'latest'}")
        date, total = row

        # Some historical snapshots ingested with 0 holdings (parse failure).
        # If the requested date has none, fall back to the most recent date
        # that DOES have holdings — and warn loudly.
        cnt = con.execute(
            "SELECT COUNT(*) FROM holdings WHERE snapshot_date=?", (date,)
        ).fetchone()[0]
        if cnt == 0:
            fallback = con.execute(
                """SELECT s.date, s.total_value FROM snapshots s
                   JOIN holdings h ON h.snapshot_date = s.date
                   GROUP BY s.date ORDER BY s.date DESC LIMIT 1"""
            ).fetchone()
            if not fallback:
                raise SystemExit("No snapshot has any holdings — re-run ingest first.")
            print(f"⚠️  Snapshot {date} has 0 holdings — falling back to {fallback[0]}", file=sys.stderr)
            date, total = fallback

        rows = list(con.execute(
            """SELECT asset_name, asset_type, value FROM holdings
               WHERE snapshot_date=? ORDER BY value DESC""", (date,)
        ))
        return date, float(total), [(r[0], r[1], float(r[2])) for r in rows]


def upsert_tab(ss, title: str, rows: list[list], dry_run: bool):
    """Create the tab if missing, clear it, write all rows in one batch."""
    existing = next((ws for ws in ss.worksheets() if ws.title == title), None)
    if dry_run:
        print(f"[DRY] Would {'replace' if existing else 'create'} tab {title!r} with {len(rows)} rows")
        return
    if existing is None:
        ws = ss.add_worksheet(title=title, rows=max(len(rows) + 10, 100), cols=max(len(rows[0]) + 2, 6))
    else:
        ws = existing
        ws.clear()
    ws.update(values=rows, range_name=f"A1:{chr(64 + len(rows[0]))}{len(rows)}", value_input_option="USER_ENTERED")


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--db-path", default=str(DEFAULT_DB), type=Path)
    p.add_argument("--sheet-id", default=DEFAULT_SHEET_ID)
    p.add_argument("--tab", default=DEFAULT_TAB)
    p.add_argument("--date", help="Specific snapshot date YYYY-MM-DD (default: latest with data)")
    p.add_argument("--dry-run", action="store_true")
    args = p.parse_args()

    if not args.db_path.exists():
        raise SystemExit(f"DB not found at {args.db_path}. Run ingest_latest.py first.")

    snapshot_date, total, holdings = load_holdings(args.db_path, args.date)
    print(f"Loaded {len(holdings)} holdings from snapshot {snapshot_date} (total ₹{total:,.0f})")

    # Sheet rows: header + N data rows
    rows = [["snapshot_date", "asset_name", "asset_type", "value"]]
    for name, atype, value in holdings:
        rows.append([snapshot_date, name, atype, value])

    if args.dry_run:
        print(f"[DRY RUN] Would write {len(rows)-1} rows to tab {args.tab!r}")
        for r in rows[:5]: print(" ", r)
        if len(rows) > 5: print(f"  … and {len(rows)-5} more")
        return

    import gspread
    gc = gspread.authorize(get_credentials())
    ss = gc.open_by_key(args.sheet_id)
    upsert_tab(ss, args.tab, rows, dry_run=args.dry_run)

    print(f"✅ Wrote {len(rows)-1} holdings to https://docs.google.com/spreadsheets/d/{args.sheet_id} (tab {args.tab!r})")


if __name__ == "__main__":
    main()
