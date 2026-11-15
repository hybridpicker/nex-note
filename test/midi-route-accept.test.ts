import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Midi } from '@tonejs/midi';
import { NextRequest } from 'next/server';

import {
  evaluateMuseScoreMidiOutput,
  formatMuseScoreMidiExportError,
  isCompleteStandardMidiFile,
} from '../lib/midi-export.ts';
import { POST as midiPost } from '../app/api/midi/route.ts';

function validMidi() {
  const midi = new Midi();
  const track = midi.addTrack();
  track.addNote({ midi: 60, ticks: 0, durationTicks: 480, velocity: 0.63 });
  track.addNote({ midi: 64, ticks: 480, durationTicks: 480, velocity: 0.63 });
  return midi.toArray();
}

function emptyMidi() {
  const midi = new Midi();
  midi.addTrack();
  return midi.toArray();
}

const ABORT = { code: null, signal: 'SIGABRT' as NodeJS.Signals, stderr: 'mutex lock failed', timeoutMs: 30000, timedOut: false };

test('an abnormal exit after a complete MIDI file keeps the MuseScore output', () => {
  const data = validMidi();
  const outcome = evaluateMuseScoreMidiOutput(ABORT, data);

  assert.equal(outcome.accepted, true);
  if (!outcome.accepted) return;
  assert.equal(outcome.renderer, 'musescore');
  assert.equal(outcome.data, data);
  assert.equal(outcome.abnormalExit, 'was terminated by signal SIGABRT');

  const nonZero = evaluateMuseScoreMidiOutput({ ...ABORT, code: 134, signal: null }, data);
  assert.equal(nonZero.accepted, true);
  if (nonZero.accepted) assert.equal(nonZero.abnormalExit, 'exited with code 134');
});

test('an abnormal exit with a truncated, empty or note-less file falls back', () => {
  const data = validMidi();
  for (const broken of [data.subarray(0, data.length - 1), data.subarray(0, 20), new Uint8Array(0), emptyMidi()]) {
    const outcome = evaluateMuseScoreMidiOutput(ABORT, broken);
    assert.equal(outcome.accepted, false);
    if (!outcome.accepted) assert.match(outcome.error, /terminated by signal SIGABRT: mutex lock failed/);
  }
  assert.equal(evaluateMuseScoreMidiOutput(ABORT, null).accepted, false);
  assert.equal(isCompleteStandardMidiFile(data), true);
  assert.equal(isCompleteStandardMidiFile(data.subarray(0, data.length - 1)), false);
  const notMidi = new TextEncoder().encode('RIFF....not a midi file at all');
  assert.equal(isCompleteStandardMidiFile(notMidi), false);
});

test('a clean exit keeps the previous behaviour', () => {
  const data = validMidi();
  const clean = evaluateMuseScoreMidiOutput({ code: 0, signal: null, stderr: '', timeoutMs: 30000, timedOut: false }, data);
  assert.equal(clean.accepted, true);
  if (clean.accepted) assert.equal(clean.abnormalExit, null);
  assert.equal(evaluateMuseScoreMidiOutput({ code: 0, signal: null, stderr: '', timeoutMs: 30000 }, null).accepted, false);
});

test('only a real timeout is reported as a timeout', () => {
  assert.equal(
    formatMuseScoreMidiExportError({ code: null, signal: 'SIGTERM', stderr: '', timeoutMs: 30000, timedOut: true }),
    'MuseScore MIDI export failed: timed out after 30s (SIGTERM)',
  );
  assert.equal(
    formatMuseScoreMidiExportError({ code: null, signal: 'SIGABRT', stderr: '', timeoutMs: 30000 }),
    'MuseScore MIDI export failed: was terminated by signal SIGABRT',
  );
  assert.equal(
    formatMuseScoreMidiExportError({ code: null, signal: 'SIGTERM', stderr: '', timeoutMs: 30000, timedOut: false }),
    'MuseScore MIDI export failed: was terminated by signal SIGTERM',
  );
  assert.equal(
    formatMuseScoreMidiExportError({ code: 2, signal: null, stderr: '', timeoutMs: 30000 }),
    'MuseScore MIDI export failed: exited with code 2',
  );
  const timeout = evaluateMuseScoreMidiOutput({ code: null, signal: 'SIGTERM', stderr: '', timeoutMs: 30000, timedOut: true }, null);
  assert.equal(timeout.accepted, false);
  if (!timeout.accepted) assert.equal(timeout.error, 'MuseScore MIDI export failed: timed out after 30s (SIGTERM)');
});

const ROUTE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1"><measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
    <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type></note>
  </measure></part>
</score-partwise>`;

async function postWithFakeMuseScore(midiBytes: Uint8Array) {
  const dir = mkdtempSync(join(tmpdir(), 'nex-note-fake-musescore-'));
  const source = join(dir, 'written.mid');
  const cli = join(dir, 'mscore');
  writeFileSync(source, midiBytes);
  // Writes the given file to the `-o` path, then exits abnormally like MuseScore 4.7's shutdown abort.
  writeFileSync(cli, `#!/bin/sh\ncp "${source}" "$3"\nexit 134\n`);
  chmodSync(cli, 0o755);
  const previous = process.env.MUSESCORE_CLI;
  process.env.MUSESCORE_CLI = cli;
  try {
    const response = await midiPost(new NextRequest('http://localhost/api/midi', {
      method: 'POST',
      body: JSON.stringify({ xml: ROUTE_XML }),
      headers: { 'Content-Type': 'application/json' },
    }));
    return { response, body: new Uint8Array(await response.arrayBuffer()) };
  } finally {
    if (previous === undefined) delete process.env.MUSESCORE_CLI;
    else process.env.MUSESCORE_CLI = previous;
    rmSync(dir, { recursive: true, force: true });
  }
}

test('the MIDI route answers with the MuseScore file when the process exits abnormally after writing it', async () => {
  const written = validMidi();
  const { response, body } = await postWithFakeMuseScore(written);

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('X-Nex-Note-Midi-Renderer'), 'musescore');
  assert.deepEqual(body, written);
});

test('the MIDI route falls back when the abnormally exiting process left a truncated file', async () => {
  const written = validMidi();
  const { response, body } = await postWithFakeMuseScore(written.subarray(0, written.length - 4));

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('X-Nex-Note-Midi-Renderer'), 'internal-fallback');
  assert.equal(new Midi(body).tracks[0]?.notes[0]?.midi, 60);
});
