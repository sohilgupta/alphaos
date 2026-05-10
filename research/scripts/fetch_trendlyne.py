"""
Layer 1: Fetch Trendlyne DVM scores and stock classification for each ticker.

Trendlyne provides three things not available from yfinance:
  - Durability score  (0-100) — financial strength / quality
  - Valuation score   (0-100) — cheap vs expensive
  - Momentum score    (0-100) — technical strength
  - Classification    — "Momentum Trap", "Quality Stock", "Strong Performer...", etc.

Both US and India stocks are supported.
Data is free (no login required) for the main equity page.

Output: /data/trendlyne/{TICKER}.json per ticker.

Usage:
    python scripts/fetch_trendlyne.py              # all tickers with cached IDs
    python scripts/fetch_trendlyne.py MXL AMD      # specific tickers
    python scripts/fetch_trendlyne.py --discover   # try to find IDs for uncached tickers
"""
from __future__ import annotations

import json
import re
import sys
import time
from pathlib import Path

import requests
from bs4 import BeautifulSoup

VAULT   = Path(__file__).resolve().parent.parent.parent / "vault"
OUT_DIR = VAULT / "data" / "trendlyne"
ID_CACHE = VAULT / "data" / "trendlyne_ids.json"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

# ── Known Trendlyne IDs ───────────────────────────────────────────────────────
# Format: TICKER → (trendlyne_id, region)
# region: "us" → us.trendlyne.com  |  "india" → trendlyne.com

KNOWN_IDS: dict[str, tuple[str, str]] = {
    # ── US stocks ──────────────────────────────────────────────────────────
    "AAPL":  ("1550734", "us"),
    "ALAB":  ("2164717", "us"),
    "AMAT":  ("1550902", "us"),
    "AMD":   ("1550905", "us"),
    "AMZN":  ("1550929", "us"),
    "ANET":  ("1402857", "us"),
    "ASML":  ("1551463", "us"),
    "AVGO":  ("1551084", "us"),
    "CDNS":  ("1551924", "us"),
    "CRDO":  ("1552111", "us"),
    "DDOG":  ("1552333", "us"),
    "INTC":  ("1553409", "us"),
    "KLAC":  ("1553631", "us"),
    "LRCX":  ("1553798", "us"),
    "META":  ("1554028", "us"),
    "MPWR":  ("1554035", "us"),
    "MRVL":  ("1554050", "us"),
    "MSFT":  ("1554053", "us"),
    "MU":    ("1554071", "us"),
    "MXL":   ("1554081", "us"),
    "NVDA":  ("1554267", "us"),
    "ORCL":  ("1404434", "us"),
    "PLTR":  ("1404508", "us"),
    "SMCI":  ("1555199", "us"),
    "SNPS":  ("1555225", "us"),
    "TSM":   ("1404971", "us"),
}


# ── ID discovery via DuckDuckGo (best-effort) ────────────────────────────────

def discover_id(ticker: str, region: str = "us") -> str | None:
    """Try to find a Trendlyne ID for an unknown ticker via search."""
    domain = "us.trendlyne.com" if region == "us" else "trendlyne.com"
    queries = [
        f"{ticker} site:{domain} equity live stock",
        f"trendlyne {ticker} equity live stock price analysis",
    ]
    pattern = re.compile(rf"/{ticker}/", re.IGNORECASE)
    id_pattern = re.compile(r"/us/equity/(\d+)/" if region == "us"
                            else r"/equity/(\d+)/")
    for q in queries:
        try:
            url = f"https://html.duckduckgo.com/html/?q={requests.utils.quote(q)}"
            r = requests.get(url, headers=HEADERS, timeout=10)
            # Find all hrefs
            hrefs = re.findall(r'href="(https?://[^"]+)"', r.text)
            for href in hrefs:
                if domain in href and pattern.search(href):
                    m = id_pattern.search(href)
                    if m:
                        return m.group(1)
            time.sleep(1)
        except Exception:
            pass
    return None


# ── Parsing ──────────────────────────────────────────────────────────────────

def _extract_score(text: str, label: str) -> float | None:
    """Extract a numeric score like '27.8 / 100' after a label."""
    idx = text.find(label)
    if idx == -1:
        return None
    snippet = text[idx:idx + 100]
    m = re.search(r"(\d+\.?\d*)\s*/\s*100", snippet)
    return float(m.group(1)) if m else None


def _extract_classification(text: str) -> str | None:
    """Extract stock classification label."""
    labels = [
        "Momentum Trap", "Quality Stock", "Strong Performer",
        "Await Turnaround", "Getting Expensive", "Undervalued",
        "Value Trap", "Expensive", "Debt Laden", "High Growth",
    ]
    for label in labels:
        if label in text:
            idx = text.find(label)
            return text[idx:idx + 60].split("about")[0].strip()
    return None


def _extract_analyst(text: str) -> dict:
    """Extract analyst target and count."""
    out: dict = {}
    m = re.search(r"\$(\d+\.?\d*)[, ]+1[\s-]?[Yy]r", text)
    if m:
        out["analyst_target"] = float(m.group(1))
    m2 = re.search(r"(\d+)\s+analyst", text, re.IGNORECASE)
    if m2:
        out["n_analysts"] = int(m2.group(1))
    # Upside/downside
    m3 = re.search(r"([-+]?\d+\.?\d*)%\s+(?:upside|downside)", text, re.IGNORECASE)
    if m3:
        raw = float(m3.group(1))
        if "downside" in text[m3.start():m3.start() + 40].lower():
            raw = -abs(raw)
        out["analyst_upside_pct"] = raw
    return out


def fetch_us(ticker: str, tl_id: str) -> dict:
    url = f"https://us.trendlyne.com/us/equity/{tl_id}/{ticker}/"
    try:
        r = requests.get(url, headers=HEADERS, timeout=12)
        r.raise_for_status()
        soup = BeautifulSoup(r.text, "html.parser")
        text = soup.get_text(" ", strip=True)

        out: dict = {
            "ticker":         ticker,
            "region":         "us",
            "trendlyne_id":   tl_id,
            "trendlyne_url":  url,
        }

        out["durability_score"]  = _extract_score(text, "Durability")
        out["valuation_score"]   = _extract_score(text, "Valuation Score")
        out["momentum_score"]    = _extract_score(text, "Momentum Score")
        out["classification"]    = _extract_classification(text)
        out.update(_extract_analyst(text))

        # SWOT
        m_sw = re.search(r"Strengths[:\s]+(\d+)", text)
        m_wk = re.search(r"Weaknesses[:\s]+(\d+)", text)
        if m_sw:
            out["strengths"] = int(m_sw.group(1))
        if m_wk:
            out["weaknesses"] = int(m_wk.group(1))

        return out
    except Exception as e:
        return {"ticker": ticker, "region": "us", "error": str(e)}


def fetch_india(ticker: str, tl_id: str) -> dict:
    url = f"https://trendlyne.com/equity/{tl_id}/{ticker}/"
    try:
        r = requests.get(url, headers=HEADERS, timeout=12)
        r.raise_for_status()
        soup = BeautifulSoup(r.text, "html.parser")
        text = soup.get_text(" ", strip=True)

        out: dict = {
            "ticker":         ticker,
            "region":         "india",
            "trendlyne_id":   tl_id,
            "trendlyne_url":  url,
        }

        out["durability_score"]  = _extract_score(text, "Durability")
        out["valuation_score"]   = _extract_score(text, "Valuation Score")
        out["momentum_score"]    = _extract_score(text, "Momentum Score")
        out["classification"]    = _extract_classification(text)

        return out
    except Exception as e:
        return {"ticker": ticker, "region": "india", "error": str(e)}


# ── Main ─────────────────────────────────────────────────────────────────────

def load_id_cache() -> dict[str, tuple[str, str]]:
    if ID_CACHE.exists():
        raw = json.loads(ID_CACHE.read_text())
        return {k: (v[0], v[1]) for k, v in raw.items()}
    return {}


def save_id_cache(cache: dict[str, tuple[str, str]]):
    ID_CACHE.parent.mkdir(parents=True, exist_ok=True)
    ID_CACHE.write_text(json.dumps(
        {k: list(v) for k, v in sorted(cache.items())}, indent=2
    ))


def main(tickers: list[str] | None = None, discover: bool = False):
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    # Merge hardcoded + cached IDs
    cache = {**KNOWN_IDS, **load_id_cache()}

    if tickers is None:
        tickers = sorted(cache.keys())

    updated_cache = False
    ok, skip, err = 0, 0, 0

    for ticker in tickers:
        if ticker not in cache:
            if discover:
                print(f"  {ticker:<12} discovering ID...", end=" ", flush=True)
                tid = discover_id(ticker)
                if tid:
                    cache[ticker] = (tid, "us")
                    updated_cache = True
                    print(f"found {tid}")
                else:
                    print("not found — skipping")
                    skip += 1
                    continue
            else:
                skip += 1
                continue

        tl_id, region = cache[ticker]
        out_file = OUT_DIR / f"{ticker}.json"

        print(f"  {ticker:<12}", end=" ", flush=True)
        if region == "us":
            data = fetch_us(ticker, tl_id)
        else:
            data = fetch_india(ticker, tl_id)

        out_file.write_text(json.dumps(data, indent=2))

        if "error" in data:
            print(f"ERR: {data['error']}")
            err += 1
        else:
            d = data.get("durability_score", "?")
            v = data.get("valuation_score", "?")
            m = data.get("momentum_score", "?")
            cls = (data.get("classification") or "")[:35]
            print(f"D={d} V={v} M={m}  {cls}")
            ok += 1

        time.sleep(1.2)

    if updated_cache:
        save_id_cache(cache)

    print(f"\n→ {ok} ok  {skip} no-ID  {err} errors  → {OUT_DIR.relative_to(VAULT)}/")


if __name__ == "__main__":
    args = sys.argv[1:]
    discover_flag = "--discover" in args
    ticker_args   = [a for a in args if not a.startswith("--")]
    main(ticker_args or None, discover=discover_flag)
