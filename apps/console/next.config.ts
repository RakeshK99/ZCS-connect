import type { NextConfig } from 'next';

// PLAYGROUND=1 builds a static export for GitHub Pages (served under a sub-path).
// Security headers are set by the host there, so headers() only applies to normal builds.
const playground = process.env.PLAYGROUND === '1';
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || undefined;

const config: NextConfig = {
  transpilePackages: ['@zcs/core'],
  poweredByHeader: false,
  ...(playground ? { output: 'export' as const, basePath, trailingSlash: true, images: { unoptimized: true } } : { headers }),
};

async function headers() {
  return [{
    source: '/(.*)',
    headers: [
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    ],
  }];
}

export default config;
