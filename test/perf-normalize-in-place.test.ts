import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { syntheticScore } from '../scripts/benchmark-note-entry.ts';
import { importMusicXmlToCore } from '../src/musicxml-adapter/import/import-musicxml.ts';
import {
  adoptExportedMeasureNumbers,
  exportCoreToMusicXml,
  withFreshMusicXmlExport,
} from '../src/musicxml-adapter/export/export-core-to-musicxml.ts';
import { executeCoreCommands } from '../src/score-core/commands/core-command-executor.ts';
import { executeHybridCommands } from '../src/score-core/commands/hybrid-command-executor.ts';
import {
  normalizeScoreDocument,
  normalizeScoreDocumentInPlace,
} from '../src/score-core/normalize/normalize-score-document.ts';
import { normalizeScoreCommands, type ValidatedScoreCommand } from '../src/shared/schemas/score-command.ts';
import type { ScoreDocumentModel, TimedEvent } from '../src/score-core/model/types.ts';

/*
 * The hybrid executor normalizes the command executor's fresh clone in place instead of cloning
 * it a second time. These tests prove the in-place path gives a deep-equal document to the
 * cloning path, on the fixture corpus and on seeded random command sequences, and that the
 * published input document is never touched.
 */

const FIXTURE_DIR = path.join(process.cwd(), 'test', 'fixtures');

function fixtureFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return fixtureFiles(full);
    return /\.(musicxml|xml)$/.test(entry.name) ? [full] : [];
  });
}

function corpus() {
  return [
    ...fixtureFiles(FIXTURE_DIR).map((file) => ({ name: path.relative(FIXTURE_DIR, file), xml: readFileSync(file, 'utf8') })),
    { name: 'synthetic 8x2', xml: syntheticScore(8, 2) },
  ];
}

function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Located { partId: string; staffIndex: number; measureNumber: number; voiceId: number; event: TimedEvent }

function locateEvents(doc: ScoreDocumentModel): Located[] {
  return doc.score.parts.flatMap((part) => part.staves.flatMap((staff) => staff.measures.flatMap((measure) => (
    measure.voices.flatMap((voice) => voice.events.map((event) => ({
      partId: part.id, staffIndex: staff.staffIndex, measureNumber: measure.measureNumber, voiceId: voice.voiceId, event,
    })))
  ))));
}

const DURATIONS = ['whole', 'half', 'quarter', 'eighth', '16th'];
const STEPS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

function randomCommand(doc: ScoreDocumentModel, random: () => number): ValidatedScoreCommand[] | null {
  const pick = <T,>(values: readonly T[]) => values[Math.floor(random() * values.length)]!;
  const events = locateEvents(doc);
  if (events.length === 0) return null;
  const target = pick(events);
  const locator = {
    coreEntityId: target.event.id,
    corePartId: target.partId,
    measureNumber: target.measureNumber,
    staffIndex: target.staffIndex,
    voiceId: target.voiceId,
    timestampNum: target.event.timestampNum,
    timestampDen: target.event.timestampDen,
    ...(target.event.kind === 'note'
      ? { step: target.event.pitch.step, octave: target.event.pitch.octave, alter: target.event.pitch.alter, isRest: false }
      : { isRest: true }),
  };
  const measureNumbers = [...new Set(doc.score.parts[0]!.staves[0]!.measures.map((measure) => measure.measureNumber))];
  const raw = pick<Record<string, unknown>>([
    { type: 'changeNotePitch', ...locator, step: pick(STEPS), octave: 3 + Math.floor(random() * 3), alter: pick([-1, 0, 0, 1]) },
    { type: 'changeNoteDuration', ...locator, durationType: pick(DURATIONS), isDotted: random() < 0.25 },
    { type: 'replaceWithRest', ...locator, durationType: pick(DURATIONS), isDotted: false },
    { type: 'deleteNote', ...locator },
    { type: 'transposeChromatic', ...locator, semitones: pick([-2, -1, 1, 2, 12]) },
    { type: 'toggleTie', ...locator },
    {
      type: 'insertNoteAt', corePartId: target.partId, measureNumber: target.measureNumber, staffIndex: target.staffIndex,
      voiceId: target.voiceId, timestampNum: target.event.timestampNum, timestampDen: target.event.timestampDen,
      step: pick(STEPS), octave: 4, alter: 0, durationType: pick(DURATIONS), asChord: random() < 0.3,
    },
    {
      type: 'insertRestAt', corePartId: target.partId, measureNumber: target.measureNumber, staffIndex: target.staffIndex,
      voiceId: target.voiceId, timestampNum: target.event.timestampNum, timestampDen: target.event.timestampDen,
      durationType: pick(DURATIONS),
    },
    { type: 'insertMeasureAfter', measureNumber: pick(measureNumbers) },
    { type: 'setTimeSignature', beats: pick([2, 3, 4, 6]), beatType: pick([4, 8]), measureNumber: pick(measureNumbers) },
    { type: 'setTitle', title: `  Synthetic title ${Math.floor(random() * 100)}  ` },
  ]);
  try {
    return normalizeScoreCommands([raw]);
  } catch {
    return null;
  }
}

/**
 * Runs `work` with a fixed clock and a seeded Math.random, so two executions of the same commands
 * generate the same new event ids (the executor derives some ids from Date.now()).
 */
function deterministic<T>(seed: number, work: () => T): T {
  const realNow = Date.now;
  const realRandom = Math.random;
  let clock = 1_700_000_000_000 + seed;
  Date.now = () => clock++;
  Math.random = mulberry32(seed);
  try {
    return work();
  } finally {
    Date.now = realNow;
    Math.random = realRandom;
  }
}

function assertInPlaceMatchesCloning(document: ScoreDocumentModel, label: string) {
  const ownCopy = structuredClone(document);
  const before = JSON.stringify(document);
  const cloned = normalizeScoreDocument(document);
  assert.equal(JSON.stringify(document), before, `${label}: the cloning path leaves its input alone`);
  const inPlace = normalizeScoreDocumentInPlace(ownCopy);
  assert.equal(inPlace, ownCopy, `${label}: the in-place path returns its input`);
  assert.deepStrictEqual(inPlace, cloned, `${label}: in-place equals cloning`);
}

test('in-place normalization equals cloning normalization on the fixture corpus', () => {
  for (const { name, xml } of corpus()) {
    const imported = importMusicXmlToCore(xml);
    assertInPlaceMatchesCloning(imported, `${name} (imported)`);
    assertInPlaceMatchesCloning(normalizeScoreDocument(imported), `${name} (normalized twice)`);
  }
});

test('in-place normalization equals cloning normalization on random command results', { timeout: 0 }, () => {
  const sequences = Number(process.env.NEX_NORMALIZE_SEQUENCES ?? 2);
  const length = Number(process.env.NEX_NORMALIZE_LENGTH ?? 12);
  let executed = 0;
  for (const [fixtureIndex, { name, xml }] of corpus().entries()) {
    for (let sequence = 0; sequence < sequences; sequence += 1) {
      const random = mulberry32(20261115 + fixtureIndex * 1000 + sequence);
      let doc = normalizeScoreDocument(importMusicXmlToCore(xml));
      for (let step = 0; step < length; step += 1) {
        const commands = randomCommand(doc, random);
        if (!commands) continue;
        const published = JSON.stringify(doc);
        const execution = executeCoreCommands(doc, commands);
        assert.equal(JSON.stringify(doc), published, `${name}: the executor does not mutate its input`);
        if (execution.coreDocument === doc) continue;
        const label = `${name} seq ${sequence} step ${step} ${commands[0]!.type}`;
        const cloned = normalizeScoreDocument(execution.coreDocument);
        const inPlace = normalizeScoreDocumentInPlace(execution.coreDocument);
        assert.equal(inPlace, execution.coreDocument, label);
        assert.deepStrictEqual(inPlace, cloned, label);
        assert.equal(JSON.stringify(doc), published, `${label}: the published document is untouched`);
        executed += 1;
        doc = inPlace;
      }
    }
  }
  assert.ok(executed > 20, `executed ${executed} changing commands`);
});

test('the hybrid executor output equals the old clone-normalize-export pipeline', { timeout: 0 }, () => {
  let compared = 0;
  for (const [fixtureIndex, { name, xml: sourceXml }] of corpus().entries()) {
    const random = mulberry32(7_000 + fixtureIndex);
    let xml = sourceXml;
    let doc: ScoreDocumentModel | null = normalizeScoreDocument(importMusicXmlToCore(xml));
    for (let step = 0; step < 10 && doc; step += 1) {
      const commands = randomCommand(doc, random);
      if (!commands) continue;
      const published: string = JSON.stringify(doc);
      // Oracle: the pre-change pipeline (clone in the executor, clone again in normalization).
      const oracle = deterministic(step, () => withFreshMusicXmlExport(() => {
        const execution = executeCoreCommands(doc!, commands);
        if (execution.coreDocument === doc) return null;
        const normalized = normalizeScoreDocument(execution.coreDocument);
        const nextXml = exportCoreToMusicXml(xml, normalized);
        adoptExportedMeasureNumbers(normalized);
        return { xml: nextXml, coreDocument: normalized };
      }));
      const result = deterministic(step, () => executeHybridCommands(xml, doc, commands));
      assert.equal(JSON.stringify(doc), published, `${name}: the hybrid executor leaves the input document alone`);
      if (!oracle || result.fallbackCommands.length > 0) {
        doc = result.coreDocument;
        xml = result.xml;
        continue;
      }
      const label = `${name} step ${step} ${commands[0]!.type}`;
      assert.equal(result.xml, oracle.xml, `${label}: xml`);
      assert.deepStrictEqual(result.coreDocument, oracle.coreDocument, `${label}: document`);
      compared += 1;
      doc = result.coreDocument;
      xml = result.xml;
    }
  }
  assert.ok(compared > 10, `compared ${compared} hybrid executions`);
});
