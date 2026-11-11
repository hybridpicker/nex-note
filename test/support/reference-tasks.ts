import { PASSAGE_1 } from './keyboard-passage.ts';
import { BASS, CLARINET_BB, PIANO, TREBLE, scoreXml } from './entry-fixtures.ts';

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

/**
 * `'n 5 c d'` as tokens. Command keys are written in lower case here: in a script a capital letter is a
 * typed capital (Shift), as in chord symbols and lyrics. `commandKeys` converts a script that names
 * keys by their caps (`N`, `T`).
 */
export const keys = (script: string): KeyScript => script.trim().split(/\s+/).filter(Boolean);
export const commandKeys = (script: string): KeyScript => keys(script).map((token) => (/^[A-Z]$/.test(token) ? token.toLowerCase() : token));
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
  nex: commandKeys(PASSAGE_1),
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
const R2_MELODY_KEYS = keys('n 5 c d e f 6 g e 5 a g f e 7 d 5 e f g a 6 g e 5 f e d e 7 c c 6 e g 7 a 6 g e 5 f e d c 6 d b c d 7 c');
/** One entry per bar: a chord on beat 1, and for the bars with two chords a second one on beat 3. */
const R2_CHORDS: Array<[string, string?]> = [
  ['C'], ['Am7'], ['F', 'G7'], ['G7'], ['C/E'], ['Am7'], ['Dm7', 'G7b9'], ['C'],
  ['C7'], ['F'], ['F#dim7'], ['C/G'], ['Bb7'], ['G7'], ['Dm7', 'G7'], ['C6'],
];
const R2_VERSES = ['Morn-ing light is ris-ing o-ver the sea_', 'Eve-ning stars are fall-ing in-to the deep sea'];

/**
 * Nex Note stores a chord symbol with an altered or added degree (`G7b9`, `Bb7#11`) as text above the
 * staff, so that it is drawn exactly as typed (`shouldRenderHarmonyAsLiteralWords` in the exporter,
 * asserted in e2e/inline-chord-visibility.spec.ts). Every other symbol is a harmony.
 */
const chordKind = (symbol: string) => (/(?:[#b]\d|add|alt)/.test(symbol.replace(/^[A-G][#b]?/, '').split('/')[0]!) ? 'words' : 'harmony');

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
      `m${index + 1} @0 ${chordKind(first)} ${first}`,
      ...(second ? [`m${index + 1} @2 ${chordKind(second)} ${second}`] : []),
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
    'G7b9 is kept as text above the staff in Nex Note (see `chordKind`); MuseScore keeps it as a chord symbol. The key count is the same.',
  ],
};

// ---------------------------------------------------------------------------------------------
// Start scores for the correction and markup tasks, written in the notation of `bar`.

const START_VALUES: Record<string, [type: string, quarters: number]> = { w: ['whole', 4], h: ['half', 2], q: ['quarter', 1], e: ['eighth', 0.5] };
/** One bar of plain notes and rests (`C5q rq G5h`) as MusicXML, `divisions` per quarter. */
function barXml(content: string, divisions: number, voiceNumber = 1): string {
  return content.trim().split(/\s+/).map((token) => {
    const [type, quarters] = START_VALUES[token.slice(-1)]!;
    const head = token.slice(0, -1);
    const duration = `<duration>${quarters * divisions}</duration><voice>${voiceNumber}</voice><type>${type}</type>`;
    if (head === 'r') return `<note><rest/>${duration}</note>`;
    const match = /^([A-G])([#b]?)(\d)$/.exec(head)!;
    const alter = match[2] === '#' ? '<alter>1</alter>' : match[2] === 'b' ? '<alter>-1</alter>' : '';
    return `<note><pitch><step>${match[1]}</step>${alter}<octave>${match[3]}</octave></pitch>${duration}</note>`;
  }).join('');
}
const melodyScore = (bars: string[], name: string) => scoreXml({
  beats: 4, beatType: 4, measures: bars.length, divisions: 4,
  parts: [{ ...TREBLE, name, content: Object.fromEntries(bars.map((content, index) => [`${index + 1}:1`, barXml(content, 4)])) }],
});

// ---------------------------------------------------------------------------------------------
// R3: sixteen bars of piano in 3/4 with a pickup. Bars are counted as the score stores them: the
// pickup is bar 1, the first full bar is bar 2, the key changes at bar 10 (printed 9).

function pianoPickupScore() {
  const full = scoreXml({ beats: 3, beatType: 4, measures: 17, parts: [{ ...PIANO }] });
  const pickupRest = (voiceNumber: number, staff: number) => `<note><rest/><duration>4</duration><voice>${voiceNumber}</voice><type>quarter</type><staff>${staff}</staff></note>`;
  let index = 0;
  return full
    .replace(/<measure number="1">(<attributes>.*?<\/attributes>).*?<\/measure>/, (_, attributes: string) => (
      `<measure number="0" implicit="yes">${attributes}${pickupRest(1, 1)}<backup><duration>4</duration></backup>${pickupRest(5, 2)}</measure>`
    ))
    .replace(/<measure number="\d+"/g, (match) => (index++ === 0 ? match : `<measure number="${index - 1}"`));
}

const R3_RIGHT = [
  'G4q',
  'C5h.', 'E5h D5q', 'C5h.', 'B4h G4q', 'A4h.', 'C5h B4q', 'A4h.', 'G4h rq',
  'B4h.', 'D5h C5q', 'B4h.', 'A4h F#4q', 'G4h.', 'B4h A4q', 'G4h.', 'G4h.',
];
const R3_RIGHT_SECOND = [null, 'E4h.', 'G4h.', 'E4h.', 'D4h.'];
const R3_LEFT = [
  null,
  'C3h.', 'G2h.', 'C3h.', 'G2h.', 'A2h.', 'G2h.', 'F2h.', 'G2h.',
  'G2h.', 'B2h.', 'D3h.', 'B2h.', 'D4h.', 'G4h.', 'B4h.', 'G4h.',
];

const R3: ReferenceTask = {
  id: 'R3',
  title: 'Sixteen bars of piano in 3/4 with a pickup: two voices in the right hand, left hand, a key change, a clef change in the left hand, dynamics, two hairpins, slurs, pedal',
  start: pianoPickupScore,
  nex: [
    // G major from the ninth full bar on, before the notes are typed.
    'Cmd+Home', ...times(9, 'Cmd+ArrowRight'), 'Alt+Shift+K', 'G', 'Enter',
    // Right hand, first voice.
    'Cmd+Home', ...keys('n 5 g'),
    ...keys('6 . c 6 e 5 d 6 . c 6 b 5 g 6 . a 6 c 5 b 6 . a 6 g 5 0'),
    ...keys('6 . b 6 d 5 c 6 . b 6 a 5 f 6 . g 6 b 5 a 6 . g g'),
    // Second voice under bars 2 to 5.
    'Cmd+Alt+2', 'Cmd+Home', 'Cmd+ArrowRight', ...keys('6 . e'), 'Cmd+ArrowDown', ...keys('g e d'),
    // Left hand.
    'Cmd+Alt+1', 'Cmd+Home', 'Alt+ArrowDown', ...keys('5 0 6 . c g c g a g f g g b d b d'), 'Cmd+ArrowUp', ...keys('g b g n'),
    // Treble clef in the left hand from bar 14.
    ...times(3, 'Cmd+ArrowLeft'), 'Alt+Shift+C', ...text('treble'), 'Enter',
    // Pedal over bars 2 and 3.
    ...times(12, 'Cmd+ArrowLeft'), 'Shift+ArrowRight', 'Alt+Shift+O', ...text('ped'), 'Enter',
    // Dynamics, slurs and hairpins in the right hand.
    'Cmd+Home', 'Alt+Shift+D', 'p', 'Enter',
    'Cmd+ArrowRight', ...times(2, 'Shift+ArrowRight'), 's',
    ...times(5, 'Cmd+ArrowRight'), 'Shift+ArrowRight', '<',
    'Cmd+ArrowRight', 'Alt+Shift+D', 'f', 'Enter', ...times(2, 'Shift+ArrowRight'), 's',
    ...times(5, 'Cmd+ArrowRight'), 'Shift+ArrowRight', '>',
  ],
  musescore: [
    'Cmd+Home', ...times(9, 'Cmd+ArrowRight'), ...palette('g major'),
    'Cmd+Home', ...keys('N 5 G'),
    ...keys('6 . C 6 E 5 D 6 . C 6 B 5 G 6 . A 6 C 5 B 6 . A 6 G 5 0'),
    ...keys('6 . B 6 D 5 C 6 . B 6 A 5 F 6 . G 6 B 5 A 6 . G G'),
    'Cmd+Alt+2', 'Cmd+Home', 'Cmd+ArrowRight', ...keys('6 . E'), 'Cmd+ArrowDown', ...keys('G E D'),
    'Cmd+Alt+1', 'Cmd+Home', 'Alt+ArrowDown', ...keys('5 0 6 . C G C G A G F G G B D B D'), 'Cmd+ArrowUp', ...keys('G B G Escape'),
    ...times(3, 'Cmd+ArrowLeft'), ...palette('treble clef'),
    ...times(12, 'Cmd+ArrowLeft'), 'Shift+ArrowRight', ...palette('pedal'),
    'Cmd+Home', 'Cmd+D', 'p', 'Escape',
    'Cmd+ArrowRight', ...times(2, 'Shift+ArrowRight'), 'S',
    ...times(5, 'Cmd+ArrowRight'), 'Shift+ArrowRight', '<',
    'Cmd+ArrowRight', 'Cmd+D', 'f', 'Escape', ...times(2, 'Shift+ArrowRight'), 'S',
    ...times(5, 'Cmd+ArrowRight'), 'Shift+ArrowRight', '>',
  ],
  expected: [
    's1 m1 clef G2', 's1 m1 key 0', 's1 m1 time 3/4', 's1 m1 pickup',
    's2 m1 clef F4', 's2 m1 key 0', 's2 m1 time 3/4', 's2 m1 pickup',
    's1 m10 key 1', 's2 m10 key 1', 's2 m14 clef G2',
    ...voice('s1 ', 1, R3_RIGHT),
    ...voice('s1 ', 2, R3_RIGHT_SECOND),
    ...voice('s2 ', 1, R3_LEFT),
    's1 m1 @0 dynamics p', 's1 m10 @0 dynamics f',
    // A hairpin and a pedal line run from the first selected note to the end of the last one.
    's1 m8 @0 wedge crescendo', 's1 m9 @2 wedge stop',
    's1 m16 @0 wedge diminuendo', 's1 m17 @3 wedge stop',
    's2 m2 @0 pedal start', 's2 m3 @3 pedal stop',
    'slur C5@s1 m2:0 > D5@s1 m3:2', 'slur B4@s1 m10:0 > C5@s1 m11:2',
  ],
  notes: [
    'MuseScore has no shortcut for key signatures, clefs and the pedal line: they come from the palette search (Ctrl+F9, the name, Down, Enter).',
    'assumed: in MuseScore note input Ctrl+Home, Ctrl+Right and Alt+Down move the input position as they move the selection, and the letter after a change of clef or voice lands in the same octave as in Nex Note.',
    'In G major the letter `f` gives F sharp in both programs.',
  ],
};

// ---------------------------------------------------------------------------------------------
// R4: four parts, three of them transposing differently; one phrase entered once and copied.

const HORN_F = { id: 'P3', name: 'Horn in F', clefs: [{ sign: 'G' as const, line: 2 }], transpose: { chromatic: -7, diatonic: -4 } };
const R4_PARTS = ['P1 ', 'P2 ', 'P3 ', 'P4 '];

const R4: ReferenceTask = {
  id: 'R4',
  title: 'Four-part ensemble with a clarinet in B flat and a horn in F, eight bars: one phrase entered once, copied to the other parts and adjusted there; the score shows written (transposed) pitch',
  start: () => scoreXml({
    beats: 4, beatType: 4, measures: 8,
    parts: [{ ...TREBLE, id: 'P1' }, { ...CLARINET_BB, id: 'P2' }, HORN_F, { ...BASS, id: 'P4' }],
  }),
  nex: [
    // The phrase, once, in the flute.
    ...keys('n 5 c d e f 6 g e 5 a g f e 7 d n'),
    // Select its four bars and copy.
    'Cmd+Home', ...times(3, 'Cmd+Shift+ArrowRight'), 'Cmd+C',
    // Clarinet: same bars, an octave lower.
    'Cmd+Home', 'Alt+ArrowDown', 'Cmd+V', 'Cmd+ArrowDown',
    // Horn: enters at bar 5, an octave lower.
    'Alt+ArrowDown', 'Cmd+ArrowRight', 'Cmd+V', 'Cmd+ArrowDown',
    // Cello: bar 1, two octaves lower, and its last note is C.
    'Cmd+Home', ...times(3, 'Alt+ArrowDown'), 'Cmd+V', 'Cmd+ArrowDown', 'Cmd+ArrowDown', 'ArrowRight', 'ArrowLeft', 'c',
  ],
  musescore: [
    ...keys('N 5 C D E F 6 G E 5 A G F E 7 D Escape'),
    'Cmd+Home', ...times(3, 'Cmd+Shift+ArrowRight'), 'Cmd+C',
    'Cmd+Home', 'Alt+ArrowDown', 'Cmd+V', 'Cmd+ArrowDown',
    'Alt+ArrowDown', 'Cmd+ArrowRight', 'Cmd+V', 'Cmd+ArrowDown',
    'Cmd+Home', ...times(3, 'Alt+ArrowDown'), 'Cmd+V', 'Cmd+ArrowDown', 'Cmd+ArrowDown', 'ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowDown',
  ],
  expected: [
    ...R4_PARTS.flatMap((part, index) => [`${part}m1 clef ${index === 3 ? 'F4' : 'G2'}`, `${part}m1 key 0`, `${part}m1 time 4/4`]),
    ...voice('P1 ', 1, ['C5q D5q E5q F5q', 'G5h E5h', 'A5q G5q F5q E5q', 'D5w']),
    // Written a major second above the sound, then an octave down.
    ...voice('P2 ', 1, ['D4q E4q F#4q G4q', 'A4h F#4h', 'B4q A4q G4q F#4q', 'E4w']),
    // Written a fifth above the sound, an octave down, from bar 5.
    ...voice('P3 ', 1, ['G4q A4q B4q C5q', 'D5h B4h', 'E5q D5q C5q B4q', 'A4w'], 5),
    ...voice('P4 ', 1, ['C3q D3q E3q F3q', 'G3h E3h', 'A3q G3q F3q E3q', 'C3w']),
  ],
  notes: [
    'Copy and paste keep the sounding pitch in MuseScore ("Concert pitch" off shows each part transposed); the same holds in Nex Note since F53. The fixture is in written pitch, which is what both programs show.',
    'MuseScore `select-next-measure` (Ctrl+Shift+Right) extends the selection to the first note of the next bar: three presses from the first note reach the whole note of bar 4.',
    'assumed: Alt+Down (`down-chord`) goes to the staff below at the same position in MuseScore, and after a paste the pasted range is selected with the focus on its last note.',
    'Nex Note changes the last cello note with the letter `c`; MuseScore outside note input moves it two semitones down with the arrow key.',
  ],
};

// ---------------------------------------------------------------------------------------------
// R5: corrections on a given sixteen-bar score.

const R5_START = [
  'C5q D5q E5q F5q', 'G5h E5h', 'A5q G5q F5q E5q', 'D5w',
  'E5q F5q G5q rq', 'G5h E5h', 'F5q E5q D5q E5q', 'C5w',
  'C5q E5q G5q E5q', 'F5h D5h', 'E5q D5q C5q D5q', 'E5w',
  'A5q G5q F5q E5q', 'D5h B4h', 'C5h D5h', 'C5w',
];

const R5: ReferenceTask = {
  id: 'R5',
  title: 'Corrections on sixteen given bars: a rhythm, a re-pitched phrase, a phrase one beat later, a phrase to voice 2, two bars inserted, a bar deleted, a value in normal mode',
  start: () => melodyScore(R5_START, 'Flute'),
  nex: [
    // Bar 2: half note to dotted quarter, and an eighth F in the rest that is left.
    'Cmd+Home', 'Cmd+ArrowRight', '5', '.', 'ArrowRight', 'f', 'n',
    // Bar 3: new pitches, same rhythm.
    'Cmd+ArrowRight', 'b', 'ArrowRight', 'a', 'ArrowRight', 'g', 'ArrowRight', 'f',
    // Bar 5: the three notes one beat later.
    ...times(2, 'Cmd+ArrowRight'), ...times(2, 'Shift+ArrowRight'), 'Cmd+X', 'ArrowRight', 'Cmd+V',
    // Bar 7 to voice 2.
    ...times(2, 'Cmd+ArrowRight'), ...times(3, 'Shift+ArrowRight'), 'Cmd+Alt+2',
    // Two bars before bar 9.
    ...times(2, 'Cmd+ArrowRight'), 'Insert', 'Insert',
    // The old bar 12 (now 14) goes.
    ...times(5, 'Cmd+ArrowRight'), 'Cmd+Delete',
    // The old bar 14 (now 15): half note to quarter.
    'Cmd+ArrowRight', '5',
  ],
  musescore: [
    'Cmd+Home', 'Cmd+ArrowRight', '5', '.', 'ArrowRight', 'N', 'F', 'Escape',
    'Cmd+ArrowRight', 'N', 'Cmd+Shift+I', 'B', 'A', 'G', 'F', 'Escape',
    ...times(2, 'Cmd+ArrowRight'), ...times(2, 'Shift+ArrowRight'), 'Cmd+X', 'ArrowRight', 'Cmd+V',
    ...times(2, 'Cmd+ArrowRight'), ...times(3, 'Shift+ArrowRight'), 'Cmd+Alt+2',
    ...times(2, 'Cmd+ArrowRight'), 'Insert', 'Insert',
    ...times(5, 'Cmd+ArrowRight'), 'Cmd+Delete',
    'Cmd+ArrowRight', '5',
  ],
  expected: [
    'm1 clef G2', 'm1 key 0', 'm1 time 4/4',
    ...voice('', 1, [
      'C5q D5q E5q F5q', 'G5q. F5e E5h', 'B5q A5q G5q F5q', 'D5w',
      'rq E5q F5q G5q', 'G5h E5h', null, 'C5w',
      null, null,
      'C5q E5q G5q E5q', 'F5h D5h', 'E5q D5q C5q D5q',
      'A5q G5q F5q E5q', 'D5q rq B4h', 'C5h D5h', 'C5w',
    ]),
    ...bar('m7', 'F5q E5q D5q E5q', 2),
  ],
  notes: [
    'MuseScore re-pitch: `N`, Ctrl+Shift+I (`repitch`), the letters, Esc. Nex Note: a letter on a selected note outside note input changes its pitch and keeps its value; Right goes on.',
    'assumed: in MuseScore `N` on a selected rest arms the rest\'s value, so `F` writes the eighth (MuseScore 4 takes the input value from the selection).',
    'assumed: after Ctrl+X Right selects the second beat in MuseScore. In Nex Note the selection after a cut is the first rest that is left, so Right is the second beat.',
    'assumed: Ctrl+Del (`time-delete`) with the only note of a bar selected removes that bar in MuseScore.',
    'In note input a rest keeps the bar\'s first voice: the bar that went to voice 2 holds rests in voice 1, which the summary does not list.',
  ],
};

// ---------------------------------------------------------------------------------------------
// R6: markup on given notes.

const R6_START = [
  'C5q D5q E5q F5q', 'G5h E5h', 'A5q G5q F5q E5q', 'D5w',
  'E5q F5q G5q A5q', 'G5h E5h', 'F5q E5q D5q E5q', 'C5w',
];

const R6: ReferenceTask = {
  id: 'R6',
  title: 'Markup on eight given bars: tempo, rehearsal marks, dynamics, two hairpins, slurs, accent, staccato, tenuto, staff text',
  start: () => melodyScore(R6_START, 'Violin'),
  nex: [
    'Cmd+Home',
    'Alt+Shift+T', ...text('Allegro q=120'), 'Enter',
    'Cmd+M', 'A', 'Enter',
    'Alt+Shift+D', ...text('mf'), 'Enter',
    ...times(3, 'Shift+ArrowRight'), 's',
    'Cmd+ArrowRight', 'Shift+V',
    'Cmd+ArrowRight', ...times(3, 'Shift+ArrowRight'), 'Shift+S', '<',
    ...times(2, 'Cmd+ArrowRight'), 'Cmd+M', 'B', 'Enter', 'Alt+Shift+D', 'f', 'Enter', ...times(3, 'Shift+ArrowRight'), 's',
    'Cmd+ArrowRight', 'Shift+ArrowRight', '>',
    'Cmd+ArrowRight', 'Alt+Shift+D', 'p', 'Enter', 'Cmd+T', ...text('dolce'), 'Enter', ...times(3, 'Shift+ArrowRight'), 'Shift+N',
  ],
  musescore: [
    'Cmd+Home',
    'Alt+Shift+T', ...text('Allegro q=120'), 'Escape',
    'Cmd+M', 'A', 'Escape',
    'Cmd+D', ...text('mf'), 'Escape',
    ...times(3, 'Shift+ArrowRight'), 'S',
    'Cmd+ArrowRight', 'Shift+V',
    'Cmd+ArrowRight', ...times(3, 'Shift+ArrowRight'), 'Shift+S', '<',
    ...times(2, 'Cmd+ArrowRight'), 'Cmd+M', 'B', 'Escape', 'Cmd+D', 'f', 'Escape', ...times(3, 'Shift+ArrowRight'), 'S',
    'Cmd+ArrowRight', 'Shift+ArrowRight', '>',
    'Cmd+ArrowRight', 'Cmd+D', 'p', 'Escape', 'Cmd+T', ...text('dolce'), 'Escape', ...times(3, 'Shift+ArrowRight'), 'Shift+N',
  ],
  expected: [
    'm1 clef G2', 'm1 key 0', 'm1 time 4/4',
    ...voice('', 1, [
      'C5q D5q E5q F5q', 'G5h[accent] E5h', 'A5q[staccato] G5q[staccato] F5q[staccato] E5q[staccato]', 'D5w',
      'E5q F5q G5q A5q', 'G5h E5h', 'F5q[tenuto] E5q[tenuto] D5q[tenuto] E5q[tenuto]', 'C5w',
    ]),
    'slur C5@m1:0 > F5@m1:3',
    'slur E5@m5:0 > A5@m5:3',
    'm1 @0 metronome 120 "Allegro"', 'm1 @0 rehearsal A', 'm1 @0 dynamics mf',
    // A hairpin runs from the first selected note to the end of the last one.
    'm3 @0 wedge crescendo', 'm3 @4 wedge stop',
    'm5 @0 rehearsal B', 'm5 @0 dynamics f',
    'm6 @0 wedge diminuendo', 'm6 @4 wedge stop',
    'm7 @0 dynamics p', 'm7 @0 words dolce',
  ],
  notes: [
    'MuseScore: tempo Alt+Shift+T, rehearsal mark Ctrl+M, dynamics Ctrl+D, staff text Ctrl+T, each ended with Esc; `S` slur, `<` and `>` hairpins over the selected range, Shift+V accent, Shift+S staccato, Shift+N tenuto (`shortcuts.xml`).',
    'Nex Note opens dynamics with Alt+Shift+D (Cmd+D is Duplicate) and ends an entry with Enter.',
    'assumed: after Esc from a text MuseScore keeps the note the text is attached to selected.',
  ],
};

export const REFERENCE_TASKS: ReferenceTask[] = [R1, R2, R3, R4, R5, R6];

export function referenceTask(id: ReferenceTask['id']) {
  const task = REFERENCE_TASKS.find((entry) => entry.id === id);
  if (!task) throw new Error(`Reference task ${id} is not defined`);
  return task;
}

export { BASS, PIANO };
