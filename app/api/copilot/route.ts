import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { requireOwner } from '@/lib/auth';
import type { MergedStock } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export type InsightType =
  | 'missed_opportunity'
  | 'overexposure'
  | 'underperformance'
  | 'conviction_gap'
  | 'portfolio_blind_spot';

export interface CopilotInsight {
  type: InsightType;
  message: string;
  severity: 'high' | 'medium' | 'low';
}

interface CopilotRequestBody {
  stocks: MergedStock[];
  region?: 'US' | 'INDIA';
}

const SYSTEM_PROMPT = `You are an AI investment analyst.

Analyze structured JSON data of a user's watchlist and portfolio and generate actionable insights.

Focus on patterns, mismatches, and opportunities. Do NOT give generic advice. Do NOT repeat input data. Do NOT hallucinate. Prioritize decision-making insights.

Output ONLY valid JSON in this exact shape:
{
  "insights": [
    {
      "type": "missed_opportunity",
      "message": "...",
      "severity": "high"
    }
  ]
}

Required insight types (use exactly these strings):
- missed_opportunity: high-momentum watchlist stocks not in the portfolio
- overexposure: excessive concentration in a single theme, sector, or region
- underperformance: holdings with poor PnL or lagging return vs watchlist peers
- conviction_gap: stock in both watchlist and portfolio but under-allocated relative to its signal
- portfolio_blind_spot: holdings with deteriorating indicators the investor may be ignoring

Constraints:
- Max 6 insights total
- No duplicate insights
- Rank by importance (most critical first)
- severity must be: high, medium, or low
- message: 2–3 sentences, cite actual tickers and numbers, fully actionable`;

function buildUserPrompt(stocks: MergedStock[], region?: string): string {
  const watchlist = stocks.filter(s => s.isInWatchlist && (!region || s.region === region));
  const portfolio = stocks.filter(s => s.isInPortfolio && (!region || s.region === region));

  const watchlistData = watchlist.map(s => ({
    ticker: s.ticker,
    name: s.name,
    category: s.category,
    region: s.region,
    price: s.live?.price ?? null,
    changePercent1D: s.live?.changePercent ?? null,
    gain1W: s.gain1W,
    gain1M: s.gain1M,
    gain1Y: s.gain1Y,
    fairPrice: s.fairPrice,
    potentialGain: s.potentialGain,
    inPortfolio: s.isInPortfolio,
  }));

  const portfolioData = portfolio.map(s => ({
    ticker: s.ticker,
    name: s.name,
    category: s.category,
    region: s.region,
    quantity: s.quantity ?? s.portfolioData?.quantity ?? null,
    avgBuyPrice: s.avgBuyPrice ?? s.portfolioData?.avgBuyPrice ?? null,
    investedValue: s.portfolioData?.investedValue ?? null,
    currentValue: s.currentValue ?? null,
    pnl: s.pnl ?? null,
    pnlPercent: (s.pnl != null && s.portfolioData?.investedValue)
      ? (s.pnl / s.portfolioData.investedValue) * 100
      : null,
    currentPrice: s.live?.price ?? null,
    changePercent1D: s.live?.changePercent ?? null,
    gain1W: s.gain1W,
    gain1M: s.gain1M,
    gain1Y: s.gain1Y,
    inWatchlist: s.isInWatchlist,
  }));

  return JSON.stringify({ watchlist: watchlistData, portfolio: portfolioData }, null, 2);
}

function validateInsights(raw: unknown): CopilotInsight[] {
  const VALID_TYPES = new Set<InsightType>([
    'missed_opportunity', 'overexposure', 'underperformance',
    'conviction_gap', 'portfolio_blind_spot',
  ]);
  const VALID_SEVERITIES = new Set(['high', 'medium', 'low']);

  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as { insights?: unknown }).insights)) {
    throw new Error('Invalid response shape');
  }

  return ((raw as { insights: unknown[] }).insights)
    .filter((i): i is CopilotInsight =>
      typeof i === 'object' && i !== null &&
      VALID_TYPES.has((i as CopilotInsight).type) &&
      typeof (i as CopilotInsight).message === 'string' &&
      VALID_SEVERITIES.has((i as CopilotInsight).severity)
    )
    .slice(0, 6);
}

export async function POST(request: NextRequest) {
  try {
    await requireOwner(request);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });
  }

  let body: CopilotRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { stocks, region } = body;
  if (!stocks?.length) {
    return NextResponse.json({ error: 'No stocks provided' }, { status: 400 });
  }

  const client = new Anthropic({ apiKey });
  const userPrompt = buildUserPrompt(stocks, region);

  try {
    const stream = await client.messages.stream({
      model: 'claude-opus-4-7',
      max_tokens: 1500,
      thinking: { type: 'adaptive' },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: userPrompt,
              // @ts-ignore – cache_control is valid at runtime
              cache_control: { type: 'ephemeral' },
            },
          ],
        },
      ],
    });

    const message = await stream.finalMessage();

    const textBlock = message.content.find(b => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      return NextResponse.json({ error: 'No text response from Claude' }, { status: 500 });
    }

    const jsonMatch = textBlock.text.trim().match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: 'Could not parse JSON from response' }, { status: 500 });
    }

    const insights = validateInsights(JSON.parse(jsonMatch[0]));
    return NextResponse.json({ insights }, { status: 200 });
  } catch (err) {
    console.error('Copilot API error:', err);
    return NextResponse.json({ error: 'Failed to generate insights' }, { status: 500 });
  }
}
