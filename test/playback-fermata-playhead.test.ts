import assert from 'node:assert/strict';
import test from 'node:test';
import { Midi } from '@tonejs/midi';

import { parsePlaybackMidi, playbackTimelineFor, resolveRenderedMeasureBeatRanges } from '../hooks/usePlayback.ts';
import { buildFallbackMidiFromMusicXml } from '../lib/midi-export.ts';
import { buildDocumentState } from '../src/score-core/commands/apply-document-commands.ts';

// Two 4/4 measures of quarters at 120 bpm; a fermata on beat 2 of measure 1 (D4), then six notes.
const note = (step: string, extra = '') => `<note><pitch><step>${step}</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type>${extra}</note>`;
const XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Flute</part-name></score-part></part-list>
<part id="P1">
<measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
<direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>120</per-minute></metronome></direction-type><sound tempo="120"/></direction>
${note('C')}${note('D', '<notations><fermata/></notations>')}${note('E')}${note('F')}</measure>
<measure number="2">${note('G')}${note('A')}${note('B')}${note('C')}</measure>
</part></score-partwise>`;

// Written position of every note: [measure, position in whole notes].
const WRITTEN = [[1, 0], [1, 0.25], [1, 0.5], [1, 0.75], [2, 0], [2, 0.25], [2, 0.5], [2, 0.75]];

function timelineFor(midi: Midi) {
  const coreDocument = buildDocumentState(XML).coreDocument;
  assert.ok(coreDocument);
  const { parsed } = parsePlaybackMidi(midi, coreDocument);
  return { parsed, timeline: playbackTimelineFor(parsed, resolveRenderedMeasureBeatRanges(coreDocument, parsed)) };
}

function assertPlayheadOnEveryOnset(midi: Midi, label: string) {
  const { parsed, timeline } = timelineFor(midi);
  assert.equal(parsed.notes.length, WRITTEN.length);
  parsed.notes.forEach((entry, index) => {
    // A frame drawn 1 ms after the note is heard shows the note being heard.
    const location = timeline.locate(entry.time + 0.001);
    const [measure, wholes] = WRITTEN[index]!;
    assert.equal(location.measureNumber, measure, `${label}: note ${index} measure`);
    assert.ok(Math.abs(location.positionWholes - wholes!) < 0.002, `${label}: note ${index} at ${entry.time.toFixed(3)} s is located at ${location.positionWholes.toFixed(4)}, written ${wholes}`);
  });
  return { parsed, timeline };
}

test('the fallback renderer holds the fermata at half tempo and the playhead follows the MIDI tempo map', () => {
  const midi = new Midi(buildFallbackMidiFromMusicXml(XML).data);
  assert.deepEqual(midi.header.tempos.map((tempo) => [Number(tempo.time?.toFixed(3)), Math.round(tempo.bpm)]), [[0, 120], [0.5, 60], [1.5, 120]]);
  const { parsed, timeline } = assertPlayheadOnEveryOnset(midi, 'fallback');
  // The notes after the fermata are half a second later than the notated tempo would put them.
  assert.ok(Math.abs(parsed.notes[2]!.time - 1.5) < 1e-6);
  assert.ok(Math.abs(parsed.notes[7]!.time - 4.0) < 1e-6);
  // Half-way through the held note the playhead is half-way through it, not on the next note.
  const held = timeline.locate(1.0);
  assert.equal(held.measureNumber, 1);
  assert.ok(Math.abs(held.positionWholes - 0.375) < 0.002, `inside the fermata: ${held.positionWholes}`);
  // Metronome clicks follow the same map: beat 3 sounds after the held beat.
  const clickSeconds = timeline.clicks.map((click) => Number(click.seconds.toFixed(3)));
  assert.deepEqual(clickSeconds.slice(0, 5), [0, 0.5, 1.5, 2, 2.5]);
});

test('a MuseScore-style tempo map (restored one tick early) keeps the playhead on every onset', () => {
  // MuseScore 4.7 writes the fermata as 60 bpm at the note and 120 bpm again one tick before its end.
  const midi = new Midi();
  midi.header.tempos.push({ ticks: 0, bpm: 120 }, { ticks: 480, bpm: 60 }, { ticks: 959, bpm: 120 });
  midi.header.timeSignatures.push({ ticks: 0, timeSignature: [4, 4] });
  midi.header.update();
  const track = midi.addTrack();
  track.name = 'Flute';
  [60, 62, 64, 65, 67, 69, 71, 72].forEach((pitch, index) => track.addNote({ midi: pitch, ticks: index * 480, durationTicks: 479, velocity: 80 / 127 }));
  const roundTripped = new Midi(midi.toArray());
  assertPlayheadOnEveryOnset(roundTripped, 'MuseScore-style');
});
