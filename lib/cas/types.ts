export interface CASEquityHolding {
  isin: string;
  name: string;
  quantity: number;
  marketPrice: number | null;
  value: number;
  /** Pre-resolved Yahoo Finance ticker (e.g. from NSDL SYMBOL.NSE → SYMBOL.NS) */
  ticker?: string;
}

export interface CASMutualFund {
  isin: string | null;
  schemeName: string;
  units: number;
  nav: number | null;
  value: number;
}

export interface ParsedCAS {
  equities: CASEquityHolding[];
  mutualFunds: CASMutualFund[];
  statementDate: string | null;
}

export interface DBPortfolioHolding {
  user_id: string;
  isin: string;
  ticker: string | null;
  name: string;
  quantity: number;
  value: number | null;
  source: 'cas';
}

export interface DBMutualFund {
  user_id: string;
  isin: string | null;
  scheme_name: string;
  units: number;
  nav: number | null;
  value: number | null;
}
