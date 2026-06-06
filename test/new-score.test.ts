import test from 'node:test';
import assert from 'node:assert/strict';

import { buildNewScoreFilename, createNewScoreXml, createDefaultNewScoreDraft } from '../lib/new-score.ts';
import { importMusicXmlToCore } from '../src/musicxml-adapter/import/import-musicxml.ts';
import { projectLayoutToDocument } from '../src/layout/project-layout-to-document.ts';
import { exportCoreToMusicXml } from '../src/musicxml-adapter/export/export-core-to-musicxml.ts';

test('buildNewScoreFilename normalizes title into a musicxml filename', () => {
  assert.equal(buildNewScoreFilename('Spring Sketch'), 'Spring Sketch.musicxml');
  assert.equal(buildNewScoreFilename('  '), 'Untitled score.musicxml');
  assert.equal(buildNewScoreFilename('A/B:C*D?'), 'ABCD.musicxml');
});

test('createNewScoreXml builds a multi-part score with pickup, tempo, and metadata', () => {
  const draft = createDefaultNewScoreDraft();
  draft.title = 'Spring Sketch';
  draft.subtitle = 'for quartet';
  draft.composer = 'Lukas';
  draft.lyricist = 'Anon';
  draft.copyright = '2026 Example Edition';
  draft.instrumentIds = ['violin', 'violin', 'viola', 'cello'];
  draft.keySignatureId = 'd-major';
  draft.timeBeats = 3;
  draft.timeBeatType = 4;
  draft.tempo.bpm = 84;
  draft.tempo.showMarking = true;
  draft.measureCount = 8;
  draft.pickup.enabled = true;
  draft.pickup.beats = 1;
  draft.pickup.beatType = 4;

  const xml = createNewScoreXml(draft);

  assert.match(xml, /<work-title>Spring Sketch<\/work-title>/);
  assert.match(xml, /<work-number>for quartet<\/work-number>/);
  assert.match(xml, /<creator type="composer">Lukas<\/creator>/);
  assert.match(xml, /<creator type="lyricist">Anon<\/creator>/);
  assert.match(xml, /<rights>2026 Example Edition<\/rights>/);
  assert.equal((xml.match(/<score-part id=/g) ?? []).length, 4);
  assert.equal((xml.match(/<part id=/g) ?? []).length, 4);
  assert.equal((xml.match(/<measure number="/g) ?? []).length, 36);
  assert.match(xml, /<measure number="1" implicit="yes">/);
  assert.match(xml, /<fifths>2<\/fifths><mode>major<\/mode>/);
  assert.match(xml, /<time><beats>3<\/beats><beat-type>4<\/beat-type><\/time>/);
  assert.match(xml, /<per-minute>84<\/per-minute>/);
  assert.match(xml, /<sound tempo="84"\/>/);
  assert.match(xml, /<part-name>Violin 1<\/part-name>/);
  assert.match(xml, /<part-name>Violin 2<\/part-name>/);
});

test('createNewScoreXml writes initial attributes once for a blank piano score', () => {
  const draft = createDefaultNewScoreDraft();
  draft.instrumentIds = ['piano'];
  draft.measureCount = 4;

  const xml = createNewScoreXml(draft);

  assert.doesNotMatch(xml, /<work>/);
  assert.doesNotMatch(xml, /<work-title>/);
  assert.doesNotMatch(xml, /<identification>/);
  assert.doesNotMatch(xml, /<creator type="composer">/);
  assert.equal((xml.match(/<attributes>/g) ?? []).length, 1);
  assert.equal((xml.match(/<clef number="1">/g) ?? []).length, 1);
  assert.equal((xml.match(/<clef number="2">/g) ?? []).length, 1);
  assert.equal((xml.match(/<time><beats>4<\/beats><beat-type>4<\/beat-type><\/time>/g) ?? []).length, 1);
  assert.equal((xml.match(/<rest measure="yes"\/>/g) ?? []).length, 0);
});

test('blank piano render export keeps explicit clef numbering for both staves', () => {
  const draft = createDefaultNewScoreDraft();
  draft.instrumentIds = ['piano'];
  draft.measureCount = 4;

  const sourceXml = createNewScoreXml(draft);
  const projected = projectLayoutToDocument(importMusicXmlToCore(sourceXml));
  const renderXml = exportCoreToMusicXml(sourceXml, projected);

  assert.match(renderXml, /<clef number="1"><sign>G<\/sign><line>2<\/line><\/clef>/);
  assert.match(renderXml, /<clef number="2"><sign>F<\/sign><line>4<\/line><\/clef>/);
});
