/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  // The dev overlay injects its own focusable elements ahead of the page, which
  // makes the real tab order untestable: the skip link was the fourth stop
  // rather than the first. Errors are still surfaced without it.
  devIndicators: false,
  typescript: {
    tsconfigPath: './tsconfig.json',
  },
  logging: {
    fetches: {
      fullUrl: true,
    },
  },
  // No external scripts in air-gapped deployments
  headers: async () => [
    {
      source: '/(.*)',
      headers: [
        {
          key: 'X-Content-Type-Options',
          value: 'nosniff',
        },
        {
          key: 'X-Frame-Options',
          value: 'DENY',
        },
        {
          key: 'X-XSS-Protection',
          value: '1; mode=block',
        },
      ],
    },
  ],
};

module.exports = nextConfig;
