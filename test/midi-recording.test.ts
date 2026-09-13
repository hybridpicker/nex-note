import test from 'node:test';
import assert from 'node:assert/strict';
import { MidiTakeRecorder, quantizeMidiTake } from '../src/score-input/midi-recording';
import { buildDocumentState, applyDocumentCommands } from '../src/score-core/commands/apply-document-commands';
import { syntheticScore } from '../scripts/benchmark-note-entry';
import { importMusicXmlToCore } from '../src/musicxml-adapter/import/import-musicxml';

test('real-time MIDI ignores count-in attacks, closes held notes and requantizes from the original take', () => {
  const recorder = new MidiTakeRecorder(1000);
  recorder.accept([0x90, 55, 80], 900);
  recorder.accept([0x80, 55, 0], 1050);
  recorder.accept([0x90, 60, 90], 1010);
  recorder.accept([0x90, 64, 90], 1030);
  recorder.accept([0xb0, 64, 127], 1100);
  recorder.accept([0x80, 60, 0], 1420);
  recorder.accept([0x90, 64, 0], 1490);
  recorder.accept([0x90, 67, 90], 1510);
  const notes = recorder.finish(1810);
  assert.equal(notes.length, 3);
  assert.deepEqual(quantizeMidiTake(notes, 1000, 120, 4), [{ midi: 60, startTick: 0, durationTicks: 4 }, { midi: 64, startTick: 0, durationTicks: 4 }, { midi: 67, startTick: 4, durationTicks: 2 }]);
  assert.deepEqual(quantizeMidiTake(notes, 1000, 120, 2), [{ midi: 60, startTick: 0, durationTicks: 2 }, { midi: 64, startTick: 0, durationTicks: 2 }, { midi: 67, startTick: 2, durationTicks: 1 }]);
});

test('recorded chord passage commits through the core and preserves notes and gates through MusicXML', () => {
  let state = buildDocumentState(syntheticScore(3));
  state = applyDocumentCommands(state, [{ type: 'clearMeasureVoice', measureNumber: 1, staffIndex: 1, voiceId: 1 }]);
  const result = applyDocumentCommands(state, [{ type: 'replaceMidiPassage', takeId: 'synthetic', ticksPerQuarter: 4, lengthTicks: 6, measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 1, notes: [{ midi: 60, startTick: 0, durationTicks: 4 }, { midi: 64, startTick: 0, durationTicks: 4 }, { midi: 67, startTick: 4, durationTicks: 2 }] }]);
  assert.ok(!result.diagnostics.some(d => d.code.endsWith('_rejected')), JSON.stringify(result.diagnostics));
  const events = importMusicXmlToCore(result.xml).score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events.filter(e => e.kind === 'note');
  assert.deepEqual(events.map(e => [e.pitch.step, e.timestampNum/e.timestampDen, e.durationDivisions/e.timestampDen, e.isChord]), [['C',0,.25,false], ['E',0,.25,true], ['G',.25,.125,false]]);
});

test('non-binary MIDI gates are written as exact tied notation and overlapping onsets reject atomically', () => {
  const state = applyDocumentCommands(buildDocumentState(syntheticScore(3)), [{ type: 'clearMeasureVoice', measureNumber: 1, staffIndex: 1, voiceId: 1 }]);
  const command = { type: 'replaceMidiPassage' as const, takeId: 'gate', ticksPerQuarter: 4, lengthTicks: 5, measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 1, notes: [{ midi: 60, startTick: 0, durationTicks: 5 }] };
  const result = applyDocumentCommands(state, [command]);
  assert.ok(!result.diagnostics.some(d => d.level === 'error' || d.code.endsWith('_rejected')), JSON.stringify(result.diagnostics));
  const notes = importMusicXmlToCore(result.xml).score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events.filter(e => e.kind === 'note');
  assert.equal(notes.reduce((sum, e) => sum + e.durationDivisions / e.timestampDen, 0), 5/16);
  assert.deepEqual(notes.map(e => [e.durationType, e.tieStart]), [['quarter', true], ['16th', false]]);
  const rejected = applyDocumentCommands(state, [{ ...command, notes: [...command.notes, { midi: 62, startTick: 1, durationTicks: 2 }] }]);
  assert.equal(rejected.xml, state.xml);
  assert.ok(rejected.diagnostics.some(d => d.code === 'midi_command_rejected'));
});

import { Midi } from '@tonejs/midi';
import { buildFallbackMidiFromMusicXml } from '../lib/midi-export';

test('fallback playback joins a recorded tied duration into one sustained MIDI note', () => {
  const state = applyDocumentCommands(buildDocumentState(syntheticScore(3)), [{ type: 'clearMeasureVoice', measureNumber: 1, staffIndex: 1, voiceId: 1 }]);
  const result = applyDocumentCommands(state, [{ type: 'replaceMidiPassage', takeId: 'playback', ticksPerQuarter: 4, lengthTicks: 5, measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 1, notes: [{ midi: 72, startTick: 0, durationTicks: 5 }] }]);
  const notes = new Midi(buildFallbackMidiFromMusicXml(result.xml).data).tracks[0]!.notes.filter(n => n.midi === 72);
  assert.equal(notes.length, 1);
  assert.equal(notes[0]!.ticks, 0);
  assert.equal(notes[0]!.durationTicks, 600);
});

test('fallback grace playback schedules an ordered run without extending its main onset', () => {
  let state = buildDocumentState(syntheticScore(2));
  const event = state.coreDocument!.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events[0]!;
  const locator = { coreEntityId: event.id, measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 1 };
  state = applyDocumentCommands(state, [{ type: 'addGraceNote', ...locator, slash: true }, { type: 'addGraceNote', ...locator, slash: true }]);
  const notes = new Midi(buildFallbackMidiFromMusicXml(state.xml).data).tracks[0]!.notes.filter(n => n.ticks < 240);
  assert.deepEqual(notes.map(n => [n.ticks,n.durationTicks]), [[0,60],[60,60],[120,120]]);
  assert.equal(state.coreDocument!.graceNotes.length,2);
});
