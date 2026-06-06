import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { importMusicXmlToCore } from '../src/musicxml-adapter/import/import-musicxml.ts';
import { normalizeScoreDocument } from '../src/score-core/normalize/normalize-score-document.ts';
import {
  buildOsmdLayoutBridge,
  buildRenderedMeasureLayoutOverlays,
  buildRenderedSystemLayoutOverlays,
} from '../src/render-bridge/osmd/layout-plan-bridge.ts';
import type { RenderedNote } from '../src/render-bridge/osmd/note-selection.ts';

function loadFixture(name: string) {
  return readFileSync(path.join(process.cwd(), 'test', 'fixtures', name), 'utf8');
}

test('buildOsmdLayoutBridge exposes renderer-facing per-measure width weights and breaks', () => {
  const document = normalizeScoreDocument(importMusicXmlToCore(loadFixture('leadsheet-repeat.musicxml')));
  const bridge = buildOsmdLayoutBridge(document);

  assert.equal(bridge.systems.length, 2);
  assert.equal(bridge.measures.length, 2);
  assert.ok(bridge.measures.some((measure) => measure.pageBreakBefore));
  assert.ok(bridge.measures.every((measure) => measure.widthWeight > 0));
});

test('buildOsmdLayoutBridge carries staff spacing hints into renderer-facing metadata', () => {
  const document = normalizeScoreDocument(importMusicXmlToCore(loadFixture('piano-semantics.musicxml')));
  const bridge = buildOsmdLayoutBridge(document);

  assert.ok(bridge.measures.some((measure) => measure.staffSpacing === 92));
  assert.ok(bridge.systems.some((system) => system.defaultStaffSpacing === 92));
});

test('buildRenderedMeasureLayoutOverlays projects measure plan metadata into rendered DOM rectangles', () => {
  const document = normalizeScoreDocument(importMusicXmlToCore(loadFixture('leadsheet-repeat.musicxml')));
  const bridge = buildOsmdLayoutBridge(document);

  const renderedNotes: RenderedNote[] = [
    {
      id: 'n1',
      coreEntityId: 'event:1',
      note: {
        measureNumber: 1,
        staffIndex: 1,
        voiceId: 1,
        timestampNum: 0,
        timestampDen: 4,
        step: 'C',
        octave: 5,
        alter: 0,
        isRest: false,
        graphicalNote: null,
        coreMeasureId: 'measure:P1:1:1',
      },
      svgCenter: { x: 0, y: 0 },
      domCenter: { x: 20, y: 20 },
      domRect: { x: 10, y: 10, width: 20, height: 20 },
      svgElement: null,
      tintElement: null,
    },
    {
      id: 'n2',
      coreEntityId: 'event:2',
      note: {
        measureNumber: 2,
        staffIndex: 1,
        voiceId: 1,
        timestampNum: 0,
        timestampDen: 4,
        step: 'D',
        octave: 5,
        alter: 0,
        isRest: true,
        graphicalNote: null,
        coreMeasureId: 'measure:P1:1:2',
      },
      svgCenter: { x: 0, y: 0 },
      domCenter: { x: 80, y: 20 },
      domRect: { x: 70, y: 10, width: 20, height: 20 },
      svgElement: null,
      tintElement: null,
    },
  ];

  const overlays = buildRenderedMeasureLayoutOverlays(renderedNotes, bridge);
  assert.equal(overlays.length, 2);
  assert.ok(overlays.some((overlay) => overlay.pageBreakBefore));
  assert.deepEqual(overlays.map((overlay) => overlay.domRect.width), [20, 20]);
});

test('buildRenderedSystemLayoutOverlays groups measure overlays into system-level spacing guides', () => {
  const document = normalizeScoreDocument(importMusicXmlToCore(loadFixture('piano-semantics.musicxml')));
  const bridge = buildOsmdLayoutBridge(document);

  const measureOverlays = buildRenderedMeasureLayoutOverlays([
    {
      id: 'n1',
      coreEntityId: 'event:1',
      note: {
        measureNumber: 1,
        staffIndex: 1,
        voiceId: 1,
        timestampNum: 0,
        timestampDen: 8,
        step: 'C',
        octave: 5,
        alter: 0,
        isRest: false,
        graphicalNote: null,
        coreMeasureId: 'measure:P1:1:1',
      },
      svgCenter: { x: 0, y: 0 },
      domCenter: { x: 30, y: 24 },
      domRect: { x: 10, y: 10, width: 40, height: 28 },
      svgElement: null,
      tintElement: null,
    },
    {
      id: 'n2',
      coreEntityId: 'event:2',
      note: {
        measureNumber: 1,
        staffIndex: 2,
        voiceId: 1,
        timestampNum: 3,
        timestampDen: 8,
        step: 'B',
        octave: 4,
        alter: 0,
        isRest: false,
        graphicalNote: null,
        coreMeasureId: 'measure:P1:2:1',
      },
      svgCenter: { x: 0, y: 0 },
      domCenter: { x: 35, y: 70 },
      domRect: { x: 12, y: 54, width: 46, height: 30 },
      svgElement: null,
      tintElement: null,
    },
  ], bridge);

  const systemOverlays = buildRenderedSystemLayoutOverlays(measureOverlays, bridge);
  assert.equal(systemOverlays.length, 1);
  assert.equal(systemOverlays[0].defaultStaffSpacing, 92);
  assert.ok(systemOverlays[0].spacingGuideHeight > 0);
  assert.deepEqual(systemOverlays[0].measureNumbers, [1]);
});
