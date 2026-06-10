import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow the journal iframe/embed to reach Dropbox APIs
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
