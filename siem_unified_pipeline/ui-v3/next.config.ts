import type { NextConfig } from "next";

const basePath = process.env.NEXT_PUBLIC_BASEPATH || '/ui/v3';

// Bundle analyzer for orphan detection
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});

const nextConfig: NextConfig = {
  basePath,
  reactStrictMode: true,
  poweredByHeader: false,
  output: 'standalone',
  // Generate detailed build traces for file usage analysis
  outputFileTracingRoot: require('path').join(__dirname, '../../'),
  // Temporarily disable ESLint during build for transparency cleanup
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default withBundleAnalyzer(nextConfig);
