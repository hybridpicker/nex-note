#!/usr/bin/env node

import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

async function prepareLiveShell(root, outputDirectory) {
  const sourceShellDirectory = path.join(root, 'native-shell');
  await cp(sourceShellDirectory, outputDirectory, { recursive: true });
  console.log('Prepared the iPad live-development shell.');
}

async function prepareBundledApp(root, outputDirectory) {
  const staticPagePath = path.join(root, '.next', 'server', 'app', 'ipad.html');
  const nextStaticDirectory = path.join(root, '.next', 'static');
  const publicDirectory = path.join(root, 'public');
  const html = await readFile(staticPagePath, 'utf8');
  await writeFile(path.join(outputDirectory, 'index.html'), html);
  await mkdir(path.join(outputDirectory, '_next'), { recursive: true });
  await cp(nextStaticDirectory, path.join(outputDirectory, '_next', 'static'), {
    recursive: true,
  });
  await cp(publicDirectory, outputDirectory, { recursive: true });
  console.log('Prepared the standalone iPad web bundle.');
}

export async function prepareIpadWeb({ root = process.cwd(), mode }) {
  if (mode !== 'bundle' && mode !== 'live') {
    throw new Error('The iPad web mode must be either bundle or live.');
  }

  const outputDirectory = path.join(root, '.native-ipad');
  await rm(outputDirectory, { recursive: true, force: true });
  await mkdir(outputDirectory, { recursive: true });

  if (mode === 'bundle') {
    await prepareBundledApp(root, outputDirectory);
  } else {
    await prepareLiveShell(root, outputDirectory);
  }
}

async function main() {
  const bundleMode = process.argv.includes('--bundle');
  const liveMode = process.argv.includes('--live');
  if (bundleMode === liveMode) {
    throw new Error('Choose exactly one iPad web mode: --bundle or --live.');
  }
  await prepareIpadWeb({ mode: bundleMode ? 'bundle' : 'live' });
}

const entryPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (entryPath === import.meta.url) {
  main().catch((error) => {
    console.error(
      `Preparing iPad web assets failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  });
}
