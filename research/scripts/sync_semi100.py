"""
Semi-100 Sheet Sync: Insert new tickers + update existing ones.

This script:
1. Scans both sheets for existing tickers
2. Inserts 32 new semiconductor tickers into the US Watchlist
3. Updates fair price, verdict, and confidence for all 69 US-listed tickers
"""
from __future__ import annotations

import json
import sys
import time
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

VAULT = Path(__file__).resolve().parent.parent.parent / "vault"
FINANCIALS_DIR = VAULT / "data" / "financials"
VALUATIONS_DIR = VAULT / "data" / "valuations"

CREDS_DIR = Path.home() / ".config" / "alphaos"
TOKEN_FILE = CREDS_DIR / "token.json"
CREDS_FILE = CREDS_DIR / "credentials.json"
SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]

SHEET_IDS = {
    "us": "1HVEG6wtWsm68o3YMgznhhLrlENOARqF41kqrcbJlqq4",
    "india": "1ez7O6V_fK-7-s-QSgvZsiw2YJkhyYEi52K1L0rauuFM",
}

# ── Ticker → (tab, section, description) mapping for new insertions ──────────
# All these go into the US Watchlist "AI Stocks" tab
NEW_TICKERS = {
    # Semiconductors section
    'ACLS':  ('AI Stocks', 'Semiconductors', 'Ion implant equipment for SiC/Si power devices'),
    'ALGM':  ('AI Stocks', 'Semiconductors', 'Magnetic sensor ICs for automotive & industrial'),
    'AMBA':  ('AI Stocks', 'Semiconductors', 'AI vision SoCs for edge inference cameras'),
    'BESI':  ('AI Stocks', 'Semiconductors', 'Advanced die bonding equipment; HBM assembly play'),
    'COHU':  ('AI Stocks', 'Semiconductors', 'Semiconductor test & inspection equipment'),
    'CRUS':  ('AI Stocks', 'Semiconductors', 'Audio/voice codec ICs for Apple ecosystem'),
    'DIOD':  ('AI Stocks', 'Semiconductors', 'Discrete semiconductors & connectivity products'),
    'GFS':   ('AI Stocks', 'Semiconductors', 'Pure-play foundry; specialty & mature nodes'),
    'LSCC':  ('AI Stocks', 'Semiconductors', 'Low-power FPGAs for edge AI & industrial'),
    'MCHP':  ('AI Stocks', 'Semiconductors', 'MCUs, analog & FPGA ICs for embedded systems'),
    'NXPI':  ('AI Stocks', 'Semiconductors', 'Auto/industrial mixed-signal semiconductors'),
    'ONTO':  ('AI Stocks', 'Semiconductors', 'Process control & inspection for advanced nodes'),
    'SYNA':  ('AI Stocks', 'Semiconductors', 'Human-machine interface ICs; AI at the edge'),
    'UMC':   ('AI Stocks', 'Semiconductors', 'Mature-node foundry; specialty wafer fab'),
    'VECO':  ('AI Stocks', 'Semiconductors', 'Deposition equipment for LEDs, power devices, AR'),
    'PLAB':  ('AI Stocks', 'Semiconductors', 'Photomask manufacturing for IC & FPD lithography'),
    'UCTT':  ('AI Stocks', 'Semiconductors', 'Ultra-clean parts & chemical delivery for fabs'),
    
    # Equipment & materials section
    'MKSI':  ('AI Stocks', 'Semiconductors', 'Instruments & subsystems for advanced manufacturing'),
    'MTSI':  ('AI Stocks', 'Semiconductors', 'RF/microwave/millimeter-wave analog semis'),
    
    # Power & Grid
    'POWI':  ('AI Stocks', 'Power & Grid', 'High-efficiency AC-DC power conversion ICs'),
    'QRVO':  ('AI Stocks', 'Power & Grid', 'RF solutions for mobile, infrastructure, defense'),
    'SWKS':  ('AI Stocks', 'Power & Grid', 'RF front-end ICs for 5G connectivity'),
    'SLAB':  ('AI Stocks', 'Power & Grid', 'IoT wireless SoCs; timing & isolation products'),
    'IFNNY': ('AI Stocks', 'Power & Grid', 'Power semis, auto MCUs; #1 SiC MOSFET maker (ADR)'),
    
    # Storage / Memory / Data
    'SITM':  ('AI Stocks', 'Storage / Memory / Data', 'MEMS-based precision timing; silicon oscillators'),
    'OLED':  ('AI Stocks', 'Storage / Memory / Data', 'OLED technology licensor; organic emitter materials'),
    'PI':    ('AI Stocks', 'Storage / Memory / Data', 'RAIN RFID chips for IoT item intelligence'),
    
    # ADR / International
    'ATEYY': ('AI Stocks', 'Semiconductors', 'ATE leader for HBM, AI chip testing (Advantest ADR)'),
    'TOELY': ('AI Stocks', 'Semiconductors', 'Etch, deposition, coater/dev equipment (TEL ADR)'),
    'SMICY': ('AI Stocks', 'Semiconductors', 'China largest foundry; mature + 7nm nodes (SMIC ADR)'),
    
    # Renewable / Solar (not semiconductors core but in the list)
    'DQ':    ('High Growth', 'Renewable Energy', 'Polysilicon manufacturer for solar PV industry'),
    'FSLR':  ('High Growth', 'Renewable Energy', 'Thin-film CdTe solar module manufacturer'),
}


# ── Auth ──────────────────────────────────────────────────────────────────────

def get_credentials():
    from google.oauth2.credentials import Credentials
    from google_auth_oauthlib.flow import InstalledAppFlow
    from google.auth.transport.requests import Request

    creds = None
    if TOKEN_FILE.exists():
        creds = Credentials.from_authorized_user_file(str(TOKEN_FILE), SCOPES)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(str(CREDS_FILE), SCOPES)
            creds = flow.run_local_server(port=0)
        TOKEN_FILE.write_text(creds.to_json())
    return creds


# ── Helpers ──────────────────────────────────────────────────────────────────

VERDICT_MAP = {
    "STRONG BUY": "Strong Buy", "STRONGBUY": "Strong Buy", "STRONG_BUY": "Strong Buy",
    "BUY": "Buy", "WATCH": "Watch", "WAIT": "Watch",
    "HOLD": "Hold", "REDUCE": "Reduce", "AVOID": "Avoid",
}

CONFIDENCE_MAP = {
    "HIGH": "High", "MEDIUM": "Medium", "MED": "Medium", "LOW": "Low",
    "MEDIUM-HIGH": "High", "MED-HIGH": "High", "MEDIUM-LOW": "Low", "MED-LOW": "Low",
}


def normalize_verdict(v):
    if not v: return None
    return VERDICT_MAP.get(str(v).strip().upper(), str(v).strip())


def normalize_confidence(c):
    if not c: return None
    return CONFIDENCE_MAP.get(str(c).strip().upper(), str(c).strip())


def normalize_ticker(raw: str) -> str:
    t = raw.strip()
    for prefix in ("nse:", "NSE:", "BSE:", "bse:", "BOM:", "bom:"):
        if t.startswith(prefix):
            t = t[len(prefix):]
            break
    for suffix in (".NS", ".BO", ".ns", ".bo"):
        if t.endswith(suffix):
            t = t[:-len(suffix)]
            break
    return t.upper()


def load_valuation(ticker: str) -> dict | None:
    f = VALUATIONS_DIR / f"{ticker}.json"
    if f.exists():
        try:
            d = json.loads(f.read_text())
            if "weighted_fair_value" in d or "verdict" in d:
                return d
        except Exception:
            pass
    return None


def get_name(ticker: str) -> str:
    fin_file = FINANCIALS_DIR / f"{ticker}.json"
    if fin_file.exists():
        try:
            d = json.loads(fin_file.read_text())
            return d.get("name") or ticker
        except Exception:
            pass
    return ticker


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    import gspread

    # All 69 US-listed tickers from Semi 100
    ALL_US_SEMI = [
        'MXL','ICHR','FORM','RGTI','ENTG','NVDA','TSEM','AXTI','ON','AMKR','ASX','ARM',
        'SMTC','ADI','SITM','ALGM','TXN','MKSI','CRUS','FSLR','AEHR','STM','UMC','SYNA',
        'BESI','TSM','INTC','DIOD','NXPI','PI','MTSI','LRCX','NVMI','OLED','NVTS','MU',
        'ACLS','QCOM','ACMR','QRVO','ASML','CRDO','AMD','VECO','MPWR','AVGO','DQ','SLAB',
        'ALAB','IFNNY','AMBA','LSCC','PLAB','UCTT','GFS','MCHP','POWI','ATEYY','TOELY',
        'KLAC','MRVL','COHU','ONTO','SWKS','RMBS','AMAT','TER','ENPH','SMICY',
    ]

    print("=" * 70)
    print("SEMICONDUCTOR 100 — SHEET SYNC")
    print("=" * 70)

    # Connect to sheets
    print("\nConnecting to Google Sheets…")
    gc = gspread.authorize(get_credentials())
    us_ss = gc.open_by_key(SHEET_IDS["us"])
    india_ss = gc.open_by_key(SHEET_IDS["india"])

    # ── Step 1: Scan for existing tickers ──────────────────────────────────
    print("\nScanning US sheet for existing tickers…")
    existing = {}  # ticker -> (ws, row)
    
    for ws in us_ss.worksheets():
        ticker_vals = ws.col_values(2)  # Column B
        for i, val in enumerate(ticker_vals, start=1):
            if val.strip():
                norm = normalize_ticker(val)
                if norm and norm not in existing:
                    existing[norm] = (ws, i)
    
    print(f"  Found {len(existing)} tickers in US sheet")

    # Also scan India sheet for portfolio tabs
    india_existing = {}
    for ws in india_ss.worksheets():
        ticker_vals = ws.col_values(2)  # Column B
        for i, val in enumerate(ticker_vals, start=1):
            if val.strip():
                norm = normalize_ticker(val)
                if norm and norm not in india_existing:
                    india_existing[norm] = (ws, i)
    
    print(f"  Found {len(india_existing)} tickers in India sheet")

    # Split our tickers
    in_us_sheet = [t for t in ALL_US_SEMI if t in existing]
    need_insert = [t for t in ALL_US_SEMI if t not in existing and t not in india_existing]
    in_india_sheet = [t for t in ALL_US_SEMI if t in india_existing and t not in existing]

    print(f"\n  Already in US sheet: {len(in_us_sheet)}")
    print(f"  In India sheet: {len(in_india_sheet)}")
    print(f"  Need insertion: {len(need_insert)}")

    # ── Step 2: Insert new tickers ──────────────────────────────────────────
    print(f"\n── INSERTING {len(need_insert)} NEW TICKERS ──\n")

    # Group by (tab, section) for efficient batch insertion
    insertions_by_tab = {}
    for ticker in need_insert:
        if ticker in NEW_TICKERS:
            tab, section, desc = NEW_TICKERS[ticker]
        else:
            # Default: put in AI Stocks / Semiconductors
            tab, section = "AI Stocks", "Semiconductors"
            desc = ""
        
        key = (tab, section)
        if key not in insertions_by_tab:
            insertions_by_tab[key] = []
        
        name = get_name(ticker)
        val = load_valuation(ticker)
        fv = val.get("weighted_fair_value") if val else None
        verdict = normalize_verdict(val.get("verdict")) if val else None
        conf = normalize_confidence(val.get("confidence")) if val else None
        
        insertions_by_tab[key].append({
            'ticker': ticker,
            'name': name,
            'desc': desc,
            'fv': fv,
            'verdict': verdict,
            'confidence': conf,
        })

    inserted = 0
    for (tab_name, section), tickers_data in sorted(insertions_by_tab.items()):
        print(f"\n  [{tab_name}] / {section}:")
        
        try:
            ws = us_ss.worksheet(tab_name)
        except Exception:
            print(f"    ⚠️  Tab '{tab_name}' not found — using 'US Stock Watchlist'")
            ws = us_ss.worksheet("US Stock Watchlist")

        # Find section end row
        all_vals = ws.get_all_values()
        section_row = None
        insert_at = len(all_vals) + 1  # default: append at end
        
        for i, row in enumerate(all_vals):
            if row[0] and row[0].strip() == section and (len(row) < 2 or not row[1].strip()):
                section_row = i + 1
            elif section_row and row[0] and not row[1].strip():
                # Found next section header — insert before it
                insert_at = i + 1
                break
        else:
            if section_row:
                insert_at = len(all_vals) + 1

        for td in tickers_data:
            fv_str = f"FV=${td['fv']}" if td['fv'] else ""
            v_str = f"V={td['verdict']}" if td['verdict'] else ""
            c_str = f"C={td['confidence']}" if td['confidence'] else ""
            print(f"    + {td['ticker']:<10} {td['name'][:30]:<32} {fv_str:<14} {v_str:<12} {c_str}")

            # Insert row
            if insert_at > len(ws.get_all_values()):
                ws.add_rows(1)
                time.sleep(0.3)

            ws.insert_row([], insert_at)
            time.sleep(0.5)

            # Write ticker, name, description (cols B, C, D)
            ws.update(range_name=f"B{insert_at}:D{insert_at}",
                      values=[[td['ticker'], td['name'], td['desc']]])
            
            # Write fair value (col G), verdict (col I), confidence (col J)
            updates = []
            if td['fv'] is not None:
                updates.append({"range": f"G{insert_at}", "values": [[td['fv']]]})
            if td['verdict']:
                updates.append({"range": f"I{insert_at}", "values": [[td['verdict']]]})
            if td['confidence']:
                updates.append({"range": f"J{insert_at}", "values": [[td['confidence']]]})
            
            if updates:
                ws.batch_update(updates, value_input_option="USER_ENTERED")

            time.sleep(1.0)
            insert_at += 1
            inserted += 1

    print(f"\n  ✅ Inserted {inserted} new tickers")

    # ── Step 3: Update existing tickers ──────────────────────────────────────
    print(f"\n── UPDATING {len(in_us_sheet)} EXISTING TICKERS ──\n")

    updates_total = 0
    for ticker in in_us_sheet:
        val = load_valuation(ticker)
        if not val:
            continue

        ws, row = existing[ticker]
        fv = val.get("weighted_fair_value")
        verdict = normalize_verdict(val.get("verdict"))
        conf = normalize_confidence(val.get("confidence"))

        updates = []
        if fv is not None:
            updates.append({"range": f"G{row}", "values": [[fv]]})
        if verdict:
            updates.append({"range": f"I{row}", "values": [[verdict]]})
        if conf:
            updates.append({"range": f"J{row}", "values": [[conf]]})

        if updates:
            ws.batch_update(updates, value_input_option="USER_ENTERED")
            fv_s = f"FV=${fv}" if fv else ""
            v_s = f"V={verdict}" if verdict else ""
            c_s = f"C={conf}" if conf else ""
            print(f"  ✓ {ticker:<10} row={row:<5} {fv_s:<14} {v_s:<12} {c_s}")
            updates_total += len(updates)
            time.sleep(0.5)

    # ── Step 4: Update India sheet tickers (WAAREEENER) ──────────────────────
    if in_india_sheet:
        print(f"\n── UPDATING {len(in_india_sheet)} INDIA SHEET TICKERS ──\n")
        for ticker in in_india_sheet:
            val = load_valuation(ticker)
            if not val:
                continue
            ws, row = india_existing[ticker]
            fv = val.get("weighted_fair_value")
            verdict = normalize_verdict(val.get("verdict"))
            conf = normalize_confidence(val.get("confidence"))
            
            updates = []
            if fv is not None:
                updates.append({"range": f"F{row}", "values": [[fv]]})
            if verdict:
                updates.append({"range": f"H{row}", "values": [[verdict]]})
            if conf:
                updates.append({"range": f"I{row}", "values": [[conf]]})
            
            if updates:
                ws.batch_update(updates, value_input_option="USER_ENTERED")
                fv_s = f"FV=₹{fv}" if fv else ""
                v_s = f"V={verdict}" if verdict else ""
                c_s = f"C={conf}" if conf else ""
                print(f"  ✓ {ticker:<14} row={row:<5} {fv_s:<14} {v_s:<12} {c_s}")
                updates_total += len(updates)
                time.sleep(0.5)

    # ── Summary ──────────────────────────────────────────────────────────────
    print(f"\n{'═' * 70}")
    print(f"  SUMMARY")
    print(f"  Inserted: {inserted} new tickers into US Watchlist")
    print(f"  Updated:  {updates_total} cells across existing tickers")
    print(f"{'═' * 70}")


if __name__ == "__main__":
    main()
