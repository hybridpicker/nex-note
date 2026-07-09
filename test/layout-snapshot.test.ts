import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { importMusicXmlToCore } from '../src/musicxml-adapter/import/import-musicxml.ts';
import { buildLayoutPlan } from '../src/layout/build-layout-plan.ts';
import { buildLayoutSnapshot } from '../src/layout/build-layout-snapshot.ts';
import { normalizeScoreDocument } from '../src/score-core/normalize/normalize-score-document.ts';

function loadFixture(name: string) {
  return readFileSync(path.join(process.cwd(), 'test', 'fixtures', name), 'utf8');
}

test('buildLayoutSnapshot projects explicit page and system breaks without renderer coupling', () => {
  const document = normalizeScoreDocument(importMusicXmlToCore(loadFixture('leadsheet-repeat.musicxml')));
  const snapshot = buildLayoutSnapshot(document);

  assert.equal(snapshot.pages.length, 2);
  assert.equal(snapshot.systems.length, 2);
  assert.deepEqual(snapshot.systems[0].measureNumbers, [1]);
  assert.deepEqual(snapshot.systems[1].measureNumbers, [2]);
  assert.equal(snapshot.systems[1].pageIndex, 1);
});

test('buildLayoutSnapshot exposes measure hints and semantic anchors for later engraving work', () => {
  const document = normalizeScoreDocument(importMusicXmlToCore(loadFixture('choir-lyrics.musicxml')));
  const snapshot = buildLayoutSnapshot(document);

  assert.ok(snapshot.measures.length > 0);
  assert.ok(snapshot.anchors.length > 0);
  assert.ok(snapshot.anchors.every((anchor) => anchor.eventId && anchor.measureId));
  assert.ok(snapshot.measures.some((measure) => measure.lyricLineCount > 0));
  assert.ok(snapshot.measures.some((measure) => measure.lyricVerseCount === 2));
  assert.ok(snapshot.measures.some((measure) => measure.slurCount > 0));
});

test('buildLayoutSnapshot captures explicit staff spacing and repeat semantics for layout planning', () => {
  const document = normalizeScoreDocument(importMusicXmlToCore(loadFixture('piano-semantics.musicxml')));
  const snapshot = buildLayoutSnapshot(document);

  assert.ok(snapshot.measures.some((measure) => measure.explicitStaffSpacing === 92));
  assert.ok(snapshot.measures.some((measure) => measure.tupletCount > 0));
});

test('buildLayoutPlan turns snapshot data into renderer-agnostic width and spacing decisions', () => {
  const document = normalizeScoreDocument(importMusicXmlToCore(loadFixture('piano-semantics.musicxml')));
  const snapshot = buildLayoutSnapshot(document);
  const plan = buildLayoutPlan(document, snapshot);

  assert.equal(plan.systems.length, snapshot.systems.length);
  assert.ok(plan.measures.every((measure) => measure.idealWidth >= measure.minimumWidth));
  assert.ok(plan.systems.every((system) => system.idealWidth >= system.minimumWidth));
  assert.ok(plan.measures.some((measure) => measure.staffSpacing === 92));
  assert.ok(plan.measures.some((measure) => measure.spacingUnits > 1));
});

test('buildLayoutPlan gives lyric-heavy measures more width than sparse measures', () => {
  const choir = normalizeScoreDocument(importMusicXmlToCore(loadFixture('choir-lyrics.musicxml')));
  const sparse = normalizeScoreDocument(importMusicXmlToCore(loadFixture('cross-measure-tie.musicxml')));
  const choirPlan = buildLayoutPlan(choir, buildLayoutSnapshot(choir));
  const sparsePlan = buildLayoutPlan(sparse, buildLayoutSnapshot(sparse));

  assert.ok((choirPlan.measures[0]?.idealWidth ?? 0) > (sparsePlan.measures[0]?.idealWidth ?? 0));
});

test('vertical lyric spacing follows stacked verse depth rather than syllable count', () => {
  const twoVerses = normalizeScoreDocument(importMusicXmlToCore(loadFixture('choir-lyrics.musicxml')));
  const oneVerse = structuredClone(twoVerses);
  for (const line of oneVerse.lyricLines) line.verseNumber = 1;

  const twoVerseSnapshot = buildLayoutSnapshot(twoVerses);
  const oneVerseSnapshot = buildLayoutSnapshot(oneVerse);
  const twoVersePlan = buildLayoutPlan(twoVerses, twoVerseSnapshot);
  const oneVersePlan = buildLayoutPlan(oneVerse, oneVerseSnapshot);

  assert.equal(twoVerseSnapshot.measures[0]?.lyricLineCount, oneVerseSnapshot.measures[0]?.lyricLineCount);
  assert.equal(twoVerseSnapshot.measures[0]?.lyricVerseCount, 2);
  assert.equal(oneVerseSnapshot.measures[0]?.lyricVerseCount, 1);
  assert.equal(twoVersePlan.measures[0]!.staffSpacing - oneVersePlan.measures[0]!.staffSpacing, 6);
});

test('buildLayoutPlan widens measures for long lyric and direction text without changing object counts', () => {
  const shortText = normalizeScoreDocument(importMusicXmlToCore(loadFixture('choir-lyrics.musicxml')));
  const longText = structuredClone(shortText);
  for (const line of shortText.lyricLines) line.text = 'la';
  for (const line of longText.lyricLines) line.text = 'extraordinarily';
  for (const part of shortText.score.parts) {
    for (const staff of part.staves) {
      for (const measure of staff.measures) {
        for (const direction of measure.directions) direction.value = 'dolce';
      }
    }
  }
  for (const part of longText.score.parts) {
    for (const staff of part.staves) {
      for (const measure of staff.measures) {
        for (const direction of measure.directions) direction.value = 'espressivo, ma molto cantabile';
      }
    }
  }

  const shortSnapshot = buildLayoutSnapshot(shortText);
  const longSnapshot = buildLayoutSnapshot(longText);
  const shortPlan = buildLayoutPlan(shortText, shortSnapshot);
  const longPlan = buildLayoutPlan(longText, longSnapshot);
  const shortMeasure = shortPlan.measures[0]!;
  const longMeasure = longPlan.measures[0]!;

  assert.equal(shortSnapshot.measures[0]?.lyricLineCount, longSnapshot.measures[0]?.lyricLineCount);
  assert.equal(shortSnapshot.measures[0]?.directionCount, longSnapshot.measures[0]?.directionCount);
  assert.ok(longMeasure.textSpacingDemand > shortMeasure.textSpacingDemand);
  assert.ok(longMeasure.idealWidth > shortMeasure.idealWidth);
  assert.ok(longMeasure.minimumWidth > shortMeasure.minimumWidth);
  assert.ok(longMeasure.collisionPressure > shortMeasure.collisionPressure);
});

test('text-aware minimum widths reflow systems before long expressions can collide', () => {
  const shortText = normalizeScoreDocument(importMusicXmlToCore(loadFixture('repeat-ending-sequence.musicxml')));
  const longText = structuredClone(shortText);
  for (const document of [shortText, longText]) {
    for (const part of document.score.parts) {
      for (const staff of part.staves) {
        for (const measure of staff.measures) {
          measure.directions.push({
            id: `${measure.id}:expression`,
            kind: 'words',
            value: document === longText ? 'espressivo, ma molto cantabile' : 'dolce',
            measureNumber: measure.measureNumber,
            staffIndex: staff.staffIndex,
            timestampNum: 0,
            timestampDen: 1,
          });
        }
      }
    }
  }

  const options = { systemIdealWidth: 360 };
  const shortPlan = buildLayoutPlan(shortText, buildLayoutSnapshot(shortText), options);
  const longPlan = buildLayoutPlan(longText, buildLayoutSnapshot(longText), options);

  assert.equal(shortPlan.systems.length, 1);
  assert.ok(longPlan.systems.length > shortPlan.systems.length);
  assert.ok(longPlan.measures.every((measure) => measure.minimumWidth >= 120));
});

test('buildLayoutPlan derives rule-driven system breaks when measure widths overflow the target system width', () => {
  const document = normalizeScoreDocument(importMusicXmlToCore(loadFixture('repeat-ending-sequence.musicxml')));
  const snapshot = buildLayoutSnapshot(document);
  const plan = buildLayoutPlan(document, snapshot);

  assert.equal(snapshot.systems.length, 1);
  assert.equal(plan.systems.length, 2);
  assert.deepEqual(plan.systems[0].measureNumbers, [1, 2]);
  assert.deepEqual(plan.systems[1].measureNumbers, [3]);
  assert.equal(plan.systems[1].explicitBreakBefore, false);
  assert.equal(plan.measures.find((measure) => measure.measureNumber === 3)?.systemIndex, 1);
});

test('staff spacing inheritance prefers the newest hint and the most specific same-measure override', () => {
  const document = normalizeScoreDocument(importMusicXmlToCore(loadFixture('repeat-ending-sequence.musicxml')));
  const sourcePartId = document.score.parts[0]!.sourcePartId;
  document.layoutHints.push(
    {
      id: 'spacing:m1:staff',
      scope: 'staff',
      measureNumber: 1,
      partId: sourcePartId,
      staffIndex: 1,
      kind: 'staffSpacing',
      value: 88,
    },
    {
      id: 'spacing:m2:global',
      scope: 'staff',
      measureNumber: 2,
      kind: 'staffSpacing',
      value: 96,
    },
    {
      id: 'spacing:m2:staff',
      scope: 'staff',
      measureNumber: 2,
      partId: sourcePartId,
      staffIndex: 1,
      kind: 'staffSpacing',
      value: 120,
    },
    {
      id: 'spacing:m2:staff:latest',
      scope: 'staff',
      measureNumber: 2,
      partId: sourcePartId,
      staffIndex: 1,
      kind: 'staffSpacing',
      value: 124,
    },
  );

  const plan = buildLayoutPlan(document, buildLayoutSnapshot(document));
  assert.equal(plan.measures.find((measure) => measure.measureNumber === 1)?.staffSpacing, 88);
  assert.equal(plan.measures.find((measure) => measure.measureNumber === 2)?.staffSpacing, 124);
  assert.equal(plan.measures.find((measure) => measure.measureNumber === 3)?.staffSpacing, 124);
});
