// lib/types.ts
// Central type definitions for the entire app

export type Verdict = 'Strong Buy' | 'Buy' | 'Watch' | 'Hold' | 'Reduce' | 'Avoid';
export type Confidence = 'High' | 'Medium' | 'Low';

export interface SheetStock {
  ticker: string;
  name: string;
  category: string;
  sheetTab: string; // 'ai-tech' | 'space-energy'
  description: string;
  marketCapSheet: number | null; // in billions from sheet
  currentPriceSheet: number | null;
  fairPrice: number | null;
  potentialGain: number | null; // %
  gain1W: number | null;
  gain1M: number | null;
  gain6M: number | null;
  gain1Y: number | null;
  gain3Y: number | null;
  verdict: Verdict | null;
  confidence: Confidence | null;
  region?: Region;
}

export interface LiveQuote {
  ticker: string;
  price: number;
  change: number;
  changePercent: number;
  marketCap: number | null;
  pe: number | null;
  week52High: number | null;
  week52Low: number | null;
  volume: number | null;
  avgVolume: number | null;
  shortName: string;
  longName: string;
  currency: string;
  exchange: string;
  sector: string | null;
  industry: string | null;
  fetchedAt: number;
}

export interface StockDetail extends LiveQuote {
  eps: number | null;
  revenueGrowth: number | null;
  grossMargin: number | null;
  operatingMargin: number | null;
  netMargin: number | null;
  debtToEquity: number | null;
  returnOnEquity: number | null;
  freeCashFlow: number | null;
  beta: number | null;
  description: string | null;
  website: string | null;
  employees: number | null;
}

export interface PortfolioData {
  quantity: number;
  avgBuyPrice: number;
  investedValue: number;
}

export interface PortfolioStock {
  ticker: string;
  name: string;
  quantity: number;
  avgBuyPrice: number;
  investedValue: number;
  // Optional valuation enrichment written by research/scripts/update_sheet_valuations.py
  fairPrice?: number | null;
  potentialGain?: number | null;
  verdict?: Verdict | null;
  confidence?: Confidence | null;
}

export type UserRole = 'public' | 'owner';
export type Region = 'US' | 'INDIA';

export interface User {
  id: string;
  role: UserRole;
}

export interface Stock {
  ticker: string;
  name: string;
  region: Region;
  theme: string;
  notes?: string;
  isWatchlist: boolean;
  isPortfolio: boolean;
  quantity?: number;
  avgBuyPrice?: number;
  currentValue?: number;
  pnl?: number;
  price: number;
  change1D: number;
}

export interface MergedStock {
  ticker: string;
  name: string;
  region: Region;
  category: string;
  sheetTab: string;
  description: string;
  marketCapSheet: number | null;
  currentPriceSheet: number | null;
  fairPrice: number | null;
  potentialGain: number | null;
  gain1W: number | null;
  gain1M: number | null;
  gain6M: number | null;
  gain1Y: number | null;
  gain3Y: number | null;
  verdict: Verdict | null;
  confidence: Confidence | null;
  live: LiveQuote | null;
  convictionScore: number;
  alertThreshold: number | null;
  tags: string[];

  // New architecture fields
  isInWatchlist: boolean;
  isInPortfolio: boolean;
  portfolioData?: PortfolioData;
  quantity?: number;
  avgBuyPrice?: number;
  currentValue?: number;
  pnl?: number;
  originalTheme?: string;
  suggestedTheme?: string;
  themeConfidence?: number;
}

export interface ChartDataPoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface NewsItem {
  title: string;
  publisher: string;
  link: string;
  publishedAt: number;
  thumbnail?: string;
}

export interface CategoryPerformance {
  category: string;
  count: number;
  avgChange: number;
  avgGain1M: number;
  avgGain1Y: number;
  topPerformer: string;
  worstPerformer: string;
}
