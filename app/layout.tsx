// app/layout.tsx

import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Sidebar from '@/components/layout/Sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import QueryProvider from '@/components/providers/QueryProvider';
import { AuthProvider } from '@/components/providers/AuthProvider';

const inter = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'AlphaOS',
  description: 'Investor-grade portfolio analytics powered by your Google Sheet watchlist.',
  keywords: ['stocks', 'portfolio', 'watchlist', 'analytics', 'AlphaOS'],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`dark ${inter.variable}`}>
      <body className={`${inter.className} bg-background text-foreground antialiased`}>
        <AuthProvider>
          <QueryProvider>
            <TooltipProvider>
              <div className="flex min-h-screen">
                <Sidebar />
                <main className="flex-1 ml-56 min-h-screen overflow-x-hidden">
                  {children}
                </main>
              </div>
            </TooltipProvider>
          </QueryProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
