import type { Metadata } from 'next';
import { ReactNode } from 'react';
import { RootLayoutClient } from './layout-client';
import './globals.css';

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
    <html lang="en">
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
