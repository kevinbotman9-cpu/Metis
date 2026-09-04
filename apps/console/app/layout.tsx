import type { Metadata } from 'next';
import { ReactNode } from 'react';
import { Inter } from 'next/font/google';
import { RootLayoutClient } from './layout-client';
import './globals.css';

/**
 * Inter, self-hosted by next/font: no request leaves the machine, which the
 * air-gapped deployment assumption in next.config.js requires. Exposed as a CSS
 * variable so the token layer stays the single source of typographic truth.
 */
const inter = Inter({
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
    <html lang="en" className={inter.variable}>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta httpEquiv="X-UA-Compatible" content="ie=edge" />
      </head>
      <body className="bg-page text-content">
        <RootLayoutClient>{children}</RootLayoutClient>
      </body>
    </html>
  );
}
