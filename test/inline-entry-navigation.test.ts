import assert from 'node:assert/strict';
import test from 'node:test';

import { importMusicXmlToCore } from '../src/musicxml-adapter/import/import-musicxml.ts';
import { chordNeighbour, endOfEvent, firstFreeVerse, lyricNeighbour, type EntryPosition } from '../src/score-input/inline-entry-navigation.ts';
import { scoreXml, TREBLE } from './support/entry-fixtures.ts';

const note = (step: string, type: string, duration: number) => `<note><pitch><step>${step}</step><octave>4</octave></pitch><duration>${duration}</duration><voice>1</voice><type>${type}</type></note>`;
const rest = (type: string, duration: number) => `<note><rest/><duration>${duration}</duration><voice>1</voice><type>${type}</type></note>`;
// Bar 1: C quarter, rest quarter, D half. Bar 2: E whole. Bar 3: empty.
const XML = scoreXml({
  beats: 4, beatType: 4, measures: 3,
  parts: [{ ...TREBLE, content: { '1:1': `${note('C', 'quarter', 4)}${rest('quarter', 4)}${note('D', 'half', 8)}`, '2:1': note('E', 'whole', 16) } }],
});
const core = importMusicXmlToCore(XML);
const start: EntryPosition = { corePartId: 'part:P1', staffIndex: 1, voiceId: 1, measureNumber: 1, timestampNum: 0, timestampDen: 16 };
const where = (position: EntryPosition | null) => (position ? `m${position.measureNumber}@${(position.timestampNum / position.timestampDen) * 4}` : null);

test('K4: lyrics move from note to note and skip rests', () => {
  const second = lyricNeighbour(core, start, 1);
  assert.equal(where(second), 'm1@2', 'the rest on beat 2 is skipped');
  const third = lyricNeighbour(core, second!, 1);
  assert.equal(where(third), 'm2@0');
  assert.equal(lyricNeighbour(core, third!, 1), null, 'no note after the last one');
  assert.equal(where(lyricNeighbour(core, third!, -1)), 'm1@2');
  assert.ok(second!.coreEntityId, 'the position names its note');
});

test('K6: Space moves a chord symbol to the next beat, note or rest, whichever comes first', () => {
  const beat2 = chordNeighbour(core, start, 'next');
  assert.equal(where(beat2), 'm1@1');
  const beat3 = chordNeighbour(core, beat2!, 'next');
  assert.equal(where(beat3), 'm1@2');
  // Inside the half note there is no event: the next beat is the next position.
  const beat4 = chordNeighbour(core, beat3!, 'next');
  assert.equal(where(beat4), 'm1@3');
  assert.equal(beat4!.coreEntityId, null);
  assert.equal(where(chordNeighbour(core, beat4!, 'next')), 'm2@0');
  assert.equal(where(chordNeighbour(core, beat4!, 'previous')), 'm1@2');
});

test('K6: Tab moves by bar, Cmd+number by a note value', () => {
  assert.equal(where(chordNeighbour(core, start, 'nextBar')), 'm2@0');
  assert.equal(where(chordNeighbour(core, { ...start, measureNumber: 2 }, 'previousBar')), 'm1@0');
  assert.equal(chordNeighbour(core, start, 'previousBar'), null);
  assert.equal(where(chordNeighbour(core, start, { value: '2' })), 'm1@2', 'a half note on');
  assert.equal(where(chordNeighbour(core, { ...start, timestampNum: 8 }, { value: '2' })), 'm2@0', 'over the barline');
  assert.equal(where(chordNeighbour(core, { ...start, timestampNum: 2 }, 'nextBeat')), 'm1@1');
  assert.equal(where(chordNeighbour(core, { ...start, timestampNum: 6 }, 'previousBeat')), 'm1@1');
});

test('K5: a hairpin over a note stops where the note ends', () => {
  const half = lyricNeighbour(core, start, 1)!;
  assert.deepEqual(endOfEvent(core, half), { measureNumber: 1, timestampNum: 16, timestampDen: 16 }, 'the end of the bar');
  assert.deepEqual(endOfEvent(core, { ...start, coreEntityId: null }), { measureNumber: 1, timestampNum: 4, timestampDen: 16 });
});

test('K4: a new lyric entry starts in the first verse the note does not have', () => {
  const first = core.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events[0]!;
  assert.equal(firstFreeVerse(core, first.id), 1);
  const withVerse = { ...core, lyricLines: [{ id: 'l1', verseNumber: 1, eventId: first.id, text: 'la', syllabic: 'single' as const }] };
  assert.equal(firstFreeVerse(withVerse, first.id), 2);
});
