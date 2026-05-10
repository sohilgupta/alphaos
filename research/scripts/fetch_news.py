"""
Layer 1: Fetch latest news headlines for each ticker.
Uses yfinance .news (free, no auth) as primary source.
Saves /data/news/{TICKER}.json — list of recent articles.
"""
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import yfinance as yf

VAULT = Path(__file__).resolve().parent.parent.parent / "vault"
IN_FILE = VAULT / "processed" / "stocks" / "extracted_tickers.json"
OUT_DIR = VAULT / "data" / "news"

sys.path.insert(0, str(Path(__file__).resolve().parent))
from detect_region import detect_region

MAX_ARTICLES = 8


def yf_symbol(ticker: str) -> str:
    return f"{ticker}.NS" if detect_region(ticker) == "india" else ticker


def _ts_to_date(ts) -> str:
    try:
        return datetime.fromtimestamp(int(ts), tz=timezone.utc).strftime("%Y-%m-%d")
    except Exception:
        return str(ts)


def fetch(ticker: str) -> list[dict]:
    try:
        raw = yf.Ticker(yf_symbol(ticker)).news or []
        articles = []
        for item in raw[:MAX_ARTICLES]:
            content = item.get("content", {})
            title = (
                content.get("title")
                or item.get("title")
                or ""
            )
            summary = (
                content.get("summary")
                or content.get("description")
                or item.get("summary")
                or ""
            )
            pub_date = (
                content.get("pubDate")
                or _ts_to_date(item.get("providerPublishTime", ""))
            )
            provider = (
                content.get("provider", {}).get("displayName")
                or item.get("publisher")
                or ""
            )
            url = (
                content.get("canonicalUrl", {}).get("url")
                or item.get("link")
                or ""
            )
            if title:
                articles.append({
                    "date": pub_date,
                    "title": title,
                    "summary": summary[:300] if summary else "",
                    "source": provider,
                    "url": url,
                })
        return articles
    except Exception as e:
        return [{"error": str(e)}]


def main(tickers: list[str] | None = None):
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    if tickers is None:
        sources = json.loads(IN_FILE.read_text())
        tickers = sorted({t for s in sources for t in s["tickers"]})

    for ticker in tickers:
        out_file = OUT_DIR / f"{ticker}.json"
        articles = fetch(ticker)
        out_file.write_text(json.dumps(articles, indent=2))
        n = len([a for a in articles if "error" not in a])
        print(f"  {ticker:<12} {n} articles")
        time.sleep(0.3)

    print(f"\n→ {len(tickers)} tickers → {OUT_DIR.relative_to(VAULT)}/")


if __name__ == "__main__":
    tickers_arg = sys.argv[1:] or None
    main(tickers_arg)
