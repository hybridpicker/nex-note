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
const PIANO_ONE_BAR = scoreXml({ beats: 4, beatType: 4, measures: 1, parts: [PIANO] });
const quarterRun = (octave: number) => ['C', 'D', 'E', 'F']
  .map((step) => `<note><pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type></note>`)
  .join('');
const LOW_QUARTERS_IN_VOICE_ONE = scoreXml({ beats: 4, beatType: 4, measures: 1, parts: [{ ...TREBLE, content: { '1:1': quarterRun(4) } }] });
const QUARTERS_IN_TWO_BARS = scoreXml({ beats: 4, beatType: 4, measures: 2, parts: [{ ...TREBLE, content: { '1:1': quarterRun(5), '2:1': quarterRun(5) } }] });
const FLUTE_CLARINET_CELLO = scoreXml({ beats: 4, beatType: 4, measures: 1, parts: [TREBLE, CLARINET_BB, { ...BASS, id: 'P3' }] });
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

/**
 * C D E F G A B C as eighths. The first note after a rest is resolved nearest to the clef's middle
 * line (MuseScore): C5 on a treble staff, C3 on a bass staff.
 */
const eighthScale = (octave: number) => ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'C']
  .map((step, index) => `m1@${index / 2} ${step}${index === 7 ? octave + 1 : octave} eighth`);
const EIGHTH_SCALE = eighthScale(5);
const BASS_EIGHTH_SCALE = eighthScale(3);

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
        'm1@0 C5 16th', 'm1@0.25 D5 16th', 'm1@0.5 E5 16th', 'm1@0.75 F5 16th',
        'm1@1 G5 16th', 'm1@1.25 A5 16th', 'm1@1.5 B5 16th', 'm1@1.75 C6 16th',
        'm1@2 D6 16th', 'm1@2.25 E6 16th', 'm1@2.5 F6 16th', 'm1@2.75 G6 16th',
        'm1@3 A6 16th', 'm1@3.25 B6 16th', 'm1@3.5 C7 16th', 'm1@3.75 D7 16th',
        'm2@0 r whole',
      ],
    }],
    batches: 16,
  },
  {
    name: 'dotted eighth and sixteenth pairs (a new duration clears the dot)',
    xml: FOUR_FOUR,
    script: 'N 4 . c 3 d 4 . e 3 f',
    expect: [{ where: {}, events: ['m1@0 C5 eighth.', 'm1@0.75 D5 16th', 'm1@1 E5 eighth.', 'm1@1.75 F5 16th', 'm1@2 r half', 'm2@0 r whole'] }],
    batches: 4,
  },
  {
    name: 'duration-first input (M) keeps a dot set before the duration key',
    xml: FOUR_FOUR,
    script: 'N M e . 5',
    expect: [{ where: {}, events: ['m1@0 E5 quarter.', 'm1@1.5 r eighth', 'm1@2 r half', 'm2@0 r whole'] }],
    batches: 1,
  },
  {
    name: 'eighth triplet from a quarter and Cmd+3, then plain eighths',
    xml: FOUR_FOUR,
    script: 'N 5 Cmd+3 c d e 4 f g',
    expect: [{ where: {}, events: ['m1@0 C5 eighth', 'm1@0.333 D5 eighth', 'm1@0.667 E5 eighth', 'm1@1 F5 eighth', 'm1@1.5 G5 eighth', 'm1@2 r half', 'm2@0 r whole'] }],
    batches: 6,
  },
  {
    name: 'sixteenth triplet from an eighth and Cmd+3',
    xml: FOUR_FOUR,
    script: 'N 4 Cmd+3 c d e',
    expect: [{ where: {}, events: ['m1@0 C5 16th', 'm1@0.167 D5 16th', 'm1@0.333 E5 16th', 'm1@0.5 r eighth', 'm1@1 r quarter', 'm1@2 r half', 'm2@0 r whole'] }],
    batches: 4,
  },
  {
    name: 'sixteenth quintuplet from a quarter and Cmd+5',
    xml: FOUR_FOUR,
    script: 'N 5 Cmd+5 c d e f g',
    expect: [{ where: {}, events: ['m1@0 C5 16th', 'm1@0.2 D5 16th', 'm1@0.4 E5 16th', 'm1@0.6 F5 16th', 'm1@0.8 G5 16th', 'm1@1 r quarter', 'm1@2 r half', 'm2@0 r whole'] }],
    batches: 6,
  },
  {
    name: 'a quarter entered on the last eighth of a bar is tied into the next bar',
    xml: FOUR_FOUR,
    script: 'N 4 c d e f g a b 5 c',
    expect: [{
      where: {},
      events: [
        ...EIGHTH_SCALE.slice(0, 7), 'm1@3.5 C6 eighth~',
        'm2@0 C6 eighth', 'm2@0.5 r eighth', 'm2@1 r quarter', 'm2@2 r half',
      ],
    }],
    batches: 8,
  },
  {
    name: 'a dotted quarter on the last eighth is tied to a quarter in the next bar',
    xml: FOUR_FOUR,
    script: 'N 4 c d e f g a b 5 . c',
    expect: [{
      where: {},
      events: [...EIGHTH_SCALE.slice(0, 7), 'm1@3.5 C6 eighth~', 'm2@0 C6 quarter', 'm2@1 r quarter', 'm2@2 r half'],
    }],
    batches: 8,
  },
  {
    name: 'a half note on beat 3 of a 3/4 bar is tied across the barline',
    xml: THREE_FOUR,
    script: 'N 5 c d 6 e',
    expect: [{ where: {}, events: ['m1@0 C5 quarter', 'm1@1 D5 quarter', 'm1@2 E5 quarter~', 'm2@0 E5 quarter', 'm2@1 r quarter', 'm2@2 r quarter'] }],
    batches: 3,
  },
  {
    name: 'an overlong value whose remainder is not a single value is rejected without changes',
    xml: FOUR_FOUR,
    script: 'N 3 c d e f g a b c d e f g a b c 6 . d',
    expect: [{
      where: {},
      events: [
        'm1@0 C5 16th', 'm1@0.25 D5 16th', 'm1@0.5 E5 16th', 'm1@0.75 F5 16th',
        'm1@1 G5 16th', 'm1@1.25 A5 16th', 'm1@1.5 B5 16th', 'm1@1.75 C6 16th',
        'm1@2 D6 16th', 'm1@2.25 E6 16th', 'm1@2.5 F6 16th', 'm1@2.75 G6 16th',
        'm1@3 A6 16th', 'm1@3.25 B6 16th', 'm1@3.5 C7 16th', 'm1@3.75 r 16th',
        'm2@0 r whole',
      ],
    }],
    batches: 15,
  },
  {
    name: 'eighths continue across the barline in 3/4',
    xml: THREE_FOUR,
    script: 'N 4 c d e f g a b c',
    expect: [{ where: {}, events: [...EIGHTH_SCALE.slice(0, 6), 'm2@0 B5 eighth', 'm2@0.5 C6 eighth', 'm2@1 r quarter', 'm2@2 r quarter'] }],
    batches: 8,
  },
  {
    name: 'eighths continue across the barline in 6/8',
    xml: SIX_EIGHT,
    script: 'N 4 c d e f g a b c',
    expect: [{ where: {}, events: [...EIGHTH_SCALE.slice(0, 6), 'm2@0 B5 eighth', 'm2@0.5 C6 eighth', 'm2@1 r quarter', 'm2@2 r quarter'] }],
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
      { where: { staff: 2, voice: 5 }, events: [...BASS_EIGHTH_SCALE, 'm2@0 r whole'] },
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
      { where: { staff: 2, voice: 6 }, events: ['m1@0 C3 eighth', 'm1@0.5 D3 eighth', 'm1@1 r quarter', 'm1@2 r half'] },
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
    expect: [{ where: { partIndex: 1 }, events: BASS_EIGHTH_SCALE }],
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
  {
    name: 'switching to voices 3 and 4 keeps the cursor position',
    xml: QUARTERS_IN_VOICE_ONE,
    script: 'N Cmd+Alt+3 4 c d Cmd+Alt+4 3 e f g a',
    expect: [
      { where: { voice: 3 }, events: ['m1@0 C5 eighth', 'm1@0.5 D5 eighth', 'm1@1 r quarter', 'm1@2 r half'] },
      { where: { voice: 4 }, events: ['m1@0 r quarter', 'm1@1 E5 16th', 'm1@1.25 F5 16th', 'm1@1.5 G5 16th', 'm1@1.75 A5 16th', 'm1@2 r half'] },
    ],
    untouched: [{ voice: 1 }],
    batches: 6,
  },
  {
    name: 'a rest and a triplet in voice 2 start at the cursor',
    xml: QUARTERS_IN_VOICE_ONE,
    script: 'N Cmd+Alt+2 5 0 Cmd+3 c d e 5 0',
    expect: [{ where: { voice: 2 }, events: ['m1@0 r quarter', 'm1@1 C5 eighth', 'm1@1.333 D5 eighth', 'm1@1.667 E5 eighth', 'm1@2 r quarter', 'm1@3 r quarter'] }],
    untouched: [{ voice: 1 }],
    batches: 6,
  },
  {
    name: 'piano left hand: a second voice after a quarter starts at the cursor',
    xml: PIANO_ONE_BAR,
    click: { staff: 2, voice: 5 },
    script: 'N 5 c Cmd+Alt+2 3 e f g a',
    expect: [
      { where: { staff: 2, voice: 5 }, events: ['m1@0 C3 quarter', 'm1@1 r quarter', 'm1@2 r half'] },
      { where: { staff: 2, voice: 6 }, events: ['m1@0 r quarter', 'm1@1 E3 16th', 'm1@1.25 F3 16th', 'm1@1.5 G3 16th', 'm1@1.75 A3 16th', 'm1@2 r half'] },
    ],
    untouched: [{ staff: 1, voice: 1 }],
    batches: 5,
  },
  {
    name: 'an accidental carries to the same pitch in another voice of the bar',
    xml: LOW_QUARTERS_IN_VOICE_ONE,
    script: 'N + f Cmd+Alt+2 5 f',
    expect: [
      { where: { voice: 1 }, events: ['m1@0 F#4 quarter', 'm1@1 D4 quarter', 'm1@2 E4 quarter', 'm1@3 F4 quarter'] },
      { where: { voice: 2 }, events: ['m1@0 r quarter', 'm1@1 F#4 quarter', 'm1@2 r half'] },
    ],
    batches: 2,
  },
  {
    name: 'the middle of three instruments receives the notes; an overlong last value is rejected',
    xml: FLUTE_CLARINET_CELLO,
    click: { partIndex: 1 },
    script: 'N 3 c d e f 4 g a 5 b 6 c',
    expect: [{ where: { partIndex: 1 }, events: ['m1@0 C5 16th', 'm1@0.25 D5 16th', 'm1@0.5 E5 16th', 'm1@0.75 F5 16th', 'm1@1 G5 eighth', 'm1@1.5 A5 eighth', 'm1@2 B5 quarter', 'm1@3 r quarter'] }],
    untouched: [{ partIndex: 0 }, { partIndex: 2 }],
    batches: 7,
  },
  {
    name: 'voice 2 eighths continue into the next bar',
    xml: QUARTERS_IN_TWO_BARS,
    script: 'N Cmd+Alt+2 4 c d e f g a b c d e',
    expect: [{
      where: { voice: 2 },
      events: ['m1@0 C5 eighth', 'm1@0.5 D5 eighth', 'm1@1 E5 eighth', 'm1@1.5 F5 eighth', 'm1@2 G5 eighth', 'm1@2.5 A5 eighth', 'm1@3 B5 eighth', 'm1@3.5 C6 eighth', 'm2@0 D6 eighth', 'm2@0.5 E6 eighth', 'm2@1 r quarter', 'm2@2 r half'],
    }],
    untouched: [{ voice: 1 }],
    batches: 10,
  },
  {
    name: 'Shift adds chord tones to the note just entered in voice 2 (MuseScore)',
    xml: QUARTERS_IN_VOICE_ONE,
    script: 'N Cmd+Alt+2 5 c Shift+e g Shift+b',
    expect: [{ where: { voice: 2 }, events: ['m1@0 C5 quarter', 'm1@0 E5(chord) quarter', 'm1@1 G4 quarter', 'm1@1 B4(chord) quarter', 'm1@2 r half'] }],
    untouched: [{ voice: 1 }],
    batches: 4,
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
