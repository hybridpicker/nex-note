import test from 'node:test';
import assert from 'node:assert/strict';

import { applyRhythmSpellingToDocument, buildRhythmSpellingProjection, spellVoiceRhythm } from '../src/layout/rhythm-speller.ts';
import { applyDocumentCommands, buildDocumentState } from '../src/score-core/commands/apply-document-commands.ts';
import { describeDuration, describeDurationStrict } from '../src/score-core/duration-utils.ts';
import type { ScoreDocumentModel, StaffNode, TimedEvent } from '../src/score-core/model/types.ts';
import { scoreXml, TREBLE } from './support/entry-fixtures.ts';

const QUARTERS: Record<string, number> = { whole: 4, half: 2, quarter: 1, eighth: 0.5, '16th': 0.25, '32nd': 0.125, '64th': 0.0625 };

function writtenDivisions(event: Pick<TimedEvent, 'durationType' | 'isDotted' | 'dotCount'>, divisions: number) {
  const dots = event.dotCount ?? (event.isDotted ? 1 : 0);
  return QUARTERS[event.durationType ?? '']! * (2 - 0.5 ** dots) * divisions;
}

function storedNotes(document: ScoreDocumentModel) {
  const notes: Array<{ measureNumber: number; start: number; event: TimedEvent; divisions: number; measureLength: number }> = [];
  for (const staff of document.score.parts[0]!.staves) {
    let divisions = 1;
    let beats = 4;
    let beatType = 4;
    for (const measure of staff.measures) {
      for (const attribute of measure.attributes) {
        if (attribute.divisions) divisions = attribute.divisions;
        if (attribute.time) ({ beats, beatType } = attribute.time);
      }
      for (const voice of measure.voices) {
        for (const event of voice.events) {
          if (event.kind !== 'note') continue;
          notes.push({
            measureNumber: measure.measureNumber,
            start: Math.round((event.timestampNum / event.timestampDen) * divisions * 4),
            event,
            divisions,
            measureLength: (beats * 4 * divisions) / beatType,
          });
        }
      }
    }
  }
  return notes;
}

function insertNote(beats: number, startSixteenths: number, durationType: string, isDotted = false) {
  const state = buildDocumentState(scoreXml({ beats, beatType: 4, measures: 3, parts: [TREBLE] }));
  const next = applyDocumentCommands(state, [{
    type: 'insertNoteAt',
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: startSixteenths,
    timestampDen: 16,
    step: 'F',
    octave: 5,
    alter: 0,
    durationType,
    isDotted,
  } as never]);
  return next;
}

function assertTiedSingleValues(document: ScoreDocumentModel, expectedQuarters: number) {
  const notes = storedNotes(document);
  let total = 0;
  for (const [index, note] of notes.entries()) {
    assert.ok(
      describeDurationStrict(note.event.durationDivisions, note.divisions),
      `m${note.measureNumber} @${note.start}: ${note.event.durationDivisions} divisions is not one value`,
    );
    assert.equal(writtenDivisions(note.event, note.divisions), note.event.durationDivisions,
      `m${note.measureNumber} @${note.start}: written ${note.event.durationType} disagrees with the stored duration`);
    assert.ok(note.start + note.event.durationDivisions <= note.measureLength, 'a fragment crosses the barline');
    assert.equal(Boolean(note.event.tieStart), index < notes.length - 1, `tie chain broken at fragment ${index}`);
    total += note.event.durationDivisions / note.divisions;
  }
  assert.equal(total, expectedQuarters);
  return notes;
}

test('a whole note on the fourth sixteenth of beat 2 in 4/4 carries over as quarter tied to dotted eighth', () => {
  const next = insertNote(4, 7, 'whole');
  const notes = assertTiedSingleValues(next.coreDocument!, 4);
  const secondBar = notes.filter((note) => note.measureNumber === 2)
    .map((note) => `${note.start}:${note.event.durationType}${note.event.isDotted ? '.' : ''}`);
  assert.deepEqual(secondBar, ['0:quarter', '4:eighth.']);
  assert.doesNotMatch(next.xml, /<type>(32nd|64th)<\/type>/);
});

test('a whole note at 7/16 in 3/4 carries over as half tied to dotted eighth', () => {
  const next = insertNote(3, 7, 'whole');
  const notes = assertTiedSingleValues(next.coreDocument!, 4);
  const secondBar = notes.filter((note) => note.measureNumber === 2)
    .map((note) => `${note.start}:${note.event.durationType}${note.event.isDotted ? '.' : ''}`);
  assert.deepEqual(secondBar, ['0:half', '8:eighth.']);
  assert.doesNotMatch(next.xml, /<type>(32nd|64th)<\/type>/);
});

test('long notes at every sixteenth offset of 3/4 and 4/4 store only tied single values', () => {
  for (const beats of [3, 4]) {
    for (const [durationType, isDotted, quarters] of [['whole', false, 4], ['half', true, 3], ['half', false, 2]] as const) {
      for (let start = 0; start < beats * 4; start += 1) {
        const next = insertNote(beats, start, durationType, isDotted);
        assertTiedSingleValues(next.coreDocument!, quarters);
      }
    }
  }
});

test('a dotted half on beat 1 of 4/4 stays one dotted half', () => {
  const next = insertNote(4, 0, 'half', true);
  const notes = storedNotes(next.coreDocument!);
  assert.equal(notes.length, 1);
  assert.equal(notes[0]!.event.durationType, 'half');
  assert.equal(notes[0]!.event.isDotted, true);
  assert.equal(Boolean(notes[0]!.event.tieStart), false);
});

function buildStaff(input: { beats: number; beatType: number; divisions: number; events?: TimedEvent[] }): StaffNode {
  return {
    id: 'P1:S1',
    staffIndex: 1,
    measures: [{
      id: 'P1:S1:M1',
      measureNumber: 1,
      voices: [{ id: 'P1:S1:M1:V1', voiceId: 1, events: input.events ?? [] }],
      directions: [],
      attributes: [{
        id: 'attr:m1',
        divisions: input.divisions,
        time: { beats: input.beats, beatType: input.beatType },
        clefs: [{ staffIndex: 1, sign: 'G', line: 2 }],
      }],
    }],
  } as StaffNode;
}

function makeEvent(input: {
  kind?: 'note' | 'rest';
  start: number;
  length: number;
  divisions: number;
  durationType?: string;
  isDotted?: boolean;
  dotCount?: number;
  id?: string;
}): TimedEvent {
  const described = describeDuration(input.length, input.divisions);
  const base = {
    id: input.id ?? 'event:probe',
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: input.start,
    timestampDen: input.divisions * 4,
    durationDivisions: input.length,
    durationType: input.durationType ?? described.type,
    isDotted: input.isDotted ?? described.dotted,
    ...(input.dotCount ? { dotCount: input.dotCount } : {}),
    isChord: false,
  };
  return input.kind === 'rest'
    ? { ...base, kind: 'rest' }
    : { ...base, kind: 'note', pitch: { step: 'G', alter: 0, octave: 4 } };
}

function spell(input: { beats: number; beatType: number; divisions: number; event: TimedEvent }) {
  return spellVoiceRhythm({
    partId: 'P1',
    staff: buildStaff(input),
    measureNumber: 1,
    voiceId: 1,
    events: [input.event],
  });
}

function shape(fragments: ReturnType<typeof spell>['fragments']) {
  return fragments.map((fragment) => `${fragment.startDivisions}:${fragment.durationType}${fragment.isDotted ? '.' : ''}`);
}

test('the speller keeps a dotted half and a whole on beat 1 of 4/4 and still splits values after beat 1', () => {
  const common = { beats: 4, beatType: 4, divisions: 4 };
  assert.deepEqual(shape(spell({ ...common, event: makeEvent({ start: 0, length: 12, divisions: 4 }) }).fragments), ['0:half.']);
  assert.deepEqual(shape(spell({ ...common, event: makeEvent({ start: 0, length: 16, divisions: 4 }) }).fragments), ['0:whole']);
  // A double-dotted half is one value only when the event declares it (imported MusicXML).
  assert.deepEqual(shape(spell({
    ...common,
    event: makeEvent({ start: 0, length: 14, divisions: 4, durationType: 'half', isDotted: true, dotCount: 2 }),
  }).fragments), ['0:half.']);
  // A half on beat 2 must show beat 3.
  assert.deepEqual(shape(spell({ ...common, event: makeEvent({ start: 4, length: 8, divisions: 4 }) }).fragments), ['4:quarter', '8:quarter']);
  // A dotted half on beat 2 still shows beat 3.
  assert.deepEqual(shape(spell({ ...common, event: makeEvent({ start: 4, length: 12, divisions: 4 }) }).fragments), ['4:quarter', '8:half']);
  // A dotted half rest on beat 1 of 4/4 is written as half + quarter rest.
  assert.deepEqual(shape(spell({ ...common, event: makeEvent({ kind: 'rest', start: 0, length: 12, divisions: 4 }) }).fragments), ['0:half', '8:quarter']);
  // A 1.75-beat value on beat 1 ties on beat 2.
  assert.deepEqual(shape(spell({ ...common, event: makeEvent({ start: 0, length: 7, divisions: 4 }) }).fragments), ['0:quarter', '4:eighth.']);
});

test('the projection keeps the existing half-note-on-beat-2 split with ties', () => {
  const staff = buildStaff({ beats: 4, beatType: 4, divisions: 1, events: [makeEvent({ start: 1, length: 2, divisions: 1 })] });
  const document = {
    score: { id: 'score:test', parts: [{ id: 'P1', sourcePartId: 'P1', name: 'Piano', staves: [staff] }] },
    tuplets: [],
    graceNotes: [],
  } as unknown as ScoreDocumentModel;
  const fragments = buildRhythmSpellingProjection(document).voices[0]!.fragments;
  assert.deepEqual(fragments.map((fragment) => [fragment.startDivisions, fragment.durationType, Boolean(fragment.tieStart), Boolean(fragment.tieStop)]), [
    [1, 'quarter', true, false],
    [2, 'quarter', false, true],
  ]);
});

test('a tuplet member is judged in its tuplet context and is not re-tied', () => {
  // A triplet eighth lasts 4 of 12 divisions per quarter: one value inside 3:2.
  const event = makeEvent({ start: 0, length: 4, divisions: 12, durationType: 'eighth', isDotted: false, id: 'event:triplet' });
  const staff = buildStaff({ beats: 4, beatType: 4, divisions: 12, events: [event] });
  const document = {
    score: { id: 'score:test', parts: [{ id: 'P1', sourcePartId: 'P1', name: 'Piano', staves: [staff] }] },
    tuplets: [{ id: 'tuplet:1', number: 1, eventIds: ['event:triplet'], actualNotes: 3, normalNotes: 2 }],
    graceNotes: [],
  } as unknown as ScoreDocumentModel;
  const fragments = buildRhythmSpellingProjection(document).voices[0]!.fragments;
  assert.deepEqual(fragments.map((fragment) => [fragment.durationDivisions, fragment.durationType]), [[4, 'eighth']]);
  assert.equal(describeDurationStrict(4, 12), null);
  assert.equal(describeDurationStrict(4, 12, { tuplet: { actualNotes: 3, normalNotes: 2 } })?.type, 'eighth');
});

test('describeDurationStrict reports an unnotatable duration instead of a 32nd', () => {
  assert.equal(describeDurationStrict(7, 4), null);
  assert.equal(describeDurationStrict(11, 4), null);
  assert.equal(describeDurationStrict(7, 4, { maxDots: 2 })?.type, 'quarter');
  assert.equal(describeDurationStrict(7, 4, { maxDots: 2 })?.dotCount, 2);
  assert.deepEqual(
    (({ type, dotted, dotCount }) => ({ type, dotted, dotCount }))(describeDurationStrict(6, 4)!),
    { type: 'quarter', dotted: true, dotCount: 1 },
  );
  // The legacy describer keeps its old fallback for outside callers.
  assert.equal(describeDuration(7, 4).type, '32nd');
});

test('a note stored with an impossible fallback value is respelled even outside the targeted measure', () => {
  const state = buildDocumentState(scoreXml({ beats: 4, beatType: 4, measures: 2, parts: [TREBLE] }));
  const document = structuredClone(state.coreDocument!);
  const bar2 = document.score.parts[0]!.staves[0]!.measures[1]!;
  const template = document.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events[0]!;
  bar2.voices[0]!.events = [
    { ...structuredClone(template), id: 'event:broken', kind: 'note', measureNumber: 2, timestampNum: 0, timestampDen: 16, durationDivisions: 7, durationType: '32nd', isDotted: false, pitch: { step: 'F', alter: 0, octave: 5 } } as TimedEvent,
    { ...structuredClone(template), id: 'event:rest', kind: 'rest', measureNumber: 2, timestampNum: 7, timestampDen: 16, durationDivisions: 9, durationType: '32nd', isDotted: false } as TimedEvent,
  ];
  const result = applyRhythmSpellingToDocument(document, []);
  assert.equal(result.splitEventCount, 1);
  const events = bar2.voices[0]!.events;
  assert.deepEqual(events.filter((event) => event.kind === 'note').map((event) => [event.durationDivisions, event.durationType, Boolean(event.isDotted), Boolean(event.tieStart)]), [
    [4, 'quarter', false, true],
    [3, 'eighth', true, false],
  ]);
  // Rests are left to the rest speller of the command executor.
  assert.equal(events.find((event) => event.kind === 'rest')?.durationDivisions, 9);
});

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('property: every spelled fragment is one value, the fragments sum to the input and stay inside the bar', () => {
  const random = seededRandom(20261115);
  const meters = [[2, 4], [3, 4], [4, 4], [6, 8]] as const;
  let cases = 0;
  for (const [beats, beatType] of meters) {
    for (const divisions of [4, 8]) {
      const measureLength = (beats * 4 * divisions) / beatType;
      for (let iteration = 0; iteration < 250; iteration += 1) {
        const start = Math.floor(random() * measureLength);
        const length = 1 + Math.floor(random() * (measureLength - start));
        for (const kind of ['note', 'rest'] as const) {
          const fragments = spell({ beats, beatType, divisions, event: makeEvent({ kind, start, length, divisions }) }).fragments;
          const label = `${beats}/${beatType} div ${divisions} ${kind} @${start} +${length}`;
          let cursor = start;
          for (const fragment of fragments) {
            assert.equal(fragment.startDivisions, cursor, `${label}: fragments are not contiguous`);
            const single = describeDurationStrict(fragment.durationDivisions, divisions);
            assert.ok(single, `${label}: fragment of ${fragment.durationDivisions} is not one value`);
            assert.equal(fragment.durationType, single.type, `${label}: wrong type`);
            assert.equal(Boolean(fragment.isDotted), single.dotted, `${label}: wrong dot`);
            assert.ok(fragment.startDivisions + fragment.durationDivisions <= measureLength, `${label}: crosses the barline`);
            cursor += fragment.durationDivisions;
          }
          assert.equal(cursor, start + length, `${label}: fragments do not sum to the input`);
          cases += 1;
        }
      }
    }
  }
  assert.equal(cases, 4 * 2 * 250 * 2);
});
