#!/usr/bin/env node

// The packaged app ships electron/ and the Next standalone output, not the repository's
// node_modules. Runtime dependencies that the Electron main process needs (electron-updater) are
// therefore bundled into electron/vendor/ here, as part of `npm run electron:prep`.

import { build } from 'esbuild';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const outDir = path.join(root, 'electron', 'vendor');
mkdirSync(outDir, { recursive: true });

await build({
  stdin: {
    contents: "module.exports = require('electron-updater');",
    resolveDir: root,
    sourcefile: 'electron-updater-entry.cjs',
  },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['electron'],
  outfile: path.join(outDir, 'electron-updater.cjs'),
  legalComments: 'eof',
  logLevel: 'warning',
});

console.log('Bundled electron-updater into electron/vendor/.');
