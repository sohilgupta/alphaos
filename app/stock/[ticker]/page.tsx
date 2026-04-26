'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Globe, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import PriceChart from '@/components/stock/PriceChart';
import KeyStats from '@/components/stock/KeyStats';
import NewsFeed from '@/components/stock/NewsFeed';
import ConvictionScore from '@/components/stock/ConvictionScore';
import { formatPrice, formatPercent, getChangeBg, getChangeColor } from '@/lib/format';
import { StockDetail, SheetStock, PortfolioStock } from '@/lib/types';
import { ThemeSuggestion } from '@/lib/intelligence';

async function fetchStockDetail(ticker: string) {
  const res = await fetch(`/api/stock/${ticker}`);
  if (!res.ok) throw new Error('Failed');
  return res.json();
}

function ReturnsGrid({ sheetData }: { sheetData: SheetStock | null }) {
  if (!sheetData) return null;

  const returns = [
    { label: '1 Week', value: sheetData.gain1W },
    { label: '1 Month', value: sheetData.gain1M },
    { label: '6 Month', value: sheetData.gain6M },
    { label: '1 Year', value: sheetData.gain1Y },
    { label: '3 Year', value: sheetData.gain3Y },
  ].filter(r => r.value != null);

  if (!returns.length) return null;

  return (
    <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
      {returns.map(r => (
        <div key={r.label} className="glass-card p-3 text-center">
          <div className="text-xs text-muted-foreground mb-1">{r.label}</div>
          <div className={`text-sm font-700 tabular-nums ${getChangeColor(r.value)}`}>
            {formatPercent(r.value)}
          </div>
        </div>
      ))}
    </div>
  );
}

function ValuationBadge({ pe, fairPrice, currentPrice }: {
  pe: number | null;
  fairPrice: number | null;
  currentPrice: number;
}) {
  if (fairPrice && currentPrice) {
    const upside = ((fairPrice - currentPrice) / currentPrice) * 100;
    if (upside > 15) return (
      <Badge className="bg-gain/15 text-gain border-0 text-xs">
        <TrendingUp className="w-3 h-3 mr-1" /> Undervalued ({formatPercent(upside)} upside)
      </Badge>
    );
    if (upside < -15) return (
      <Badge className="bg-loss/15 text-loss border-0 text-xs">
        <TrendingDown className="w-3 h-3 mr-1" /> Overvalued ({formatPercent(upside)})
      </Badge>
    );
    return (
      <Badge className="bg-yellow-400/15 text-yellow-400 border-0 text-xs">
        <Minus className="w-3 h-3 mr-1" /> Fairly Valued
      </Badge>
    );
  }
  if (pe != null) {
    if (pe < 15) return <Badge className="bg-gain/15 text-gain border-0 text-xs">Low P/E ({pe.toFixed(1)}x)</Badge>;
    if (pe > 40) return <Badge className="bg-loss/15 text-loss border-0 text-xs">High P/E ({pe.toFixed(1)}x)</Badge>;
  }
  return null;
}

export default function StockDetailPage() {
  const params = useParams();
  const router = useRouter();
  const ticker = (params?.ticker as string || '').toUpperCase();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['stock', ticker],
    queryFn: () => fetchStockDetail(ticker),
    enabled: !!ticker,
  });

  const detail: StockDetail | null = data?.detail ?? null;
  const sheetData: SheetStock | null = data?.sheetData ?? null;
  const portfolioData: PortfolioStock | null = data?.portfolioData ?? null;
  const suggestion: ThemeSuggestion | null = data?.suggestion ?? null;

  const price = detail?.price ?? 0;
  const changePercent = detail?.changePercent ?? 0;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Back nav */}
      <button
        onClick={() => router.back()}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Dashboard
      </button>

      {/* Hero Header */}
      <div className="glass-card p-6">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-8 w-48 skeleton" />
            <Skeleton className="h-12 w-36 skeleton" />
            <Skeleton className="h-6 w-24 skeleton" />
          </div>
        ) : (
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-3xl font-800 text-foreground">{ticker}</h1>
                <span className="text-lg text-muted-foreground font-400">
                  {detail?.longName || detail?.shortName || sheetData?.name}
                </span>
                {detail?.exchange && (
                  <Badge variant="secondary" className="text-xs bg-secondary/80">{detail.exchange}</Badge>
                )}
              </div>
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                {detail?.sector && <span className="text-sm text-muted-foreground">{detail.sector}</span>}
                {detail?.sector && detail?.industry && <span className="text-muted-foreground/40">·</span>}
                {detail?.industry && <span className="text-sm text-muted-foreground">{detail.industry}</span>}
              </div>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                {sheetData?.category && (
                  <Badge className="text-xs bg-primary/15 text-primary/80 border-0">
                    {sheetData.category}
                  </Badge>
                )}
                {suggestion && suggestion.theme !== sheetData?.category && (
                  <Badge variant="outline" className="text-xs border-yellow-500/30 text-yellow-500/80">
                    ⚠️ AI Suggestion: {suggestion.theme}
                  </Badge>
                )}
                {sheetData?.sheetTab && (
                  <Badge variant="secondary" className="text-xs">{sheetData.sheetTab}</Badge>
                )}
                <ValuationBadge
                  pe={detail?.pe ?? null}
                  fairPrice={sheetData?.fairPrice ?? null}
                  currentPrice={price}
                />
              </div>
            </div>
            <div className="text-right">
              <div className="text-4xl font-800 tabular-nums text-foreground">{formatPrice(price)}</div>
              <div className="mt-1 flex items-center justify-end gap-2">
                <Badge className={`text-sm font-700 px-3 py-1 ${getChangeBg(changePercent)}`} variant="secondary">
                  {formatPercent(changePercent)}
                </Badge>
                <span className={`text-sm font-600 ${getChangeColor(detail?.change ?? null)}`}>
                  {detail?.change != null ? (detail.change >= 0 ? '+' : '') + detail.change.toFixed(2) : ''}
                </span>
              </div>
              {sheetData?.fairPrice && (
                <div className="text-xs text-muted-foreground mt-2">
                  Fair Value: <span className="text-foreground font-600">{formatPrice(sheetData.fairPrice)}</span>
                  {sheetData.potentialGain != null && (
                    <span className={`ml-1 ${getChangeColor(sheetData.potentialGain)}`}>
                      ({formatPercent(sheetData.potentialGain)})
                    </span>
                  )}
                </div>
              )}
              {detail?.website && (
                <a
                  href={detail.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors mt-1"
                >
                  <Globe className="w-3 h-3" /> Website
                </a>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Portfolio Position */}
      {!isLoading && portfolioData && (
        <div className="glass-card p-5 border-primary/30">
          <h2 className="text-sm font-600 text-primary uppercase tracking-wider mb-4 flex items-center gap-2">
            💰 Your Position
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground uppercase tracking-wider">Quantity</div>
              <div className="text-2xl font-800 tabular-nums text-foreground">{portfolioData.quantity}</div>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground uppercase tracking-wider">Avg Buy Price</div>
              <div className="text-2xl font-800 tabular-nums text-foreground">{formatPrice(portfolioData.avgBuyPrice)}</div>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground uppercase tracking-wider">Invested</div>
              <div className="text-2xl font-800 tabular-nums text-foreground">{formatPrice(portfolioData.investedValue)}</div>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground uppercase tracking-wider">P&L</div>
              {(() => {
                const plValue = (price - portfolioData.avgBuyPrice) * portfolioData.quantity;
                const plPercent = ((price - portfolioData.avgBuyPrice) / portfolioData.avgBuyPrice) * 100;
                return (
                  <div>
                    <div className={`text-2xl font-800 tabular-nums ${getChangeColor(plValue)}`}>
                      {plValue >= 0 ? '+' : ''}{formatPrice(plValue)}
                    </div>
                    <div className={`text-sm font-600 ${getChangeColor(plPercent)}`}>
                      {formatPercent(plPercent)}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Price Chart */}
      <div className="glass-card p-5">
        <h2 className="text-sm font-600 text-muted-foreground uppercase tracking-wider mb-4">Price History</h2>
        <PriceChart ticker={ticker} />
      </div>

      {/* Returns from Sheet */}
      {!isLoading && sheetData && (
        <div>
          <h2 className="text-sm font-600 text-muted-foreground uppercase tracking-wider mb-3">Historical Returns (from Watchlist)</h2>
          <ReturnsGrid sheetData={sheetData} />
        </div>
      )}

      {/* Key Stats */}
      {!isLoading && detail && (
        <div>
          <h2 className="text-sm font-600 text-muted-foreground uppercase tracking-wider mb-3">Key Statistics</h2>
          <KeyStats detail={detail} />
        </div>
      )}

      {/* Business Description */}
      {!isLoading && (detail?.description || sheetData?.description) && (
        <div className="glass-card p-5">
          <h2 className="text-sm font-600 text-muted-foreground uppercase tracking-wider mb-3">About</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {detail?.description || sheetData?.description}
          </p>
        </div>
      )}

      {/* My Thesis */}
      {sheetData?.description && sheetData.description !== detail?.description && (
        <div className="glass-card p-5 border-primary/20">
          <h2 className="text-sm font-600 text-primary uppercase tracking-wider mb-3">📋 My Investment Thesis</h2>
          <p className="text-sm text-foreground/90 leading-relaxed">{sheetData.description}</p>
        </div>
      )}

      {/* Conviction + News grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Conviction */}
        <div className="glass-card p-5">
          <h2 className="text-sm font-600 text-muted-foreground uppercase tracking-wider mb-4">Conviction Score</h2>
          <ConvictionScore ticker={ticker} />
        </div>

        {/* News */}
        <div className="glass-card p-5">
          <h2 className="text-sm font-600 text-muted-foreground uppercase tracking-wider mb-4">Latest News</h2>
          <NewsFeed ticker={ticker} />
        </div>
      </div>

      {isError && (
        <div className="glass-card p-6 text-center">
          <p className="text-muted-foreground">Failed to load data for {ticker}. The ticker may be invalid or rate-limited.</p>
        </div>
      )}
    </div>
  );
}
