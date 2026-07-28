import assert from 'node:assert/strict';
import test from 'node:test';
import { Midi } from '@tonejs/midi';
import {
  activatePlaybackAudioContext,
  loadPlaybackMidiBuffer,
} from '../hooks/usePlayback';

test('activatePlaybackAudioContext resumes suspended iPad Web Audio during the tap', async () => {
  let state: AudioContextState = 'suspended';
  let resumeCalls = 0;
  const audioContext = {
    get state() {
      return state;
    },
    async resume() {
      resumeCalls += 1;
      state = 'running';
    },
  };

  await activatePlaybackAudioContext(audioContext);
  assert.equal(resumeCalls, 1);
  assert.equal(state, 'running');
});

test('activatePlaybackAudioContext leaves an active context running', async () => {
  let resumeCalls = 0;
  await activatePlaybackAudioContext({
    state: 'running',
    async resume() {
      resumeCalls += 1;
    },
  });

  assert.equal(resumeCalls, 0);
});

test('activatePlaybackAudioContext reports a closed output', async () => {
  await assert.rejects(
    activatePlaybackAudioContext({
      state: 'closed',
      async resume() {},
    }),
    /audio output is closed/,
  );
});

test('loadPlaybackMidiBuffer creates playable MIDI when the Mac server is offline', async () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
    <score-partwise version="4.0">
      <part-list>
        <score-part id="P1"><part-name>Piano</part-name></score-part>
      </part-list>
      <part id="P1">
        <measure number="1">
          <attributes>
            <divisions>4</divisions>
            <key><fifths>0</fifths></key>
            <time><beats>4</beats><beat-type>4</beat-type></time>
            <clef><sign>G</sign><line>2</line></clef>
          </attributes>
          <note>
            <pitch><step>C</step><octave>4</octave></pitch>
            <duration>4</duration><voice>1</voice><type>quarter</type>
          </note>
        </measure>
      </part>
    </score-partwise>`;

  const payload = await loadPlaybackMidiBuffer(xml, async () => {
    throw new TypeError('Mac server is offline');
  });
  const midi = new Midi(payload.buffer);

  assert.equal(payload.renderer, 'client-fallback');
  assert.equal(midi.tracks.flatMap((track) => track.notes).length, 1);
  assert.equal(midi.tracks[0]?.notes[0]?.midi, 60);
});
