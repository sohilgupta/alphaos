// lib/yahoo-finance.ts
// yahoo-finance2 v3 wrapper — uses class instantiation pattern

import YahooFinance from 'yahoo-finance2';
import { LiveQuote, StockDetail, ChartDataPoint, NewsItem } from './types';
import { getCache, setCache } from './cache';

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

const QUOTE_TTL   = 5 * 60 * 1000;   // 5 min
const DETAIL_TTL  = 60 * 60 * 1000;  // 1 hr
const HISTORY_TTL = 60 * 60 * 1000;  // 1 hr

export async function getBatchQuotes(tickers: string[]): Promise<Map<string, LiveQuote>> {
  const result = new Map<string, LiveQuote>();
  const toFetch: string[] = [];

  for (const t of tickers) {
    const cached = getCache<LiveQuote>(`quote:${t}`);
    if (cached) {
      result.set(t, cached);
    } else {
      toFetch.push(t);
    }
  }

  if (toFetch.length === 0) return result;

  const chunkSize = 20;
  for (let i = 0; i < toFetch.length; i += chunkSize) {
    const chunk = toFetch.slice(i, i + chunkSize);
    try {
      const quotes = await yf.quote(chunk);
      const quotesArr = Array.isArray(quotes) ? quotes : [quotes];

      for (const q of quotesArr) {
        if (!q || !q.symbol) continue;
        const live: LiveQuote = {
          ticker: q.symbol,
          price: q.regularMarketPrice ?? 0,
          change: q.regularMarketChange ?? 0,
          changePercent: q.regularMarketChangePercent ?? 0,
          marketCap: q.marketCap ?? null,
          pe: q.trailingPE ?? null,
          week52High: q.fiftyTwoWeekHigh ?? null,
          week52Low: q.fiftyTwoWeekLow ?? null,
          volume: q.regularMarketVolume ?? null,
          avgVolume: q.averageDailyVolume3Month ?? null,
          shortName: q.shortName ?? q.symbol,
          longName: q.longName ?? q.shortName ?? q.symbol,
          currency: q.currency ?? 'USD',
          exchange: q.fullExchangeName ?? q.exchange ?? '',
          sector: null,
          industry: null,
          fetchedAt: Date.now(),
        };
        setCache(`quote:${q.symbol}`, live, QUOTE_TTL);
        result.set(q.symbol, live);
      }
    } catch (err) {
      console.error(`Failed to fetch quotes for chunk [${chunk.join(',')}]:`, err);
    }

    if (i + chunkSize < toFetch.length) {
      await new Promise(r => setTimeout(r, 300));
    }
  }

  return result;
}

export async function getStockDetail(ticker: string): Promise<StockDetail | null> {
  const cached = getCache<StockDetail>(`detail:${ticker}`);
  if (cached) return cached;

  try {
    const [summaryResult, quoteResult] = await Promise.allSettled([
      yf.quoteSummary(ticker, {
        modules: ['defaultKeyStatistics', 'financialData', 'summaryProfile', 'summaryDetail'],
      }),
      yf.quote(ticker),
    ]);

    const summary = summaryResult.status === 'fulfilled' ? summaryResult.value : null;
    const lq = quoteResult.status === 'fulfilled'
      ? (Array.isArray(quoteResult.value) ? quoteResult.value[0] : quoteResult.value)
      : null;

    const fin = summary?.financialData;
    const stats = summary?.defaultKeyStatistics;
    const profile = summary?.summaryProfile;
    const detail_summary = summary?.summaryDetail;

    const data: StockDetail = {
      ticker,
      price: lq?.regularMarketPrice ?? 0,
      change: lq?.regularMarketChange ?? 0,
      changePercent: lq?.regularMarketChangePercent ?? 0,
      marketCap: lq?.marketCap ?? null,
      pe: lq?.trailingPE ?? (detail_summary?.trailingPE as number | null | undefined) ?? null,
      week52High: lq?.fiftyTwoWeekHigh ?? null,
      week52Low: lq?.fiftyTwoWeekLow ?? null,
      volume: lq?.regularMarketVolume ?? null,
      avgVolume: lq?.averageDailyVolume3Month ?? null,
      shortName: lq?.shortName ?? ticker,
      longName: lq?.longName ?? lq?.shortName ?? ticker,
      currency: lq?.currency ?? 'USD',
      exchange: lq?.fullExchangeName ?? lq?.exchange ?? '',
      sector: (profile as any)?.sector ?? null,
      industry: (profile as any)?.industry ?? null,
      fetchedAt: Date.now(),
      eps: (stats as any)?.trailingEps ?? null,
      revenueGrowth: (fin as any)?.revenueGrowth?.raw ?? (fin as any)?.revenueGrowth ?? null,
      grossMargin: (fin as any)?.grossMargins?.raw ?? (fin as any)?.grossMargins ?? null,
      operatingMargin: (fin as any)?.operatingMargins?.raw ?? (fin as any)?.operatingMargins ?? null,
      netMargin: (fin as any)?.profitMargins?.raw ?? (fin as any)?.profitMargins ?? null,
      debtToEquity: (fin as any)?.debtToEquity ?? null,
      returnOnEquity: (fin as any)?.returnOnEquity?.raw ?? (fin as any)?.returnOnEquity ?? null,
      freeCashFlow: (fin as any)?.freeCashflow ?? null,
      beta: (stats as any)?.beta ?? null,
      description: (profile as any)?.longBusinessSummary ?? null,
      website: (profile as any)?.website ?? null,
      employees: (profile as any)?.fullTimeEmployees ?? null,
    };

    setCache(`detail:${ticker}`, data, DETAIL_TTL);
    return data;
  } catch (err) {
    console.error(`Failed to fetch detail for ${ticker}:`, err);
    return null;
  }
}

type HistoryPeriod = '1d' | '5d' | '1mo' | '3mo' | '6mo' | '1y' | '2y' | '5y' | 'max';

const PERIOD_INTERVAL: Record<HistoryPeriod, '1m' | '5m' | '1h' | '1d' | '1wk' | '1mo'> = {
  '1d':  '5m',
  '5d':  '1h',
  '1mo': '1d',
  '3mo': '1d',
  '6mo': '1d',
  '1y':  '1d',
  '2y':  '1wk',
  '5y':  '1mo',
  'max': '1mo',
};

export async function getHistory(ticker: string, period: HistoryPeriod = '1y'): Promise<ChartDataPoint[]> {
  const cacheKey = `history:${ticker}:${period}`;
  const cached = getCache<ChartDataPoint[]>(cacheKey);
  if (cached) return cached;

  try {
    const interval = PERIOD_INTERVAL[period] || '1d';
    const data = await yf.chart(ticker, {
      period1: getPeriodStartDate(period),
      period2: new Date(),
      interval: interval as '1d' | '1wk' | '1mo' | '1m' | '5m' | '1h',
    });

    const quotes = (data as any)?.quotes ?? (data as any)?.indicators?.quote?.[0] ?? [];
    const timestamps = (data as any)?.timestamp ?? [];

    let points: ChartDataPoint[] = [];

    if (Array.isArray(quotes) && quotes.length > 0 && quotes[0]?.date) {
      points = quotes
        .filter((q: any) => q && q.close != null)
        .map((q: any) => ({
          date: new Date(q.date).toISOString(),
          open: q.open ?? q.close ?? 0,
          high: q.high ?? q.close ?? 0,
          low: q.low ?? q.close ?? 0,
          close: q.close ?? 0,
          volume: q.volume ?? 0,
        }));
    } else if (timestamps.length > 0 && Array.isArray(quotes)) {
      points = timestamps
        .map((ts: number, i: number) => ({
          date: new Date(ts * 1000).toISOString(),
          open: quotes[i]?.open ?? quotes[i]?.close ?? 0,
          high: quotes[i]?.high ?? quotes[i]?.close ?? 0,
          low: quotes[i]?.low ?? quotes[i]?.close ?? 0,
          close: quotes[i]?.close ?? 0,
          volume: quotes[i]?.volume ?? 0,
        }))
        .filter((p: ChartDataPoint) => p.close > 0);
    }

    setCache(cacheKey, points, HISTORY_TTL);
    return points;
  } catch (err) {
    console.error(`Failed to fetch history for ${ticker} (${period}):`, err);
    return [];
  }
}

function computeReturnFromHistory(currentPrice: number, points: ChartDataPoint[]): number | null {
  if (!currentPrice || !points.length) return null;
  const start = points[0].close;
  if (!start || start === 0) return null;
  return ((currentPrice - start) / start) * 100;
}

function closestPointToDate(points: ChartDataPoint[], target: Date): ChartDataPoint | null {
  if (!points.length) return null;
  return points.reduce((closest, point) => {
    const pointDate = new Date(point.date).getTime();
    const bestDate = new Date(closest.date).getTime();
    return Math.abs(pointDate - target.getTime()) < Math.abs(bestDate - target.getTime()) ? point : closest;
  });
}

export async function getHistoricalReturns(ticker: string, currentPrice: number) {
  const [week, month, year, fiveYear] = await Promise.all([
    getHistory(ticker, '5d'),
    getHistory(ticker, '1mo'),
    getHistory(ticker, '1y'),
    getHistory(ticker, '5y'),
  ]);

  const threeYearsAgo = new Date();
  threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);
  const threeYearPoint = closestPointToDate(fiveYear, threeYearsAgo);

  return {
    gain1W: computeReturnFromHistory(currentPrice, week),
    gain1M: computeReturnFromHistory(currentPrice, month),
    gain1Y: computeReturnFromHistory(currentPrice, year),
    gain3Y: threeYearPoint ? ((currentPrice - threeYearPoint.close) / threeYearPoint.close) * 100 : null,
  };
}

export interface BatchHistoricalReturns {
  gain1W: number | null;
  gain1M: number | null;
  gain6M: number | null; // 3M lookback — stored as gain6M to match MergedStock field used for 3M display
  gain1Y: number | null;
}

export async function getBatchHistoricalReturns(
  tickers: string[],
  liveQuotes: Map<string, LiveQuote>
): Promise<Map<string, BatchHistoricalReturns>> {
  const result = new Map<string, BatchHistoricalReturns>();
  const toFetch: string[] = [];

  for (const ticker of tickers) {
    const cached = getCache<BatchHistoricalReturns>(`returns:${ticker}`);
    if (cached) {
      result.set(ticker, cached);
    } else {
      toFetch.push(ticker);
    }
  }

  const CONCURRENCY = 6;
  const DELAY_MS = 200;
  const now = new Date();
  const weekAgo        = new Date(now.getTime() -   7 * 24 * 60 * 60 * 1000);
  const monthAgo       = new Date(now.getTime() -  30 * 24 * 60 * 60 * 1000);
  const threeMonthAgo  = new Date(now.getTime() -  90 * 24 * 60 * 60 * 1000);

  for (let i = 0; i < toFetch.length; i += CONCURRENCY) {
    const batch = toFetch.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(async (ticker) => {
      const price = liveQuotes.get(ticker)?.price;
      if (!price) return;

      try {
        const history = await getHistory(ticker, '1y');
        if (!history.length) return;

        const calc = (point: ChartDataPoint | null) =>
          point ? ((price - point.close) / point.close) * 100 : null;

        const returns: BatchHistoricalReturns = {
          gain1W: calc(closestPointToDate(history, weekAgo)),
          gain1M: calc(closestPointToDate(history, monthAgo)),
          gain6M: calc(closestPointToDate(history, threeMonthAgo)),
          gain1Y: calc(history[0] ?? null),
        };

        setCache(`returns:${ticker}`, returns, HISTORY_TTL);
        result.set(ticker, returns);
      } catch (err) {
        console.error(`getBatchHistoricalReturns failed for ${ticker}:`, err);
      }
    }));

    if (i + CONCURRENCY < toFetch.length) {
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }

  return result;
}

function getPeriodStartDate(period: HistoryPeriod): Date {
  const now = new Date();
  switch (period) {
    case '1d':  return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    case '5d':  return new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
    case '1mo': return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case '3mo': return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    case '6mo': return new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
    case '1y':  return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    case '2y':  return new Date(now.getTime() - 2 * 365 * 24 * 60 * 60 * 1000);
    case '5y':  return new Date(now.getTime() - 5 * 365 * 24 * 60 * 60 * 1000);
    case 'max': return new Date('2000-01-01');
    default:    return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
  }
}

export async function getNews(ticker: string): Promise<NewsItem[]> {
  try {
    const result = await yf.search(ticker, { newsCount: 8, quotesCount: 0 });
    return ((result as any)?.news ?? []).map((n: any) => ({
      title: n.title,
      publisher: n.publisher,
      link: n.link,
      publishedAt: new Date(n.providerPublishTime).getTime(),
      thumbnail: n.thumbnail?.resolutions?.[0]?.url,
    }));
  } catch {
    return [];
  }
}

export function formatMarketCap(cap: number | null): string {
  if (cap == null) return '—';
  if (cap >= 1e12) return `$${(cap / 1e12).toFixed(2)}T`;
  if (cap >= 1e9)  return `$${(cap / 1e9).toFixed(2)}B`;
  if (cap >= 1e6)  return `$${(cap / 1e6).toFixed(2)}M`;
  return `$${cap.toLocaleString()}`;
}
