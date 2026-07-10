import test from 'node:test';
import assert from 'node:assert/strict';

import { applyCoreCommands } from '../src/score-core/commands/core-command-executor.ts';
import { applyDocumentCommands } from '../src/score-core/commands/apply-document-commands.ts';
import { exportCoreToMusicXml } from '../src/musicxml-adapter/export/export-core-to-musicxml.ts';
import { importMusicXmlToCore } from '../src/musicxml-adapter/import/import-musicxml.ts';
import type { ScoreDocumentModel } from '../src/score-core/model/types.ts';
import { buildClipboardPayloadFromSelection } from '../src/score-core/query/clipboard.ts';
import { createDefaultNewScoreDraft, createNewScoreXml } from '../lib/new-score.ts';

function buildMeasure(
  id: string,
  measureNumber: number,
  staffIndex: number,
  time: { beats: number; beatType: number },
): ScoreDocumentModel['score']['parts'][number]['staves'][number]['measures'][number] {
  return {
    id,
    measureNumber,
    attributes: [{
      id: `attr:${id}`,
      divisions: 1,
      time,
      clefs: [],
    }],
    voices: [],
    directions: [],
  };
}

function buildNoteEvent(input: {
  id: string;
  measureNumber: number;
  staffIndex: number;
  voiceId: number;
  timestampNum: number;
  timestampDen?: number;
  durationDivisions: number;
  durationType: string;
  isDotted?: boolean;
  step: string;
  octave: number;
  tieStart?: boolean;
  stem?: 'none' | 'up' | 'down';
}) {
  return {
    id: input.id,
    kind: 'note' as const,
    measureNumber: input.measureNumber,
    staffIndex: input.staffIndex,
    voiceId: input.voiceId,
    timestampNum: input.timestampNum,
    timestampDen: input.timestampDen ?? 4,
    durationDivisions: input.durationDivisions,
    durationType: input.durationType,
    isDotted: Boolean(input.isDotted),
    isChord: false,
    articulations: [],
    tieStart: Boolean(input.tieStart),
    stem: input.stem,
    lyrics: [],
    pitch: {
      step: input.step,
      alter: 0,
      octave: input.octave,
    },
  };
}

function buildRestEvent(input: {
  id: string;
  measureNumber: number;
  staffIndex: number;
  voiceId: number;
  timestampNum: number;
  timestampDen?: number;
  durationDivisions: number;
  durationType: string;
  isDotted?: boolean;
}) {
  return {
    id: input.id,
    kind: 'rest' as const,
    measureNumber: input.measureNumber,
    staffIndex: input.staffIndex,
    voiceId: input.voiceId,
    timestampNum: input.timestampNum,
    timestampDen: input.timestampDen ?? 4,
    durationDivisions: input.durationDivisions,
    durationType: input.durationType,
    isDotted: Boolean(input.isDotted),
    isChord: false,
    articulations: [],
    tieStart: false,
    lyrics: [],
  };
}

const STEM_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><rest/><duration>2</duration><voice>1</voice><type>half</type><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`;

function buildDocumentFromStaves(input: {
  partId?: string;
  partName?: string;
  staves: Array<{
    staffIndex: number;
    measures: ScoreDocumentModel['score']['parts'][number]['staves'][number]['measures'];
  }>;
}): ScoreDocumentModel {
  return {
    score: {
      id: `score:${input.partId ?? 'p1'}`,
      parts: [{
        id: input.partId ?? 'p1',
        sourcePartId: (input.partId ?? 'p1').toUpperCase(),
        name: input.partName ?? 'Part',
        staves: input.staves.map((staff) => ({
          id: `staff:${staff.staffIndex}`,
          staffIndex: staff.staffIndex,
          measures: staff.measures,
        })),
      }],
    },
    metadata: {},
    index: { measureIds: {}, voiceIds: {}, eventIds: {} },
    slurs: [],
    beams: [],
    tuplets: [],
    chordGroups: [],
    graceNotes: [],
    lyricLines: [],
    layoutHints: [],
    tremolos: [],
    glissandos: [],
    arpeggios: [],
    fermataEventIds: new Set(),
    revision: 1,
  };
}

function firstVoicePitch(voice: ScoreDocumentModel['score']['parts'][number]['staves'][number]['measures'][number]['voices'][number]) {
  const note = voice.events.find((event) => event.kind === 'note' && !event.isChord);
  return note?.kind === 'note' ? `${note.pitch.step}${note.pitch.octave}` : 'rest';
}

function buildEmptyMeasureDocument(): ScoreDocumentModel {
  return {
    score: {
      id: 'score-1',
      parts: [{
        id: 'p1',
        sourcePartId: 'P1',
        name: 'Piano',
        staves: [{
          id: 'st1',
          staffIndex: 1,
          measures: [{
            id: 'm1',
            measureNumber: 1,
            attributes: [{
              id: 'a1',
              divisions: 1,
              time: { beats: 4, beatType: 4 },
              clefs: [],
            }],
            voices: [],
            directions: [],
          }],
        }],
      }],
    },
    metadata: {},
    index: { measureIds: {}, voiceIds: {}, eventIds: {} },
    slurs: [],
    beams: [],
    tuplets: [],
    chordGroups: [],
    graceNotes: [],
    lyricLines: [],
    layoutHints: [],
    tremolos: [],
    glissandos: [],
    arpeggios: [],
    fermataEventIds: new Set(),
    revision: 1,
  };
}

function buildWholeRestMeasureDocument(): ScoreDocumentModel {
  const document = buildEmptyMeasureDocument();
  document.score.parts[0]!.staves[0]!.measures[0]!.voices = [{
    id: 'v1',
    voiceId: 1,
    events: [{
      id: 'rest-1',
      kind: 'rest',
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 0,
      timestampDen: 4,
      durationDivisions: 4,
      durationType: 'whole',
      isDotted: false,
      isChord: false,
      articulations: [],
      tieStart: false,
      lyrics: [],
    }],
  }];
  return document;
}

test('insertNoteAt fills both leading and trailing gaps in an empty 4/4 measure', () => {
  const next = applyCoreCommands(buildEmptyMeasureDocument(), [{
    type: 'insertNoteAt',
    schemaVersion: 1,
    category: 'content',
    target: { scope: 'document' },
    payload: {},
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 1,
    timestampDen: 4,
    step: 'C',
    octave: 4,
    alter: 0,
    durationType: 'quarter',
    isDotted: false,
  }]);

  const voice = next.score.parts[0]?.staves[0]?.measures[0]?.voices.find((entry) => entry.voiceId === 1);
  assert.ok(voice);
  assert.deepEqual(
    voice.events.map((event) => ({
      kind: event.kind,
      start: `${event.timestampNum}/${event.timestampDen}`,
      durationDivisions: event.durationDivisions,
      durationType: event.durationType,
      pitch: event.kind === 'note' ? `${event.pitch.step}${event.pitch.octave}` : 'rest',
    })),
    [
      {
        kind: 'rest',
        start: '0/4',
        durationDivisions: 1,
        durationType: 'quarter',
        pitch: 'rest',
      },
      {
        kind: 'note',
        start: '1/4',
        durationDivisions: 1,
        durationType: 'quarter',
        pitch: 'C4',
      },
      {
        kind: 'rest',
        start: '2/4',
        durationDivisions: 2,
        durationType: 'half',
        pitch: 'rest',
      },
    ],
  );
  assert.equal(
    voice.events.reduce((sum, event) => sum + event.durationDivisions, 0),
    4,
  );
});

test('leadsheet commands insert slash noteheads and timed harmony symbols', () => {
  const next = applyCoreCommands(buildEmptyMeasureDocument(), [
    {
      type: 'insertNoteAt',
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 0,
      timestampDen: 4,
      step: 'C',
      octave: 4,
      alter: 0,
      durationType: 'quarter',
      isDotted: false,
      notehead: 'slash',
      stem: 'none',
    } as any,
    {
      type: 'setHarmonyAt',
      value: 'Cmaj7',
      measureNumber: 1,
      staffIndex: 1,
      timestampNum: 0,
      timestampDen: 4,
    } as any,
  ]);

  const measure = next.score.parts[0]?.staves[0]?.measures[0];
  const event = measure?.voices.find((entry) => entry.voiceId === 1)?.events[0];
  assert.equal(event?.kind, 'note');
  assert.equal(event?.notehead, 'slash');
  assert.equal(event?.stem, 'none');
  assert.deepEqual(measure?.directions.map((direction) => ({
    kind: direction.kind,
    value: direction.value,
    timestamp: `${direction.timestampNum}/${direction.timestampDen}`,
  })), [{ kind: 'harmony', value: 'Cmaj7', timestamp: '0/4' }]);
});

test('setHarmonyAt stores lower-staff chord symbols on the visible host staff', () => {
  const upperMeasure = buildMeasure('guitar:m1:st1', 1, 1, { beats: 4, beatType: 4 });
  upperMeasure.voices.push({
    id: 'guitar:v1',
    voiceId: 1,
    events: [buildNoteEvent({
      id: 'guitar:upper',
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 0,
      durationDivisions: 1,
      durationType: 'quarter',
      step: 'F',
      octave: 4,
    })],
  });
  const tabMeasure = buildMeasure('guitar:m1:st2', 1, 2, { beats: 4, beatType: 4 });
  tabMeasure.voices.push({
    id: 'guitar:v2',
    voiceId: 1,
    events: [buildNoteEvent({
      id: 'guitar:tab',
      measureNumber: 1,
      staffIndex: 2,
      voiceId: 1,
      timestampNum: 0,
      durationDivisions: 1,
      durationType: 'quarter',
      step: 'F',
      octave: 4,
    })],
  });
  const next = applyCoreCommands(buildDocumentFromStaves({
    partId: 'p1',
    partName: 'Guitar',
    staves: [
      { staffIndex: 1, measures: [upperMeasure] },
      { staffIndex: 2, measures: [tabMeasure] },
    ],
  }), [{
    type: 'setHarmonyAt',
    value: 'F#m7b5',
    measureNumber: 1,
    staffIndex: 2,
    timestampNum: 0,
    timestampDen: 4,
  } as any]);

  const upperDirections = next.score.parts[0]?.staves[0]?.measures[0]?.directions ?? [];
  const tabDirections = next.score.parts[0]?.staves[1]?.measures[0]?.directions ?? [];
  assert.deepEqual(upperDirections.map((direction) => ({
    kind: direction.kind,
    value: direction.value,
    staffIndex: direction.staffIndex,
    timestamp: `${direction.timestampNum}/${direction.timestampDen}`,
  })), [{ kind: 'harmony', value: 'F#m7b5', staffIndex: 1, timestamp: '0/4' }]);
  assert.equal(tabDirections.some((direction) => direction.kind === 'harmony'), false);

  const exported = exportCoreToMusicXml(`<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list>
  <part id="P1"><measure number="1"></measure></part>
</score-partwise>`, next);
  assert.equal((exported.match(/<harmony>/g) ?? []).length, 1);
  assert.match(exported, /<root-step>F<\/root-step>\s*<root-alter>1<\/root-alter>/);
  assert.match(exported, /<kind text="m7b5">half-diminished<\/kind>/);
});

test('fillSlashMeasure replaces the target voice with stemless beat slashes', () => {
  const next = applyCoreCommands(buildWholeRestMeasureDocument(), [{
    type: 'fillSlashMeasure',
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    stem: 'none',
  } as any]);

  const events = next.score.parts[0]?.staves[0]?.measures[0]?.voices[0]?.events ?? [];
  assert.equal(events.length, 4);
  assert.deepEqual(events.map((event) => ({
    kind: event.kind,
    start: event.timestampNum,
    durationType: event.durationType,
    notehead: event.notehead,
    stem: event.stem,
  })), [
    { kind: 'note', start: 0, durationType: 'quarter', notehead: 'slash', stem: 'none' },
    { kind: 'note', start: 1, durationType: 'quarter', notehead: 'slash', stem: 'none' },
    { kind: 'note', start: 2, durationType: 'quarter', notehead: 'slash', stem: 'none' },
    { kind: 'note', start: 3, durationType: 'quarter', notehead: 'slash', stem: 'none' },
  ]);
});

test('toggleStemDirection flips selected notes against their default treble stem direction', () => {
  const measure = buildMeasure('stem:m1', 1, 1, { beats: 4, beatType: 4 });
  measure.attributes[0]!.clefs = [{ staffIndex: 1, sign: 'G', line: 2 }];
  measure.voices.push({
    id: 'stem:v1',
    voiceId: 1,
    events: [
      buildNoteEvent({
        id: 'stem:high',
        measureNumber: 1,
        staffIndex: 1,
        voiceId: 1,
        timestampNum: 0,
        durationDivisions: 1,
        durationType: 'quarter',
        step: 'C',
        octave: 5,
      }),
      buildNoteEvent({
        id: 'stem:low',
        measureNumber: 1,
        staffIndex: 1,
        voiceId: 1,
        timestampNum: 1,
        durationDivisions: 1,
        durationType: 'quarter',
        step: 'C',
        octave: 4,
      }),
    ],
  });

  const next = applyCoreCommands(buildDocumentFromStaves({
    partId: 'stem-target',
    staves: [{ staffIndex: 1, measures: [measure] }],
  }), [
    { type: 'toggleStemDirection', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 4 } as never,
    { type: 'toggleStemDirection', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 1, timestampDen: 4 } as never,
  ]);

  const events = next.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events;
  assert.equal(events[0]?.stem, 'up');
  assert.equal(events[1]?.stem, 'down');
});

test('toggleStemDirection persists explicit stems through MusicXML export and import', () => {
  const core = importMusicXmlToCore(STEM_XML);
  const toggled = applyCoreCommands(core, [{
    type: 'toggleStemDirection',
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 0,
    timestampDen: 1,
  } as never]);

  const exported = exportCoreToMusicXml(STEM_XML, toggled);
  assert.match(exported, /<stem>up<\/stem>/);
  const reimported = importMusicXmlToCore(exported);
  const event = reimported.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events[0];
  assert.equal(event?.stem, 'up');
});

test('insertNoteAt replaces a whole-rest measure and preserves trailing padding', () => {
  const next = applyCoreCommands(buildWholeRestMeasureDocument(), [{
    type: 'insertNoteAt',
    schemaVersion: 1,
    category: 'content',
    target: { scope: 'document' },
    payload: {},
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 1,
    timestampDen: 4,
    step: 'C',
    octave: 4,
    alter: 0,
    durationType: 'quarter',
    isDotted: false,
  }]);

  const voice = next.score.parts[0]?.staves[0]?.measures[0]?.voices.find((entry) => entry.voiceId === 1);
  assert.ok(voice);
  assert.deepEqual(
    voice.events.map((event) => ({
      kind: event.kind,
      start: `${event.timestampNum}/${event.timestampDen}`,
      durationDivisions: event.durationDivisions,
      durationType: event.durationType,
      pitch: event.kind === 'note' ? `${event.pitch.step}${event.pitch.octave}` : 'rest',
    })),
    [
      {
        kind: 'rest',
        start: '0/4',
        durationDivisions: 1,
        durationType: 'quarter',
        pitch: 'rest',
      },
      {
        kind: 'note',
        start: '1/4',
        durationDivisions: 1,
        durationType: 'quarter',
        pitch: 'C4',
      },
      {
        kind: 'rest',
        start: '2/4',
        durationDivisions: 2,
        durationType: 'half',
        pitch: 'rest',
      },
    ],
  );
});

test('insertNoteAt commits inside an app-created all-rest piano score without dropping later rests', () => {
  const draft = createDefaultNewScoreDraft();
  draft.instrumentIds = ['piano'];
  const xml = createNewScoreXml(draft);
  const coreDocument = importMusicXmlToCore(xml);
  const part = coreDocument.score.parts[0];
  const firstTrebleMeasure = part?.staves[0]?.measures[0];
  assert.ok(part);
  assert.ok(firstTrebleMeasure);

  const next = applyDocumentCommands({ xml, coreDocument }, [{
    type: 'insertNoteAt',
    coreMeasureId: firstTrebleMeasure.id,
    corePartId: part.id,
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 3,
    timestampDen: 4,
    step: 'C',
    octave: 5,
    alter: 0,
    durationType: 'quarter',
    isDotted: false,
    preserveOverflow: false,
  }]);

  const measureOneEvents = next.coreDocument?.score.parts[0]?.staves[0]?.measures[0]?.voices
    .find((voice) => voice.voiceId === 1)?.events ?? [];
  assert.deepEqual(
    measureOneEvents.map((event) => ({
      kind: event.kind,
      start: `${event.timestampNum}/${event.timestampDen}`,
      durationDivisions: event.durationDivisions,
      pitch: event.kind === 'note' ? `${event.pitch.step}${event.pitch.octave}` : 'rest',
    })),
    [
      { kind: 'rest', start: '0/32', durationDivisions: 24, pitch: 'rest' },
      { kind: 'note', start: '24/32', durationDivisions: 8, pitch: 'C5' },
    ],
  );

  const laterMeasureEvents = next.coreDocument?.score.parts[0]?.staves[0]?.measures[1]?.voices
    .find((voice) => voice.voiceId === 1)?.events ?? [];
  assert.equal(laterMeasureEvents.length, 1);
  assert.equal(laterMeasureEvents[0]?.kind, 'rest');
  assert.match(next.xml, /<step>C<\/step>\s*<octave>5<\/octave>/);
});

test('insertNoteAt splitting a sounding note does not tie across the inserted note', () => {
  const document = buildEmptyMeasureDocument();
  document.score.parts[0]!.staves[0]!.measures[0]!.voices = [{
    id: 'v1',
    voiceId: 1,
    events: [buildNoteEvent({
      id: 'held-c',
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 0,
      durationDivisions: 4,
      durationType: 'whole',
      step: 'C',
      octave: 4,
    })],
  }];

  const next = applyCoreCommands(document, [{
    type: 'insertNoteAt',
    schemaVersion: 1,
    category: 'content',
    target: { scope: 'document' },
    payload: {},
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 1,
    timestampDen: 4,
    step: 'D',
    octave: 4,
    alter: 0,
    durationType: 'quarter',
    isDotted: false,
  }]);

  const measureOneEvents = next.score.parts[0]!.staves[0]!.measures[0]!.voices
    .find((entry) => entry.voiceId === 1)!.events;

  assert.deepEqual(
    measureOneEvents.map((event) => ({
      start: `${event.timestampNum}/${event.timestampDen}`,
      pitch: event.kind === 'note' ? `${event.pitch.step}${event.pitch.octave}` : 'rest',
      durationDivisions: event.durationDivisions,
      tieStart: Boolean(event.tieStart),
    })),
    [
      { start: '0/4', pitch: 'C4', durationDivisions: 1, tieStart: false },
      { start: '1/4', pitch: 'D4', durationDivisions: 1, tieStart: false },
      { start: '2/4', pitch: 'C4', durationDivisions: 2, tieStart: true },
    ],
  );
});

test('insertNoteAt does not shift quarter-rest padding through empty tail measures', () => {
  const quarterRestMeasure = (measureNumber: number) => buildMeasure(`m${measureNumber}`, measureNumber, 1, { beats: 4, beatType: 4 });
  const measure1 = quarterRestMeasure(1);
  measure1.voices.push({
    id: 'v1:m1',
    voiceId: 1,
    events: [
      buildNoteEvent({
        id: 'held-c',
        measureNumber: 1,
        staffIndex: 1,
        voiceId: 1,
        timestampNum: 0,
        durationDivisions: 2,
        durationType: 'half',
        step: 'C',
        octave: 4,
      }),
      buildRestEvent({
        id: 'm1-tail-rest',
        measureNumber: 1,
        staffIndex: 1,
        voiceId: 1,
        timestampNum: 2,
        durationDivisions: 2,
        durationType: 'half',
      }),
    ],
  });
  const emptyTailMeasures = [2, 3].map((measureNumber) => {
    const measure = quarterRestMeasure(measureNumber);
    measure.voices.push({
      id: `v1:m${measureNumber}`,
      voiceId: 1,
      events: [0, 1, 2, 3].map((timestampNum) => buildRestEvent({
        id: `m${measureNumber}:q${timestampNum}`,
        measureNumber,
        staffIndex: 1,
        voiceId: 1,
        timestampNum,
        durationDivisions: 1,
        durationType: 'quarter',
      })),
    });
    return measure;
  });
  const document = buildDocumentFromStaves({
    staves: [{
      staffIndex: 1,
      measures: [measure1, ...emptyTailMeasures],
    }],
  });

  const next = applyCoreCommands(document, [{
    type: 'insertNoteAt',
    schemaVersion: 1,
    category: 'content',
    target: { scope: 'document' },
    payload: {},
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 1,
    timestampDen: 4,
    step: 'D',
    octave: 4,
    alter: 0,
    durationType: 'quarter',
    isDotted: false,
  }]);

  const staff = next.score.parts[0]!.staves[0]!;
  assert.equal(staff.measures.length, 3);
  assert.deepEqual(
    staff.measures[0]!.voices[0]!.events.map((event) => (
      `${event.timestampNum}/${event.timestampDen}:${event.kind === 'note' ? `${event.pitch.step}${event.pitch.octave}` : 'rest'}:${event.durationType}`
    )),
    ['0/4:C4:quarter', '1/4:D4:quarter', '2/4:C4:quarter', '3/4:rest:quarter'],
  );
  for (const measure of staff.measures.slice(1)) {
    const events = measure.voices.find((voice) => voice.voiceId === 1)?.events ?? [];
    assert.deepEqual(
      events.map((event) => (
        `${event.timestampNum}/${event.timestampDen}:${event.kind}:${event.durationType}:${event.durationDivisions}`
      )),
      [`0/4:rest:whole:4`],
    );
  }
});

test('pasteContent collapses staves into one staff without collapsing voices', () => {
  const upperMeasure = buildMeasure('src:m1:st1', 1, 1, { beats: 4, beatType: 4 });
  const upperNote: ReturnType<typeof buildNoteEvent> & { writtenAccidental?: 'sharp' } = buildNoteEvent({
    id: 'src:upper',
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 0,
    durationDivisions: 1,
    durationType: 'quarter',
    step: 'C',
    octave: 5,
  });
  upperNote.pitch.alter = 1;
  upperNote.writtenAccidental = 'sharp';
  upperMeasure.voices.push({
    id: 'src:v1:1',
    voiceId: 1,
    events: [upperNote],
  });
  const lowerMeasure = buildMeasure('src:m1:st2', 1, 2, { beats: 4, beatType: 4 });
  lowerMeasure.voices.push({
    id: 'src:v2:1',
    voiceId: 1,
    events: [buildNoteEvent({
      id: 'src:lower',
      measureNumber: 1,
      staffIndex: 2,
      voiceId: 1,
      timestampNum: 0,
      durationDivisions: 1,
      durationType: 'quarter',
      step: 'E',
      octave: 4,
    })],
  });
  const source = buildDocumentFromStaves({
    partId: 'source',
    partName: 'Piano',
    staves: [
      { staffIndex: 1, measures: [upperMeasure] },
      { staffIndex: 2, measures: [lowerMeasure] },
    ],
  });
  const clipboard = buildClipboardPayloadFromSelection(source, [
    { measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 4 },
    { measureNumber: 1, staffIndex: 2, voiceId: 1, timestampNum: 0, timestampDen: 4 },
  ]);
  assert.ok(clipboard);

  const target = buildDocumentFromStaves({
    partId: 'target',
    partName: 'Flute',
    staves: [{ staffIndex: 1, measures: [buildMeasure('target:m1', 1, 1, { beats: 4, beatType: 4 })] }],
  });

  const next = applyCoreCommands(target, [{
    type: 'pasteContent',
    targetPartId: 'target',
    targetStaffIndex: 1,
    targetOffset: {
      measureNumber: 1,
      timestampNum: 0,
      timestampDen: 4,
    },
    clipboardData: clipboard,
    mode: 'insert',
  } as never]);

  const voices = next.score.parts[0]!.staves[0]!.measures[0]!.voices
    .filter((voice) => voice.events.some((event) => event.kind === 'note'))
    .sort((left, right) => left.voiceId - right.voiceId);

  assert.equal(voices.length, 2);
  assert.deepEqual(
    voices.map((voice) => ({
      voiceId: voice.voiceId,
      pitch: firstVoicePitch(voice),
    })),
    [
      { voiceId: 1, pitch: 'C5' },
      { voiceId: 2, pitch: 'E4' },
    ],
  );
  const pastedSharp = voices[0]?.events.find((event) => event.kind === 'note');
  assert.equal(pastedSharp?.kind === 'note' ? pastedSharp.pitch.alter : null, 1);
  assert.equal(pastedSharp?.kind === 'note' ? pastedSharp.writtenAccidental : null, 'sharp');
});

test('pasteContent reflows copied 3/4 material across 4/4 target measure boundaries', () => {
  const sourceMeasure = buildMeasure('src:3-4:m1', 1, 1, { beats: 3, beatType: 4 });
  sourceMeasure.voices.push({
    id: 'src:voice',
    voiceId: 1,
    events: [buildNoteEvent({
      id: 'src:dotted-half',
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 0,
      durationDivisions: 3,
      durationType: 'half',
      isDotted: true,
      step: 'G',
      octave: 4,
    })],
  });
  const source = buildDocumentFromStaves({
    partId: 'source-3-4',
    staves: [{ staffIndex: 1, measures: [sourceMeasure] }],
  });
  const clipboard = buildClipboardPayloadFromSelection(source, [
    { measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 4 },
  ]);
  assert.ok(clipboard);

  const targetMeasure1 = buildMeasure('target:4-4:m1', 1, 1, { beats: 4, beatType: 4 });
  const targetMeasure2 = buildMeasure('target:4-4:m2', 2, 1, { beats: 4, beatType: 4 });
  const target = buildDocumentFromStaves({
    partId: 'target-4-4',
    staves: [{ staffIndex: 1, measures: [targetMeasure1, targetMeasure2] }],
  });

  const next = applyCoreCommands(target, [{
    type: 'pasteContent',
    targetPartId: 'target-4-4',
    targetStaffIndex: 1,
    targetOffset: {
      measureNumber: 1,
      timestampNum: 2,
      timestampDen: 4,
    },
    clipboardData: clipboard,
    mode: 'insert',
  } as never]);

  const measure1Voice = next.score.parts[0]!.staves[0]!.measures[0]!.voices.find((voice) => voice.voiceId === 1);
  const measure2Voice = next.score.parts[0]!.staves[0]!.measures[1]!.voices.find((voice) => voice.voiceId === 1);
  assert.ok(measure1Voice);
  assert.ok(measure2Voice);

  const measure1Notes = measure1Voice.events.filter((event) => event.kind === 'note');
  const measure2Notes = measure2Voice.events.filter((event) => event.kind === 'note');

  assert.equal(measure1Notes.length, 1);
  assert.equal(measure2Notes.length, 1);
  assert.equal(measure1Notes[0]!.timestampNum, 2);
  assert.equal(measure1Notes[0]!.durationDivisions, 2);
  assert.equal(measure1Notes[0]!.tieStart, true);
  assert.equal(measure2Notes[0]!.timestampNum, 0);
  assert.equal(measure2Notes[0]!.durationDivisions, 1);
});

test('cross-measure accidental entry writes the explicit glyph only on the first tied fragment', () => {
  const target = buildDocumentFromStaves({
    partId: 'accidental-overflow',
    staves: [{
      staffIndex: 1,
      measures: [
        buildMeasure('accidental-overflow:m1', 1, 1, { beats: 4, beatType: 4 }),
        buildMeasure('accidental-overflow:m2', 2, 1, { beats: 4, beatType: 4 }),
      ],
    }],
  });

  const next = applyCoreCommands(target, [{
    type: 'insertNoteAt',
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 3,
    timestampDen: 4,
    step: 'F',
    octave: 4,
    alter: 1,
    writtenAccidental: 'sharp',
    durationType: 'half',
    isDotted: false,
    preserveOverflow: true,
  } as never]);
  const notes = next.score.parts[0]!.staves[0]!.measures
    .flatMap((measure) => measure.voices.flatMap((voice) => voice.events))
    .filter((event) => event.kind === 'note');

  assert.equal(notes.length, 2);
  assert.equal(notes[0]?.tieStart, true);
  assert.equal(notes[0]?.kind === 'note' ? notes[0].writtenAccidental : null, 'sharp');
  assert.equal(notes[1]?.kind === 'note' ? notes[1].writtenAccidental : null, undefined);
});

test('pasteContent discards orphaned copied slurs instead of creating dangling references', () => {
  const sourceMeasure = buildMeasure('src:slur:m1', 1, 1, { beats: 4, beatType: 4 });
  sourceMeasure.voices.push({
    id: 'src:slur:voice',
    voiceId: 1,
    events: [
      buildNoteEvent({
        id: 'src:slur:start',
        measureNumber: 1,
        staffIndex: 1,
        voiceId: 1,
        timestampNum: 0,
        durationDivisions: 1,
        durationType: 'quarter',
        step: 'C',
        octave: 4,
      }),
      buildNoteEvent({
        id: 'src:slur:stop',
        measureNumber: 1,
        staffIndex: 1,
        voiceId: 1,
        timestampNum: 1,
        durationDivisions: 1,
        durationType: 'quarter',
        step: 'D',
        octave: 4,
      }),
    ],
  });
  const source = buildDocumentFromStaves({
    partId: 'source-slur',
    staves: [{ staffIndex: 1, measures: [sourceMeasure] }],
  });
  source.slurs.push({
    id: 'src:slur',
    number: 1,
    startEventId: 'src:slur:start',
    stopEventId: 'src:slur:stop',
  });

  const clipboard = buildClipboardPayloadFromSelection(source, [
    { measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 4 },
  ]);
  assert.ok(clipboard);
  assert.equal(clipboard.noteSpanners.length, 1);

  const target = buildDocumentFromStaves({
    partId: 'target-slur',
    staves: [{ staffIndex: 1, measures: [buildMeasure('target:slur:m1', 1, 1, { beats: 4, beatType: 4 })] }],
  });

  const next = applyCoreCommands(target, [{
    type: 'pasteContent',
    targetPartId: 'target-slur',
    targetStaffIndex: 1,
    targetOffset: {
      measureNumber: 1,
      timestampNum: 0,
      timestampDen: 4,
    },
    clipboardData: clipboard,
    mode: 'insert',
  } as never]);

  assert.equal(next.slurs.length, 0);
});

// --- Fermata tests ---

const FERMATA_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type><notations><fermata/></notations><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`;

test('addFermata adds fermata to a note event', () => {
  const doc = buildDocumentFromStaves({
    staves: [{ staffIndex: 1, measures: [buildMeasure('m1', 1, 1, { beats: 4, beatType: 4 })] }],
  });
  doc.score.parts[0]!.staves[0]!.measures[0]!.voices = [{
    id: 'v1', voiceId: 1,
    events: [buildNoteEvent({ id: 'n1', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, durationDivisions: 4, durationType: 'whole', step: 'C', octave: 4 })],
  }];
  const next = applyCoreCommands(doc, [{ type: 'addFermata', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 4 } as never]);
  assert.ok(next.fermataEventIds.has('n1'));
});

test('toggleArticulation models fermata separately from articulation elements', () => {
  const doc = buildDocumentFromStaves({
    staves: [{ staffIndex: 1, measures: [buildMeasure('m1', 1, 1, { beats: 4, beatType: 4 })] }],
  });
  doc.score.parts[0]!.staves[0]!.measures[0]!.voices = [{
    id: 'v1', voiceId: 1,
    events: [buildNoteEvent({ id: 'n1', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, durationDivisions: 4, durationType: 'whole', step: 'C', octave: 4 })],
  }];

  const next = applyCoreCommands(doc, [{
    type: 'toggleArticulation',
    articulation: 'fermata',
    placement: 'below',
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 0,
    timestampDen: 4,
  } as never]);

  const event = next.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events[0]!;
  assert.ok(next.fermataEventIds.has('n1'));
  assert.deepEqual(event.articulations, []);
  assert.equal(event.articulationPlacements?.fermata, 'below');

  const exported = exportCoreToMusicXml(FERMATA_XML, next);
  assert.match(exported, /<fermata placement="below"\/>/);
  assert.doesNotMatch(exported, /<articulations><fermata/);
});

test('removeFermata removes fermata from a note event', () => {
  const doc = buildDocumentFromStaves({
    staves: [{ staffIndex: 1, measures: [buildMeasure('m1', 1, 1, { beats: 4, beatType: 4 })] }],
  });
  doc.score.parts[0]!.staves[0]!.measures[0]!.voices = [{
    id: 'v1', voiceId: 1,
    events: [buildNoteEvent({ id: 'n1', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, durationDivisions: 4, durationType: 'whole', step: 'C', octave: 4 })],
  }];
  doc.fermataEventIds.add('n1');
  const next = applyCoreCommands(doc, [{ type: 'removeFermata', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 4 } as never]);
  assert.equal(next.fermataEventIds.has('n1'), false);
});

test('fermata survives MusicXML roundtrip', () => {
  const imported = importMusicXmlToCore(FERMATA_XML);
  assert.equal(imported.fermataEventIds.size, 1);
  const exported = exportCoreToMusicXml(FERMATA_XML, imported);
  assert.match(exported, /<fermata\/>/);
  const reimported = importMusicXmlToCore(exported);
  assert.equal(reimported.fermataEventIds.size, 1);
});

test('articulation placement survives command and MusicXML roundtrip', () => {
  const imported = importMusicXmlToCore(`<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type><notations><articulations><accent placement="above"/></articulations></notations><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`);

  const event = imported.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events[0]!;
  assert.deepEqual(event.articulations, ['accent']);
  assert.equal(event.articulationPlacements?.accent, 'above');

  const next = applyCoreCommands(imported, [{
    type: 'setArticulationPlacement',
    articulation: 'accent',
    placement: 'below',
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 0,
    timestampDen: 4,
  } as never]);
  const exported = exportCoreToMusicXml(FERMATA_XML, next);
  assert.match(exported, /<accent placement="below"\/>/);

  const reimported = importMusicXmlToCore(exported);
  const reimportedEvent = reimported.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events[0]!;
  assert.equal(reimportedEvent.articulationPlacements?.accent, 'below');
});

test('clearArticulations clears articulation placements and fermata state', () => {
  const doc = buildDocumentFromStaves({
    staves: [{ staffIndex: 1, measures: [buildMeasure('m1', 1, 1, { beats: 4, beatType: 4 })] }],
  });
  doc.score.parts[0]!.staves[0]!.measures[0]!.voices = [{
    id: 'v1', voiceId: 1,
    events: [{
      ...buildNoteEvent({ id: 'n1', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, durationDivisions: 4, durationType: 'whole', step: 'C', octave: 4 }),
      articulations: ['accent'],
      articulationPlacements: { accent: 'above', fermata: 'below' },
    }],
  }];
  doc.fermataEventIds.add('n1');

  const next = applyCoreCommands(doc, [{
    type: 'clearArticulations',
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 0,
    timestampDen: 4,
  } as never]);
  const event = next.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events[0]!;

  assert.deepEqual(event.articulations, []);
  assert.equal(event.articulationPlacements, undefined);
  assert.equal(next.fermataEventIds.has('n1'), false);
});

// --- Tremolo tests ---

const TREMOLO_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>half</type><notations><tremolo type="start">2</tremolo></notations><staff>1</staff></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>half</type><notations><tremolo type="stop">2</tremolo></notations><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`;

test('addTremolo adds tremolo to a note event', () => {
  const doc = buildDocumentFromStaves({
    staves: [{ staffIndex: 1, measures: [buildMeasure('m1', 1, 1, { beats: 4, beatType: 4 })] }],
  });
  doc.score.parts[0]!.staves[0]!.measures[0]!.voices = [{
    id: 'v1', voiceId: 1,
    events: [buildNoteEvent({ id: 'n1', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, durationDivisions: 2, durationType: 'half', step: 'C', octave: 4 })],
  }];
  const next = applyCoreCommands(doc, [{ type: 'addTremolo', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 4, lines: 2, tremoloType: 'single' } as never]);
  assert.equal(next.tremolos.length, 1);
  assert.equal(next.tremolos[0]!.eventId, 'n1');
  assert.equal(next.tremolos[0]!.lines, 2);
  assert.equal(next.tremolos[0]!.type, 'single');
});

test('tremolo survives MusicXML roundtrip', () => {
  const imported = importMusicXmlToCore(TREMOLO_XML);
  assert.equal(imported.tremolos.length, 2);
  const exported = exportCoreToMusicXml(TREMOLO_XML, imported);
  assert.match(exported, /<tremolo type="start">2<\/tremolo>/);
  assert.match(exported, /<tremolo type="stop">2<\/tremolo>/);
  const reimported = importMusicXmlToCore(exported);
  assert.equal(reimported.tremolos.length, 2);
});

// --- Glissando tests ---

const GLISSANDO_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>half</type><notations><glissando type="start" number="1"/></notations><staff>1</staff></note>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>half</type><notations><glissando type="stop" number="1"/></notations><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`;

test('addGlissando creates span between two notes', () => {
  const doc = buildDocumentFromStaves({
    staves: [{ staffIndex: 1, measures: [buildMeasure('m1', 1, 1, { beats: 4, beatType: 4 })] }],
  });
  doc.score.parts[0]!.staves[0]!.measures[0]!.voices = [{
    id: 'v1', voiceId: 1,
    events: [
      buildNoteEvent({ id: 'n1', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, durationDivisions: 2, durationType: 'half', step: 'C', octave: 4 }),
      buildNoteEvent({ id: 'n2', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 2, durationDivisions: 2, durationType: 'half', step: 'G', octave: 4 }),
    ],
  }];
  const next = applyCoreCommands(doc, [{ type: 'addGlissando', lineType: 'solid', start: { measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 4 }, stop: { measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 2, timestampDen: 4 } } as never]);
  assert.equal(next.glissandos.length, 1);
  assert.equal(next.glissandos[0]!.startEventId, 'n1');
  assert.equal(next.glissandos[0]!.stopEventId, 'n2');
  assert.equal(next.glissandos[0]!.lineType, 'solid');
});

test('glissando survives MusicXML roundtrip', () => {
  const imported = importMusicXmlToCore(GLISSANDO_XML);
  assert.equal(imported.glissandos.length, 1);
  assert.equal(imported.glissandos[0]!.number, 1);
  const exported = exportCoreToMusicXml(GLISSANDO_XML, imported);
  assert.match(exported, /<glissando type="start" number="1"\/>/);
  assert.match(exported, /<glissando type="stop" number="1"\/>/);
  const reimported = importMusicXmlToCore(exported);
  assert.equal(reimported.glissandos.length, 1);
});

// --- Arpeggio tests ---

const ARPEGGIO_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type><notations><arpeggiate direction="up"/></notations><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`;

test('addArpeggio adds arpeggio to a note event', () => {
  const doc = buildDocumentFromStaves({
    staves: [{ staffIndex: 1, measures: [buildMeasure('m1', 1, 1, { beats: 4, beatType: 4 })] }],
  });
  doc.score.parts[0]!.staves[0]!.measures[0]!.voices = [{
    id: 'v1', voiceId: 1,
    events: [buildNoteEvent({ id: 'n1', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, durationDivisions: 4, durationType: 'whole', step: 'C', octave: 4 })],
  }];
  const next = applyCoreCommands(doc, [{ type: 'addArpeggio', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 4, direction: 'up' } as never]);
  assert.equal(next.arpeggios.length, 1);
  assert.equal(next.arpeggios[0]!.eventId, 'n1');
  assert.equal(next.arpeggios[0]!.direction, 'up');
});

test('arpeggio survives MusicXML roundtrip', () => {
  const imported = importMusicXmlToCore(ARPEGGIO_XML);
  assert.equal(imported.arpeggios.length, 1);
  assert.equal(imported.arpeggios[0]!.direction, 'up');
  const exported = exportCoreToMusicXml(ARPEGGIO_XML, imported);
  assert.match(exported, /<arpeggiate direction="up"\/>/);
  const reimported = importMusicXmlToCore(exported);
  assert.equal(reimported.arpeggios.length, 1);
  assert.equal(reimported.arpeggios[0]!.direction, 'up');
});

// --- Validation tests for dangling references ---

test('dangling tremolo produces validation diagnostic', () => {
  const doc = buildDocumentFromStaves({
    staves: [{ staffIndex: 1, measures: [buildMeasure('m1', 1, 1, { beats: 4, beatType: 4 })] }],
  });
  doc.score.parts[0]!.staves[0]!.measures[0]!.voices = [{
    id: 'v1', voiceId: 1,
    events: [buildNoteEvent({ id: 'n1', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, durationDivisions: 4, durationType: 'whole', step: 'C', octave: 4 })],
  }];
  doc.tremolos.push({ id: 'dangling', eventId: 'nonexistent', lines: 1, type: 'single' });
  const { validateScoreDocument } = require('../src/score-core/validation/validate-score-document');
  const diagnostics = validateScoreDocument(doc);
  const dangling = diagnostics.filter((d: { code: string }) => d.code === 'dangling_tremolo');
  assert.equal(dangling.length, 1);
});

test('dangling glissando produces validation diagnostic', () => {
  const doc = buildDocumentFromStaves({
    staves: [{ staffIndex: 1, measures: [buildMeasure('m1', 1, 1, { beats: 4, beatType: 4 })] }],
  });
  doc.glissandos.push({ id: 'dangling', number: 1, startEventId: 'nonexistent' });
  const { validateScoreDocument } = require('../src/score-core/validation/validate-score-document');
  const diagnostics = validateScoreDocument(doc);
  const dangling = diagnostics.filter((d: { code: string }) => d.code === 'dangling_glissando');
  assert.equal(dangling.length, 1);
});

test('dangling arpeggio produces validation diagnostic', () => {
  const doc = buildDocumentFromStaves({
    staves: [{ staffIndex: 1, measures: [buildMeasure('m1', 1, 1, { beats: 4, beatType: 4 })] }],
  });
  doc.arpeggios.push({ id: 'dangling', eventId: 'nonexistent' });
  const { validateScoreDocument } = require('../src/score-core/validation/validate-score-document');
  const diagnostics = validateScoreDocument(doc);
  const dangling = diagnostics.filter((d: { code: string }) => d.code === 'dangling_arpeggio');
  assert.equal(dangling.length, 1);
});

// --- Repeat navigation tests ---

const SEGNO_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <direction placement="above"><direction-type><segno/></direction-type></direction>
      <note><rest/><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><rest/><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><rest/><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><rest/><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`;

test('addSegno adds segno direction to measure', () => {
  const doc = buildDocumentFromStaves({
    staves: [{ staffIndex: 1, measures: [buildMeasure('m1', 1, 1, { beats: 4, beatType: 4 })] }],
  });
  const next = applyCoreCommands(doc, [{ type: 'addSegno', measureNumber: 1, placement: 'above' } as never]);
  const measure = next.score.parts[0]!.staves[0]!.measures[0]!;
  assert.ok(measure.directions.some((d) => d.kind === 'segno'));
});

test('addCoda adds coda direction to measure', () => {
  const doc = buildDocumentFromStaves({
    staves: [{ staffIndex: 1, measures: [buildMeasure('m1', 1, 1, { beats: 4, beatType: 4 })] }],
  });
  const next = applyCoreCommands(doc, [{ type: 'addCoda', measureNumber: 1 } as never]);
  const measure = next.score.parts[0]!.staves[0]!.measures[0]!;
  assert.ok(measure.directions.some((d) => d.kind === 'coda'));
});

test('addDacapo adds D.C. direction', () => {
  const doc = buildDocumentFromStaves({
    staves: [{ staffIndex: 1, measures: [buildMeasure('m1', 1, 1, { beats: 4, beatType: 4 })] }],
  });
  const next = applyCoreCommands(doc, [{ type: 'addDacapo', measureNumber: 1 } as never]);
  const measure = next.score.parts[0]!.staves[0]!.measures[0]!;
  assert.ok(measure.directions.some((d) => d.kind === 'words' && d.value === 'D.C.'));
});

test('addDalsegno adds D.S. direction', () => {
  const doc = buildDocumentFromStaves({
    staves: [{ staffIndex: 1, measures: [buildMeasure('m1', 1, 1, { beats: 4, beatType: 4 })] }],
  });
  const next = applyCoreCommands(doc, [{ type: 'addDalsegno', measureNumber: 1 } as never]);
  const measure = next.score.parts[0]!.staves[0]!.measures[0]!;
  assert.ok(measure.directions.some((d) => d.kind === 'words' && d.value === 'D.S.'));
});

test('addFine adds Fine direction', () => {
  const doc = buildDocumentFromStaves({
    staves: [{ staffIndex: 1, measures: [buildMeasure('m1', 1, 1, { beats: 4, beatType: 4 })] }],
  });
  const next = applyCoreCommands(doc, [{ type: 'addFine', measureNumber: 1 } as never]);
  const measure = next.score.parts[0]!.staves[0]!.measures[0]!;
  assert.ok(measure.directions.some((d) => d.kind === 'words' && d.value === 'Fine'));
});

test('addToCoda adds To Coda direction', () => {
  const doc = buildDocumentFromStaves({
    staves: [{ staffIndex: 1, measures: [buildMeasure('m1', 1, 1, { beats: 4, beatType: 4 })] }],
  });
  const next = applyCoreCommands(doc, [{ type: 'addToCoda', measureNumber: 1 } as never]);
  const measure = next.score.parts[0]!.staves[0]!.measures[0]!;
  assert.ok(measure.directions.some((d) => d.kind === 'words' && d.value === 'To Coda'));
});

test('segno survives MusicXML roundtrip', () => {
  const imported = importMusicXmlToCore(SEGNO_XML);
  const measure = imported.score.parts[0]!.staves[0]!.measures[0]!;
  assert.ok(measure.directions.some((d) => d.kind === 'segno'));

  const exported = exportCoreToMusicXml(SEGNO_XML, imported);
  assert.match(exported, /<segno\/>/);

  const reimported = importMusicXmlToCore(exported);
  const reMeasure = reimported.score.parts[0]!.staves[0]!.measures[0]!;
  assert.ok(reMeasure.directions.some((d) => d.kind === 'segno'));
});

// --- Measure repeat tests ---

const MEASURE_REPEAT_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type><staff>1</staff></note>
    </measure>
    <measure number="2">
      <attributes><measure-style><measure-repeat type="start">1</measure-repeat></measure-style></attributes>
      <note><rest/><duration>4</duration><voice>1</voice><type>whole</type><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`;

test('setMeasureRepeat sets measure repeat count', () => {
  const doc = buildDocumentFromStaves({
    staves: [{ staffIndex: 1, measures: [
      buildMeasure('m1', 1, 1, { beats: 4, beatType: 4 }),
      buildMeasure('m2', 2, 1, { beats: 4, beatType: 4 }),
    ]}],
  });
  const next = applyCoreCommands(doc, [{ type: 'setMeasureRepeat', measureNumber: 2, repeatCount: 1 } as never]);
  assert.equal(next.score.parts[0]!.staves[0]!.measures[1]!.measureRepeat, 1);
});

test('measure repeat survives MusicXML roundtrip', () => {
  const imported = importMusicXmlToCore(MEASURE_REPEAT_XML);
  assert.equal(imported.score.parts[0]!.staves[0]!.measures[1]!.measureRepeat, 1);

  const exported = exportCoreToMusicXml(MEASURE_REPEAT_XML, imported);
  assert.match(exported, /<measure-repeat type="start">1<\/measure-repeat>/);

  const reimported = importMusicXmlToCore(exported);
  assert.equal(reimported.score.parts[0]!.staves[0]!.measures[1]!.measureRepeat, 1);
});

// --- Tempo and swing tests ---

test('addTempoText adds tempo direction to measure', () => {
  const doc = buildDocumentFromStaves({
    staves: [{ staffIndex: 1, measures: [buildMeasure('m1', 1, 1, { beats: 4, beatType: 4 })] }],
  });
  const next = applyCoreCommands(doc, [{ type: 'addTempoText', text: 'Allegro', measureNumber: 1, bpm: 120 } as never]);
  const measure = next.score.parts[0]!.staves[0]!.measures[0]!;
  assert.ok(measure.directions.some((d) => d.kind === 'metronome' && d.value === '120'));
});

test('addTempoText without bpm adds as words direction', () => {
  const doc = buildDocumentFromStaves({
    staves: [{ staffIndex: 1, measures: [buildMeasure('m1', 1, 1, { beats: 4, beatType: 4 })] }],
  });
  const next = applyCoreCommands(doc, [{ type: 'addTempoText', text: 'Rit.', measureNumber: 1 } as never]);
  const measure = next.score.parts[0]!.staves[0]!.measures[0]!;
  assert.ok(measure.directions.some((d) => d.kind === 'words' && d.value === 'Rit.'));
});

test('setSwing sets swing ratio on document', () => {
  const doc = buildDocumentFromStaves({
    staves: [{ staffIndex: 1, measures: [buildMeasure('m1', 1, 1, { beats: 4, beatType: 4 })] }],
  });
  const next = applyCoreCommands(doc, [{ type: 'setSwing', ratio: 0.667 } as never]);
  assert.equal(next.swingRatio, 0.667);
});

// --- Instrument change tests ---

test('setInstrumentChange adds instrument change direction', () => {
  const doc = buildDocumentFromStaves({
    staves: [{ staffIndex: 1, measures: [buildMeasure('m1', 1, 1, { beats: 4, beatType: 4 })] }],
  });
  const next = applyCoreCommands(doc, [{ type: 'setInstrumentChange', measureNumber: 1, instrumentName: 'Clarinet' } as never]);
  const measure = next.score.parts[0]!.staves[0]!.measures[0]!;
  assert.ok(measure.directions.some((d) => d.kind === 'words' && d.value === 'Instrument: Clarinet'));
});

// --- Multi-measure rest tests ---

test('setMultiMeasureRest enables multi-measure rest on measure', () => {
  const doc = buildDocumentFromStaves({
    staves: [{ staffIndex: 1, measures: [buildMeasure('m1', 1, 1, { beats: 4, beatType: 4 })] }],
  });
  const next = applyCoreCommands(doc, [{ type: 'setMultiMeasureRest', measureNumber: 1, enabled: true } as never]);
  assert.equal(next.score.parts[0]!.staves[0]!.measures[0]!.multiMeasureRest, true);
});

// --- Guitar technique expansion tests ---

test('addGuitarBend adds bend technique to note', () => {
  const doc = buildDocumentFromStaves({
    staves: [{ staffIndex: 1, measures: [buildMeasure('m1', 1, 1, { beats: 4, beatType: 4 })] }],
  });
  doc.score.parts[0]!.staves[0]!.measures[0]!.voices = [{
    id: 'v1', voiceId: 1,
    events: [buildNoteEvent({ id: 'n1', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, durationDivisions: 4, durationType: 'whole', step: 'C', octave: 4 })],
  }];
  const next = applyCoreCommands(doc, [{ type: 'addGuitarBend', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 4, bendSemitones: 1 } as never]);
  const event = next.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events[0]!;
  assert.ok(event.kind === 'note' && event.guitar?.techniques?.includes('bend'));
});

test('addGuitarTap adds hammer-on technique to note', () => {
  const doc = buildDocumentFromStaves({
    staves: [{ staffIndex: 1, measures: [buildMeasure('m1', 1, 1, { beats: 4, beatType: 4 })] }],
  });
  doc.score.parts[0]!.staves[0]!.measures[0]!.voices = [{
    id: 'v1', voiceId: 1,
    events: [buildNoteEvent({ id: 'n1', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, durationDivisions: 4, durationType: 'whole', step: 'C', octave: 4 })],
  }];
  const next = applyCoreCommands(doc, [{ type: 'addGuitarTap', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 4 } as never]);
  const event = next.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events[0]!;
  assert.ok(event.kind === 'note' && event.guitar?.techniques?.includes('hammer-on'));
});
