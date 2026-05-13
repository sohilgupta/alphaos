"""
Batch valuation pipeline: fetch financials → generate quant valuations → ready for sheet update.

Usage:
    python scripts/run_valuations_batch.py                   # all missing
    python scripts/run_valuations_batch.py --region us
    python scripts/run_valuations_batch.py --region india
    python scripts/run_valuations_batch.py --ticker SMCI
    python scripts/run_valuations_batch.py --force           # regenerate even if exists
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import date
from pathlib import Path

import yfinance as yf

VAULT = Path(__file__).resolve().parent.parent.parent / "vault"
FINANCIALS_DIR = VAULT / "data" / "financials"
VALUATIONS_DIR = VAULT / "data" / "valuations"

sys.path.insert(0, str(Path(__file__).resolve().parent))
from detect_region import detect_region

FINANCIALS_DIR.mkdir(parents=True, exist_ok=True)
VALUATIONS_DIR.mkdir(parents=True, exist_ok=True)

# All watchlist tickers across US and India sheets
US_TICKERS = [
    'AAOI','ABAT','ACHR','ACLS','ACMR','ADI','AEHR','AEVA','ALAB','ALGM','ALB','AMAT',
    'AMBA','AMD','AMKR','AMPX','AMRK','AMT','AMZN','ANET','ANSS','APD','APH','APLD',
    'APP','AREC','ARKX','ARM','ARR','ASML','ASPI','ASTS','ASX','ATEYY','ATS','AVAV',
    'AVGO','AXTI','BA','BE','BESI','BETR','BITF','BKKT','BKSY','BLDP','BMNR','BWXT',
    'CAMT','CAR','CCJ','CDNS','CDTX','CEG','CELC','CGNX','CIEN','CIFR','COHR','COHU',
    'COIN','CRDO','CRML','CRS','CRUS','CRWV','CSCO','DDOG','DE','DELL','DIOD','DLR',
    'DQ','DRS','ENR','ENS','ENTG','EOSE','EQIX','ESLT','ETN','FARO','FCX','FIGR','FIX',
    'FLEX','FLNC','FN','FORM','FSLR','FTAI','GD','GEV','GFS','GLW','GOOGL','HON','HOOD',
    'HPQ','HSAI','HUT','HXL','ICHR','IDR','IFNNY','INOD','INTC','INVZ','IONQ','IRDM',
    'IREN','ISRG','JBL','JOBY','KEYS','KLAC','KOD','KRMN','KTOS','LAC','LAR','LAZR',
    'LECO','LEU','LHX','LIDR','LIN','LITE','LMT','LPTH','LRCX','LSCC','LTBR','LTRX',
    'LUNR','LWLG','MBLY','MCHP','MDB','MDT','METC','MIR','MKSI','MOD','MP','MPOW',
    'MPWR','MRCY','MRVL','MSTR','MTSI','MTZ','MU','MVST','MXL','NB','NBIS','NET','NNE',
    'NOC','NOK','NTAP','NU','NVDA','NVMI','NVTS','NXE','NXPI','OII','OKLO','OLED','OMCL',
    'ON','ONDS','ONTO','OPEN','OPTX','ORCL','OSCR','OUST','PANW','PATH','PDYN','PEGA',
    'PI','PL','PLTR','PLAB','PONY','POWL','POWI','PPL','PPTA','PRCT','PRME','PSIX','PTC',
    'PWR','QBTS','QCOM','QS','QRVO','QUBT','RCAT','RDDT','RDW','REEMF','RGTI','RIOT',
    'RKLB','RKT','RMBS','ROK','RTX','SATL','SATS','SEI','SERV','SGML','SITM','SKYT',
    'SLAB','SLI','SMCI','SMICY','SMR','SMTC','SNDK','SNOW','SNPS','SOFI','STM','STX',
    'SWKS','SYK','SYM','SYNA','TDY','TEAM','TER','TLN','TMC','TMQ','TMRC','TNGX','TOELY',
    'TOWCF','TSEM','TSLA','TSM','TXN','TXT','UAMY','UAVS','UCTT','UEC','UFO','UI','UMAC',
    'UMC','URC','UROY','USAR','UUUU','VECO','VICR','VMI','VOYG','VRT','VSAT','VST','WDC',
    'WPM','WULF','WYFI','ZBRA','ZETA',
]

INDIA_TICKERS = [
    'ACE','ALKYLAMINE','ALLCARGO','ANANDRATHI','ANANTRAJ','APARINDS','APLAPOLLO','APOLLO',
    'ARIES','ASHOKA','ASTRAL','ASTRAMICRO','AURIONPRO','AVADHSUGAR','AVTNPL','BBL','BBOX',
    'BCLIND','BDL','BECTORFOOD','BEL','BEML','BHARATFORG','BHARATGEAR','BLS','BRIGADE',
    'BSE','CAPACITE','CHOICEIN','COCHINSHIP','CONCOR','CONFIPET','CUBEXTUB','DATAPATTNS',
    'DCMSHRIRAM','DEEPAKFERT','DEEPAKNTR','DEVYANI','DLF','DMART','DWARKESH','DYCL','E2E',
    'EIHOTEL','EIMCOELECO','ELGIEQUIP','EMIL','ENDURANCE','EQUITASBNK','ESTER','ETHOSLTD',
    'FCL','FIEMIND','FLUOROCHEM','FORCEMOT','GAIL','GANESHBE','GEEKAYWIRE','GENSOL',
    'GODREJPROP','GRSE','HAL','HBLPOWER','HGINFRA','HINDALCO','HINDCOPPER','HINDZINC',
    'HPL','HSCL','IDFCFIRSTB','IEL','INDUSTOWER','INTERARCH','JAIPURKURT','JBMA',
    'JSWSTEEL','JTLIND','JWL','KEI','KFINTECH','KHAICHEM','KOLTEPATIL','KPIGREEN',
    'KPRMILL','KRISHNADEF','LIKHITHA','LLOYDSME','LODHA','LT','LTFOODS','MANAKALUCO',
    'MANYAVAR','MAZDOCK','MCL','MICEL','MOLDTKPAC','MOTHERSON','NATIONALUM','NAVA',
    'NAVKARCORP','NCLIND','NETWEB','NMDC','NUVAMA','OBEROIRLTY','OLAELEC','OLECTRA',
    'PAKKA','PARADEEP','PARAS','PARSVNATH','PHOENIXLTD','PIXTRANS','POLYCAB','POLYPLEX',
    'PRAJIND','PREMIERENE','PRESTIGE','PVSL','RADHIKAJWE','RADICO','RAILTEL','RAJESHEXPO',
    'RAJSREESUG','RANASUG','ROLEXRINGS','RTNINDIA','SAFARI','SBIN','SCI','SIGNATURE',
    'SKIPPER','SMLMAH','SNOWMAN','SOBHA','SOLARINDS','SONACOMS','SRF','SRHHYPOLTD',
    'SUNCLAY','SUPRAJIT','SUZLON','SYMPHONY','TALBROAUTO','TCPLPACK','TECHNOE','TEJASNET',
    'TIINDIA','TIMETECHNO','TITAGARH','TORNTPOWER','TRIVENI','TVSMOTOR','UBL','UFO',
    'UGARSUGAR','UJJIVANSFB','UNITDSPR','UTTAMSUGAR','VAIBHAVGBL','VBL','VEDL','VGUARD',
    'WAAREEENER','YESBANK','ZENSARTECH','ZENTEC','ZODIAC',
]

# NSE symbol overrides (ticker in our system → actual NSE trading symbol)
NSE_OVERRIDES = {
    'APOLLOMICRO': 'APOLLO',
    'WAAREE': 'WAAREEENER',
}


def yf_symbol(ticker: str, region: str) -> str:
    sym = NSE_OVERRIDES.get(ticker, ticker)
    return f"{sym}.NS" if region == "india" else sym


def fetch_financials(ticker: str, region: str) -> dict:
    sym = yf_symbol(ticker, region)
    try:
        t = yf.Ticker(sym)
        info = t.info
        if not info or info.get('regularMarketPrice') is None and info.get('currentPrice') is None:
            return {"ticker": ticker, "yf_symbol": sym, "error": "no data"}

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

        eps_ttm = None
        eps_fwd = None
        try:
            eps_ttm = info.get("trailingEps")
            eps_fwd = info.get("forwardEps")
        except Exception:
            pass

        return {
            "ticker": ticker,
            "yf_symbol": sym,
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
            "eps_ttm": round(eps_ttm, 4) if eps_ttm else None,
            "eps_forward": round(eps_fwd, 4) if eps_fwd else None,
            "book_value": info.get("bookValue"),
            "revenue_ttm": info.get("totalRevenue"),
            "52w_high": info.get("fiftyTwoWeekHigh"),
            "52w_low": info.get("fiftyTwoWeekLow"),
            "price_vs_52w_high_pct": round(
                (info.get("currentPrice", 0) / info.get("fiftyTwoWeekHigh", 1) - 1) * 100, 1
            ) if info.get("fiftyTwoWeekHigh") else None,
            "analyst_target": info.get("targetMeanPrice"),
        }
    except Exception as e:
        return {"ticker": ticker, "yf_symbol": sym, "error": str(e)}


def generate_valuation(fin: dict, region: str) -> dict | None:
    """Quantitative valuation model using financial ratios."""
    ticker = fin["ticker"]
    current = fin.get("price")
    if not current or current <= 0:
        return None

    currency = fin.get("currency") or ("INR" if region == "india" else "USD")
    analyst_target = fin.get("analyst_target")
    pe_fwd = fin.get("pe_forward")
    pe_ttm = fin.get("pe")
    eps_fwd = fin.get("eps_forward")
    eps_ttm = fin.get("eps_ttm")
    rev_growth = fin.get("revenue_growth_3y") or 0
    op_margin = fin.get("operating_margin") or 0

    # ── Base fair value ──────────────────────────────────────────────────────
    # Priority: analyst_target → fwd PE × fwd EPS → TTM PE rerating → growth-adjusted
    base_rationale = ""

    if analyst_target and analyst_target > 0:
        base_fv = analyst_target
        base_rationale = f"analyst consensus target ${analyst_target:.0f}" if region == "us" else f"analyst target ₹{analyst_target:.0f}"
        confidence = "Medium"
    elif pe_fwd and eps_fwd and pe_fwd > 0 and eps_fwd > 0:
        base_fv = pe_fwd * eps_fwd
        base_rationale = f"{pe_fwd:.1f}x fwd EPS {eps_fwd:.2f}"
        confidence = "Medium"
    elif pe_ttm and eps_ttm and pe_ttm > 0 and eps_ttm > 0:
        # Slight multiple expansion for growth companies
        adj_pe = pe_ttm * (1 + min(rev_growth / 200, 0.1))
        base_fv = adj_pe * eps_ttm
        base_rationale = f"{adj_pe:.1f}x TTM EPS {eps_ttm:.2f}"
        confidence = "Low"
    else:
        # Last resort: growth-adjusted current price
        adj = 1 + min(max(rev_growth, 0) / 100 * 0.25, 0.20)
        base_fv = current * adj
        base_rationale = f"growth-adj ({rev_growth:.0f}% rev CAGR)" if rev_growth else "no earnings data, growth-adj"
        confidence = "Low"

    base_fv = round(base_fv, 2)

    # ── Bull / Bear scenarios ─────────────────────────────────────────────────
    # Bull: multiple expansion + beat (typically +25-35%)
    # Bear: de-rating + miss (typically -30-35%)
    growth_bonus = min(max(rev_growth / 100, 0), 0.10)
    bull_mult = 1.30 + growth_bonus
    bear_mult = 0.68 - (0 if op_margin > 0 else 0.05)

    bull_fv = round(base_fv * bull_mult, 2)
    bear_fv = round(max(base_fv * bear_mult, current * 0.30), 2)

    # Scenario probabilities: skew to bull if strong growth, bear if no earnings
    if rev_growth > 20 and op_margin > 10:
        probs = (0.30, 0.50, 0.20)
    elif rev_growth < 0 or (not eps_ttm and not eps_fwd):
        probs = (0.20, 0.45, 0.35)
    else:
        probs = (0.25, 0.50, 0.25)

    wfv = round(probs[0] * bull_fv + probs[1] * base_fv + probs[2] * bear_fv, 2)
    upside = round((wfv / current - 1) * 100, 1)

    # ── Verdict ───────────────────────────────────────────────────────────────
    if upside >= 25:
        verdict = "BUY"
    elif upside >= 8:
        verdict = "WATCH"
    elif upside >= -10:
        verdict = "HOLD"
    else:
        verdict = "AVOID"

    # Confidence bump if analyst target validates our range
    if analyst_target and abs(analyst_target / base_fv - 1) < 0.12:
        if confidence == "Low":
            confidence = "Medium"

    # Short thesis
    name = fin.get("name") or ticker
    sym = fin.get("sector") or fin.get("industry") or ""
    thesis_parts = [f"{name} ({sym})."] if sym else [f"{name}."]
    if analyst_target:
        sym_c = "$" if region == "us" else "₹"
        thesis_parts.append(f"Analyst target {sym_c}{analyst_target:.0f}.")
    if rev_growth:
        thesis_parts.append(f"Rev CAGR {rev_growth:.1f}%.")
    if op_margin:
        thesis_parts.append(f"Op margin {op_margin:.1f}%.")
    thesis_parts.append(f"{upside:+.1f}% upside to weighted FV.")

    sym_c = "$" if region == "us" else "₹"
    return {
        "ticker": ticker,
        "region": region,
        "currency": currency,
        "generated_at": str(date.today()),
        "current_price": round(current, 2),
        "scenarios": {
            "bull": {
                "price": bull_fv,
                "probability": probs[0],
                "rationale": f"multiple expansion on beat; {bull_mult:.2f}x base",
            },
            "base": {
                "price": base_fv,
                "probability": probs[1],
                "rationale": base_rationale,
            },
            "bear": {
                "price": bear_fv,
                "probability": probs[2],
                "rationale": f"de-rating on miss; {bear_mult:.2f}x base",
            },
        },
        "weighted_fair_value": wfv,
        "upside_pct": upside,
        "confidence": confidence,
        "verdict": verdict,
        "thesis": " ".join(thesis_parts),
    }


def process_ticker(ticker: str, region: str, force: bool = False) -> str:
    fin_file = FINANCIALS_DIR / f"{ticker}.json"
    val_file = VALUATIONS_DIR / f"{ticker}.json"

    # Load or fetch financials
    if fin_file.exists() and not force:
        fin = json.loads(fin_file.read_text())
        if "error" in fin:
            fin = fetch_financials(ticker, region)
            fin_file.write_text(json.dumps(fin, indent=2))
    else:
        fin = fetch_financials(ticker, region)
        fin_file.write_text(json.dumps(fin, indent=2))

    if "error" in fin:
        return f"ERR fin: {fin['error'][:60]}"

    # Skip if valuation already exists (unless force)
    if val_file.exists() and not force:
        val = json.loads(val_file.read_text())
        if "error" not in val and val.get("weighted_fair_value"):
            return f"skip (val exists: {val['verdict']} FV={val['weighted_fair_value']})"

    val = generate_valuation(fin, region)
    if not val:
        return "ERR: no price data"

    val_file.write_text(json.dumps(val, indent=2))
    c = "$" if region == "us" else "₹"
    return f"{val['verdict']:<5} FV={c}{val['weighted_fair_value']:<10} ({val['upside_pct']:+.1f}%)  conf={val['confidence']}"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--region", choices=["us", "india"])
    parser.add_argument("--ticker")
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    if args.ticker:
        t = args.ticker.upper()
        region = args.region or detect_region(t)
        print(f"  {t:<14} [{region}] ", end="", flush=True)
        result = process_ticker(t, region, args.force)
        print(result)
        return

    pairs = []
    if not args.region or args.region == "us":
        pairs += [(t, "us") for t in US_TICKERS]
    if not args.region or args.region == "india":
        pairs += [(t, "india") for t in INDIA_TICKERS]

    ok = err = skipped = 0
    for ticker, region in pairs:
        print(f"  {ticker:<16} [{region}] ", end="", flush=True)
        result = process_ticker(ticker, region, args.force)
        print(result)
        if result.startswith("ERR"):
            err += 1
        elif result.startswith("skip"):
            skipped += 1
        else:
            ok += 1
        time.sleep(0.3)

    print(f"\n{'─'*60}")
    print(f"  Generated: {ok}  Skipped: {skipped}  Errors: {err}")
    print(f"  → {VALUATIONS_DIR.relative_to(VAULT)}/")


if __name__ == "__main__":
    main()
