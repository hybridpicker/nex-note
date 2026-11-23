import type { NextConfig } from "next";
import { execSync } from "node:child_process";
import { siteLocalePathRedirects } from "./lib/site/locale";

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
  // Next 16.4 type-checks every file the tsconfig includes, so the known type errors in e2e/ and test/
  // (backlog 23) would fail the production build. The build checks the application only; `tsc -p .`
  // still checks everything.
  typescript: { tsconfigPath: 'tsconfig.build.json' },
  // `next dev` would otherwise write a "This is NOT the Next.js you know" block into AGENTS.md.
  agentRules: false,
  devIndicators: false,
  allowedDevOrigins: [
    '127.0.0.1',
    'localhost',
    ...(allowedDevOrigin ? [allowedDevOrigin] : []),
  ],
  env: {
    NEXT_PUBLIC_NEX_NOTE_GIT_BRANCH: process.env.NEXT_PUBLIC_NEX_NOTE_GIT_BRANCH ?? resolveGitBranch(),
  },
  async redirects() {
    return siteLocalePathRedirects();
  },
  outputFileTracingExcludes: {
    '/api/midi': ['next.config.ts'],
  },
};

export default nextConfig;
