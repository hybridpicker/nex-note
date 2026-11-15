import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { applyDocumentCommands, buildDocumentState, type DocumentState } from '../src/score-core/commands/apply-document-commands.ts';
import { executeCoreCommands } from '../src/score-core/commands/core-command-executor.ts';
import { normalizeScoreDocument } from '../src/score-core/normalize/normalize-score-document.ts';
import type { ScoreDocumentModel, TimedEvent } from '../src/score-core/model/types.ts';
import { buildClipboardPayloadFromSelection } from '../src/score-core/query/clipboard.ts';
import type { ScoreEventLocator } from '../src/score-core/query/note-editor.ts';
import { validateScoreDocument } from '../src/score-core/validation/validate-score-document.ts';
import type { ValidatedScoreCommand } from '../src/shared/schemas/score-command.ts';
import { CLARINET_BB, PIANO, TREBLE, scoreXml } from './support/entry-fixtures.ts';

// Regression tests for the semantic command executor: multi-voice and multi-staff paste,
// ties that run into rests or inserted bars, range transposition with a linked TAB staff,
// and rest spelling in compound meters. Synthetic fixtures only.

type Part = ScoreDocumentModel['score']['parts'][number];

const quarter = (step: string, octave: number, voice = 1, staff = 0, extra = '') => (
  `<note><pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>4</duration>`
  + `<voice>${voice}</voice><type>quarter</type>${staff ? `<staff>${staff}</staff>` : ''}${extra}</note>`
);

function apply(state: DocumentState, commands: unknown[]) {
  const next = applyDocumentCommands(state, commands as ValidatedScoreCommand[]);
  const rejected = next.diagnostics.filter((diagnostic) => diagnostic.code.endsWith('_rejected') || diagnostic.level === 'error');
  assert.deepEqual(rejected, [], 'no command was rejected');
  return next;
}

function pitchName(event: TimedEvent) {
  if (event.kind !== 'note') return 'r';
  const accidental = event.pitch.alter === 1 ? '#' : event.pitch.alter === -1 ? 'b' : '';
  return `${event.pitch.step}${accidental}${event.pitch.octave}`;
}

/** Voice id -> pitches (notes only) of one bar of one staff. */
function barVoices(state: DocumentState, staffIndex: number, measureNumber: number, partIndex = 0) {
  const staff = state.coreDocument!.score.parts[partIndex]!.staves.find((entry) => entry.staffIndex === staffIndex)!;
  const measure = staff.measures.find((entry) => entry.measureNumber === measureNumber)!;
  return Object.fromEntries(measure.voices
    .filter((voice) => voice.events.some((event) => event.kind === 'note'))
    .sort((left, right) => left.voiceId - right.voiceId)
    .map((voice) => [voice.voiceId, voice.events.filter((event) => event.kind === 'note').map(pitchName).join(' ')]));
}

function selectionOf(state: DocumentState, predicate: (event: TimedEvent, part: Part, staffIndex: number, measureNumber: number) => boolean) {
  const selection: ScoreEventLocator[] = [];
  for (const part of state.coreDocument!.score.parts) {
    for (const staff of part.staves) {
      for (const measure of staff.measures) {
        for (const voice of measure.voices) {
          for (const event of voice.events) {
            if (!predicate(event, part, staff.staffIndex, measure.measureNumber)) continue;
            selection.push({
              coreEntityId: event.id,
              coreMeasureId: measure.id,
              corePartId: part.id,
              measureNumber: measure.measureNumber,
              staffIndex: staff.staffIndex,
              voiceId: voice.voiceId,
              timestampNum: event.timestampNum,
              timestampDen: event.timestampDen,
            });
          }
        }
      }
    }
  }
  return selection;
}

function paste(state: DocumentState, payload: unknown, partId: string, staffIndex: number, measureNumber: number) {
  return apply(state, [{
    type: 'pasteContent',
    targetPartId: partId,
    targetStaffIndex: staffIndex,
    targetOffset: { measureNumber, timestampNum: 0, timestampDen: 4 },
    clipboardData: payload,
    mode: 'overwrite',
  }]);
}

function validationErrors(state: DocumentState) {
  return validateScoreDocument(state.coreDocument!).filter((diagnostic) => diagnostic.level === 'error').map((diagnostic) => diagnostic.code);
}

const tieStartCount = (state: DocumentState) => (state.xml.match(/<tied type="start"\/>/g) ?? []).length;

// --- Paste -------------------------------------------------------------------------------------

test('paste: a two-voice bar lands in voices 1 and 2 and overwrites the destination bar', () => {
  const content = quarter('C', 5) + quarter('D', 5) + quarter('E', 5) + quarter('F', 5)
    + '<backup><duration>16</duration></backup>'
    + quarter('A', 4, 2) + quarter('B', 4, 2) + quarter('C', 4, 2) + quarter('D', 4, 2);
  const state = buildDocumentState(scoreXml({ beats: 4, beatType: 4, measures: 3, parts: [{
    ...TREBLE,
    content: { '1:1': content, '2:1': quarter('G', 4) + quarter('G', 4) + quarter('G', 4) + quarter('G', 4) },
  }] }));
  const payload = buildClipboardPayloadFromSelection(state.coreDocument, selectionOf(state, (event, _part, _staff, measure) => measure === 1 && event.kind === 'note'));
  assert.ok(payload);

  const next = paste(state, payload, state.coreDocument!.score.parts[0]!.id, 1, 2);
  assert.deepEqual(barVoices(next, 1, 2), { 1: 'C5 D5 E5 F5', 2: 'A4 B4 C4 D4' });
  assert.deepEqual(validationErrors(next), []);
});

test('paste: a grand-staff bar keeps both hands on their own staves', () => {
  const state = buildDocumentState(scoreXml({ beats: 4, beatType: 4, measures: 3, parts: [{ ...PIANO, content: {
    '1:1': quarter('C', 5, 1, 1) + quarter('D', 5, 1, 1) + quarter('E', 5, 1, 1) + quarter('F', 5, 1, 1),
    '1:2': quarter('C', 3, 5, 2) + quarter('D', 3, 5, 2) + quarter('E', 3, 5, 2) + quarter('F', 3, 5, 2),
  } }] }));
  const payload = buildClipboardPayloadFromSelection(state.coreDocument, selectionOf(state, (event, _part, _staff, measure) => measure === 1 && event.kind === 'note'));
  assert.ok(payload);
  assert.equal(payload.lanes.length, 2);

  const next = paste(state, payload, state.coreDocument!.score.parts[0]!.id, 1, 2);
  assert.deepEqual(barVoices(next, 1, 2), { 1: 'C5 D5 E5 F5' });
  // The left hand stays in the staff's own MusicXML voice numbering (voice 5).
  assert.deepEqual(barVoices(next, 2, 2), { 5: 'C3 D3 E3 F3' });
  assert.deepEqual(validationErrors(next), []);
});

test('paste: a left-hand bar (voice 5) pasted onto a right-hand bar replaces its notes', () => {
  const state = buildDocumentState(scoreXml({ beats: 4, beatType: 4, measures: 2, parts: [{ ...PIANO, content: {
    '1:2': quarter('C', 3, 5, 2) + quarter('D', 3, 5, 2) + quarter('E', 3, 5, 2) + quarter('F', 3, 5, 2),
    '2:1': quarter('G', 5, 1, 1) + quarter('A', 5, 1, 1) + quarter('B', 5, 1, 1) + quarter('C', 6, 1, 1),
  } }] }));
  const payload = buildClipboardPayloadFromSelection(state.coreDocument, selectionOf(state, (event, _part, staff, measure) => (
    measure === 1 && staff === 2 && event.kind === 'note'
  )));
  assert.ok(payload);

  const next = paste(state, payload, state.coreDocument!.score.parts[0]!.id, 1, 2);
  assert.deepEqual(barVoices(next, 1, 2), { 1: 'C3 D3 E3 F3' });
  assert.deepEqual(validationErrors(next), []);
});

test('paste: concert pitch pasted into a B-flat clarinet is still written a tone higher', () => {
  const state = buildDocumentState(scoreXml({ beats: 4, beatType: 4, measures: 2, parts: [
    { ...TREBLE, content: { '1:1': quarter('C', 5) + quarter('D', 5) + quarter('E', 5) + quarter('F', 5) } },
    CLARINET_BB,
  ] }));
  const [flute, clarinet] = state.coreDocument!.score.parts;
  const payload = buildClipboardPayloadFromSelection(state.coreDocument, selectionOf(state, (event, part, _staff, measure) => (
    part.id === flute!.id && measure === 1 && event.kind === 'note'
  )));
  assert.ok(payload);

  const next = paste(state, payload, clarinet!.id, 1, 1);
  assert.deepEqual(barVoices(next, 1, 1, 1), { 1: 'D5 E5 F#5 G5' });
});

// --- Ties --------------------------------------------------------------------------------------

test('ties: deleting the tied-to note leaves no tie over the new rest', () => {
  const tieNote = (step: string, tie: 'start' | 'stop' | null) => (
    `<note><pitch><step>${step}</step><octave>5</octave></pitch><duration>4</duration>${tie ? `<tie type="${tie}"/>` : ''}`
    + `<voice>1</voice><type>quarter</type>${tie ? `<notations><tied type="${tie}"/></notations>` : ''}</note>`
  );
  const state = buildDocumentState(scoreXml({ beats: 4, beatType: 4, measures: 1, parts: [{
    ...TREBLE,
    content: { '1:1': tieNote('C', 'start') + tieNote('C', 'stop') + tieNote('C', null) + tieNote('D', null) },
  }] }));
  assert.equal(tieStartCount(state), 1);
  const tiedTo = state.coreDocument!.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events[1]!;

  const next = apply(state, [{
    type: 'deleteNote',
    coreEntityId: tiedTo.id,
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: tiedTo.timestampNum,
    timestampDen: tiedTo.timestampDen,
    step: 'C',
    octave: 5,
    alter: 0,
  }]);
  // The C on beat 3 has the same pitch but follows the rest: the tie must not jump over it.
  assert.equal(tieStartCount(next), 0);
  const events = next.coreDocument!.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events;
  assert.equal(events.some((event) => event.tieStart), false);
});

const TIED_ACROSS_BARLINE = scoreXml({ beats: 4, beatType: 4, measures: 2, parts: [{ ...TREBLE, content: {
  '1:1': '<note><rest/><duration>12</duration><voice>1</voice><type>half</type><dot/></note>'
    + '<note><pitch><step>A</step><octave>4</octave></pitch><duration>4</duration><tie type="start"/><voice>1</voice><type>quarter</type><notations><tied type="start"/></notations></note>',
  '2:1': '<note><pitch><step>A</step><octave>4</octave></pitch><duration>4</duration><tie type="stop"/><voice>1</voice><type>quarter</type><notations><tied type="stop"/></notations></note>'
    + '<note><rest/><duration>12</duration><voice>1</voice><type>half</type><dot/></note>',
} }] });

test('ties: a tie across the barline survives an unrelated edit', () => {
  const state = buildDocumentState(TIED_ACROSS_BARLINE);
  assert.equal(tieStartCount(state), 1);
  const next = apply(state, [{ type: 'setPartName', partId: state.coreDocument!.score.parts[0]!.id, name: 'Flute 1' }]);
  assert.equal(tieStartCount(next), 1);
});

for (const command of [{ type: 'insertMeasureAfter', measureNumber: 1 }, { type: 'insertMeasureBefore', measureNumber: 2 }]) {
  test(`ties: ${command.type} between two tied notes removes the tie`, () => {
    const next = apply(buildDocumentState(TIED_ACROSS_BARLINE), [command]);
    assert.equal(next.coreDocument!.score.parts[0]!.staves[0]!.measures.length, 3);
    assert.equal(tieStartCount(next), 0);
  });
}

test('ties: chord ties to the next chord are kept', () => {
  const chordTone = (step: string, tie: 'start' | 'stop', isChord: boolean) => (
    `<note>${isChord ? '<chord/>' : ''}<pitch><step>${step}</step><octave>4</octave></pitch><duration>8</duration>`
    + `<tie type="${tie}"/><voice>1</voice><type>half</type><notations><tied type="${tie}"/></notations></note>`
  );
  const state = buildDocumentState(scoreXml({ beats: 4, beatType: 4, measures: 1, parts: [{ ...TREBLE, content: {
    '1:1': chordTone('C', 'start', false) + chordTone('E', 'start', true) + chordTone('C', 'stop', false) + chordTone('E', 'stop', true),
  } }] }));
  assert.equal(tieStartCount(state), 2);
  const next = apply(state, [{ type: 'setPartName', partId: state.coreDocument!.score.parts[0]!.id, name: 'Flute 1' }]);
  assert.equal(tieStartCount(next), 2);
});

// --- Range transposition with linked TAB -------------------------------------------------------

test('transposeRangeChromatic keeps the paired TAB staff in sync', () => {
  const state = buildDocumentState(readFileSync(new URL('../e2e/fixtures/readme-guitar-tab.musicxml', import.meta.url), 'utf8'));
  const part = state.coreDocument!.score.parts[0]!;
  const notes = part.staves[0]!.measures.slice(0, 1)
    .flatMap((measure) => measure.voices.filter((voice) => voice.voiceId === 1).flatMap((voice) => voice.events))
    .filter((event) => event.kind === 'note' && !event.isChord);
  const locator = (event: TimedEvent) => ({
    measureNumber: event.measureNumber,
    staffIndex: 1,
    voiceId: event.voiceId,
    timestampNum: event.timestampNum,
    timestampDen: event.timestampDen,
    corePartId: part.id,
  });
  const lane = (document: ScoreDocumentModel, staffIndex: number) => document.score.parts[0]!.staves
    .find((staff) => staff.staffIndex === staffIndex)!.measures[0]!.voices
    .flatMap((voice) => voice.events)
    .filter((event) => event.kind === 'note')
    .slice(0, 3)
    .map((event) => `${pitchName(event)}${event.kind === 'note' && event.guitar ? `(s${event.guitar.string}f${event.guitar.fret})` : ''}`);
  assert.deepEqual(lane(state.coreDocument!, 1), ['C4', 'E4', 'G4']);
  assert.deepEqual(lane(state.coreDocument!, 2), ['C3(s5f3)', 'E3(s4f2)', 'G3(s3f0)']);

  const next = apply(state, [{
    type: 'transposeRangeChromatic',
    semitones: 1,
    range: { start: locator(notes[0]!), end: locator(notes[1]!) },
  }]);
  assert.deepEqual(lane(next.coreDocument!, 1), ['C#4', 'F4', 'G4']);
  assert.deepEqual(lane(next.coreDocument!, 2), ['C#3(s5f4)', 'F3(s4f3)', 'G3(s3f0)']);
});

// --- Rest spelling -----------------------------------------------------------------------------

/** Rests the command executor writes after one note at the start of an empty bar. */
function restsAfterFirstNote(beats: number, beatType: number, durationType: string, isDotted = false) {
  const state = buildDocumentState(scoreXml({ beats, beatType, measures: 2, parts: [TREBLE] }));
  const result = executeCoreCommands(state.coreDocument!, [{
    type: 'insertNoteAt',
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    timestampNum: 0,
    timestampDen: 4,
    step: 'G',
    octave: 4,
    alter: 0,
    durationType,
    isDotted,
  } as ValidatedScoreCommand]);
  const measure = result.coreDocument.score.parts[0]!.staves[0]!.measures[0]!;
  const voice = measure.voices.find((entry) => entry.voiceId === 1)!;
  return [...voice.events]
    .sort((left, right) => left.timestampNum / left.timestampDen - right.timestampNum / right.timestampDen)
    .map((event) => `${event.kind === 'rest' ? 'r' : pitchName(event)} ${event.durationType}${event.isDotted ? '.' : ''}`);
}

test('rests: 6/8 after an eighth fill beat 1 with a quarter and beat 2 with a dotted quarter', () => {
  assert.deepEqual(restsAfterFirstNote(6, 8, 'eighth'), ['G4 eighth', 'r quarter', 'r quarter.']);
});

test('rests: 9/8 after an eighth never cross a dotted-quarter beat', () => {
  assert.deepEqual(restsAfterFirstNote(9, 8, 'eighth'), ['G4 eighth', 'r quarter', 'r quarter.', 'r quarter.']);
});

test('rests: 12/8 after a dotted quarter use a dotted quarter and a dotted half', () => {
  assert.deepEqual(restsAfterFirstNote(12, 8, 'quarter', true), ['G4 quarter.', 'r quarter.', 'r half.']);
});

test('rests: 4/4, 3/4 and 2/2 keep their simple-meter spelling', () => {
  assert.deepEqual(restsAfterFirstNote(4, 4, 'eighth'), ['G4 eighth', 'r eighth', 'r quarter', 'r half']);
  assert.deepEqual(restsAfterFirstNote(4, 4, 'quarter'), ['G4 quarter', 'r quarter', 'r half']);
  assert.deepEqual(restsAfterFirstNote(3, 4, 'eighth'), ['G4 eighth', 'r eighth', 'r quarter', 'r quarter']);
  assert.deepEqual(restsAfterFirstNote(2, 2, 'quarter'), ['G4 quarter', 'r quarter', 'r half']);
});

test('rests: a 6/8 whole-bar rest stays one dotted-half rest', () => {
  const state = buildDocumentState(scoreXml({ beats: 6, beatType: 8, measures: 1, parts: [{
    ...TREBLE,
    content: { '1:1': quarter('C', 5) + quarter('D', 5) + quarter('E', 5) },
  }] }));
  const measure = state.coreDocument!.score.parts[0]!.staves[0]!.measures[0]!;
  const result = executeCoreCommands(state.coreDocument!, [{
    type: 'clearMeasureVoice',
    measureNumber: 1,
    staffIndex: 1,
    voiceId: 1,
    coreMeasureId: measure.id,
  } as unknown as ValidatedScoreCommand]);
  const events = result.coreDocument.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events;
  assert.deepEqual(events.map((event) => `${event.kind} ${event.durationType}${event.isDotted ? '.' : ''}`), ['rest half.']);
});

test('setTimeSignature 4/4 -> 6/8 respells re-barred notes for the dotted-quarter beat', () => {
  const state = buildDocumentState(scoreXml({ beats: 4, beatType: 4, measures: 2, parts: [{ ...TREBLE, content: {
    '1:1': quarter('C', 5) + quarter('D', 5) + quarter('E', 5) + quarter('F', 5),
    '2:1': '<note><pitch><step>G</step><octave>5</octave></pitch><duration>8</duration><voice>1</voice><type>half</type></note>'
      + '<note><pitch><step>A</step><octave>5</octave></pitch><duration>8</duration><voice>1</voice><type>half</type></note>',
  } }] }));
  const result = executeCoreCommands(state.coreDocument!, [{ type: 'setTimeSignature', beats: 6, beatType: 8, measureNumber: 1 } as ValidatedScoreCommand]);
  const notesOf = (measureNumber: number) => result.coreDocument.score.parts[0]!.staves[0]!.measures
    .find((measure) => measure.measureNumber === measureNumber)!.voices
    .flatMap((voice) => voice.events)
    .filter((event) => event.kind === 'note')
    .map((event) => `${pitchName(event)} ${event.durationType}${event.isDotted ? '.' : ''}${event.tieStart ? '~' : ''}`);
  assert.deepEqual(notesOf(1), ['C5 quarter', 'D5 eighth~', 'D5 eighth', 'E5 quarter']);
  // The half note G5 now starts on the second eighth of bar 2 and the half note A5 opens bar 3:
  // both are split at the dotted-quarter beat.
  assert.deepEqual(notesOf(2), ['F5 quarter', 'G5 eighth~', 'G5 quarter.']);
  assert.deepEqual(notesOf(3), ['A5 quarter.~', 'A5 eighth']);
});

// --- Compound meters through the full pipeline ---------------------------------------------------

/** Every voice-1 event of bar `measureNumber` as "<onset in quarters> <pitch or r> <value>". */
function pipelineBar(state: DocumentState, measureNumber: number, staffIndex = 1) {
  const staff = state.coreDocument!.score.parts[0]!.staves.find((entry) => entry.staffIndex === staffIndex)!;
  const measure = staff.measures.find((entry) => entry.measureNumber === measureNumber)!;
  return measure.voices.flatMap((voice) => voice.events)
    .sort((left, right) => left.timestampNum / left.timestampDen - right.timestampNum / right.timestampDen)
    .map((event) => `@${(event.timestampNum / event.timestampDen) * 4} ${event.kind === 'rest' ? 'r' : pitchName(event)}${event.isChord ? '(chord)' : ''} ${event.durationType}${event.isDotted ? '.' : ''}`);
}

function insertAt(state: DocumentState, measureNumber: number, timestampNum: number, timestampDen: number, step: string, durationType: string, extra: Record<string, unknown> = {}) {
  return apply(state, [{
    type: 'insertNoteAt', measureNumber, staffIndex: 1, voiceId: 1, timestampNum, timestampDen,
    step, octave: 5, alter: 0, durationType, ...extra,
  }]);
}

const rhythmSummary = (state: DocumentState) => JSON.stringify(state.coreDocument!.score.parts
  .flatMap((part) => part.staves.flatMap((staff) => staff.measures.flatMap((measure) => measure.voices.flatMap((voice) => voice.events
    .map((event) => `${measure.measureNumber}:${voice.voiceId}:${(event.timestampNum / event.timestampDen) * 4}:${event.kind}:${event.durationType}${event.isDotted ? '.' : ''}`))))));
/** The document is unchanged by saving and reopening it (export -> import). */
const assertRoundTripFixedPoint = (state: DocumentState) => {
  assert.equal(rhythmSummary(buildDocumentState(state.xml)), rhythmSummary(state), 'export -> import is a fixed point');
};

test('pipeline: 6/8, 9/8 and 12/8 rests are spelled on the dotted beat after export and import', () => {
  const six = insertAt(buildDocumentState(scoreXml({ beats: 6, beatType: 8, measures: 1, parts: [TREBLE] })), 1, 0, 4, 'G', 'eighth');
  assert.deepEqual(pipelineBar(six, 1), ['@0 G5 eighth', '@0.5 r quarter', '@1.5 r quarter.']);
  const nine = insertAt(buildDocumentState(scoreXml({ beats: 9, beatType: 8, measures: 1, parts: [TREBLE] })), 1, 0, 4, 'G', 'eighth');
  assert.deepEqual(pipelineBar(nine, 1), ['@0 G5 eighth', '@0.5 r quarter', '@1.5 r quarter.', '@3 r quarter.']);
  const twelve = insertAt(buildDocumentState(scoreXml({ beats: 12, beatType: 8, measures: 1, parts: [TREBLE] })), 1, 0, 4, 'G', 'quarter', { isDotted: true });
  assert.deepEqual(pipelineBar(twelve, 1), ['@0 G5 quarter.', '@1.5 r quarter.', '@3 r half.']);
  [six, nine, twelve].forEach(assertRoundTripFixedPoint);
});

test('normalizer: a 6/8 rest stored on another timestamp grid keeps its position', () => {
  const state = buildDocumentState(scoreXml({ beats: 6, beatType: 8, measures: 1, parts: [{ ...TREBLE, content: {
    '1:1': '<note><pitch><step>C</step><octave>5</octave></pitch><duration>2</duration><voice>1</voice><type>eighth</type></note>'
      + '<note><rest/><duration>4</duration><voice>1</voice><type>quarter</type></note>'
      + '<note><rest/><duration>6</duration><voice>1</voice><type>quarter</type><dot/></note>',
  } }] }));
  const document = structuredClone(state.coreDocument!);
  const events = document.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events;
  // Halve the timestamp denominator of the dotted-quarter rest (same onset, other grid).
  const rest = events.find((event) => event.kind === 'rest' && event.durationDivisions === 6)!;
  rest.timestampNum /= 2;
  rest.timestampDen /= 2;
  const normalized = normalizeScoreDocument(document).score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events;
  assert.deepEqual(
    normalized.map((event) => `${(event.timestampNum / event.timestampDen) * 4}:${event.kind}:${event.durationDivisions}`),
    ['0:note:2', '0.5:rest:4', '1.5:rest:6'],
  );
});

// --- Notated value always matches the stored duration -------------------------------------------

test('value sync: a note lengthened past the bar end is written as the value it keeps', () => {
  const state = insertAt(buildDocumentState(scoreXml({ beats: 2, beatType: 8, measures: 2, parts: [TREBLE] })), 1, 0, 4, 'E', 'eighth');
  const note = state.coreDocument!.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events[0]!;
  const next = apply(state, [{
    type: 'changeNoteDuration', coreEntityId: note.id, measureNumber: 1, staffIndex: 1, voiceId: 1,
    timestampNum: note.timestampNum, timestampDen: note.timestampDen, step: 'E', octave: 5, alter: 0,
    durationType: 'half', isDotted: true,
  }]);
  // A dotted half does not fit a 2/8 bar: the note is cut to the bar and is a quarter.
  assert.deepEqual(pipelineBar(next, 1), ['@0 E5 quarter']);
});

test('value sync: a chord tone on a rest is an ordinary note, not a chord member', () => {
  const next = insertAt(buildDocumentState(scoreXml({ beats: 3, beatType: 4, measures: 1, parts: [TREBLE] })), 1, 2, 4, 'A', 'half', { isDotted: true, asChord: true });
  // The dotted half starting on beat 3 of 3/4 keeps one quarter of the bar.
  assert.deepEqual(pipelineBar(next, 1), ['@0 r half', '@2 A5 quarter']);
});

test('value sync: a chord tone takes the value of the note it joins', () => {
  const first = insertAt(buildDocumentState(scoreXml({ beats: 4, beatType: 4, measures: 1, parts: [TREBLE] })), 1, 0, 4, 'C', 'quarter');
  const next = insertAt(first, 1, 0, 4, 'E', 'half', { asChord: true });
  assert.deepEqual(pipelineBar(next, 1), ['@0 C5 quarter', '@0 E5(chord) quarter', '@1 r quarter', '@2 r half']);
});

test('value sync: every event a command writes has a type that matches its duration', () => {
  const base: Record<string, number> = { whole: 4, half: 2, quarter: 1, eighth: 0.5, '16th': 0.25, '32nd': 0.125, '64th': 0.0625 };
  let state = buildDocumentState(scoreXml({ beats: 3, beatType: 4, measures: 2, parts: [TREBLE] }));
  state = insertAt(state, 1, 0, 4, 'C', 'quarter');
  state = insertAt(state, 1, 0, 4, 'E', 'whole', { asChord: true });
  state = insertAt(state, 1, 2, 4, 'G', 'whole');
  state = insertAt(state, 2, 1, 4, 'B', 'half', { isDotted: true, asChord: true });
  for (const staff of state.coreDocument!.score.parts[0]!.staves) {
    for (const measure of staff.measures) {
      const divisions = staff.measures[0]!.attributes.find((attribute) => attribute.divisions)!.divisions!;
      for (const event of measure.voices.flatMap((voice) => voice.events)) {
        const dots = event.dotCount ?? (event.isDotted ? 1 : 0);
        const quarters = base[event.durationType!]! * (2 - 0.5 ** dots);
        assert.equal(quarters * divisions, event.durationDivisions, `m${measure.measureNumber} ${pitchName(event)} ${event.durationType}`);
      }
    }
  }
});

// --- Pasted and re-barred rests follow the target meter ------------------------------------------

test('paste: rests copied from a 6/8 bar are respelled for the 4/4 bar they land in', () => {
  const eighth = (step: string) => `<note><pitch><step>${step}</step><octave>5</octave></pitch><duration>2</duration><voice>1</voice><type>eighth</type></note>`;
  const rest = (duration: number, type: string, dotted = false) => `<note><rest/><duration>${duration}</duration><voice>1</voice><type>${type}</type>${dotted ? '<dot/>' : ''}</note>`;
  const sixEight = eighth('C') + rest(4, 'quarter') + rest(6, 'quarter', true);
  const state = apply(buildDocumentState(scoreXml({ beats: 6, beatType: 8, measures: 3, parts: [{ ...TREBLE, content: {
    '1:1': sixEight,
    '2:1': eighth('G') + rest(4, 'quarter') + rest(6, 'quarter', true),
  } }] })), [{ type: 'setTimeSignature', beats: 4, beatType: 4, measureNumber: 2 }]);
  // Re-barring respells the rests of the new 4/4 bar too.
  assert.deepEqual(pipelineBar(state, 2), ['@0 G5 eighth', '@0.5 r eighth', '@1 r quarter', '@2 r half']);

  const payload = buildClipboardPayloadFromSelection(state.coreDocument, selectionOf(state, (_event, _part, _staff, measure) => measure === 1));
  assert.ok(payload);
  const next = paste(state, payload, state.coreDocument!.score.parts[0]!.id, 1, 2);
  assert.deepEqual(pipelineBar(next, 2), ['@0 C5 eighth', '@0.5 r eighth', '@1 r quarter', '@2 r half']);
  assertRoundTripFixedPoint(next);
});


test('deleteMeasure: the carried key, time and clefs join the next bar\'s own attributes block', () => {
  const state = buildDocumentState(scoreXml({ beats: 3, beatType: 4, measures: 3, parts: [TREBLE] }));
  const document = structuredClone(state.coreDocument!);
  // Bar 2 states its own divisions (as after a finer value was entered there).
  const second = document.score.parts[0]!.staves[0]!.measures[1]!;
  second.attributes = [{ id: `${second.id}:attr`, divisions: document.score.parts[0]!.staves[0]!.measures[0]!.attributes[0]!.divisions, clefs: [] }];
  const result = executeCoreCommands(document, [{ type: 'deleteMeasure', measureNumber: 1 } as ValidatedScoreCommand]);
  const attributes = result.coreDocument.score.parts[0]!.staves[0]!.measures[0]!.attributes;
  assert.equal(attributes.length, 1);
  assert.ok(attributes[0]!.divisions);
  assert.deepEqual(attributes[0]!.time, { beats: 3, beatType: 4 });
  assert.equal(attributes[0]!.clefs.length, 1);
});

test('beams: a beam without events is dropped, not copied into every unchanged voice', () => {
  const state = buildDocumentState(scoreXml({ beats: 4, beatType: 4, measures: 3, parts: [TREBLE] }));
  const document = structuredClone(state.coreDocument!);
  document.beams.push({ id: 'beam:empty', number: 1, eventIds: [] } as ScoreDocumentModel['beams'][number]);
  let current = document;
  for (let round = 0; round < 3; round += 1) {
    current = executeCoreCommands(current, [{ type: 'setPartName', partId: current.score.parts[0]!.id, name: `Flute ${round}` } as unknown as ValidatedScoreCommand]).coreDocument;
  }
  assert.equal(current.beams.filter((beam) => beam.eventIds.length === 0).length, 0);
});
