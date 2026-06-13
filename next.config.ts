import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  transpilePackages: [
    "@blocknote/core",
    "@blocknote/react",
    "@blocknote/mantine",
    "@mantine/core",
    "@mantine/hooks",
  ],
};

export default nextConfig;
