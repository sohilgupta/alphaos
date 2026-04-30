import { suggestTheme } from '@/lib/intelligence';
import { getHistoricalReturns } from '@/lib/yahoo-finance';
import type { LiveQuote, MergedStock, PortfolioStock, Region, SheetStock, User } from '@/lib/types';

const PUBLIC_PORTFOLIO_KEYS = [
  'portfolioData',
  'quantity',
  'avgBuyPrice',
  'currentValue',
  'pnl',
] as const;

function isOwner(user: User | null) {
  return user?.role === 'owner';
}

function sanitizeForPublic(stock: MergedStock): MergedStock {
  const sanitized = { ...stock, isInPortfolio: false, tags: stock.tags.filter((tag) => tag === 'WATCHLIST ONLY') };
  for (const key of PUBLIC_PORTFOLIO_KEYS) {
    delete sanitized[key];
  }
  return sanitized;
}

async function mergeData(
  watchlist: SheetStock[],
  portfolio: PortfolioStock[],
  liveQuotes: Map<string, LiveQuote>,
  user: User | null,
  region: Region
): Promise<MergedStock[]> {
  const owner = isOwner(user);
  const watchlistMap = new Map(watchlist.map((stock) => [stock.ticker, stock]));
  const portfolioMap = owner ? new Map(portfolio.map((stock) => [stock.ticker, stock])) : new Map<string, PortfolioStock>();
  const allTickers = owner
    ? new Set([...watchlistMap.keys(), ...portfolioMap.keys()])
    : new Set(watchlistMap.keys());

  const merged = await Promise.all(
    Array.from(allTickers).map(async (ticker) => {
      const wData = watchlistMap.get(ticker);
      const pData = portfolioMap.get(ticker);
      const live = liveQuotes.get(ticker) ?? null;
      const isInWatchlist = !!wData;
      const isInPortfolio = !!pData;
      const tags: string[] = [];

      if (isInWatchlist && isInPortfolio) tags.push('WATCHLIST + PORTFOLIO');
      else if (isInWatchlist) tags.push('WATCHLIST ONLY');
      else if (isInPortfolio) tags.push('PORTFOLIO ONLY');

      const name = wData?.name || pData?.name || live?.shortName || ticker;
      const description = wData?.description || '';
      const suggestion = suggestTheme({ name, description });
      const quantity = pData?.quantity;
      const avgBuyPrice = pData?.avgBuyPrice;
      const currentValue = quantity && live?.price ? quantity * live.price : undefined;
      const pnl = quantity && avgBuyPrice && live?.price
        ? (live.price - avgBuyPrice) * quantity
        : undefined;

      let gain1W = wData?.gain1W ?? null;
      let gain1M = wData?.gain1M ?? null;
      let gain1Y = wData?.gain1Y ?? null;
      let gain3Y = wData?.gain3Y ?? null;

      if (live?.price && (gain1W == null || gain1M == null || gain1Y == null || gain3Y == null)) {
        const computed = await getHistoricalReturns(ticker, live.price);
        gain1W = gain1W ?? computed.gain1W;
        gain1M = gain1M ?? computed.gain1M;
        gain1Y = gain1Y ?? computed.gain1Y;
        gain3Y = gain3Y ?? computed.gain3Y;
      }

      const stock: MergedStock = {
        ticker,
        name,
        region,
        category: wData?.category || 'Uncategorized',
        sheetTab: wData?.sheetTab || 'Portfolio Only',
        description,
        marketCapSheet: wData?.marketCapSheet ?? null,
        currentPriceSheet: wData?.currentPriceSheet ?? null,
        fairPrice: wData?.fairPrice ?? null,
        potentialGain: wData?.potentialGain ?? null,
        gain1W,
        gain1M,
        gain6M: wData?.gain6M ?? null,
        gain1Y,
        gain3Y,
        live,
        convictionScore: 5,
        alertThreshold: null,
        tags,
        isInWatchlist,
        isInPortfolio,
        portfolioData: pData ? {
          quantity: pData.quantity,
          avgBuyPrice: pData.avgBuyPrice,
          investedValue: pData.investedValue,
        } : undefined,
        quantity,
        avgBuyPrice,
        currentValue,
        pnl,
        originalTheme: wData?.category,
        suggestedTheme: suggestion?.theme,
        themeConfidence: suggestion?.confidence,
      };

      return owner ? stock : sanitizeForPublic(stock);
    })
  );

  return merged;
}

export async function mergeUSData(
  watchlist: SheetStock[],
  portfolio: PortfolioStock[],
  liveQuotes: Map<string, LiveQuote>,
  user: User | null
) {
  return mergeData(watchlist, portfolio, liveQuotes, user, 'US');
}

export async function mergeIndianData(
  watchlist: SheetStock[],
  portfolio: PortfolioStock[],
  liveQuotes: Map<string, LiveQuote>,
  user: User | null
) {
  return mergeData(watchlist, portfolio, liveQuotes, user, 'INDIA');
}
