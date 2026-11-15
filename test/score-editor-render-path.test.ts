import test from 'node:test';
import assert from 'node:assert/strict';

import { musicXmlHasTabClef } from '../components/ScoreEditor.tsx';
import { createNewScoreXml } from '../lib/new-score.ts';

function blankScore(instrumentIds: string[]) {
  return createNewScoreXml({
    instrumentIds,
    title: 'Render path',
    subtitle: '',
    composer: '',
    lyricist: '',
    copyright: '',
    keySignatureId: 'c-major',
    timeBeats: 4,
    timeBeatType: 4,
    tempo: { bpm: 120, beatUnit: 'quarter', showMarking: false },
    measureCount: 2,
    pickup: { enabled: false, beats: 1, beatType: 4 },
  });
}

test('the TAB clef pass runs for a score with a TAB staff', () => {
  assert.equal(musicXmlHasTabClef(blankScore(['guitar-tab'])), true);
  assert.equal(musicXmlHasTabClef('<clef number="2"><sign> tab </sign><line>5</line></clef>'), true);
});

test('the TAB clef pass is skipped for a score without a TAB staff', () => {
  assert.equal(musicXmlHasTabClef(blankScore(['piano'])), false);
  assert.equal(musicXmlHasTabClef('<clef><sign>G</sign><line>2</line></clef><words>TAB</words>'), false);
});
