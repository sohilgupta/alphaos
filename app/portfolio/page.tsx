'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, useMemo } from 'react';
import { TrendingUp, TrendingDown, DollarSign, PieChart, BarChart2 } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatPercent, formatStockPrice, getChangeBg, getChangeColor } from '@/lib/format';
import { Skeleton } from '@/components/ui/skeleton';
import CASUpload from '@/components/dashboard/CASUpload';
import MutualFundsTable from '@/components/dashboard/MutualFundsTable';
import { useAuth } from '@/components/providers/AuthProvider';

interface PortfolioHolding {
  ticker: string;
  name: string;
  quantity: number;
  avgBuyPrice: number;
  investedValue: number;
  currentPrice?: number;
  currentValue?: number;
  pnl?: number;
  pnlPercent?: number;
  changePercent?: number;
}

async function fetchPortfolio(region: 'us' | 'india') {
  const res = await fetch(`/api/portfolio/${region}`);
  if (!res.ok) throw new Error('Failed to fetch portfolio');
  return res.json();
}

export default function PortfolioPage() {
  const { role } = useAuth();
  const isOwner = role === 'owner';
  const queryClient = useQueryClient();
  const [activeRegion, setActiveRegion] = useState<'us' | 'india'>('us');
  const [activeTab, setActiveTab] = useState<'holdings' | 'mutual-funds'>('holdings');

  const { data: usData, isLoading: usLoading } = useQuery({
    queryKey: ['portfolio', 'us'],
    queryFn: () => fetchPortfolio('us'),
    refetchInterval: 5 * 60 * 1000,
  });

  const { data: indiaData, isLoading: indiaLoading } = useQuery({
    queryKey: ['portfolio', 'india'],
    queryFn: () => fetchPortfolio('india'),
    refetchInterval: 5 * 60 * 1000,
  });

  const currentData = activeRegion === 'us' ? usData : indiaData;
  const isLoading = activeRegion === 'us' ? usLoading : indiaLoading;
  const isIndia = activeRegion === 'india';
  const currencySymbol = isIndia ? '₹' : '$';
  const locale = isIndia ? 'en-IN' : 'en-US';

  const holdings = useMemo<PortfolioHolding[]>(() => {
    if (!currentData?.holdings) return [];

    return currentData.holdings.map((holding: any) => {
      // For US portfolio, we need to get live prices
      // For now, using placeholder values
      const currentPrice = holding.currentPrice || holding.avgBuyPrice * 1.05; // placeholder
      const currentValue = holding.quantity * currentPrice;
      const pnl = currentValue - holding.investedValue;
      const pnlPercent = (pnl / holding.investedValue) * 100;

      return {
        ...holding,
        currentPrice,
        currentValue,
        pnl,
        pnlPercent,
        changePercent: ((currentPrice - holding.avgBuyPrice) / holding.avgBuyPrice) * 100,
      };
    });
  }, [currentData]);

  const portfolioStats = useMemo(() => {
    if (!holdings.length) return null;

    const totalInvested = holdings.reduce((sum, h) => sum + h.investedValue, 0);
    const totalCurrent = holdings.reduce((sum, h) => sum + (h.currentValue || 0), 0);
    const totalPnL = totalCurrent - totalInvested;
    const totalPnLPercent = (totalPnL / totalInvested) * 100;

    return {
      totalInvested,
      totalCurrent,
      totalPnL,
      totalPnLPercent,
      holdingsCount: holdings.length,
    };
  }, [holdings]);

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Portfolio</h1>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-20" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Portfolio</h1>
        <div className="flex items-center gap-2">
          {isOwner && activeRegion === 'india' && (
            <CASUpload
              onSuccess={() => {
                queryClient.invalidateQueries({ queryKey: ['portfolio', 'india'] });
                queryClient.invalidateQueries({ queryKey: ['mutual-funds'] });
              }}
            />
          )}
          <Tabs value={activeRegion} onValueChange={(value) => { setActiveRegion(value as 'us' | 'india'); setActiveTab('holdings'); }}>
            <TabsList>
              <TabsTrigger value="us">🇺🇸 US</TabsTrigger>
              <TabsTrigger value="india">🇮🇳 India</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {portfolioStats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Invested</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{currencySymbol}{portfolioStats.totalInvested.toLocaleString(locale)}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Current Value</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{currencySymbol}{portfolioStats.totalCurrent.toLocaleString(locale)}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total P&L</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${portfolioStats.totalPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {currencySymbol}{portfolioStats.totalPnL.toLocaleString(locale)}
              </div>
              <div className={`text-sm ${portfolioStats.totalPnLPercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatPercent(portfolioStats.totalPnLPercent)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Holdings</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{portfolioStats.holdingsCount}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs for Holdings / Mutual Funds (India only) */}
      {activeRegion === 'india' && isOwner && (
        <div className="flex gap-1 bg-secondary/40 p-1 rounded-lg border border-white/8 w-fit">
          {(['holdings', 'mutual-funds'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 rounded-md text-xs font-600 transition-colors ${activeTab === tab ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {tab === 'holdings' ? 'Equity Holdings' : 'Mutual Funds'}
            </button>
          ))}
        </div>
      )}

      {activeRegion === 'india' && isOwner && activeTab === 'mutual-funds' ? (
        <Card>
          <CardHeader>
            <CardTitle>Mutual Fund Holdings</CardTitle>
          </CardHeader>
          <CardContent>
            <MutualFundsTable />
          </CardContent>
        </Card>
      ) : (
      <Card>
        <CardHeader>
          <CardTitle>Holdings</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {holdings.map((holding) => (
              <div key={holding.ticker} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{holding.ticker}</h3>
                    <Badge variant="outline">{holding.name}</Badge>
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">
                    {holding.quantity} shares @ {currencySymbol}{holding.avgBuyPrice.toLocaleString(locale, { maximumFractionDigits: 2 })}
                  </div>
                </div>

                <div className="text-right">
                  <div className="font-semibold">{currencySymbol}{(holding.currentValue || 0).toLocaleString(locale)}</div>
                  <div className={`text-sm ${getChangeColor(holding.pnl)}`}>
                    {currencySymbol}{holding.pnl?.toLocaleString(locale)} ({formatPercent(holding.pnlPercent)})
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      )}
    </div>
  );
}
