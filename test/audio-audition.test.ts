import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { act, create } from 'react-test-renderer';

import {
  activatePlaybackAudioContext,
  resolveAuditionDurationSeconds,
  resolveAuditionMidi,
  resolveDocumentPartPans,
  resolvePlaybackSoundfontInstrument,
  resolvePlaybackTrackSound,
  shouldResumePlaybackAudioContext,
  usePlayback,
} from '../hooks/usePlayback.ts';
import type { SelectedNote } from '../hooks/useNoteEditor.ts';
import type { ScoreDocumentModel } from '../src/score-core/model/types.ts';

function part(id: string, name: string, transpose: { chromatic?: number; diatonic?: number; octave?: number } = {}, withNote = true) {
  return {
    id,
    sourcePartId: id,
    name,
    instrumentName: name,
    ...(transpose.chromatic != null ? { chromaticTranspose: transpose.chromatic } : {}),
    ...(transpose.diatonic != null ? { diatonicTranspose: transpose.diatonic } : {}),
    ...(transpose.octave != null ? { transposeOctaveChange: transpose.octave } : {}),
    staves: [{
      id: `${id}-s1`,
      staffIndex: 1,
      measures: [{ voices: [{ events: withNote ? [{ kind: 'note', hidden: false }] : [] }] }],
    }],
  };
}

function documentWith(...parts: ReturnType<typeof part>[]) {
  return { score: { id: 'score', parts } } as unknown as ScoreDocumentModel;
}

const note = (step: string, octave: number, corePartId: string, extra: Partial<SelectedNote> = {}) => ({
  step, octave, alter: 0, isRest: false, corePartId, measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 1, ...extra,
}) as SelectedNote;

test('a B flat clarinet auditions its written D5 as the sounding C5', () => {
  const doc = documentWith(part('P1', 'Clarinet in Bb', { chromatic: -2, diatonic: -1 }));
  assert.equal(resolveAuditionMidi(note('D', 5, 'P1'), doc), 72);
});

test('a guitar part with octave-change -1 auditions an octave below the written pitch', () => {
  const doc = documentWith(part('P1', 'Guitar', { chromatic: 0, diatonic: 0, octave: -1 }));
  assert.equal(resolveAuditionMidi(note('E', 4, 'P1'), doc), 52);
  // A horn in F written C5 sounds F4.
  const horn = documentWith(part('P2', 'Horn in F', { chromatic: -7, diatonic: -4 }));
  assert.equal(resolveAuditionMidi(note('C', 5, 'P2'), horn), 65);
});

test('concert-pitch parts and notes without a part audition as written', () => {
  const doc = documentWith(part('P1', 'Flute'), part('P2', 'Clarinet in Bb', { chromatic: -2 }));
  assert.equal(resolveAuditionMidi(note('C', 4, 'P1'), doc), 60);
  assert.equal(resolveAuditionMidi({ step: 'C', octave: 4, alter: 1, corePartId: null }, doc), 61, 'no part: written pitch');
  assert.equal(resolveAuditionMidi(note('C', 4, 'P9'), null), 60);
  // The source part id of an imported part is matched too.
  assert.equal(resolveAuditionMidi(note('D', 5, 'P2'), doc), 72);
});

test('a bare "Bass" in an SATB score auditions and plays as the choir, not as piano', () => {
  // The SATB template before it has lyrics: only the other parts tell that "Bass" is a voice.
  const doc = documentWith(part('S', 'Soprano'), part('A', 'Alto'), part('T', 'Tenor'), part('B', 'Bass'));
  assert.equal(resolvePlaybackSoundfontInstrument(doc, 'B'), 'choir_aahs');
  const pianoProgramTrack = { name: 'Bass', channel: 3, instrument: { number: 0, percussion: false } };
  assert.equal(resolvePlaybackTrackSound(pianoProgramTrack, doc, 3, 4).soundfont, 'choir_aahs', 'playback picks the same sound');
  // Next to strings a bare "Bass" is the double bass, for audition and playback alike.
  const orchestra = documentWith(part('V', 'Violin'), part('C', 'Violoncello'), part('B', 'Bass'));
  assert.equal(resolvePlaybackSoundfontInstrument(orchestra, 'B'), 'contrabass');
  assert.equal(resolvePlaybackTrackSound(pianoProgramTrack, orchestra, 2, 3).soundfont, 'contrabass');
});

test('decaying instruments ring about a second; sustained ones the note length, at most 0.8 s', () => {
  assert.equal(resolveAuditionDurationSeconds({ soundfont: 'acoustic_grand_piano', durationType: 'whole' }), 1);
  assert.equal(resolveAuditionDurationSeconds({ soundfont: 'acoustic_guitar_nylon', durationType: 'eighth' }), 1);
  assert.equal(resolveAuditionDurationSeconds({ soundfont: 'violin', durationType: 'whole', quarterSeconds: 0.5 }), 0.8);
  assert.equal(resolveAuditionDurationSeconds({ soundfont: 'violin', durationType: 'quarter', quarterSeconds: 0.5 }), 0.5);
  assert.ok(Math.abs(resolveAuditionDurationSeconds({ soundfont: 'flute', durationType: 'eighth', isDotted: true, quarterSeconds: 0.6 }) - 0.45) < 1e-9);
  assert.equal(resolveAuditionDurationSeconds({ soundfont: 'flute', durationType: '32nd', quarterSeconds: 0.5 }), 0.2, 'short notes stay audible');
  assert.equal(resolveAuditionDurationSeconds({ soundfont: 'trumpet' }), 0.5, 'unknown length: a quarter at 120 bpm');
});

test('the part pans follow the seating for several parts and stay centred for one', () => {
  const solo = resolveDocumentPartPans(documentWith(part('P1', 'Violin')));
  assert.equal(solo.get('P1'), 0);
  const quartet = resolveDocumentPartPans(documentWith(part('P1', 'Violin'), part('P2', 'Viola'), part('P3', 'Violoncello'), part('P4', 'Empty', {}, false)));
  assert.equal(quartet.get('P1'), -0.35);
  assert.equal(quartet.get('P2'), 0.1);
  assert.equal(quartet.get('P3'), 0.3);
  assert.equal(quartet.has('P4'), false, 'parts without notes are not seated');
});

test('WebKit interrupted contexts are resumed like suspended ones', async () => {
  assert.equal(shouldResumePlaybackAudioContext('suspended'), true);
  assert.equal(shouldResumePlaybackAudioContext('interrupted'), true);
  assert.equal(shouldResumePlaybackAudioContext('running'), false);
  let state = 'interrupted';
  let resumes = 0;
  await activatePlaybackAudioContext({
    get state() { return state as AudioContextState; },
    async resume() { resumes += 1; state = 'running'; },
  });
  assert.equal(resumes, 1);
  assert.equal(state, 'running');
});

function installAudition() {
  const starts: Array<{ note: number; when: number; options: Record<string, unknown> | undefined }> = [];
  const contexts: Array<{ listeners: Map<string, () => void>; state: string; resumes: number }> = [];
  const replacements: Record<string, unknown> = {
    IS_REACT_ACT_ENVIRONMENT: true,
    cancelAnimationFrame() {},
    AudioContext: class {
      state = 'running';
      currentTime = 5;
      resumes = 0;
      listeners = new Map<string, () => void>();
      constructor() { contexts.push(this); }
      addEventListener(type: string, listener: () => void) { this.listeners.set(type, listener); }
      async resume() { this.resumes += 1; this.state = 'running'; }
      async close() { this.state = 'closed'; }
    },
    __NEX_NOTE_E2E_INSTRUMENT_LOADER__: async () => ({
      start(midi: number, when: number, options?: Record<string, unknown>) { starts.push({ note: midi, when, options }); return { stop() {} }; },
      stop() {},
    }),
  };
  const original = Object.fromEntries(Object.keys(replacements).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(replacements)) Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  return {
    starts,
    contexts,
    restore() {
      for (const key of Object.keys(replacements)) {
        const descriptor = original[key];
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
      }
    },
  };
}

test('note-entry audition plays the sounding pitch of a transposing part', async () => {
  const fakes = installAudition();
  const doc = documentWith(part('P1', 'Clarinet in Bb', { chromatic: -2, diatonic: -1 }), part('P2', 'Guitar', { octave: -1 }));
  let api!: ReturnType<typeof usePlayback>;
  function Harness() { api = usePlayback({ coreDocument: doc }); return null; }
  let root!: ReturnType<typeof create>;
  try {
    act(() => { root = create(React.createElement(Harness)); });
    await act(async () => { await api.previewNote(note('D', 5, 'P1', { durationType: 'quarter' })); });
    assert.deepEqual(fakes.starts.map((start) => start.note), [72]);
    assert.equal(fakes.starts[0]!.options?.duration, 0.5, 'a sustained clarinet quarter at 120 bpm');
    assert.equal(fakes.starts[0]!.when, 5.01, 'the audition starts 10 ms after the tap');
    await act(async () => { await api.previewNotes([note('E', 4, 'P2'), note('G', 4, 'P2')]); });
    assert.deepEqual(fakes.starts.slice(1).map((start) => start.note), [52, 55]);
    assert.equal(fakes.starts[1]!.options?.duration, 1, 'the guitar rings for a second');
  } finally {
    if (root) act(() => root.unmount());
    fakes.restore();
  }
});

test('an interrupted context is resumed on statechange only while playback runs', async () => {
  const fakes = installAudition();
  let api!: ReturnType<typeof usePlayback>;
  function Harness() { api = usePlayback(); return null; }
  let root!: ReturnType<typeof create>;
  try {
    act(() => { root = create(React.createElement(Harness)); });
    await act(async () => { await api.previewNote(note('C', 4, 'P1')); });
    const context = fakes.contexts[0]!;
    const listener = context.listeners.get('statechange');
    assert.ok(listener, 'the hook listens for state changes');
    context.state = 'interrupted';
    listener();
    await Promise.resolve();
    assert.equal(context.resumes, 0, 'not playing: the next tap resumes it');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
<part id="P1"><measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
${['C', 'D', 'E', 'F'].map((step) => `<note><pitch><step>${step}</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>`).join('')}
</measure></part></score-partwise>`;
    await act(async () => { assert.equal(await api.loadMidi(xml), true); });
    await act(async () => { assert.equal(await api.play(), true); });
    const resumesAtPlay = context.resumes;
    context.state = 'interrupted';
    listener();
    await Promise.resolve();
    assert.equal(context.resumes, resumesAtPlay + 1, 'playing: an interruption is resumed at once');
    act(() => api.stop());
  } finally {
    if (root) act(() => root.unmount());
    fakes.restore();
  }
});
