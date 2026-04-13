import type { NextConfig } from 'next';
import { buildSecurityHeaders } from './security-headers';

// Define the base Next.js configuration
const baseConfig: NextConfig = {
  output: process.env.BUILD_STANDALONE === 'true' ? 'standalone' : undefined,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: buildSecurityHeaders()
      }
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'api.slingacademy.com',
        port: ''
      },
      {
        protocol: 'https',
        hostname: 'img.clerk.com',
        port: ''
      },
      {
        protocol: 'https',
        hostname: 'clerk.com',
        port: ''
      }
    ]
  },
  transpilePackages: [
    'geist',
    '@diffmint/contracts',
    '@diffmint/docs-content',
    '@diffmint/policy-engine',
    '@diffmint/review-core'
  ],
  webpack(config) {
    config.resolve ??= {};
    return config;
  },
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production'
  }
};

export default baseConfig;
