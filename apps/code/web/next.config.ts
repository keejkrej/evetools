import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: [
    "@cursor/sdk",
    "ai-sdk-provider-cursor-sdk",
  ],
};

export default nextConfig;
