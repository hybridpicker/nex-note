import test from 'node:test';
import assert from 'node:assert/strict';

import { clickFirstEvent, documentIssues, mountEditor, normalizedXml, voiceSummary, type EntryHarness } from './support/entry-harness.ts';
import { BASS, CLARINET_BB, PIANO, TREBLE, scoreXml } from './support/entry-fixtures.ts';

/*
 * Entry-correctness matrix (owner request 2026-11-04): eighths, sixteenths, dotted values and
 * triplets entered from the keyboard in single and multiple voices, on a grand staff, in several
 * and in transposing instruments. Every scenario starts from a cold editor, clicks the first rest,
 * types one script and compares the complete resulting voice with an exact expectation. Behavior
 * follows MuseScore Studio 4 for the same keys. The harness gives a clicked rest the reference
 * octave 4; the first-note register by clef is covered by the browser tests.
 */

interface Scenario {
  name: string;
  xml: string;
  click?: { partIndex?: number; staff?: number; voice?: number; measure?: number };
  script: string;
  /** Exact summaries of the voices that must change. */
  expect: Array<{ where: { partIndex?: number; staff?: number; voice?: number }; events: string[] }>;
  /** Voices that must stay byte-identical in summary. */
  untouched?: Array<{ partIndex?: number; staff?: number; voice?: number }>;
  /** Expected number of committed batches (one Undo entry each). */
  batches: number;
  /** Known open defect: the scenario runs and reports, but does not fail the suite yet. */
  todo?: string;
}

const FOUR_FOUR = scoreXml({ beats: 4, beatType: 4, measures: 2, parts: [TREBLE] });
const THREE_FOUR = scoreXml({ beats: 3, beatType: 4, measures: 2, parts: [TREBLE] });
const SIX_EIGHT = scoreXml({ beats: 6, beatType: 8, measures: 2, parts: [TREBLE] });
const PIANO_TWO_BARS = scoreXml({ beats: 4, beatType: 4, measures: 2, parts: [PIANO] });
const FLUTE_AND_CELLO = scoreXml({ beats: 4, beatType: 4, measures: 1, parts: [TREBLE, BASS] });
const FLUTE_AND_CLARINET = scoreXml({ beats: 4, beatType: 4, measures: 1, parts: [TREBLE, CLARINET_BB] });
const QUARTERS_IN_VOICE_ONE = scoreXml({
  beats: 4,
  beatType: 4,
  measures: 1,
  parts: [{
    ...TREBLE,
    content: {
      '1:1': ['C', 'D', 'E', 'F']
        .map((step) => `<note><pitch><step>${step}</step><octave>5</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type></note>`)
        .join(''),
    },
  }],
});

const EIGHTH_SCALE = ['m1@0 C4 eighth', 'm1@0.5 D4 eighth', 'm1@1 E4 eighth', 'm1@1.5 F4 eighth', 'm1@2 G4 eighth', 'm1@2.5 A4 eighth', 'm1@3 B4 eighth', 'm1@3.5 C5 eighth'];

const SCENARIOS: Scenario[] = [
  {
    name: 'eighths fill a 4/4 bar',
    xml: FOUR_FOUR,
    script: 'N 4 c d e f g a b c',
    expect: [{ where: {}, events: [...EIGHTH_SCALE, 'm2@0 r whole'] }],
    batches: 8,
  },
  {
    name: 'sixteenths fill a 4/4 bar and continue the register',
    xml: FOUR_FOUR,
    script: 'N 3 c d e f g a b c d e f g a b c d',
    expect: [{
      where: {},
      events: [
        'm1@0 C4 16th', 'm1@0.25 D4 16th', 'm1@0.5 E4 16th', 'm1@0.75 F4 16th',
        'm1@1 G4 16th', 'm1@1.25 A4 16th', 'm1@1.5 B4 16th', 'm1@1.75 C5 16th',
        'm1@2 D5 16th', 'm1@2.25 E5 16th', 'm1@2.5 F5 16th', 'm1@2.75 G5 16th',
        'm1@3 A5 16th', 'm1@3.25 B5 16th', 'm1@3.5 C6 16th', 'm1@3.75 D6 16th',
        'm2@0 r whole',
      ],
    }],
    batches: 16,
  },
  {
    name: 'dotted eighth and sixteenth pairs (a new duration clears the dot)',
    xml: FOUR_FOUR,
    script: 'N 4 . c 3 d 4 . e 3 f',
    expect: [{ where: {}, events: ['m1@0 C4 eighth.', 'm1@0.75 D4 16th', 'm1@1 E4 eighth.', 'm1@1.75 F4 16th', 'm1@2 r half', 'm2@0 r whole'] }],
    batches: 4,
  },
  {
    name: 'duration-first input (M) keeps a dot set before the duration key',
    xml: FOUR_FOUR,
    script: 'N M e . 5',
    expect: [{ where: {}, events: ['m1@0 E4 quarter.', 'm1@1.5 r eighth', 'm1@2 r half', 'm2@0 r whole'] }],
    batches: 1,
  },
  {
    name: 'eighth triplet from a quarter and Cmd+3, then plain eighths',
    xml: FOUR_FOUR,
    script: 'N 5 Cmd+3 c d e 4 f g',
    expect: [{ where: {}, events: ['m1@0 C4 eighth', 'm1@0.333 D4 eighth', 'm1@0.667 E4 eighth', 'm1@1 F4 eighth', 'm1@1.5 G4 eighth', 'm1@2 r half', 'm2@0 r whole'] }],
    batches: 6,
  },
  {
    name: 'sixteenth triplet from an eighth and Cmd+3',
    xml: FOUR_FOUR,
    script: 'N 4 Cmd+3 c d e',
    expect: [{ where: {}, events: ['m1@0 C4 16th', 'm1@0.167 D4 16th', 'm1@0.333 E4 16th', 'm1@0.5 r eighth', 'm1@1 r quarter', 'm1@2 r half', 'm2@0 r whole'] }],
    batches: 4,
  },
  {
    name: 'sixteenth quintuplet from a quarter and Cmd+5',
    xml: FOUR_FOUR,
    script: 'N 5 Cmd+5 c d e f g',
    expect: [{ where: {}, events: ['m1@0 C4 16th', 'm1@0.2 D4 16th', 'm1@0.4 E4 16th', 'm1@0.6 F4 16th', 'm1@0.8 G4 16th', 'm1@1 r quarter', 'm1@2 r half', 'm2@0 r whole'] }],
    batches: 6,
  },
  {
    name: 'a quarter entered on the last eighth of a bar is tied into the next bar',
    todo: 'iteration 7: split and tie across the barline',
    xml: FOUR_FOUR,
    script: 'N 4 c d e f g a b 5 c',
    expect: [{
      where: {},
      events: [
        ...EIGHTH_SCALE.slice(0, 7), 'm1@3.5 C5 eighth~',
        'm2@0 C5 eighth', 'm2@0.5 r eighth', 'm2@1 r quarter', 'm2@2 r half',
      ],
    }],
    batches: 8,
  },
  {
    name: 'eighths continue across the barline in 3/4',
    xml: THREE_FOUR,
    script: 'N 4 c d e f g a b c',
    expect: [{ where: {}, events: [...EIGHTH_SCALE.slice(0, 6), 'm2@0 B4 eighth', 'm2@0.5 C5 eighth', 'm2@1 r quarter', 'm2@2 r quarter'] }],
    batches: 8,
  },
  {
    name: 'eighths continue across the barline in 6/8',
    xml: SIX_EIGHT,
    script: 'N 4 c d e f g a b c',
    expect: [{ where: {}, events: [...EIGHTH_SCALE.slice(0, 6), 'm2@0 B4 eighth', 'm2@0.5 C5 eighth', 'm2@1 r quarter', 'm2@2 r quarter'] }],
    batches: 8,
  },
  {
    name: 'voice 2 eighths under voice 1 quarters',
    xml: QUARTERS_IN_VOICE_ONE,
    script: 'N Cmd+Alt+2 4 c d e f g a b c',
    expect: [{
      where: { voice: 2 },
      events: ['m1@0 C5 eighth', 'm1@0.5 D5 eighth', 'm1@1 E5 eighth', 'm1@1.5 F5 eighth', 'm1@2 G5 eighth', 'm1@2.5 A5 eighth', 'm1@3 B5 eighth', 'm1@3.5 C6 eighth'],
    }],
    untouched: [{ voice: 1 }],
    batches: 8,
  },
  {
    name: 'piano left hand stored as MusicXML voice 5 receives the notes in that voice',
    xml: PIANO_TWO_BARS,
    click: { staff: 2, voice: 5 },
    script: 'N 4 c d e f g a b c',
    expect: [
      { where: { staff: 2, voice: 5 }, events: [...EIGHTH_SCALE, 'm2@0 r whole'] },
      { where: { staff: 2, voice: 1 }, events: [] },
    ],
    untouched: [{ staff: 1, voice: 1 }],
    batches: 8,
  },
  {
    name: 'piano left hand second voice is stored as MusicXML voice 6',
    xml: PIANO_TWO_BARS,
    click: { staff: 2, voice: 5 },
    script: 'N Cmd+Alt+2 4 c d',
    expect: [
      { where: { staff: 2, voice: 6 }, events: ['m1@0 C4 eighth', 'm1@0.5 D4 eighth', 'm1@1 r quarter', 'm1@2 r half'] },
      { where: { staff: 2, voice: 2 }, events: [] },
    ],
    untouched: [{ staff: 2, voice: 5 }, { staff: 1, voice: 1 }],
    batches: 2,
  },
  {
    name: 'second instrument (cello) receives the notes; the flute is untouched',
    xml: FLUTE_AND_CELLO,
    click: { partIndex: 1 },
    script: 'N 4 c d e f g a b c',
    expect: [{ where: { partIndex: 1 }, events: EIGHTH_SCALE }],
    untouched: [{ partIndex: 0 }],
    batches: 8,
  },
  {
    name: 'transposing B-flat clarinet stores the typed written pitches',
    xml: FLUTE_AND_CLARINET,
    click: { partIndex: 1 },
    script: 'N 4 c d e f g a b c',
    expect: [{ where: { partIndex: 1 }, events: EIGHTH_SCALE }],
    untouched: [{ partIndex: 0 }],
    batches: 8,
  },
];

function runScenario(scenario: Scenario): EntryHarness {
  const harness = mountEditor(scenario.xml);
  clickFirstEvent(harness, scenario.click ?? {});
  const before = harness.batches.length;
  harness.press(scenario.script);
  harness.rerender();
  (harness as EntryHarness & { committedBatches: number }).committedBatches = harness.batches.length - before;
  return harness;
}

for (const scenario of SCENARIOS) {
  test(`entry matrix: ${scenario.name}`, { todo: scenario.todo }, () => {
    const harness = runScenario(scenario);
    try {
      for (const expected of scenario.expect) {
        assert.deepEqual(voiceSummary(harness.xml, expected.where), expected.events, JSON.stringify(expected.where));
      }
      for (const where of scenario.untouched ?? []) {
        assert.deepEqual(voiceSummary(harness.xml, where), voiceSummary(normalizedXml(scenario.xml), where), `untouched ${JSON.stringify(where)}`);
      }
      assert.equal((harness as EntryHarness & { committedBatches: number }).committedBatches, scenario.batches, 'one committed batch per entered onset');
      assert.deepEqual(documentIssues(harness.xml), []);
    } finally {
      harness.unmount();
    }
  });
}
