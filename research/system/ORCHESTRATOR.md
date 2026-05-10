# AlphaOS Orchestrator

Pipeline map. Two layers of work: deterministic scripts + Claude reasoning.

---

## Full Autonomous Flow

```
NEW FILE IN /raw/
      │
      ▼
┌──────────────────────────────────────────┐
│  LAYER 1  Extraction + Data              │
│                                          │
│  extract_stocks.py   raw → tickers       │
│  fetch_financials.py ticker → fin JSON   │
│  fetch_charts.py     ticker → chart      │
│  aggregate.py        ticker → payload    │
│  decision_engine.py  payload → score     │
└──────────────────────────────────────────┘
      │
      ▼
  pipeline.py queue  →  prints valuation queue
      │
      ▼
┌──────────────────────────────────────────┐
│  LAYER 2  Claude Reasoning               │  ← DECISION_ENGINE.md
│                                          │
│  For each ticker in queue:               │
│  1. Read data/scenarios/{T}_input.json   │
│  2. Apply DECISION_ENGINE.md             │
│  3. Save data/valuations/{T}.json        │
│     { weighted_fair_value, confidence,   │
│       scenarios, verdict, ... }          │
│  4. Save memos/{T}.md                    │
└──────────────────────────────────────────┘
      │
      ▼
┌──────────────────────────────────────────┐
│  LAYER 3  Sheet Sync                     │  ← SHEET_RULES.md
│                                          │
│  sync_watchlist.py                       │
│  1. Read full sheet ontology             │
│  2. Search all tabs (no duplicates)      │
│  3. Classify ticker → tab + section      │
│  4. Write: B (ticker) C (name) D (desc)  │
│  5. Write: G (fair price) if valued      │
└──────────────────────────────────────────┘
      │
      ▼
  Sheet column H (Potential Gain) auto-calculates
```

---

## Commands

```bash
# Full run (Layer 1 + queue + sheet sync)
python scripts/pipeline.py run

# Offline (skip yfinance)
python scripts/pipeline.py run --no-fetch

# Just show what needs Claude valuation
python scripts/pipeline.py queue

# Push existing valuations to sheet
python scripts/pipeline.py sync

# Current state
python scripts/pipeline.py status

# Drop a file and auto-trigger Layer 1
python scripts/watcher.py
```

---

## Claude Invocation (Layer 2)

After `pipeline.py run`, Claude sees the valuation queue and can process it:

```
Run the decision engine on: MU, SNDK, COHR, CRWV, LITE, NBIS
Read each /data/scenarios/{TICKER}_input.json,
apply system/DECISION_ENGINE.md,
save /data/valuations/{TICKER}.json and /memos/{TICKER}.md.
```

Then:
```bash
python scripts/pipeline.py sync
```

---

## Valuation JSON Contract

`/data/valuations/{TICKER}.json`:
```json
{
  "ticker": "CRDO",
  "generated_at": "2026-05-08",
  "current_price": 87.00,
  "scenarios": {
    "bull": {"price": 155, "probability": 0.25, "driver": "..."},
    "base": {"price": 104, "probability": 0.50, "driver": "..."},
    "bear": {"price":  62, "probability": 0.25, "driver": "..."}
  },
  "weighted_fair_value": 106.25,
  "upside_pct": 22.1,
  "confidence": "Medium",
  "verdict": "WATCH",
  "entry_range": [80, 90],
  "stop_loss": 68,
  "targets": {"short_term": 110, "medium_term": 140},
  "risk_reward": 2.4,
  "business_quality": "Strong",
  "valuation_verdict": "Fair",
  "themes": ["AI-Supply-Chain-Broadening"]
}
```

`weighted_fair_value` = P(bull)×bull + P(base)×base + P(bear)×bear
This is the number written to sheet column G.

---

## Valuation Update Policy

DO NOT rerun valuations daily. Update only when:
- Earnings release
- Major new source ingestion
- Technical structure breakdown or breakout
- Macro regime change

Daily noise destroys signal quality.

---

## LLM = Reasoning. Scripts = Truth.

| Layer | Tool | Job |
|-------|------|-----|
| Scripts | Python | Fetch, structure, score |
| Claude | DECISION_ENGINE.md | Reason, scenario-model, value |
| Scripts | sync_watchlist.py | Write to sheet |

Claude never infers prices from images alone.
Claude never hallucinates financials.
Scripts provide truth. Claude provides judgment.
