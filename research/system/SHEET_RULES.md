# Watchlist Sheet Rules

Two sheets. Route by region. Same thematic ontology logic — different column maps.

---

## Sheet Registry

| Sheet | ID | Market | Tabs to use |
|-------|----|--------|-------------|
| US Watchlist | `1HVEG6wtWsm68o3YMgznhhLrlENOARqF41kqrcbJlqq4` | US / Global | AI Stocks, Robotics Stocks, High Growth, Space Exploration, Rare Earth Metals, US Stock Watchlist |
| India Watchlist | `1ez7O6V_fK-7-s-QSgvZsiw2YJkhyYEi52K1L0rauuFM` | India (NSE/BSE) | Stock Watchlist 2, Stock Watchlist 3 |

---

## Section Detection (both sheets)
- **Section header row**: col A has text (section name), col B is empty
- **Stock row**: col A has content, col B has stock code

---

## US Sheet Column Map

| Col | Field | Write? | Source |
|-----|-------|--------|--------|
| A | Category | — | Section headers only (empty on stock rows) |
| B | Stock Code | **Yes** | Ticker (e.g. MRVL) |
| C | Name | **Yes** | Company name |
| D | Description | **Yes** | One-line, business-focused |
| E | Market Cap | No | Auto |
| F | Current Price | No | Auto |
| G | Fair Price | **Yes, if valued** | Weighted EV from decision engine |
| H | Potential Gain | No | Formula: (G-F)/F |
| I | Verdict | **Yes, if valued** | Canonical title-case (see below) |
| J | Confidence | **Yes, if valued** | Canonical title-case (see below) |
| K+ | Gain columns | No | Formulas |

**Insert row writes: B, C, D. Write G/I/J only when valuation exists.**

---

## India Sheet Column Map

| Col | Field | Write? | Source |
|-----|-------|--------|--------|
| A | Stock (name) | **Yes** | Company name |
| B | Stock Code | **Yes** | Format: `nse:TICKER` or `NSE:TICKER` |
| C | Date | **Yes** | Date added (YYYY-MM-DD) |
| D | Price | **Yes** | Current price at time of adding (baseline for CAGR) |
| E | Current Price | No | Auto |
| F | Fair price | **Yes, if valued** | Weighted EV from decision engine |
| G | Potential gain/fall | No | Formula: F - E |
| H | Verdict | **Yes, if valued** | Canonical title-case (see below) |
| I | Confidence | **Yes, if valued** | Canonical title-case (see below) |
| J | CAGR | No | Formula |
| K+ | Gain columns | No | Formulas |

**Insert row writes: A, B, C, D. Write F/H/I only when valuation exists.**

---

## Canonical Verdict & Confidence Values

The dashboard reads these columns and renders them as colored badges /
confidence meters. Decision engine output (`data/valuations/*.json`) is
normalised to these exact strings before writing to the sheet — see
`update_sheet_valuations.py:VERDICT_MAP / CONFIDENCE_MAP`.

**Verdict** (write exactly one of):
| Value | Color | Meaning |
|-------|-------|---------|
| `Strong Buy` | emerald | High conviction, large upside, low risk |
| `Buy` | teal | Positive thesis, reasonable upside |
| `Watch` | yellow | Wait for entry / catalyst (alias: `Wait`) |
| `Hold` | zinc | Neutral / fairly valued |
| `Reduce` | orange | Trim exposure, weakening thesis |
| `Avoid` | red | Negative thesis, do not buy |

**Confidence** (write exactly one of):
| Value | Bar | Meaning |
|-------|-----|---------|
| `High` | full | Strong data, low scenario variance |
| `Medium` | 2/3 | Adequate data, moderate variance |
| `Low` | 1/3 | Thin data, wide scenario range |

Legacy uppercase forms (`WATCH`, `BUY`, `Medium-High`, etc.) are auto-mapped
at write time. The dashboard parser is also case-insensitive as a safety net.

---

## Stock Code Format

| Market | Format | Example |
|--------|--------|---------|
| US (NYSE/NASDAQ) | Ticker only | `MRVL` |
| India NSE | `nse:TICKER` | `nse:hal` |
| India BSE | `BOM:CODE` | `BOM:534618` |

---

## Routing Logic

```
Ticker extracted
      │
      ▼
detect_region()
      │
  ┌───┴───┐
  US    India
  │       │
  ▼       ▼
US sheet  India sheet
AI Stocks Stock Watchlist 2
```

---

## Deduplication
Search BOTH sheets before any insert.
A ticker present in either sheet → skip entirely.

---

## Theme → US Tab/Section Mapping

| Vault Theme | Tab | Section |
|-------------|-----|---------|
| AI-Infrastructure-Capex-Supercycle | AI Stocks | AI Infrastructure |
| AI-Supply-Chain-Broadening | AI Stocks | AI Infrastructure |
| Jevons-Paradox-AI-Compute | AI Stocks | Storage / Memory / Data |
| Agentic-AI-Demand-Wave | AI Stocks | AI Infrastructure |
| India-Data-Center-Stack | India sheet | Stock Watchlist 2 |

## Keyword → US Section Fallback

| Keywords | Section |
|----------|---------|
| optical, transceiver, photonic | Optical Networking |
| memory, dram, nand, hbm | Storage / Memory / Data |
| cooling, thermal, hvac | Cooling / Thermal |
| power, grid, utility, transformer | Power & Grid |
| data center, reit, colocation | Data Centers |
| asic, chip, semiconductor, foundry | Semiconductors |
| interconnect, switch, networking | Networking & Interconnect |
| neocloud, cloud, inference | Cloud & Neoclouds |
| drone, uav, defense | Robotics Stocks → Defense Robots / Drones |
| robot, automation, industrial | Robotics Stocks → Industrial Robotics |

## Keyword → India Section Mapping

| Keywords | Section |
|----------|---------|
| defence, defence psu, aerospace, military | Defence Stocks |
| renewable, solar, wind, green energy | Renewable Stocks |
| data centre, cloud infra, hyperscale india | India Data Center Stack |
| power, grid, transformer, ups | Power & Grid India |
| connectivity, fiber, optical, telecom | Connectivity India |
| banking, nbfc, fintech | Financials |

---

## Description Style (US sheet)
- One line, under 100 chars
- What the company does + AI investment angle
- Example: "Optical transceiver manufacturer; AI cluster networking bottleneck play"

## Description Style (India sheet)
- Not written — col A (name) is the identifier
- Keep name concise and recognisable

---

## Valuation JSON (`/data/valuations/{TICKER}.json`)
```json
{
  "ticker": "HAL",
  "region": "india",
  "currency": "INR",
  "generated_at": "2026-05-09",
  "current_price": 4791,
  "scenarios": {
    "bull": {"price": 6200, "probability": 0.25},
    "base": {"price": 5200, "probability": 0.50},
    "bear": {"price": 3800, "probability": 0.25}
  },
  "weighted_fair_value": 5100,
  "upside_pct": 6.4,
  "confidence": "Medium",
  "verdict": "WATCH"
}
```

---

## Rules
- Never duplicate — search both sheets before inserting
- Never write formula columns
- Write Fair Price only when decision engine has produced a valuation
- Update fair price only on: earnings, major new source, technical breakout/breakdown, macro shift
- India tickers go to India sheet, US/global tickers go to US sheet
- ETFs go to the sheet matching their market
