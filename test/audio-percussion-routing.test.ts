import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { Midi } from '@tonejs/midi';

import { parsePlaybackMidi, resolvePlaybackTrackPart, usePlayback } from '../hooks/usePlayback.ts';
import { buildFallbackMidiFromMusicXml } from '../lib/midi-export.ts';
import { MASTER_GAIN } from '../lib/playback-dynamics.ts';
import { buildDocumentState } from '../src/score-core/commands/apply-document-commands.ts';
import { FakeAudioBuffer, FakeAudioContext, type FakeNode } from './support/audio-fake-context.ts';

const ATTRIBUTES = (clef: string) => `<attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time>${clef}</attributes>`;
const pitched = (step: string, octave: number) => `<note><pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>2</duration><voice>1</voice><type>half</type></note>`;
const drum = (step: string, octave: number, instrument: string) => `<note><unpitched><display-step>${step}</display-step><display-octave>${octave}</display-octave></unpitched><duration>1</duration><instrument id="${instrument}"/><voice>1</voice><type>quarter</type></note>`;

// Violin I, a drum set, Violin II: the drum part makes a third (percussion) track, and the two
// violin names contain each other.
const XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0"><part-list>
<score-part id="P1"><part-name>Violin I</part-name></score-part>
<score-part id="P2"><part-name>Drum Set</part-name><score-instrument id="P2-I36"><instrument-name>Bass Drum</instrument-name></score-instrument><score-instrument id="P2-I39"><instrument-name>Snare</instrument-name></score-instrument></score-part>
<score-part id="P3"><part-name>Violin II</part-name></score-part>
</part-list>
<part id="P1"><measure number="1">${ATTRIBUTES('<clef><sign>G</sign><line>2</line></clef>')}
<direction><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>120</per-minute></metronome></direction-type><sound tempo="120"/></direction>
${pitched('E', 5)}${pitched('F', 5)}</measure></part>
<part id="P2"><measure number="1">${ATTRIBUTES('<clef><sign>percussion</sign></clef>')}
${drum('F', 4, 'P2-I36')}${drum('C', 5, 'P2-I39')}${drum('F', 4, 'P2-I36')}${drum('C', 5, 'P2-I39')}</measure></part>
<part id="P3"><measure number="1">${ATTRIBUTES('<clef><sign>G</sign><line>2</line></clef>')}
${pitched('C', 5)}${pitched('D', 5)}</measure></part>
</score-partwise>`;

function setup() {
  const coreDocument = buildDocumentState(XML).coreDocument;
  assert.ok(coreDocument);
  const [violin1, drums, violin2] = coreDocument.score.parts;
  return { coreDocument, violin1: violin1!, drums: drums!, violin2: violin2! };
}

test('with a drum part between two violins, every MIDI track resolves to its own part', () => {
  const { coreDocument, violin1, drums, violin2 } = setup();
  const midi = new Midi(buildFallbackMidiFromMusicXml(XML).data);
  assert.equal(midi.tracks.length, 3);
  const resolved = midi.tracks.map((track, index) => resolvePlaybackTrackPart(track, coreDocument, index, midi.tracks.length)?.id);
  assert.deepEqual(resolved, [violin1.id, drums.id, violin2.id]);

  const { parsed } = parsePlaybackMidi(midi, coreDocument);
  const byPart = (partId: string) => parsed.notes.filter((note) => note.partId === partId);
  assert.deepEqual(byPart(violin1.id).map((note) => note.midi), [76, 77]);
  assert.deepEqual(byPart(violin2.id).map((note) => note.midi), [72, 74]);
  assert.deepEqual(byPart(drums.id).map((note) => note.midi), [36, 38, 36, 38], 'kick and snare keys');
  assert.ok(byPart(drums.id).every((note) => note.percussion), 'drum notes are percussion');
  assert.ok(parsed.notes.filter((note) => note.partId !== drums.id).every((note) => !note.percussion));
  assert.ok(byPart(violin1.id).every((note) => note.soundfont === 'violin'));
});

test('name matching prefers the exact name: "Violin II" is not taken for "Violin I"', () => {
  const { coreDocument, violin1, violin2, drums } = setup();
  const track = (name: string, percussion = false) => ({ name, channel: percussion ? 9 : 0, instrument: { number: 40, percussion } });
  // Four tracks for three parts: positional mapping cannot be used, names decide.
  assert.equal(resolvePlaybackTrackPart(track('Violin II'), coreDocument, 0, 4)?.id, violin2.id);
  assert.equal(resolvePlaybackTrackPart(track('Violin I'), coreDocument, 1, 4)?.id, violin1.id);
  assert.equal(resolvePlaybackTrackPart(track('Violin II staff 1'), coreDocument, 2, 4)?.id, violin2.id);
  assert.equal(resolvePlaybackTrackPart(track('Percussion', true), coreDocument, 3, 4)?.id, drums.id, 'an unnamed percussion track belongs to the drum part');
});

class HookAudioContext extends FakeAudioContext {
  baseLatency = 0;
  outputLatency = 0;
  constructor() { super(); this.currentTime = 20; contexts.push(this); }
  async resume() {}
  async close() { this.state = 'closed'; }
  async decodeAudioData() { return new FakeAudioBuffer(1, 8, this.sampleRate); }
}
const contexts: HookAudioContext[] = [];

test('mixer volume and mute reach the right part bus, and the drum track plays on the synthesized kit', async () => {
  const { coreDocument, violin1, drums, violin2 } = setup();
  const replacements: Record<string, unknown> = { IS_REACT_ACT_ENVIRONMENT: true, cancelAnimationFrame() {}, AudioContext: HookAudioContext };
  const original = Object.fromEntries(Object.keys(replacements).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(replacements)) Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  let api!: ReturnType<typeof usePlayback>;
  function Harness() { api = usePlayback({ coreDocument }); return null; }
  let root!: ReturnType<typeof create>;
  try {
    act(() => { root = create(React.createElement(Harness)); });
    act(() => api.setMixer({
      [violin1.id]: { volume: 0.5, mute: false, solo: false },
      [violin2.id]: { volume: 1, mute: true, solo: false },
    }));
    await act(async () => { assert.equal(await api.loadMidi(XML), true); });
    // No soundfonts can load here, so the violins play the oscillator fallback (still routed per part).
    await act(async () => { assert.equal(await api.play(), true); });
    const ac = contexts.at(-1)!;
    const master = ac.nodes.find((node) => node.kind === 'gain' && node.gain.value === MASTER_GAIN && node.outputs[0]?.kind === 'gain' && node.outputs[0].outputs[0]?.kind === 'gain')!;
    const partBuses = ac.nodes.filter((node) => node.kind === 'gain' && node.outputs.some((output) => output.kind === 'panner'));
    const busOf = (node: FakeNode): FakeNode | undefined => {
      if (partBuses.includes(node)) return node;
      for (const output of node.outputs) {
        const found = busOf(output);
        if (found) return found;
      }
      return undefined;
    };
    assert.ok(master);

    // The opening window holds the first violin I note and the first drum hit (both at the start).
    const oscillators = ac.nodes.filter((node) => node.kind === 'oscillator');
    const violinVoices = oscillators.filter((node) => node.type === 'triangle');
    assert.equal(violinVoices.length, 1, 'only the unmuted violin sounds; the muted violin II is not scheduled');
    const violinBus = busOf(violinVoices[0]!)!;
    assert.equal(violinBus.gain.value, 0.5, 'violin I bus carries its mixer volume');

    const drumSources = ac.nodes.filter((node) => (node.kind === 'source' && node.started.length > 0) || (node.kind === 'oscillator' && node.type === 'sine'));
    assert.ok(drumSources.length >= 2, 'the kick plays synthesized layers (sine sweep and click noise)');
    assert.ok(ac.nodes.some((node) => node.kind === 'biquad'), 'drum layers are filtered');
    const drumBus = busOf(drumSources[0]!)!;
    assert.ok(drumBus && drumBus !== violinBus, 'the drum hit plays through the drum part bus');
    assert.equal(drumBus.gain.value, 1);
    drumSources.forEach((source) => assert.equal(source.started[0], 20 + 0.015, 'the hit starts exactly at the note time'));

    // Muting the drums later ramps only the drum bus.
    act(() => api.setMixer({
      [violin1.id]: { volume: 0.5, mute: false, solo: false },
      [violin2.id]: { volume: 1, mute: true, solo: false },
      [drums.id]: { volume: 1, mute: true, solo: false },
    }));
    assert.deepEqual((drumBus.gain as unknown as { events: Array<{ kind: string; value: number }> }).events.at(-1)?.value, 0);
    assert.equal((violinBus.gain as unknown as { events: unknown[] }).events.length, 0, 'violin I untouched');
    act(() => api.stop());
  } finally {
    if (root) act(() => root.unmount());
    for (const key of Object.keys(replacements)) {
      const descriptor = original[key];
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
