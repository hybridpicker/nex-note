import assert from 'node:assert/strict';
import test from 'node:test';

import { REVERB_PRE_DELAY_SECONDS, REVERB_RT60_SECONDS, generateReverbImpulse } from '../lib/reverb-ir.ts';

/** RT60 by Schroeder backward integration: T30 (the -5 to -35 dB fit of the decay curve) x 2. */
function schroederRt60(impulse: Float32Array, sampleRate: number) {
  const decay = new Float64Array(impulse.length);
  let energy = 0;
  for (let index = impulse.length - 1; index >= 0; index -= 1) {
    energy += impulse[index]! ** 2;
    decay[index] = energy;
  }
  const total = decay[0]!;
  const levels = Array.from(decay, (value) => 10 * Math.log10(value / total));
  // Least-squares line through the decay curve between -5 and -35 dB.
  let n = 0; let sumT = 0; let sumL = 0; let sumTT = 0; let sumTL = 0;
  levels.forEach((level, index) => {
    if (level > -5 || level < -35) return;
    const t = index / sampleRate;
    n += 1; sumT += t; sumL += level; sumTT += t * t; sumTL += t * level;
  });
  const slope = ((n * sumTL) - (sumT * sumL)) / ((n * sumTT) - (sumT * sumT)); // dB per second
  return -60 / slope;
}

function correlation(left: Float32Array, right: Float32Array) {
  let lr = 0; let ll = 0; let rr = 0;
  for (let index = 0; index < left.length; index += 1) {
    lr += left[index]! * right[index]!;
    ll += left[index]! ** 2;
    rr += right[index]! ** 2;
  }
  return lr / Math.sqrt(ll * rr);
}

test('the generated impulse response decays with RT60 1.6 s (within 10 %)', () => {
  for (const sampleRate of [44100, 48000]) {
    const [left, right] = generateReverbImpulse({ sampleRate });
    for (const channel of [left, right]) {
      const rt60 = schroederRt60(channel, sampleRate);
      assert.ok(Math.abs(rt60 - REVERB_RT60_SECONDS) / REVERB_RT60_SECONDS <= 0.1, `RT60 ${rt60.toFixed(3)} s at ${sampleRate} Hz`);
    }
  }
});

test('the impulse response has the pre-delay, decorrelated channels and unit energy', () => {
  const sampleRate = 44100;
  const [left, right] = generateReverbImpulse({ sampleRate });
  const preDelayFrames = Math.round(REVERB_PRE_DELAY_SECONDS * sampleRate);
  for (let index = 0; index < preDelayFrames; index += 1) {
    assert.equal(left[index], 0);
    assert.equal(right[index], 0);
  }
  assert.notEqual(left[preDelayFrames + 300], 0);
  assert.ok(Math.abs(correlation(left, right)) < 0.05, 'left and right are decorrelated');
  const energy = (data: Float32Array) => data.reduce((sum, value) => sum + (value * value), 0);
  assert.ok(Math.abs(energy(left) - 1) < 1e-3 && Math.abs(energy(right) - 1) < 1e-3);
  assert.ok(left.every(Number.isFinite));
});

test('high frequencies decay faster than low ones', () => {
  const sampleRate = 44100;
  const [left] = generateReverbImpulse({ sampleRate });
  // High-frequency content as the energy of the first difference, relative to the signal energy.
  const brightness = (from: number, to: number) => {
    let diff = 0; let signal = 0;
    for (let index = from + 1; index < to; index += 1) {
      diff += (left[index]! - left[index - 1]!) ** 2;
      signal += left[index]! ** 2;
    }
    return diff / signal;
  };
  const early = brightness(Math.round(0.02 * sampleRate), Math.round(0.2 * sampleRate));
  const late = brightness(Math.round(1.2 * sampleRate), Math.round(1.6 * sampleRate));
  assert.ok(late < early * 0.65, `late tail is darker (${late.toFixed(4)} vs ${early.toFixed(4)})`);
});

test('the impulse response is deterministic', () => {
  const [a] = generateReverbImpulse({ sampleRate: 8000 });
  const [b] = generateReverbImpulse({ sampleRate: 8000 });
  assert.deepEqual(a, b);
});
