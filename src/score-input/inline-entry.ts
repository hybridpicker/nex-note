import type { NoteLocatorLike, ScoreCommand } from '@/src/shared/schemas/score-command';

/*
 * Inline entry at the caret or selection (K4 to K6 in docs/note-entry-mastery-ledger.md): what a
 * musician types into the entry popover, parsed into score commands. Pure, so that the popover can show
 * the parsed result before it commits and tests can cover the language without a browser.
 *
 * Kinds and what they accept:
 *   dynamic     pp, mf, sfz ...; `<`, `>`, cresc, dim for a hairpin over the selected range
 *   key         C, G, F#, Bb, am, f#m, or a count: 2#, 3b, 0
 *   time        3/4, 6/8, c (4/4), 3+2/8
 *   clef        treble, bass, alto, tenor (or g, f, c3, c4)
 *   repeat      |: start repeat, :| end repeat, || double, |] final, 1. 2. endings over the range
 *   line        8va, 8vb, 15ma, 15mb, ped over the selected range
 *   staffText, systemText, expression, rehearsal, tempo (Allegro, q=96, Allegro q=96)
 */

export type InlineEntryKind =
  | 'dynamic' | 'key' | 'time' | 'clef' | 'repeat' | 'line'
  | 'staffText' | 'systemText' | 'expression' | 'rehearsal' | 'tempo';

export interface InlineEntryContext {
  /** The note, rest or cursor position the entry is anchored at. */
  anchor: NoteLocatorLike;
  /** Last event of a range selection, when the selection is a range. */
  rangeEnd?: NoteLocatorLike | null;
  /** Onset right after the last event of the range (or of the anchor), as a fraction of a whole note. */
  rangeStop?: { measureNumber: number; timestampNum: number; timestampDen: number } | null;
}

export type InlineEntryResult =
  | { ok: true; summary: string; commands: ScoreCommand[] }
  | { ok: false; message: string };

const DYNAMICS = ['pppp', 'ppp', 'pp', 'p', 'mp', 'mf', 'f', 'ff', 'fff', 'ffff', 'sf', 'sfz', 'sffz', 'fz', 'fp', 'sfp', 'rf', 'rfz', 'n'];

const MAJOR_FIFTHS: Record<string, number> = { C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, 'F#': 6, 'C#': 7, F: -1, Bb: -2, Eb: -3, Ab: -4, Db: -5, Gb: -6, Cb: -7 };
const MINOR_FIFTHS: Record<string, number> = { A: 0, E: 1, B: 2, 'F#': 3, 'C#': 4, 'G#': 5, 'D#': 6, 'A#': 7, D: -1, G: -2, C: -3, F: -4, Bb: -5, Eb: -6, Ab: -7 };

const fail = (message: string): InlineEntryResult => ({ ok: false, message });

function accidentalsText(fifths: number) {
  if (fifths === 0) return 'no sharps or flats';
  const count = Math.abs(fifths);
  return `${count} ${fifths > 0 ? 'sharp' : 'flat'}${count === 1 ? '' : 's'}`;
}

export function parseKeyText(text: string): { fifths: number; name: string } | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const count = /^([0-7])\s*([#b♯♭]?)$/.exec(trimmed);
  if (count) {
    const amount = Number(count[1]);
    if (amount === 0) return { fifths: 0, name: 'C major' };
    if (!count[2]) return null;
    const fifths = count[2] === '#' || count[2] === '♯' ? amount : -amount;
    const name = Object.entries(MAJOR_FIFTHS).find(([, value]) => value === fifths)?.[0] ?? '';
    return { fifths, name: `${name} major` };
  }
  const named = /^([A-Ga-g])([#b♯♭]?)\s*(m|min|minor|maj|major|M)?$/.exec(trimmed);
  if (!named) return null;
  const accidental = named[2] === '♯' ? '#' : named[2] === '♭' ? 'b' : named[2] ?? '';
  const tonic = `${named[1]!.toUpperCase()}${accidental}`;
  // A lower-case letter is a minor key, as musicians write it: `am`, `f#m`, also plain `a`.
  const minor = named[3] ? /^(m|min|minor)$/.test(named[3]) : named[1] !== named[1]!.toUpperCase();
  const fifths = (minor ? MINOR_FIFTHS : MAJOR_FIFTHS)[tonic];
  if (fifths == null) return null;
  return { fifths, name: `${tonic.replace('#', '♯').replace(/b$/, '♭')} ${minor ? 'minor' : 'major'}` };
}

export function parseTimeText(text: string): { beats: number; beatType: number; beatGroups?: number[] } | null {
  const trimmed = text.trim().toLowerCase();
  if (trimmed === 'c') return { beats: 4, beatType: 4 };
  if (trimmed === 'c|' || trimmed === '¢') return { beats: 2, beatType: 2 };
  const match = /^(\d{1,2}(?:\+\d{1,2})*)\s*\/\s*(\d{1,2})$/.exec(trimmed);
  if (!match) return null;
  const groups = match[1]!.split('+').map(Number);
  const beats = groups.reduce((sum, group) => sum + group, 0);
  const beatType = Number(match[2]);
  if (beats < 1 || beats > 32 || ![1, 2, 4, 8, 16, 32].includes(beatType)) return null;
  return groups.length > 1 ? { beats, beatType, beatGroups: groups } : { beats, beatType };
}

export function parseClefText(text: string): { sign: 'G' | 'F' | 'C'; line: 1 | 2 | 3 | 4 | 5; name: string } | null {
  switch (text.trim().toLowerCase()) {
    case 'treble': case 'g': case 'violin': return { sign: 'G', line: 2, name: 'Treble clef' };
    case 'bass': case 'f': return { sign: 'F', line: 4, name: 'Bass clef' };
    case 'alto': case 'c': case 'c3': case 'viola': return { sign: 'C', line: 3, name: 'Alto clef' };
    case 'tenor': case 'c4': return { sign: 'C', line: 4, name: 'Tenor clef' };
    default: return null;
  }
}

export function parseTempoText(text: string): { text: string; bpm?: number } | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const metronome = /(?:^|\s)(?:q|♩|quarter)?\s*=\s*(\d{2,3})$/.exec(trimmed);
  const plainNumber = /^(\d{2,3})$/.exec(trimmed);
  if (plainNumber) return { text: `♩ = ${plainNumber[1]}`, bpm: Number(plainNumber[1]) };
  if (!metronome) return { text: trimmed };
  const bpm = Number(metronome[1]);
  const words = trimmed.slice(0, metronome.index).trim();
  return { text: words ? `${words} ♩ = ${bpm}` : `♩ = ${bpm}`, bpm };
}

function spanOf(context: InlineEntryContext) {
  const { anchor, rangeStop } = context;
  if (!rangeStop) return null;
  return {
    ...(anchor.corePartId ? { corePartId: anchor.corePartId } : {}),
    staffIndex: anchor.staffIndex,
    startMeasureNumber: anchor.measureNumber,
    startTimestampNum: anchor.timestampNum,
    startTimestampDen: anchor.timestampDen,
    stopMeasureNumber: rangeStop.measureNumber,
    stopTimestampNum: rangeStop.timestampNum,
    stopTimestampDen: rangeStop.timestampDen,
  };
}

function partScope(anchor: NoteLocatorLike) {
  return anchor.corePartId ? { corePartId: anchor.corePartId } : {};
}

export function parseInlineEntry(kind: InlineEntryKind, text: string, context: InlineEntryContext): InlineEntryResult {
  const value = text.trim();
  const { anchor } = context;
  if (!value) return fail('Type something, or press Esc to cancel.');
  const lastMeasure = context.rangeEnd?.measureNumber ?? anchor.measureNumber;

  switch (kind) {
    case 'dynamic': {
      const hairpin = /^(<|cresc\.?|crescendo)$/i.test(value) ? 'crescendo' : /^(>|dim\.?|decresc\.?|diminuendo)$/i.test(value) ? 'diminuendo' : null;
      if (hairpin) {
        const span = spanOf(context);
        if (!span) return fail('A hairpin needs a note to start from.');
        return { ok: true, summary: `${hairpin === 'crescendo' ? 'Crescendo' : 'Diminuendo'} hairpin`, commands: [{ type: 'addWedge', kind: hairpin, ...span, placement: 'below' } as ScoreCommand] };
      }
      const dynamic = value.toLowerCase();
      if (!DYNAMICS.includes(dynamic)) return fail(`"${value}" is not a dynamic. Try p, mf, ff, sfz, < or >.`);
      return { ok: true, summary: `Dynamic ${dynamic}`, commands: [{ type: 'addDynamic', ...anchor, dynamic, placement: 'below' } as ScoreCommand] };
    }
    case 'key': {
      const key = parseKeyText(value);
      if (!key) return fail(`"${value}" is not a key. Try D, Bb, f#m, 2# or 3b.`);
      return { ok: true, summary: `${key.name} (${accidentalsText(key.fifths)}) from bar ${anchor.measureNumber}`, commands: [{ type: 'setKey', fifths: key.fifths, measureNumber: anchor.measureNumber } as ScoreCommand] };
    }
    case 'time': {
      const time = parseTimeText(value);
      if (!time) return fail(`"${value}" is not a time signature. Try 3/4, 6/8 or c.`);
      return { ok: true, summary: `${time.beatGroups ? time.beatGroups.join('+') : time.beats}/${time.beatType} from bar ${anchor.measureNumber}`, commands: [{ type: 'setTimeSignature', ...time, measureNumber: anchor.measureNumber }] };
    }
    case 'clef': {
      const clef = parseClefText(value);
      if (!clef) return fail(`"${value}" is not a clef. Try treble, bass, alto or tenor.`);
      return { ok: true, summary: `${clef.name} from bar ${anchor.measureNumber}`, commands: [{ type: 'setClef', sign: clef.sign, line: clef.line, measureNumber: anchor.measureNumber, staffIndex: anchor.staffIndex, ...partScope(anchor) } as ScoreCommand] };
    }
    case 'repeat': {
      if (value === '|:') return { ok: true, summary: `Start repeat at bar ${anchor.measureNumber}`, commands: [{ type: 'addStartRepeat', measureNumber: anchor.measureNumber } as ScoreCommand] };
      if (value === ':|') return { ok: true, summary: `End repeat after bar ${lastMeasure}`, commands: [{ type: 'addEndRepeat', measureNumber: lastMeasure }] };
      if (value === ':|:' || value === ':||:') {
        return { ok: true, summary: `End repeat after bar ${lastMeasure}, start repeat at bar ${lastMeasure + 1}`, commands: [{ type: 'addEndRepeat', measureNumber: lastMeasure }, { type: 'addStartRepeat', measureNumber: lastMeasure + 1 } as ScoreCommand] };
      }
      const barline = value === '||' ? 'light-light' : value === '|]' ? 'light-heavy' : value === '|' ? 'regular' : value === ':' || value === '...' ? 'dashed' : null;
      if (barline) return { ok: true, summary: `${barline === 'light-light' ? 'Double' : barline === 'light-heavy' ? 'Final' : barline === 'dashed' ? 'Dashed' : 'Normal'} barline after bar ${lastMeasure}`, commands: [{ type: 'setBarline', measureNumber: lastMeasure, barline } as ScoreCommand] };
      const ending = /^([1-9](?:[,.-]\s*[1-9])*)\.?$/.exec(value);
      if (ending) {
        const number = ending[1]!.replace(/[.-]/g, ',').replace(/\s+/g, '');
        return {
          ok: true,
          summary: `Ending ${number}. over bar${lastMeasure > anchor.measureNumber ? `s ${anchor.measureNumber} to ${lastMeasure}` : ` ${anchor.measureNumber}`}`,
          commands: [
            { type: 'setEnding', measureNumber: anchor.measureNumber, number, endingType: 'start' },
            { type: 'setEnding', measureNumber: lastMeasure, number, endingType: 'stop' },
          ],
        };
      }
      return fail(`"${value}" is not a repeat or barline. Try |: :| || |] 1. or 2.`);
    }
    case 'line': {
      const span = spanOf(context);
      if (!span) return fail('A line needs a note to start from.');
      const lower = value.toLowerCase();
      if (lower === 'ped' || lower === 'ped.' || lower === 'pedal') return { ok: true, summary: 'Pedal line', commands: [{ type: 'addPedalSpan', ...span }] };
      const ottava = ({ '8va': '8va', '8': '8va', '8vb': '8vb', '8ba': '8vb', '15ma': '15ma', '15': '15ma', '15mb': '15mb' } as const)[lower as '8va'];
      if (!ottava) return fail(`"${value}" is not a line. Try 8va, 8vb, 15ma or ped.`);
      return { ok: true, summary: `${ottava} line`, commands: [{ type: 'addOttava', kind: ottava, ...span, placement: ottava.endsWith('b') ? 'below' : 'above' }] };
    }
    case 'staffText':
      return { ok: true, summary: `Staff text "${value}"`, commands: [{ type: 'addWords', text: value, measureNumber: anchor.measureNumber, staffIndex: anchor.staffIndex, placement: 'above', ...partScope(anchor), timestampNum: anchor.timestampNum, timestampDen: anchor.timestampDen } as ScoreCommand] };
    case 'systemText':
      return { ok: true, summary: `System text "${value}"`, commands: [{ type: 'addWords', text: value, measureNumber: anchor.measureNumber, staffIndex: 1, placement: 'above', system: true, timestampNum: anchor.timestampNum, timestampDen: anchor.timestampDen } as ScoreCommand] };
    case 'expression':
      return { ok: true, summary: `Expression "${value}"`, commands: [{ type: 'addExpressionText', text: value, measureNumber: anchor.measureNumber, staffIndex: anchor.staffIndex, placement: 'below', ...partScope(anchor), timestampNum: anchor.timestampNum, timestampDen: anchor.timestampDen } as ScoreCommand] };
    case 'rehearsal':
      return { ok: true, summary: `Rehearsal mark ${value} at bar ${anchor.measureNumber}`, commands: [{ type: 'addRehearsalMark', text: value, measureNumber: anchor.measureNumber }] };
    case 'tempo': {
      const tempo = parseTempoText(value);
      if (!tempo) return fail('Type a tempo word, a metronome mark such as q=96, or both.');
      return { ok: true, summary: `Tempo ${tempo.text} at bar ${anchor.measureNumber}`, commands: [{ type: 'addTempoText', text: tempo.text, measureNumber: anchor.measureNumber, ...(tempo.bpm ? { bpm: tempo.bpm } : {}) }] };
    }
    default:
      return fail('Unknown entry.');
  }
}

/** A lyric syllable as typed, with what follows it: Space ends the word, `-` continues it, `_` extends it. */
export function lyricSyllabic(previousContinues: boolean, continues: boolean): 'single' | 'begin' | 'middle' | 'end' {
  if (previousContinues) return continues ? 'middle' : 'end';
  return continues ? 'begin' : 'single';
}

/**
 * The key that opens the popover. MuseScore's own keys where it has them (`shortcuts.xml`: lyrics
 * Ctrl+L, chord symbol Ctrl+K, staff text Ctrl+T, system text Ctrl+Shift+T, expression Ctrl+E,
 * rehearsal mark Ctrl+M, tempo Alt+Shift+T). MuseScore reaches key, time signature, clef, repeats and
 * lines through the palette search; here they follow the tempo key: Alt+Shift+letter. Dynamics also:
 * MuseScore's Ctrl+D stays Duplicate in Nex Note (docs/keyboard-shortcuts.md, "Dynamics from the
 * keyboard").
 */
export function resolveInlineEntryShortcut(
  event: { metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean },
  letter: string | null,
): InlineEntryKind | 'lyrics' | 'chord' | null {
  if (!letter) return null;
  const meta = event.metaKey || event.ctrlKey;
  if (meta && !event.altKey && !event.shiftKey) {
    return ({ L: 'lyrics', K: 'chord', T: 'staffText', E: 'expression', M: 'rehearsal' } as const)[letter as 'L'] ?? null;
  }
  if (meta && !event.altKey && event.shiftKey) return letter === 'T' ? 'systemText' : null;
  if (!meta && event.altKey && event.shiftKey) {
    return ({ T: 'tempo', D: 'dynamic', K: 'key', M: 'time', C: 'clef', R: 'repeat', O: 'line' } as const)[letter as 'T'] ?? null;
  }
  return null;
}

/** The keys as the Command Center prints them (`Cmd` is Ctrl on Windows and Linux). */
export const INLINE_ENTRY_SHORTCUT_LABELS = {
  lyrics: 'Cmd L',
  dynamic: 'Alt Shift D',
  staffText: 'Cmd T',
  systemText: 'Shift Cmd T',
  expression: 'Cmd E',
  rehearsal: 'Cmd M',
  tempo: 'Alt Shift T',
  key: 'Alt Shift K',
  time: 'Alt Shift M',
  clef: 'Alt Shift C',
  repeat: 'Alt Shift R',
  line: 'Alt Shift O',
} as const;
