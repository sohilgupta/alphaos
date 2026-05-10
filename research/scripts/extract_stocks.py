"""
Scan /raw/ for $TICKER patterns and output structured JSON.
"""
import re
import json
from pathlib import Path
from datetime import datetime

VAULT = Path(__file__).resolve().parent.parent.parent / "vault"
RAW_DIR = VAULT / "raw"
OUT_FILE = VAULT / "processed" / "stocks" / "extracted_tickers.json"

TICKER_RE = re.compile(r'\$([A-Z][A-Z0-9]{0,9}(?:\.[A-Z]{1,2})?)')

# ETFs and non-stock tickers to skip
SKIP = {"DRAM", "DRGN"}

# Single-letter false positives (e.g. $E from $E2E typos)
MIN_TICKER_LEN = 2


def extract_from_file(path: Path) -> dict | None:
    text = path.read_text(encoding="utf-8")
    tickers = sorted({t for t in TICKER_RE.findall(text) if t not in SKIP and len(t) >= MIN_TICKER_LEN})
    if not tickers:
        return None

    # Pull published date from frontmatter if present
    date = None
    for line in text.splitlines():
        if line.startswith("published:"):
            date = line.split(":", 1)[1].strip()
            break

    return {
        "source": str(path.relative_to(VAULT)),
        "date": date,
        "tickers": tickers,
    }


def main():
    results = []
    for md in sorted(RAW_DIR.rglob("*.md")):
        row = extract_from_file(md)
        if row:
            results.append(row)

    OUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    OUT_FILE.write_text(json.dumps(results, indent=2))

    total_tickers = len({t for r in results for t in r["tickers"]})
    print(f"Scanned {len(results)} sources — {total_tickers} unique tickers → {OUT_FILE.relative_to(VAULT)}")


if __name__ == "__main__":
    main()
