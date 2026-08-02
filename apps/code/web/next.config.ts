import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: [
    "electron",
    "@cursor/sdk",
    "ai-sdk-provider-cursor-sdk",
  ],
};

export default nextConfig;
