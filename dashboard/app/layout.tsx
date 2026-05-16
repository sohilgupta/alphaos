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
        {/* Set theme BEFORE paint to avoid a flash. Reads localStorage 'theme'
            ('light'|'dark'), falls back to prefers-color-scheme, defaults to dark. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('alphaos.theme');if(!t){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}if(t==='dark'){document.documentElement.classList.add('dark');}}catch(e){document.documentElement.classList.add('dark');}})();`,
          }}
        />
      </head>
      <body className={`${inter.className} bg-background text-foreground antialiased`}>
        <AuthProvider>
          <QueryProvider>
            <TooltipProvider>
              <div className="flex min-h-screen">
                <Sidebar />
                <main className="flex-1 min-h-screen overflow-x-hidden pb-20 md:ml-56 md:pb-0">
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
