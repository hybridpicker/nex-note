import { PASSAGE_1 } from './keyboard-passage.ts';
import { BASS, PIANO, TREBLE, scoreXml } from './entry-fixtures.ts';

/*
 * Reference tasks R1 to R8 of docs/note-entry-mastery-prompt.md (tool T4 of the ledger). Each task has
 * a start score, the result it must reach as summary lines (test/support/score-summary.ts), a Nex Note
 * key script and the MuseScore Studio 4 key script for the same result. All music is synthetic.
 *
 * Scripts are token lists. A token is one key press: a character, a named key (`Space`, `Enter`,
 * `Tab`, `ArrowRight`) or a chord such as `Cmd+K`, `Shift+ArrowRight`, `Alt+Shift+T`. `Cmd` is the
 * platform modifier (Ctrl on Windows and Linux). A capital letter or a shifted symbol is one token.
 *
 * MuseScore scripts follow the default shortcuts in `src/app/configs/data/shortcuts.xml` at
 * `main@d83c216` and the handbook pages cited in the ledger. What neither source states is marked
 * `assumed` in the task's notes. Palette items have no shortcut in MuseScore ("MuseScore 4.1.1 does not
 * offer keyboard shortcut bindings to palette items", handbook, pedal page): they are counted as
 * `Cmd+F9`, the typed search text, one key to reach the first match and `Enter`. Keys that MuseScore
 * needs to return the focus to the score afterwards are not counted, which favours MuseScore.
 */

export type KeyScript = string[];

/** `'N 5 c d'` as tokens. */
export const keys = (script: string): KeyScript => script.trim().split(/\s+/).filter(Boolean);
/** Text typed character by character; a space is the `Space` key. */
export const text = (value: string): KeyScript => [...value].map((character) => (character === ' ' ? 'Space' : character));
/** A palette item applied from MuseScore's palette search. */
export const palette = (search: string): KeyScript => ['Cmd+F9', ...text(search), 'ArrowDown', 'Enter'];
const times = (count: number, token: string): KeyScript => Array.from({ length: count }, () => token);

export interface ReferenceTask {
  id: 'R1' | 'R2' | 'R3' | 'R4' | 'R5' | 'R6' | 'R7' | 'R8';
  title: string;
  /** The score the task starts from. */
  start: () => string;
  /** Keys alone, no pointer. Empty for the mouse-only tasks R7 and R8. */
  nex: KeyScript;
  musescore: KeyScript;
  /** The result as sorted summary lines; null where the result is another task's (R7 = R1, R8 = R6). */
  expected: string[] | null;
  sameResultAs?: ReferenceTask['id'];
  notes: string[];
}

// ---------------------------------------------------------------------------------------------
// Expected results, written by hand in a compact form and expanded to summary lines.

const VALUES: Record<string, [name: string, quarters: number]> = {
  w: ['whole', 4], h: ['half', 2], q: ['quarter', 1], e: ['eighth', 0.5], s: ['16th', 0.25],
};
const round = (value: number) => String(Math.round(value * 1000) / 1000);

/**
 * `'C5q D5e E5e F5q. G5e'` as summary lines of one voice in one bar. `+E5q` joins the chord before it,
 * `~` ties into the next note, `rq` is a rest, `[accent,staccato]` are marks, `(D5e)` is a grace note
 * before the next note, `{C5e D5e E5e}` is a triplet.
 */
export function bar(where: string, content: string, voice = 1): string[] {
  const lines: string[] = [];
  let onset = 0;
  let previousOnset = 0;
  let tuplet = false;
  for (const raw of content.trim().split(/\s+/)) {
    let token = raw;
    if (token.startsWith('{')) { tuplet = true; token = token.slice(1); }
    const closes = token.endsWith('}');
    if (closes) token = token.slice(0, -1);
    const grace = token.startsWith('(') && token.endsWith(')');
    if (grace) token = token.slice(1, -1);
    const marksMatch = /\[([^\]]*)\]$/.exec(token);
    const marks = marksMatch ? marksMatch[1]!.split(',') : [];
    if (marksMatch) token = token.slice(0, marksMatch.index);
    const tie = token.endsWith('~');
    if (tie) token = token.slice(0, -1);
    const dotted = token.endsWith('.');
    if (dotted) token = token.slice(0, -1);
    const chord = token.startsWith('+');
    if (chord) token = token.slice(1);
    const [name, quarters] = VALUES[token.slice(-1)]!;
    const pitch = token.slice(0, -1);
    const length = quarters * (dotted ? 1.5 : 1) * (tuplet ? 2 / 3 : 1);
    const at = chord ? previousOnset : onset;
    const all = [tie ? 'tie' : '', ...marks, tuplet ? '3:2' : '', grace ? 'grace' : ''].filter(Boolean);
    lines.push(`${where} v${voice} @${round(at)} ${pitch === 'r' ? 'rest' : `${chord ? '+' : ''}${pitch}`} ${name}${dotted ? '.' : ''}${all.length ? ` [${all.join(',')}]` : ''}`);
    if (!chord && !grace) { previousOnset = onset; onset += length; }
    if (closes) tuplet = false;
  }
  return lines;
}

/** Bars of one voice: `voice('', 1, ['C5q D5q E5q F5q', 'G5h E5h'])` numbers them from `first`. */
export function voice(prefix: string, voiceNumber: number, bars: Array<string | null>, first = 1): string[] {
  return bars.flatMap((content, index) => (content ? bar(`${prefix}m${first + index}`, content, voiceNumber) : []));
}

// ---------------------------------------------------------------------------------------------
// R1: eight bars, treble: the existing passage 1.

const R1: ReferenceTask = {
  id: 'R1',
  title: 'Eight bars of melody with a rest, accidentals, a tie, a triplet, a chord, a grace note, a dynamic, an accent and a slur',
  start: () => scoreXml({ beats: 4, beatType: 4, measures: 8, parts: [{ ...TREBLE }] }),
  nex: keys(PASSAGE_1),
  musescore: [
    ...keys('N 5 C 4 D E 5 . F 4 G'),
    ...keys('5 0 + G - B A'),
    ...keys('6 G 5 F E T'),
    ...keys('4 D C 5 Cmd+3 C D E 5 D'),
    ...keys('5 C Shift+E Shift+G D / 6 E'),
    // Dynamic f on the C: Ctrl+D opens the dynamics popup, the text is typed, Esc ends it.
    ...keys('5 C Cmd+D f Escape D Shift+V E S F G S A 6 B'),
    ...keys('7 C'),
  ],
  expected: [
    'm1 clef G2', 'm1 key 0', 'm1 time 4/4',
    ...voice('', 1, [
      'C5q D5e E5e F5q. G5e',
      'rq G#5q Bb5q A5q',
      'G5h F5q E5q~',
      'E5q D5e C5e {C5e D5e E5e} D5q',
      'C5q +E5q +G5q (D5e) D5q E5h',
      'C5q D5q[accent] E5q F5q',
      'G5q A5q B5h',
      'C6w',
    ]),
    'm6 @0 dynamics f',
    'slur E5@m6:2 > G5@m7:0',
  ],
  notes: [
    'MuseScore: the accent is Shift+V (`add-sforzato`), the grace note `/` (`acciaccatura`), the tie `T`, the triplet Ctrl+3 with a quarter armed, the slur `S` … `S` in note input (handbook, slurs and ties).',
    'assumed: after Esc from the dynamics popup MuseScore is still in note input at the same position (the handbook does not say).',
    'Nex Note uses Alt+. for the dynamic (one key; documented in docs/keyboard-shortcuts.md).',
  ],
};

// ---------------------------------------------------------------------------------------------
// R2: a sixteen-bar lead sheet.

const R2_MELODY = [
  'C5q D5q E5q F5q', 'G5h E5h', 'A5q G5q F5q E5q', 'D5w',
  'E5q F5q G5q A5q', 'G5h E5h', 'F5q E5q D5q E5q', 'C5w',
  'C5w', 'E5h G5h', 'A5w', 'G5h E5h',
  'F5q E5q D5q C5q', 'D5h B4h', 'C5h D5h', 'C5w',
];
const R2_MELODY_KEYS = keys('N 5 c d e f 6 g e 5 a g f e 7 d 5 e f g a 6 g e 5 f e d e 7 c c 6 e g 7 a 6 g e 5 f e d c 6 d b c d 7 c');
/** One entry per bar: a chord on beat 1, and for the bars with two chords a second one on beat 3. */
const R2_CHORDS: Array<[string, string?]> = [
  ['C'], ['Am7'], ['F', 'G7'], ['G7'], ['C/E'], ['Am7'], ['Dm7', 'G7b9'], ['C'],
  ['C7'], ['F'], ['F#dim7'], ['C/G'], ['Bb7'], ['G7'], ['Dm7', 'G7'], ['C6'],
];
const R2_VERSES = ['Morn-ing light is ris-ing o-ver the sea_', 'Eve-ning stars are fall-ing in-to the deep sea'];

function chordKeys(nextBar: string, halfBar: string, finish: string): KeyScript {
  return R2_CHORDS.flatMap(([first, second], index) => [
    ...text(first),
    ...(second ? [halfBar, ...text(second)] : []),
    index === R2_CHORDS.length - 1 ? finish : nextBar,
  ]);
}

/** Lyric lines for a verse laid under the first eleven notes of the melody. */
function lyricLines(verse: number, words: string): string[] {
  const notes = ['C5@m1:0', 'D5@m1:1', 'E5@m1:2', 'F5@m1:3', 'G5@m2:0', 'E5@m2:2', 'A5@m3:0', 'G5@m3:1', 'F5@m3:2', 'E5@m3:3', 'D5@m4:0'];
  const lines: string[] = [];
  let index = 0;
  for (const word of words.split(' ')) {
    const melisma = word.endsWith('_');
    const syllables = (melisma ? word.slice(0, -1) : word).split('-');
    syllables.forEach((syllable, position) => {
      const syllabic = syllables.length === 1 ? 'single' : position === 0 ? 'begin' : position === syllables.length - 1 ? 'end' : 'middle';
      const last = position === syllables.length - 1;
      lines.push(`lyric ${verse} ${notes[index]} "${syllable}" ${syllabic}${melisma && last ? ' extend:start' : ''}`);
      index += 1;
    });
    if (melisma) { lines.push(`lyric ${verse} ${notes[index]} "" single extend:stop`); index += 1; }
  }
  return lines;
}

const R2: ReferenceTask = {
  id: 'R2',
  title: 'Sixteen-bar lead sheet: melody, chord symbols, two verses, a repeat with first and second ending',
  start: () => scoreXml({ beats: 4, beatType: 4, measures: 16, parts: [{ ...TREBLE, name: 'Voice' }] }),
  nex: [
    ...R2_MELODY_KEYS,
    // Chord symbols from the first note: Tab goes to the next bar, Cmd+6 a half note on.
    'Cmd+Home', 'Cmd+K', ...chordKeys('Tab', 'Cmd+6', 'Enter'),
    // Verse 1, then verse 2 under it.
    'Cmd+Home', 'Cmd+L', ...text(R2_VERSES[0]!), 'Enter',
    'Cmd+Home', 'Cmd+L', ...text(R2_VERSES[1]!), 'Enter',
    // First ending and end repeat on bar 8, second ending on bar 9.
    'Cmd+Home', ...times(7, 'Cmd+ArrowRight'),
    'Alt+Shift+R', ...text('1.'), 'Enter', 'Alt+Shift+R', ...text(':|'), 'Enter',
    'Cmd+ArrowRight', 'Alt+Shift+R', ...text('2.'), 'Enter',
  ],
  musescore: [
    ...R2_MELODY_KEYS.map((token) => (/^[a-g]$/.test(token) ? token.toUpperCase() : token)),
    'Escape', 'Cmd+Home', 'Cmd+K', ...chordKeys('Cmd+ArrowRight', 'Cmd+6', 'Escape'),
    'Cmd+Home', 'Cmd+L', ...text(R2_VERSES[0]!), 'Escape',
    'Cmd+Home', 'Cmd+L', ...text(R2_VERSES[1]!), 'Escape',
    'Cmd+Home', ...times(7, 'Cmd+ArrowRight'),
    ...palette('prima'), ...palette('end repeat'),
    'Cmd+ArrowRight', ...palette('seconda'),
  ],
  expected: [
    'm1 clef G2', 'm1 key 0', 'm1 time 4/4',
    ...voice('', 1, R2_MELODY),
    ...R2_CHORDS.flatMap(([first, second], index) => [
      `m${index + 1} @0 harmony ${first}`,
      ...(second ? [`m${index + 1} @2 harmony ${second}`] : []),
    ]),
    ...lyricLines(1, R2_VERSES[0]!),
    ...lyricLines(2, R2_VERSES[1]!),
    'm8 ending 1 start', 'm8 ending 1 stop', 'm8 right repeat-end',
    'm9 ending 2 start', 'm9 ending 2 stop',
  ],
  notes: [
    'MuseScore chord symbols: Ctrl+K, text, Ctrl+Right to the next bar (`navigateToTextElementInNearMeasure` in notationactioncontroller.cpp), Ctrl+6 a half note on ("Ctrl+1 to 9: move cursor by duration number", handbook), Esc to end.',
    'MuseScore lyrics: Ctrl+L, Space to the next note, `-` hyphen, `_` melisma; "lyrics entry automatically starts in the space beneath the last entered verse" (handbook), so the second Ctrl+L on the first note starts verse 2.',
    'assumed: Ctrl+Home (`first-element`) puts the selection on the first note after Esc.',
    'MuseScore voltas and the end repeat come from the Repeats & jumps palette through the palette search.',
  ],
};

export const REFERENCE_TASKS: ReferenceTask[] = [R1, R2];

export function referenceTask(id: ReferenceTask['id']) {
  const task = REFERENCE_TASKS.find((entry) => entry.id === id);
  if (!task) throw new Error(`Reference task ${id} is not defined`);
  return task;
}

export { BASS, PIANO };
