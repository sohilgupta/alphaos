import { suggestTheme } from '@/lib/intelligence';
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

function mergeData(
  watchlist: SheetStock[],
  portfolio: PortfolioStock[],
  liveQuotes: Map<string, LiveQuote>,
  user: User | null,
  region: Region
): MergedStock[] {
  const owner = isOwner(user);
  const watchlistMap = new Map(watchlist.map((stock) => [stock.ticker, stock]));
  const portfolioMap = owner ? new Map(portfolio.map((stock) => [stock.ticker, stock])) : new Map<string, PortfolioStock>();
  const allTickers = owner
    ? new Set([...watchlistMap.keys(), ...portfolioMap.keys()])
    : new Set(watchlistMap.keys());

  const merged = Array.from(allTickers).map((ticker) => {
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

      const gain1W = wData?.gain1W ?? null;
      const gain1M = wData?.gain1M ?? null;
      const gain1Y = wData?.gain1Y ?? null;
      const gain3Y = wData?.gain3Y ?? null;

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
    });

  return merged;
}

export function mergeUSData(
  watchlist: SheetStock[],
  portfolio: PortfolioStock[],
  liveQuotes: Map<string, LiveQuote>,
  user: User | null
): MergedStock[] {
  return mergeData(watchlist, portfolio, liveQuotes, user, 'US');
}

export function mergeIndianData(
  watchlist: SheetStock[],
  portfolio: PortfolioStock[],
  liveQuotes: Map<string, LiveQuote>,
  user: User | null
): MergedStock[] {
  return mergeData(watchlist, portfolio, liveQuotes, user, 'INDIA');
}
