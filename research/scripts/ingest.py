"""
AlphaOS ingest pipeline.

Layer 1 (extraction + data):
  1. extract_stocks.py        — raw → extracted_tickers.json
  2. fetch_financials.py      — ticker → data/financials/{T}.json
  3. fetch_charts.py          — ticker → data/technicals/{T}.json + .png
  4. fetch_news.py            — ticker → data/news/{T}.json
  5. fetch_trendlyne.py       — ticker → data/trendlyne/{T}.json
  6. aggregate.py             — ticker → data/scenarios/{T}_input.json

Layer 2 (decision — quantitative pre-filter):
  7. decision_engine.py       — scenarios → data/watchlists/scored.json
  8. sync_watchlist.py        — insert NEW tickers into Google Sheets
  9. update_sheet_valuations.py — push latest FV/Verdict/Confidence
                                   to existing sheet rows (Claude-authored
                                   valuations from data/valuations/)

Full reasoning (memos, fair value, scenarios) requires Claude + DECISION_ENGINE.md.
Once Claude writes `data/valuations/{TICKER}.json`, step 9 propagates it
to the live Google Sheet (cols G/I/J for US, F/H/I for India).

Usage:
    python scripts/ingest.py               # full pipeline
    python scripts/ingest.py --no-fetch    # skip yfinance calls
    python scripts/ingest.py --ticker MRVL # single ticker
    python scripts/ingest.py --no-sync     # skip Google Sheets writes
"""
import argparse
import subprocess
import sys
from pathlib import Path

VAULT = Path(__file__).resolve().parent.parent.parent / "vault"
SCRIPTS = Path(__file__).resolve().parent


def run(script: str, label: str, extra_args: list[str] | None = None) -> bool:
    print(f"\n── {label} ──")
    cmd = [sys.executable, str(SCRIPTS / script)] + (extra_args or [])
    result = subprocess.run(cmd, cwd=str(VAULT))
    if result.returncode != 0:
        print(f"  ERROR: {script} exited with code {result.returncode}")
        return False
    return True


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--no-fetch", action="store_true", help="Skip yfinance calls")
    parser.add_argument("--no-sync",  action="store_true", help="Skip Google Sheets writes")
    parser.add_argument("--ticker", help="Process a single ticker only")
    args = parser.parse_args()

    print("AlphaOS Pipeline")
    print("=" * 50)
    print("LAYER 1: Extraction + Data")

    if not run("extract_stocks.py", "1/9  Extract tickers from /raw/"):
        sys.exit(1)

    if not args.no_fetch:
        run("fetch_financials.py",  "2/9  Fetch financials (yfinance)")
        run("fetch_charts.py",      "3/9  Fetch charts (TradingView + yfinance)")
        run("fetch_news.py",        "4/9  Fetch latest news (yfinance)")
        tl_args = ([args.ticker] if args.ticker else [])
        run("fetch_trendlyne.py",   "5/9  Fetch Trendlyne DVM scores", tl_args)
    else:
        print("\n── 2/9  Fetch financials   — SKIPPED ──")
        print("── 3/9  Fetch charts       — SKIPPED ──")
        print("── 4/9  Fetch news         — SKIPPED ──")
        print("── 5/9  Fetch Trendlyne    — SKIPPED ──")

    agg_args = [args.ticker] if args.ticker else []
    if not run("aggregate.py", "6/9  Aggregate payloads per ticker", agg_args):
        sys.exit(1)

    print("\n" + "─" * 50)
    print("LAYER 2: Quantitative Pre-Filter")

    if not run("decision_engine.py", "7/9  Score & rank"):
        sys.exit(1)

    if args.no_sync:
        print("\n── 8/9  Sync new tickers   — SKIPPED ──")
        print("── 9/9  Update sheet FV/V/C — SKIPPED ──")
    else:
        if not run("sync_watchlist.py", "8/9  Insert new tickers into sheets"):
            print("  Warning: sync_watchlist.py failed — continuing")

        update_args = [args.ticker] if args.ticker else []
        if not run("update_sheet_valuations.py",
                   "9/9  Push Claude valuations (FV/Verdict/Confidence)",
                   update_args):
            print("  Warning: update_sheet_valuations.py failed — continuing")

    print("\n" + "=" * 50)
    print("Pipeline complete.")
    print()
    print("For full reasoning (memos, fair value, scenarios),")
    print("open Claude Code and say:")
    print()
    if args.ticker:
        print(f'  "Run decision engine on {args.ticker}."')
    else:
        print('  "Run decision engine on all tickers scored above 0.6."')
    print()
    print("After Claude writes /data/valuations/{T}.json, re-run:")
    print("  python scripts/update_sheet_valuations.py [TICKERS...]")
    print("to push the new FV/Verdict/Confidence to Google Sheets.")


if __name__ == "__main__":
    main()
