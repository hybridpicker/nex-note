#!/usr/bin/env node

import { cpSync, existsSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';

const root = process.cwd();
const standaloneDir = join(root, '.next', 'standalone');
const staticSource = join(root, '.next', 'static');
const staticTargetRoot = join(standaloneDir, '.next');
const staticTarget = join(staticTargetRoot, 'static');
const publicSource = join(root, 'public');
const publicTarget = join(standaloneDir, 'public');

if (!existsSync(standaloneDir)) {
  console.warn('Standalone build directory not found; skipping asset sync.');
  process.exit(0);
}

mkdirSync(staticTargetRoot, { recursive: true });
if (existsSync(staticTarget)) rmSync(staticTarget, { recursive: true, force: true });
cpSync(staticSource, staticTarget, { recursive: true });

if (existsSync(publicSource)) {
  if (existsSync(publicTarget)) rmSync(publicTarget, { recursive: true, force: true });
  cpSync(publicSource, publicTarget, { recursive: true });
}

console.log('Synced Next standalone static and public assets.');
