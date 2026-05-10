"""
Layer 1: Fetch price history + TradingView technical analysis per ticker.

- Price history / chart PNG  : yfinance (OHLCV series, MA lines rendered visually)
- Technical indicators       : tradingview-ta  (RSI, MACD, ADX, Stoch, BB, pivots,
                               signal counts — same values traders see on TradingView)

Saves:
  /data/technicals/{TICKER}.json  — price metadata + full TradingView indicator set
  /data/technicals/{TICKER}.png   — price chart with MA overlays
"""
import json
import sys
from datetime import datetime, timedelta
from pathlib import Path

import yfinance as yf

VAULT = Path(__file__).resolve().parent.parent.parent / "vault"
IN_FILE = VAULT / "processed" / "stocks" / "extracted_tickers.json"
OUT_DIR = VAULT / "data" / "technicals"

sys.path.insert(0, str(Path(__file__).resolve().parent))
from detect_region import detect_region

LOOKBACK_DAYS = 365

# Exchange probe order for US tickers
US_EXCHANGES = ("NASDAQ", "NYSE", "AMEX", "OTC")


def yf_symbol(ticker: str) -> str:
    return f"{ticker}.NS" if detect_region(ticker) == "india" else ticker


# ── TradingView indicators ────────────────────────────────────────────────────

def fetch_tradingview_ta(ticker: str, region: str) -> dict:
    """
    Fetch technical indicators from TradingView via tradingview-ta.
    Returns a dict of indicator values, or {"error": ...} on failure.
    """
    try:
        from tradingview_ta import TA_Handler, Interval

        interval = Interval.INTERVAL_1_DAY

        if region == "india":
            handler = TA_Handler(
                symbol=ticker,
                screener="india",
                exchange="NSE",
                interval=interval,
            )
            analysis = handler.get_analysis()
        else:
            # Probe exchanges in order; stop at first success
            analysis = None
            last_err = ""
            for exchange in US_EXCHANGES:
                try:
                    h = TA_Handler(
                        symbol=ticker,
                        screener="america",
                        exchange=exchange,
                        interval=interval,
                    )
                    analysis = h.get_analysis()
                    break
                except Exception as e:
                    last_err = str(e)
                    continue
            if analysis is None:
                return {"error": f"not found on any exchange — {last_err}"}

        ind = analysis.indicators
        summary = analysis.summary
        osc = analysis.oscillators
        mas = analysis.moving_averages

        def safe(key, decimals=2):
            v = ind.get(key)
            if v is None:
                return None
            try:
                return round(float(v), decimals)
            except (TypeError, ValueError):
                return None

        return {
            # ── Overall TradingView signal ───────────────────────────────
            "tv_recommendation":     summary.get("RECOMMENDATION"),
            "tv_buy":                summary.get("BUY"),
            "tv_sell":               summary.get("SELL"),
            "tv_neutral":            summary.get("NEUTRAL"),
            "tv_ma_recommendation":  mas.get("RECOMMENDATION"),
            "tv_osc_recommendation": osc.get("RECOMMENDATION"),

            # ── Oscillators ──────────────────────────────────────────────
            "rsi_14":       safe("RSI", 1),
            "macd":         safe("MACD.macd", 3),
            "macd_signal":  safe("MACD.signal", 3),
            "adx":          safe("ADX", 1),
            "adx_plus_di":  safe("ADX+DI", 1),
            "adx_minus_di": safe("ADX-DI", 1),
            "stoch_k":      safe("Stoch.K", 1),
            "stoch_d":      safe("Stoch.D", 1),
            "cci_20":       safe("CCI20", 1),
            "williams_r":   safe("W.R", 1),
            "ao":           safe("AO", 2),
            "momentum":     safe("Mom", 2),

            # ── Moving averages (TradingView values) ─────────────────────
            "ema_10":  safe("EMA10"),
            "sma_20":  safe("SMA20"),
            "ema_20":  safe("EMA20"),
            "sma_50":  safe("SMA50"),
            "ema_50":  safe("EMA50"),
            "sma_100": safe("SMA100"),
            "sma_200": safe("SMA200"),
            "ema_200": safe("EMA200"),
            "vwma":    safe("VWMA"),
            "hull_ma": safe("HullMA9"),

            # ── Bollinger Bands ──────────────────────────────────────────
            "bb_upper": safe("BB.upper"),
            "bb_lower": safe("BB.lower"),
            "bb_power": safe("BBPower", 1),

            # ── Parabolic SAR ────────────────────────────────────────────
            "parabolic_sar": safe("P.SAR"),

            # ── Pivot points (Classic monthly) ───────────────────────────
            "pivot_s1": safe("Pivot.M.Classic.S1"),
            "pivot_r1": safe("Pivot.M.Classic.R1"),
            "pivot_s2": safe("Pivot.M.Classic.S2"),
            "pivot_r2": safe("Pivot.M.Classic.R2"),

            # ── Raw OHLCV snapshot ───────────────────────────────────────
            "close":    safe("close"),
            "high":     safe("high"),
            "low":      safe("low"),
            "volume":   int(ind["volume"]) if ind.get("volume") else None,
        }

    except ImportError:
        return {"error": "tradingview-ta not installed — run: pip install tradingview-ta"}
    except Exception as e:
        return {"error": str(e)}


# ── yfinance price history (for chart rendering + 52w data) ──────────────────

def fetch_history(ticker: str) -> dict | None:
    try:
        t = yf.Ticker(yf_symbol(ticker))
        end = datetime.today()
        start = end - timedelta(days=LOOKBACK_DAYS)
        hist = t.history(start=start.strftime("%Y-%m-%d"), end=end.strftime("%Y-%m-%d"))
        if hist.empty:
            return None

        close = hist["Close"]
        volume = hist["Volume"]
        current = round(float(close.iloc[-1]), 2)

        series = [
            {"date": str(d.date()), "close": round(float(c), 2), "volume": int(v)}
            for d, c, v in zip(hist.index[-90:], close.iloc[-90:], volume.iloc[-90:])
        ]

        return {
            "current_price": current,
            "52w_high":      round(float(close.max()), 2),
            "52w_low":       round(float(close.min()), 2),
            "pct_from_52w_high": round((current / float(close.max()) - 1) * 100, 1),
            "series_90d":    series,
        }
    except Exception as e:
        return {"error": str(e)}


# ── Chart rendering ───────────────────────────────────────────────────────────

def save_chart(ticker: str, series: list, ta: dict) -> bool:
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        import matplotlib.dates as mdates
        from datetime import datetime as dt

        dates  = [dt.strptime(r["date"], "%Y-%m-%d") for r in series]
        closes = [r["close"] for r in series]

        fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(12, 7),
                                        gridspec_kw={"height_ratios": [3, 1]})
        fig.patch.set_facecolor("#0d1117")
        for ax in (ax1, ax2):
            ax.set_facecolor("#0d1117")
            ax.tick_params(colors="#8b949e")
            for spine in ax.spines.values():
                spine.set_edgecolor("#30363d")

        ax1.plot(dates, closes, color="#58a6ff", linewidth=1.5, label="Price")

        # Draw MA lines using TradingView values as reference, plotted from series
        ma_specs = [
            (20,  "sma_20",  "#f0883e", "--"),
            (50,  "sma_50",  "#3fb950", "--"),
            (200, "sma_200", "#bc8cff", "--"),
        ]
        for n, key, color, ls in ma_specs:
            if ta.get(key) and len(closes) >= n:
                ma_vals = [None] * (n - 1) + [
                    sum(closes[i:i+n]) / n for i in range(len(closes) - n + 1)
                ]
                ax1.plot(dates, ma_vals, color=color, linewidth=1,
                         linestyle=ls, label=f"SMA{n}", alpha=0.8)

        # TradingView signal badge in title
        rec = ta.get("tv_recommendation", "")
        rsi = ta.get("rsi_14", "")
        ax1.set_title(
            f"{ticker}  |  TV: {rec}  |  RSI {rsi}",
            color="#e6edf3", fontsize=13, pad=10
        )
        ax1.legend(facecolor="#161b22", edgecolor="#30363d",
                   labelcolor="#e6edf3", fontsize=9)
        ax1.yaxis.set_major_formatter(plt.FuncFormatter(lambda x, _: f"${x:.0f}"))
        ax1.xaxis.set_major_formatter(mdates.DateFormatter("%b %d"))
        ax1.xaxis.set_major_locator(mdates.WeekdayLocator(interval=2))
        plt.setp(ax1.xaxis.get_majorticklabels(), rotation=30, ha="right")

        volumes = [r["volume"] for r in series]
        colors  = ["#3fb950" if c >= closes[max(0, i-1)] else "#f85149"
                   for i, c in enumerate(closes)]
        ax2.bar(dates, volumes, color=colors, alpha=0.7, width=0.8)
        ax2.set_ylabel("Volume", color="#8b949e", fontsize=8)
        ax2.yaxis.set_major_formatter(
            plt.FuncFormatter(lambda x, _: f"{x/1e6:.0f}M" if x >= 1e6 else f"{x:.0f}")
        )

        plt.tight_layout(pad=1.5)
        plt.savefig(OUT_DIR / f"{ticker}.png", dpi=150, bbox_inches="tight",
                    facecolor=fig.get_facecolor())
        plt.close()
        return True
    except Exception:
        return False


# ── Derived fields (above MA, trend structure) ────────────────────────────────

def derive_trend(ta: dict, price: float) -> dict:
    sma20  = ta.get("sma_20")
    sma50  = ta.get("sma_50")
    sma200 = ta.get("sma_200")

    above20  = price > sma20  if sma20  else None
    above50  = price > sma50  if sma50  else None
    above200 = price > sma200 if sma200 else None

    if above20 and above50 and above200:
        trend = "bullish"
    elif not above20 and not above50 and not above200:
        trend = "bearish"
    else:
        trend = "mixed"

    pct20  = round((price / sma20  - 1) * 100, 1) if sma20  else None
    pct50  = round((price / sma50  - 1) * 100, 1) if sma50  else None
    pct200 = round((price / sma200 - 1) * 100, 1) if sma200 else None

    return {
        "above_ma20":      above20,
        "above_ma50":      above50,
        "above_ma200":     above200,
        "pct_above_ma20":  pct20,
        "pct_above_ma50":  pct50,
        "pct_above_ma200": pct200,
        "trend_structure": trend,
    }


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    sources = json.loads(IN_FILE.read_text())
    tickers = sorted({t for s in sources for t in s["tickers"]})
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    ok, err = 0, 0
    for ticker in tickers:
        region = detect_region(ticker)
        print(f"  {ticker:<12}", end=" ", flush=True)

        # 1. TradingView indicators
        ta = fetch_tradingview_ta(ticker, region)
        if "error" in ta:
            print(f"TV ERR: {ta['error'][:60]}")
            err += 1
            # Still try to save partial data from yfinance
            hist = fetch_history(ticker) or {}
            out = {"ticker": ticker, "region": region,
                   "tradingview_error": ta["error"], **hist}
            out.pop("series_90d", None)
            (OUT_DIR / f"{ticker}.json").write_text(json.dumps(out, indent=2))
            continue

        # 2. yfinance price history (for chart + 52w range)
        hist = fetch_history(ticker)
        if hist is None or "error" in hist:
            hist = {}

        price = ta.get("close") or hist.get("current_price", 0)

        # 3. Derived trend fields
        trend_fields = derive_trend(ta, price) if price else {}

        # 4. Assemble output
        out = {
            "ticker":        ticker,
            "region":        region,
            "current_price": price,
            **trend_fields,
            "52w_high":          hist.get("52w_high"),
            "52w_low":           hist.get("52w_low"),
            "pct_from_52w_high": hist.get("pct_from_52w_high"),
            **ta,   # all TradingView indicator values
        }

        # 5. Save JSON (strip price series — aggregate.py doesn't need it)
        json_out = {k: v for k, v in out.items() if k != "series_90d"}
        (OUT_DIR / f"{ticker}.json").write_text(json.dumps(json_out, indent=2))

        # 6. Render chart
        charted = False
        if hist.get("series_90d"):
            charted = save_chart(ticker, hist["series_90d"], ta)

        rec  = ta.get("tv_recommendation", "?")
        rsi  = ta.get("rsi_14", "?")
        trend = trend_fields.get("trend_structure", "?")
        chart_mark = "📊" if charted else ""
        print(f"TV={rec:<12} RSI={rsi:<6} {trend}  {chart_mark}")
        ok += 1

    print(f"\n→ {ok} ok, {err} errors  →  {OUT_DIR.relative_to(VAULT)}/")


if __name__ == "__main__":
    import sys as _sys
    tickers_arg = _sys.argv[1:]
    if tickers_arg:
        # Single-ticker mode
        OUT_DIR.mkdir(parents=True, exist_ok=True)
        for ticker in tickers_arg:
            region = detect_region(ticker)
            print(f"  {ticker:<12}", end=" ", flush=True)
            ta = fetch_tradingview_ta(ticker, region)
            if "error" in ta:
                print(f"TV ERR: {ta['error']}")
                continue
            hist = fetch_history(ticker) or {}
            price = ta.get("close") or hist.get("current_price", 0)
            trend_fields = derive_trend(ta, price) if price else {}
            out = {"ticker": ticker, "region": region, "current_price": price,
                   **trend_fields,
                   "52w_high": hist.get("52w_high"),
                   "52w_low": hist.get("52w_low"),
                   "pct_from_52w_high": hist.get("pct_from_52w_high"),
                   **ta}
            (OUT_DIR / f"{ticker}.json").write_text(
                json.dumps({k: v for k, v in out.items() if k != "series_90d"}, indent=2)
            )
            charted = save_chart(ticker, hist.get("series_90d", []), ta) if hist.get("series_90d") else False
            rec = ta.get("tv_recommendation", "?")
            rsi = ta.get("rsi_14", "?")
            trend = trend_fields.get("trend_structure", "?")
            print(f"TV={rec:<12} RSI={rsi:<6} {trend}  {'📊' if charted else ''}")
    else:
        main()
