import type { CASEquityHolding, CASMutualFund } from './types';

function normalizeString(s: string): string {
  return s.toUpperCase().replace(/\s+/g, ' ').trim();
}

export function normalizeEquities(holdings: CASEquityHolding[]): CASEquityHolding[] {
  const byIsin = new Map<string, CASEquityHolding>();

  for (const h of holdings) {
    const isin = h.isin.trim().toUpperCase();
    const existing = byIsin.get(isin);
    if (existing) {
      // Aggregate across demat accounts
      byIsin.set(isin, {
        ...existing,
        quantity: existing.quantity + h.quantity,
        value: existing.value + h.value,
        marketPrice: h.marketPrice ?? existing.marketPrice,
        ticker: h.ticker ?? existing.ticker,
      });
    } else {
      byIsin.set(isin, { ...h, isin, name: normalizeString(h.name) });
    }
  }

  return Array.from(byIsin.values());
}

export function normalizeMutualFunds(funds: CASMutualFund[]): CASMutualFund[] {
  const byKey = new Map<string, CASMutualFund>();

  for (const f of funds) {
    const key = f.isin?.trim().toUpperCase() ?? normalizeString(f.schemeName);
    const existing = byKey.get(key);
    if (existing) {
      byKey.set(key, {
        ...existing,
        units: existing.units + f.units,
        value: existing.value + f.value,
        nav: f.nav ?? existing.nav,
      });
    } else {
      byKey.set(key, {
        ...f,
        isin: f.isin?.trim().toUpperCase() ?? null,
        schemeName: normalizeString(f.schemeName),
      });
    }
  }

  return Array.from(byKey.values()).filter(f => f.units > 0);
}
