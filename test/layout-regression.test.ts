import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { importMusicXmlToCore } from '../src/musicxml-adapter/import/import-musicxml.ts';
import { normalizeScoreDocument } from '../src/score-core/normalize/normalize-score-document.ts';
import { buildLayoutOverlayRegressionFingerprint, buildLayoutRegressionFingerprint } from '../src/layout/layout-regression.ts';

function loadFixture(name: string) {
  return readFileSync(path.join(process.cwd(), 'test', 'fixtures', name), 'utf8');
}

function fingerprint(name: string) {
  return buildLayoutRegressionFingerprint(normalizeScoreDocument(importMusicXmlToCore(loadFixture(name))));
}

test('layout regression fingerprint stays stable for choir lyrics reference score', () => {
  assert.deepEqual(fingerprint('choir-lyrics.musicxml'), {
    revision: 1,
    pages: 1,
    systems: [
      {
        systemIndex: 0,
        pageIndex: 0,
        measures: [1],
        spacingUnits: 8.75,
        idealWidth: 164,
        minimumWidth: 112,
        defaultStaffSpacing: 112,
        collisionMode: 'open',
      },
    ],
    measures: [
      {
        measureNumber: 1,
        staffIndex: 1,
        idealWidth: 164,
        minimumWidth: 112,
        spacingUnits: 8.75,
        lyricLineCount: 4,
        slurCount: 1,
        tupletCount: 0,
        breakBefore: false,
        pageBreakBefore: false,
        widthWeight: 1,
        staffSpacing: 112,
      },
    ],
  });
});

test('layout regression fingerprint stays stable for piano semantics reference score', () => {
  assert.deepEqual(fingerprint('piano-semantics.musicxml'), {
    revision: 1,
    pages: 1,
    systems: [
      {
        systemIndex: 0,
        pageIndex: 0,
        measures: [1],
        spacingUnits: 7,
        idealWidth: 212,
        minimumWidth: 144,
        defaultStaffSpacing: 92,
        collisionMode: 'balanced',
      },
    ],
    measures: [
      {
        measureNumber: 1,
        staffIndex: 1,
        idealWidth: 102,
        minimumWidth: 69,
        spacingUnits: 3,
        lyricLineCount: 0,
        slurCount: 0,
        tupletCount: 0,
        breakBefore: false,
        pageBreakBefore: false,
        widthWeight: 0.481,
        staffSpacing: 92,
      },
      {
        measureNumber: 1,
        staffIndex: 2,
        idealWidth: 110,
        minimumWidth: 75,
        spacingUnits: 4,
        lyricLineCount: 0,
        slurCount: 0,
        tupletCount: 1,
        breakBefore: false,
        pageBreakBefore: false,
        widthWeight: 0.519,
        staffSpacing: 92,
      },
    ],
  });
});

test('layout regression fingerprint stays stable for leadsheet repeat reference score', () => {
  assert.deepEqual(fingerprint('leadsheet-repeat.musicxml'), {
    revision: 1,
    pages: 2,
    systems: [
      {
        systemIndex: 0,
        pageIndex: 0,
        measures: [1],
        spacingUnits: 6,
        idealWidth: 126,
        minimumWidth: 86,
        defaultStaffSpacing: 86,
        collisionMode: 'balanced',
      },
      {
        systemIndex: 1,
        pageIndex: 1,
        measures: [2],
        spacingUnits: 1,
        idealWidth: 82,
        minimumWidth: 56,
        defaultStaffSpacing: 84,
        collisionMode: 'balanced',
      },
    ],
    measures: [
      {
        measureNumber: 1,
        staffIndex: 1,
        idealWidth: 126,
        minimumWidth: 86,
        spacingUnits: 6,
        lyricLineCount: 0,
        slurCount: 0,
        tupletCount: 0,
        breakBefore: false,
        pageBreakBefore: false,
        widthWeight: 1,
        staffSpacing: 86,
      },
      {
        measureNumber: 2,
        staffIndex: 1,
        idealWidth: 82,
        minimumWidth: 56,
        spacingUnits: 1,
        lyricLineCount: 0,
        slurCount: 0,
        tupletCount: 0,
        breakBefore: true,
        pageBreakBefore: true,
        widthWeight: 1,
        staffSpacing: 84,
      },
    ],
  });
});

test('layout regression fingerprint stays stable for rule-driven repeat ending layout', () => {
  assert.deepEqual(fingerprint('repeat-ending-sequence.musicxml'), {
    revision: 1,
    pages: 1,
    systems: [
      {
        systemIndex: 0,
        pageIndex: 0,
        measures: [1, 2],
        spacingUnits: 5,
        idealWidth: 198,
        minimumWidth: 135,
        defaultStaffSpacing: 84,
        collisionMode: 'balanced',
      },
      {
        systemIndex: 1,
        pageIndex: 0,
        measures: [3],
        spacingUnits: 2,
        idealWidth: 92,
        minimumWidth: 63,
        defaultStaffSpacing: 84,
        collisionMode: 'balanced',
      },
    ],
    measures: [
      {
        measureNumber: 1,
        staffIndex: 1,
        idealWidth: 94,
        minimumWidth: 64,
        spacingUnits: 2,
        lyricLineCount: 0,
        slurCount: 0,
        tupletCount: 0,
        breakBefore: false,
        pageBreakBefore: false,
        widthWeight: 0.475,
        staffSpacing: 84,
      },
      {
        measureNumber: 2,
        staffIndex: 1,
        idealWidth: 104,
        minimumWidth: 71,
        spacingUnits: 3,
        lyricLineCount: 0,
        slurCount: 0,
        tupletCount: 0,
        breakBefore: false,
        pageBreakBefore: false,
        widthWeight: 0.525,
        staffSpacing: 84,
      },
      {
        measureNumber: 3,
        staffIndex: 1,
        idealWidth: 92,
        minimumWidth: 63,
        spacingUnits: 2,
        lyricLineCount: 0,
        slurCount: 0,
        tupletCount: 0,
        breakBefore: true,
        pageBreakBefore: false,
        widthWeight: 1,
        staffSpacing: 84,
      },
    ],
  });
});

test('layout overlay regression stays stable for representative reference scores', () => {
  assert.deepEqual(buildLayoutOverlayRegressionFingerprint(normalizeScoreDocument(importMusicXmlToCore(loadFixture('choir-lyrics.musicxml')))), {
    revision: 1,
    layoutSystems: 1,
    layoutPages: 1,
    measureOverlays: [
      {
        measureNumber: 1,
        systemIndex: 0,
        pageIndex: 0,
        widthWeight: 1,
        breakBefore: false,
        pageBreakBefore: false,
        rect: { x: 20, y: 18, width: 55, height: 28 },
      },
    ],
    systemOverlays: [
      {
        systemIndex: 0,
        pageIndex: 0,
        measureNumbers: [1],
        defaultStaffSpacing: 112,
        collisionMode: 'open',
        spacingGuideHeight: 47,
        rect: { x: 20, y: 18, width: 55, height: 28 },
      },
    ],
  });

  assert.deepEqual(buildLayoutOverlayRegressionFingerprint(normalizeScoreDocument(importMusicXmlToCore(loadFixture('piano-semantics.musicxml')))), {
    revision: 1,
    layoutSystems: 1,
    layoutPages: 1,
    measureOverlays: [
      {
        measureNumber: 1,
        systemIndex: 0,
        pageIndex: 0,
        widthWeight: 0.481,
        breakBefore: false,
        pageBreakBefore: false,
        rect: { x: 20, y: 18, width: 34, height: 28 },
      },
      {
        measureNumber: 1,
        systemIndex: 0,
        pageIndex: 0,
        widthWeight: 0.519,
        breakBefore: false,
        pageBreakBefore: false,
        rect: { x: 72, y: 72, width: 37, height: 28 },
      },
    ],
    systemOverlays: [
      {
        systemIndex: 0,
        pageIndex: 0,
        measureNumbers: [1],
        defaultStaffSpacing: 92,
        collisionMode: 'balanced',
        spacingGuideHeight: 28,
        rect: { x: 20, y: 18, width: 89, height: 82 },
      },
    ],
  });

  assert.deepEqual(buildLayoutOverlayRegressionFingerprint(normalizeScoreDocument(importMusicXmlToCore(loadFixture('leadsheet-repeat.musicxml')))), {
    revision: 1,
    layoutSystems: 2,
    layoutPages: 2,
    measureOverlays: [
      {
        measureNumber: 1,
        systemIndex: 0,
        pageIndex: 0,
        widthWeight: 1,
        breakBefore: false,
        pageBreakBefore: false,
        rect: { x: 20, y: 18, width: 42, height: 28 },
      },
      {
        measureNumber: 2,
        systemIndex: 1,
        pageIndex: 1,
        widthWeight: 1,
        breakBefore: true,
        pageBreakBefore: true,
        rect: { x: 20, y: 168, width: 27, height: 28 },
      },
    ],
    systemOverlays: [
      {
        systemIndex: 0,
        pageIndex: 0,
        measureNumbers: [1],
        defaultStaffSpacing: 86,
        collisionMode: 'balanced',
        spacingGuideHeight: 26,
        rect: { x: 20, y: 18, width: 42, height: 28 },
      },
      {
        systemIndex: 1,
        pageIndex: 1,
        measureNumbers: [2],
        defaultStaffSpacing: 84,
        collisionMode: 'balanced',
        spacingGuideHeight: 25,
        rect: { x: 20, y: 168, width: 27, height: 28 },
      },
    ],
  });
});
