import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MIDI_INSTRUMENTS,
  musicXmlProgramToToneProgram,
  resolveInstrumentIdFromName,
  resolveMidiInstrumentSound,
  resolveMidiSoundFromToneProgram,
  toneProgramToMusicXmlProgram,
} from '../lib/midi-instruments.ts';
import { INSTRUMENT_DEFINITIONS } from '../lib/new-score.ts';
import {
  normalizeMidiNotes,
  resolvePlaybackSoundfontInstrument,
  resolvePlaybackTrackPart,
  resolvePlaybackTrackSound,
} from '../hooks/usePlayback.ts';
import type { ScoreDocumentModel } from '../src/score-core/model/types.ts';

test('every offered instrument has one explicit MIDI sound mapping', () => {
  const offeredIds = INSTRUMENT_DEFINITIONS.map((instrument) => instrument.id);
  const missingIds = offeredIds.filter((id) => !Object.hasOwn(MIDI_INSTRUMENTS, id));

  assert.deepEqual(missingIds, []);
  for (const id of offeredIds) {
    const sound = resolveMidiInstrumentSound(id);
    assert.equal(sound.usedFallback, false, id);
    assert.ok(sound.midiProgram >= 1 && sound.midiProgram <= 128, id);
    assert.notEqual(sound.soundfont, '', id);
  }
});

test('representative instrument families use musically appropriate named presets', () => {
  assert.equal(resolveMidiInstrumentSound('piano').soundfont, 'acoustic_grand_piano');
  assert.equal(resolveMidiInstrumentSound('classical-guitar').soundfont, 'acoustic_guitar_nylon');
  assert.equal(resolveMidiInstrumentSound('violin').soundfont, 'violin');
  assert.equal(resolveMidiInstrumentSound('flute').soundfont, 'flute');
  assert.equal(resolveMidiInstrumentSound('trumpet-bb').soundfont, 'trumpet');
  assert.equal(resolveMidiInstrumentSound('soprano').soundfont, 'choir_aahs');
  assert.equal(resolveMidiInstrumentSound('five-string-electric-bass').soundfont, 'electric_bass_finger');
  assert.equal(resolveMidiInstrumentSound('mandolin').soundfont, 'acoustic_guitar_steel');
});

test('MusicXML programs are one-based while @tonejs/midi programs are zero-based', () => {
  assert.equal(musicXmlProgramToToneProgram(1), 0);
  assert.equal(musicXmlProgramToToneProgram(57), 56);
  assert.equal(toneProgramToMusicXmlProgram(0), 1);
  assert.equal(toneProgramToMusicXmlProgram(56), 57);
  assert.equal(resolveMidiSoundFromToneProgram(56).id, 'trumpet-bb');
  assert.equal(resolveMidiSoundFromToneProgram(73).id, 'flute');
});

test('percussion uses the drum preset and General MIDI channel 10', () => {
  const percussion = resolveMidiSoundFromToneProgram(0, { percussion: true });

  assert.equal(percussion.id, 'drum-set');
  assert.equal(percussion.soundfont, 'synth_drum');
  assert.equal(percussion.percussion, true);
  assert.equal(percussion.midiChannel, 10);
  assert.equal(resolveInstrumentIdFromName('Standard Drum Kit'), 'drum-set');

  const trackSound = resolvePlaybackTrackSound({
    name: 'Standard Kit',
    channel: 9,
    instrument: { number: 0, percussion: true },
  }, null);
  assert.equal(trackSound.soundfont, 'synth_drum');
});

test('unknown instruments use the documented piano fallback', () => {
  const unknown = resolveMidiInstrumentSound('glass armonica');

  assert.equal(unknown.id, 'piano');
  assert.equal(unknown.soundfont, 'acoustic_grand_piano');
  assert.equal(unknown.usedFallback, true);
  assert.equal(resolveInstrumentIdFromName('glass armonica'), null);
});

test('switching the selected part resolves a different sound immediately', () => {
  const document = {
    score: {
      parts: [
        { id: 'part-1', sourcePartId: 'P1', name: 'Piano', instrumentName: 'Piano', staves: [] },
        { id: 'part-2', sourcePartId: 'P2', name: 'Violin', instrumentName: 'Violin', staves: [] },
        { id: 'part-3', sourcePartId: 'P3', name: 'Flute', instrumentName: 'Flute', staves: [] },
      ],
    },
  } as unknown as ScoreDocumentModel;

  assert.equal(resolvePlaybackSoundfontInstrument(document, 'P1'), 'acoustic_grand_piano');
  assert.equal(resolvePlaybackSoundfontInstrument(document, 'P2'), 'violin');
  assert.equal(resolvePlaybackSoundfontInstrument(document, 'part-3'), 'flute');
});

test('simultaneous notes on different instrument tracks retain separate timbres', () => {
  const notes = normalizeMidiNotes([
    { time: 0, duration: 1, midi: 60, velocity: 0.8, soundfont: 'acoustic_grand_piano' },
    { time: 0, duration: 1, midi: 60, velocity: 0.8, soundfont: 'violin' },
  ]);

  assert.equal(notes.length, 2);
  assert.deepEqual(notes.map((note) => note.soundfont), ['acoustic_grand_piano', 'violin']);
});

test('collapsed MIDI tracks retain the identity of score parts that contain notes', () => {
  const makePart = (number: number, hasNote: boolean) => ({
    id: `part:P${number}`,
    sourcePartId: `P${number}`,
    name: number === 1 ? 'Singing bowls' : `Glockenspiel ${number - 1}`,
    instrumentName: number === 1 ? 'Singing bowls' : `Glockenspiel ${number - 1}`,
    staves: [{
      id: `staff:P${number}`,
      staffIndex: 1,
      measures: [{
        id: `measure:P${number}:1`,
        measureNumber: 1,
        voices: [{
          id: `voice:P${number}:1`,
          voiceId: 1,
          events: hasNote ? [{ kind: 'note', hidden: false }] : [{ kind: 'rest' }],
        }],
      }],
    }],
  });
  const document = {
    score: { parts: [makePart(1, true), makePart(2, false), makePart(3, false)] },
  } as unknown as ScoreDocumentModel;
  const collapsedTrack = {
    name: 'Piano',
    channel: 0,
    instrument: { number: 0, percussion: false },
  };

  assert.equal(resolvePlaybackTrackPart(collapsedTrack, document, 0, 1)?.sourcePartId, 'P1');

  const laterPartsDocument = {
    score: { parts: [makePart(1, false), makePart(2, true), makePart(3, true)] },
  } as unknown as ScoreDocumentModel;
  assert.equal(resolvePlaybackTrackPart(collapsedTrack, laterPartsDocument, 0, 2)?.sourcePartId, 'P2');
  assert.equal(resolvePlaybackTrackPart(collapsedTrack, laterPartsDocument, 1, 2)?.sourcePartId, 'P3');
});
