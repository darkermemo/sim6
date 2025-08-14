import type { NextConfig } from "next";

const basePath = process.env.NEXT_PUBLIC_BASEPATH || '/ui/v3';

const nextConfig: NextConfig = {
  basePath,
  reactStrictMode: true,
  poweredByHeader: false,
};

export default nextConfig;
