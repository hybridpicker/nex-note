import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

const rootDir = process.cwd();
const standaloneDir = path.join(rootDir, '.next', 'standalone');
const standaloneNextDir = path.join(standaloneDir, '.next');
const sourceStaticDir = path.join(rootDir, '.next', 'static');
const targetStaticDir = path.join(standaloneNextDir, 'static');
const sourcePublicDir = path.join(rootDir, 'public');
const targetPublicDir = path.join(standaloneDir, 'public');

await mkdir(standaloneNextDir, { recursive: true });
await rm(targetStaticDir, { recursive: true, force: true });
await rm(targetPublicDir, { recursive: true, force: true });
await cp(sourceStaticDir, targetStaticDir, { recursive: true });
await cp(sourcePublicDir, targetPublicDir, { recursive: true });

console.log('Prepared Next standalone assets for Electron packaging.');
