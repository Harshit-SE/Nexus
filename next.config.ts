import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow the data directory to be read/written at runtime
  serverExternalPackages: ["vectra"],
};

export default nextConfig;
