"""
AlphaOS Full Pipeline — single entry point for everything.

Modes:
  run           Full Layer 1 (extract → fetch → aggregate → score) + sheet sync
  queue         Show tickers needing valuation (no writes)
  sync          Push existing valuations to sheet (skip Layer 1)
  status        Show current state of vault + sheet

Usage:
  python scripts/pipeline.py run             # Layer 1 + sheet sync
  python scripts/pipeline.py run --no-fetch  # Layer 1 (offline) + sheet sync
  python scripts/pipeline.py run --no-sync   # Layer 1 only, skip sheet
  python scripts/pipeline.py queue           # show valuation queue for Claude
  python scripts/pipeline.py sync            # push valuations → sheet
  python scripts/pipeline.py status          # current state summary

After 'run', Claude handles Layer 2:
  Read the valuation queue printed below, apply DECISION_ENGINE.md,
  save /data/valuations/{TICKER}.json, then run:
    python scripts/pipeline.py sync
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path
from datetime import date

VAULT = Path(__file__).resolve().parent.parent.parent / "vault"
SCRIPTS = Path(__file__).resolve().parent
SCORED_FILE = VAULT / "data" / "watchlists" / "scored.json"
SCENARIOS_DIR = VAULT / "data" / "scenarios"
VALUATIONS_DIR = VAULT / "data" / "valuations"
FINANCIALS_DIR = VAULT / "data" / "financials"
EXTRACTED_FILE = VAULT / "processed" / "stocks" / "extracted_tickers.json"

VALUATION_THRESHOLD = 0.5   # score ≥ this gets queued for valuation
SYNC_THRESHOLD = 0.45        # score ≥ this goes to sheet


# ── Subprocess helpers ─────────────────────────────────────────────────────────

def run_script(script: str, label: str, extra: list[str] | None = None) -> bool:
    print(f"\n  ▸ {label}")
    result = subprocess.run(
        [sys.executable, str(SCRIPTS / script)] + (extra or []),
        cwd=str(VAULT),
    )
    return result.returncode == 0


# ── Layer 1 ────────────────────────────────────────────────────────────────────

def layer1(no_fetch: bool = False, ticker: str | None = None):
    print("\n" + "━" * 52)
    print("LAYER 1  Extraction + Data")
    print("━" * 52)

    if not run_script("extract_stocks.py", "Extract tickers from /raw/"):
        sys.exit(1)

    if not no_fetch:
        run_script("fetch_financials.py", "Fetch financials (yfinance)")
        run_script("fetch_charts.py", "Fetch charts (yfinance + matplotlib)")
    else:
        print("\n  ▸ Fetch financials — SKIPPED (--no-fetch)")
        print("  ▸ Fetch charts     — SKIPPED (--no-fetch)")

    agg_args = [ticker] if ticker else []
    if not run_script("aggregate.py", "Assemble per-ticker payloads", agg_args):
        sys.exit(1)

    if not run_script("decision_engine.py", "Score & pre-filter"):
        sys.exit(1)


# ── Valuation queue ────────────────────────────────────────────────────────────

def build_queue(min_score: float = VALUATION_THRESHOLD) -> list[dict]:
    """Return tickers that are scored above threshold but have no valuation yet."""
    if not SCORED_FILE.exists():
        return []

    scored = json.loads(SCORED_FILE.read_text())
    queue = []

    for row in scored:
        if row["score"] < min_score:
            continue
        val_file = VALUATIONS_DIR / f"{row['ticker']}.json"
        if val_file.exists():
            continue  # already valued
        input_file = SCENARIOS_DIR / f"{row['ticker']}_input.json"
        queue.append({
            "ticker": row["ticker"],
            "score": row["score"],
            "themes": row.get("themes", []),
            "has_financials": (FINANCIALS_DIR / f"{row['ticker']}.json").exists(),
            "has_payload": input_file.exists(),
        })

    return sorted(queue, key=lambda x: x["score"], reverse=True)


def print_queue(queue: list[dict]):
    print("\n" + "━" * 52)
    print("VALUATION QUEUE  (needs Claude → DECISION_ENGINE.md)")
    print("━" * 52)

    if not queue:
        print("\n  All scored tickers already have valuations.\n")
        return

    print(f"\n  {len(queue)} tickers need valuation:\n")
    print(f"  {'Ticker':<14} {'Score':>6}  {'Financials':>10}  Themes")
    print("  " + "-" * 58)
    for row in queue:
        fin = "✓" if row["has_financials"] else "✗ (offline)"
        themes = ", ".join(row["themes"][:2]) or "—"
        print(f"  {row['ticker']:<14} {row['score']:>6.3f}  {fin:>10}  {themes}")

    print(f"""
  ─────────────────────────────────────────────────────
  To value these, tell Claude:

    "Run the decision engine on these tickers:
     {', '.join(r['ticker'] for r in queue[:10])}
     Read each /data/scenarios/{{TICKER}}_input.json,
     apply system/DECISION_ENGINE.md,
     save /data/valuations/{{TICKER}}.json and /memos/{{TICKER}}.md."

  Then run:  python scripts/pipeline.py sync
  ─────────────────────────────────────────────────────
""")


# ── Sheet sync ─────────────────────────────────────────────────────────────────

def sync_to_sheet(dry_run: bool = False, min_score: float = SYNC_THRESHOLD):
    print("\n" + "━" * 52)
    print("LAYER 3  Sheet Sync")
    print("━" * 52)
    args = ["--min-score", str(min_score)]
    if dry_run:
        args.append("--dry-run")
    run_script("sync_watchlist.py", "Sync to Google Sheet", args)


# ── Status ─────────────────────────────────────────────────────────────────────

def show_status():
    print("\n" + "━" * 52)
    print("AlphaOS  Status")
    print("━" * 52)

    # Raw sources
    raw_files = list((VAULT / "raw").rglob("*.md"))
    print(f"\n  Raw sources:    {len(raw_files)}")

    # Extracted tickers
    if EXTRACTED_FILE.exists():
        extracted = json.loads(EXTRACTED_FILE.read_text())
        all_tickers = {t for s in extracted for t in s["tickers"]}
        print(f"  Tickers found:  {len(all_tickers)}")
    else:
        print("  Tickers found:  (not extracted yet)")

    # Scored
    if SCORED_FILE.exists():
        scored = json.loads(SCORED_FILE.read_text())
        above_half = [r for r in scored if r["score"] >= 0.5]
        print(f"  Scored ≥0.5:    {len(above_half)} / {len(scored)}")
    else:
        print("  Scored:         (not scored yet)")

    # Valuations
    val_files = list(VALUATIONS_DIR.glob("*.json"))
    print(f"  Valuations:     {len(val_files)}")

    # Memos
    memo_files = list((VAULT / "memos").glob("*.md"))
    print(f"  Memos:          {len(memo_files)}")

    # Queue
    queue = build_queue()
    print(f"  Needs valuation:{len(queue)}")

    # Ontology cache
    ontology_file = VAULT / "data" / "watchlists" / "sheet_ontology.json"
    if ontology_file.exists():
        ontology = json.loads(ontology_file.read_text())
        total_sheet_tickers = sum(
            len(sec.get("tickers", []))
            for tab in ontology.values()
            for sec in tab.values()
            if isinstance(sec, dict)
        )
        print(f"  In sheet:       {total_sheet_tickers} (last sync)")
    else:
        print("  In sheet:       (never synced)")

    print()


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="AlphaOS pipeline")
    sub = parser.add_subparsers(dest="mode", required=True)

    p_run = sub.add_parser("run", help="Layer 1 + sheet sync")
    p_run.add_argument("--no-fetch", action="store_true")
    p_run.add_argument("--no-sync", action="store_true", help="Skip sheet sync")
    p_run.add_argument("--dry-sync", action="store_true", help="Dry-run sheet sync")
    p_run.add_argument("--ticker", help="Single ticker only")
    p_run.add_argument("--min-score", type=float, default=VALUATION_THRESHOLD)

    p_queue = sub.add_parser("queue", help="Show valuation queue for Claude")
    p_queue.add_argument("--min-score", type=float, default=VALUATION_THRESHOLD)

    p_sync = sub.add_parser("sync", help="Push valuations to sheet")
    p_sync.add_argument("--dry-run", action="store_true")
    p_sync.add_argument("--min-score", type=float, default=SYNC_THRESHOLD)

    sub.add_parser("status", help="Current state summary")

    args = parser.parse_args()

    if args.mode == "status":
        show_status()

    elif args.mode == "queue":
        queue = build_queue(args.min_score)
        print_queue(queue)

    elif args.mode == "sync":
        sync_to_sheet(dry_run=args.dry_run, min_score=args.min_score)

    elif args.mode == "run":
        print(f"\nAlphaOS  {date.today()}")

        layer1(no_fetch=args.no_fetch, ticker=args.ticker)

        queue = build_queue(args.min_score)
        print_queue(queue)

        if not args.no_sync:
            sync_to_sheet(dry_run=args.dry_sync, min_score=SYNC_THRESHOLD)

        print("━" * 52)
        print("Done.")
        print(f"  {len(queue)} tickers queued for Claude valuation.")
        print("  Run 'python scripts/pipeline.py sync' after valuations are complete.")


if __name__ == "__main__":
    main()
