import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Compile the shared workspace package (shipped as TypeScript source) as
  // part of the Next build instead of expecting a pre-built dist.
  transpilePackages: ['@lmsy/shared'],
}

export default nextConfig
