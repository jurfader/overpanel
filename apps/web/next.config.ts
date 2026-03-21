import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  output: 'standalone',
  // Required for standalone mode in pnpm monorepos:
  // tells Next.js the monorepo root so workspace packages are traced correctly
  outputFileTracingRoot: path.join(__dirname, '../../'),
};

export default nextConfig;
