'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

export default function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(() =>
    new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 5 * 60 * 1000, // 5 min
          refetchInterval: 5 * 60 * 1000, // auto-refresh every 5 min
          retry: 2,
        },
      },
    })
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
