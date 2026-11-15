import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LevelPlanner,
  MASTER_GAIN,
  PLAYBACK_LIMITER,
  SOFT_CLIP,
  buildSoftClipCurve,
  compressorOutputDb,
  estimateMixPeak,
  gainToDb,
  levelGainForEstimate,
  softClipSample,
  velocityToGain,
} from '../lib/playback-dynamics.ts';
import {
  AUTO_PAN_TABLE,
  applyMixerToPartBuses,
  getPartBus,
  getPlaybackBus,
  rampGain,
  resolveAutoPanTable,
} from '../lib/playback-bus.ts';
import { FakeAudioContext, FakeParam, pathsToDestination, type FakeNode } from './support/audio-fake-context.ts';

const db = (gain: number) => gainToDb(gain);
const close = (actual: number, expected: number, tolerance: number, message?: string) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message ?? ''} expected ${expected} ± ${tolerance}, got ${actual}`);
};

test('velocityToGain follows a square law: pp -23 dB, mf -8 dB, ff -2 dB', () => {
  close(db(velocityToGain(33 / 127)), -23, 0.6, 'pp');
  close(db(velocityToGain(80 / 127)), -8, 0.3, 'mf');
  close(db(velocityToGain(112 / 127)), -2, 0.3, 'ff');
  assert.equal(velocityToGain(1), 1);
  assert.equal(velocityToGain(0), 0);
  assert.equal(velocityToGain(Number.NaN), 0);
  assert.equal(velocityToGain(2), 1);
  // The old linear law gave 10.6 dB between pp and ff; the square law about twice that.
  close(db(velocityToGain(112 / 127)) - db(velocityToGain(33 / 127)), 21.2, 0.5, 'pp to ff range');
});

test('an mf solo line of the loudest-measured piano sample peaks near -15 dBFS before the limiter', () => {
  const pianoC4Peak = 10 ** (-21 / 20); // measured FluidR3 acoustic_grand_piano C4
  const peak = pianoC4Peak * velocityToGain(80 / 127) * MASTER_GAIN;
  close(db(peak), -15, 1, 'mf solo peak');
  // Below the compressor threshold: the level control leaves a solo line alone.
  assert.equal(levelGainForEstimate(peak), 1);
});

test('the compressor curve is continuous, has a soft knee and ratio 3 above it', () => {
  assert.equal(compressorOutputDb(-30), -30);
  assert.equal(compressorOutputDb(-14), -14);
  let previous = compressorOutputDb(-40);
  for (let input = -39.9; input <= 20; input += 0.1) {
    const output = compressorOutputDb(input);
    assert.ok(output >= previous - 1e-9, 'monotonic');
    assert.ok(output - previous < 0.1 + 1e-9, 'no step');
    previous = output;
  }
  // Well above the knee every 3 dB in give 1 dB out.
  close(compressorOutputDb(12) - compressorOutputDb(9), 1, 1e-9, 'ratio');
});

test('the level never lets the estimated peak exceed the limiter threshold', () => {
  for (const estimateDb of [-20, -10, -2, 0, 6, 12, 20]) {
    const estimate = 10 ** (estimateDb / 20);
    const out = db(estimate * levelGainForEstimate(estimate));
    assert.ok(out <= PLAYBACK_LIMITER.thresholdDb + 1e-9, `${estimateDb} dB in gives ${out} dB out`);
    assert.ok(levelGainForEstimate(estimate) <= 1);
  }
});

test('the dense ff tutti (4 parts x 6-note chord, accents, mixer 1.5) is brought under 0 dBFS', () => {
  // Rendered offline from the FluidR3 samples with the new gains (centred): the mix peaks at
  // +12.1 dBFS after the master gain; the planner's power-sum estimate is +11.9 dBFS.
  const before = 12.1;
  const estimate = 10 ** (11.9 / 20);
  const after = before + db(levelGainForEstimate(estimate));
  close(after, -1.8, 0.2, 'dense tutti after the level control');
  // The soft clipper only touches the top of the loudest peaks and never reaches full scale.
  const clipped = db(softClipSample(10 ** (after / 20)));
  assert.ok(clipped > after - 0.1 && clipped < 0, `after the clipper ${clipped} dBFS`);
  // An estimate 3 dB too low still ends below full scale.
  const underestimated = before + db(levelGainForEstimate(10 ** ((11.9 - 3) / 20)));
  assert.ok(db(softClipSample(10 ** (underestimated / 20))) < -0.3 + 1e-9);
});

test('the soft clipper is linear below -3 dBFS and never exceeds its ceiling', () => {
  const curve = buildSoftClipCurve();
  assert.equal(curve.length, SOFT_CLIP.points);
  assert.equal(curve[(curve.length - 1) / 2], 0);
  for (let index = 0; index < curve.length; index += 1) {
    assert.ok(Math.abs(curve[index]!) <= SOFT_CLIP.ceiling + 1e-6);
  }
  assert.equal(softClipSample(0.5), 0.5);
  assert.equal(softClipSample(-0.7), -0.7);
  assert.ok(softClipSample(4) < SOFT_CLIP.ceiling && softClipSample(4) > 0.95);
  // Continuous slope at the knee.
  const below = softClipSample(SOFT_CLIP.linearUntil - 1e-4);
  const above = softClipSample(SOFT_CLIP.linearUntil + 1e-4);
  close((above - below) / 2e-4, 1, 0.01, 'slope at the knee');
});

test('the level planner lowers the level before a loud chord and releases without a step', () => {
  const planner = new LevelPlanner();
  planner.reset(0, 1);
  const loud = 10 ** (6 / 20) / Math.sqrt(4);
  for (let index = 0; index < 4; index += 1) planner.addVoice({ start: 0.1, end: 0.4, amplitude: loud });
  const points = planner.plan(1.5, 0);
  const at = (time: number) => points.reduce((best, point) => (Math.abs(point.time - time) < Math.abs(best.time - time) ? point : best)).gain;
  assert.equal(at(0.05), 1, 'unity before the chord');
  close(db(at(0.1)), db(levelGainForEstimate(10 ** (6 / 20))), 0.01, 'reduced by the chord start');
  assert.ok(at(0.098) < 1, 'the reduction is in place a few milliseconds early');
  for (let index = 1; index < points.length; index += 1) {
    const rise = points[index]!.gain - points[index - 1]!.gain;
    assert.ok(rise < 0.05, `release rises smoothly (${rise})`);
  }
  assert.ok(at(1.5) > 0.95, 'back near unity a second after the chord');
  planner.plan(2, 1.6);
  assert.equal(planner.voiceCount, 0, 'finished voices are pruned');
});

test('planAutomation skips flat stretches but keeps the anchor before a change', () => {
  const planner = new LevelPlanner();
  planner.reset(0, 1);
  assert.deepEqual(planner.planAutomation(0.2, 0), [], 'nothing to automate while the mix is quiet');
  planner.addVoice({ start: 0.4, end: 0.6, amplitude: 2 });
  const automation = planner.planAutomation(0.5, 0.2);
  assert.ok(automation.length > 0);
  assert.equal(automation[0]!.gain, 1, 'the ramp starts from the flat level');
  assert.ok(automation[0]!.time < 0.395, 'anchor before the reduction');
  const reduced = automation.find((point) => point.gain < 1)!;
  assert.ok(reduced.time <= 0.4 && reduced.time >= 0.385);
});

test('estimateMixPeak is exact for one voice and the power sum for several', () => {
  const voices = [{ start: 0, end: 1, amplitude: 0.3 }, { start: 0, end: 1, amplitude: 0.4 }];
  close(estimateMixPeak(voices.slice(0, 1), 0.5), 0.3, 1e-12);
  close(estimateMixPeak(voices, 0.5), 0.5, 1e-12);
  assert.equal(estimateMixPeak(voices, 2), 0);
  const decaying = [{ start: 0, end: 3, amplitude: 1, decaying: true }];
  assert.ok(estimateMixPeak(decaying, 1) < 0.5);
});

function kinds(path: string[]) { return path.join(' > '); }

test('bus topology: every part runs through its gain and panner into master, level and clipper', () => {
  const ac = new FakeAudioContext();
  const bus = getPlaybackBus(ac as unknown as BaseAudioContext)!;
  assert.ok(bus);
  assert.equal(getPlaybackBus(ac as unknown as BaseAudioContext), bus, 'one bus per context');
  assert.equal(bus.input.gain.value, MASTER_GAIN);
  const part = getPartBus(bus, 'P1', -0.35, 1);
  const paths = pathsToDestination(part.input as unknown as FakeNode).map(kinds);
  assert.ok(paths.includes('gain > panner > gain > gain > gain > shaper > destination'), paths.join('\n'));
  assert.ok(paths.includes('gain > gain > convolver > gain > gain > gain > gain > shaper > destination'), 'reverb send returns into the master input');
  const dry = pathsToDestination(bus.dryInput as unknown as FakeNode).map(kinds);
  assert.deepEqual(dry, ['gain > gain > shaper > destination'], 'metronome and audition: dry, centred, after the level');
  assert.equal(part.pan, -0.35);
  assert.equal((part.panner as unknown as FakeNode).pan.value, -0.35);
  const convolver = ac.nodes.find((node) => node.kind === 'convolver')!;
  assert.equal(convolver.normalize, false);
  assert.ok(convolver.buffer, 'the generated impulse response is assigned');
  const shaper = ac.nodes.find((node) => node.kind === 'shaper')!;
  assert.equal(shaper.oversample, 'none', 'no oversampling, so the clipper adds no latency');
  assert.equal(ac.count('panner'), 1);
  assert.equal(getPartBus(bus, 'P1', -0.35, 1), part, 'one bus per part');
});

test('without StereoPanner or Convolver the parts stay dry and centred', () => {
  const ac = new FakeAudioContext({ panner: false, convolver: false });
  const bus = getPlaybackBus(ac as unknown as BaseAudioContext)!;
  assert.equal(bus.reverbSend, null);
  const part = getPartBus(bus, 'P1', 0.4, 1);
  assert.equal(part.panner, null);
  assert.equal(part.pan, 0);
  assert.deepEqual(pathsToDestination(part.input as unknown as FakeNode).map(kinds), ['gain > gain > gain > gain > shaper > destination']);
});

test('a context that cannot build the bus falls back to the destination', () => {
  assert.equal(getPlaybackBus({ createGain() { return {}; }, destination: {}, currentTime: 0 } as unknown as BaseAudioContext), null);
  assert.equal(getPlaybackBus({ destination: {}, currentTime: 0 } as unknown as BaseAudioContext), null);
});

test('mute ramps a part bus to silence over 20 ms, so ringing notes stop too', () => {
  const ac = new FakeAudioContext();
  ac.currentTime = 3;
  const bus = getPlaybackBus(ac as unknown as BaseAudioContext)!;
  const p1 = getPartBus(bus, 'P1', 0, 1);
  const p2 = getPartBus(bus, 'P2', 0, 1);
  applyMixerToPartBuses(bus, (partId) => (partId === 'P1' ? 0 : 1));
  const events = (p1.input.gain as unknown as FakeParam).events;
  assert.deepEqual(events, [{ kind: 'set', value: 1, time: 3 }, { kind: 'linear', value: 0, time: 3.02 }]);
  assert.deepEqual((p2.input.gain as unknown as FakeParam).events, [], 'unchanged parts are not touched');

  const param = new FakeParam(0.5);
  rampGain(param as unknown as AudioParam, 1.2, 10);
  assert.deepEqual(param.events, [{ kind: 'set', value: 0.5, time: 10 }, { kind: 'linear', value: 1.2, time: 10.02 }]);
});

test('auto seating: one part stays centred, several are seated, duplicates spread', () => {
  assert.deepEqual([...resolveAutoPanTable([{ id: 'P1', instrumentId: 'violin' }])], [['P1', 0]]);
  const pans = resolveAutoPanTable([
    { id: 'vn', instrumentId: 'violin' },
    { id: 'va', instrumentId: 'viola' },
    { id: 'vc', instrumentId: 'cello' },
    { id: 'cb', instrumentId: 'double-bass' },
    { id: 'pf', instrumentId: 'piano' },
  ]);
  assert.equal(pans.get('vn'), AUTO_PAN_TABLE.violin);
  assert.equal(pans.get('va'), 0.1);
  assert.equal(pans.get('vc'), 0.3);
  assert.equal(pans.get('cb'), 0.4);
  assert.equal(pans.get('pf'), 0, 'unlisted instruments sit in the centre');
  const violins = resolveAutoPanTable([
    { id: 'v1', instrumentId: 'violin' },
    { id: 'v2', instrumentId: 'violin' },
  ]);
  close(violins.get('v1')!, -0.425, 1e-9);
  close(violins.get('v2')!, -0.275, 1e-9);
  for (const [instrument, pan] of Object.entries({ flute: -0.1, oboe: 0.1, 'clarinet-bb': -0.15, bassoon: 0.15, 'horn-f': -0.25, 'trumpet-bb': 0.2, trombone: 0.3, tuba: 0.35, harp: -0.4 })) {
    assert.equal((AUTO_PAN_TABLE as Record<string, number>)[instrument], pan, instrument);
  }
});
