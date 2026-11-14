import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AMP_INPUT_DEVICE_STORAGE_KEY,
  audioConstraintsForProfile,
  classifyLineSignalLevel,
  HeldLevelMeter,
  INPUT_PROFILE_STORAGE_KEY,
  midiRangeForProfile,
  pickAmpInputDevice,
  readInputProfile,
  readRememberedAmpInput,
  writeInputProfile,
  writeRememberedAmpInput,
} from '@/src/score-input/instrument-input-profile';
import { notationMidisForInstrument, simultaneousNoteOns } from '@/src/score-input/sounding-note';
import { leavesNoteInputWithRecord } from '@/src/score-input/instrument-input-profile';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    values,
  };
}

const builtIn = { deviceId: 'built-in', label: 'MacBook Pro Microphone' };
const spark = { deviceId: 'spark-1', label: 'Spark MINI' };

test('the amp input is chosen when exactly one real input has Spark in its label', () => {
  assert.deepEqual(
    pickAmpInputDevice([builtIn, spark], null),
    { deviceId: 'spark-1', reason: 'spark' },
  );
  // Chromium lists the default input a second time; that alias is not a second Spark.
  assert.deepEqual(
    pickAmpInputDevice([{ deviceId: 'default', label: 'Default - Spark MINI' }, builtIn, spark], null),
    { deviceId: 'spark-1', reason: 'spark' },
  );
});

test('no amp is guessed when no or several Spark inputs exist', () => {
  assert.deepEqual(pickAmpInputDevice([builtIn, { deviceId: 'usb-2', label: 'USB Audio CODEC' }], null), {
    deviceId: null,
    reason: 'not-found',
  });
  assert.deepEqual(pickAmpInputDevice([spark, { deviceId: 'spark-2', label: 'Spark 40 Audio' }], null), {
    deviceId: null,
    reason: 'several-sparks',
  });
});

test('a remembered manual choice wins, also when the device id changed but the label did not', () => {
  const reactor = { deviceId: 'usb-7', label: 'USB Audio CODEC' };
  assert.deepEqual(
    pickAmpInputDevice([builtIn, spark, reactor], { deviceId: 'usb-7', label: 'USB Audio CODEC' }),
    { deviceId: 'usb-7', reason: 'remembered' },
  );
  assert.deepEqual(
    pickAmpInputDevice([builtIn, { ...reactor, deviceId: 'usb-9' }], { deviceId: 'usb-7', label: 'USB Audio CODEC' }),
    { deviceId: 'usb-9', reason: 'remembered' },
  );
  assert.deepEqual(
    pickAmpInputDevice([builtIn, spark], { deviceId: 'gone', label: 'Unplugged amp' }),
    { deviceId: 'spark-1', reason: 'spark' },
  );
});

test('the amp profile turns auto gain off; the microphone profile keeps it as before', () => {
  assert.deepEqual(audioConstraintsForProfile('microphone'), {
    autoGainControl: true,
    echoCancellation: false,
    noiseSuppression: false,
    channelCount: 1,
  });
  assert.deepEqual(audioConstraintsForProfile('guitar-amp', 'spark-1'), {
    autoGainControl: false,
    echoCancellation: false,
    noiseSuppression: false,
    channelCount: 1,
    deviceId: { exact: 'spark-1' },
  });
});

test('the amp profile hears down to B1, the microphone profile keeps E2', () => {
  assert.deepEqual(midiRangeForProfile('guitar-amp'), { minMidi: 35, maxMidi: 88 });
  assert.deepEqual(midiRangeForProfile('microphone'), { minMidi: 40, maxMidi: 88 });
});

test('line level hints judge the loudest recent note against the tracker gate and clipping', () => {
  assert.equal(classifyLineSignalLevel(-120, -120), 'silent');
  assert.equal(classifyLineSignalLevel(-90, -80), 'silent');
  assert.equal(classifyLineSignalLevel(-70, -58), 'too-low');
  assert.equal(classifyLineSignalLevel(-45, -30), 'good');
  assert.equal(classifyLineSignalLevel(-12, -2), 'good');
  assert.equal(classifyLineSignalLevel(-12, -0.5), 'too-high');
});

test('the held level meter keeps the loudest note over its span', () => {
  const meter = new HeldLevelMeter(1000);
  meter.push(0, -30, -18);
  meter.push(500, -80, -70);
  assert.equal(meter.rmsDb, -30);
  meter.push(1200, -82, -72);
  assert.equal(meter.rmsDb, -80);
  assert.equal(meter.peakDb, -70);
});

test('the profile and the amp input are remembered and tolerate broken storage', () => {
  const store = memoryStorage();
  assert.equal(readInputProfile(store), 'microphone');
  writeInputProfile('guitar-amp', store);
  assert.equal(store.values.get(INPUT_PROFILE_STORAGE_KEY), 'guitar-amp');
  assert.equal(readInputProfile(store), 'guitar-amp');
  writeRememberedAmpInput({ deviceId: 'usb-7', label: 'USB Audio CODEC' }, store);
  assert.ok(store.values.has(AMP_INPUT_DEVICE_STORAGE_KEY));
  assert.deepEqual(readRememberedAmpInput(store), { deviceId: 'usb-7', label: 'USB Audio CODEC' });
  store.setItem(AMP_INPUT_DEVICE_STORAGE_KEY, '{not json');
  assert.equal(readRememberedAmpInput(store), null);
  const throwing = {
    getItem: () => { throw new Error('blocked'); },
    setItem: () => { throw new Error('blocked'); },
  };
  assert.equal(readInputProfile(throwing), 'microphone');
  assert.doesNotThrow(() => writeInputProfile('guitar-amp', throwing));
  assert.equal(readRememberedAmpInput(throwing), null);
});

test('guitar notation does not depend on the amp profile', () => {
  assert.deepEqual(notationMidisForInstrument([35, 40, 64], 'guitar'), [47, 52, 76]);
  assert.deepEqual(notationMidisForInstrument([35, 40, 64], 'concert'), [35, 40, 64]);
});

test('note-ons with the same time are written together as one chord, lowest first', () => {
  assert.deepEqual(simultaneousNoteOns([
    { type: 'note-off', midi: 40, timeMs: 500 },
    { type: 'note-on', midi: 55, timeMs: 500 },
    { type: 'note-on', midi: 48, timeMs: 500 },
    { type: 'note-on', midi: 59, timeMs: 500 },
    { type: 'note-off', midi: 48, timeMs: 900 },
    { type: 'note-on', midi: 52, timeMs: 900 },
  ]), [[48, 55, 59], [52]]);
  assert.deepEqual(simultaneousNoteOns([{ type: 'note-off', midi: 40, timeMs: 10 }]), []);
});

test('note input that Instrument Record switched on ends with it, note input the user switched on stays', () => {
  const base = { noteInputStartedByRecord: true, noteInputMode: true, otherRecordSourceEnabled: false };
  assert.equal(leavesNoteInputWithRecord(base), true);
  assert.equal(leavesNoteInputWithRecord({ ...base, noteInputStartedByRecord: false }), false);
  assert.equal(leavesNoteInputWithRecord({ ...base, otherRecordSourceEnabled: true }), false);
  assert.equal(leavesNoteInputWithRecord({ ...base, noteInputMode: false }), false);
});
