'use client';

// Despite the filename, this component now renders as a horizontal top nav
// on desktop (no more left sidebar) and a bottom tab bar on mobile. The
// file name stays for backwards-compatibility with imports — feel free to
// rename to AppNav later if you want.

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart2, TrendingUp, Filter, RefreshCw, Activity, Shield, LockOpen, Wallet } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/components/providers/AuthProvider';

export default function Sidebar() {
  const pathname = usePathname();
  const [lastUpdated, setLastUpdated] = useState<string>('—');
  const [refreshing, setRefreshing] = useState(false);
  const { role, logout } = useAuth();
  const queryClient = useQueryClient();
  const activeFilter = typeof window === 'undefined'
    ? undefined
    : new URLSearchParams(window.location.search).get('filter')?.toUpperCase();
  const navItems = role === 'owner'
    ? [
        { href: '/dashboard', label: 'Watchlist', icon: BarChart2 },
        { href: '/portfolio', label: 'Portfolio', icon: TrendingUp },
        { href: '/analytics', label: 'Dashboard', icon: Filter },
        { href: '/nsdl',      label: 'Net Worth', icon: Wallet },
      ]
    : [
        { href: '/dashboard', label: 'Watchlist', icon: BarChart2 },
        { href: '/screener', label: 'Themes', icon: Filter },
      ];

  const mobileNavItems = role === 'owner'
    ? [
        { href: '/dashboard', label: 'Watchlist', icon: BarChart2 },
        { href: '/portfolio', label: 'Portfolio', icon: TrendingUp },
        { href: '/nsdl',      label: 'Net Worth', icon: Wallet },
        { href: '/screener',  label: 'Themes',    icon: Filter },
      ]
    : [
        { href: '/dashboard', label: 'Watchlist', icon: BarChart2 },
        { href: '/screener',  label: 'Themes',    icon: Filter },
        { href: '/login',     label: 'Owner',     icon: Shield },
      ];

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      // 1) Bust the server-side cache so the next read pulls fresh from
      //    Yahoo/Sheets. Fire-and-forget — the response itself isn't useful
      //    here, we just want the side effect of populating Upstash.
      fetch(`/api/stocks?refresh=true&t=${Date.now()}`, { cache: 'no-store' }).catch(() => {});
      // 2) Tell React Query every cached query is stale. This triggers an
      //    immediate refetch on the currently-visible page so the new
      //    server data lands without a page reload.
      await queryClient.invalidateQueries();
      const now = Date.now();
      localStorage.setItem('lastRefresh', now.toString());
      setLastUpdated(new Date(now).toLocaleTimeString());
    } catch {}
    setRefreshing(false);
  }, [queryClient]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      const ts = localStorage.getItem('lastRefresh');
      if (ts) setLastUpdated(new Date(parseInt(ts)).toLocaleTimeString());
    }, 0);

    return () => window.clearTimeout(id);
  }, []);

  return (
    <>
      {/* Desktop top nav — horizontal bar, ~56px tall. Replaces the old 224px
          left sidebar so the watchlist table gets the full viewport width. */}
      <header className="hidden md:flex sticky top-0 z-40 h-14 items-center gap-4 border-b border-border bg-sidebar/95 backdrop-blur px-5">
        {/* Logo */}
        <Link href="/dashboard" className="flex items-center gap-2.5 shrink-0 hover:opacity-80 transition-opacity">
          <div className="w-8 h-8 rounded-lg gradient-indigo flex items-center justify-center shadow-sm">
            <Activity className="w-4 h-4 text-white" />
          </div>
          <div className="text-sm font-700 text-foreground leading-none">AlphaOS</div>
        </Link>

        {/* Primary nav */}
        <nav className="flex items-center gap-1">
          {navItems.map(({ href, label, icon: Icon }) => {
            const isActive = pathname === href || pathname.startsWith(href + '/');
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-600 transition-colors ${
                  isActive
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-foreground/5'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Right actions */}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            title={`Last updated ${lastUpdated}`}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-all"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-primary' : ''}`} />
            <span className="hidden lg:inline">Refresh</span>
          </button>

          {role === 'owner' ? (
            <button
              onClick={logout}
              title="Lock portfolio"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs text-primary hover:bg-foreground/5 transition-all font-600"
            >
              <LockOpen className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">Lock</span>
            </button>
          ) : (
            <Link
              href="/login"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-all"
            >
              <Shield className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">Owner Login</span>
            </Link>
          )}
        </div>
      </header>

      {/* Mobile bottom tab bar — unchanged */}
      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur md:hidden">
        <div
          className="mx-auto grid max-w-md gap-1"
          style={{ gridTemplateColumns: `repeat(${mobileNavItems.length}, minmax(0, 1fr))` }}
        >
          {mobileNavItems.map(({ href, label, icon: Icon }) => {
            const isActive = pathname === href || pathname.startsWith(href + '/');
            const portfolioActive = href === '/portfolio' && (pathname === '/portfolio' || (pathname === '/dashboard' && activeFilter === 'PORTFOLIO'));
            const watchlistActive = href === '/dashboard' && pathname === '/dashboard' && activeFilter !== 'PORTFOLIO';
            const active = portfolioActive || watchlistActive || (href !== '/dashboard' && isActive);
            return (
              <Link
                key={href}
                href={href}
                className={`flex flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 text-[11px] font-600 transition-colors ${active ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-foreground/5'}`}
              >
                <Icon className={`h-4 w-4 ${active ? 'text-primary' : 'text-muted-foreground'}`} />
                {label}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
