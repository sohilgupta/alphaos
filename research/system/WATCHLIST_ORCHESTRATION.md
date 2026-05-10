# Watchlist Orchestration

Master operational logic for maintaining both watchlist sheets.

---

## Full Flow

```
NEW TICKER (from extraction)
        │
        ▼
detect_region(ticker)
        │
   ┌────┴────┐
   US      India
        │
        ▼
sheet_scanner: search ALL tabs in BOTH sheets
        │
  ┌─────┴─────┐
Exists      Missing
  │              │
  ▼              ▼
Fair price    classify_ticker()
  empty?       → tab + section
  │              │
  ▼              ▼
Yes: run      section exists?
valuation        │
engine        ┌──┴──┐
  │           Yes   No
  ▼           │      │
Update        Insert  Create section
col G/F       row     + insert row
                │
                ▼
             Valuation exists?
                │
           ┌────┴────┐
           Yes       No
           │          │
        Write       Leave
        fair price  blank
        (G/F col)   (fill later)
```

---

## Responsibilities

### Responsibility 1: Ontology Management
- Maintain thematic section structure in both sheets
- Route tickers to correct tab and section
- Create new sections when needed
- Never duplicate

### Responsibility 2: Valuation Engine
- Fetch financials + technicals
- Run bull/base/bear scenario model
- Compute weighted fair value
- Write to correct fair price column

These are conceptually separate. Ontology can run without valuation. Valuation can run without ontology changes.

---

## Trigger Conditions

### Run full pipeline (Layer 1 + ontology + sync)
```bash
python scripts/pipeline.py run
```
Trigger on: any new file in /raw/

### Run valuation engine (Layer 2, Claude)
Trigger on:
- New ticker added to sheet with no fair price
- Earnings release
- Major technical breakout or breakdown
- Macro regime shift
- Major new source materially changes thesis

Do NOT trigger on: time passing, price movement alone, daily schedule

### Sync to sheets (Layer 3)
```bash
python scripts/pipeline.py sync
```
Trigger on: after any valuation updates, or after Layer 1

---

## Per-Ticker Decision Logic

```python
if ticker in any_sheet:
    if fair_price_missing:
        run_valuation_engine(ticker)
        update_fair_price(ticker)
    else:
        skip  # already complete
else:
    region = detect_region(ticker)
    tab, section = classify_ticker(ticker, region)
    insert_row(sheet[region], tab, section, ticker)
    if valuation_available:
        write_fair_price(ticker)
```

---

## Region Detection Rules

| Signal | Region |
|--------|--------|
| Theme: India-Data-Center-Stack | India |
| Known India ticker list | India |
| NSE/BSE prefix in source text | India |
| Ticker ends in .NS or .BO | India |
| Everything else | US |

## India Ticker List
NETWEB, E2E, BBOX, RASHI, AURIONPRO, TATACOMM, STLTECH, HFCL, NTPC, ADANIPOWER,
TARIL, BBL, SHILCHAR, EXIDE, AMARAJABAT, KRN, AMBER, APARINDS, TAC,
HAL, BEL, BDL, ZENTEC, PARAS, SOLARINDS, ASTRAMICRO, BEML, DATAPATTNS,
APOLLO, KRISHNADEF, ZOMATO, NIFTY, SENSEX, IRCTC, TATAMOTORS, RELIANCE,
INFY, TCS, WIPRO, HCLTECH, BAJFINANCE, HDFC, ICICIBANK, SBIN

---

## Valuation Output Contract

All valuations saved to `/data/valuations/{TICKER}.json`:
- `weighted_fair_value` → written to sheet (col G for US, col F for India)
- `current_price` → used to compute upside at time of valuation
- `confidence` → displayed in memo, not in sheet (no column for it yet)
- `scenarios` → preserved for future drift tracking

---

## Fair Value Update Policy
Only recompute when:
1. New ticker added with no existing valuation
2. Earnings release
3. Major technical structure change (breakout/breakdown)
4. Macro regime shift
5. New source materially changes the thesis

Stability > precision. Noisy daily updates destroy signal quality.
