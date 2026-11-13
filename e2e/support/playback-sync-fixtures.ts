// Generated MusicXML scores for the playback sync probe (e2e/playback-sync.spec.ts). Each fixture
// also returns the onsets a listener hears, in playback order (repeats unrolled), so the probe can
// pair every sound with the note the score should show.
import type { ExpectedOnset } from '../../lib/playback-sync-probe';

const DIVISIONS = 4; // a quarter note is 4 divisions, a sixteenth 1.

const NOTE_TYPES: Record<number, { type: string; dots: number }> = {
  1: { type: '16th', dots: 0 },
  2: { type: 'eighth', dots: 0 },
  3: { type: 'eighth', dots: 1 },
  4: { type: 'quarter', dots: 0 },
  6: { type: 'quarter', dots: 1 },
  8: { type: 'half', dots: 0 },
  12: { type: 'half', dots: 1 },
  16: { type: 'whole', dots: 0 },
};

const PITCH_NAMES: Array<[string, number]> = [
  ['C', 0], ['C', 1], ['D', 0], ['D', 1], ['E', 0], ['F', 0], ['F', 1], ['G', 0], ['G', 1], ['A', 0], ['A', 1], ['B', 0],
];

export interface FixtureNote {
  /** Sounding MIDI pitches; empty for a rest. */
  pitches: number[];
  duration: number;
}

export interface FixtureMeasure {
  /** Notes per staff; staves of a part share the measure. */
  staves: FixtureNote[][];
}

export interface FixturePart {
  id: string;
  name: string;
  program: number;
  clefs: Array<'G' | 'F'>;
  measures: FixtureMeasure[];
}

export interface FixtureMeasureInfo {
  time?: [number, number];
  tempo?: number;
  repeatStart?: boolean;
  repeatEnd?: boolean;
  ending?: { number: string; start: boolean; stop: boolean | 'discontinue' };
}

export interface SyncFixture {
  name: string;
  xml: string;
  expected: ExpectedOnset[];
  /** Seconds of audio at the written tempo, for timeouts. */
  durationSeconds: number;
}

function pitchXml(midi: number) {
  const [step, alter] = PITCH_NAMES[midi % 12]!;
  const octave = Math.floor(midi / 12) - 1;
  return `<pitch><step>${step}</step>${alter ? `<alter>${alter}</alter>` : ''}<octave>${octave}</octave></pitch>`;
}

function noteXml(note: FixtureNote, voice: number, staff: number) {
  const type = NOTE_TYPES[note.duration];
  if (!type) throw new Error(`No note type for duration ${note.duration}`);
  const dots = '<dot/>'.repeat(type.dots);
  const common = `<duration>${note.duration}</duration><voice>${voice}</voice><type>${type.type}</type>${dots}<staff>${staff}</staff>`;
  if (!note.pitches.length) return `<note><rest/>${common}</note>`;
  return note.pitches.map((midi, index) => (
    `<note>${index > 0 ? '<chord/>' : ''}${pitchXml(midi)}${common}</note>`
  )).join('');
}

function measureLengthDivisions(time: [number, number]) {
  return (time[0] * 4 * DIVISIONS) / time[1];
}

export function buildSyncFixture(name: string, parts: FixturePart[], infos: FixtureMeasureInfo[]): SyncFixture {
  const measureCount = infos.length;
  for (const part of parts) {
    if (part.measures.length !== measureCount) throw new Error(`${name}: part ${part.id} has ${part.measures.length} measures, expected ${measureCount}`);
  }

  let time: [number, number] = infos[0]?.time ?? [4, 4];
  const lengths: number[] = [];
  infos.forEach((info) => {
    if (info.time) time = info.time;
    lengths.push(measureLengthDivisions(time));
  });
  parts.forEach((part) => part.measures.forEach((measure, index) => measure.staves.forEach((notes, staffIndex) => {
    const total = notes.reduce((sum, note) => sum + note.duration, 0);
    if (total !== lengths[index]) throw new Error(`${name}: ${part.id} m${index + 1} staff ${staffIndex + 1} has ${total} divisions, expected ${lengths[index]}`);
  })));

  const partList = parts.map((part, index) => `
    <score-part id="${part.id}">
      <part-name>${part.name}</part-name>
      <score-instrument id="${part.id}-I1"><instrument-name>${part.name}</instrument-name></score-instrument>
      <midi-instrument id="${part.id}-I1"><midi-channel>${index >= 9 ? index + 2 : index + 1}</midi-channel><midi-program>${part.program}</midi-program></midi-instrument>
    </score-part>`).join('');

  const partXml = parts.map((part, partIndex) => {
    let measureTime: [number, number] = infos[0]?.time ?? [4, 4];
    const measures = part.measures.map((measure, measureIndex) => {
      const info = infos[measureIndex] ?? {};
      const attributes: string[] = [];
      if (measureIndex === 0) {
        attributes.push(`<divisions>${DIVISIONS}</divisions><key><fifths>0</fifths></key>`);
      }
      if (info.time || measureIndex === 0) {
        measureTime = info.time ?? measureTime;
        attributes.push(`<time><beats>${measureTime[0]}</beats><beat-type>${measureTime[1]}</beat-type></time>`);
      }
      if (measureIndex === 0) {
        if (part.clefs.length > 1) attributes.push(`<staves>${part.clefs.length}</staves>`);
        part.clefs.forEach((clef, clefIndex) => {
          attributes.push(`<clef number="${clefIndex + 1}"><sign>${clef}</sign><line>${clef === 'G' ? 2 : 4}</line></clef>`);
        });
      }
      // MusicXML barline content order: bar-style, ending, repeat.
      const leftBarline: string[] = [];
      if (info.repeatStart) leftBarline.push('<bar-style>heavy-light</bar-style>');
      if (info.ending?.start) leftBarline.push(`<ending number="${info.ending.number}" type="start"/>`);
      if (info.repeatStart) leftBarline.push('<repeat direction="forward"/>');
      const rightBarline: string[] = [];
      if (info.repeatEnd) rightBarline.push('<bar-style>light-heavy</bar-style>');
      if (info.ending?.stop) rightBarline.push(`<ending number="${info.ending.number}" type="${info.ending.stop === 'discontinue' ? 'discontinue' : 'stop'}"/>`);
      if (info.repeatEnd) rightBarline.push('<repeat direction="backward"/>');
      const tempo = info.tempo && partIndex === 0
        ? `<direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${info.tempo}</per-minute></metronome></direction-type><sound tempo="${info.tempo}"/></direction>`
        : '';
      const length = lengths[measureIndex]!;
      const staves = measure.staves.map((notes, staffIndex) => (
        (staffIndex > 0 ? `<backup><duration>${length}</duration></backup>` : '')
        + notes.map((note) => noteXml(note, staffIndex * 4 + 1, staffIndex + 1)).join('')
      )).join('');
      return `
      <measure number="${measureIndex + 1}">
        ${leftBarline.length ? `<barline location="left">${leftBarline.join('')}</barline>` : ''}
        ${attributes.length ? `<attributes>${attributes.join('')}</attributes>` : ''}
        ${tempo}
        ${staves}
        ${rightBarline.length ? `<barline location="right">${rightBarline.join('')}</barline>` : ''}
      </measure>`;
    }).join('');
    return `<part id="${part.id}">${measures}</part>`;
  }).join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <work><work-title>${name}</work-title></work>
  <part-list>${partList}</part-list>
  ${partXml}
</score-partwise>`;

  // Onsets per written measure, then unrolled into playback order.
  const onsetsByMeasure = Array.from({ length: measureCount }, (_, measureIndex) => {
    const byPosition = new Map<number, Set<number>>();
    parts.forEach((part) => part.measures[measureIndex]!.staves.forEach((notes) => {
      let position = 0;
      notes.forEach((note) => {
        if (note.pitches.length) {
          const pitches = byPosition.get(position) ?? new Set<number>();
          note.pitches.forEach((pitch) => pitches.add(pitch));
          byPosition.set(position, pitches);
        }
        position += note.duration;
      });
    }));
    return [...byPosition.entries()].sort((a, b) => a[0] - b[0]).map(([position, pitches]) => ({
      measureNumber: measureIndex + 1,
      positionWholes: position / (4 * DIVISIONS),
      pitches: [...pitches].sort((a, b) => a - b),
    }));
  });

  const order = playbackOrder(infos);
  const expected = order.flatMap((measureIndex) => onsetsByMeasure[measureIndex]!);

  let tempo = infos[0]?.tempo ?? 120;
  let durationSeconds = 0;
  const tempoAt = infos.map((info) => {
    if (info.tempo) tempo = info.tempo;
    return tempo;
  });
  order.forEach((measureIndex) => {
    durationSeconds += (lengths[measureIndex]! / DIVISIONS) * (60 / tempoAt[measureIndex]!);
  });

  return { name, xml, expected, durationSeconds };
}

/** Measure indices in the order they sound: simple repeats with first/second endings. */
export function playbackOrder(infos: FixtureMeasureInfo[]) {
  const order: number[] = [];
  let repeatStart = 0;
  for (let index = 0; index < infos.length; index += 1) {
    const info = infos[index]!;
    if (info.repeatStart) repeatStart = index;
    order.push(index);
    if (info.repeatEnd) {
      for (let again = repeatStart; again < index; again += 1) {
        const ending = infos[again]!.ending;
        if (ending && !ending.number.split(',').map((entry) => entry.trim()).includes('2')) continue;
        order.push(again);
      }
      // The measure with the backward repeat is the first ending's last measure (or the repeat's
      // last measure). Without an ending it sounds again on the second pass.
      if (!info.ending) order.push(index);
      repeatStart = index + 1;
    }
  }
  return order;
}

const CHORDS = [[48, 52, 55], [45, 48, 52], [41, 45, 48], [43, 47, 50]];

const SCALE = [60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79];

function melody(durations: number[], seed: number, base = 0): FixtureNote[] {
  return durations.map((duration, index) => ({
    pitches: [SCALE[(seed + index) % SCALE.length]! + base],
    duration,
  }));
}

export function smallFixture() {
  const measures = Array.from({ length: 8 }, (_, index) => ({
    staves: [melody([4, 4, 2, 2, 4], index * 5)],
  }));
  return buildSyncFixture('Sync Small', [
    { id: 'P1', name: 'Piano', program: 1, clefs: ['G'], measures },
  ], Array.from({ length: 8 }, (_, index) => (index === 0 ? { time: [4, 4] as [number, number], tempo: 100 } : {})));
}

export function denseFixture() {
  const measures = Array.from({ length: 8 }, (_, index) => ({
    staves: [
      melody(Array(16).fill(1), index * 3, 12),
      [0, 1, 2, 3].map((beat) => ({ pitches: CHORDS[(index * 4 + beat) % CHORDS.length]!, duration: 4 })),
    ],
  }));
  return buildSyncFixture('Sync Dense', [
    { id: 'P1', name: 'Piano', program: 1, clefs: ['G', 'F'], measures },
  ], Array.from({ length: 8 }, (_, index) => (index === 0 ? { time: [4, 4] as [number, number], tempo: 112 } : {})));
}

export function longMultiPartFixture(measureCount = 40) {
  const flute = Array.from({ length: measureCount }, (_, index) => ({ staves: [melody(Array(8).fill(2), index * 2, 12)] }));
  const oboe = Array.from({ length: measureCount }, (_, index) => ({ staves: [melody([6, 2, 4, 4], index + 3)] }));
  const violin = Array.from({ length: measureCount }, (_, index) => ({ staves: [melody([8, 4, 4], index * 4 + 1, -5)] }));
  const cello = Array.from({ length: measureCount }, (_, index) => ({ staves: [melody(index % 2 ? [8, 8] : [16], index, -24)] }));
  return buildSyncFixture('Sync Long Ensemble', [
    { id: 'P1', name: 'Flute', program: 74, clefs: ['G'], measures: flute },
    { id: 'P2', name: 'Oboe', program: 69, clefs: ['G'], measures: oboe },
    { id: 'P3', name: 'Violin', program: 41, clefs: ['G'], measures: violin },
    { id: 'P4', name: 'Violoncello', program: 43, clefs: ['F'], measures: cello },
  ], Array.from({ length: measureCount }, (_, index) => (index === 0 ? { time: [4, 4] as [number, number], tempo: 144 } : {})));
}

/** Time-signature and tempo changes, plus a repeat with first and second endings. */
export function structureFixture() {
  const infos: FixtureMeasureInfo[] = [
    { time: [3, 4], tempo: 90 },
    {},
    {},
    {},
    { time: [6, 8], tempo: 132 },
    {},
    { time: [2, 4] },
    { time: [4, 4], repeatStart: true },
    {},
    { ending: { number: '1', start: true, stop: true }, repeatEnd: true },
    { ending: { number: '2', start: true, stop: 'discontinue' } },
    {},
  ];
  const patterns: number[][] = [
    [4, 4, 4], [4, 2, 2, 4], [6, 2, 4], [4, 4, 4],
    [2, 2, 2, 2, 2, 2], [6, 2, 2, 2],
    [4, 4],
    [4, 4, 4, 4], [2, 2, 4, 4, 4], [4, 4, 8], [4, 4, 4, 4], [16],
  ];
  const measures = patterns.map((durations, index) => ({ staves: [melody(durations, index * 3)] }));
  return buildSyncFixture('Sync Structure', [
    { id: 'P1', name: 'Piano', program: 1, clefs: ['G'], measures },
  ], infos);
}
