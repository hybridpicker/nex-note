import { readFileSync } from 'node:fs';

import { act } from 'react-test-renderer';

import { importMusicXmlToCore } from '../../src/musicxml-adapter/import/import-musicxml.ts';
import { withFreshMusicXmlExport } from '../../src/musicxml-adapter/export/export-core-to-musicxml.ts';
import { buildDocumentState } from '../../src/score-core/commands/apply-document-commands.ts';
import { validateScoreDocument } from '../../src/score-core/validation/validate-score-document.ts';
import { storedVoiceFor } from '../../src/score-input/voice-mapping.ts';
import type { SelectedNote } from '../../hooks/useNoteEditor.ts';
import { mountApp, type AppHarness } from './app-harness.ts';
import { selectableNotes, selectableNotesOf } from './entry-harness.ts';
import { BASS, CLARINET_BB, PIANO, TREBLE, scoreXml } from './entry-fixtures.ts';

/*
 * Entry fuzzer (note-entry-mastery gate 1). Seeded random sequences of entry and edit actions run
 * through the real editor and history hooks (test/support/app-harness.ts). Every fixture is
 * synthetic. After every action the document must validate, every untouched part/staff/voice lane
 * must be unchanged, and note input must still have a cursor. After every sequence, Undo to the
 * start must give the start document and Redo to the end the end document, byte for byte.
 */

// ---------------------------------------------------------------------------------------------
// Fixtures

const note = (step: string, octave: number, type: string, duration: number, voice = 1, staff?: number, extra = '') => (
  `<note><pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>${duration}</duration><voice>${voice}</voice><type>${type}</type>${staff ? `<staff>${staff}</staff>` : ''}${extra}</note>`
);
const rest = (type: string, duration: number, voice = 1, staff?: number) => (
  `<note><rest/><duration>${duration}</duration><voice>${voice}</voice><type>${type}</type>${staff ? `<staff>${staff}</staff>` : ''}</note>`
);
const quarters = (steps: string, octave: number, voice = 1, staff?: number) => (
  steps.split('').map((step) => note(step, octave, 'quarter', 4, voice, staff)).join('')
);

function grandStaffTwoVoices() {
  // Right hand: voice 1 quarters over voice 2 halves in bars 1-2. Left hand: half notes.
  const rh = (steps: string, lower: string) => `${quarters(steps, 5, 1, 1)}<backup><duration>16</duration></backup>${note(lower[0]!, 4, 'half', 8, 2, 1)}${note(lower[1]!, 4, 'half', 8, 2, 1)}`;
  const lh = `${note('C', 3, 'half', 8, 5, 2)}${note('G', 2, 'half', 8, 5, 2)}`;
  return scoreXml({
    beats: 4, beatType: 4, measures: 4,
    parts: [{ ...PIANO, content: { '1:1': rh('EDCD', 'CG'), '2:1': rh('EEED', 'CB'), '1:2': lh, '2:2': lh } }],
  });
}

function pickupScore() {
  // A one-beat pickup (implicit bar 0), then three full bars of 3/4.
  const attributes = '<attributes><divisions>4</divisions><key><fifths>-1</fifths></key><time><beats>3</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>';
  const full = (steps: string) => `${quarters(steps, 5)}`;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Oboe</part-name></score-part></part-list><part id="P1">`
    + `<measure number="0" implicit="yes">${attributes}${note('C', 5, 'quarter', 4)}</measure>`
    + `<measure number="1">${full('FGA')}</measure><measure number="2">${full('BAG')}</measure>`
    + `<measure number="3"><note><rest measure="yes"/><duration>12</duration><voice>1</voice></note></measure>`
    + '</part></score-partwise>';
}

export const FUZZ_FIXTURES: Record<string, () => string> = {
  'single staff': () => scoreXml({
    beats: 4, beatType: 4, measures: 4,
    parts: [{ ...TREBLE, content: { '1:1': quarters('CDEF', 5), '2:1': quarters('GFED', 5) } }],
  }),
  'grand staff, two voices': grandStaffTwoVoices,
  'transposing part': () => scoreXml({
    beats: 4, beatType: 4, measures: 4, fifths: 2,
    parts: [{ ...CLARINET_BB, id: 'P1', content: { '1:1': quarters('DEFG', 5), '3:1': `${note('A', 5, 'half', 8)}${rest('half', 8)}` } }],
  }),
  'tuplets and graces': () => readFileSync(new URL('../fixtures/tuplet-grace-tie-transposing.musicxml', import.meta.url), 'utf8'),
  'pickup bar': pickupScore,
  'three parts': () => scoreXml({
    beats: 4, beatType: 4, measures: 3,
    parts: [
      { ...TREBLE, content: { '1:1': quarters('GABC', 4) } },
      { ...CLARINET_BB, content: { '2:1': quarters('EFGA', 4) } },
      { ...BASS, id: 'P3', content: { '1:1': `${note('C', 3, 'whole', 16)}` } },
    ],
  }),
};

// ---------------------------------------------------------------------------------------------
// Seeded randomness

export function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One fuzz action: a key token for the harness, or a click on the n-th selectable event. */
export type FuzzAction = string;

const WEIGHTED_ACTIONS: Array<[FuzzAction, number]> = [
  ['a', 6], ['b', 6], ['c', 6], ['d', 6], ['e', 6], ['f', 6], ['g', 6],
  ['3', 2], ['4', 4], ['5', 4], ['6', 2], ['7', 1], ['.', 2],
  ['0', 3], ['+', 2], ['-', 2], ['=', 1],
  ['T', 2], ['Shift+e', 1], ['Shift+g', 1],
  ['ArrowLeft', 3], ['ArrowRight', 3], ['ArrowUp', 2], ['ArrowDown', 1], ['Shift+ArrowUp', 1],
  ['Shift+ArrowLeft', 1], ['Cmd+ArrowRight', 1],
  ['Delete', 2], ['Backspace', 1],
  ['Cmd+z', 3], ['Cmd+Shift+z', 2],
  ['N', 2], ['Escape', 1],
  ['Cmd+Alt+1', 1], ['Cmd+Alt+2', 1],
  ['Cmd+3', 1], ['/', 1], ['Shift+s', 1], ['s', 1], ['J', 1], ['Q', 1], ['W', 1],
  ['Cmd+c', 1], ['Cmd+v', 1], ['R', 1], ['Alt+.', 1],
  ['click', 5],
];
const TOTAL_WEIGHT = WEIGHTED_ACTIONS.reduce((sum, [, weight]) => sum + weight, 0);

export function generateSequence(seed: number, length: number): FuzzAction[] {
  const random = mulberry32(seed);
  const actions: FuzzAction[] = [];
  for (let index = 0; index < length; index += 1) {
    let pick = random() * TOTAL_WEIGHT;
    let chosen = WEIGHTED_ACTIONS[0]![0];
    for (const [action, weight] of WEIGHTED_ACTIONS) {
      pick -= weight;
      if (pick < 0) { chosen = action; break; }
    }
    actions.push(chosen === 'click' ? `click:${Math.floor(random() * 1000)}` : chosen);
  }
  return actions;
}

// ---------------------------------------------------------------------------------------------
// Invariants

type Lane = string;

function laneKey(partId: string, staffIndex: number, voiceId: number): Lane {
  return `${partId}/s${staffIndex}/v${voiceId}`;
}

/** Content of every part/staff/voice lane, with pitches, values, ties, articulations and graces. */
export function laneContents(xml: string) {
  const core = importMusicXmlToCore(xml);
  const lanes = new Map<Lane, string[]>();
  for (const part of core.score.parts) {
    for (const staff of part.staves) {
      for (const measure of staff.measures) {
        for (const voice of measure.voices) {
          const key = laneKey(part.id, staff.staffIndex, voice.voiceId);
          const lines = lanes.get(key) ?? [];
          for (const event of voice.events) {
            const tuplets = core.tuplets.filter((tuplet) => tuplet.eventIds.includes(event.id)).map((tuplet) => `${tuplet.actualNotes}:${tuplet.normalNotes}`);
            const pitch = event.kind === 'note' ? `${event.pitch.step}${event.pitch.alter}/${event.pitch.octave}` : 'r';
            const onset = Math.round((event.timestampNum / Math.max(event.timestampDen, 1)) * 4 * 10_000) / 10_000;
            lines.push(`m${measure.measureNumber}@${onset} ${pitch} ${event.durationType}${event.isDotted ? '.' : ''}${event.kind === 'note' && event.tieStart ? '~' : ''}${event.isChord ? '+' : ''}${tuplets.length ? `{${tuplets.join(',')}}` : ''}`);
          }
          lanes.set(key, lines);
        }
      }
    }
  }
  return lanes;
}

function errorIssues(xml: string) {
  const state = buildDocumentState(xml);
  if (!state.coreDocument) return ['no_core_document'];
  return validateScoreDocument(state.coreDocument)
    .filter((issue) => issue.level === 'error')
    .map((issue) => issue.code);
}

/** Lanes an action may legitimately change: the selection's lanes and the entry lane of each staff touched. */
function addressedLanes(app: AppHarness): Set<Lane> {
  const allowed = new Set<Lane>();
  const core = app.doc.coreDocument;
  const selection: SelectedNote[] = [
    ...(app.editor.selectedNotes ?? []),
    ...(app.editor.selectedNote ? [app.editor.selectedNote] : []),
    ...(app.editor.noteInputAnchor ? [app.editor.noteInputAnchor] : []),
  ];
  for (const entry of selection) {
    const partId = entry.corePartId ?? core?.score.parts[0]?.id ?? '';
    allowed.add(laneKey(partId, entry.staffIndex, entry.voiceId));
    const entryVoice = storedVoiceFor(core, { corePartId: partId, staffIndex: entry.staffIndex }, app.editor.selectedVoice);
    allowed.add(laneKey(partId, entry.staffIndex, entryVoice));
  }
  return allowed;
}

export interface FuzzFailure {
  fixture: string;
  seed: number;
  step: number;
  actions: FuzzAction[];
  reason: string;
}

function applyAction(app: AppHarness, action: FuzzAction) {
  if (action.startsWith('click:')) {
    // The live model, as a click in the app delivers it: a re-import of the XML numbers its events
    // anew, and such an id can belong to a different event of the live document.
    const live = app.doc.coreDocument;
    const notes = live ? selectableNotesOf(live) : selectableNotes(app.xml);
    if (!notes.length) return;
    app.click(notes[Number(action.slice(6)) % notes.length]!);
    return;
  }
  app.press(action);
}

/**
 * Run one sequence. Returns the first failure, or null. Console noise from the editor's rejection
 * warnings is silenced; a rejection is allowed, only a wrong result is a failure.
 */
export function runSequence(fixture: string, seed: number, actions: FuzzAction[]): FuzzFailure | null {
  const startXml = buildDocumentState(FUZZ_FIXTURES[fixture]!()).xml;
  const startIssues = new Set(errorIssues(startXml));
  const app = mountApp(startXml);
  const warn = console.warn;
  const error = console.error;
  console.warn = () => {};
  console.error = () => {};
  const fail = (step: number, reason: string): FuzzFailure => ({ fixture, seed, step, actions: actions.slice(0, step + 1), reason });
  try {
    for (let step = 0; step < actions.length; step += 1) {
      const action = actions[step]!;
      const isHistory = action === 'Cmd+z' || action === 'Cmd+Shift+z';
      const before = laneContents(app.xml);
      const allowed = addressedLanes(app);
      try {
        applyAction(app, action);
      } catch (thrown) {
        return fail(step, `threw: ${thrown instanceof Error ? thrown.message : String(thrown)}`);
      }
      const newIssues = errorIssues(app.xml).filter((code) => !startIssues.has(code));
      if (newIssues.length) return fail(step, `document invalid: ${[...new Set(newIssues)].join(', ')}`);
      // The stored XML must hold the music the model holds: a re-export of it gives the same lanes.
      // Otherwise a later edit anywhere rewrites that music (F12) or its tuplets (F13).
      const stored = [...laneContents(app.xml)].map(([key, lines]) => `${key}: ${lines.join(' | ')}`).join('\n');
      // A fresh parse, not the exporter's cached document, which stays in place for the next action:
      // the two must agree byte for byte however long the chain of in-place reuse has become.
      const reexported = withFreshMusicXmlExport(() => buildDocumentState(app.xml).xml);
      const again = [...laneContents(reexported)].map(([key, lines]) => `${key}: ${lines.join(' | ')}`).join('\n');
      if (stored !== again) return fail(step, `stored XML is not what the model exports:\n${stored}\n=>\n${again}`);
      // And the file itself is a fixed point of import and export, byte for byte (F14).
      if (reexported !== app.xml) return fail(step, 'stored XML changes on a re-export (same music, different bytes)');
      if (!isHistory && action !== 'Cmd+v') {
        const after = laneContents(app.xml);
        // Appending or inserting a bar gives every staff a whole-bar rest there; that is structure,
        // not a change of another lane's music. Compare lanes without bars that consist of one rest
        // and did not exist before.
        const barsBefore = new Set([...before.values()].flat().map((line) => line.split('@')[0]));
        const withoutNewRestBars = (lines: string[]) => lines.filter((line) => barsBefore.has(line.split('@')[0]) || !/ r (whole|half\.|half|breve)/.test(line));
        for (const key of new Set([...before.keys(), ...after.keys()])) {
          if (allowed.has(key)) continue;
          const was = (before.get(key) ?? []).join(' | ');
          const now = withoutNewRestBars(after.get(key) ?? []).join(' | ');
          if (was !== now) return fail(step, `lane ${key} changed outside the addressed lanes [${[...allowed].join(', ')}]: ${was} => ${now}`);
        }
      }
      if (app.editor.noteInputMode && !app.editor.selectedNote) return fail(step, 'note input has no cursor');
    }
    const endXml = app.xml;
    const depth = app.doc.historyDepth;
    for (let index = 0; index < depth; index += 1) app.undo();
    if (app.xml !== startXml) return fail(actions.length - 1, `Undo to the start (${depth} steps) does not give the start document`);
    for (let index = 0; index < depth; index += 1) app.redo();
    if (app.xml !== endXml) return fail(actions.length - 1, `Redo to the end (${depth} steps) does not give the end document`);
    return null;
  } finally {
    act(() => {});
    app.unmount();
    console.warn = warn;
    console.error = error;
  }
}

/** Remove actions while the sequence still fails for the same kind of reason (delta debugging, greedy). */
export function shrink(failure: FuzzFailure): FuzzFailure {
  const kind = (reason: string) => reason.split(':')[0]!.replace(/lane \S+/, 'lane');
  let best = failure;
  let changed = true;
  while (changed) {
    changed = false;
    for (let index = 0; index < best.actions.length; index += 1) {
      const candidate = best.actions.filter((_, position) => position !== index);
      const result = runSequence(best.fixture, best.seed, candidate);
      if (result && kind(result.reason) === kind(failure.reason)) {
        best = result;
        changed = true;
        break;
      }
    }
  }
  return best;
}

export function replayScript(failure: FuzzFailure) {
  return [
    `fixture: ${failure.fixture}, seed ${failure.seed}, fails at action ${failure.step + 1}: ${failure.reason}`,
    `replay: runSequence(${JSON.stringify(failure.fixture)}, ${failure.seed}, ${JSON.stringify(failure.actions)})`,
  ].join('\n');
}
