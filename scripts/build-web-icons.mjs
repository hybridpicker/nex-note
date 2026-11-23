#!/usr/bin/env node
// Builds the website's icons from the app icon itself, so the browser tab,
// the home-screen icon and the site header show exactly what the installed
// app shows in the Dock (assets/app-icon.png, the same image as the .icns and
// the iPad AppIcon).
//
// Usage: node scripts/build-web-icons.mjs
//
// Writes:
//   public/brand/nex-note-app-icon.png   512 px, header logo (shape kept)
//   public/brand/nex-note-app-icon-192.png  192 px, <link rel="icon">
//   public/brand/apple-touch-icon.png    180 px, opaque full-bleed tile;
//                                        iOS applies its own corner mask
//   app/favicon.ico                      16/32/48/256 px PNG-in-ICO

import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = process.cwd();
const SOURCE = path.join(root, 'assets', 'app-icon.png');
const BRAND = path.join(root, 'public', 'brand');

// The app icon is a white tile on a transparent 1024 px canvas, inset by 88 px
// on every side (macOS icon grid). The touch icon uses the tile alone.
const SOURCE_SIZE = 1024;
const TILE_INSET = 88;

async function png(size, out) {
  await sharp(SOURCE).resize(size, size, { kernel: 'lanczos3' }).png({ compressionLevel: 9 }).toFile(out);
  return out;
}

async function touchIcon(size, out) {
  const tile = SOURCE_SIZE - 2 * TILE_INSET;
  await sharp(SOURCE)
    .extract({ left: TILE_INSET, top: TILE_INSET, width: tile, height: tile })
    .flatten({ background: '#ffffff' })
    .resize(size, size, { kernel: 'lanczos3' })
    .png({ compressionLevel: 9 })
    .toFile(out);
  return out;
}

// ICO with embedded PNG images (supported by every current browser).
async function ico(sizes, out) {
  const images = await Promise.all(
    sizes.map((size) => sharp(SOURCE).resize(size, size, { kernel: 'lanczos3' }).png({ compressionLevel: 9 }).toBuffer()),
  );
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const entries = [];
  let offset = 6 + 16 * images.length;
  images.forEach((data, index) => {
    const size = sizes[index];
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    entries.push(entry);
  });
  await fs.writeFile(out, Buffer.concat([header, ...entries, ...images]));
  return out;
}

const meta = await sharp(SOURCE).metadata();
if (meta.width !== SOURCE_SIZE || meta.height !== SOURCE_SIZE) {
  throw new Error(`assets/app-icon.png must be ${SOURCE_SIZE}x${SOURCE_SIZE} (found ${meta.width}x${meta.height})`);
}
await fs.mkdir(BRAND, { recursive: true });
const written = [
  await png(512, path.join(BRAND, 'nex-note-app-icon.png')),
  await png(192, path.join(BRAND, 'nex-note-app-icon-192.png')),
  await touchIcon(180, path.join(BRAND, 'apple-touch-icon.png')),
  await ico([16, 32, 48, 256], path.join(root, 'app', 'favicon.ico')),
];
for (const file of written) console.log(`wrote ${path.relative(root, file)}`);
