'use client';

import { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';

type Theme = 'light' | 'dark';

function readTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  const saved = localStorage.getItem('alphaos.theme');
  if (saved === 'light' || saved === 'dark') return saved;
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

export function ThemeToggle({ className = '' }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>('dark');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setTheme(readTheme());
    setMounted(true);
  }, []);

  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    if (next === 'dark') document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
    localStorage.setItem('alphaos.theme', next);
  };

  // Avoid hydration mismatch — render a stable placeholder until mounted.
  if (!mounted) {
    return <button aria-hidden className={`h-8 w-16 rounded-md border border-white/10 ${className}`} />;
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      className={`group inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-[11px] font-700 uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground ${className}`}
    >
      {theme === 'dark' ? (
        <>
          <Sun className="h-3.5 w-3.5" />
          Light
        </>
      ) : (
        <>
          <Moon className="h-3.5 w-3.5" />
          Dark
        </>
      )}
    </button>
  );
}
