import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { exportCoreToMusicXml } from '../src/musicxml-adapter/export/export-core-to-musicxml.ts';
import { importMusicXmlToCore } from '../src/musicxml-adapter/import/import-musicxml.ts';
import { applyDocumentCommands, buildDocumentState, type DocumentState } from '../src/score-core/commands/apply-document-commands.ts';
import { getEffectiveMeasureTimingFromStaff } from '../src/score-core/measure-timing.ts';
import type { ScoreDocumentModel, TimedEvent } from '../src/score-core/model/types.ts';
import type { ValidatedScoreCommand } from '../src/shared/schemas/score-command.ts';
import { PIANO, TREBLE, scoreXml } from './support/entry-fixtures.ts';

// The <divisions> (and <time>) an export writes must agree with the grid each bar's durations are
// written in, so saving and reopening never changes note lengths. Synthetic fixtures only.

type Measure = ScoreDocumentModel['score']['parts'][number]['staves'][number]['measures'][number];

/** Every event as part/staff/bar/voice/kind/pitch with onset and length in quarter notes. */
function quarterSummary(document: ScoreDocumentModel, options: { notesOnly?: boolean } = {}) {
  const lines: string[] = [];
  for (const part of document.score.parts) {
    for (const staff of part.staves) {
      for (const measure of staff.measures) {
        const divisions = getEffectiveMeasureTimingFromStaff(staff, { measureId: measure.id, measureNumber: measure.measureNumber })?.divisions ?? 1;
        for (const voice of measure.voices) {
          for (const event of voice.events) {
            if (options.notesOnly && event.kind !== 'note') continue;
            const pitch = event.kind === 'note' ? `${event.pitch.step}${event.pitch.alter}${event.pitch.octave}` : 'r';
            const onset = (event.timestampNum / Math.max(event.timestampDen, 1)) * 4;
            lines.push(`${part.sourcePartId}/${staff.staffIndex}/m${measure.measureNumber}/v${voice.voiceId}/${pitch}${event.isChord ? '+' : ''}@${onset.toFixed(4)}:${(event.durationDivisions / divisions).toFixed(4)}`);
          }
        }
      }
    }
  }
  return lines.sort();
}

/**
 * The file reopens with the same notes (onsets and lengths in quarter notes), and from then on
 * save and reopen is a fixed point: the same events, rests included, and the same XML. The first
 * reopening may still fill a gap in an under-full bar of the source file with a rest.
 */
function assertRoundTripKeepsMusic(xml: string, document: ScoreDocumentModel, label: string, options: { restsToo?: boolean } = {}) {
  const reopened = buildDocumentState(xml);
  const notesOnly = !options.restsToo;
  assert.deepEqual(quarterSummary(reopened.coreDocument!, { notesOnly }), quarterSummary(document, { notesOnly }), `${label}: note lengths survive save and reopen`);
  const again = buildDocumentState(reopened.xml);
  assert.deepEqual(quarterSummary(again.coreDocument!), quarterSummary(reopened.coreDocument!), `${label}: a second save and reopen keeps every event`);
  assert.equal(again.xml, reopened.xml, `${label}: export -> import -> export is a fixed point`);
}

function rescaleMeasure(measure: Measure, factor: number) {
  for (const voice of measure.voices) {
    for (const event of voice.events) {
      event.timestampNum *= factor;
      event.timestampDen *= factor;
      event.durationDivisions *= factor;
    }
  }
}

const note = (step: string, duration: number, type: string) => (
  `<note><pitch><step>${step}</step><octave>5</octave></pitch><duration>${duration}</duration><voice>1</voice><type>${type}</type></note>`
);
const rest = (duration: number, type: string) => `<note><rest/><duration>${duration}</duration><voice>1</voice><type>${type}</type></note>`;

test('export: a bar that inherits divisions does not keep a stale <divisions> from the source file (seeds 48/115)', () => {
  // The source file states <divisions>4</divisions> in bar 2. In the model bar 2 no longer states
  // divisions and inherits 8 from bar 1, with its durations on that grid.
  const source = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1"><part-list><score-part id="P1"><part-name>Flute</part-name></score-part></part-list>
<part id="P1">
<measure number="1"><attributes><divisions>8</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>${note('C', 32, 'whole')}</measure>
<measure number="2"><attributes><divisions>4</divisions></attributes>${rest(4, 'quarter')}${note('B', 4, 'quarter')}${rest(8, 'half')}</measure>
</part></score-partwise>`;
  const document = importMusicXmlToCore(source);
  const bar2 = document.score.parts[0]!.staves[0]!.measures[1]!;
  bar2.attributes = bar2.attributes.map((attribute) => ({ ...attribute, divisions: undefined }));
  rescaleMeasure(bar2, 2);

  const xml = exportCoreToMusicXml(source, document);
  const bar2Xml = xml.match(/<measure number="2"[\s\S]*?<\/measure>/)![0];
  assert.doesNotMatch(bar2Xml, /<divisions>4<\/divisions>/);
  assertRoundTripKeepsMusic(xml, document, 'stale divisions', { restsToo: true });
  const reopened = quarterSummary(importMusicXmlToCore(xml)).filter((line) => line.includes('/m2/'));
  // A quarter rest, the quarter B and a half rest: not a half rest, a half B and a whole rest.
  assert.deepEqual(reopened, ['P1/1/m2/v1/B05@1.0000:1.0000', 'P1/1/m2/v1/r@0.0000:1.0000', 'P1/1/m2/v1/r@2.0000:2.0000']);
});

test('export: a bar that states its own divisions in the model writes them though the source file has none', () => {
  const source = scoreXml({ beats: 4, beatType: 4, measures: 2, parts: [{ ...TREBLE, content: {
    '1:1': note('C', 16, 'whole'),
    '2:1': rest(4, 'quarter') + note('D', 4, 'quarter') + rest(8, 'half'),
  } }] });
  const document = importMusicXmlToCore(source);
  const [bar1, bar2] = document.score.parts[0]!.staves[0]!.measures;
  const base = bar1!.attributes[0]!.divisions!;
  bar2!.attributes = [{ id: `${bar2!.id}:attr`, divisions: base * 2, clefs: [] }];
  rescaleMeasure(bar2!, 2);
  const xml = exportCoreToMusicXml(source, document);
  assert.match(xml.match(/<measure number="2"[\s\S]*?<\/measure>/)![0], new RegExp(`<divisions>${base * 2}</divisions>`));
  assertRoundTripKeepsMusic(xml, document, 'own divisions', { restsToo: true });
});

test('export: a kept <time> that is not the bar\'s meter is corrected', () => {
  const source = scoreXml({ beats: 4, beatType: 4, measures: 2, parts: [{ ...TREBLE, content: {
    '1:1': note('C', 16, 'whole'),
    '2:1': `<attributes><time><beats>4</beats><beat-type>4</beat-type></time></attributes>${note('D', 16, 'whole')}`,
  } }] });
  const document = importMusicXmlToCore(source);
  // In the model the whole piece is in 3/4 now, and bar 2 says nothing about its meter.
  const [bar1, bar2] = document.score.parts[0]!.staves[0]!.measures;
  bar1!.attributes[0]!.time = { beats: 3, beatType: 4 };
  bar2!.attributes = bar2!.attributes.map((attribute) => ({ ...attribute, time: undefined }));
  for (const measure of [bar1!, bar2!]) {
    const event = measure.voices[0]!.events[0]!;
    event.durationDivisions = (event.durationDivisions * 3) / 4;
    event.durationType = 'half';
    event.isDotted = true;
  }
  const xml = exportCoreToMusicXml(source, document);
  assert.doesNotMatch(xml.match(/<measure number="2"[\s\S]*?<\/measure>/)![0], /<beats>4<\/beats>/);
  assertRoundTripKeepsMusic(xml, document, 'stale time', { restsToo: true });
});

for (const commands of [
  [{ type: 'insertMeasureBefore', measureNumber: 2 }],
  [{ type: 'insertMeasureAfter', measureNumber: 2 }],
  [{ type: 'deleteMeasure', measureNumber: 1 }],
  [{ type: 'deleteMeasure', measureNumber: 2 }],
]) {
  test(`export: divisions stay in step after ${commands[0]!.type} ${commands[0]!.measureNumber} around a change of divisions`, () => {
    // Bar 2 switches to a finer grid (8) that bar 3 inherits.
    const source = scoreXml({ beats: 4, beatType: 4, measures: 3, parts: [{ ...TREBLE, content: {
      '1:1': note('C', 16, 'whole'),
      '2:1': `<attributes><divisions>8</divisions></attributes>${note('D', 3, '16th').replace('<type>16th</type>', '<type>16th</type><dot/>')}${rest(1, '32nd')}${rest(4, 'eighth')}${rest(24, 'half').replace('<type>half</type>', '<type>half</type><dot/>')}`,
      '3:1': note('E', 8, 'quarter') + rest(24, 'half').replace('<type>half</type>', '<type>half</type><dot/>'),
    } }] });
    const state = buildDocumentState(source);
    const next = applyDocumentCommands(state, commands as ValidatedScoreCommand[]);
    assertRoundTripKeepsMusic(next.xml, next.coreDocument!, commands[0]!.type, { restsToo: true });
  });
}

// --- Property: fixture corpus and random command sequences ----------------------------------------

const FIXTURE_DIR = path.join(process.cwd(), 'test', 'fixtures');

function fixtureFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return fixtureFiles(full);
    return /\.(musicxml|xml)$/.test(entry.name) ? [full] : [];
  });
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

/**
 * Voices whose sounding events overlap (an executor defect outside the export, see the report:
 * changeNoteDuration next to tuplet units) cannot be written as sequential MusicXML voices. The
 * property is about the export, so such states are counted, not checked.
 */
function overlappingVoice(document: ScoreDocumentModel) {
  for (const part of document.score.parts) {
    for (const staff of part.staves) {
      for (const measure of staff.measures) {
        for (const voice of measure.voices) {
          let end = 0;
          const sounding = voice.events
            .filter((event) => !event.isChord && event.durationDivisions > 0)
            .sort((left, right) => left.timestampNum / left.timestampDen - right.timestampNum / right.timestampDen);
          const divisions = getEffectiveMeasureTimingFromStaff(staff, { measureId: measure.id, measureNumber: measure.measureNumber })?.divisions ?? 1;
          for (const event of sounding) {
            const start = (event.timestampNum / event.timestampDen) * 4 * divisions;
            if (start < end - 1e-6) return `${part.sourcePartId}/${staff.staffIndex}/m${measure.measureNumber}/v${voice.voiceId}`;
            end = Math.max(end, start + event.durationDivisions);
          }
        }
      }
    }
  }
  return null;
}

function randomCommand(document: ScoreDocumentModel, random: () => number): ValidatedScoreCommand | null {
  const pick = <T,>(values: readonly T[]) => values[Math.floor(random() * values.length)]!;
  const part = pick(document.score.parts);
  const staff = pick(part.staves);
  const measure = pick(staff.measures);
  const voice = measure.voices.find((entry) => entry.events.length > 0);
  const event: TimedEvent | undefined = voice ? pick(voice.events) : undefined;
  const roll = random();
  const locator = event && voice ? {
    coreEntityId: event.id,
    coreMeasureId: measure.id,
    corePartId: part.id,
    measureNumber: measure.measureNumber,
    staffIndex: staff.staffIndex,
    voiceId: voice.voiceId,
    timestampNum: event.timestampNum,
    timestampDen: event.timestampDen,
  } : null;
  const durationType = pick(['whole', 'half', 'quarter', 'eighth', '16th', '32nd'] as const);
  const isDotted = random() < 0.3;
  if (roll < 0.45 && locator) {
    return {
      type: 'insertNoteAt', ...locator, coreEntityId: undefined, step: pick(['C', 'D', 'E', 'F', 'G', 'A', 'B']), octave: 4 + Math.floor(random() * 2), alter: 0,
      durationType, isDotted, asChord: random() < 0.15,
    } as unknown as ValidatedScoreCommand;
  }
  if (roll < 0.6 && locator && event?.kind === 'note') {
    return { type: 'changeNoteDuration', ...locator, step: event.pitch.step, octave: event.pitch.octave, alter: event.pitch.alter, durationType, isDotted } as unknown as ValidatedScoreCommand;
  }
  if (roll < 0.7 && locator && event?.kind === 'note') {
    return { type: 'deleteNote', ...locator, step: event.pitch.step, octave: event.pitch.octave, alter: event.pitch.alter } as unknown as ValidatedScoreCommand;
  }
  if (roll < 0.8) return { type: pick(['insertMeasureBefore', 'insertMeasureAfter'] as const), measureNumber: measure.measureNumber } as unknown as ValidatedScoreCommand;
  if (roll < 0.88) return { type: 'deleteMeasure', measureNumber: measure.measureNumber } as unknown as ValidatedScoreCommand;
  const [beats, beatType] = pick([[2, 4], [3, 4], [4, 4], [6, 8]] as const);
  return { type: 'setTimeSignature', beats, beatType, measureNumber: measure.measureNumber } as unknown as ValidatedScoreCommand;
}

test('property: save and reopen keeps every note length, on the corpus and after random edits', { timeout: 0 }, () => {
  const corpus = [
    ...fixtureFiles(FIXTURE_DIR).map((file) => ({ name: path.relative(FIXTURE_DIR, file), xml: readFileSync(file, 'utf8') })),
    { name: 'treble 4/4', xml: scoreXml({ beats: 4, beatType: 4, measures: 4, parts: [TREBLE] }) },
    { name: 'piano 3/4', xml: scoreXml({ beats: 3, beatType: 4, measures: 4, parts: [PIANO] }) },
    { name: 'treble 6/8', xml: scoreXml({ beats: 6, beatType: 8, measures: 3, fifths: -2, parts: [TREBLE] }) },
  ];
  let checked = 0;
  let skippedOverlaps = 0;
  corpus.forEach(({ name, xml }, fixtureIndex) => {
    let state: DocumentState = buildDocumentState(xml);
    assertRoundTripKeepsMusic(state.xml, state.coreDocument!, `${name} as imported`);
    for (let sequence = 0; sequence < 3; sequence += 1) {
      const random = mulberry32(48_115 + fixtureIndex * 31 + sequence);
      state = buildDocumentState(xml);
      for (let step = 0; step < 12; step += 1) {
        const command = randomCommand(state.coreDocument!, random);
        if (!command) continue;
        const next = applyDocumentCommands(state, [command]);
        if (next.diagnostics.some((diagnostic) => diagnostic.code.endsWith('_rejected'))) continue;
        state = next;
        if (overlappingVoice(state.coreDocument!)) {
          skippedOverlaps += 1;
          break;
        }
        assertRoundTripKeepsMusic(state.xml, state.coreDocument!, `${name} sequence ${sequence} step ${step} ${command.type}`);
        checked += 1;
      }
    }
  });
  assert.ok(checked > 100, `checked ${checked} edited states (${skippedOverlaps} sequences stopped at an overlapping voice)`);
  assert.ok(skippedOverlaps <= 3, `${skippedOverlaps} sequences produced an overlapping voice`);
});
