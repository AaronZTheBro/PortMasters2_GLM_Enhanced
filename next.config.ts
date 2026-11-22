import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Allow local network access and common ngrok development tunnels.
  allowedDevOrigins: [
    "*.ngrok-free.app",
    "*.ngrok-free.dev",
    "*.ngrok.app",
    "*.ngrok.io",
    "192.*.*.*",
  ],
  // Hide the development badge because it overlaps bottom corner notices.
  devIndicators: false,
};

export default nextConfig;
