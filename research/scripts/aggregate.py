"""
Layer 1 final step: assemble all structured inputs for a ticker into a single
payload Claude uses for decision engine reasoning.

Saves /data/scenarios/{TICKER}_input.json
"""
import json
import re
from pathlib import Path

VAULT = Path(__file__).resolve().parent.parent.parent / "vault"
FINANCIALS_DIR  = VAULT / "data" / "financials"
TECHNICALS_DIR  = VAULT / "data" / "technicals"
NEWS_DIR        = VAULT / "data" / "news"
TRENDLYNE_DIR   = VAULT / "data" / "trendlyne"
THEMES_DIR      = VAULT / "themes"
EXTRACTED = VAULT / "processed" / "stocks" / "extracted_tickers.json"
OUT_DIR = VAULT / "data" / "scenarios"

TICKER_RE = re.compile(r'\$([A-Z][A-Z0-9]{0,9}(?:\.[A-Z]{1,2})?)')

THEME_WEIGHTS = {
    "AI-Infrastructure-Capex-Supercycle": 1.0,
    "Jevons-Paradox-AI-Compute": 0.9,
    "Agentic-AI-Demand-Wave": 0.9,
    "AI-Supply-Chain-Broadening": 0.8,
    "India-Data-Center-Stack": 0.7,
}


def theme_exposure(ticker: str) -> list[dict]:
    hits = []
    for theme_file in sorted(THEMES_DIR.glob("*.md")):
        text = theme_file.read_text(encoding="utf-8")
        if f"${ticker}" in text or f"[[{ticker}]]" in text:
            hits.append({
                "theme": theme_file.stem,
                "weight": THEME_WEIGHTS.get(theme_file.stem, 0.5),
            })
    return hits


def mention_history(ticker: str) -> list[dict]:
    sources = json.loads(EXTRACTED.read_text())
    hits = []
    for s in sources:
        if ticker in s["tickers"]:
            hits.append({
                "source": s["source"],
                "date": s.get("date"),
            })
    return hits


def build_payload(ticker: str) -> dict:
    payload: dict = {"ticker": ticker}

    fin_file = FINANCIALS_DIR / f"{ticker}.json"
    payload["financials"] = json.loads(fin_file.read_text()) if fin_file.exists() else None

    tech_file = TECHNICALS_DIR / f"{ticker}.json"
    if tech_file.exists():
        tech = json.loads(tech_file.read_text())
        # strip the raw series — Claude doesn't need 90 rows of prices
        tech.pop("series_90d", None)
        payload["technicals"] = tech
    else:
        payload["technicals"] = None

    news_file = NEWS_DIR / f"{ticker}.json"
    payload["news"] = json.loads(news_file.read_text()) if news_file.exists() else []

    tl_file = TRENDLYNE_DIR / f"{ticker}.json"
    payload["trendlyne"] = json.loads(tl_file.read_text()) if tl_file.exists() else None

    payload["theme_exposure"] = theme_exposure(ticker)
    payload["mention_history"] = mention_history(ticker)
    payload["chart_path"] = (
        str((TECHNICALS_DIR / f"{ticker}.png").relative_to(VAULT))
        if (TECHNICALS_DIR / f"{ticker}.png").exists()
        else None
    )

    return payload


def main(tickers: list[str] | None = None):
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    if tickers is None:
        sources = json.loads(EXTRACTED.read_text())
        tickers = sorted({t for s in sources for t in s["tickers"]})

    for ticker in tickers:
        payload = build_payload(ticker)
        out = OUT_DIR / f"{ticker}_input.json"
        out.write_text(json.dumps(payload, indent=2))
        themes = [t["theme"] for t in payload["theme_exposure"]]
        mentions = len(payload["mention_history"])
        has_fin = "✓" if payload["financials"] and "error" not in payload["financials"] else "✗"
        has_tech = "✓" if payload["technicals"] and "error" not in payload["technicals"] else "✗"
        has_tl   = "✓" if payload["trendlyne"] and "error" not in payload["trendlyne"] else "✗"
        print(f"  {ticker:<12} fin={has_fin} tech={has_tech} trendlyne={has_tl} mentions={mentions} themes={len(themes)}")

    print(f"\n→ {len(tickers)} payloads → {OUT_DIR.relative_to(VAULT)}/")


if __name__ == "__main__":
    import sys
    tickers_arg = sys.argv[1:] or None
    main(tickers_arg)
