import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: process.env.NEXT_PUBLIC_BASEPATH || '',
  reactStrictMode: true,
  poweredByHeader: false,
};

export default nextConfig;
