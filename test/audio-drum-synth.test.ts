import assert from 'node:assert/strict';
import test from 'node:test';

import {
  GM_DRUM_KEY_RANGE,
  MAX_DRUM_NODES_PER_HIT,
  METRONOME_CLICK,
  drumVoiceDuration,
  drumVoiceNodeCount,
  isGeneralMidiDrumKey,
  playDrumHit,
  renderMetronomeClick,
  resolveDrumVoice,
} from '../lib/drum-synth.ts';
import { FakeAudioContext, FakeParam, type FakeNode } from './support/audio-fake-context.ts';

const keys = Array.from({ length: GM_DRUM_KEY_RANGE.last - GM_DRUM_KEY_RANGE.first + 1 }, (_, index) => GM_DRUM_KEY_RANGE.first + index);

test('every General MIDI drum key 35-81 maps to a voice of its own family', () => {
  for (const key of keys) {
    assert.equal(isGeneralMidiDrumKey(key), true, `key ${key}`);
    const voice = resolveDrumVoice(key);
    assert.ok(voice.layers.length > 0, `key ${key} has sound`);
  }
  assert.equal(resolveDrumVoice(35).name, 'kick');
  assert.equal(resolveDrumVoice(36).name, 'kick');
  assert.equal(resolveDrumVoice(38).name, 'snare');
  assert.equal(resolveDrumVoice(40).name, 'snare');
  assert.equal(resolveDrumVoice(42).name, 'closed hi-hat');
  assert.equal(resolveDrumVoice(46).name, 'open hi-hat');
  assert.equal(resolveDrumVoice(49).name, 'crash');
  assert.equal(resolveDrumVoice(51).name, 'ride');
  assert.equal(resolveDrumVoice(39).name, 'clap');
  assert.equal(resolveDrumVoice(56).name, 'cowbell');
  assert.equal(resolveDrumVoice(54).name, 'tambourine');
  for (const key of [41, 43, 45, 47, 48, 50]) assert.equal(resolveDrumVoice(key).name, 'tom');
  // Keys outside the kit still sound.
  assert.equal(isGeneralMidiDrumKey(30), false);
  assert.ok(resolveDrumVoice(30).layers.length > 0);
  assert.ok(resolveDrumVoice(90).layers.length > 0);
});

test('the kit follows the specified sounds: kick sweep, snare band, hi-hat filters and lengths', () => {
  const kick = resolveDrumVoice(36).layers;
  const kickTone = kick.find((layer) => layer.kind === 'tone')!;
  assert.equal(kickTone.kind === 'tone' && kickTone.frequencies[0], 120);
  assert.ok(kickTone.kind === 'tone' && Math.abs(120 * kickTone.sweepRatio! - 45) < 1e-9 && kickTone.sweepSeconds === 0.06);
  assert.equal(kickTone.decay, 0.3);
  assert.ok(kick.some((layer) => layer.kind === 'noise' && layer.decay === 0.002), '2 ms click');

  const snare = resolveDrumVoice(38).layers;
  assert.ok(snare.some((layer) => layer.kind === 'noise' && layer.decay === 0.18 && layer.filters[0]!.frequency === 1800));
  assert.ok(snare.some((layer) => layer.kind === 'tone' && layer.wave === 'triangle' && layer.frequencies.join() === '185,330'));

  const hat = resolveDrumVoice(42);
  const hatLayer = hat.layers[0]!;
  assert.equal(hatLayer.kind === 'tone' && hatLayer.wave, 'square');
  assert.deepEqual(hatLayer.filters?.map((filter) => `${filter.type}@${filter.frequency}`), ['bandpass@10000', 'highpass@7000']);
  assert.equal(hatLayer.decay, 0.05);
  assert.equal(resolveDrumVoice(46).layers[0]!.decay, 0.3);
  assert.equal(hat.chokes, 'hihat');
  assert.equal(resolveDrumVoice(46).chokeGroup, 'hihat');
  const crash = drumVoiceDuration(resolveDrumVoice(49));
  assert.ok(crash > 1.4 && crash < 1.7, `crash ${crash} s`);
});

test('a hit creates a bounded number of nodes, all starting exactly at the scheduled time', () => {
  for (const key of [...keys, 30, 90]) {
    const ac = new FakeAudioContext();
    ac.currentTime = 1;
    const destination = ac.createGain();
    ac.nodes.length = 0;
    const hit = playDrumHit(ac as unknown as BaseAudioContext, key, 1.25, 0.8, destination as unknown as AudioNode);
    const voice = resolveDrumVoice(key);
    assert.equal(ac.nodes.length, drumVoiceNodeCount(voice), `key ${key} node count`);
    assert.ok(ac.nodes.length <= MAX_DRUM_NODES_PER_HIT, `key ${key} creates ${ac.nodes.length} nodes`);
    const sources = ac.nodes.filter((node) => node.kind === 'oscillator' || node.kind === 'source');
    assert.ok(sources.length > 0);
    for (const source of sources) {
      assert.equal(source.started.length, 1);
      const delay = source.started[0]! - 1.25;
      assert.ok(delay >= 0 && delay < 0.04, `key ${key} source starts at ${source.started[0]}`);
      assert.ok(source.stopped[0]! <= hit.endTime + 1e-9, 'every source stops');
    }
    if (key !== 39) {
      assert.ok(sources.every((source) => source.started[0] === 1.25), `key ${key}: no offset from the note time`);
    }
    const output = ac.nodes[0] as FakeNode;
    assert.ok(output.outputs.includes(destination), 'the hit plays into the given destination');
  }
});

test('stopping a hit ramps it out instead of cutting it', () => {
  const ac = new FakeAudioContext();
  const destination = ac.createGain();
  const hit = playDrumHit(ac as unknown as BaseAudioContext, 46, 0, 1, destination as unknown as AudioNode);
  ac.currentTime = 0.1;
  hit.stop(0.1);
  const output = ac.nodes.find((node) => node.kind === 'gain' && node.outputs.includes(destination))!;
  const events = (output.gain as FakeParam).events;
  assert.deepEqual(events.at(-1), { kind: 'linear', value: 0, time: 0.11 });
  hit.stop(0.2); // a second stop is ignored
  assert.equal((output.gain as FakeParam).events.length, events.length);
});

test('the metronome click is short, peaks at its level, accents beat 1 and ends silent', () => {
  const sampleRate = 48000;
  const accent = renderMetronomeClick(sampleRate, true);
  const beat = renderMetronomeClick(sampleRate, false);
  assert.equal(accent.length, Math.round(METRONOME_CLICK.durationSeconds * sampleRate));
  const peak = (data: Float32Array) => data.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
  assert.ok(Math.abs(peak(accent) - METRONOME_CLICK.peak) < 1e-6);
  assert.ok(Math.abs(peak(beat) - METRONOME_CLICK.peak) < 1e-6);
  assert.equal(Math.abs(accent[accent.length - 1]!), 0);
  assert.equal(Math.abs(beat[beat.length - 1]!), 0);
  // The last 5 ms fade smoothly.
  const releaseFrames = Math.round(METRONOME_CLICK.releaseSeconds * sampleRate);
  for (let index = accent.length - releaseFrames; index < accent.length; index += 1) {
    assert.ok(Math.abs(accent[index]!) <= METRONOME_CLICK.peak);
  }
  assert.ok(METRONOME_CLICK.accentGain > METRONOME_CLICK.beatGain, 'beat 1 is louder');
  assert.ok(METRONOME_CLICK.accentHz > METRONOME_CLICK.beatHz, 'beat 1 is higher');
  assert.ok(METRONOME_CLICK.accentGain >= 0.15 && METRONOME_CLICK.accentGain <= 0.2);
});
