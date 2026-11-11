import { PIANO, scoreXml } from './entry-fixtures';

/*
 * Mouse corpus for gate 2 of docs/note-entry-mastery-ledger.md (row M7): ten synthetic textures on
 * which a click must commit exactly what the preview showed. None is real music.
 */

const DIV = 12;
const note = (step: string, octave: number, type: string, duration: number, voice = 1, extra = '', notations = '') => (
  `<note><pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>${duration}</duration><voice>${voice}</voice><type>${type}</type>${extra}${notations}</note>`
);
const rest = (type: string, duration: number, voice = 1) => (
  `<note><rest/><duration>${duration}</duration><voice>${voice}</voice><type>${type}</type></note>`
);
const wholeRest = `<note><rest measure="yes"/><duration>${DIV * 4}</duration><voice>1</voice></note>`;
const quarters = (steps: string, octave: number, voice = 1) => steps.split('').map((step) => note(step, octave, 'quarter', DIV, voice)).join('');
const eighths = (steps: string, octave: number, voice = 1) => steps.split('').map((step) => note(step, octave, 'eighth', DIV / 2, voice)).join('');

const single = (name: string, sign: 'G' | 'F' | 'C', line: number, content?: Record<string, string>) => scoreXml({
  beats: 4, beatType: 4, measures: 4, divisions: DIV,
  parts: [{ id: 'P1', name, clefs: [{ sign, line }], content }],
});

const triplet = (steps: string, octave: number) => steps.split('').map((step, index) => note(
  step, octave, 'eighth', DIV / 3, 1,
  '<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>',
  index === 0 ? '<notations><tuplet type="start" bracket="yes"/></notations>' : index === 2 ? '<notations><tuplet type="stop"/></notations>' : '',
)).join('');

const grace = (step: string, octave: number) => (
  `<note><grace slash="yes"/><pitch><step>${step}</step><octave>${octave}</octave></pitch><voice>1</voice><type>eighth</type></note>`
);

function pickup() {
  const attributes = `<attributes><divisions>${DIV}</divisions><key><fifths>-1</fifths></key><time><beats>3</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>`;
  const emptyBar = `<note><rest measure="yes"/><duration>${DIV * 3}</duration><voice>1</voice></note>`;
  return '<?xml version="1.0" encoding="UTF-8"?>\n<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Oboe</part-name></score-part></part-list><part id="P1">'
    + `<measure number="0" implicit="yes">${attributes}${note('C', 5, 'quarter', DIV)}</measure>`
    + `<measure number="1">${quarters('FGA', 4)}</measure><measure number="2">${emptyBar}</measure><measure number="3">${emptyBar}</measure>`
    + '</part></score-partwise>';
}

export interface MouseCorpusFixture {
  name: string;
  xml: string;
  /** Keys that arm the value after `N` (default: quarter). */
  arm?: string;
  /** Armed value as the document names it. */
  value?: string;
  /** Bars to click in, 1-based measure numbers as rendered. */
  bars: number[];
  staves?: number[];
  /** A pitch that must be reachable and commit as shown (three ledger lines). */
  ledgerPitches?: Array<{ staff: number; pitch: string; direction: 'above' | 'below' }>;
}

export const MOUSE_CORPUS: MouseCorpusFixture[] = [
  { name: 'treble clef', xml: single('Flute', 'G', 2), bars: [1, 2, 3] },
  { name: 'bass clef', xml: single('Cello', 'F', 4), bars: [1, 2, 3] },
  { name: 'alto clef', xml: single('Viola', 'C', 3), bars: [1, 2, 3] },
  { name: 'tenor clef', xml: single('Trombone', 'C', 4), bars: [1, 2, 3] },
  {
    name: 'clef change',
    xml: single('Bassoon', 'C', 4, {
      '1:1': quarters('CDEF', 4),
      '3:1': `<attributes><clef><sign>F</sign><line>4</line></clef></attributes>${wholeRest}`,
    }),
    bars: [2, 3, 4],
  },
  { name: 'pickup', xml: pickup(), bars: [1, 2, 3] },
  {
    name: 'dense two-voice',
    xml: single('Guitar', 'G', 2, {
      '1:1': `${eighths('EFGAGFED', 5)}<backup><duration>${DIV * 4}</duration></backup>${quarters('CDCB', 4, 2)}`,
      '2:1': `${eighths('CDEFEDCD', 5)}<backup><duration>${DIV * 4}</duration></backup>${quarters('AGAG', 3, 2)}`,
    }),
    bars: [1, 2, 3],
  },
  {
    name: 'tuplet',
    xml: single('Clarinet', 'G', 2, {
      '1:1': `${triplet('CDE', 5)}${note('F', 5, 'quarter', DIV)}${rest('half', DIV * 2)}`,
      '2:1': `${note('G', 4, 'quarter', DIV)}${triplet('ABC', 4)}${rest('half', DIV * 2)}`,
    }),
    arm: '4',
    value: 'eighth',
    bars: [1, 2, 3],
  },
  {
    name: 'grace',
    xml: single('Violin', 'G', 2, {
      '1:1': `${grace('D', 5)}${note('C', 5, 'quarter', DIV)}${note('E', 5, 'quarter', DIV)}${grace('G', 5)}${note('F', 5, 'half', DIV * 2)}`,
    }),
    bars: [1, 2],
  },
  {
    name: 'grand staff with three ledger lines',
    xml: scoreXml({ beats: 4, beatType: 4, measures: 4, divisions: DIV, parts: [{ ...PIANO }] }),
    bars: [1, 2],
    staves: [1, 2],
    // Above the upper and below the lower staff. Between the staves a pointer belongs to the nearer
    // staff, so the third ledger line of one staff is the other staff's territory.
    ledgerPitches: [
      { staff: 1, pitch: 'E6', direction: 'above' },
      { staff: 2, pitch: 'A1', direction: 'below' },
    ],
  },
];
