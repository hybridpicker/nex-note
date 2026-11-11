import assert from 'node:assert/strict';
import test from 'node:test';

import { lyricSyllabic, parseClefText, parseInlineEntry, parseKeyText, parseTempoText, parseTimeText, resolveInlineEntryShortcut } from '../src/score-input/inline-entry.ts';

const anchor = { measureNumber: 9, staffIndex: 1, voiceId: 1, timestampNum: 1, timestampDen: 4, corePartId: 'part:P1' };
const range = { anchor, rangeEnd: { ...anchor, measureNumber: 10 }, rangeStop: { measureNumber: 11, timestampNum: 0, timestampDen: 1 } };

function commands(kind: Parameters<typeof parseInlineEntry>[0], text: string, context = range) {
  const result = parseInlineEntry(kind, text, context);
  assert.ok(result.ok, `${kind} "${text}": ${result.ok ? '' : result.message}`);
  return result.commands as unknown as Array<Record<string, unknown>>;
}

test('K5: keys are typed by name or by number of accidentals', () => {
  assert.equal(parseKeyText('D')?.fifths, 2);
  assert.equal(parseKeyText('Bb')?.fifths, -2);
  assert.equal(parseKeyText('f#m')?.fifths, 3);
  assert.equal(parseKeyText('a')?.fifths, 0);
  assert.equal(parseKeyText('A')?.fifths, 3);
  assert.equal(parseKeyText('Eb minor')?.fifths, -6);
  assert.equal(parseKeyText('3b')?.fifths, -3);
  assert.equal(parseKeyText('2#')?.fifths, 2);
  assert.equal(parseKeyText('0')?.fifths, 0);
  assert.equal(parseKeyText('H'), null);
  assert.equal(parseKeyText('3'), null, 'a count needs its accidental');
  assert.deepEqual(commands('key', 'D'), [{ type: 'setKey', fifths: 2, measureNumber: 9 }]);
});

test('K5: time signatures, clefs and tempo marks', () => {
  assert.deepEqual(parseTimeText('3/4'), { beats: 3, beatType: 4 });
  assert.deepEqual(parseTimeText('c'), { beats: 4, beatType: 4 });
  assert.deepEqual(parseTimeText('3+2/8'), { beats: 5, beatType: 8, beatGroups: [3, 2] });
  assert.equal(parseTimeText('3/5'), null);
  assert.deepEqual(parseClefText('bass'), { sign: 'F', line: 4, name: 'Bass clef' });
  assert.deepEqual(parseClefText('Tenor'), { sign: 'C', line: 4, name: 'Tenor clef' });
  assert.equal(parseClefText('soprano'), null);
  assert.deepEqual(parseTempoText('Allegro'), { text: 'Allegro' });
  assert.deepEqual(parseTempoText('q=96'), { text: '♩ = 96', bpm: 96 });
  assert.deepEqual(parseTempoText('Andante q=72'), { text: 'Andante ♩ = 72', bpm: 72 });
  assert.equal(commands('clef', 'bass')[0]!.measureNumber, 9);
  assert.equal(commands('time', '6/8')[0]!.beats, 6);
});

test('K5: dynamics and hairpins', () => {
  assert.deepEqual(commands('dynamic', 'mf')[0], { type: 'addDynamic', ...anchor, dynamic: 'mf', placement: 'below' });
  const hairpin = commands('dynamic', '<')[0]!;
  assert.equal(hairpin.type, 'addWedge');
  assert.equal(hairpin.kind, 'crescendo');
  assert.equal(hairpin.startMeasureNumber, 9);
  assert.equal(hairpin.stopMeasureNumber, 11);
  assert.equal(commands('dynamic', 'dim')[0]!.kind, 'diminuendo');
  const wrong = parseInlineEntry('dynamic', 'loud', range);
  assert.equal(wrong.ok, false);
  assert.match(wrong.ok ? '' : wrong.message, /not a dynamic/);
});

test('K5: repeats, barlines and endings cover the selected bars', () => {
  assert.deepEqual(commands('repeat', '|:'), [{ type: 'addStartRepeat', measureNumber: 9 }]);
  assert.deepEqual(commands('repeat', ':|'), [{ type: 'addEndRepeat', measureNumber: 10 }]);
  assert.deepEqual(commands('repeat', '||'), [{ type: 'setBarline', measureNumber: 10, barline: 'light-light' }]);
  assert.deepEqual(commands('repeat', '1.'), [
    { type: 'setEnding', measureNumber: 9, number: '1', endingType: 'start' },
    { type: 'setEnding', measureNumber: 10, number: '1', endingType: 'stop' },
  ]);
  assert.equal(parseInlineEntry('repeat', 'da capo', range).ok, false);
});

test('K5: lines span the selection; text kinds keep what was typed', () => {
  assert.equal(commands('line', '8va')[0]!.type, 'addOttava');
  assert.equal(commands('line', 'ped')[0]!.type, 'addPedalSpan');
  assert.equal(parseInlineEntry('line', '8va', { anchor }).ok, false, 'no range and no stop position');
  assert.equal(commands('staffText', 'pizz.')[0]!.text, 'pizz.');
  assert.equal(commands('rehearsal', 'A')[0]!.type, 'addRehearsalMark');
  assert.equal(commands('tempo', 'Allegro q=120')[0]!.bpm, 120);
  assert.equal(parseInlineEntry('staffText', '   ', range).ok, false);
});

test('K4: syllables are single, begin, middle or end by the hyphens around them', () => {
  assert.equal(lyricSyllabic(false, false), 'single');
  assert.equal(lyricSyllabic(false, true), 'begin');
  assert.equal(lyricSyllabic(true, true), 'middle');
  assert.equal(lyricSyllabic(true, false), 'end');
});

test('K4 to K6: the keys that open the popover', () => {
  const key = (modifiers: string, letter: string) => resolveInlineEntryShortcut({
    metaKey: modifiers.includes('Cmd'), ctrlKey: false, altKey: modifiers.includes('Alt'), shiftKey: modifiers.includes('Shift'),
  }, letter);
  assert.equal(key('Cmd', 'L'), 'lyrics');
  assert.equal(key('Cmd', 'K'), 'chord');
  assert.equal(key('Cmd', 'D'), null, 'Cmd+D stays Duplicate');
  assert.equal(key('Alt+Shift', 'D'), 'dynamic');
  assert.equal(key('Cmd', 'T'), 'staffText');
  assert.equal(key('Cmd+Shift', 'T'), 'systemText');
  assert.equal(key('Cmd', 'E'), 'expression');
  assert.equal(key('Cmd', 'M'), 'rehearsal');
  assert.equal(key('Alt+Shift', 'T'), 'tempo');
  assert.equal(key('Alt+Shift', 'K'), 'key');
  assert.equal(key('Alt+Shift', 'M'), 'time');
  assert.equal(key('Alt+Shift', 'C'), 'clef');
  assert.equal(key('Alt+Shift', 'R'), 'repeat');
  assert.equal(key('Alt+Shift', 'O'), 'line');
  assert.equal(key('', 'L'), null);
  assert.equal(key('Cmd+Shift', 'K'), null);
  assert.equal(key('Alt', 'K'), null);
});
