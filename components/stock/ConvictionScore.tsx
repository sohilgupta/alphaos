'use client';

import { useState, useEffect } from 'react';
import { Star } from 'lucide-react';
import { Slider } from '@/components/ui/slider';

interface Props {
  ticker: string;
}

export default function ConvictionScore({ ticker }: Props) {
  const key = `conviction_${ticker}`;
  const [score, setScore] = useState<number>(5);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(key);
    if (stored) setScore(parseInt(stored, 10));
  }, [ticker]);

  const handleChange = (val: number[]) => {
    const v = val[0];
    setScore(v);
    localStorage.setItem(key, v.toString());
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const label = score <= 2 ? 'Very Low' : score <= 4 ? 'Low' : score <= 6 ? 'Medium' : score <= 8 ? 'High' : 'Very High';
  const color = score <= 3 ? 'text-loss' : score <= 6 ? 'text-yellow-400' : 'text-gain';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {Array.from({ length: 10 }).map((_, i) => (
            <Star
              key={i}
              className={`w-4 h-4 transition-colors ${
                i < score ? 'fill-primary text-primary' : 'text-muted-foreground/30'
              }`}
            />
          ))}
        </div>
        <div className="text-right">
          <span className={`text-xl font-800 tabular-nums ${color}`}>{score}</span>
          <span className="text-muted-foreground">/10</span>
          <div className={`text-xs font-500 ${color}`}>{label}</div>
        </div>
      </div>
      <Slider
        value={[score]}
        min={1}
        max={10}
        step={1}
        onValueChange={handleChange}
        className="w-full"
      />
      <p className="text-xs text-muted-foreground">
        Your personal conviction in this investment. Saved locally.
        {saved && <span className="text-gain ml-2">✓ Saved</span>}
      </p>
    </div>
  );
}
