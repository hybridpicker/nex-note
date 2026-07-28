import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { prepareIpadWeb } from '../scripts/prepare-ipad-web.mjs';

async function writeFixture(root: string, relativePath: string, content: string) {
  const filePath = path.join(root, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content);
}

test('prepareIpadWeb switches between a standalone bundle and the live shell', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'nex-note-ipad-web-'));

  try {
    await Promise.all([
      writeFixture(root, '.next/server/app/ipad.html', '<html>standalone editor</html>'),
      writeFixture(root, '.next/static/chunks/app.js', 'standalone chunk'),
      writeFixture(root, 'public/brand/icon.png', 'icon'),
      writeFixture(root, 'native-shell/index.html', '<html>live shell</html>'),
      writeFixture(root, 'native-shell/connection-error.html', '<html>connection error</html>'),
    ]);

    await prepareIpadWeb({ root, mode: 'bundle' });
    assert.equal(
      await readFile(path.join(root, '.native-ipad/index.html'), 'utf8'),
      '<html>standalone editor</html>',
    );
    assert.equal(
      await readFile(path.join(root, '.native-ipad/_next/static/chunks/app.js'), 'utf8'),
      'standalone chunk',
    );
    assert.equal(
      await readFile(path.join(root, '.native-ipad/brand/icon.png'), 'utf8'),
      'icon',
    );

    await prepareIpadWeb({ root, mode: 'live' });
    assert.equal(
      await readFile(path.join(root, '.native-ipad/index.html'), 'utf8'),
      '<html>live shell</html>',
    );
    assert.equal(
      await readFile(path.join(root, '.native-ipad/connection-error.html'), 'utf8'),
      '<html>connection error</html>',
    );
    await assert.rejects(
      readFile(path.join(root, '.native-ipad/_next/static/chunks/app.js')),
      /ENOENT/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('prepareIpadWeb rejects unknown modes', async () => {
  await assert.rejects(
    prepareIpadWeb({ mode: 'unknown' as 'bundle' }),
    /must be either bundle or live/,
  );
});
