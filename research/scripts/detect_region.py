"""
Detect whether a ticker belongs to the US or India market.

Usage:
    python scripts/detect_region.py MRVL
    python scripts/detect_region.py HAL
    python scripts/detect_region.py NETWEB
"""
from __future__ import annotations

# Definitive India ticker list. Add as new names appear.
INDIA_TICKERS: set[str] = {
    # India Data Center Stack
    "NETWEB", "E2E", "BBOX", "RASHI", "AURIONPRO",
    "TATACOMM", "STLTECH", "HFCL", "NTPC", "ADANIPOWER",
    "TARIL", "BBL", "SHILCHAR", "EXIDE", "AMARAJABAT",
    "KRN", "AMBER", "APARINDS", "TAC",
    # Defence
    "HAL", "BEL", "BDL", "ZENTEC", "PARAS", "SOLARINDS",
    "ASTRAMICRO", "BEML", "DATAPATTNS", "KRISHNADEF",
    "MTAR", "MIDHANI", "COCHINSHIP", "MAZAGON",
    # Broad India
    "ZOMATO", "IRCTC", "TATAMOTORS", "RELIANCE", "INFY",
    "TCS", "WIPRO", "HCLTECH", "BAJFINANCE", "HDFC",
    "ICICIBANK", "SBIN", "LTIM", "INFOSYS", "BAJAJFINSV",
    # Apollo Microsystems (not Apollo Global)
    "APOLLOMICRO",
}

# Tickers that look Indian but are actually US (override)
US_OVERRIDES: set[str] = {
    "APH",   # Amphenol (US), not India
    "ON",    # ON Semiconductor (US)
    "NET",   # Cloudflare (US)
}

# Themes that imply India routing
INDIA_THEMES: set[str] = {"India-Data-Center-Stack"}


def detect_region(
    ticker: str,
    themes: list[str] | None = None,
    nse_prefix: bool = False,
) -> str:
    """Return 'india' or 'us'."""
    t = ticker.upper()

    if t in US_OVERRIDES:
        return "us"

    if nse_prefix:
        return "india"

    if t in INDIA_TICKERS:
        return "india"

    if any(th in INDIA_THEMES for th in (themes or [])):
        return "india"

    # Tickers with dots are typically Indian (TATAMOTORS.NS) or ETFs
    if "." in ticker:
        if ticker.upper().endswith((".NS", ".BO")):
            return "india"

    return "us"


def nse_code(ticker: str) -> str:
    """Return the nse:TICKER format used in the India sheet."""
    return f"nse:{ticker.lower()}"


if __name__ == "__main__":
    import sys
    for t in sys.argv[1:]:
        region = detect_region(t)
        code = nse_code(t) if region == "india" else t
        print(f"{t:<16} {region:<6}  code={code}")
