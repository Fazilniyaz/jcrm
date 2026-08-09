import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit .next/standalone so the Docker image ships a minimal self-contained
  // server (node server.js) instead of the whole node_modules tree.
  output: "standalone",
};

export default nextConfig;
