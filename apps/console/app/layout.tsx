import type { Metadata } from 'next';
import { ReactNode } from 'react';
import { Inter_Tight } from 'next/font/google';
import { RootLayoutClient } from './layout-client';
import './globals.css';

/**
 * Inter Tight, self-hosted by next/font: no request leaves the machine, which
 * the air-gapped deployment assumption in next.config.js requires. Exposed as a
 * CSS variable so the token layer stays the single source of typographic truth.
 *
 * Tight rather than plain Inter because the design direction asks for "one
 * family with a strong numeric set, because most of this product is numbers in
 * tables" and names this one. It is a swap, not an addition — the payload does
 * not grow.
 */
const inter = Inter_Tight({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'METIS Console',
  description: 'AI-native decision platform',
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html
      lang="en"
      className={inter.variable}
      data-theme="light"
      // The inline script below sets data-density and color-scheme before
      // hydration, so the server markup deliberately differs from the client.
      suppressHydrationWarning
    >
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta httpEquiv="X-UA-Compatible" content="ie=edge" />
        {/*
          Set the theme before first paint. Without this the browser renders
          the light default for a frame and the console flashes white on every
          load, which is the single most obvious tell of a bolted-on dark mode.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('metis.theme.scheme')||'light';var d=localStorage.getItem('metis.theme.density')||'comfortable';var r=document.documentElement;r.setAttribute('data-theme',t);r.setAttribute('data-density',d);r.style.colorScheme=t;}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`,
          }}
        />
      </head>
      <body className="bg-page text-content">
        <RootLayoutClient>{children}</RootLayoutClient>
      </body>
    </html>
  );
}
