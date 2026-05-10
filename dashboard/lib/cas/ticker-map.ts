import { db } from '@/lib/db/supabase';

// Seed map: common Nifty 50 + large-cap ISINs → NSE tickers (yahoo-finance2 format with .NS suffix)
const SEED: Record<string, string> = {
  'INE002A01018': 'RELIANCE.NS',
  'INE040A01034': 'HDFCBANK.NS',
  'INE009A01021': 'INFY.NS',
  'INE467B01029': 'TCS.NS',
  'INE030A01027': 'WIPRO.NS',
  'INE007A01017': 'WIPRO.NS',
  'INE179A01014': 'WIPRO.NS',
  'INE062A01020': 'SBIN.NS',
  'INE397D01024': 'AXISBANK.NS',
  'INE238A01034': 'AXISBANK.NS',
  'INE095A01012': 'INDUSINDBK.NS',
  'INE038A01020': 'HINDUNILVR.NS',
  'INE155A01022': 'ASIANPAINT.NS',
  'INE814H01011': 'TITAN.NS',
  'INE021A01026': 'IOC.NS',
  'INE070A01015': 'BPCL.NS',
  'INE694A01020': 'EICHERMOT.NS',
  'INE481G01011': 'POWERGRID.NS',
  'INE115A01026': 'LT.NS',
  'INE256A01028': 'JSWSTEEL.NS',
  'INE858B01029': 'TECHM.NS',
  'INE322A01010': 'MARUTI.NS',
  'INE585B01010': 'BAJFINANCE.NS',
  'INE918I01026': 'BAJAJFINSV.NS',
  'INE047A01021': 'BHARTIARTL.NS',
  'INE476A01022': 'SUNPHARMA.NS',
  'INE236A01020': 'NTPC.NS',
  'INE121A01024': 'COALINDIA.NS',
  'INE043A01021': 'DRREDDY.NS',
  'INE191A01025': 'TATASTEEL.NS',
  'INE364A01012': 'NESTLEIND.NS',
  'INE018A01030': 'CIPLA.NS',
  'INE758T01015': 'ADANIPORTS.NS',
  'INE075A01022': 'DIVISLAB.NS',
  'INE683A01023': 'GRASIM.NS',
  'INE669C01036': 'KOTAKBANK.NS',
  'INE216A01030': 'ONGC.NS',
  'INE066A01021': 'HINDALCO.NS',
  'INE090A01021': 'ICICIBANK.NS',
  'INE742F01042': 'HCLTECH.NS',
  'INE860A01027': 'HCLTECH.NS',
  'INE774D01024': 'BAJAJ-AUTO.NS',
  'INE296A01024': 'BAJAJ-AUTO.NS',
  'INE148A01028': 'M&M.NS',
  'INE917I01010': 'ULTRACEMCO.NS',
  'INE001A01036': 'ADANIENT.NS',
  'INE336A01010': 'MCDOWELL-N.NS',
  'INE752E01010': 'ITC.NS',
  'INE274J01014': 'ZOMATO.NS',
  'INE274D01025': 'ICICIGI.NS',
  'INE733E01010': 'APOLLOHOSP.NS',
  'INE213A01029': 'HAVELLS.NS',
  'INE647O01011': 'NYKAA.NS',
  'INE239A01016': 'TATAPOWER.NS',
  'INE176B01034': 'MUTHOOTFIN.NS',
  'INE404A01024': 'TATACONSUM.NS',
  'INE126M01021': 'BAJAJHLDNG.NS',
  'INE101A01036': 'TATAMOTORS.NS',
  'INE059A01026': 'HINDZINC.NS',
  'INE361B01024': 'SRF.NS',
  'INE245A01021': 'BOSCHLTD.NS',
  'INE129A01019': 'GAIL.NS',
  'INE261F01014': 'IRCTC.NS',
  'INE495A01023': 'LUPIN.NS',
  'INE528G01035': 'DELHIVERY.NS',
  'INE765G01017': 'POLICYBZR.NS',
  'INE685A01028': 'OIL.NS',
  'INE406A01037': 'NHPC.NS',
  'INE787G01036': 'PAYTM.NS',
  'INE584A01023': 'TATACOMM.NS',
  'INE464A01028': 'BANKBARODA.NS',
  'INE749A01030': 'BRITANNIA.NS',
  'INE0J1Y01017': 'ADANIGREEN.NS',
  'INE910H01017': 'ADANITRANS.NS',
  'INE470A01017': 'COLPAL.NS',
  'INE175A01038': 'PIIND.NS',
  'INE303R01014': 'PERSISTENT.NS',
  'INE266F01018': 'MPHASIS.NS',
  'INE571A01020': 'AMBUJACEM.NS',
  'INE012A01025': 'ACC.NS',
  'INE319A01020': 'RECLTD.NS',
  'INE202E01016': 'PFC.NS',
  'INE257A01026': 'SAIL.NS',
  'INE532F01054': 'NAUKRI.NS',
  'INE208A01029': 'MARICO.NS',
  'INE081A01020': 'TATAELXSI.NS',
};

// Cached merged map (seed + db)
let mapCache: Map<string, string> | null = null;
let mapCacheExpiry = 0;
const MAP_TTL = 60 * 60 * 1000; // 1 hr

async function getMap(): Promise<Map<string, string>> {
  if (mapCache && Date.now() < mapCacheExpiry) return mapCache;

  const merged = new Map<string, string>(Object.entries(SEED));

  try {
    const { data } = await db()
      .from('isin_ticker_map')
      .select('isin, ticker');
    if (data) {
      for (const row of data) merged.set(row.isin, row.ticker);
    }
  } catch {
    // DB not configured yet — use seed only
  }

  mapCache = merged;
  mapCacheExpiry = Date.now() + MAP_TTL;
  return merged;
}

export async function mapToTicker(isin: string): Promise<string | null> {
  const map = await getMap();
  return map.get(isin) ?? null;
}

export async function mapBatch(isins: string[]): Promise<Map<string, string | null>> {
  const map = await getMap();
  const result = new Map<string, string | null>();
  for (const isin of isins) result.set(isin, map.get(isin) ?? null);
  return result;
}

export async function upsertMapping(isin: string, ticker: string) {
  mapCache = null; // invalidate
  await db()
    .from('isin_ticker_map')
    .upsert({ isin, ticker, updated_at: new Date().toISOString() });
}
