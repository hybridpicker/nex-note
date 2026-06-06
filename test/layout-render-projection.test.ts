import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { importMusicXmlToCore } from '../src/musicxml-adapter/import/import-musicxml.ts';
import { normalizeScoreDocument } from '../src/score-core/normalize/normalize-score-document.ts';
import { projectLayoutToDocument } from '../src/layout/project-layout-to-document.ts';
import { exportCoreToMusicXml } from '../src/musicxml-adapter/export/export-core-to-musicxml.ts';

function loadFixture(name: string) {
  return readFileSync(path.join(process.cwd(), 'test', 'fixtures', name), 'utf8');
}

test('projectLayoutToDocument materializes system and page breaks into render document print state', () => {
  const xml = loadFixture('leadsheet-repeat.musicxml');
  const document = normalizeScoreDocument(importMusicXmlToCore(xml));
  const projected = projectLayoutToDocument(document);

  assert.equal(projected.score.parts[0].staves[0].measures[0].print?.newSystem, undefined);
  assert.equal(projected.score.parts[0].staves[0].measures[1].print?.newSystem, true);
  assert.equal(projected.score.parts[0].staves[0].measures[1].print?.newPage, true);
});

test('projectLayoutToDocument derives staff spacing hints for lyric-heavy and piano reference scores', () => {
  const choir = projectLayoutToDocument(normalizeScoreDocument(importMusicXmlToCore(loadFixture('choir-lyrics.musicxml'))));
  const piano = projectLayoutToDocument(normalizeScoreDocument(importMusicXmlToCore(loadFixture('piano-semantics.musicxml'))));

  const choirSpacing = choir.layoutHints.find((hint) => hint.kind === 'staffSpacing')?.value;
  const pianoSpacing = piano.layoutHints.find((hint) => hint.kind === 'staffSpacing' && hint.staffIndex === 1)?.value;

  assert.equal(choirSpacing, 112);
  assert.equal(pianoSpacing, 92);
});

test('projectLayoutToDocument materializes rule-driven system breaks even without explicit print hints', () => {
  const xml = loadFixture('repeat-ending-sequence.musicxml');
  const document = normalizeScoreDocument(importMusicXmlToCore(xml));
  const projected = projectLayoutToDocument(document);

  assert.equal(projected.score.parts[0].staves[0].measures[0].print?.newSystem, undefined);
  assert.equal(projected.score.parts[0].staves[0].measures[1].print?.newSystem, undefined);
  assert.equal(projected.score.parts[0].staves[0].measures[2].print?.newSystem, true);
  assert.equal(projected.score.parts[0].staves[0].measures[2].print?.newPage, undefined);
});

test('render projection exports plan-derived print and staff spacing hints into MusicXML', () => {
  const xml = loadFixture('choir-lyrics.musicxml');
  const document = normalizeScoreDocument(importMusicXmlToCore(xml));
  const projectedXml = exportCoreToMusicXml(xml, projectLayoutToDocument(document));

  assert.match(projectedXml, /<print new-system="yes"/);
  assert.match(projectedXml, /<staff-distance>112<\/staff-distance>/);
});
