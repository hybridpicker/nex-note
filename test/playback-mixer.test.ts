import assert from 'node:assert/strict';
import test from 'node:test';
import { channelGainFactor, updateChannel, type MixerState } from '../lib/playback-mixer.ts';

test('unknown parts play at unity and volume is clamped', () => {
  let state: MixerState = {};
  assert.equal(channelGainFactor(state, 'P1'), 1);
  state = updateChannel(state, 'P1', { volume: 9 });
  assert.equal(channelGainFactor(state, 'P1'), 1.5);
  state = updateChannel(state, 'P1', { volume: -3 });
  assert.equal(channelGainFactor(state, 'P1'), 0);
  assert.equal(channelGainFactor(updateChannel({}, 'P1', { volume: Number.NaN }), 'P1'), 1);
});

test('mute silences a part and solo silences all other parts', () => {
  let state: MixerState = updateChannel({}, 'P1', { mute: true });
  assert.equal(channelGainFactor(state, 'P1'), 0);
  assert.equal(channelGainFactor(state, 'P2'), 1);
  state = updateChannel(state, 'P2', { solo: true });
  assert.equal(channelGainFactor(state, 'P2'), 1);
  assert.equal(channelGainFactor(state, 'P3'), 0);
  assert.equal(channelGainFactor(state, null), 0);
  state = updateChannel(state, 'P1', { solo: true });
  assert.equal(channelGainFactor(state, 'P1'), 0, 'mute still wins over solo');
});
