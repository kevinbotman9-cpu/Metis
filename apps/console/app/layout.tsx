import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'METIS Console',
  description: 'AI-native decision platform console',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="light">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta httpEquiv="X-UA-Compatible" content="ie=edge" />
      </head>
      <body className="bg-base-100 text-base-900">
        {/* TODO: Auth context */}
        {/* TODO: Query client provider */}
        {/* TODO: Theme provider */}
        {children}
      </body>
    </html>
  );
}
