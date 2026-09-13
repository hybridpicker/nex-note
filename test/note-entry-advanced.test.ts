import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDocumentState, applyDocumentCommands } from '../src/score-core/commands/apply-document-commands';
import { syntheticScore } from '../scripts/benchmark-note-entry';
import { importMusicXmlToCore } from '../src/musicxml-adapter/import/import-musicxml';
import type { ScoreCommand } from '../src/shared/schemas/score-command';

function tuplet(eventId: string, actualNotes = 3, normalNotes = 2): ScoreCommand {
  return { type: 'addTuplet', coreEntityId: eventId, corePartId: 'P1', measureNumber: 1, staffIndex: 1, voiceId: 1, startTimestampNum: 0, startTimestampDen: 1, stopTimestampNum: 0, stopTimestampDen: 1, actualNotes, normalNotes, bracket: true, showNumber: 'both' };
}

test('custom and nested tuplets retain exact duration, root identity and separate MusicXML brackets', () => {
  const initial = buildDocumentState(syntheticScore(2));
  const rootId = initial.coreDocument!.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events[0]!.id;
  const outer = applyDocumentCommands(initial, [tuplet(rootId, 5, 2)]);
  const nested = applyDocumentCommands(outer, [tuplet(rootId, 3, 2)]);
  assert.equal(nested.coreDocument!.tuplets.length, 2);
  const voice = nested.coreDocument!.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!;
  assert.equal(voice.events[0]!.id, rootId);
  assert.equal(voice.events[0]!.durationDivisions / voice.events[0]!.timestampDen, 1 / 120);
  const reimported = importMusicXmlToCore(nested.xml);
  assert.deepEqual(reimported.tuplets.map(t => [t.actualNotes, t.normalNotes, t.eventIds.length]), [[5, 2, 7], [3, 2, 3]]);
  assert.ok(!nested.diagnostics.some(d => ['tuplet_count_mismatch', 'note_duration_mismatch', 'voice_overflow'].includes(d.code)), JSON.stringify(nested.diagnostics));
  assert.match(nested.xml, /<actual-notes>15<\/actual-notes><normal-notes>4<\/normal-notes>/);
});

test('tuplet rejection rolls back every command in the transaction', () => {
  const state = buildDocumentState(syntheticScore(2));
  const rootId = state.coreDocument!.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events[0]!.id;
  const result = applyDocumentCommands(state, [{ type: 'setTitle', title: 'Must not survive' }, tuplet(rootId, 5, 7)]);
  assert.equal(result.xml, state.xml);
  assert.ok(result.diagnostics.some(d => d.code === 'tuplet_command_rejected'));
});

test('dividing an incoming tie continuation rejects the entire batch and retains the tie', () => {
  let state = buildDocumentState(syntheticScore(2));
  const events = state.coreDocument!.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events;
  const first = events[0]!; const continuation = events[1]!;
  const locator = { corePartId: 'P1', measureNumber: 1, staffIndex: 1, voiceId: 1 };
  state = applyDocumentCommands(state, [
    { type: 'changeNotePitch', ...locator, coreEntityId: first.id, timestampNum: first.timestampNum, timestampDen: first.timestampDen, step: 'D', alter: 0, octave: 4 },
    { type: 'toggleTie', ...locator, coreEntityId: first.id, timestampNum: first.timestampNum, timestampDen: first.timestampDen },
  ]);
  assert.equal(state.coreDocument!.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events[0]!.tieStart, true);
  const result = applyDocumentCommands(state, [
    { type: 'setTitle', title: 'Must roll back' },
    { ...(tuplet(continuation.id) as Extract<ScoreCommand, { type: 'addTuplet' }>), startTimestampNum: continuation.timestampNum, startTimestampDen: continuation.timestampDen, stopTimestampNum: continuation.timestampNum, stopTimestampDen: continuation.timestampDen },
  ]);
  assert.equal(result.xml, state.xml);
  assert.ok(result.diagnostics.some(d => d.code === 'tuplet_command_rejected'));
});

test('explicit additive meter generates separate 3+2 beam groups and survives MusicXML', () => {
  const initial = buildDocumentState(syntheticScore(2));
  const result = applyDocumentCommands(initial, [{ type: 'setTimeSignature', measureNumber: 1, beats: 5, beatType: 8, beatGroups: [3, 2] }]);
  const reimported = importMusicXmlToCore(result.xml);
  assert.deepEqual(reimported.score.parts[0]!.staves[0]!.measures[0]!.attributes[0]!.time?.beatGroups, [3, 2]);
  const firstIds = new Set(result.coreDocument!.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events.map(e => e.id));
  assert.deepEqual(result.coreDocument!.beams.filter(b => b.eventIds.every(id => firstIds.has(id))).map(b => b.eventIds.length), [3, 2]);
});

test('bounded insertion shifts the active voice across bars and rejects occupied overflow atomically', () => {
  const initial = buildDocumentState(syntheticScore(3, 2));
  const anchor = initial.coreDocument!.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events[2]!;
  const command: ScoreCommand = { type: 'editRhythm', operation: 'insert', scope: 'voice', endMeasureNumber: 2, durationType: 'quarter', coreEntityId: anchor.id, corePartId: 'P1', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: anchor.timestampNum, timestampDen: anchor.timestampDen };
  const rejected = applyDocumentCommands(initial, [command]);
  assert.equal(rejected.xml, initial.xml);
  assert.ok(rejected.diagnostics.some(d => d.code === 'rhythm_command_rejected'));
  const withRoom = applyDocumentCommands(initial, [{ type: 'clearMeasureVoice', corePartId: 'P1', measureNumber: 2, staffIndex: 1, voiceId: 1 }]);
  const otherPart = structuredClone(withRoom.coreDocument!.score.parts[1]);
  const afterStop = structuredClone(withRoom.coreDocument!.score.parts[0]!.staves[0]!.measures[2]);
  const moved = applyDocumentCommands(withRoom, [command]);
  assert.ok(!moved.diagnostics.some(d => d.code.endsWith('_rejected')), JSON.stringify(moved.diagnostics));
  const target = moved.coreDocument!.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events.find(e => e.id === anchor.id)!;
  assert.equal(target.timestampNum / target.timestampDen, anchor.timestampNum / anchor.timestampDen + .25);
  assert.deepEqual(moved.coreDocument!.score.parts[1], otherPart);
  // Division-grid normalization may rescale unaffected bars, but cannot change their music.
  const later = moved.coreDocument!.score.parts[0]!.staves[0]!.measures[2]!;
  assert.deepEqual(later.voices[0]!.events.map(e => [e.id, e.timestampNum / e.timestampDen, e.durationDivisions / e.timestampDen]), afterStop!.voices[0]!.events.map(e => [e.id, e.timestampNum / e.timestampDen, e.durationDivisions / e.timestampDen]));
});

test('range conversion compresses three existing eighths and retains their pitch identities', () => {
  const initial = buildDocumentState(syntheticScore(2));
  const events = initial.coreDocument!.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events;
  const cmd = tuplet(events[0]!.id) as Extract<ScoreCommand, { type: 'addTuplet' }>;
  const result = applyDocumentCommands(initial, [{ ...cmd, convertRange: true, stopTimestampNum: events[2]!.timestampNum, stopTimestampDen: events[2]!.timestampDen }]);
  assert.equal(result.coreDocument!.tuplets.length, 1);
  assert.deepEqual(result.coreDocument!.tuplets[0]!.eventIds, events.slice(0, 3).map(e => e.id));
  const first = result.coreDocument!.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events[0]!;
  assert.equal(first.durationDivisions / first.timestampDen, 1/12);
  assert.equal(importMusicXmlToCore(result.xml).tuplets.length, 1);
});

test('grace sequence pitch, order and deletion survive normalization and MusicXML without changing its anchor', () => {
  let state = buildDocumentState(syntheticScore(2));
  const anchor = structuredClone(state.coreDocument!.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events[0]!);
  const locate = (event = anchor) => ({ coreEntityId: event.id, corePartId: 'P1', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: event.timestampNum, timestampDen: event.timestampDen });
  state = applyDocumentCommands(state, [{ type: 'addGraceNote', ...locate(), slash: true }, { type: 'addGraceNote', ...locate(), slash: true }]);
  let events = state.coreDocument!.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events;
  const firstGrace = events.find(e => e.durationDivisions === 0)!;
  state = applyDocumentCommands(state, [{ type: 'changeNotePitch', ...locate(firstGrace), step: 'D', alter: 0, octave: 5 }, { type: 'moveGraceNote', ...locate(firstGrace), direction: 'later' }]);
  events = state.coreDocument!.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events;
  assert.equal(events[1]!.id, firstGrace.id);
  assert.deepEqual(events.find(e => e.id === anchor.id), anchor);
  const reimported = importMusicXmlToCore(state.xml).score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events;
  assert.deepEqual(reimported.slice(0,2).map(e => [e.kind === 'note' ? e.pitch.step : '', e.durationDivisions]), [['C', 0], ['D', 0]]);
  state = applyDocumentCommands(state, [{ type: 'removeGraceNote', ...locate(firstGrace) }]);
  assert.equal(state.coreDocument!.graceNotes.length, 1);
});

test('literal duration and automatic cautionary preferences persist through export and reimport', () => {
  const state = buildDocumentState(syntheticScore(2));
  const event = state.coreDocument!.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events[0]!;
  const locator = { coreEntityId: event.id, corePartId: 'P1', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: event.timestampNum, timestampDen: event.timestampDen };
  const result = applyDocumentCommands(state, [{ type: 'setRhythmSpelling', ...locator, literal: true }, { type: 'setAccidentalPolicy', policy: 'always' }, { type: 'changeNotePitch', ...locator, step: 'D', alter: 0, octave: 4 }]);
  const imported = importMusicXmlToCore(result.xml);
  assert.equal(imported.accidentalPolicy, 'always');
  const note = imported.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events[0]!;
  assert.equal(note.kind === 'note' && note.accidentalCautionary, true);
  assert.ok(note.preservedXml?.notationChildren?.some(xml => xml.includes('nex-note:literal-duration')));
});

import { buildClipboardPayloadFromSelection } from '../src/score-core/query/clipboard';

test('copy/paste preserves nested tuplet and grace relationships on a different division grid', () => {
  let state = buildDocumentState(syntheticScore(3));
  const root = state.coreDocument!.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events[0]!;
  state = applyDocumentCommands(state, [tuplet(root.id, 5, 2), tuplet(root.id, 3, 2)]);
  const voice = state.coreDocument!.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!;
  const ids = new Set(state.coreDocument!.tuplets[0]!.eventIds);
  const selection = voice.events.filter(e => ids.has(e.id)).map(e => ({ ...e, coreEntityId: e.id, corePartId: state.coreDocument!.score.parts[0]!.id }));
  const clipboard = buildClipboardPayloadFromSelection(state.coreDocument, selection)!;
  assert.equal(clipboard.tuplets?.length, 2);
  const destination = buildDocumentState(syntheticScore(3));
  const pasted = applyDocumentCommands(destination, [{ type: 'pasteContent', targetPartId: destination.coreDocument!.score.parts[0]!.id, targetStaffIndex: 1, targetOffset: { measureNumber: 2, timestampNum: 0, timestampDen: 1 }, mode: 'overwrite', clipboardData: clipboard }]);
  assert.ok(!pasted.diagnostics.some(d => d.code.endsWith('_rejected')), JSON.stringify(pasted.diagnostics));
  assert.deepEqual(importMusicXmlToCore(pasted.xml).tuplets.map(t => [t.actualNotes, t.normalNotes, t.eventIds.length]), [[5,2,7],[3,2,3]]);
  assert.equal(buildClipboardPayloadFromSelection(state.coreDocument, selection.slice(0,1)), null);
});

test('nested units can change pitch, build chords and become rests without losing exact time or memberships', () => {
  let state = buildDocumentState(syntheticScore(2));
  const root = state.coreDocument!.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events[0]!;
  state = applyDocumentCommands(state, [tuplet(root.id,5,2), tuplet(root.id,3,2)]);
  const rest = state.coreDocument!.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events[1]!;
  const location = { coreEntityId: rest.id, corePartId: 'P1', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: rest.timestampNum, timestampDen: rest.timestampDen };
  state = applyDocumentCommands(state, [{ type: 'editTupletUnit', ...location, action: 'pitch', step: 'D', alter: 1, octave: 5 }, { type: 'editTupletUnit', ...location, action: 'chord', step: 'F', alter: 1, octave: 5 }]);
  assert.ok(!state.diagnostics.some(d => d.level === 'error' || d.code.endsWith('_rejected')), JSON.stringify(state.diagnostics));
  const imported = importMusicXmlToCore(state.xml);
  assert.deepEqual(imported.tuplets.map(t => t.eventIds.length), [8,4]);
  const notes = imported.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events.filter(e => e.kind === 'note' && e.pitch.octave === 5);
  assert.deepEqual(notes.map(e => [e.pitch.step,e.pitch.alter,e.durationDivisions/e.timestampDen]), [['D',1,1/120],['F',1,1/120]]);
  state = applyDocumentCommands(state, [{ type: 'editTupletUnit', ...location, action: 'rest', step: 'C', alter: 0, octave: 4 }]);
  assert.deepEqual(importMusicXmlToCore(state.xml).tuplets.map(t => t.eventIds.length), [7,3]);
  const rejected = applyDocumentCommands(state, [{ type: 'duplicateNote', ...location }]);
  assert.equal(rejected.xml,state.xml);
  assert.ok(rejected.diagnostics.some(d => d.code === 'duplicate_command_rejected'));
});
