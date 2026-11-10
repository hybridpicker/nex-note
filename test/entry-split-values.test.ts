import test from 'node:test';
import assert from 'node:assert/strict';

import { clickFirstEvent, documentIssues, mountEditor, voiceSummary } from './support/entry-harness.ts';
import { BASS, CLARINET_BB, PIANO, TREBLE, scoreXml } from './support/entry-fixtures.ts';

/*
 * Values the rhythm speller writes as several notes or rests (iteration 25). An off-beat quarter
 * becomes two tied eighths, a quarter rest after an eighth two eighth rests, a 16th that crosses
 * a beat a tied pair of 16ths. The input cursor used to move to the entered value's own tail, so
 * the next entry overwrote it: "4 c 5 d e" gave an eighth D and put E on beat 2. MuseScore keeps
 * the whole value and continues after it. Summary format: m<bar>@<onset in quarters>, ~ = tie.
 */

const quarters = (octave: number, voice = 1) => ['C', 'D', 'E', 'F']
  .map((step) => `<note><pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>4</duration><voice>${voice}</voice><type>quarter</type></note>`)
  .join('');

function enter(
  xml: string,
  script: string,
  where: { partIndex?: number; staff?: number; voice?: number } = {},
  show: Array<{ partIndex?: number; staff?: number; voice?: number }> = [where],
) {
  const harness = mountEditor(xml);
  clickFirstEvent(harness, where);
  const before = harness.batches.length;
  harness.press(script);
  harness.rerender();
  const result = {
    voices: show.map((lane) => voiceSummary(harness.xml, lane)),
    batches: harness.batches.length - before,
    issues: documentIssues(harness.xml).map((issue) => issue.code),
  };
  harness.unmount();
  return result;
}

const oneBar = (beats = 4, beatType = 4, measures = 1) => scoreXml({ beats, beatType, measures, parts: [TREBLE] });

test('an off-beat quarter keeps both tied eighths and the next note follows it', () => {
  const result = enter(oneBar(), 'N 4 c 5 d e');
  assert.deepEqual(result.voices[0], [
    'm1@0 C5 eighth', 'm1@0.5 D5 eighth~', 'm1@1 D5 eighth', 'm1@1.5 E5 eighth~', 'm1@2 E5 eighth',
    'm1@2.5 r eighth', 'm1@3 r quarter',
  ]);
  assert.equal(result.batches, 3);
  assert.deepEqual(result.issues, []);
});

test('an off-beat half and the next half crossing the barline keep their full length', () => {
  const result = enter(oneBar(4, 4, 2), 'N 4 c 6 d e');
  assert.deepEqual(result.voices[0], [
    'm1@0 C5 eighth', 'm1@0.5 D5 eighth~', 'm1@1 D5 quarter~', 'm1@2 D5 eighth', 'm1@2.5 E5 eighth~', 'm1@3 E5 quarter~',
    'm2@0 E5 eighth', 'm2@0.5 r eighth', 'm2@1 r quarter', 'm2@2 r half',
  ]);
  assert.deepEqual(result.issues, []);
});

test('an eighth that crosses a beat after a dotted rhythm keeps its tied 16th', () => {
  const result = enter(oneBar(), 'N 3 c 4 d e f');
  assert.deepEqual(result.voices[0], [
    'm1@0 C5 16th', 'm1@0.25 D5 eighth', 'm1@0.75 E5 16th~', 'm1@1 E5 16th', 'm1@1.25 F5 eighth', 'm1@1.75 r 16th', 'm1@2 r half',
  ]);
});

test('a quarter after a 16th is a tied dotted eighth and 16th, not a shortened dotted eighth', () => {
  const result = enter(oneBar(), 'N 3 c 5 d e');
  assert.deepEqual(result.voices[0], [
    'm1@0 C5 16th', 'm1@0.25 D5 eighth.~', 'm1@1 D5 16th', 'm1@1.25 E5 eighth.~', 'm1@2 E5 16th', 'm1@2.25 r eighth.', 'm1@3 r quarter',
  ]);
});

test('an off-beat dotted quarter keeps its tied quarter', () => {
  const result = enter(oneBar(), 'N 4 c 5 . d e');
  assert.deepEqual(result.voices[0], ['m1@0 C5 eighth', 'm1@0.5 D5 eighth~', 'm1@1 D5 quarter', 'm1@2 E5 quarter.', 'm1@3.5 r eighth']);
});

test('an off-beat quarter rest keeps both eighth rests and the next note follows it', () => {
  const result = enter(oneBar(), 'N 4 c 5 0 d');
  assert.deepEqual(result.voices[0], [
    'm1@0 C5 eighth', 'm1@0.5 r eighth', 'm1@1 r eighth', 'm1@1.5 D5 eighth~', 'm1@2 D5 eighth', 'm1@2.5 r eighth', 'm1@3 r quarter',
  ]);
});

test('an off-beat dotted quarter rest keeps its full length', () => {
  const result = enter(oneBar(), 'N 4 c 5 . 0 d');
  assert.deepEqual(result.voices[0], ['m1@0 C5 eighth', 'm1@0.5 r eighth', 'm1@1 r quarter', 'm1@2 D5 quarter.', 'm1@3.5 r eighth']);
});

test('after a 16th triplet an off-beat quarter keeps its tied eighth', () => {
  const result = enter(oneBar(), 'N 4 Cmd+3 c d e 5 f g');
  assert.deepEqual(result.voices[0], [
    'm1@0 C5 16th', 'm1@0.167 D5 16th', 'm1@0.333 E5 16th', 'm1@0.5 F5 eighth~', 'm1@1 F5 eighth', 'm1@1.5 G5 eighth~', 'm1@2 G5 eighth',
    'm1@2.5 r eighth', 'm1@3 r quarter',
  ]);
});

test('eighth triplet members still advance one slot at a time', () => {
  const result = enter(oneBar(), 'N 5 Cmd+3 c d e 5 f g');
  assert.deepEqual(result.voices[0], ['m1@0 C5 eighth', 'm1@0.333 D5 eighth', 'm1@0.667 E5 eighth', 'm1@1 F5 quarter', 'm1@2 G5 quarter', 'm1@3 r quarter']);
});

test('a note split at the barline continues after its tied tail in the next bar', () => {
  const result = enter(oneBar(4, 4, 2), 'N 5 c d e 4 f 6 g a');
  assert.deepEqual(result.voices[0], [
    'm1@0 C5 quarter', 'm1@1 D5 quarter', 'm1@2 E5 quarter', 'm1@3 F5 eighth', 'm1@3.5 G5 eighth~',
    'm2@0 G5 quarter.', 'm2@1.5 A5 eighth~', 'm2@2 A5 quarter~', 'm2@3 A5 eighth', 'm2@3.5 r eighth',
  ]);
});

test('voice 2 eighths and off-beat quarters under voice 1 quarters', () => {
  const xml = scoreXml({ beats: 4, beatType: 4, measures: 1, parts: [{ ...TREBLE, content: { '1:1': quarters(5) } }] });
  const result = enter(xml, 'N Cmd+Alt+2 4 c 5 d e', {}, [{ voice: 1 }, { voice: 2 }]);
  assert.deepEqual(result.voices[0], ['m1@0 C5 quarter', 'm1@1 D5 quarter', 'm1@2 E5 quarter', 'm1@3 F5 quarter']);
  assert.deepEqual(result.voices[1], [
    'm1@0 C5 eighth', 'm1@0.5 D5 eighth~', 'm1@1 D5 eighth', 'm1@1.5 E5 eighth~', 'm1@2 E5 eighth', 'm1@2.5 r eighth', 'm1@3 r quarter',
  ]);
  assert.deepEqual(result.issues, []);
});

test('piano left hand (stored voice 5) sixteenths and eighths across beats', () => {
  const xml = scoreXml({ beats: 4, beatType: 4, measures: 1, parts: [PIANO] });
  const result = enter(xml, 'N 3 c 4 d e f 0', { staff: 2, voice: 5 }, [{ staff: 2, voice: 5 }, { staff: 1 }]);
  assert.deepEqual(result.voices[0], [
    // The rest after F is split at beat 3, as the document model has always held it; the stored XML
    // used to show one eighth rest across the beat until the next edit rewrote it (F12).
    'm1@0 C3 16th', 'm1@0.25 D3 eighth', 'm1@0.75 E3 16th~', 'm1@1 E3 16th', 'm1@1.25 F3 eighth', 'm1@1.75 r 16th',
    'm1@2 r 16th', 'm1@2.25 r eighth.', 'm1@3 r quarter',
  ]);
  assert.deepEqual(result.voices[1], ['m1@0 r whole']);
});

test('a transposing middle part keeps off-beat values and leaves the other parts alone', () => {
  const xml = scoreXml({ beats: 4, beatType: 4, measures: 1, parts: [TREBLE, CLARINET_BB, { ...BASS, id: 'P3' }] });
  const result = enter(xml, 'N 4 c 5 + f g', { partIndex: 1 }, [{ partIndex: 0 }, { partIndex: 1 }, { partIndex: 2 }]);
  assert.deepEqual(result.voices[0], ['m1@0 r whole']);
  assert.deepEqual(result.voices[1], [
    'm1@0 C5 eighth', 'm1@0.5 F#5 eighth~', 'm1@1 F#5 eighth', 'm1@1.5 G5 eighth~', 'm1@2 G5 eighth', 'm1@2.5 r eighth', 'm1@3 r quarter',
  ]);
  assert.deepEqual(result.voices[2], ['m1@0 r whole']);
});

test('3/4: an off-beat half and a quarter crossing the barline', () => {
  const result = enter(oneBar(3, 4, 2), 'N 4 c 6 d 5 e');
  assert.deepEqual(result.voices[0], [
    'm1@0 C5 eighth', 'm1@0.5 D5 eighth~', 'm1@1 D5 quarter~', 'm1@2 D5 eighth', 'm1@2.5 E5 eighth~',
    'm2@0 E5 eighth', 'm2@0.5 r eighth', 'm2@1 r quarter', 'm2@2 r quarter',
  ]);
});

test('6/8: quarter inside the beat, dotted quarter crossing the barline', () => {
  const result = enter(oneBar(6, 8, 2), 'N 4 c 5 d 4 e 5 . f');
  assert.deepEqual(result.voices[0], [
    'm1@0 C5 eighth', 'm1@0.5 D5 quarter', 'm1@1.5 E5 eighth', 'm1@2 F5 quarter~',
    'm2@0 F5 eighth', 'm2@0.5 r eighth', 'm2@1 r quarter', 'm2@2 r quarter',
  ]);
});

test('pitch-before-duration (M) advances past the whole entered value', () => {
  const result = enter(oneBar(), 'N M d 4 e 5 f 5');
  // Onsets and values only: the register of the first M-mode pitch is tracked separately.
  assert.deepEqual(result.voices[0].map((entry) => entry.replace(/ ([A-G][#b]?)\d/, ' $1')), [
    'm1@0 D eighth', 'm1@0.5 E eighth~', 'm1@1 E eighth', 'm1@1.5 F eighth~', 'm1@2 F eighth', 'm1@2.5 r eighth', 'm1@3 r quarter',
  ]);
});
