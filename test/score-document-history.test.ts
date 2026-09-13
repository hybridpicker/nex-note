import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { createNxnFile } from '../lib/nxn-file.ts';
import { SNAPSHOT_INTERVAL, useScoreDocument } from '../hooks/useScoreDocument.ts';
import { buildDocumentState } from '../src/score-core/commands/apply-document-commands.ts';
import { importMusicXmlToCore } from '../src/musicxml-adapter/import/import-musicxml.ts';

// Silence React act environment warnings in the Node test runner.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <work><work-title>History Score</work-title></work>
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>1</duration>
        <voice>1</voice>
        <type>quarter</type>
        <staff>1</staff>
      </note>
    </measure>
  </part>
</score-partwise>`;

const EIGHT_EIGHTH_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Guitar</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>2</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
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

type HookValue = ReturnType<typeof useScoreDocument>;

function renderHook(initialXml = '', options?: Parameters<typeof useScoreDocument>[1]) {
  const ref: { current: HookValue | null } = { current: null };

  function Harness() {
    ref.current = useScoreDocument(initialXml, options);
    return null;
  }

  let renderer: ReturnType<typeof create> | null = null;
  act(() => {
    renderer = create(React.createElement(Harness));
  });

  return {
    get current() {
      return ref.current!;
    },
    unmount() {
      act(() => {
        renderer?.unmount();
      });
    },
  };
}

test('bounded history retains the prefix when more than one hundred edits are followed by Undo', () => {
  const hook = renderHook(SAMPLE_XML);
  try {
    act(() => { hook.current.applyCommands([{ type: 'setComposer', composer: 'Synthetic prefix' }]); });
    for (let index = 0; index < 100; index++) {
      act(() => { hook.current.applyCommands([{ type: 'setTitle', title: `Synthetic edit ${index}` }]); });
    }
    assert.equal(hook.current.historyDepth, 100);
    act(() => hook.current.undo());
    assert.match(hook.current.xml, /Synthetic prefix/);
    assert.match(hook.current.xml, /Synthetic edit 98/);
    act(() => hook.current.redo());
    assert.match(hook.current.xml, /Synthetic prefix/);
    assert.match(hook.current.xml, /Synthetic edit 99/);
  } finally { hook.unmount(); }
});

test('useScoreDocument loads .nxn state without invoking XML-to-core hydration', () => {
  const coreDocument = importMusicXmlToCore(SAMPLE_XML);
  let xmlHydrationCalls = 0;
  const hook = renderHook('', {
    buildXmlState: (xml, options) => {
      if (xml.trim()) xmlHydrationCalls += 1;
      return buildDocumentState(xml, options);
    },
  });

  const nxn = createNxnFile({
    document: coreDocument,
    sourceMusicXml: SAMPLE_XML,
    session: {
      selectionAnchor: {
        entityIds: ['persisted:event:1'],
        anchorEntityId: 'persisted:event:1',
        anchorLocator: {
          coreMeasureId: 'persisted:measure:1',
          corePartId: 'persisted:part:1',
          measureNumber: 1,
          staffIndex: 1,
          voiceId: 2,
          timestampNum: 1,
          timestampDen: 4,
        },
        selectionLocators: [{
          coreMeasureId: 'persisted:measure:1',
          corePartId: 'persisted:part:1',
          measureNumber: 1,
          staffIndex: 1,
          voiceId: 2,
          timestampNum: 1,
          timestampDen: 4,
        }],
      },
      viewMode: 'page',
      zoomPercent: 140,
      selectedDuration: '8',
      selectedVoice: 2,
    },
  });

  act(() => {
    hook.current.loadFromNxn(nxn);
  });

  assert.equal(xmlHydrationCalls, 0);
  assert.equal(hook.current.coreDocument?.metadata.title, 'History Score');
  assert.equal(hook.current.sourceMusicXml, SAMPLE_XML);
  assert.match(hook.current.xml, /<score-partwise/);
  assert.deepEqual(hook.current.session, nxn.session);
  assert.equal(hook.current.historyMeta.lastAction, 'load');
  assert.deepEqual(hook.current.historyMeta.currentSelectionAnchor, nxn.session.selectionAnchor);
  hook.unmount();
});

test('useScoreDocument keeps core-backed history across undo/redo', () => {
  const hook = renderHook(SAMPLE_XML);

  act(() => {
    hook.current.applyCommands([{ type: 'setTitle', title: 'Updated History' }], { label: 'Set title' });
  });

  assert.equal(hook.current.coreDocument?.metadata.title, 'Updated History');
  assert.equal(hook.current.historyMeta.lastAction, 'apply');
  assert.equal(hook.current.historyDepth, 1);
  assert.equal(hook.current.historyMeta.lastTransaction?.source, 'apply');
  assert.equal(hook.current.historyMeta.lastTransaction?.mode, 'commands');
  assert.equal(hook.current.historyMeta.lastTransaction?.commandCount, 1);
  assert.equal(hook.current.historyMeta.lastTransaction?.rollbackMode, 'inverse');
  assert.equal(hook.current.historyMeta.lastTransaction?.reversible, true);
  assert.equal(hook.current.historyMeta.lastTransaction?.inverseCommandCount, 1);
  assert.deepEqual(hook.current.historyMeta.lastTransaction?.inverseCommands, [{ type: 'setTitle', title: 'History Score' }]);
  assert.ok(hook.current.historyMeta.lastTransaction?.id);

  act(() => {
    hook.current.undo();
  });

  assert.equal(hook.current.coreDocument?.metadata.title, 'History Score');
  assert.equal(hook.current.historyMeta.lastAction, 'undo');
  assert.equal(hook.current.historyMeta.lastTransaction?.source, 'undo');

  act(() => {
    hook.current.redo();
  });

  assert.equal(hook.current.coreDocument?.metadata.title, 'Updated History');
  assert.equal(hook.current.historyMeta.lastAction, 'redo');
  assert.equal(hook.current.historyMeta.lastTransaction?.source, 'redo');
  hook.unmount();
});

test('useScoreDocument keeps semantic-only layout hints in history when render XML is unchanged', () => {
  const hook = renderHook(SAMPLE_XML);
  const originalXml = hook.current.xml;

  let result: ReturnType<HookValue['applyCommands']>;
  act(() => {
    result = hook.current.applyCommands([{
      type: 'setMeasureLayoutHint',
      measureNumber: 1,
      staffIndex: 1,
      hint: 'collisionPolicy',
      value: 'open',
    }], { label: 'Open collision spacing' });
  });

  assert.equal(result!.applied, true);
  assert.equal(hook.current.xml, originalXml);
  assert.equal(hook.current.historyDepth, 1);
  assert.equal(hook.current.historyMeta.lastTransaction?.rollbackMode, 'snapshot');
  assert.equal(hook.current.coreDocument?.layoutHints.find((hint) => hint.kind === 'collisionPolicy')?.value, 'open');

  act(() => hook.current.undo());
  assert.equal(hook.current.coreDocument?.layoutHints.some((hint) => hint.kind === 'collisionPolicy'), false);

  act(() => hook.current.redo());
  assert.equal(hook.current.coreDocument?.layoutHints.find((hint) => hint.kind === 'collisionPolicy')?.value, 'open');
  hook.unmount();
});

test('useScoreDocument replays command history across multiple undo/redo steps', () => {
  const hook = renderHook(SAMPLE_XML);

  act(() => {
    hook.current.applyCommands([{ type: 'setTitle', title: 'Step 1' }], { label: 'Step 1' });
  });
  act(() => {
    hook.current.applyCommands([{ type: 'setComposer', composer: 'Composer 2' }], { label: 'Step 2' });
  });

  assert.equal(hook.current.coreDocument?.metadata.title, 'Step 1');
  assert.equal(hook.current.coreDocument?.metadata.composer, 'Composer 2');

  act(() => {
    hook.current.undo();
  });
  assert.equal(hook.current.coreDocument?.metadata.title, 'Step 1');
  assert.equal(hook.current.coreDocument?.metadata.composer, undefined);

  act(() => {
    hook.current.undo();
  });
  assert.equal(hook.current.coreDocument?.metadata.title, 'History Score');
  assert.equal(hook.current.coreDocument?.metadata.composer, undefined);

  act(() => {
    hook.current.redo();
  });
  assert.equal(hook.current.coreDocument?.metadata.title, 'Step 1');

  act(() => {
    hook.current.redo();
  });
  assert.equal(hook.current.coreDocument?.metadata.composer, 'Composer 2');
  hook.unmount();
});

test('useScoreDocument undo restores notes consumed by a duration expansion', () => {
  const hook = renderHook(EIGHT_EIGHTH_XML);

  act(() => {
    hook.current.applyCommands([{
      type: 'changeNoteDuration',
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 2,
      timestampDen: 8,
      durationType: 'quarter',
      isDotted: false,
    }], { label: 'Expand duration' });
  });

  let events = hook.current.coreDocument?.score.parts[0].staves[0].measures[0].voices[0].events ?? [];
  assert.equal(events.some((event) => event.kind === 'note' && event.pitch.step === 'F'), false);
  assert.equal(events.reduce((sum, event) => sum + event.durationDivisions, 0), 8);

  act(() => {
    hook.current.undo();
  });

  events = hook.current.coreDocument?.score.parts[0].staves[0].measures[0].voices[0].events ?? [];
  assert.equal(hook.current.historyDepth, 0);
  assert.equal(events.length, 8);
  assert.equal(events.some((event) => event.kind === 'note' && event.pitch.step === 'F'), true);
  assert.equal(events.every((event) => event.durationType === 'eighth' && event.durationDivisions === 1), true);
  hook.unmount();
});

test('useScoreDocument can undo and redo snapshot replace entries alongside command history', () => {
  const hook = renderHook(SAMPLE_XML);
  const replacementXml = SAMPLE_XML.replace('History Score', 'Replacement Score');

  act(() => {
    hook.current.applyCommands([{ type: 'setTitle', title: 'Command Step' }], { label: 'Command step' });
  });
  act(() => {
    hook.current.replaceXml(replacementXml, { label: 'Replace xml' });
  });

  assert.equal(hook.current.coreDocument?.metadata.title, 'Replacement Score');
  assert.equal(hook.current.historyMeta.lastTransaction?.source, 'replace');
  assert.equal(hook.current.historyMeta.lastTransaction?.mode, 'snapshot');

  act(() => {
    hook.current.undo();
  });
  assert.equal(hook.current.coreDocument?.metadata.title, 'Command Step');

  act(() => {
    hook.current.redo();
  });
  assert.equal(hook.current.coreDocument?.metadata.title, 'Replacement Score');
  hook.unmount();
});

test('useScoreDocument exposes transaction metadata for load and reset boundaries', () => {
  const hook = renderHook('');

  act(() => {
    hook.current.loadXml(SAMPLE_XML);
  });

  assert.equal(hook.current.historyMeta.lastAction, 'load');
  assert.equal(hook.current.historyMeta.lastTransaction?.source, 'load');
  assert.equal(hook.current.historyMeta.lastTransaction?.mode, 'system');
  assert.equal(hook.current.historyMeta.lastTransaction?.commandCount, 0);
  assert.equal(hook.current.historyMeta.lastTransaction?.rollbackMode, 'none');
  assert.equal(hook.current.historyMeta.lastTransaction?.reversible, false);
  assert.equal(hook.current.historyMeta.lastTransaction?.inverseCommandCount, 0);

  act(() => {
    hook.current.reset();
  });

  assert.equal(hook.current.historyMeta.lastAction, 'reset');
  assert.equal(hook.current.historyMeta.lastTransaction?.source, 'reset');
  assert.equal(hook.current.historyMeta.lastTransaction?.mode, 'system');
  hook.unmount();
});

test('useScoreDocument exposes snapshot-backed reversible transactions when inverse commands are not yet derivable', () => {
  const hook = renderHook(SAMPLE_XML);

  act(() => {
    hook.current.applyCommands([{ type: 'insertMeasureAfter', measureNumber: 1 }], { label: 'Insert measure' });
  });

  assert.equal(hook.current.historyMeta.lastTransaction?.rollbackMode, 'snapshot');
  assert.equal(hook.current.historyMeta.lastTransaction?.reversible, true);
  assert.equal(hook.current.historyMeta.lastTransaction?.inverseCommandCount, 0);
  assert.deepEqual(hook.current.historyMeta.lastTransaction?.inverseDerivationIssues?.map((entry) => entry.type), ['insertMeasureAfter']);
  hook.unmount();
});

test('useScoreDocument marks deterministic note edits as reversible when inverse commands are derivable', () => {
  const hook = renderHook(SAMPLE_XML);

  act(() => {
    hook.current.applyCommands([
      { type: 'changeNotePitch', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 4, step: 'D', octave: 4, alter: 0 },
      { type: 'toggleTie', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 4 },
    ], { label: 'Deterministic edits' });
  });

  assert.equal(hook.current.historyMeta.lastTransaction?.rollbackMode, 'inverse');
  assert.equal(hook.current.historyMeta.lastTransaction?.reversible, true);
  assert.equal(hook.current.historyMeta.lastTransaction?.inverseCommandCount, 2);
  assert.deepEqual(hook.current.historyMeta.lastTransaction?.inverseCommands, [
    { type: 'toggleTie', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 4 },
    { type: 'changeNotePitch', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 4, step: 'C', octave: 4, alter: 0 },
  ]);
  hook.unmount();
});

test('multi-note enharmonic respelling is one identity-preserving undo and redo transaction', () => {
  const hook = renderHook(EIGHT_EIGHTH_XML);
  const beforeXml = hook.current.xml;
  const beforeIds = hook.current.coreDocument?.score.parts[0]?.staves[0]?.measures[0]?.voices[0]?.events
    .slice(0, 2)
    .map((event) => event.id);

  act(() => {
    hook.current.applyCommands([
      { type: 'changeNotePitch', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 8, step: 'D', octave: 4, alter: -2 },
      { type: 'changeNotePitch', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 1, timestampDen: 8, step: 'E', octave: 4, alter: -2 },
    ], { label: 'Respell enharmonically' });
  });

  const changedXml = hook.current.xml;
  const changedEvents = hook.current.coreDocument?.score.parts[0]?.staves[0]?.measures[0]?.voices[0]?.events.slice(0, 2) ?? [];
  assert.deepEqual(changedEvents.map((event) => event.kind === 'note' ? event.pitch : null), [
    { step: 'D', alter: -2, octave: 4 },
    { step: 'E', alter: -2, octave: 4 },
  ]);
  assert.deepEqual(changedEvents.map((event) => event.id), beforeIds);
  assert.equal(hook.current.historyDepth, 1);
  assert.equal(hook.current.historyMeta.lastTransaction?.commandCount, 2);
  assert.equal(hook.current.historyMeta.lastTransaction?.inverseCommandCount, 2);

  act(() => hook.current.undo());
  assert.equal(hook.current.xml, beforeXml);
  assert.deepEqual(
    hook.current.coreDocument?.score.parts[0]?.staves[0]?.measures[0]?.voices[0]?.events.slice(0, 2).map((event) => event.id),
    beforeIds,
  );

  act(() => hook.current.redo());
  assert.equal(hook.current.xml, changedXml);
  assert.deepEqual(
    hook.current.coreDocument?.score.parts[0]?.staves[0]?.measures[0]?.voices[0]?.events.slice(0, 2).map((event) => event.id),
    beforeIds,
  );
  hook.unmount();
});

test('useScoreDocument force-checkpoints command history at the snapshot interval', () => {
  const hook = renderHook(SAMPLE_XML);

  for (let index = 0; index < SNAPSHOT_INTERVAL - 1; index += 1) {
    act(() => {
      hook.current.applyCommands([{
        type: 'changeNotePitch',
        measureNumber: 1,
        staffIndex: 1,
        voiceId: 1,
        timestampNum: 0,
        timestampDen: 4,
        step: index % 2 === 0 ? 'D' : 'C',
        octave: 4,
        alter: 0,
      }], { label: `Pitch step ${index + 1}` });
    });
  }

  assert.equal(hook.current.lastHistoryEntry?.rollbackDocument, undefined);
  assert.equal(hook.current.lastHistoryEntry?.transaction.rollbackMode, 'inverse');

  act(() => {
    hook.current.applyCommands([{
      type: 'changeNotePitch',
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 0,
      timestampDen: 4,
      step: 'E',
      octave: 4,
      alter: 0,
    }], { label: 'Pitch checkpoint' });
  });

  assert.equal(hook.current.historyDepth, SNAPSHOT_INTERVAL);
  assert.ok(hook.current.lastHistoryEntry?.rollbackDocument);
  assert.equal((hook.current.lastHistoryEntry?.rollbackDocument as { revision?: number } | undefined)?.revision, hook.current.coreDocument?.revision);
  assert.equal(hook.current.lastHistoryEntry?.transaction.rollbackMode, 'snapshot');
  hook.unmount();
});

test('useScoreDocument force-checkpoints heavy rippleDelete batches immediately', () => {
  const hook = renderHook(`<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <work><work-title>History Score</work-title></work>
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
    </measure>
    <measure number="2">
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><rest/><duration>3</duration><voice>1</voice><type>half</type><dot/><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`);

  act(() => {
    hook.current.applyCommands([{
      type: 'rippleDelete',
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 3,
      timestampDen: 4,
    }], { label: 'Ripple delete' });
  });

  assert.equal(hook.current.historyDepth, 1);
  assert.ok(hook.current.lastHistoryEntry?.rollbackDocument);
  assert.equal(hook.current.lastHistoryEntry?.transaction.rollbackMode, 'snapshot');
  hook.unmount();
});
