import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Remove basePath for now to fix API routing
  // basePath: process.env.NEXT_PUBLIC_BASEPATH || '',
  reactStrictMode: true,
  poweredByHeader: false,
};

export default nextConfig;
