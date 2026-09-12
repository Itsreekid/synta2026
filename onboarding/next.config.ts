import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Produces a self-contained build for Docker/Coolify deployments.
  // Only the necessary files are copied into the container image,
  // which significantly reduces its size.
  output: "standalone",

  // Explicitly set the workspace root for Turbopack (dev mode) so it doesn't
  // get confused by the multiple package-lock.json files in the monorepo.
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
