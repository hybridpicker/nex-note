import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildDocumentState, applyDocumentCommands } from '../src/score-core/commands/apply-document-commands';
import { importMusicXmlToCore } from '../src/musicxml-adapter/import/import-musicxml';
import { serializeNxnFile, parseNxnText } from '../lib/nxn-file';
import { packXmlToMxl, extractXmlFromMxl } from '../lib/mxl-utils';
import { buildFallbackMidiFromMusicXml } from '../lib/midi-export';
import { syntheticScore } from '../scripts/benchmark-note-entry';
import type { ScoreDocumentModel } from '../src/score-core/model/types';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { useScoreDocument } from '../hooks/useScoreDocument';
import { buildClipboardPayloadFromSelection } from '../src/score-core/query/clipboard';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function semantics(document: ScoreDocumentModel) {
  return {
    parts: document.score.parts.map(p => p.staves.map(s => s.measures.map(m => m.voices.filter(v => v.events.length > 0).map(v => [v.voiceId, v.events.map(e => [e.kind, e.kind === 'note' ? e.pitch : null, e.timestampNum/e.timestampDen, e.durationDivisions/e.timestampDen, Boolean(e.isChord), Boolean(e.tieStart), e.durationType, Boolean(e.isDotted), e.kind === 'note' ? [e.writtenAccidental, e.accidentalCautionary] : null])])))),
    tuplets: document.tuplets.map(t => [t.actualNotes, t.normalNotes, t.eventIds.length]),
    graces: document.graceNotes.length,
    policy: document.accidentalPolicy ?? 'none',
  };
}

const corpora = [
  ['piano', () => fs.readFileSync('test/fixtures/piano-semantics.musicxml', 'utf8')],
  ['leadsheet', () => fs.readFileSync('test/fixtures/leadsheet-repeat.musicxml', 'utf8')],
  ['ensemble', () => syntheticScore(3, 4)],
  ['linked-tab', () => fs.readFileSync('e2e/fixtures/little-walk-guitar-tab.musicxml', 'utf8')],
  ['nested-tuplet-grace', () => {
    let state = buildDocumentState(syntheticScore(3));
    const event = state.coreDocument!.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events[0]!;
    const location = { corePartId: 'P1', coreEntityId: event.id, measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 1 };
    for (const actualNotes of [5, 3]) state = applyDocumentCommands(state, [{ type: 'addTuplet', ...location, startTimestampNum: 0, startTimestampDen: 1, stopTimestampNum: 0, stopTimestampDen: 1, actualNotes, normalNotes: 2, bracket: true, showNumber: 'both' }]);
    state = applyDocumentCommands(state, [{ type: 'addGraceNote', ...location, slash: true }, { type: 'setAccidentalPolicy', policy: 'barline' }]);
    return state.xml;
  }],
] as const;
for (const [name, source] of corpora) {
  test(`${name}: correction, native save/open, MXL/XML and playback event roundtrip`, async () => {
    let state = buildDocumentState(source());
    const part = state.coreDocument!.score.parts[0]!;
    const staff = part.staves[0]!;
    const measure = staff.measures[0]!;
    const voice = measure.voices[0]!;
    const event = voice.events.find(e => e.kind === 'note' && e.durationDivisions > 0)!;
    const changed = applyDocumentCommands(state, [{ type: 'changeNotePitch', corePartId: part.id, coreEntityId: event.id, measureNumber: measure.measureNumber, staffIndex: staff.staffIndex, voiceId: voice.voiceId, timestampNum: event.timestampNum, timestampDen: event.timestampDen, step: 'F', alter: 1, octave: 4 }]);
    assert.ok(!changed.diagnostics.some(d => d.code.endsWith('_rejected')));
    state = changed;
    const reopened = parseNxnText(serializeNxnFile({ document: state.coreDocument!, sourceMusicXml: state.sourceMusicXml }));
    assert.deepEqual(semantics(reopened.document), semantics(state.coreDocument!));
    const packed = await packXmlToMxl(state.xml);
    const extracted = await extractXmlFromMxl(packed);
    const imported = importMusicXmlToCore(extracted.xml);
    assert.deepEqual(semantics(imported), semantics(state.coreDocument!));
    assert.deepEqual(buildFallbackMidiFromMusicXml(extracted.xml), buildFallbackMidiFromMusicXml(state.xml));
  });

  test(`${name}: selection, full-measure Copy/Paste, duplicate policy, Undo/Redo and exchange form one workflow`, async () => {
    let document!: ReturnType<typeof useScoreDocument>;
    function Harness() { document = useScoreDocument(source()); return null; }
    let renderer!: ReturnType<typeof create>;
    act(() => { renderer = create(React.createElement(Harness)); });
    try {
      if (document.coreDocument!.score.parts[0]!.staves[0]!.measures.length < 2) {
        act(() => { document.applyCommands([{ type: 'insertMeasureAfter', measureNumber: 1 }]); });
      }
      const initial = document.xml;
      const part = document.coreDocument!.score.parts[0]!;
      const staff = part.staves[0]!;
      const measure = staff.measures[0]!;
      const selection = measure.voices.flatMap(voice => voice.events).map(event => ({ ...event, corePartId: part.id, coreEntityId: event.id }));
      const clipboard = buildClipboardPayloadFromSelection(document.coreDocument, selection);
      assert.ok(clipboard, 'a complete one-part measure is a supported clipboard selection');
      let result: ReturnType<typeof document.applyCommands>;
      act(() => { result = document.applyCommands([{ type: 'pasteContent', targetPartId: part.id, targetStaffIndex: staff.staffIndex, targetOffset: { measureNumber: staff.measures[1]!.measureNumber, timestampNum: 0, timestampDen: 1 }, mode: 'overwrite', clipboardData: clipboard }]); });
      assert.equal(result!.applied, name !== 'linked-tab', JSON.stringify(result!));
      if (name === 'linked-tab') {
        const rejected = applyDocumentCommands({ xml: document.xml, coreDocument: document.coreDocument }, [
          { type: 'setTitle', title: 'Must not partially apply' },
          { type: 'pasteContent', targetPartId: part.id, targetStaffIndex: staff.staffIndex, targetOffset: { measureNumber: 2, timestampNum: 0, timestampDen: 1 }, mode: 'overwrite', clipboardData: clipboard },
        ]);
        assert.equal(rejected.xml, initial);
        assert.ok(rejected.diagnostics.some(d => d.code === 'clipboard_command_rejected'));
      }
      const pastedXml = document.xml;
      const pastedCore = structuredClone(document.coreDocument);
      if (name === 'linked-tab') { assert.equal(pastedXml, initial); }
      else {
        act(() => document.undo()); assert.equal(document.xml, initial);
        act(() => document.redo()); assert.equal(document.xml, pastedXml); assert.deepEqual(document.coreDocument, pastedCore);
      }
      const event = document.coreDocument!.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events.find(event => event.durationDivisions > 0)!;
      act(() => { result = document.applyCommands([{ type: 'duplicateNote', coreEntityId: event.id, corePartId: part.id, measureNumber: measure.measureNumber, staffIndex: staff.staffIndex, voiceId: event.voiceId, timestampNum: event.timestampNum, timestampDen: event.timestampDen }]); });
      if (name === 'nested-tuplet-grace' || name === 'leadsheet' || name === 'linked-tab') {
        assert.equal(result!.applied, false); assert.equal(document.xml, pastedXml);
      } else {
        assert.equal(result!.applied, true);
        const duplicated = document.xml;
        act(() => document.undo()); assert.equal(document.xml, pastedXml);
        act(() => document.redo()); assert.equal(document.xml, duplicated);
      }
      const reopened = parseNxnText(serializeNxnFile({ document: document.coreDocument!, sourceMusicXml: document.sourceMusicXml }));
      const jsonCore = (core: ScoreDocumentModel) => JSON.parse(JSON.stringify(core, (_key, value) => value instanceof Set ? [...value].sort() : value));
      assert.deepEqual(jsonCore(reopened.document), jsonCore(document.coreDocument!));
      const extracted = await extractXmlFromMxl(await packXmlToMxl(document.xml));
      assert.deepEqual(semantics(importMusicXmlToCore(extracted.xml)), semantics(document.coreDocument!));
      assert.deepEqual(buildFallbackMidiFromMusicXml(extracted.xml), buildFallbackMidiFromMusicXml(document.xml));
    } finally { act(() => renderer.unmount()); }
  });
}
