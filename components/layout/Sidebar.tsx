'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart2, TrendingUp, Filter, RefreshCw, Activity, ChevronRight, Shield, LockOpen } from 'lucide-react';

import { useAuth } from '@/components/providers/AuthProvider';

export default function Sidebar() {
  const pathname = usePathname();
  const [lastUpdated, setLastUpdated] = useState<string>('—');
  const [refreshing, setRefreshing] = useState(false);
  const { role, logout } = useAuth();
  const navItems = role === 'owner'
    ? [
        { href: '/dashboard', label: 'Watchlist', icon: BarChart2 },
        { href: '/portfolio', label: 'Portfolio', icon: TrendingUp },
        { href: '/analytics', label: 'Dashboard', icon: Filter },
      ]
    : [
        { href: '/dashboard', label: 'Watchlist', icon: BarChart2 },
        { href: '/screener', label: 'Themes', icon: Filter },
      ];

  useEffect(() => {
    const ts = localStorage.getItem('lastRefresh');
    if (ts) setLastUpdated(new Date(parseInt(ts)).toLocaleTimeString());
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetch('/api/stocks?refresh=true');
      const now = Date.now();
      localStorage.setItem('lastRefresh', now.toString());
      setLastUpdated(new Date(now).toLocaleTimeString());
    } catch {}
    setRefreshing(false);
  }, []);

  return (
    <aside className="fixed left-0 top-0 h-full w-56 flex flex-col z-40"
      style={{ background: 'oklch(0.09 0.006 264)', borderRight: '1px solid oklch(1 0 0 / 8%)' }}>
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-5 border-b border-white/8">
        <div className="w-8 h-8 rounded-lg gradient-indigo flex items-center justify-center shadow-lg shadow-indigo-500/20">
          <Activity className="w-4 h-4 text-white" />
        </div>
        <div>
          <div className="text-sm font-700 text-foreground leading-none">AlphaOS</div>
          <div className="text-xs text-muted-foreground mt-0.5">Dashboard</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || pathname.startsWith(href + '/');
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-500 transition-all duration-150 group ${
                isActive
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-white/4'
              }`}
            >
              <Icon className={`w-4 h-4 transition-colors ${isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'}`} />
              {label}
              {isActive && <ChevronRight className="w-3 h-3 ml-auto text-primary/60" />}
            </Link>
          );
        })}
      </nav>

      {/* Actions */}
      <div className="p-3 border-t border-white/8 space-y-1">
        {role === 'owner' ? (
          <button
            onClick={logout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-primary hover:bg-white/4 transition-all font-600"
          >
            <LockOpen className="w-3.5 h-3.5" />
            <span className="flex-1 text-left">Lock Portfolio</span>
          </button>
        ) : (
          <Link
            href="/login"
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-white/4 transition-all"
          >
            <Shield className="w-3.5 h-3.5" />
            <span className="flex-1 text-left">Owner Login</span>
          </Link>
        )}

        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-white/4 transition-all"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-primary' : ''}`} />
          <span className="flex-1 text-left">Refresh Data</span>
        </button>
        <div className="px-3 mt-1 text-xs text-muted-foreground/60">
          Updated {lastUpdated}
        </div>
      </div>
    </aside>
  );
}
