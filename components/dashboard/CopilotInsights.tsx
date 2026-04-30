'use client';

import { useState } from 'react';
import { Sparkles, AlertTriangle, TrendingUp, Eye, Layers, Target, X } from 'lucide-react';
import type { MergedStock } from '@/lib/types';
import type { CopilotInsight, InsightType } from '@/app/api/copilot/route';

interface Props {
  stocks: MergedStock[];
  region?: 'US' | 'INDIA';
}

const INSIGHT_META: Record<InsightType, { icon: React.ElementType; label: string; color: string; bg: string }> = {
  missed_opportunity:  { icon: TrendingUp,    label: 'Missed Opportunity',  color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
  overexposure:        { icon: Layers,        label: 'Overexposure',        color: 'text-orange-400',  bg: 'bg-orange-500/10 border-orange-500/20'  },
  underperformance:    { icon: AlertTriangle, label: 'Underperformance',    color: 'text-red-400',     bg: 'bg-red-500/10 border-red-500/20'        },
  conviction_gap:      { icon: Target,        label: 'Conviction Gap',      color: 'text-blue-400',    bg: 'bg-blue-500/10 border-blue-500/20'      },
  portfolio_blind_spot:{ icon: Eye,           label: 'Portfolio Blind Spot',color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20'  },
};

const SEVERITY_STYLES: Record<CopilotInsight['severity'], string> = {
  high:   'bg-red-500/15 text-red-400 border border-red-500/25',
  medium: 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/25',
  low:    'bg-slate-500/15 text-slate-400 border border-slate-500/25',
};

export default function CopilotInsights({ stocks, region }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [insights, setInsights] = useState<CopilotInsight[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runAnalysis() {
    setLoading(true);
    setError(null);
    setInsights(null);
    setOpen(true);

    try {
      const res = await fetch('/api/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stocks, region }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }

      const data = await res.json();
      setInsights(data.insights ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={runAnalysis}
        disabled={loading}
        className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-500 border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
      >
        <Sparkles className={`w-4 h-4 ${loading ? 'animate-pulse' : ''}`} />
        {loading ? 'Analyzing…' : 'AI Copilot'}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div className="w-full max-w-2xl max-h-[85vh] flex flex-col glass-card border border-white/12 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/8 shrink-0">
              <div className="flex items-center gap-2.5">
                <Sparkles className="w-4 h-4 text-primary" />
                <span className="font-600 text-foreground text-sm">Investment Copilot</span>
                {region && (
                  <span className="text-xs text-muted-foreground bg-secondary/60 px-2 py-0.5 rounded-full border border-white/8">
                    {region === 'US' ? '🇺🇸 US' : '🇮🇳 India'}
                  </span>
                )}
              </div>
              <button
                onClick={() => setOpen(false)}
                className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md hover:bg-white/5"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {loading && (
                <div className="flex flex-col items-center justify-center py-14 gap-3">
                  <Sparkles className="w-7 h-7 text-primary animate-pulse" />
                  <p className="text-sm text-muted-foreground">Analyzing your portfolio…</p>
                  <p className="text-xs text-muted-foreground/50">Usually takes 10–20 seconds</p>
                </div>
              )}

              {error && (
                <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                  {error}
                </div>
              )}

              {insights?.map((insight, i) => {
                const meta = INSIGHT_META[insight.type];
                const Icon = meta.icon;
                return (
                  <div key={i} className={`rounded-xl border p-4 ${meta.bg}`}>
                    <div className="flex items-start gap-3">
                      <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${meta.color}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-2">
                          <span className={`text-xs font-600 ${meta.color}`}>{meta.label}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded-full font-500 ${SEVERITY_STYLES[insight.severity]}`}>
                            {insight.severity}
                          </span>
                        </div>
                        <p className="text-sm text-foreground/85 leading-relaxed">{insight.message}</p>
                      </div>
                    </div>
                  </div>
                );
              })}

              {insights?.length === 0 && !loading && (
                <div className="text-center py-10 text-muted-foreground text-sm">
                  No insights generated. Add more portfolio data and try again.
                </div>
              )}
            </div>

            {/* Footer */}
            {!loading && insights && (
              <div className="px-5 py-3 border-t border-white/8 flex items-center justify-between shrink-0">
                <span className="text-xs text-muted-foreground">
                  {insights.length} insight{insights.length !== 1 ? 's' : ''} · nemotron-ultra-253b
                </span>
                <button
                  onClick={runAnalysis}
                  className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors font-500"
                >
                  <Sparkles className="w-3 h-3" /> Refresh
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
