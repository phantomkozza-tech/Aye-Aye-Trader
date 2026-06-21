import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  async rewrites() {
    // Serve the static landing page (public/home.html) at "/". Middleware
    // redirects signed-in users to /dashboard before this applies, so only
    // logged-out visitors ever reach the landing.
    return {
      beforeFiles: [{ source: "/", destination: "/home.html" }],
      afterFiles: [],
      fallback: [],
    };
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
