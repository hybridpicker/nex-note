import test from 'node:test';
import assert from 'node:assert/strict';

import { findNearestRenderedNoteInMeasure, findRenderedSelectionTarget, resolveRenderedGlyphHit, resolveVisualSimultaneousNotes } from '../components/ScoreEditor.tsx';
import type { SelectedNote } from '../hooks/useNoteEditor.ts';
import type { RenderedNote } from '../src/render-bridge/osmd/note-selection.ts';

function makeSelectedNote(overrides: Partial<SelectedNote> = {}): SelectedNote {
  return {
    coreEntityId: null,
    coreVoiceId: null,
    coreMeasureId: null,
    corePartId: null,
    measureNumber: 3,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 4,
    timestampDen: 4,
    step: 'C',
    octave: 5,
    alter: 0,
    isRest: false,
    graphicalNote: null,
    ...overrides,
  };
}

test('findRenderedSelectionTarget does not highlight a mismatched sole timestamp candidate', () => {
  const target = makeSelectedNote();
  const rendered = findRenderedSelectionTarget(target, [
    {
      id: 'wrong-note',
      coreEntityId: null,
      note: makeSelectedNote({ step: 'B', octave: -1 }),
      svgCenter: { x: 0, y: 0 },
      domCenter: { x: 100, y: 100 },
      domRect: { x: 94, y: 94, width: 12, height: 12 },
      svgElement: null,
      tintElement: null,
    },
  ], null);

  assert.equal(rendered, null);
});

function makeRenderedNote(note: SelectedNote, x: number, y: number): RenderedNote {
  return {
    id: note.coreEntityId ?? `${note.measureNumber}:${note.staffIndex}:${note.timestampNum}:${note.step}:${y}`,
    coreEntityId: note.coreEntityId ?? null,
    note,
    svgCenter: { x, y },
    domCenter: { x, y },
    domRect: { x: x - 6, y: y - 6, width: 12, height: 12 },
    svgElement: null,
    tintElement: null,
  };
}

test('resolveVisualSimultaneousNotes does not merge notation and TAB notes from different parts', () => {
  const notation = makeSelectedNote({
    coreEntityId: 'event:P1:1',
    corePartId: 'part:P1',
    coreMeasureId: 'measure:P1:1:1',
    step: 'D',
    octave: 4,
  });
  const tab = makeSelectedNote({
    coreEntityId: 'event:P2:1',
    corePartId: 'part:P2',
    coreMeasureId: 'measure:P2:1:1',
    step: 'D',
    octave: 4,
  });
  const target = makeRenderedNote(tab, 220, 340);
  const selected = resolveVisualSimultaneousNotes([
    makeRenderedNote(notation, 220, 190),
    target,
  ], target, null);

  assert.deepEqual(selected.map((note) => note.coreEntityId), ['event:P2:1']);
});

test('selection confidence ranks the clicked chord tone by visible glyph center', () => {
  const lower = makeSelectedNote({ coreEntityId: 'event:chord:lower', step: 'C', octave: 4 });
  const upper = makeSelectedNote({ coreEntityId: 'event:chord:upper', step: 'G', octave: 4 });
  const hit = resolveRenderedGlyphHit({
    renderedNotes: [
      makeRenderedNote(lower, 120, 150),
      makeRenderedNote(upper, 120, 126),
    ],
    eventPathNodes: [],
    domPoint: { x: 120, y: 126 },
  });

  assert.equal(hit.rendered?.note.coreEntityId, 'event:chord:upper');
  assert.equal(hit.report.selectedTarget?.pitch, 'G4');
  assert.equal(hit.report.candidates[0]?.reason, 'glyph-rect-hit');
});

test('selection confidence keeps TAB string and fret on the clicked fret glyph', () => {
  const stringFive = makeSelectedNote({
    coreEntityId: 'event:tab:string5',
    corePartId: 'part:guitar',
    staffIndex: 2,
    step: 'C',
    octave: 4,
    guitar: { string: 5, fret: 3 },
  });
  const stringThree = makeSelectedNote({
    coreEntityId: 'event:tab:string3',
    corePartId: 'part:guitar',
    staffIndex: 2,
    step: 'G',
    octave: 4,
    guitar: { string: 3, fret: 7 },
  });
  const hit = resolveRenderedGlyphHit({
    renderedNotes: [
      makeRenderedNote(stringFive, 180, 220),
      makeRenderedNote(stringThree, 180, 188),
    ],
    eventPathNodes: [],
    domPoint: { x: 180, y: 220 },
  });

  assert.equal(hit.rendered?.note.coreEntityId, 'event:tab:string5');
  assert.deepEqual(hit.report.selectedTarget?.guitar, { string: 5, fret: 3 });
});

test('selection confidence resolves same-timestamp voices by visible glyph instead of selected voice', () => {
  const voiceOne = makeSelectedNote({ coreEntityId: 'event:voice:1', voiceId: 1, step: 'E', octave: 4 });
  const voiceTwo = makeSelectedNote({ coreEntityId: 'event:voice:2', voiceId: 2, coreVoiceId: 'voice:2', step: 'A', octave: 4 });
  const hit = resolveRenderedGlyphHit({
    renderedNotes: [
      makeRenderedNote(voiceOne, 240, 130),
      makeRenderedNote(voiceTwo, 240, 170),
    ],
    eventPathNodes: [],
    domPoint: { x: 240, y: 170 },
    selectedVoice: 1,
  });

  assert.equal(hit.rendered?.note.coreEntityId, 'event:voice:2');
  assert.equal(hit.report.selectedTarget?.voiceId, 2);
  assert.equal(hit.report.selectedTarget?.coreVoiceId, 'voice:2');
});

test('stale graphical voice preference does not override semantic voice on a glyph hit', () => {
  const semanticVoice = makeSelectedNote({
    coreEntityId: 'event:semantic:voice2',
    coreVoiceId: 'voice:semantic:2',
    voiceId: 2,
    step: 'B',
    octave: 4,
  });
  const selected = resolveRenderedGlyphHit({
    renderedNotes: [makeRenderedNote(semanticVoice, 310, 144)],
    eventPathNodes: [],
    domPoint: { x: 310, y: 144 },
    selectedVoice: 1,
  });

  assert.equal(selected.report.selectedTarget?.voiceId, 2);
  assert.equal(selected.report.selectedTarget?.coreVoiceId, 'voice:semantic:2');
});

test('fallback selection is explicit and does not jump to another measure when constrained', () => {
  const measureOne = makeRenderedNote(makeSelectedNote({ coreEntityId: 'event:m1', measureNumber: 1 }), 100, 100);
  const measureTwo = makeRenderedNote(makeSelectedNote({ coreEntityId: 'event:m2', measureNumber: 2 }), 112, 100);
  const unconstrained = resolveRenderedGlyphHit({
    renderedNotes: [measureOne, measureTwo],
    eventPathNodes: [],
    domPoint: { x: 112, y: 100 },
  });
  const constrained = findNearestRenderedNoteInMeasure([measureOne, measureTwo], { x: 112, y: 100 }, 1);

  assert.equal(unconstrained.rendered?.note.measureNumber, 2);
  assert.equal(constrained?.measureNumber, 1);
});
