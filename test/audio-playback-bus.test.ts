import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { act, create } from 'react-test-renderer';

import { usePlayback } from '../hooks/usePlayback.ts';
import { buildDocumentState } from '../src/score-core/commands/apply-document-commands.ts';
import type { PlaybackSampleBank } from '../lib/playback-sample-bank.ts';
import { MASTER_GAIN } from '../lib/playback-dynamics.ts';
import { FakeAudioBuffer, FakeAudioContext, type FakeNode, type FakeParam } from './support/audio-fake-context.ts';

// Violin and cello, a loud whole-measure chord in each, at 120 bpm.
const XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0"><part-list>
<score-part id="P1"><part-name>Violin</part-name></score-part>
<score-part id="P2"><part-name>Violoncello</part-name></score-part>
</part-list>
${[['P1', 'G', 2, 4], ['P2', 'F', 4, 3]].map(([id, sign, line, octave]) => `<part id="${id}"><measure number="1">
<attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>${sign}</sign><line>${line}</line></clef></attributes>
<direction><direction-type><dynamics><ff/></dynamics></direction-type><sound dynamics="124"/></direction>
<direction><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>120</per-minute></metronome></direction-type><sound tempo="120"/></direction>
<note><pitch><step>C</step><octave>${octave}</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type></note>
<note><chord/><pitch><step>E</step><octave>${octave}</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type></note>
<note><chord/><pitch><step>G</step><octave>${octave}</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type></note>
</measure></part>`).join('\n')}
</score-partwise>`;

class HookAudioContext extends FakeAudioContext {
  baseLatency = 0;
  outputLatency = 0;
  constructor() { super(); this.currentTime = 50; contexts.push(this); }
  async resume() {}
  async close() { this.state = 'closed'; }
  async decodeAudioData() {
    const buffer = new FakeAudioBuffer(2, this.sampleRate, this.sampleRate);
    buffer.getChannelData(0).fill(0.3);
    buffer.getChannelData(1).fill(0.3);
    return buffer;
  }
}
const contexts: HookAudioContext[] = [];

function install() {
  const replacements: Record<string, unknown> = { IS_REACT_ACT_ENVIRONMENT: true, cancelAnimationFrame() {}, AudioContext: HookAudioContext };
  const original = Object.fromEntries(Object.keys(replacements).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(replacements)) Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  return () => {
    for (const key of Object.keys(replacements)) {
      const descriptor = original[key];
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  };
}

const samples = (octave: number, prefix: string) => Object.fromEntries(['C', 'E', 'G'].map((step) => [`${step}${octave}`, `${prefix}-${step}${octave}.wav`]));
const sampleBank: PlaybackSampleBank = {
  id: 'bank',
  directory: '/samples',
  parts: [
    { partNames: ['Violin'], samples: samples(4, 'vn') },
    { partNames: ['Violoncello'], samples: samples(3, 'vc') },
  ],
  loadSample: async () => new ArrayBuffer(8),
};

test('scheduled notes route through their part bus (gain, pan) into master, level and clipper', async () => {
  const restore = install();
  const coreDocument = buildDocumentState(XML).coreDocument;
  assert.ok(coreDocument);
  let api!: ReturnType<typeof usePlayback>;
  function Harness() { api = usePlayback({ coreDocument, sampleBank }); return null; }
  let root!: ReturnType<typeof create>;
  try {
    act(() => { root = create(React.createElement(Harness)); });
    await act(async () => { assert.equal(await api.loadMidi(XML), true); });
    await act(async () => { assert.equal(await api.play(), true); });
    const ac = contexts.at(-1)!;
    const sources = ac.nodes.filter((node) => node.kind === 'source' && node.buffer);
    assert.equal(sources.length, 6, 'two three-note chords');
    const first = sources[0]!.started[0]!;
    assert.ok(Math.abs(first - (50 + 0.015)) < 1e-9, `the first note starts START_LEAD_S after Play (${first})`);
    sources.forEach((source) => assert.equal(source.started[0], first, 'chord notes start together, exactly'));

    // Each note: source > note gain > part gain > panner > master > level > clip in > clipper.
    const pans = sources.map((source) => {
      const noteGain = source.outputs[0]!;
      const partGain = noteGain.outputs[0]!;
      const panner = partGain.outputs.find((node) => node.kind === 'panner')!;
      assert.ok(panner, 'the part bus has a panner');
      const master = panner.outputs[0]!;
      assert.equal(master.gain.value, MASTER_GAIN);
      assert.ok(partGain.outputs.some((node) => node.kind === 'gain' && node.outputs[0]?.kind === 'convolver'), 'reverb send');
      return panner.pan.value;
    });
    assert.deepEqual([...new Set(pans)].sort(), [-0.35, 0.3], 'violin left, cello right');

    // The loud chords lower the master level ahead of time, starting no earlier than now.
    const master = ac.nodes.find((node) => node.kind === 'gain' && node.gain.value === MASTER_GAIN)!;
    const level = master.outputs[0]!;
    const events = (level.gain as FakeParam).events.filter((event) => event.kind === 'linear');
    assert.ok(events.length > 0, 'level automation was committed');
    assert.ok(events.every((event) => event.time >= 50), 'no automation in the past');
    assert.ok(Math.min(...events.map((event) => event.value)) < 1, 'the level is reduced for the chords');
    const reduced = events.find((event) => event.value < 1)!;
    assert.ok(reduced.time <= first, 'reduced by the time the chord starts');

    // Mute the violin: its bus ramps to silence over 20 ms, the cello is untouched.
    const partGains = [...new Set(sources.map((source) => source.outputs[0]!.outputs[0]!))];
    const violinId = coreDocument.score.parts[0]!.id;
    act(() => api.setMixer({ [violinId]: { volume: 1, mute: true, solo: false } }));
    const muted = partGains.filter((gain) => (gain.gain as FakeParam).events.some((event) => event.kind === 'linear' && event.value === 0));
    assert.equal(muted.length, 1);
    const ramp = (muted[0]!.gain as FakeParam).events.at(-1)!;
    assert.ok(Math.abs(ramp.time - (ac.currentTime + 0.02)) < 1e-9);

    act(() => api.stop());
  } finally {
    if (root) act(() => root.unmount());
    restore();
  }
});

test('the metronome plays a rendered click with its own gain into the dry master input', async () => {
  const restore = install();
  const coreDocument = buildDocumentState(XML).coreDocument;
  let api!: ReturnType<typeof usePlayback>;
  function Harness() { api = usePlayback({ coreDocument, sampleBank }); return null; }
  let root!: ReturnType<typeof create>;
  try {
    act(() => { root = create(React.createElement(Harness)); });
    act(() => api.setMetronomeEnabled(true));
    await act(async () => { assert.equal(await api.loadMidi(XML), true); });
    await act(async () => { assert.equal(await api.play(), true); });
    const ac = contexts.at(-1)!;
    const clicks = ac.nodes.filter((node) => node.kind === 'source' && (node.buffer as FakeAudioBuffer | null)?.length === Math.round(0.04 * ac.sampleRate));
    assert.ok(clicks.length >= 1, 'the downbeat click is scheduled in the opening window');
    const clickGain = clicks[0]!.outputs[0]! as FakeNode;
    const events = (clickGain.gain as FakeParam).events;
    assert.equal(events[0]!.value, 0.2, 'accent level on beat 1');
    assert.deepEqual(events.at(-1), { kind: 'linear', value: 0, time: clicks[0]!.started[0]! + 0.04 }, '5 ms release to silence');
    const dryInput = clickGain.outputs[0]!;
    assert.equal(dryInput.gain.value, MASTER_GAIN);
    assert.equal(dryInput.outputs[0]!.outputs[0]!.kind, 'shaper', 'dry input goes straight to the clipper (no reverb, no pan, no level)');
    act(() => api.stop());
  } finally {
    if (root) act(() => root.unmount());
    restore();
  }
});
