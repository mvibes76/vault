import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "img.youtube.com" },
      { protocol: "https", hostname: "drive.google.com" },
      { protocol: "https", hostname: "vumbnail.com" },
      { protocol: "https", hostname: "www.dailymotion.com" },
      { protocol: "https", hostname: "cdn-cf-east.streamable.com" },
      { protocol: "https", hostname: "**" },
    ],
  },
};

export default nextConfig;
