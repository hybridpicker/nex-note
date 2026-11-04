import test from 'node:test';
import assert from 'node:assert/strict';

import { importMusicXmlToCore } from '../src/musicxml-adapter/import/import-musicxml.ts';
import { clickFirstEvent, mountEditor } from './support/entry-harness.ts';
import { TREBLE, scoreXml } from './support/entry-fixtures.ts';

/*
 * In MuseScore the note just entered is selected while the input cursor sits after it, so the
 * articulation, grace, respell and stem keys act on that note. nex-note's selection is the cursor
 * slot; in note input these keys now act on the last entered note and the cursor stays put
 * (iteration 23).
 */

function marks(xml: string) {
  const core = importMusicXmlToCore(xml);
  const graceIds = new Set(core.graceNotes.map((grace) => grace.eventId));
  return core.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events.map((event) => {
    const quarters = (event.timestampNum / event.timestampDen) * 4;
    if (event.kind !== 'note') return `${quarters}:r`;
    const accidental = event.pitch.alter === 1 ? '#' : event.pitch.alter === -1 ? 'b' : '';
    const flags = [
      ...(event.articulations ?? []),
      graceIds.has(event.id) ? 'grace' : '',
      event.stem && event.stem !== 'none' ? `stem-${event.stem}` : '',
    ].filter(Boolean);
    return `${quarters}:${event.pitch.step}${accidental}${event.pitch.octave}${flags.length ? `[${flags.join('+')}]` : ''}`;
  });
}

function run(script: string) {
  const harness = mountEditor(scoreXml({ beats: 4, beatType: 4, measures: 1, parts: [TREBLE] }));
  clickFirstEvent(harness, {});
  harness.press(script);
  harness.rerender();
  const result = { marks: marks(harness.xml), cursor: harness.current.selectedNote };
  harness.unmount();
  return result;
}

test('an accent typed after a note marks that note, and the next letter goes to the next slot', () => {
  const result = run('N 5 c Shift+. d');
  assert.deepEqual(result.marks, ['0:C5[accent]', '1:D5', '2:r']);
});

test('staccato after two notes marks the second note, not the following rest', () => {
  const result = run('N 5 c d Shift+s');
  assert.deepEqual(result.marks, ['0:C5', '1:D5[staccato]', '2:r']);
  assert.equal(result.cursor?.isRest, true);
  assert.equal(result.cursor?.timestampNum, 8);
});

test('a grace note typed after a note is placed before that note', () => {
  const result = run('N 5 c / d');
  assert.deepEqual(result.marks, ['0:C5[grace]', '0:C5', '1:D5', '2:r']);
});

test('J respells the note just entered', () => {
  const result = run('N 5 + c j');
  assert.deepEqual(result.marks, ['0:Db5', '1:r', '2:r']);
});

test('X flips the stem of the note just entered', () => {
  const result = run('N 5 c x');
  assert.equal(result.marks[0]!.startsWith('0:C5[stem-'), true, result.marks.join(' '));
  assert.equal(result.marks[1], '1:r');
});
