import type { NextConfig } from "next";
import { execSync } from "node:child_process";

function resolveGitBranch() {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

const allowedDevOrigin = process.env.NEX_NOTE_ALLOWED_DEV_ORIGIN?.trim();

const nextConfig: NextConfig = {
  output: 'standalone',
  devIndicators: false,
  allowedDevOrigins: [
    '127.0.0.1',
    'localhost',
    ...(allowedDevOrigin ? [allowedDevOrigin] : []),
  ],
  env: {
    NEXT_PUBLIC_NEX_NOTE_GIT_BRANCH: process.env.NEXT_PUBLIC_NEX_NOTE_GIT_BRANCH ?? resolveGitBranch(),
  },
  outputFileTracingExcludes: {
    '/api/midi': ['next.config.ts'],
  },
};

export default nextConfig;
