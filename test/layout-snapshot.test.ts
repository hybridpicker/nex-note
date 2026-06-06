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
