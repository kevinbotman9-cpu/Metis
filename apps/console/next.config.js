/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // The e2e harness builds into its own directory so it can run beside a
  // person's `next dev`: Next 16 locks `<distDir>/lock` and refuses a second
  // dev server on the same one. Everybody else gets the default. G-035.
  distDir: process.env.NEXT_DIST_DIR || '.next',
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
