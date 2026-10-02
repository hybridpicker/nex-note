// Downloads the FluidR3_GM instrument files used by lib/midi-instruments.ts into public/soundfonts/
// so playback works offline. FluidR3_GM is MIT-licensed; the files are not committed (see .gitignore).
// Usage: node scripts/fetch-soundfonts.mjs [--force]
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'public', 'soundfonts', 'FluidR3_GM');
const force = process.argv.includes('--force');
const BASE = 'https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM';

const source = await readFile(path.join(root, 'lib', 'midi-instruments.ts'), 'utf8');
const names = [...new Set([...source.matchAll(/soundfont:\s*'([a-z0-9_]+)'/g)].map((match) => match[1]))].sort();
await mkdir(outDir, { recursive: true });

let downloaded = 0;
let failed = 0;
for (const name of names) {
  const target = path.join(outDir, `${name}-mp3.js`);
  if (!force && await stat(target).then((info) => info.size > 0, () => false)) continue;
  try {
    const response = await fetch(`${BASE}/${name}-mp3.js`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    await writeFile(target, Buffer.from(await response.arrayBuffer()));
    downloaded += 1;
  } catch (error) {
    failed += 1;
    console.error(`Could not fetch ${name}: ${error.message}`);
  }
}
console.log(`Soundfonts: ${names.length} needed, ${downloaded} downloaded, ${failed} failed -> ${path.relative(root, outDir)}`);
process.exitCode = failed > 0 ? 1 : 0;
