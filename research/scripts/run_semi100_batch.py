"""
Batch runner for the Semiconductor 100 research list.
Processes all US-listed + ADR tickers, plus non-US exchange tickers.
"""
from __future__ import annotations
import json
import time
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from run_valuations_batch import fetch_financials, generate_valuation, FINANCIALS_DIR, VALUATIONS_DIR

# ── All 100 semiconductor tickers mapped to yfinance symbols ──────────────────

# US-listed tickers (direct + ADRs)
US_SEMI = [
    'MXL',      # MaxLinear
    'ICHR',     # Ichor Holdings
    'FORM',     # FormFactor
    'RGTI',     # Rigetti Computing
    'ENTG',     # Entegris
    'NVDA',     # NVIDIA
    'TSEM',     # Tower Semiconductor
    'AXTI',     # AXT, Inc.
    'ON',       # ON Semiconductor
    'AMKR',     # Amkor Technology
    'ASX',      # ASE Technology
    'ARM',      # Arm Holdings
    'SMTC',     # Semtech
    'ADI',      # Analog Devices
    'SITM',     # SiTime
    'ALGM',     # Allegro MicroSystems
    'TXN',      # Texas Instruments
    'MKSI',     # MKS Instruments
    'CRUS',     # Cirrus Logic
    'FSLR',     # First Solar
    'AEHR',     # Aehr Test Systems
    'STM',      # STMicroelectronics
    'UMC',      # United Microelectronics
    'SYNA',     # Synaptics
    'BESI',     # BE Semiconductor Industries
    'TSM',      # TSMC
    'INTC',     # Intel
    'DIOD',     # Diodes Incorporated
    'NXPI',     # NXP Semiconductors
    'PI',       # Impinj
    'MTSI',     # MACOM Technology Solutions
    'LRCX',     # Lam Research
    'NVMI',     # Nova Ltd.
    'OLED',     # Universal Display
    'NVTS',     # Navitas Semiconductor
    'MU',       # Micron Technology
    'ACLS',     # Axcelis Technologies
    'QCOM',     # Qualcomm
    'ACMR',     # ACM Research
    'QRVO',     # Qorvo
    'ASML',     # ASML
    'CRDO',     # Credo Technology
    'AMD',      # AMD
    'VECO',     # Veeco Instruments
    'MPWR',     # Monolithic Power Systems
    'AVGO',     # Broadcom
    'DQ',       # Daqo New Energy
    'SLAB',     # Silicon Laboratories
    'ALAB',     # Astera Labs
    'IFNNY',    # Infineon Technologies (ADR)
    'AMBA',     # Ambarella
    'LSCC',     # Lattice Semiconductor
    'PLAB',     # Photronics
    'UCTT',     # Ultra Clean Holdings
    'GFS',      # GlobalFoundries
    'MCHP',     # Microchip Technology
    'POWI',     # Power Integrations
    'ATEYY',    # Advantest (ADR)
    'TOELY',    # Tokyo Electron (ADR)
    'KLAC',     # KLA Corporation
    'MRVL',     # Marvell Technology
    'COHU',     # Cohu, Inc.
    'ONTO',     # Onto Innovation
    'SWKS',     # Skyworks Solutions
    'RMBS',     # Rambus
    'AMAT',     # Applied Materials
    'TER',      # Teradyne
    'ENPH',     # Enphase Energy
    'SMICY',    # SMIC (ADR)
]

# Non-US exchange tickers (need special yfinance symbols)
FOREIGN_SEMI = {
    'SKHYNIX':   {'yf': '000660.KS', 'name': 'SK hynix',              'region': 'kr'},
    'HUAHONG':   {'yf': '1347.HK',   'name': 'Hua Hong Semiconductor','region': 'hk'},
    'DISCO':     {'yf': '6146.T',    'name': 'Disco Corp',            'region': 'jp'},
    'NOVATEK':   {'yf': '3034.TW',   'name': 'Novatek Microelectronics','region': 'tw'},
    'MEDIATEK':  {'yf': '2454.TW',   'name': 'MediaTek',              'region': 'tw'},
    'RENESAS':   {'yf': '6723.T',    'name': 'Renesas Electronics',    'region': 'jp'},
    'REALTEK':   {'yf': '2379.TW',   'name': 'Realtek Semiconductor',  'region': 'tw'},
    'MELEXIS':   {'yf': 'MELE.BR',   'name': 'Melexis',               'region': 'eu'},
    'TECHNOPROBE':{'yf': 'TPRO.MI',  'name': 'Technoprobe',           'region': 'eu'},
    'LASERTEC':  {'yf': '6920.T',    'name': 'Lasertec',              'region': 'jp'},
    'ALCHIP':    {'yf': '3661.TW',   'name': 'Alchip Technologies',   'region': 'tw'},
}

# Chinese A-shares (via yfinance)
CHINA_SEMI = {
    'AMEC':      {'yf': '688012.SS', 'name': 'AMEC',                  'region': 'cn'},
    'CRMICRO':   {'yf': '688396.SS', 'name': 'CR Micro',              'region': 'cn'},
    'CAMBRICON': {'yf': '688256.SS', 'name': 'Cambricon Technologies','region': 'cn'},
    'GIGADEVICE':{'yf': '603986.SS', 'name': 'GigaDevice Semiconductor','region': 'cn'},
    'HYGON':     {'yf': '688041.SS', 'name': 'Hygon',                 'region': 'cn'},
    'JCET':      {'yf': '600584.SS', 'name': 'JCET Group',            'region': 'cn'},
    'KIOXIA':    {'yf': '285A.T',    'name': 'Kioxia',                'region': 'jp'},
    'LONGI':     {'yf': '601012.SS', 'name': 'LONGi Green Energy',    'region': 'cn'},
    'MONTAGE':   {'yf': '688008.SS', 'name': 'Montage Technology',    'region': 'cn'},
    'NAURA':     {'yf': '002371.SZ', 'name': 'NAURA Technology Group','region': 'cn'},
    'ROCKCHIP':  {'yf': '603893.SS', 'name': 'Rockchip',              'region': 'cn'},
    'SANAN':     {'yf': '600703.SS', 'name': 'Sanan Optoelectronics', 'region': 'cn'},
    'TONGWEI':   {'yf': '600438.SS', 'name': 'Tongwei',               'region': 'cn'},
}

import yfinance as yf


def fetch_foreign(ticker_key: str, info: dict) -> dict:
    """Fetch financials for a foreign-exchange ticker."""
    sym = info['yf']
    try:
        t = yf.Ticker(sym)
        data = t.info
        if not data or (data.get('regularMarketPrice') is None and data.get('currentPrice') is None):
            return {"ticker": ticker_key, "yf_symbol": sym, "error": "no data"}

        rev_growth_3y = None
        try:
            fin = t.financials
            if fin is not None and not fin.empty and "Total Revenue" in fin.index:
                rev = fin.loc["Total Revenue"].dropna()
                if len(rev) >= 2:
                    rev_growth_3y = round(
                        (float(rev.iloc[0]) / float(rev.iloc[-1])) ** (1 / max(len(rev) - 1, 1)) - 1, 4
                    ) * 100
        except Exception:
            pass

        return {
            "ticker": ticker_key,
            "yf_symbol": sym,
            "name": info.get('name') or data.get("shortName") or data.get("longName"),
            "sector": data.get("sector"),
            "industry": data.get("industry"),
            "currency": data.get("currency"),
            "price": data.get("currentPrice") or data.get("regularMarketPrice"),
            "market_cap": data.get("marketCap"),
            "revenue_growth_3y": rev_growth_3y,
            "gross_margin": round(data.get("grossMargins", 0) * 100, 1) if data.get("grossMargins") else None,
            "operating_margin": round(data.get("operatingMargins", 0) * 100, 1) if data.get("operatingMargins") else None,
            "roe": round(data.get("returnOnEquity", 0) * 100, 1) if data.get("returnOnEquity") else None,
            "debt_to_equity": data.get("debtToEquity"),
            "pe": data.get("trailingPE"),
            "pe_forward": data.get("forwardPE"),
            "eps_ttm": round(data.get("trailingEps"), 4) if data.get("trailingEps") else None,
            "eps_forward": round(data.get("forwardEps"), 4) if data.get("forwardEps") else None,
            "book_value": data.get("bookValue"),
            "revenue_ttm": data.get("totalRevenue"),
            "52w_high": data.get("fiftyTwoWeekHigh"),
            "52w_low": data.get("fiftyTwoWeekLow"),
            "analyst_target": data.get("targetMeanPrice"),
        }
    except Exception as e:
        return {"ticker": ticker_key, "yf_symbol": sym, "error": str(e)}


def process_us_ticker(ticker: str) -> str:
    """Process a US-listed ticker: fetch financials + generate valuation."""
    fin_file = FINANCIALS_DIR / f"{ticker}.json"
    val_file = VALUATIONS_DIR / f"{ticker}.json"

    # Always force-refresh
    fin = fetch_financials(ticker, "us")
    fin_file.write_text(json.dumps(fin, indent=2))

    if "error" in fin:
        return f"ERR fin: {fin['error'][:60]}"

    val = generate_valuation(fin, "us")
    if not val:
        return "ERR: no price data"

    val_file.write_text(json.dumps(val, indent=2))
    return f"{val['verdict']:<5} FV=${val['weighted_fair_value']:<10} ({val['upside_pct']:+.1f}%)  conf={val['confidence']}"


def process_foreign_ticker(ticker_key: str, info: dict) -> str:
    """Process a foreign-exchange ticker."""
    fin_file = FINANCIALS_DIR / f"{ticker_key}.json"
    val_file = VALUATIONS_DIR / f"{ticker_key}.json"

    fin = fetch_foreign(ticker_key, info)
    fin_file.write_text(json.dumps(fin, indent=2))

    if "error" in fin:
        return f"ERR fin: {fin['error'][:60]}"

    # Use 'us' region for valuation math (currency will be from yfinance)
    val = generate_valuation(fin, "us")
    if not val:
        return "ERR: no price data"

    val['region'] = info['region']
    val_file.write_text(json.dumps(val, indent=2))
    c = val.get('currency', 'USD')
    return f"{val['verdict']:<5} FV={c} {val['weighted_fair_value']:<10} ({val['upside_pct']:+.1f}%)  conf={val['confidence']}"


def main():
    ok = err = 0

    print("=" * 70)
    print("SEMICONDUCTOR 100 — BATCH VALUATION")
    print("=" * 70)

    # Phase 1: US-listed tickers
    print(f"\n── US-Listed Tickers ({len(US_SEMI)}) ──\n")
    for ticker in US_SEMI:
        print(f"  {ticker:<14} ", end="", flush=True)
        result = process_us_ticker(ticker)
        print(result)
        if result.startswith("ERR"):
            err += 1
        else:
            ok += 1
        time.sleep(0.3)

    # Phase 2: Non-US exchange tickers
    all_foreign = {**FOREIGN_SEMI, **CHINA_SEMI}
    print(f"\n── Foreign Exchange Tickers ({len(all_foreign)}) ──\n")
    for key, info in all_foreign.items():
        print(f"  {key:<16} [{info['yf']:<12}] ", end="", flush=True)
        result = process_foreign_ticker(key, info)
        print(result)
        if result.startswith("ERR"):
            err += 1
        else:
            ok += 1
        time.sleep(0.5)

    print(f"\n{'─' * 70}")
    print(f"  Total: {ok + err}  |  OK: {ok}  |  Errors: {err}")
    print(f"  Valuations dir: vault/data/valuations/")


if __name__ == "__main__":
    main()
