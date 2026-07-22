import test from 'node:test';
import assert from 'node:assert/strict';

import { buildInteractiveEditMap } from '../src/score-input/edit-map.ts';
import { resolvePointerEditTarget } from '../src/score-input/pointer-resolver.ts';
import { pointerEntryLocatorsShareOnset, resolveMuseScorePointerEntryMode, shouldCommitPointerGhostOverDirectNote, shouldTreatPointerAsExplicitVisibleGhost } from '../src/score-input/pointer-entry-mode.ts';
import { resolveKeyboardChordInputShortcut, resolveKeyboardDeleteAction, resolveKeyboardDurationShortcut, resolveKeyboardEditTarget, resolveKeyboardEntryModeShortcut, resolveKeyboardIntervalShortcut } from '../src/score-input/keyboard-resolver.ts';
import { inspectResolvedEditTarget } from '../src/score-input/note-entry-validator.ts';
import { buildNoteEntryCommitCommands, toResolvedEditLocator } from '../src/score-input/commit-resolver.ts';
import { buildRenderedGhostGrid } from '../src/render-bridge/osmd/rendered-ghost-grid.ts';
import { importMusicXmlToCore } from '../src/musicxml-adapter/import/import-musicxml.ts';
import type { RenderedNote } from '../src/render-bridge/osmd/note-selection.ts';

const FULL_REST_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Validator</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <rest measure="yes"/>
        <duration>4</duration>
        <voice>1</voice>
        <type>whole</type>
        <staff>1</staff>
      </note>
    </measure>
  </part>
</score-partwise>`;

const SINGLE_NOTE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Validator</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>1</duration>
        <voice>1</voice>
        <type>quarter</type>
        <staff>1</staff>
      </note>
      <note>
        <rest/>
        <duration>3</duration>
        <voice>1</voice>
        <type>half</type>
        <dot/>
        <staff>1</staff>
      </note>
    </measure>
  </part>
</score-partwise>`;

const FULL_EIGHTH_MEASURE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Validator</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>2</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><staff>1</staff></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><staff>1</staff></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><staff>1</staff></note>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><staff>1</staff></note>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><staff>1</staff></note>
      <note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><staff>1</staff></note>
      <note><pitch><step>B</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><staff>1</staff></note>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`;

function makeRenderedNote(input: {
  id: string;
  measureId: string;
  measureNumber: number;
  staffIndex: number;
  voiceId: number;
  timestampNum: number;
  timestampDen: number;
  domX: number;
  domY: number;
  step: string;
  octave: number;
  alter?: number;
}) {
  const rendered: RenderedNote = {
    id: input.id,
    coreEntityId: input.id,
    note: {
      coreEntityId: input.id,
      coreMeasureId: input.measureId,
      corePartId: 'P1',
      measureNumber: input.measureNumber,
      staffIndex: input.staffIndex,
      voiceId: input.voiceId,
      timestampNum: input.timestampNum,
      timestampDen: input.timestampDen,
      step: input.step,
      octave: input.octave,
      alter: input.alter ?? 0,
      isRest: false,
      graphicalNote: null,
    },
    svgCenter: { x: input.domX, y: input.domY },
    domCenter: { x: input.domX, y: input.domY },
    domRect: { x: input.domX - 6, y: input.domY - 6, width: 12, height: 12 },
    svgElement: null,
    tintElement: null,
  };
  return rendered;
}

function createEditMap() {
  const renderedNotes: RenderedNote[] = [
    makeRenderedNote({
      id: 'n1',
      measureId: 'm1',
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 0,
      timestampDen: 4,
      domX: 120,
      domY: 40,
      step: 'C',
      octave: 4,
    }),
    makeRenderedNote({
      id: 'n2',
      measureId: 'm1',
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 2,
      timestampNum: 0,
      timestampDen: 4,
      domX: 124,
      domY: 60,
      step: 'E',
      octave: 3,
    }),
    makeRenderedNote({
      id: 'n3',
      measureId: 'm1',
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 1,
      timestampDen: 4,
      domX: 190,
      domY: 44,
      step: 'D',
      octave: 4,
    }),
  ];

  const renderedGhostGrid = buildRenderedGhostGrid(renderedNotes);
  return buildInteractiveEditMap({
    renderedGhostGrid,
    renderedNotes,
    measureOverlays: [{
      measureId: 'm1',
      measureNumber: 1,
      pageIndex: 0,
      systemIndex: 0,
    }],
  });
}

test('resolvePointerEditTarget returns deterministic slot/voice target and rejects ambiguous voice replace', () => {
  const editMap = createEditMap();

  const resolved = resolvePointerEditTarget({
    editMap,
    candidate: {
      measureId: 'm1',
      corePartId: 'P1',
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 0,
      timestampDen: 4,
      mode: 'replace',
      step: 'D',
      octave: 4,
      alter: 0,
    },
  });
  assert.ok(resolved);
  assert.equal(resolved.source, 'pointer');
  assert.equal(resolved.mode, 'replace');
  assert.equal(resolved.timestampNum, 0);
  assert.equal(resolved.timestampDen, 4);
  assert.equal(resolved.voiceId, 1);

  const ambiguous = resolvePointerEditTarget({
    editMap,
    candidate: {
      measureId: 'm1',
      corePartId: 'P1',
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 3,
      timestampNum: 0,
      timestampDen: 4,
      mode: 'replace',
      step: 'D',
      octave: 4,
      alter: 0,
    },
  });
  assert.equal(ambiguous, null);
});

test('resolvePointerEditTarget uses the only occupied voice for pointer replace targets', () => {
  const editMap = createEditMap();

  const resolved = resolvePointerEditTarget({
    editMap,
    candidate: {
      measureId: 'm1',
      corePartId: 'P1',
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 3,
      timestampNum: 1,
      timestampDen: 4,
      mode: 'replace',
      step: 'F',
      octave: 4,
      alter: 0,
    },
  });

  assert.ok(resolved);
  assert.equal(resolved.voiceId, 1);
  assert.match(resolved.diagnostics.join(' '), /voice-coerced:m1:1:3->1/);
});

test('resolvePointerEditTarget can keep an active voice for rest-anchor entry', () => {
  const editMap = createEditMap();

  const resolved = resolvePointerEditTarget({
    editMap,
    candidate: {
      measureId: 'm1',
      corePartId: 'P1',
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 3,
      timestampNum: 1,
      timestampDen: 4,
      mode: 'replace',
      step: 'F',
      octave: 4,
      alter: 0,
      allowUnoccupiedVoice: true,
    },
  });

  assert.ok(resolved);
  assert.equal(resolved.voiceId, 3);
  assert.match(resolved.diagnostics.join(' '), /voice-unoccupied-allowed:m1:1:3/);
});

test('resolvePointerEditTarget snaps near-miss pointer timestamps to the closest visible slot by X', () => {
  const editMap = createEditMap();

  const resolved = resolvePointerEditTarget({
    editMap,
    candidate: {
      measureId: 'm1',
      corePartId: 'P1',
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 15,
      timestampDen: 64,
      domX: 188,
      mode: 'replace',
      step: 'F',
      octave: 4,
      alter: 0,
    },
  });

  assert.ok(resolved);
  assert.equal(resolved.timestampNum, 1);
  assert.equal(resolved.timestampDen, 4);
  assert.match(resolved.diagnostics.join(' '), /slot-snapped:m1:1:15\/64->1\/4/);
});

test('resolvePointerEditTarget snaps insert target X to the resolved rhythmic slot', () => {
  const editMap = createEditMap();

  const resolved = resolvePointerEditTarget({
    editMap,
    candidate: {
      measureId: 'm1',
      corePartId: 'P1',
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 15,
      timestampDen: 64,
      domX: 188,
      mode: 'insert',
      step: 'F',
      octave: 4,
      alter: 0,
    },
  });

  assert.ok(resolved);
  assert.equal(resolved.timestampNum, 1);
  assert.equal(resolved.timestampDen, 4);
  assert.equal(resolved.domX, 190);
  assert.equal(resolved.allowOccupiedInsert, true);
});

test('resolvePointerEditTarget corrects stale exact timestamps when pointer X is closer to another slot', () => {
  const editMap = createEditMap();

  const resolved = resolvePointerEditTarget({
    editMap,
    candidate: {
      measureId: 'm1',
      corePartId: 'P1',
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 1,
      timestampDen: 4,
      domX: 121,
      mode: 'replace',
      step: 'E',
      octave: 4,
      alter: 0,
    },
  });

  assert.ok(resolved);
  assert.equal(resolved.timestampNum, 0);
  assert.equal(resolved.timestampDen, 4);
  assert.match(resolved.diagnostics.join(' '), /slot-snapped:m1:1:1\/4->0\/1/);
});

test('resolvePointerEditTarget does not let synthetic mouse slots override an existing rhythmic anchor', () => {
  const realRestSlot = {
    id: 'slot:m1:1:0/1',
    measureId: 'm1',
    measureNumber: 1,
    corePartId: 'P1',
    staffIndex: 1,
    timestampNum: 0,
    timestampDen: 4,
    ratio: 0,
    domX: 120,
    voiceIds: [1],
    synthetic: false,
  };
  const syntheticQuarterSlot = {
    id: 'slot:m1:1:1/4',
    measureId: 'm1',
    measureNumber: 1,
    corePartId: 'P1',
    staffIndex: 1,
    timestampNum: 1,
    timestampDen: 4,
    ratio: 0.25,
    domX: 190,
    voiceIds: [1],
    synthetic: true,
  };
  const editMap = {
    measures: new Map([
      ['m1', {
        measureId: 'm1',
        measureNumber: 1,
        corePartId: 'P1',
        staves: [{
          staffIndex: 1,
          slots: [realRestSlot, syntheticQuarterSlot],
          slotsByTimestamp: new Map([
            ['0/1', realRestSlot],
            ['1/4', syntheticQuarterSlot],
          ]),
          pitchLanes: [],
          pitchLanesByPitch: new Map(),
        }],
        stavesByIndex: new Map([[1, {
          staffIndex: 1,
          slots: [realRestSlot, syntheticQuarterSlot],
          slotsByTimestamp: new Map([
            ['0/1', realRestSlot],
            ['1/4', syntheticQuarterSlot],
          ]),
          pitchLanes: [],
          pitchLanesByPitch: new Map(),
        }]]),
      }],
    ]),
    measureOrder: ['m1'],
    diagnostics: [],
  };

  const resolved = resolvePointerEditTarget({
    editMap,
    candidate: {
      measureId: 'm1',
      corePartId: 'P1',
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 0,
      timestampDen: 4,
      domX: 190,
      mode: 'replace',
      step: 'F',
      octave: 4,
      alter: 0,
    },
  });

  assert.ok(resolved);
  assert.equal(resolved.timestampNum, 0);
  assert.equal(resolved.timestampDen, 4);
  assert.doesNotMatch(resolved.diagnostics.join(' '), /slot-snapped/);
});

test('resolvePointerEditTarget rejects near-miss timestamps when the pointer is too far from any slot', () => {
  const editMap = createEditMap();

  const resolved = resolvePointerEditTarget({
    editMap,
    candidate: {
      measureId: 'm1',
      corePartId: 'P1',
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 2,
      timestampDen: 4,
      domX: 500,
      mode: 'replace',
      step: 'F',
      octave: 4,
      alter: 0,
    },
  });

  assert.equal(resolved, null);
});

test('pointerEntryLocatorsShareOnset tolerates render/core measure id differences for the same semantic slot', () => {
  assert.equal(pointerEntryLocatorsShareOnset(
    {
      measureId: 'rendered-measure-1',
      corePartId: 'part:P1',
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 0,
      timestampDen: 4,
    },
    {
      measureId: 'measure:P1:1:1',
      corePartId: 'part:P1',
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 0,
      timestampDen: 32,
    },
  ), true);
  assert.equal(pointerEntryLocatorsShareOnset(
    {
      measureId: 'rendered-measure-1',
      corePartId: 'part:P1',
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 0,
      timestampDen: 4,
    },
    {
      measureId: 'measure:P2:1:1',
      corePartId: 'part:P2',
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 0,
      timestampDen: 4,
    },
  ), false);
});

test('resolveMuseScorePointerEntryMode keeps same-onset mouse entry as chord after a fresh commit', () => {
  const target = {
    placementMode: 'replace' as const,
    placementAnchorIsRest: false,
    measureId: 'm1',
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 0,
    timestampDen: 4,
  };

  const resolved = resolveMuseScorePointerEntryMode(target, {
    entryMode: 'insert',
    chordInputMode: false,
    selectedNote: {
      measureId: 'm1',
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 1,
      timestampDen: 4,
    },
    noteInputAnchor: target,
    recentCommitTarget: target,
  });

  assert.equal(resolved?.placementMode, 'chord');
  assert.equal(resolved?.placementModePromotedByRecentCommit, true);
});

test('resolveMuseScorePointerEntryMode treats slightly-left same-onset mouse entry as chord after a fresh commit', () => {
  const target = {
    placementMode: 'insert' as const,
    placementAnchorIsRest: false,
    measureId: 'm1',
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 0,
    timestampDen: 4,
  };

  const resolved = resolveMuseScorePointerEntryMode(target, {
    entryMode: 'insert',
    chordInputMode: false,
    selectedNote: target,
    noteInputAnchor: target,
    recentCommitTarget: target,
  });

  assert.equal(resolved?.placementMode, 'chord');
});

test('resolveMuseScorePointerEntryMode lets a stale rest snap share a recent chord onset', () => {
  const target = {
    placementMode: 'replace' as const,
    placementAnchorIsRest: true,
    measureId: 'm1',
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 0,
    timestampDen: 1,
  };
  const recentCommitTarget = {
    measureId: 'm1',
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 0,
    timestampDen: 32,
  };

  const resolved = resolveMuseScorePointerEntryMode(target, {
    entryMode: 'insert',
    chordInputMode: false,
    selectedNote: null,
    noteInputAnchor: null,
    recentCommitTarget,
  });

  assert.equal(resolved?.placementMode, 'chord');
  assert.equal(resolved?.placementModePromotedByRecentCommit, true);
});

test('resolveMuseScorePointerEntryMode treats rendered replace targets without an anchor flag as note anchors', () => {
  const target = {
    placementMode: 'replace' as const,
    measureId: 'm1',
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 0,
    timestampDen: 4,
  };

  const resolved = resolveMuseScorePointerEntryMode(target, {
    entryMode: 'insert',
    chordInputMode: false,
    selectedNote: null,
    noteInputAnchor: target,
    recentCommitTarget: target,
  });

  assert.equal(resolved?.placementMode, 'chord');
});

test('resolveMuseScorePointerEntryMode treats selected same-onset mouse entry as chord while note input stays anchored', () => {
  const target = {
    placementMode: 'replace' as const,
    placementAnchorIsRest: false,
    measureId: 'm1',
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 1,
    timestampDen: 4,
  };

  const resolved = resolveMuseScorePointerEntryMode(target, {
    entryMode: 'insert',
    chordInputMode: false,
    selectedNote: target,
    noteInputAnchor: target,
    recentCommitTarget: null,
  });

  assert.equal(resolved?.placementMode, 'chord');
});

test('resolveMuseScorePointerEntryMode treats selected same-onset slightly-left mouse entry as chord while anchored', () => {
  const target = {
    placementMode: 'insert' as const,
    placementAnchorIsRest: false,
    measureId: 'm1',
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 1,
    timestampDen: 4,
  };

  const resolved = resolveMuseScorePointerEntryMode(target, {
    entryMode: 'insert',
    chordInputMode: false,
    selectedNote: target,
    noteInputAnchor: target,
    recentCommitTarget: null,
  });

  assert.equal(resolved?.placementMode, 'chord');
});

test('resolveMuseScorePointerEntryMode defaults rendered note anchors to chord entry in insert mode', () => {
  const target = {
    placementMode: 'replace' as const,
    placementAnchorIsRest: false,
    measureId: 'm1',
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 1,
    timestampDen: 4,
  };

  const resolved = resolveMuseScorePointerEntryMode(target, {
    entryMode: 'insert',
    chordInputMode: false,
    selectedNote: target,
    noteInputAnchor: null,
    recentCommitTarget: null,
  });

  assert.equal(resolved?.placementMode, 'chord');
});

test('resolveMuseScorePointerEntryMode forces chord placement on note anchors while chord input is active', () => {
  const target = {
    placementMode: 'replace' as const,
    placementAnchorIsRest: false,
    measureId: 'm1',
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 1,
    timestampDen: 4,
  };

  const resolved = resolveMuseScorePointerEntryMode(target, {
    entryMode: 'overwrite',
    chordInputMode: true,
    selectedNote: target,
    noteInputAnchor: target,
    recentCommitTarget: null,
  });

  assert.equal(resolved?.placementMode, 'chord');
});

test('resolveMuseScorePointerEntryMode keeps rest anchors replaceable while chord input is active', () => {
  const target = {
    placementMode: 'replace' as const,
    placementAnchorIsRest: true,
    measureId: 'm1',
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 1,
    timestampDen: 4,
  };

  const resolved = resolveMuseScorePointerEntryMode(target, {
    entryMode: 'overwrite',
    chordInputMode: true,
    selectedNote: null,
    noteInputAnchor: null,
    recentCommitTarget: null,
  });

  assert.equal(resolved?.placementMode, 'replace');
});

test('shouldCommitPointerGhostOverDirectNote lets a same-onset different-pitch ghost beat proximity note selection', () => {
  const directNote = {
    measureId: 'm1',
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 1,
    timestampDen: 4,
    step: 'G',
    octave: 4,
    alter: 0,
  };
  const ghostTarget = {
    ...directNote,
    step: 'B',
    octave: 4,
    placementMode: 'chord' as const,
    resolvedTarget: { mode: 'chord' as const },
  };

  assert.equal(shouldCommitPointerGhostOverDirectNote({
    ghostTarget,
    directNote,
    directlyHitRendered: false,
    clickedNoteheadPath: false,
    clickedVisibleGhostAtPointer: false,
    altKey: false,
  }), true);
});

test('visible ghost at beat 2 wins over a rendered rest path at beat 3', () => {
  const ghostTarget = {
    measureId: 'm1',
    corePartId: 'p1',
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 8,
    timestampDen: 32,
    step: 'G',
    octave: 4,
    alter: 0,
    placementMode: 'replace' as const,
    resolvedTarget: { mode: 'replace' as const },
  };
  const laterRest = {
    ...ghostTarget,
    timestampNum: 16,
    isRest: true,
  };

  assert.equal(shouldTreatPointerAsExplicitVisibleGhost({
    ghostTarget,
    renderedPathNote: laterRest,
    clickedVisibleGhost: true,
  }), true);
  assert.equal(shouldCommitPointerGhostOverDirectNote({
    ghostTarget,
    directNote: laterRest,
    directlyHitRendered: true,
    clickedNoteheadPath: false,
    directNoteheadHit: true,
    clickedVisibleGhostAtPointer: true,
    altKey: false,
  }), true);
});

test('locked visible ghost is not discarded by a rendered path at another onset', () => {
  const ghostTarget = {
    measureId: 'm1',
    corePartId: 'p1',
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 8,
    timestampDen: 32,
    step: 'G',
    octave: 4,
    alter: 0,
    placementMode: 'replace' as const,
    resolvedTarget: { mode: 'replace' as const },
  };

  assert.equal(shouldTreatPointerAsExplicitVisibleGhost({
    ghostTarget,
    renderedPathNote: { ...ghostTarget, timestampNum: 16, step: 'C', isRest: false },
    clickedVisibleGhost: true,
  }), true);
});

test('same-onset same-pitch rendered notehead remains a direct selection target', () => {
  const ghostTarget = {
    measureId: 'm1',
    corePartId: 'p1',
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 8,
    timestampDen: 32,
    step: 'G',
    octave: 4,
    alter: 0,
    placementMode: 'chord' as const,
    resolvedTarget: { mode: 'chord' as const },
  };

  assert.equal(shouldTreatPointerAsExplicitVisibleGhost({
    ghostTarget,
    renderedPathNote: { ...ghostTarget, isRest: false },
    clickedVisibleGhost: true,
  }), false);
});

test('same-onset different-pitch visible ghost wins over the rendered note beneath it', () => {
  const ghostTarget = {
    measureId: 'm1',
    corePartId: 'p1',
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 8,
    timestampDen: 32,
    step: 'G',
    octave: 4,
    alter: 0,
    placementMode: 'replace' as const,
    resolvedTarget: { mode: 'replace' as const },
  };

  assert.equal(shouldTreatPointerAsExplicitVisibleGhost({
    ghostTarget,
    renderedPathNote: { ...ghostTarget, step: 'B', isRest: false },
    clickedVisibleGhost: true,
  }), true);
});

test('shouldCommitPointerGhostOverDirectNote lets an insert ghost beat proximity note selection', () => {
  const directNote = {
    measureId: 'm1',
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 1,
    timestampDen: 4,
    step: 'G',
    octave: 4,
    alter: 0,
  };
  const ghostTarget = {
    ...directNote,
    step: 'B',
    octave: 4,
    placementMode: 'insert' as const,
    resolvedTarget: { mode: 'insert' as const },
  };

  assert.equal(shouldCommitPointerGhostOverDirectNote({
    ghostTarget,
    directNote,
    directlyHitRendered: false,
    clickedNoteheadPath: false,
    clickedVisibleGhostAtPointer: false,
    altKey: false,
  }), true);
});

test('shouldCommitPointerGhostOverDirectNote keeps insert-mode direct notehead clicks selectable', () => {
  const directNote = {
    measureId: 'm1',
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 1,
    timestampDen: 4,
    step: 'G',
    octave: 4,
    alter: 0,
  };
  const ghostTarget = {
    ...directNote,
    step: 'B',
    octave: 4,
    placementMode: 'insert' as const,
    resolvedTarget: { mode: 'insert' as const },
  };

  assert.equal(shouldCommitPointerGhostOverDirectNote({
    ghostTarget,
    directNote,
    directlyHitRendered: true,
    clickedNoteheadPath: true,
    directNoteheadHit: true,
    clickedVisibleGhostAtPointer: false,
    chordInputIntent: true,
    altKey: false,
  }), false);
});

test('shouldCommitPointerGhostOverDirectNote lets chord ghosts beat overlapping noteheads for a new pitch', () => {
  const directNote = {
    measureId: 'm1',
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 1,
    timestampDen: 4,
    step: 'G',
    octave: 4,
    alter: 0,
  };
  const ghostTarget = {
    ...directNote,
    step: 'B',
    octave: 4,
    placementMode: 'chord' as const,
    resolvedTarget: { mode: 'chord' as const },
  };

  assert.equal(shouldCommitPointerGhostOverDirectNote({
    ghostTarget,
    directNote,
    directlyHitRendered: true,
    clickedNoteheadPath: true,
    directNoteheadHit: true,
    clickedVisibleGhostAtPointer: false,
    chordInputIntent: true,
    altKey: false,
  }), true);
});

test('shouldCommitPointerGhostOverDirectNote keeps same-pitch notehead clicks selectable', () => {
  const directNote = {
    measureId: 'm1',
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 1,
    timestampDen: 4,
    step: 'G',
    octave: 4,
    alter: 0,
  };
  const ghostTarget = {
    ...directNote,
    placementMode: 'chord' as const,
    resolvedTarget: { mode: 'chord' as const },
  };

  assert.equal(shouldCommitPointerGhostOverDirectNote({
    ghostTarget,
    directNote,
    directlyHitRendered: true,
    clickedNoteheadPath: true,
    directNoteheadHit: true,
    clickedVisibleGhostAtPointer: false,
    altKey: false,
  }), false);
});

test('shouldCommitPointerGhostOverDirectNote lets explicit ghost or modifier clicks commit over direct notes', () => {
  const directNote = {
    measureId: 'm1',
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 1,
    timestampDen: 4,
    step: 'G',
    octave: 4,
    alter: 0,
  };
  const ghostTarget = {
    ...directNote,
    step: 'B',
    octave: 4,
    placementMode: 'insert' as const,
    resolvedTarget: { mode: 'insert' as const },
  };

  assert.equal(shouldCommitPointerGhostOverDirectNote({
    ghostTarget,
    directNote,
    directlyHitRendered: true,
    clickedNoteheadPath: true,
    directNoteheadHit: true,
    clickedVisibleGhostAtPointer: true,
    chordInputIntent: true,
    altKey: false,
  }), true);

  assert.equal(shouldCommitPointerGhostOverDirectNote({
    ghostTarget,
    directNote,
    directlyHitRendered: true,
    clickedNoteheadPath: true,
    directNoteheadHit: true,
    clickedVisibleGhostAtPointer: true,
    chordInputIntent: false,
    altKey: false,
  }), true);

  assert.equal(shouldCommitPointerGhostOverDirectNote({
    ghostTarget,
    directNote,
    directlyHitRendered: true,
    clickedNoteheadPath: true,
    directNoteheadHit: true,
    clickedVisibleGhostAtPointer: false,
    chordInputIntent: true,
    altKey: true,
  }), true);
});

test('resolveKeyboardEditTarget resolves replace, chord, and insert modes from entry intent', () => {
  const anchor = {
    coreMeasureId: 'm1',
    corePartId: 'P1',
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 1,
    timestampDen: 4,
  };
  const timing = { timestampNum: 1, timestampDen: 4, durationDivisions: 1 };

  const replace = resolveKeyboardEditTarget({
    anchor,
    pitch: { step: 'F', octave: 4, alter: 0 },
    entryMode: 'overwrite',
    noteInputMode: true,
    chordInputMode: false,
    selectedVoice: 1,
    selectedTiming: timing,
  });
  assert.ok(replace);
  assert.equal(replace.mode, 'replace');
  assert.equal(replace.voiceId, 1);
  assert.equal(replace.timestampNum, 1);

  const chord = resolveKeyboardEditTarget({
    anchor,
    pitch: { step: 'A', octave: 4, alter: 0 },
    entryMode: 'insert',
    noteInputMode: true,
    chordInputMode: false,
    forceChord: true,
    selectedVoice: 2,
    selectedTiming: timing,
  });
  assert.ok(chord);
  assert.equal(chord.mode, 'chord');
  assert.equal(chord.voiceId, 1);
  assert.equal(chord.timestampNum, 1);

  const insert = resolveKeyboardEditTarget({
    anchor,
    pitch: { step: 'G', octave: 4, alter: 0 },
    entryMode: 'insert',
    noteInputMode: true,
    chordInputMode: false,
    selectedVoice: 2,
    selectedTiming: timing,
  });
  assert.ok(insert);
  assert.equal(insert.mode, 'insert');
  assert.equal(insert.voiceId, 2);
  assert.equal(insert.timestampNum, 2);
  assert.equal(insert.allowOccupiedInsert, true);

  const cursorInsert = resolveKeyboardEditTarget({
    anchor,
    pitch: { step: 'B', octave: 4, alter: 0 },
    entryMode: 'insert',
    noteInputMode: true,
    chordInputMode: false,
    selectedVoice: 1,
    selectedTiming: timing,
    insertAtCursor: true,
  });
  assert.ok(cursorInsert);
  assert.equal(cursorInsert.mode, 'insert');
  assert.equal(cursorInsert.timestampNum, 1);
  assert.equal(cursorInsert.allowOccupiedInsert, true);
});

test('resolveKeyboardDeleteAction keeps standard delete separate from ripple delete shortcuts', () => {
  assert.equal(resolveKeyboardDeleteAction({
    key: 'Delete',
    shiftKey: false,
    metaKey: false,
    ctrlKey: false,
    hasSelection: true,
    noteInputMode: false,
  }), 'delete');

  assert.equal(resolveKeyboardDeleteAction({
    key: 'Delete',
    shiftKey: true,
    metaKey: false,
    ctrlKey: false,
    hasSelection: true,
    noteInputMode: false,
  }), 'rippleDelete');

  assert.equal(resolveKeyboardDeleteAction({
    key: 'Backspace',
    shiftKey: false,
    metaKey: true,
    ctrlKey: false,
    hasSelection: false,
    noteInputMode: true,
  }), 'rippleDelete');

  assert.equal(resolveKeyboardDeleteAction({
    key: 'Backspace',
    shiftKey: true,
    metaKey: false,
    ctrlKey: false,
    hasSelection: true,
    noteInputMode: false,
  }), 'rippleDelete');

  assert.equal(resolveKeyboardDeleteAction({
    key: 'Delete',
    shiftKey: true,
    metaKey: true,
    ctrlKey: false,
    hasSelection: true,
    noteInputMode: false,
  }), 'clearMeasureVoice');

  assert.equal(resolveKeyboardDeleteAction({
    key: 'Backspace',
    shiftKey: true,
    metaKey: false,
    ctrlKey: true,
    hasSelection: true,
    noteInputMode: false,
  }), 'clearMeasureVoice');
});

test('resolveKeyboardEntryModeShortcut supports MuseScore-compatible insert and overwrite shortcuts', () => {
  assert.equal(resolveKeyboardEntryModeShortcut({
    key: 'i',
    shiftKey: false,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
  }), 'toggle');

  assert.equal(resolveKeyboardEntryModeShortcut({
    key: 'I',
    shiftKey: false,
    metaKey: true,
    ctrlKey: false,
    altKey: false,
  }), 'insert');

  assert.equal(resolveKeyboardEntryModeShortcut({
    key: 'I',
    shiftKey: true,
    metaKey: false,
    ctrlKey: true,
    altKey: false,
  }), 'overwrite');

  assert.equal(resolveKeyboardEntryModeShortcut({
    key: 'I',
    shiftKey: false,
    metaKey: true,
    ctrlKey: false,
    altKey: true,
  }), null);
});

test('resolveKeyboardChordInputShortcut separates chord input from inline chord-symbol focus', () => {
  assert.equal(resolveKeyboardChordInputShortcut({
    key: 'H',
    shiftKey: true,
    metaKey: true,
    ctrlKey: false,
    altKey: false,
  }), 'toggleChordInput');

  assert.equal(resolveKeyboardChordInputShortcut({
    key: 'K',
    shiftKey: false,
    metaKey: true,
    ctrlKey: false,
    altKey: false,
  }), 'focusChordSymbol');

  assert.equal(resolveKeyboardChordInputShortcut({
    key: 'H',
    shiftKey: true,
    metaKey: true,
    ctrlKey: false,
    altKey: true,
  }), null);
});

test('resolveKeyboardDurationShortcut maps supported durations including MuseScore long values', () => {
  assert.deepEqual(resolveKeyboardDurationShortcut({ key: '5' }), {
    type: 'selectDuration',
    key: '5',
    duration: '4',
  });
  assert.deepEqual(resolveKeyboardDurationShortcut({ key: '&', code: 'Digit7' }), {
    type: 'selectDuration',
    key: '7',
    duration: '1',
  });
  assert.deepEqual(resolveKeyboardDurationShortcut({ key: '8' }), {
    type: 'selectDuration',
    key: '8',
    duration: 'breve',
  });
  assert.deepEqual(resolveKeyboardDurationShortcut({ key: '(', code: 'Digit9' }), {
    type: 'selectDuration',
    key: '9',
    duration: 'long',
  });
  assert.equal(resolveKeyboardDurationShortcut({ key: '0' }), null);
});

test('resolveKeyboardIntervalShortcut supports physical Alt/Option digit keys without stealing modified commands', () => {
  assert.equal(resolveKeyboardIntervalShortcut({
    key: '£',
    code: 'Digit3',
    shiftKey: false,
    metaKey: false,
    ctrlKey: false,
    altKey: true,
  }), 3);
  assert.equal(resolveKeyboardIntervalShortcut({
    key: '9',
    code: 'Digit9',
    shiftKey: false,
    metaKey: false,
    ctrlKey: false,
    altKey: true,
  }), 9);
  assert.equal(resolveKeyboardIntervalShortcut({
    key: '3',
    code: 'Digit3',
    shiftKey: true,
    metaKey: false,
    ctrlKey: false,
    altKey: true,
  }), null);
  assert.equal(resolveKeyboardIntervalShortcut({
    key: '3',
    code: 'Digit3',
    shiftKey: false,
    metaKey: true,
    ctrlKey: false,
    altKey: true,
  }), null);
  assert.equal(resolveKeyboardIntervalShortcut({
    key: '3',
    code: 'Digit3',
    shiftKey: false,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
  }), null);
});

test('buildNoteEntryCommitCommands maps resolved targets to shared semantic commands', () => {
  const target = {
    source: 'keyboard' as const,
    mode: 'replace' as const,
    measureId: 'm1',
    corePartId: 'P1',
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 1,
    timestampDen: 4,
    ratio: 0.25,
    domX: null,
    step: 'E',
    octave: 4,
    alter: 0,
    diagnostics: [],
  };

  const replaceCommands = buildNoteEntryCommitCommands({
    target,
    durationType: 'quarter',
    isDotted: false,
    existingEventKind: 'note',
  });
  assert.equal(replaceCommands.length, 2);
  assert.equal(replaceCommands[0]?.type, 'changeNotePitch');
  assert.equal(replaceCommands[1]?.type, 'changeNoteDuration');

  const chordCommands = buildNoteEntryCommitCommands({
    target: { ...target, mode: 'chord', voiceId: 2 },
    durationType: 'eighth',
    isDotted: true,
    existingEventKind: 'note',
  });
  assert.equal(chordCommands.length, 1);
  assert.equal(chordCommands[0]?.type, 'insertNoteAt');
  assert.equal(chordCommands[0]?.asChord, true);

  assert.deepEqual(toResolvedEditLocator(target), {
    coreMeasureId: 'm1',
    corePartId: 'P1',
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 1,
    timestampDen: 4,
  });
});

test('inspectResolvedEditTarget rejects canonical quarter slots inside a whole-rest measure', () => {
  const coreDocument = importMusicXmlToCore(FULL_REST_XML);

  const inspected = inspectResolvedEditTarget({
    coreDocument,
    target: {
      source: 'pointer',
      mode: 'replace',
      measureId: coreDocument.score.parts[0]!.staves[0]!.measures[0]!.id,
      corePartId: coreDocument.score.parts[0]!.id,
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 2,
      timestampDen: 4,
      ratio: 0.5,
      domX: 180,
      step: 'E',
      octave: 4,
      alter: 0,
      diagnostics: [],
    },
    durationType: 'quarter',
    isDotted: false,
  });

  assert.equal(inspected.target, null);
  assert.equal(inspected.rejectionReason, 'target-inside-rest');
  assert.match(inspected.diagnostics.join(' '), /validation:full-measure-rest-internal-slot-rejected/);
});

test('inspectResolvedEditTarget rejects replace mode when no replaceable target exists at the slot', () => {
  const coreDocument = importMusicXmlToCore(SINGLE_NOTE_XML);

  const inspected = inspectResolvedEditTarget({
    coreDocument,
    target: {
      source: 'pointer',
      mode: 'replace',
      measureId: coreDocument.score.parts[0]!.staves[0]!.measures[0]!.id,
      corePartId: coreDocument.score.parts[0]!.id,
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 2,
      timestampNum: 1,
      timestampDen: 4,
      ratio: 0.25,
      domX: 150,
      step: 'D',
      octave: 4,
      alter: 0,
      diagnostics: [],
    },
    durationType: 'quarter',
    isDotted: false,
  });

  assert.equal(inspected.target, null);
  assert.equal(inspected.rejectionReason, 'replace-target-missing');
});

test('inspectResolvedEditTarget allows explicit keyboard cursor inserts on occupied note slots', () => {
  const coreDocument = importMusicXmlToCore(SINGLE_NOTE_XML);
  const measure = coreDocument.score.parts[0]!.staves[0]!.measures[0]!;

  const inspected = inspectResolvedEditTarget({
    coreDocument,
    target: {
      source: 'keyboard',
      mode: 'insert',
      measureId: measure.id,
      corePartId: coreDocument.score.parts[0]!.id,
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 0,
      timestampDen: 4,
      ratio: 0,
      domX: null,
      step: 'D',
      octave: 4,
      alter: 0,
      allowOccupiedInsert: true,
      diagnostics: ['x-resolved-from-anchor-slot'],
    },
    durationType: 'quarter',
    isDotted: false,
  });

  assert.ok(inspected.target);
  assert.equal(inspected.rejectionReason, null);
  assert.equal(inspected.target?.existingEventKind, 'note');
  assert.match(inspected.diagnostics.join(' '), /validation:insert-occupied-allowed/);
});

test('inspectResolvedEditTarget rejects insert mode that would overfill the measure', () => {
  const coreDocument = importMusicXmlToCore(FULL_REST_XML);

  const inspected = inspectResolvedEditTarget({
    coreDocument,
    target: {
      source: 'pointer',
      mode: 'insert',
      measureId: coreDocument.score.parts[0]!.staves[0]!.measures[0]!.id,
      corePartId: coreDocument.score.parts[0]!.id,
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 3,
      timestampDen: 4,
      ratio: 0.75,
      domX: 220,
      step: 'G',
      octave: 4,
      alter: 0,
      diagnostics: [],
    },
    durationType: 'half',
    isDotted: false,
  });

  assert.equal(inspected.target, null);
  assert.equal(inspected.rejectionReason, 'overflow-rejected');
});

test('inspectResolvedEditTarget rejects arbitrary insert mode inside a spanning rest', () => {
  const coreDocument = importMusicXmlToCore(FULL_REST_XML);
  const measure = coreDocument.score.parts[0]!.staves[0]!.measures[0]!;

  const inspected = inspectResolvedEditTarget({
    coreDocument,
    target: {
      source: 'pointer',
      mode: 'insert',
      measureId: measure.id,
      corePartId: coreDocument.score.parts[0]!.id,
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 1,
      timestampDen: 4,
      ratio: 0.25,
      domX: 160,
      step: 'G',
      octave: 4,
      alter: 0,
      allowOccupiedInsert: true,
      preserveOverflow: true,
      diagnostics: [],
    },
    durationType: 'quarter',
    isDotted: false,
  });

  assert.equal(inspected.target, null);
  assert.equal(inspected.rejectionReason, 'target-inside-rest');
  assert.match(inspected.diagnostics.join(' '), /validation:full-measure-rest-internal-slot-rejected/);
});

test('inspectResolvedEditTarget rejects preserved internal slots inside a whole-rest measure', () => {
  const coreDocument = importMusicXmlToCore(FULL_REST_XML);
  const measure = coreDocument.score.parts[0]!.staves[0]!.measures[0]!;

  const inspected = inspectResolvedEditTarget({
    coreDocument,
    target: {
      source: 'pointer',
      mode: 'insert',
      measureId: measure.id,
      corePartId: coreDocument.score.parts[0]!.id,
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 1,
      timestampDen: 4,
      ratio: 0.25,
      domX: 160,
      step: 'G',
      octave: 4,
      alter: 0,
      allowOccupiedInsert: true,
      preserveOverflow: true,
      diagnostics: ['rest-only-quantized-internal-slot', 'rest-only-internal-slot-preserved'],
    },
    durationType: 'quarter',
    isDotted: false,
  });

  assert.equal(inspected.target, null);
  assert.equal(inspected.rejectionReason, 'target-inside-rest');
  assert.match(inspected.diagnostics.join(' '), /validation:full-measure-rest-internal-slot-rejected/);
});

test('inspectResolvedEditTarget rejects occupied note-entry insert when the measure is already full', () => {
  const coreDocument = importMusicXmlToCore(FULL_EIGHTH_MEASURE_XML);
  const measure = coreDocument.score.parts[0]!.staves[0]!.measures[0]!;

  const inspected = inspectResolvedEditTarget({
    coreDocument,
    target: {
      source: 'keyboard',
      mode: 'insert',
      measureId: measure.id,
      corePartId: coreDocument.score.parts[0]!.id,
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 0,
      timestampDen: 8,
      ratio: 0,
      domX: null,
      step: 'D',
      octave: 5,
      alter: 0,
      allowOccupiedInsert: true,
      diagnostics: [],
    },
    durationType: 'eighth',
    isDotted: false,
  });

  assert.equal(inspected.target, null);
  assert.equal(inspected.rejectionReason, 'overflow-rejected');
  assert.match(inspected.diagnostics.join(' '), /validation:occupied-insert-overflow-rejected/);
});

test('inspectResolvedEditTarget allows pointer inserts that explicitly preserve overflow', () => {
  const coreDocument = importMusicXmlToCore(FULL_EIGHTH_MEASURE_XML);
  const measure = coreDocument.score.parts[0]!.staves[0]!.measures[0]!;

  const inspected = inspectResolvedEditTarget({
    coreDocument,
    target: {
      source: 'pointer',
      mode: 'insert',
      measureId: measure.id,
      corePartId: coreDocument.score.parts[0]!.id,
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 0,
      timestampDen: 8,
      ratio: 0,
      domX: 120,
      step: 'D',
      octave: 5,
      alter: 0,
      allowOccupiedInsert: true,
      preserveOverflow: true,
      diagnostics: [],
    },
    durationType: 'eighth',
    isDotted: false,
  });

  assert.ok(inspected.target);
  assert.equal(inspected.rejectionReason, null);
  assert.equal(inspected.target?.preserveOverflow, true);
  assert.match(inspected.diagnostics.join(' '), /validation:insert-occupied-allowed/);
});
