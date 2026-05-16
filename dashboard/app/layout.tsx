// app/layout.tsx

import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
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

const jbMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-jbmono',
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
    <html lang="en" className={`${inter.variable} ${jbMono.variable}`} suppressHydrationWarning>
      <head>
        {/* Set theme BEFORE paint to avoid a flash. Light is the default for
            any new device — the only way to land in dark mode is to explicitly
            toggle (which persists to localStorage). We ignore prefers-color-scheme
            so phones with system dark mode don't override our light default. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{if(localStorage.getItem('alphaos.theme')==='dark'){document.documentElement.classList.add('dark');}}catch(e){}})();`,
          }}
        />
      </head>
      <body className={`${inter.className} bg-background text-foreground antialiased`}>
        <AuthProvider>
          <QueryProvider>
            <TooltipProvider>
              {/* Sidebar now renders as a sticky top nav on desktop and a
                  fixed bottom tab bar on mobile — see components/layout/Sidebar.tsx.
                  The old md:ml-56 offset is gone; main takes full viewport width. */}
              <div className="flex min-h-screen flex-col">
                <Sidebar />
                <main className="flex-1 min-h-screen overflow-x-hidden pb-20 md:pb-0">
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
