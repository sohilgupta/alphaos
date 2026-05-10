"""
Layer 1: Fetch financials for all extracted tickers.
Saves one JSON file per ticker to /data/financials/{TICKER}.json
"""
import json
import sys
from pathlib import Path

import yfinance as yf

VAULT = Path(__file__).resolve().parent.parent.parent / "vault"
IN_FILE = VAULT / "processed" / "stocks" / "extracted_tickers.json"
OUT_DIR = VAULT / "data" / "financials"

sys.path.insert(0, str(Path(__file__).resolve().parent))
from detect_region import detect_region


def yf_symbol(ticker: str) -> str:
    """Return yfinance symbol: append .NS for Indian NSE tickers."""
    region = detect_region(ticker)
    return f"{ticker}.NS" if region == "india" else ticker


def fetch(ticker: str) -> dict:
    try:
        symbol = yf_symbol(ticker)
        t = yf.Ticker(symbol)
        info = t.info

        # 3-year revenue growth from annual financials
        rev_growth_3y = None
        try:
            fin = t.financials
            if fin is not None and not fin.empty and "Total Revenue" in fin.index:
                rev = fin.loc["Total Revenue"].dropna()
                if len(rev) >= 2:
                    rev_growth_3y = round((rev.iloc[0] / rev.iloc[-1]) ** (1 / max(len(rev) - 1, 1)) - 1, 4) * 100
        except Exception:
            pass

        return {
            "ticker": ticker,
            "yf_symbol": symbol,
            "name": info.get("shortName") or info.get("longName"),
            "sector": info.get("sector"),
            "industry": info.get("industry"),
            "currency": info.get("currency"),
            "price": info.get("currentPrice") or info.get("regularMarketPrice"),
            "market_cap": info.get("marketCap"),
            "revenue_growth_3y": rev_growth_3y,
            "gross_margin": round(info.get("grossMargins", 0) * 100, 1) if info.get("grossMargins") else None,
            "operating_margin": round(info.get("operatingMargins", 0) * 100, 1) if info.get("operatingMargins") else None,
            "roe": round(info.get("returnOnEquity", 0) * 100, 1) if info.get("returnOnEquity") else None,
            "debt_to_equity": info.get("debtToEquity"),
            "pe": info.get("trailingPE"),
            "pe_forward": info.get("forwardPE"),
            "peg": info.get("pegRatio"),
            "revenue_ttm": info.get("totalRevenue"),
            "52w_high": info.get("fiftyTwoWeekHigh"),
            "52w_low": info.get("fiftyTwoWeekLow"),
            "price_vs_52w_high_pct": round(
                (info.get("currentPrice", 0) / info.get("fiftyTwoWeekHigh", 1) - 1) * 100, 1
            ) if info.get("fiftyTwoWeekHigh") else None,
        }
    except Exception as e:
        return {"ticker": ticker, "yf_symbol": yf_symbol(ticker), "error": str(e)}


def main():
    sources = json.loads(IN_FILE.read_text())
    tickers = sorted({t for s in sources for t in s["tickers"]})
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    ok, err = 0, 0
    for ticker in tickers:
        out_file = OUT_DIR / f"{ticker}.json"
        print(f"  {ticker:<12}", end=" ", flush=True)
        data = fetch(ticker)
        out_file.write_text(json.dumps(data, indent=2))
        if "error" in data:
            print(f"ERR: {data['error']}")
            err += 1
        else:
            price = data.get("price") or "n/a"
            print(f"${price}  {data.get('name') or ''}")
            ok += 1

    print(f"\n→ {ok} ok, {err} errors  →  {OUT_DIR.relative_to(VAULT)}/")


if __name__ == "__main__":
    main()
