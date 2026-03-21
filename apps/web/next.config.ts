import type { NextConfig } from "next";
import path from "path";
import { readFileSync } from "fs";

// Read version from monorepo root package.json at build time
let APP_VERSION = '0.1.0';
try {
  const rootPkg = JSON.parse(readFileSync(path.join(__dirname, '../../package.json'), 'utf-8'));
  APP_VERSION = rootPkg.version ?? APP_VERSION;
} catch {}

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '../../'),
  env: {
    NEXT_PUBLIC_APP_VERSION: APP_VERSION,
  },
};

export default nextConfig;
