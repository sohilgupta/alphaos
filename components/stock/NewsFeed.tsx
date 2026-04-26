'use client';

import { useQuery } from '@tanstack/react-query';
import { ExternalLink } from 'lucide-react';
import { formatTimeAgo } from '@/lib/format';
import { NewsItem } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';

interface Props { ticker: string }

async function fetchNews(ticker: string) {
  const res = await fetch(`/api/news/${ticker}`);
  return res.json();
}

export default function NewsFeed({ ticker }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['news', ticker],
    queryFn: () => fetchNews(ticker),
    staleTime: 15 * 60 * 1000,
  });

  const news: NewsItem[] = data?.news ?? [];

  return (
    <div className="space-y-2">
      {isLoading ? (
        Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full skeleton" />
        ))
      ) : news.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">No recent news found.</p>
      ) : (
        news.map((item, i) => (
          <a
            key={i}
            href={item.link}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-start gap-3 p-3 rounded-xl border border-white/5 hover:border-white/15 hover:bg-white/3 transition-all group"
          >
            {item.thumbnail && (
              <img
                src={item.thumbnail}
                alt=""
                className="w-12 h-12 rounded-lg object-cover flex-shrink-0 opacity-80"
              />
            )}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-500 text-foreground/90 group-hover:text-foreground line-clamp-2 leading-snug">
                {item.title}
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-muted-foreground">{item.publisher}</span>
                <span className="text-xs text-muted-foreground/50">·</span>
                <span className="text-xs text-muted-foreground">{formatTimeAgo(item.publishedAt)}</span>
              </div>
            </div>
            <ExternalLink className="w-3.5 h-3.5 text-muted-foreground/0 group-hover:text-muted-foreground/60 flex-shrink-0 mt-0.5 transition-colors" />
          </a>
        ))
      )}
    </div>
  );
}
