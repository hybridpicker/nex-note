import test from 'node:test';
import assert from 'node:assert/strict';
import { Midi } from '@tonejs/midi';

import { buildFallbackMidiFromMusicXml, sanitizeXmlForMidiExport } from '../lib/midi-export.ts';
import { importMusicXmlToCore } from '../src/musicxml-adapter/import/import-musicxml.ts';
import { exportCoreToMusicXml } from '../src/musicxml-adapter/export/export-core-to-musicxml.ts';
import { applyDocumentCommands, buildDocumentState } from '../src/score-core/commands/apply-document-commands.ts';

/*
 * Transposing instruments sound at concert pitch (iteration 12). MusicXML <pitch> is the written
 * pitch and <transpose> converts it to the sounding pitch. Measured with the local MuseScore CLI
 * on 2026-11-04: a B-flat clarinet's written D5 renders as MIDI 72 with <transpose> and as 74
 * (written pitch) without it, so the sanitized playback XML must keep the element.
 */

function partXml(name: string, transpose: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>${name}</part-name></score-part></part-list>
<part id="P1"><measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef>${transpose}</attributes>
<note><pitch><step>D</step><octave>5</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type></note></measure></part></score-partwise>`;
}

const CLARINET = partXml('Clarinet in Bb', '<transpose><diatonic>-1</diatonic><chromatic>-2</chromatic></transpose>');
const GUITAR = partXml('Guitar', '<transpose><diatonic>0</diatonic><chromatic>0</chromatic><octave-change>-1</octave-change></transpose>');
const FLUTE = partXml('Flute', '');

function fallbackPitches(xml: string) {
  const { data } = buildFallbackMidiFromMusicXml(sanitizeXmlForMidiExport(xml).xml) as { data: Uint8Array };
  return new Midi(data).tracks.flatMap((track) => track.notes.map((note) => note.midi));
}

test('playback XML keeps <transpose> so MuseScore renders sounding pitch', () => {
  const sanitized = sanitizeXmlForMidiExport(CLARINET);
  assert.match(sanitized.xml, /<transpose><diatonic>-1<\/diatonic><chromatic>-2<\/chromatic><\/transpose>/);
});

test('the fallback MIDI plays transposing instruments at sounding pitch', () => {
  assert.deepEqual(fallbackPitches(CLARINET), [72]);
  assert.deepEqual(fallbackPitches(GUITAR), [62]);
  assert.deepEqual(fallbackPitches(FLUTE), [74]);
});

test('octave-change is part of the model and survives export', () => {
  const core = importMusicXmlToCore(GUITAR);
  assert.equal(core.score.parts[0]!.transposeOctaveChange, -1);
  const exported = exportCoreToMusicXml(GUITAR, core);
  assert.match(exported, /<transpose><diatonic>0<\/diatonic><chromatic>0<\/chromatic><octave-change>-1<\/octave-change><\/transpose>/);
});

test('a transposition set in nex-note writes MusicXML children in schema order', () => {
  const state = buildDocumentState(FLUTE);
  const result = applyDocumentCommands(state, [{
    type: 'setPartTranspose',
    partId: state.coreDocument!.score.parts[0]!.sourcePartId ?? 'P1',
    chromatic: -2,
    diatonic: -1,
  } as never]);
  assert.match(result.xml, /<transpose><diatonic>-1<\/diatonic><chromatic>-2<\/chromatic><\/transpose>/);
});
