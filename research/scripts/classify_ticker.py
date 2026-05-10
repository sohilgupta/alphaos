"""
Classify a ticker into (tab, section) using vault theme data + keyword fallback.
Used by sync_watchlist.py — also callable standalone for testing.

Usage:
    python scripts/classify_ticker.py MRVL "Optical switch/chips"
    python scripts/classify_ticker.py NTPC "Power utility, India DC load beneficiary"
"""
from __future__ import annotations

THEME_TO_BUCKET: dict[str, tuple[str, str]] = {
    "AI-Infrastructure-Capex-Supercycle": ("AI Stocks", "AI Infrastructure"),
    "AI-Supply-Chain-Broadening":         ("AI Stocks", "AI Infrastructure"),
    "Jevons-Paradox-AI-Compute":          ("AI Stocks", "Storage / Memory / Data"),
    "Agentic-AI-Demand-Wave":             ("AI Stocks", "AI Infrastructure"),
    "India-Data-Center-Stack":            ("AI Stocks", "India Data Center Stack"),
}

# India sheet: keyword → section within Stock Watchlist 2/3
INDIA_KEYWORD_SECTIONS: list[tuple[list[str], str]] = [
    (["defence", "defense", "aerospace", "military", "ordnance", "missile", "ammunition"],
     "Defence Stocks"),
    (["renewable", "solar", "wind", "green energy", "clean energy"],
     "Renewable Stocks"),
    (["data centre", "data center", "cloud infra", "hyperscale", "colocation india"],
     "India Data Center Stack"),
    (["power", "grid", "transformer", "ups", "switchgear", "electrical equipment"],
     "Power & Grid India"),
    (["connectivity", "fiber", "optical", "telecom", "networking india"],
     "Connectivity India"),
    (["banking", "nbfc", "fintech", "insurance", "financial services"],
     "Financials"),
]

# India ticker → section overrides (defence PSUs etc.)
INDIA_TICKER_SECTIONS: dict[str, str] = {
    "HAL":        "Defence Stocks",
    "BEL":        "Defence Stocks",
    "BDL":        "Defence Stocks",
    "ZENTEC":     "Defence Stocks",
    "PARAS":      "Defence Stocks",
    "SOLARINDS":  "Defence Stocks",
    "ASTRAMICRO": "Defence Stocks",
    "BEML":       "Defence Stocks",
    "DATAPATTNS": "Defence Stocks",
    "KRISHNADEF": "Defence Stocks",
    "MTAR":       "Defence Stocks",
    "MIDHANI":    "Defence Stocks",
    "COCHINSHIP": "Defence Stocks",
    "MAZAGON":    "Defence Stocks",
    "APOLLOMICRO":"Defence Stocks",
    "NETWEB":     "India Data Center Stack",
    "E2E":        "India Data Center Stack",
    "BBOX":       "India Data Center Stack",
    "RASHI":      "India Data Center Stack",
    "AURIONPRO":  "India Data Center Stack",
    "TATACOMM":   "India Data Center Stack",
    "STLTECH":    "Connectivity India",
    "HFCL":       "Connectivity India",
    "NTPC":       "Power & Grid India",
    "ADANIPOWER": "Power & Grid India",
    "TARIL":      "Power & Grid India",
    "BBL":        "Power & Grid India",
    "SHILCHAR":   "Power & Grid India",
    "EXIDE":      "Power & Grid India",
    "AMARAJABAT": "Power & Grid India",
    "KRN":        "Power & Grid India",
    "AMBER":      "India Data Center Stack",
    "APARINDS":   "India Data Center Stack",
    "TAC":        "India Data Center Stack",
}

# Ordered: first match wins. Put more specific keywords earlier.
KEYWORD_BUCKETS: list[tuple[list[str], tuple[str, str]]] = [
    (["kv cache", "kv-cache"],                          ("AI Stocks", "Storage / Memory / Data")),
    (["optical", "transceiver", "photonic"],            ("AI Stocks", "Optical Networking")),
    (["memory", "dram", "nand", "hbm", "flash storage"],("AI Stocks", "Storage / Memory / Data")),
    (["cooling", "thermal", "hvac", "precision hvac"],  ("AI Stocks", "Cooling / Thermal")),
    (["transformer", "ups", "bess", "battery backup"],  ("AI Stocks", "Power & Grid")),
    (["power delivery", "power management", "grid"],    ("AI Stocks", "Power & Grid")),
    (["utility", "captive ppa", "renewable ppa"],       ("AI Stocks", "Power & Grid")),
    (["data center reit", "colocation", "interconnection"], ("AI Stocks", "Data Centers")),
    (["data centre", "data center"],                    ("AI Stocks", "Data Centers")),
    (["asic", "custom silicon", "chip design"],         ("AI Stocks", "Semiconductors")),
    (["foundry", "fabless", "fab "],                    ("AI Stocks", "Semiconductors")),
    (["semiconductor", "wafer", "packaging"],           ("AI Stocks", "Semiconductors")),
    (["interconnect", "ai interconnect", "infiniband"], ("AI Stocks", "Networking & Interconnect")),
    (["networking", "network switch", "optical switch"],("AI Stocks", "Networking & Interconnect")),
    (["neocloud", "gpu cloud", "inference infra"],      ("AI Stocks", "Cloud & Neoclouds")),
    (["hyperscaler", "cloud platform"],                 ("AI Stocks", "Cloud & Neoclouds")),
    (["fiber", "optical fiber", "subsea", "backbone"],  ("AI Stocks", "Connectivity")),
    (["structured cabling", "cabling", "conductor"],    ("AI Stocks", "Connectivity")),
    (["drone", "uav", "unmanned"],                      ("Robotics Stocks", "Defense Robots / Drones")),
    (["defense", "military", "autonomous weapon"],      ("Robotics Stocks", "Defense Robots / Drones")),
    (["robot", "robotics", "industrial automation"],    ("Robotics Stocks", "Industrial Robotics")),
    (["satellite", "launch", "rocket", "orbital"],      ("Space Exploration", "Launch & Orbital")),
    (["rare earth", "lithium", "cobalt", "mining"],     ("Rare Earth Metals", "Critical Minerals")),
]

# Per-ticker overrides for known ambiguous cases
TICKER_OVERRIDES: dict[str, tuple[str, str]] = {
    "TSM":      ("AI Stocks", "Semiconductors"),
    "INTC":     ("AI Stocks", "Semiconductors"),
    "AMD":      ("AI Stocks", "Semiconductors"),
    "NVDA":     ("AI Stocks", "Semiconductors"),
    "AVGO":     ("AI Stocks", "Semiconductors"),
    "ARM":      ("AI Stocks", "Semiconductors"),
    "ASML":     ("AI Stocks", "Semiconductors"),
    "KLAC":     ("AI Stocks", "Semiconductors"),
    "LRCX":     ("AI Stocks", "Semiconductors"),
    "AMAT":     ("AI Stocks", "Semiconductors"),
    "MRVL":     ("AI Stocks", "Networking & Interconnect"),
    "CRDO":     ("AI Stocks", "Networking & Interconnect"),
    "ALAB":     ("AI Stocks", "Networking & Interconnect"),
    "NET":      ("AI Stocks", "Edge AI & CDN"),
    "COHR":     ("AI Stocks", "Optical Networking"),
    "LITE":     ("AI Stocks", "Optical Networking"),
    "AAOI":     ("AI Stocks", "Optical Networking"),
    "GLW":      ("AI Stocks", "Optical Networking"),
    "FN":       ("AI Stocks", "Optical Networking"),
    "APH":      ("AI Stocks", "Optical Networking"),
    "AXTI":     ("AI Stocks", "Optical Networking"),
    "MU":       ("AI Stocks", "Storage / Memory / Data"),
    "SNDK":     ("AI Stocks", "Storage / Memory / Data"),
    "WDC":      ("AI Stocks", "Storage / Memory / Data"),
    "TOWCF":    ("AI Stocks", "Storage / Memory / Data"),
    "SMCI":     ("AI Stocks", "Data Centers"),
    "DELL":     ("AI Stocks", "Data Centers"),
    "JBL":      ("AI Stocks", "Data Centers"),
    "VRT":      ("AI Stocks", "Cooling / Thermal"),
    "CRWV":     ("AI Stocks", "Cloud & Neoclouds"),
    "NBIS":     ("AI Stocks", "Cloud & Neoclouds"),
    "BABA":     ("AI Stocks", "China AI"),
    "DRGN":     ("AI Stocks", "China AI"),
    "NOK":      ("AI Stocks", "Connectivity"),
    "SNPS":     ("AI Stocks", "Semiconductors"),
    "NVTS":     ("AI Stocks", "Power & Grid"),
    "ON":       ("AI Stocks", "Power & Grid"),
    "STM":      ("AI Stocks", "Power & Grid"),
    "ADI":      ("AI Stocks", "Power & Grid"),
    "MPWR":     ("AI Stocks", "Power & Grid"),
    "ETN":      ("AI Stocks", "Power & Grid"),
    "FLEX":     ("AI Stocks", "Power & Grid"),
    "VRT":      ("AI Stocks", "Cooling / Thermal"),
    "AMKR":     ("AI Stocks", "Semiconductors"),
    "ASX":      ("AI Stocks", "Semiconductors"),
    "CAMT":     ("AI Stocks", "Semiconductors"),
    "KEYS":     ("AI Stocks", "Semiconductors"),
    # India names
    "E2E":      ("AI Stocks", "India Data Center Stack"),
    "NETWEB":   ("AI Stocks", "India Data Center Stack"),
    "BBOX":     ("AI Stocks", "India Data Center Stack"),
    "RASHI":    ("AI Stocks", "India Data Center Stack"),
    "AURIONPRO":("AI Stocks", "India Data Center Stack"),
    "TATACOMM": ("AI Stocks", "India Data Center Stack"),
    "STLTECH":  ("AI Stocks", "India Data Center Stack"),
    "HFCL":     ("AI Stocks", "India Data Center Stack"),
    "NTPC":     ("AI Stocks", "India Data Center Stack"),
    "ADANIPOWER":("AI Stocks", "India Data Center Stack"),
    "TARIL":    ("AI Stocks", "India Data Center Stack"),
    "BBL":      ("AI Stocks", "India Data Center Stack"),
    "SHILCHAR": ("AI Stocks", "India Data Center Stack"),
    "EXIDE":    ("AI Stocks", "India Data Center Stack"),
    "AMARAJABAT":("AI Stocks", "India Data Center Stack"),
    "KRN":      ("AI Stocks", "India Data Center Stack"),
    "AMBER":    ("AI Stocks", "India Data Center Stack"),
    "APARINDS": ("AI Stocks", "India Data Center Stack"),
    "TAC":      ("AI Stocks", "India Data Center Stack"),
}

DEFAULT_BUCKET = ("US Stock Watchlist", "Uncategorized")
DEFAULT_INDIA_SECTION = "India Data Center Stack"


def classify_india_section(
    ticker: str,
    description: str = "",
    themes: list[str] | None = None,
    sector: str = "",
    industry: str = "",
) -> str:
    """Return section name for an India ticker within its watchlist tab."""
    if ticker in INDIA_TICKER_SECTIONS:
        return INDIA_TICKER_SECTIONS[ticker]

    haystack = " ".join([description, sector, industry]).lower()
    for keywords, section in INDIA_KEYWORD_SECTIONS:
        if any(kw in haystack for kw in keywords):
            return section

    return DEFAULT_INDIA_SECTION


def classify(
    ticker: str,
    description: str = "",
    themes: list[str] | None = None,
    sector: str = "",
    industry: str = "",
    region: str = "us",
) -> tuple[str, str]:
    """Return (tab_name, section_name) for a ticker."""

    if region == "india":
        tab = "Stock Watchlist 2"
        section = classify_india_section(ticker, description, themes, sector, industry)
        return tab, section

    # US path
    # 1. Hard override
    if ticker in TICKER_OVERRIDES:
        return TICKER_OVERRIDES[ticker]

    # 2. Theme match (first theme wins, ordered by specificity)
    for theme in (themes or []):
        if theme in THEME_TO_BUCKET:
            return THEME_TO_BUCKET[theme]

    # 3. Keyword match on description + sector + industry
    haystack = " ".join([description, sector, industry]).lower()
    for keywords, bucket in KEYWORD_BUCKETS:
        if any(kw in haystack for kw in keywords):
            return bucket

    return DEFAULT_BUCKET


if __name__ == "__main__":
    import sys
    ticker = sys.argv[1] if len(sys.argv) > 1 else "UNKNOWN"
    desc = sys.argv[2] if len(sys.argv) > 2 else ""
    # Auto-detect region for standalone use
    try:
        sys.path.insert(0, str(__import__("pathlib").Path(__file__).parent))
        from detect_region import detect_region as _dr
        rgn = _dr(ticker)
    except Exception:
        rgn = "us"
    tab, section = classify(ticker, desc, region=rgn)
    print(f"{ticker} [{rgn}] → [{tab}] / {section}")
