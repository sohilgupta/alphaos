# AlphaOS Shared Schema

Single source of truth for the contract between **research** (writes Google
Sheets) and **dashboard** (reads Google Sheets). When you change anything here,
update the corresponding parser/writer on both sides.

---

## Sheets

| Sheet | ID | Region |
|-------|----|--------|
| US Watchlist | `1HVEG6wtWsm68o3YMgznhhLrlENOARqF41kqrcbJlqq4` | US / Global |
| India Watchlist | `1ez7O6V_fK-7-s-QSgvZsiw2YJkhyYEi52K1L0rauuFM` | India (NSE/BSE) |

---

## Column maps

### US sheet
| Col | Field        | Written by    | Read by        |
|-----|--------------|---------------|----------------|
| A   | Category     | (header rows) | dashboard      |
| B   | Stock Code   | research      | dashboard      |
| C   | Name         | research      | dashboard      |
| D   | Description  | research      | dashboard      |
| E   | Market Cap   | sheet auto    | dashboard      |
| F   | Current Price| sheet auto    | dashboard      |
| G   | Fair Price   | research      | dashboard      |
| H   | Potential %  | sheet formula | dashboard      |
| I   | **Verdict**  | research      | dashboard      |
| J   | **Confidence**| research     | dashboard      |
| K+  | Gain cols    | sheet formula | dashboard      |

### India sheet
| Col | Field         | Written by    | Read by        |
|-----|---------------|---------------|----------------|
| A   | Stock (name)  | research      | dashboard      |
| B   | Stock Code    | research      | dashboard      |
| C   | Date          | research      | dashboard      |
| D   | Price (entry) | research      | dashboard      |
| E   | Current Price | sheet auto    | dashboard      |
| F   | Fair price    | research      | dashboard      |
| G   | Potential     | sheet formula | dashboard      |
| H   | **Verdict**   | research      | dashboard      |
| I   | **Confidence**| research      | dashboard      |
| J   | CAGR          | sheet formula | dashboard      |
| K+  | Gain cols     | sheet formula | dashboard      |

---

## Ticker formats

| Region | Source format         | Dashboard normalises to |
|--------|------------------------|--------------------------|
| US     | `AAPL`                 | `AAPL`                   |
| India NSE | `nse:HAL` / `NSE:HAL` | `HAL.NS`                 |
| India BSE | `BOM:534618`         | `534618.BO`              |
| Bare 6-digit India | `534618`     | `534618.BO`              |

See `dashboard/lib/fetchIndianStocks.ts:normalizeIndianTicker` and
`research/scripts/update_sheet_valuations.py:normalize_ticker`.

---

## Verdict (canonical values)

| Value        | Dashboard color | Notes |
|--------------|-----------------|-------|
| `Strong Buy` | emerald | high conviction |
| `Buy`        | teal    | positive thesis |
| `Watch`      | yellow  | waiting for catalyst (legacy alias `Wait`) |
| `Hold`       | zinc    | fairly valued |
| `Reduce`     | orange  | trim exposure |
| `Avoid`      | red     | negative thesis |

Research normalises uppercase / synonyms at write time
(`update_sheet_valuations.py:VERDICT_MAP`). Dashboard parser is
case-insensitive as a safety net (`dashboard/lib/google-sheets.ts`,
`dashboard/lib/fetchIndianStocks.ts`).

## Confidence (canonical values)

| Value    | Dashboard meter |
|----------|-----------------|
| `High`   | full bar (emerald) |
| `Medium` | 2/3 bar (yellow) |
| `Low`    | 1/3 bar (red) |

Legacy `Medium-High` rounds up to `High`; `Medium-Low` rounds down to `Low`.

---

## Where to update what

| Change | Update |
|--------|--------|
| Add a new verdict value | `SHEET_RULES.md` + `update_sheet_valuations.py:VERDICT_MAP` + `dashboard/lib/types.ts:Verdict` + `dashboard/components/dashboard/StockTable.tsx:VC` |
| Add a new column to a sheet | This file + `update_sheet_valuations.py:SHEETS` + the dashboard parser for that sheet (`google-sheets.ts` for US, `fetchIndianStocks.ts` for India) |
| Change ticker normalisation | `update_sheet_valuations.py:normalize_ticker` + `dashboard/lib/fetchIndianStocks.ts:normalizeIndianTicker` + this file |
