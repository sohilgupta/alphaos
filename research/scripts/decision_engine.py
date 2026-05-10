"""
Layer 2 helper: score tickers from aggregated payloads for watchlist ranking.
This is the QUANTITATIVE pre-filter only.

Full reasoning (memos, fair value, scenarios) is done by Claude using DECISION_ENGINE.md.

Outputs /data/watchlists/scored.json
"""
import json
from datetime import date, datetime
from pathlib import Path

VAULT = Path(__file__).resolve().parent.parent.parent / "vault"
SCENARIOS_DIR = VAULT / "data" / "scenarios"
OUT_FILE = VAULT / "data" / "watchlists" / "scored.json"

THEME_WEIGHTS = {
    "AI-Infrastructure-Capex-Supercycle": 1.0,
    "Jevons-Paradox-AI-Compute": 0.9,
    "Agentic-AI-Demand-Wave": 0.9,
    "AI-Supply-Chain-Broadening": 0.8,
    "India-Data-Center-Stack": 0.7,
}


def recency(date_str: str | None) -> float:
    if not date_str:
        return 0.5
    try:
        d = datetime.strptime(date_str, "%Y-%m-%d").date()
        return max(0.1, 1.0 - (date.today() - d).days / 365)
    except ValueError:
        return 0.5


def score_payload(payload: dict) -> dict:
    ticker = payload["ticker"]
    fin = payload.get("financials") or {}
    tech = payload.get("technicals") or {}
    themes = payload.get("theme_exposure") or []
    mentions = payload.get("mention_history") or []

    # Frequency score
    freq = min(1.0, len(mentions) / 5)

    # Recency score (most recent mention)
    rec = max((recency(m.get("date")) for m in mentions), default=0.5)

    # Theme score
    theme_score = min(1.0, sum(t.get("weight", 0.5) for t in themes))

    # Fundamental quality bonus (0–0.15)
    fund_bonus = 0.0
    if fin and "error" not in fin:
        if (fin.get("revenue_growth_3y") or 0) > 15:
            fund_bonus += 0.05
        if (fin.get("gross_margin") or 0) > 50:
            fund_bonus += 0.05
        if (fin.get("roe") or 0) > 15:
            fund_bonus += 0.05

    # Technical confirmation bonus (0–0.1)
    tech_bonus = 0.0
    if tech and "error" not in tech:
        if tech.get("above_ma50"):
            tech_bonus += 0.05
        if tech.get("above_ma200"):
            tech_bonus += 0.05

    raw = 0.30 * freq + 0.25 * rec + 0.35 * theme_score + fund_bonus + tech_bonus
    score = round(min(1.0, raw), 3)

    fin_price = fin.get("price") if fin and "error" not in fin else None
    fin_name = fin.get("name") if fin and "error" not in fin else None
    fin_sector = fin.get("sector") if fin and "error" not in fin else None
    fin_mcap = fin.get("market_cap") if fin and "error" not in fin else None
    tech_trend = tech.get("trend_structure") if tech and "error" not in tech else None

    return {
        "ticker": ticker,
        "score": score,
        "mentions": len(mentions),
        "themes": [t["theme"] for t in themes],
        "name": fin_name,
        "sector": fin_sector,
        "market_cap": fin_mcap,
        "price": fin_price,
        "trend": tech_trend,
    }


def main():
    payloads = sorted(SCENARIOS_DIR.glob("*_input.json"))
    if not payloads:
        print("No input payloads found. Run aggregate.py first.")
        return

    scored = []
    for p in payloads:
        payload = json.loads(p.read_text())
        scored.append(score_payload(payload))

    scored.sort(key=lambda x: x["score"], reverse=True)

    OUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    OUT_FILE.write_text(json.dumps(scored, indent=2))

    print(f"{'Ticker':<12} {'Score':>6}  {'Trend':<8}  {'Themes'}")
    print("-" * 60)
    for row in scored[:20]:
        themes = ", ".join(row["themes"][:2])
        trend = row.get("trend") or "—"
        print(f"{row['ticker']:<12} {row['score']:>6.3f}  {trend:<8}  {themes}")

    print(f"\n→ {len(scored)} tickers scored → {OUT_FILE.relative_to(VAULT)}")


if __name__ == "__main__":
    main()
