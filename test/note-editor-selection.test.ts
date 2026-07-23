import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { useNoteEditor, type SelectedNote } from '../hooks/useNoteEditor.ts';
import { useScoreDocument } from '../hooks/useScoreDocument.ts';
import { applyDocumentCommands, buildDocumentState } from '../src/score-core/commands/apply-document-commands.ts';
import { importMusicXmlToCore } from '../src/musicxml-adapter/import/import-musicxml.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
if (typeof globalThis.window === 'undefined') {
  const eventTarget = new EventTarget();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).window = Object.assign(eventTarget, {
    getSelection() {
      return null;
    },
  });
}

const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
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
    </measure>
  </part>
</score-partwise>`;

const CHOIR_XML = fs.readFileSync(new URL('./fixtures/choir-lyrics.musicxml', import.meta.url), 'utf8');

const C_SHARP_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Glockenspiel</part-name><part-abbreviation>Glock.</part-abbreviation></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>2</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <note>
        <pitch><step>C</step><alter>1</alter><octave>4</octave></pitch>
        <duration>1</duration>
        <voice>1</voice>
        <type>eighth</type>
        <staff>1</staff>
      </note>
      <note><rest/><duration>7</duration><voice>1</voice><type>half</type><dot/><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`;

const CHORD_TONE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
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
      <note><chord/><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><rest/><duration>3</duration><voice>1</voice><type>half</type><dot/><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`;

const MULTI_VOICE_SAME_TIMESTAMP_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
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
      <backup><duration>1</duration></backup>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>2</voice><type>quarter</type><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`;

const TAB_CHORD_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Guitar TAB</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <staff-details><staff-type>tab</staff-type><staff-lines>6</staff-lines></staff-details>
        <clef><sign>TAB</sign></clef>
      </attributes>
      <note>
        <pitch><step>G</step><octave>3</octave></pitch>
        <duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff>
        <notations><technical><string>6</string><fret>3</fret></technical></notations>
      </note>
      <note>
        <chord/><pitch><step>B</step><octave>3</octave></pitch>
        <duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff>
        <notations><technical><string>5</string><fret>2</fret></technical></notations>
      </note>
    </measure>
  </part>
</score-partwise>`;

const PARALLEL_IDENTICAL_PARTS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Flute</part-name></score-part>
    <score-part id="P2"><part-name>Clarinet</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><rest/><duration>3</duration><voice>1</voice><type>half</type><dot/><staff>1</staff></note>
    </measure>
  </part>
  <part id="P2">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><rest/><duration>3</duration><voice>1</voice><type>half</type><dot/><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`;

function makeSelectedNotes(xml: string): SelectedNote[] {
  const core = importMusicXmlToCore(xml);
  return core.score.parts[0].staves[0].measures[0].voices[0].events.map((event) => ({
    coreEntityId: event.id,
    coreVoiceId: core.score.parts[0].staves[0].measures[0].voices[0].id,
    coreMeasureId: core.score.parts[0].staves[0].measures[0].id,
    corePartId: core.score.parts[0].id,
    measureNumber: event.measureNumber,
    staffIndex: event.staffIndex,
    voiceId: event.voiceId,
    timestampNum: event.timestampNum,
    timestampDen: event.timestampDen,
    step: event.kind === 'note' ? event.pitch.step : 'C',
    octave: event.kind === 'note' ? event.pitch.octave : 4,
    alter: event.kind === 'note' ? event.pitch.alter : 0,
    isRest: event.kind === 'rest',
    durationType: event.durationType,
    isDotted: event.isDotted,
    guitar: event.kind === 'note' ? event.guitar : undefined,
    graphicalNote: null,
  }));
}

type HookValue = ReturnType<typeof useNoteEditor>;

function renderHook(initialXml: string) {
  const ref: { current: HookValue | null } = { current: null };
  let latestXml = initialXml;

  function Harness() {
    const [document, setDocument] = React.useState(() => buildDocumentState(initialXml));
    latestXml = document.xml;
    ref.current = useNoteEditor(document.xml, document.coreDocument, (commands) => {
      setDocument((current) => {
        const next = applyDocumentCommands(current, commands);
        latestXml = next.xml;
        return next;
      });
    });
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
    rerender() {
      act(() => {
        renderer?.update(React.createElement(Harness));
      });
    },
    get xml() {
      return latestXml;
    },
    unmount() {
      act(() => {
        renderer?.unmount();
      });
    },
  };
}

function renderEditorHistoryHook(initialXml: string) {
  const ref: {
    current: (HookValue & {
      undo: ReturnType<typeof useScoreDocument>['undo'];
      redo: ReturnType<typeof useScoreDocument>['redo'];
      canUndo: boolean;
      canRedo: boolean;
      xml: string;
    }) | null;
  } = { current: null };

  function Harness() {
    const document = useScoreDocument(initialXml);
    const editor = useNoteEditor(
      document.xml,
      document.coreDocument,
      (commands, meta) => document.applyCommands(commands, { selectionAnchor: meta?.selectionAnchor ?? null }),
    );

    React.useEffect(() => {
      editor.restoreSelection(document.historyMeta.currentSelectionAnchor ?? null);
    }, [document.historyMeta.currentSelectionAnchor, document.historyMeta.lastTransaction?.id, editor.restoreSelection]);

    ref.current = {
      ...editor,
      undo: document.undo,
      redo: document.redo,
      canUndo: document.canUndo,
      canRedo: document.canRedo,
      xml: document.xml,
    };
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

test('useNoteEditor builds a range selection from anchor to shift-click target', () => {
  const hook = renderHook(SAMPLE_XML);
  const notes = makeSelectedNotes(SAMPLE_XML);

  act(() => {
    hook.current.handleNoteClick(notes[0]);
  });
  act(() => {
    hook.current.handleNoteClick(notes[2], { range: true });
  });

  assert.equal(hook.current.selectedNotes.length, 3);
  assert.deepEqual(hook.current.selection.entityIds.length, 3);
  hook.unmount();
});

test('useNoteEditor applies transposition to the full semantic selection', () => {
  const hook = renderHook(SAMPLE_XML);
  const notes = makeSelectedNotes(SAMPLE_XML);

  act(() => {
    hook.current.handleNoteClick(notes[0]);
  });
  act(() => {
    hook.current.handleNoteClick(notes[2], { range: true });
  });
  act(() => {
    hook.current.transposeSemitones(2);
  });
  hook.rerender();

  const core = importMusicXmlToCore(hook.xml);
  const pitches = core.score.parts[0].staves[0].measures[0].voices[0].events
    .filter((event) => event.kind === 'note')
    .map((event) => `${event.pitch.step}${event.pitch.alter ? '#' : ''}`);

  assert.deepEqual(pitches, ['D', 'E', 'F#']);
  hook.unmount();
});

test('undo after pitch edit restores active note text from semantic score state', () => {
  const hook = renderEditorHistoryHook(C_SHARP_XML);
  const notes = makeSelectedNotes(C_SHARP_XML);

  act(() => {
    hook.current.handleNoteClick(notes[0]);
  });
  assert.equal(hook.current.selectedNote?.step, 'C');
  assert.equal(hook.current.selectedNote?.alter, 1);
  assert.equal(hook.current.selectedNote?.octave, 4);

  act(() => {
    hook.current.changePitch('D', null);
  });
  assert.equal(hook.current.selectedNote?.step, 'D');
  assert.equal(hook.current.selectedNote?.alter, 0);
  assert.equal(hook.current.canUndo, true);

  act(() => {
    hook.current.undo();
  });
  assert.equal(hook.current.selectedNote?.step, 'C');
  assert.equal(hook.current.selectedNote?.alter, 1);
  assert.equal(hook.current.selectedNote?.octave, 4);
  assert.equal(hook.current.canRedo, true);

  let core = importMusicXmlToCore(hook.current.xml);
  let event = core.score.parts[0].staves[0].measures[0].voices[0].events[0];
  assert.equal(event.kind, 'note');
  assert.equal(event.kind === 'note' ? event.pitch.step : null, 'C');
  assert.equal(event.kind === 'note' ? event.pitch.alter : null, 1);

  act(() => {
    hook.current.redo();
  });
  assert.equal(hook.current.selectedNote?.step, 'D');
  assert.equal(hook.current.selectedNote?.alter, 0);

  core = importMusicXmlToCore(hook.current.xml);
  event = core.score.parts[0].staves[0].measures[0].voices[0].events[0];
  assert.equal(event.kind, 'note');
  assert.equal(event.kind === 'note' ? event.pitch.step : null, 'D');
  assert.equal(event.kind === 'note' ? event.pitch.alter : null, 0);
  hook.unmount();
});

test('repitch command changes the clicked chord tone only', () => {
  const hook = renderHook(CHORD_TONE_XML);
  const notes = makeNotesFrom(CHORD_TONE_XML).filter((note) => !note.isRest);
  const lower = notes.find((note) => note.step === 'C');
  const upper = notes.find((note) => note.step === 'E');

  assert.ok(lower);
  assert.ok(upper);

  act(() => {
    hook.current.handleNoteClick(upper!);
  });
  act(() => {
    hook.current.changePitch('G', null);
  });
  hook.rerender();

  const core = importMusicXmlToCore(hook.xml);
  const events = core.score.parts[0].staves[0].measures[0].voices[0].events;
  const chordNotes = events.filter((event) => event.kind === 'note');
  assert.equal(chordNotes[0]?.kind === 'note' ? chordNotes[0].pitch.step : null, 'C');
  assert.equal(chordNotes[1]?.kind === 'note' ? chordNotes[1].pitch.step : null, 'G');
  assert.equal(hook.current.selectedNote?.coreEntityId, upper!.coreEntityId);
  assert.equal(hook.current.selectedNote?.step, 'G');
  hook.unmount();
});

test('drag repitch changes the addressed chord tone without creating a note', () => {
  const hook = renderHook(CHORD_TONE_XML);
  const notes = makeNotesFrom(CHORD_TONE_XML).filter((note) => !note.isRest);
  const lower = notes.find((note) => note.step === 'C');
  const upper = notes.find((note) => note.step === 'E');

  assert.ok(lower);
  assert.ok(upper);

  act(() => {
    hook.current.handleNoteClick(upper!);
  });
  act(() => {
    hook.current.commitDraggedPitch({
      note: upper!,
      step: 'G',
      alter: 0,
      octave: 4,
    });
  });
  hook.rerender();

  const core = importMusicXmlToCore(hook.xml);
  const chordNotes = core.score.parts[0].staves[0].measures[0].voices[0].events
    .filter((event) => event.kind === 'note');
  assert.equal(chordNotes.length, 2);
  const unchanged = chordNotes.find((event) => event.id === lower!.coreEntityId);
  assert.equal(unchanged?.kind === 'note' ? unchanged.pitch.step : null, 'C');
  const dragged = chordNotes.find((event) => event.id === upper!.coreEntityId);
  assert.equal(dragged?.kind === 'note' ? dragged.pitch.step : null, 'G');
  assert.equal(hook.current.selectedNote?.coreEntityId, upper!.coreEntityId);
  assert.equal(hook.current.selectedNote?.step, 'G');
  hook.unmount();
});

test('transposeSemitones changes the clicked chord tone only', () => {
  const hook = renderHook(CHORD_TONE_XML);
  const notes = makeNotesFrom(CHORD_TONE_XML).filter((note) => !note.isRest);
  const lower = notes.find((note) => note.step === 'C');
  const upper = notes.find((note) => note.step === 'E');

  assert.ok(lower);
  assert.ok(upper);

  act(() => {
    hook.current.handleNoteClick(upper!);
  });
  act(() => {
    hook.current.transposeSemitones(1);
  });
  hook.rerender();

  const core = importMusicXmlToCore(hook.xml);
  const chordNotes = core.score.parts[0].staves[0].measures[0].voices[0].events.filter((event) => event.kind === 'note');
  assert.equal(chordNotes[0]?.kind === 'note' ? chordNotes[0].pitch.step : null, 'C');
  assert.equal(chordNotes[0]?.kind === 'note' ? chordNotes[0].pitch.alter : null, 0);
  assert.equal(chordNotes[1]?.kind === 'note' ? chordNotes[1].pitch.step : null, 'F');
  assert.equal(chordNotes[1]?.kind === 'note' ? chordNotes[1].pitch.alter : null, 0);
  assert.equal(hook.current.selectedNote?.coreEntityId, upper!.coreEntityId);
  hook.unmount();
});

test('stale graphical voice cannot override semantic voice during repitch', () => {
  const hook = renderHook(MULTI_VOICE_SAME_TIMESTAMP_XML);
  const notes = makeNotesFrom(MULTI_VOICE_SAME_TIMESTAMP_XML).filter((note) => !note.isRest);
  const voiceOne = notes.find((note) => note.voiceId === 1);
  const voiceTwo = notes.find((note) => note.voiceId === 2);

  assert.ok(voiceOne);
  assert.ok(voiceTwo);

  act(() => {
    hook.current.handleNoteClick({
      ...voiceTwo!,
      voiceId: 1,
    });
  });
  act(() => {
    hook.current.changePitch('A', null);
  });
  hook.rerender();

  const core = importMusicXmlToCore(hook.xml);
  const firstVoiceEvent = core.score.parts[0].staves[0].measures[0].voices.find((voice) => voice.voiceId === 1)?.events[0];
  const secondVoiceEvent = core.score.parts[0].staves[0].measures[0].voices.find((voice) => voice.voiceId === 2)?.events[0];
  assert.equal(firstVoiceEvent?.kind === 'note' ? firstVoiceEvent.pitch.step : null, 'C');
  assert.equal(secondVoiceEvent?.kind === 'note' ? secondVoiceEvent.pitch.step : null, 'A');
  assert.equal(hook.current.selectedNote?.voiceId, 2);
  assert.equal(hook.current.selectedNote?.step, 'A');
  hook.unmount();
});

test('TAB fret edit preserves the clicked string and does not edit another chord tone', () => {
  const hook = renderHook(TAB_CHORD_XML);
  const notes = makeNotesFrom(TAB_CHORD_XML).filter((note) => !note.isRest);
  const fifthString = notes.find((note) => note.guitar?.string === 5);

  assert.ok(fifthString);

  act(() => {
    hook.current.handleNoteClick(fifthString!);
  });
  act(() => {
    hook.current.setGuitarFretAtNote(fifthString!, 3);
  });
  hook.rerender();

  const core = importMusicXmlToCore(hook.xml);
  const events = core.score.parts[0].staves[0].measures[0].voices[0].events.filter((event) => event.kind === 'note');
  const tabByString = new Map(events.map((event) => [
    event.kind === 'note' ? event.guitar?.string : null,
    event.kind === 'note' ? event.guitar?.fret : null,
  ]));
  assert.deepEqual([...tabByString.keys()].sort(), [5, 6]);
  assert.equal(tabByString.get(6), 3);
  assert.equal(tabByString.get(5), 3);
  assert.equal(hook.current.selectedNote?.coreEntityId, fifthString!.coreEntityId);
  assert.equal(hook.current.selectedNote?.guitar?.string, 5);
  assert.equal(hook.current.selectedNote?.guitar?.fret, 3);
  hook.unmount();
});

test('click fallback keeps parallel identical parts separate during pitch edits', () => {
  const hook = renderHook(PARALLEL_IDENTICAL_PARTS_XML);
  const notes = makeNotesFrom(PARALLEL_IDENTICAL_PARTS_XML).filter((note) => !note.isRest);
  const secondPartNote = notes[1];

  assert.ok(secondPartNote);

  act(() => {
    hook.current.handleNoteClick({
      ...secondPartNote!,
      coreEntityId: null,
      coreVoiceId: null,
      graphicalNote: null,
    });
  });
  act(() => {
    hook.current.changePitch('D', null);
  });
  hook.rerender();

  const core = importMusicXmlToCore(hook.xml);
  const pitchesByPart = core.score.parts.map((part) => {
    const event = part.staves[0].measures[0].voices[0].events[0];
    return event.kind === 'note' ? `${event.pitch.step}${event.pitch.octave}` : 'rest';
  });

  assert.deepEqual(pitchesByPart, ['C4', 'D4']);
  assert.equal(hook.current.selectedNote?.corePartId, secondPartNote!.corePartId);
  assert.equal(hook.current.selectedNote?.step, 'D');
  hook.unmount();
});

test('useNoteEditor pasteContent pastes copied range and selects the pasted material', () => {
  const hook = renderHook(SAMPLE_XML);
  const notes = makeSelectedNotes(SAMPLE_XML);

  act(() => {
    hook.current.handleNoteClick(notes[0]);
  });
  act(() => {
    hook.current.handleNoteClick(notes[1], { range: true });
  });
  act(() => {
    hook.current.copySelectedRange();
  });
  act(() => {
    hook.current.clearSelection();
    hook.current.handleNoteClick(notes[2]);
  });
  act(() => {
    hook.current.pasteContent();
  });
  hook.rerender();

  const core = importMusicXmlToCore(hook.xml);
  const voiceEvents = core.score.parts[0].staves[0].measures[0].voices[0].events;
  const timestamps = voiceEvents.map((event) => event.timestampNum);
  const insertedPitches = voiceEvents
    .filter((event) => event.kind === 'note')
    .map((event) => `${event.pitch.step}${event.pitch.alter ? '#' : ''}`);

  assert.deepEqual(timestamps, [0, 1, 2, 3]);
  assert.deepEqual(insertedPitches, ['C', 'D', 'C', 'D']);
  assert.equal(hook.current.selectedNotes.length, 2);
  hook.unmount();
});

test('useNoteEditor overwrite mode rewrites the selected slot instead of inserting a new event', () => {
  const hook = renderHook(SAMPLE_XML);
  const notes = makeSelectedNotes(SAMPLE_XML);

  act(() => {
    hook.current.handleNoteClick(notes[1]);
  });
  act(() => {
    hook.current.toggleEntryMode();
  });
  act(() => {
    hook.current.insertNote('F', 4);
  });
  hook.rerender();

  const core = importMusicXmlToCore(hook.xml);
  const voiceEvents = core.score.parts[0].staves[0].measures[0].voices[0].events;
  const noteEvents = voiceEvents.filter((event) => event.kind === 'note');
  const pitches = noteEvents
    .filter((event) => event.kind === 'note')
    .map((event) => `${event.pitch.step}${event.pitch.alter ? '#' : ''}`);

  assert.equal(noteEvents.length, 3);
  assert.deepEqual(pitches, ['C', 'F', 'E']);
  hook.unmount();
});

test('useNoteEditor rippleDelete keeps selection on the remapped successor after the timeline pulls left', () => {
  const hook = renderHook(`<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
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
  const notes = makeSelectedNotes(hook.xml).filter((note) => !note.isRest);

  act(() => {
    hook.current.handleNoteClick(notes[3]);
  });
  act(() => {
    hook.current.rippleDelete();
  });
  hook.rerender();

  assert.equal(hook.current.selectedNote?.step, 'G');
  assert.equal(hook.current.selectedNote?.measureNumber, 1);
  assert.equal(hook.current.selectedNote?.timestampNum, 3);
  hook.unmount();
});

test('useNoteEditor navigates semantically with arrow-style next and previous note movement', () => {
  const hook = renderHook(SAMPLE_XML);
  const notes = makeSelectedNotes(SAMPLE_XML);

  act(() => {
    hook.current.handleNoteClick(notes[0]);
  });
  act(() => {
    hook.current.navigateNote('next');
  });

  assert.equal(hook.current.selectedNote?.step, 'D');

  act(() => {
    hook.current.navigateNote('next');
  });

  assert.equal(hook.current.selectedNote?.step, 'E');

  act(() => {
    hook.current.navigateNote('prev');
  });

  assert.equal(hook.current.selectedNote?.step, 'D');
  hook.unmount();
});

test('navigateNote dispatches semantic-selection-navigation event', () => {
  const hook = renderHook(SAMPLE_XML);
  const notes = makeSelectedNotes(SAMPLE_XML);
  let eventCount = 0;
  const handler = () => { eventCount++; };
  window.addEventListener('nex-note:semantic-selection-navigation', handler);

  act(() => { hook.current.handleNoteClick(notes[0]); });
  act(() => { hook.current.navigateNote('next'); });

  window.removeEventListener('nex-note:semantic-selection-navigation', handler);
  assert.equal(eventCount, 1);
  hook.unmount();
});

test('extendSelection does not dispatch semantic-selection-navigation event', () => {
  const hook = renderHook(SAMPLE_XML);
  const notes = makeSelectedNotes(SAMPLE_XML);
  let eventCount = 0;
  const handler = () => { eventCount++; };
  window.addEventListener('nex-note:semantic-selection-navigation', handler);

  act(() => { hook.current.handleNoteClick(notes[0]); });
  act(() => { hook.current.extendSelection('next'); });
  act(() => { hook.current.extendSelection('next'); });

  window.removeEventListener('nex-note:semantic-selection-navigation', handler);
  assert.equal(eventCount, 0);
  assert.equal(hook.current.selectedNotes.length, 3);
  hook.unmount();
});

test('useNoteEditor restores semantic selection from a selection anchor', () => {
  const hook = renderHook(SAMPLE_XML);
  const notes = makeSelectedNotes(SAMPLE_XML);

  act(() => {
    hook.current.handleNoteClick(notes[0]);
  });
  act(() => {
    hook.current.handleNoteClick(notes[2], { range: true });
  });

  const anchor = {
    entityIds: hook.current.selection.entityIds,
    anchorEntityId: hook.current.selection.anchorEntityId,
    anchorLocator: hook.current.selection.anchor ? {
      measureNumber: hook.current.selection.anchor.measureNumber,
      staffIndex: hook.current.selection.anchor.staffIndex,
      voiceId: hook.current.selection.anchor.voiceId,
      timestampNum: hook.current.selection.anchor.timestampNum,
      timestampDen: hook.current.selection.anchor.timestampDen,
    } : null,
    selectionLocators: hook.current.selectedNotes.map((note) => ({
      measureNumber: note.measureNumber,
      staffIndex: note.staffIndex,
      voiceId: note.voiceId,
      timestampNum: note.timestampNum,
      timestampDen: note.timestampDen,
    })),
  };

  act(() => {
    hook.current.clearSelection();
  });

  act(() => {
    hook.current.restoreSelection(anchor);
  });

  assert.equal(hook.current.selectedNotes.length, 3);
  assert.equal(hook.current.selection.anchorEntityId, anchor.anchorEntityId);
  hook.unmount();
});

test('useNoteEditor restores multi-note selection from locators after semantic edits change entity ids', () => {
  const hook = renderHook(SAMPLE_XML);
  const notes = makeSelectedNotes(SAMPLE_XML);

  act(() => {
    hook.current.handleNoteClick(notes[0]);
  });
  act(() => {
    hook.current.handleNoteClick(notes[1], { range: true });
  });

  const anchor = {
    entityIds: hook.current.selection.entityIds,
    anchorEntityId: hook.current.selection.anchorEntityId,
    anchorLocator: hook.current.selection.anchor ? {
      measureNumber: hook.current.selection.anchor.measureNumber,
      staffIndex: hook.current.selection.anchor.staffIndex,
      voiceId: hook.current.selection.anchor.voiceId,
      timestampNum: hook.current.selection.anchor.timestampNum,
      timestampDen: hook.current.selection.anchor.timestampDen,
    } : null,
    selectionLocators: hook.current.selectedNotes.map((note) => ({
      measureNumber: note.measureNumber,
      staffIndex: note.staffIndex,
      voiceId: note.voiceId,
      timestampNum: note.timestampNum,
      timestampDen: note.timestampDen,
    })),
  };

  act(() => {
    hook.current.transposeSemitones(2);
  });
  hook.rerender();

  act(() => {
    hook.current.clearSelection();
  });

  act(() => {
    hook.current.restoreSelection(anchor);
  });

  assert.equal(hook.current.selectedNotes.length, 2);
  assert.equal(hook.current.selectedNote?.measureNumber, 1);
  assert.ok([0, 1].includes(hook.current.selectedNote?.timestampNum ?? -1));
  hook.unmount();
});

test('useNoteEditor restores selection from equivalent timestamp fractions after inspector-style transpose', () => {
  const hook = renderHook(CHOIR_XML);
  const notes = makeSelectedNotes(CHOIR_XML);
  const reducedSelection = notes.slice(0, 2).map((note, index) => ({
    ...note,
    coreEntityId: null,
    coreVoiceId: null,
    coreMeasureId: null,
    corePartId: null,
    timestampNum: index === 0 ? 0 : 1,
    timestampDen: index === 0 ? 1 : 4,
  }));

  act(() => {
    hook.current.handleNoteClick(reducedSelection[0]);
  });
  act(() => {
    hook.current.handleNoteClick(reducedSelection[1], { range: true });
  });

  assert.equal(hook.current.selection.entityIds.length, 2);

  const anchor = {
    entityIds: hook.current.selection.entityIds,
    anchorEntityId: hook.current.selection.anchorEntityId,
    anchorLocator: hook.current.selection.anchor ? {
      measureNumber: hook.current.selection.anchor.measureNumber,
      staffIndex: hook.current.selection.anchor.staffIndex,
      voiceId: hook.current.selection.anchor.voiceId,
      timestampNum: hook.current.selection.anchor.timestampNum,
      timestampDen: hook.current.selection.anchor.timestampDen,
    } : null,
    selectionLocators: hook.current.selectedNotes.map((note) => ({
      measureNumber: note.measureNumber,
      staffIndex: note.staffIndex,
      voiceId: note.voiceId,
      timestampNum: note.timestampNum,
      timestampDen: note.timestampDen,
    })),
  };

  act(() => {
    hook.current.transposeSemitones(2);
  });
  hook.rerender();

  act(() => {
    hook.current.clearSelection();
  });

  act(() => {
    hook.current.restoreSelection(anchor);
  });

  assert.equal(hook.current.selectedNotes.length, 2);
  assert.equal(hook.current.selection.entityIds.length, 2);
  hook.unmount();
});

test('useNoteEditor restores a locator-only selection to the correct part when parallel parts share the same slot', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Upper</part-name></score-part>
    <score-part id="P2"><part-name>Lower</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
    </measure>
  </part>
  <part id="P2">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <note><pitch><step>C</step><octave>3</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`;
  const hook = renderHook(xml);
  const notes = makeNotesFrom(xml);
  const lowerPartNote = notes.find((note) => note.octave === 3);

  assert.ok(lowerPartNote);

  act(() => {
    hook.current.handleNoteClick(lowerPartNote!);
  });

  const anchor = {
    entityIds: [],
    anchorEntityId: null,
    anchorLocator: hook.current.selection.anchor ? {
      coreMeasureId: hook.current.selection.anchor.coreMeasureId ?? null,
      corePartId: hook.current.selection.anchor.corePartId ?? null,
      measureNumber: hook.current.selection.anchor.measureNumber,
      staffIndex: hook.current.selection.anchor.staffIndex,
      voiceId: hook.current.selection.anchor.voiceId,
      timestampNum: hook.current.selection.anchor.timestampNum,
      timestampDen: hook.current.selection.anchor.timestampDen,
    } : null,
    selectionLocators: hook.current.selectedNotes.map((note) => ({
      coreMeasureId: note.coreMeasureId ?? null,
      corePartId: note.corePartId ?? null,
      measureNumber: note.measureNumber,
      staffIndex: note.staffIndex,
      voiceId: note.voiceId,
      timestampNum: note.timestampNum,
      timestampDen: note.timestampDen,
    })),
  };

  act(() => {
    hook.current.clearSelection();
  });

  act(() => {
    hook.current.restoreSelection(anchor);
  });

  assert.equal(hook.current.selectedNotes.length, 1);
  assert.equal(hook.current.selectedNote?.corePartId, lowerPartNote!.corePartId);
  assert.equal(hook.current.selectedNote?.octave, 3);
  hook.unmount();
});

// ---------------------------------------------------------------------------
// Phase 4 — keyboard-first range selection, measure navigation, select-all
// ---------------------------------------------------------------------------

const TWO_MEASURE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
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
    </measure>
    <measure number="2">
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`;

function makeNotesFrom(xml: string): SelectedNote[] {
  const core = importMusicXmlToCore(xml);
  return core.score.parts.flatMap((part) =>
    part.staves.flatMap((staff) =>
      staff.measures.flatMap((measure) =>
        measure.voices.flatMap((voice) =>
          [...voice.events]
            .sort((a, b) => a.measureNumber - b.measureNumber || a.timestampNum - b.timestampNum)
            .map((event) => ({
              coreEntityId: event.id,
              coreVoiceId: voice.id,
              coreMeasureId: measure.id,
              corePartId: part.id,
              measureNumber: event.measureNumber,
              staffIndex: event.staffIndex,
              voiceId: event.voiceId,
              timestampNum: event.timestampNum,
              timestampDen: event.timestampDen,
              step: event.kind === 'note' ? event.pitch.step : 'C',
              octave: event.kind === 'note' ? event.pitch.octave : 4,
              alter: event.kind === 'note' ? event.pitch.alter : 0,
              isRest: event.kind === 'rest',
              durationType: event.durationType,
              isDotted: event.isDotted,
              guitar: event.kind === 'note' ? event.guitar : undefined,
              graphicalNote: null,
            })),
        ),
      ),
    ),
  );
}

test('useNoteEditor trusts semantic voice identity over stale graphical voice data', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
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
      <backup><duration>1</duration></backup>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>2</voice><type>quarter</type><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`;
  const hook = renderHook(xml);
  const notes = makeNotesFrom(xml);
  const voiceTwo = notes.find((note) => note.voiceId === 2);

  assert.ok(voiceTwo);

  act(() => {
    hook.current.handleNoteClick({
      ...voiceTwo!,
      voiceId: 1,
    });
  });

  assert.equal(hook.current.selectedNote?.coreEntityId, voiceTwo!.coreEntityId);
  assert.equal(hook.current.selectedNote?.voiceId, 2);
  assert.equal(hook.current.selection.voiceId, 2);
  hook.unmount();
});

test('extendSelection extends a single-note selection by one note forward', () => {
  const hook = renderHook(TWO_MEASURE_XML);
  const notes = makeNotesFrom(TWO_MEASURE_XML); // [C, D, E, F]

  act(() => { hook.current.handleNoteClick(notes[0]); }); // select C
  act(() => { hook.current.extendSelection('next'); });   // extend to D

  assert.equal(hook.current.selectedNotes.length, 2);
  const steps = hook.current.selectedNotes.map((n) => n.step).sort();
  assert.deepEqual(steps, ['C', 'D']);
  hook.unmount();
});

test('extendSelection grows the range by one on each call', () => {
  const hook = renderHook(TWO_MEASURE_XML);
  const notes = makeNotesFrom(TWO_MEASURE_XML);

  act(() => { hook.current.handleNoteClick(notes[0]); }); // C
  act(() => { hook.current.extendSelection('next'); });   // C+D
  act(() => { hook.current.extendSelection('next'); });   // C+D+E

  assert.equal(hook.current.selectedNotes.length, 3);
  const steps = hook.current.selectedNotes.map((n) => n.step).sort();
  assert.deepEqual(steps, ['C', 'D', 'E']);
  hook.unmount();
});

test('extendSelection shrinks the range when moving focus back past the anchor', () => {
  const hook = renderHook(TWO_MEASURE_XML);
  const notes = makeNotesFrom(TWO_MEASURE_XML);

  act(() => { hook.current.handleNoteClick(notes[0]); }); // C — anchor
  act(() => { hook.current.extendSelection('next'); });   // C+D
  act(() => { hook.current.extendSelection('next'); });   // C+D+E
  act(() => { hook.current.extendSelection('prev'); });   // shrink back to C+D

  assert.equal(hook.current.selectedNotes.length, 2);
  const steps = hook.current.selectedNotes.map((n) => n.step).sort();
  assert.deepEqual(steps, ['C', 'D']);
  hook.unmount();
});

test('extendSelection anchor stays fixed while focus moves', () => {
  const hook = renderHook(TWO_MEASURE_XML);
  const notes = makeNotesFrom(TWO_MEASURE_XML);

  act(() => { hook.current.handleNoteClick(notes[1]); }); // D — anchor
  act(() => { hook.current.extendSelection('next'); });   // D+E
  act(() => { hook.current.extendSelection('next'); });   // D+E+F

  // anchor entity should still be D
  assert.equal(hook.current.selection.anchorEntityId, notes[1].coreEntityId);
  assert.equal(hook.current.selectedNotes.length, 3);
  hook.unmount();
});

test('navigateToMeasureBoundary jumps to the first note of the next measure', () => {
  const hook = renderHook(TWO_MEASURE_XML);
  const notes = makeNotesFrom(TWO_MEASURE_XML); // [C(m1), D(m1), E(m2), F(m2)]

  act(() => { hook.current.handleNoteClick(notes[0]); }); // C, measure 1
  act(() => { hook.current.navigateToMeasureBoundary('next'); });

  assert.equal(hook.current.selectedNote?.step, 'E');
  assert.equal(hook.current.selectedNote?.measureNumber, 2);
  hook.unmount();
});

test('navigateToMeasureBoundary jumps to the first note of current measure when not already there', () => {
  const hook = renderHook(TWO_MEASURE_XML);
  const notes = makeNotesFrom(TWO_MEASURE_XML);

  act(() => { hook.current.handleNoteClick(notes[1]); }); // D, 2nd note of measure 1
  act(() => { hook.current.navigateToMeasureBoundary('prev'); });

  assert.equal(hook.current.selectedNote?.step, 'C');
  assert.equal(hook.current.selectedNote?.measureNumber, 1);
  hook.unmount();
});

test('navigateToMeasureBoundary jumps to previous measure when already at measure start', () => {
  const hook = renderHook(TWO_MEASURE_XML);
  const notes = makeNotesFrom(TWO_MEASURE_XML);

  act(() => { hook.current.handleNoteClick(notes[2]); }); // E, first note of measure 2
  act(() => { hook.current.navigateToMeasureBoundary('prev'); });

  assert.equal(hook.current.selectedNote?.step, 'C');
  assert.equal(hook.current.selectedNote?.measureNumber, 1);
  hook.unmount();
});

test('navigateToMeasureBoundary does nothing when there is no next measure', () => {
  const hook = renderHook(TWO_MEASURE_XML);
  const notes = makeNotesFrom(TWO_MEASURE_XML);

  act(() => { hook.current.handleNoteClick(notes[3]); }); // F, last note of measure 2
  act(() => { hook.current.navigateToMeasureBoundary('next'); });

  // Should remain on F
  assert.equal(hook.current.selectedNote?.step, 'F');
  hook.unmount();
});

test('selectAllInVoice selects every note in the current staff and voice', () => {
  const hook = renderHook(TWO_MEASURE_XML);
  const notes = makeNotesFrom(TWO_MEASURE_XML);

  act(() => { hook.current.handleNoteClick(notes[0]); }); // start on C
  act(() => { hook.current.selectAllInVoice(); });

  assert.equal(hook.current.selectedNotes.length, 4);
  const steps = hook.current.selectedNotes.map((n) => n.step).sort();
  assert.deepEqual(steps, ['C', 'D', 'E', 'F']);
  hook.unmount();
});

test('selectAllInVoice sets anchor at the first note', () => {
  const hook = renderHook(TWO_MEASURE_XML);
  const notes = makeNotesFrom(TWO_MEASURE_XML);

  act(() => { hook.current.handleNoteClick(notes[2]); }); // start on E (measure 2)
  act(() => { hook.current.selectAllInVoice(); });

  // After select-all the anchor should be at the first note (C)
  assert.equal(hook.current.selection.anchorEntityId, notes[0].coreEntityId);
  hook.unmount();
});

test('selectAllInVoice composed with transposeSemitones transposes the full voice', () => {
  const hook = renderHook(TWO_MEASURE_XML);
  const notes = makeNotesFrom(TWO_MEASURE_XML);

  act(() => { hook.current.handleNoteClick(notes[0]); });
  act(() => { hook.current.selectAllInVoice(); });
  act(() => { hook.current.transposeSemitones(2); });
  hook.rerender();

  const core = importMusicXmlToCore(hook.xml);
  const allPitches = core.score.parts[0].staves[0].measures
    .flatMap((m) => m.voices[0].events)
    .filter((ev) => ev.kind === 'note')
    .map((ev) => `${ev.pitch.step}${ev.pitch.alter ? '#' : ''}`);

  // C→D, D→E, E→F#, F→G
  assert.deepEqual(allPitches, ['D', 'E', 'F#', 'G']);
  hook.unmount();
});

test('focused note updates toolbar duration, dot, and voice state', () => {
  const hook = renderHook(SAMPLE_XML);
  const note = {
    ...makeSelectedNotes(SAMPLE_XML)[1],
    coreEntityId: null,
    coreVoiceId: null,
    coreMeasureId: null,
    corePartId: null,
    voiceId: 2,
    durationType: 'eighth',
    isDotted: true,
  } satisfies SelectedNote;

  act(() => {
    hook.current.handleNoteClick(note);
  });

  assert.equal(hook.current.selectedDuration, '8');
  assert.equal(hook.current.isDotted, true);
  assert.equal(hook.current.selectedVoice, 2);
  hook.unmount();
});

test('focused note resolves toolbar duration from coreDocument even when click payload omits it', () => {
  const hook = renderHook(`<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><dot/><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`);
  const note = makeSelectedNotes(`<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><dot/><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`)[0];

  act(() => {
    hook.current.handleNoteClick({
      ...note,
      durationType: undefined,
      isDotted: undefined,
    });
  });

  assert.equal(hook.current.selectedDuration, '8');
  assert.equal(hook.current.isDotted, true);
  hook.unmount();
});
