import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Compile the shared workspace package (shipped as TypeScript source) as
  // part of the Next build instead of expecting a pre-built dist.
  transpilePackages: ['@lmsy/shared'],
  eslint: {
    // Linting runs once at the repo root via `pnpm lint` (flat config), so skip
    // Next's redundant build-time lint (which can't discover the root config).
    ignoreDuringBuilds: true,
  },
}

export default nextConfig
