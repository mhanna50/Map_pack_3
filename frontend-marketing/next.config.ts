import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // Keep the marketing app scoped to its own lockfile/workspace
    root: __dirname,
  },
};

export default nextConfig;
