import test from 'node:test';
import assert from 'node:assert/strict';

import { clickFirstEvent, mountEditor, voiceSummary } from './support/entry-harness.ts';
import { BASS, TREBLE, scoreXml } from './support/entry-fixtures.ts';

/*
 * The first pitch of pitch-before-duration (M) on a rest uses the same register as step-time entry
 * (iteration 27): the preceding note in the voice, else the clef's middle line. It used to start
 * from a fixed C4, so the first D on a treble staff was D4 and on a bass staff D4 as well.
 */

function run(script: string, part: typeof TREBLE | typeof BASS = TREBLE, measures = 1) {
  const harness = mountEditor(scoreXml({ beats: 4, beatType: 4, measures, parts: [part] }));
  clickFirstEvent(harness, {});
  harness.press(script);
  harness.rerender();
  const summary = voiceSummary(harness.xml, {});
  const label = harness.current.preparedDurationPitchLabel;
  harness.unmount();
  return { summary, label };
}

test('the first M-mode letter matches step-time entry in treble clef', () => {
  assert.deepEqual(run('N M d 5 e 5').summary, ['m1@0 D5 quarter', 'm1@1 E5 quarter', 'm1@2 r half']);
  assert.deepEqual(run('N 5 d e').summary, ['m1@0 D5 quarter', 'm1@1 E5 quarter', 'm1@2 r half']);
});

test('the first M-mode letter matches step-time entry in bass clef', () => {
  const bass = { ...BASS, id: 'P1' };
  assert.deepEqual(run('N M d 5 e 5', bass).summary, ['m1@0 D3 quarter', 'm1@1 E3 quarter', 'm1@2 r half']);
  assert.deepEqual(run('N 5 d e', bass).summary, ['m1@0 D3 quarter', 'm1@1 E3 quarter', 'm1@2 r half']);
});

test('M on a rest prepares the clef middle line, and a duration alone enters it', () => {
  assert.equal(run('N M').label, 'B4');
  assert.deepEqual(run('N M 5').summary, ['m1@0 B4 quarter', 'm1@1 r quarter', 'm1@2 r half']);
  assert.equal(run('N M', { ...BASS, id: 'P1' }).label, 'D3');
});

test('M after a typed note prepares that note', () => {
  assert.equal(run('N 5 g M').label, 'G4');
  assert.deepEqual(run('N 5 g M c 5').summary, ['m1@0 G4 quarter', 'm1@1 C5 quarter', 'm1@2 r half']);
});

test('an empty voice 2 uses the clef middle line in both entry modes, not voice 1', () => {
  const voiceOne = ['C', 'D', 'E', 'F']
    .map((step) => `<note><pitch><step>${step}</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type></note>`)
    .join('');
  const xml = scoreXml({ beats: 4, beatType: 4, measures: 1, parts: [{ ...TREBLE, content: { '1:1': voiceOne } }] });
  for (const script of ['N Cmd+Alt+2 5 c', 'N Cmd+Alt+2 M c 5']) {
    const harness = mountEditor(xml);
    clickFirstEvent(harness, {});
    harness.press(script);
    harness.rerender();
    assert.deepEqual(voiceSummary(harness.xml, { voice: 2 }), ['m1@0 C5 quarter', 'm1@1 r quarter', 'm1@2 r half'], script);
    assert.deepEqual(voiceSummary(harness.xml, { voice: 1 }), ['m1@0 C4 quarter', 'm1@1 D4 quarter', 'm1@2 E4 quarter', 'm1@3 F4 quarter'], script);
    harness.unmount();
  }
});

test('after a voice change each voice keeps its own register', () => {
  const harness = mountEditor(scoreXml({ beats: 4, beatType: 4, measures: 1, parts: [TREBLE] }));
  clickFirstEvent(harness, {});
  // Voice 1 goes down an octave, voice 2 starts from the clef, and voice 1 continues from its D4.
  harness.press('N 5 c Cmd+ArrowDown d Cmd+Alt+2 e Cmd+Alt+1 f');
  harness.rerender();
  assert.deepEqual(voiceSummary(harness.xml, { voice: 1 }), ['m1@0 C4 quarter', 'm1@1 D4 quarter', 'm1@2 r quarter', 'm1@3 F4 quarter']);
  assert.deepEqual(voiceSummary(harness.xml, { voice: 2 }), ['m1@0 r half', 'm1@2 E5 quarter', 'm1@3 r quarter']);
  harness.unmount();
});

test('voice 2 continues from its own note in the previous bar, not from voice 1', () => {
  const voiceOne = ['C', 'D', 'E', 'F']
    .map((step) => `<note><pitch><step>${step}</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type></note>`)
    .join('');
  const xml = scoreXml({ beats: 4, beatType: 4, measures: 2, parts: [{ ...TREBLE, content: { '1:1': voiceOne, '2:1': voiceOne } }] });
  const harness = mountEditor(xml);
  clickFirstEvent(harness, {});
  harness.press('N Cmd+Alt+2 7 a b');
  harness.rerender();
  assert.deepEqual(voiceSummary(harness.xml, { voice: 2 }), ['m1@0 A4 whole', 'm2@0 B4 whole']);
  harness.unmount();
});
