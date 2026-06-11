import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildScoreImageBatchBaseName,
  isPdfEmbeddableScoreImageFilename,
  isScoreImageFilename,
  sortScoreImagePages,
} from '../lib/score-image-pages.ts';

test('score image page helpers sort numbered pages naturally', () => {
  const pages = sortScoreImagePages([
    { name: '10.png' },
    { name: '02.png' },
    { name: '01.png' },
    { name: '2.png' },
  ]);

  assert.deepEqual(pages.map((page) => page.name), ['01.png', '02.png', '2.png', '10.png']);
});

test('score image page helpers identify image and PDF-embeddable formats', () => {
  assert.equal(isScoreImageFilename('page.webp'), true);
  assert.equal(isScoreImageFilename('score.pdf'), false);
  assert.equal(isPdfEmbeddableScoreImageFilename('page.png'), true);
  assert.equal(isPdfEmbeddableScoreImageFilename('page.jpeg'), true);
  assert.equal(isPdfEmbeddableScoreImageFilename('page.tiff'), false);
});

test('score image page helpers build a stable batch filename from the first page', () => {
  assert.equal(
    buildScoreImageBatchBaseName([{ name: '03.png' }, { name: '01.png' }, { name: '02.png' }]),
    '01-3-pages',
  );
});
