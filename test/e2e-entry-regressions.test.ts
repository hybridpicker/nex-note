import test from 'node:test';
import assert from 'node:assert/strict';

import { playbackHighlightLeadMs, pointerMapsDescribeDocument } from '../components/ScoreEditor.tsx';
import { mountEditor, voiceSummary } from './support/entry-harness.ts';
import { scoreXml, TREBLE } from './support/entry-fixtures.ts';

/*
 * Regressions behind the end-to-end failures of wave 2 (agent e2e-entry), reduced to what can be
 * checked without a browser. The browser tests are named in each case.
 */

test('the pointer maps serve the mouse only while the drawing on screen is of the newest document', () => {
  // e2e/app.spec.ts "keeps ghost noteheads horizontally locked after placing a note" and the mouse
  // corpus: after an entry or an Undo the editor holds the drawing of the score before it until
  // the new document arrives (one deferred render) and is drawn. A preview or click resolved on it
  // belongs to a score that no longer exists.
  assert.equal(pointerMapsDescribeDocument(4, 4), true);
  assert.equal(pointerMapsDescribeDocument(4, 5), false, 'the entry is committed, its drawing is not on screen');
  assert.equal(pointerMapsDescribeDocument(-1, 5), false, 'the score is being drawn');
  assert.equal(pointerMapsDescribeDocument(5, 5), true, 'the drawing of the entry has landed');
  // Without the app's revision (a host that does not pass it) the editor's document is newest.
  assert.equal(pointerMapsDescribeDocument(3, undefined), true);
  assert.equal(pointerMapsDescribeDocument(3, null), true);
});

test('the played-note highlight reads the transport half a frame past the frame on screen', () => {
  // e2e/playback-sync.spec.ts: the highlight changes on whole frames, so read at the playhead time
  // (frame + one interval) it was 0 to 1 frame late; 1.5 intervals centre it on the onset.
  assert.equal(playbackHighlightLeadMs(1000 / 60), 25);
  assert.equal(playbackHighlightLeadMs(8), 12);
});

test('a note value key clears the augmentation dot in note input (real-score stress, m4 of Dunhill)', () => {
  // e2e/real-score-stress.spec.ts kept its own record of the dot and pressed `.` again after the
  // eighth key, which armed a dotted eighth that does not fit after a dotted quarter in 2/4. The
  // rule (commit 08c14c4, MuseScore `NoteInput::setDuration`) is that the value key clears it.
  const harness = mountEditor(scoreXml({ beats: 2, beatType: 4, measures: 1, parts: [{ ...TREBLE }] }));
  harness.press('N 5 .');
  assert.equal(harness.current.isDotted, true);
  harness.press('g');
  harness.press('4');
  assert.equal(harness.current.isDotted, false, 'the eighth key clears the dot');
  assert.equal(harness.current.selectedDuration, '8');
  harness.press('e');
  const lines = voiceSummary(harness.xml, { staff: 1, voice: 1 });
  assert.equal(lines.filter((line) => !/rest/.test(line)).length, 2, JSON.stringify(lines));
  assert.ok(lines.some((line) => /G\d/.test(line) && /quarter\./.test(line)), JSON.stringify(lines));
  assert.ok(lines.some((line) => /E\d/.test(line) && /eighth(?!\.)/.test(line)), JSON.stringify(lines));
  harness.unmount();
});
