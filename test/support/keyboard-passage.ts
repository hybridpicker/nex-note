import { importMusicXmlToCore } from '../../src/musicxml-adapter/import/import-musicxml.ts';

/** Keyboard passage 1 (iteration 37): the script, its summary function and the exact expected result. */

// Digits are durations: 3 sixteenth, 4 eighth, 5 quarter, 6 half, 7 whole. "." dots, "0" is a rest,
// "+" and "-" are one-shot accidentals, "T" ties into the next note, Cmd+3 makes a triplet, Shift+letter
// adds a chord tone, "/" adds a grace note, Shift+V is accent (MuseScore's key), Alt+. is a louder
// dynamic, S slurs.
export const PASSAGE_1 = [
  'N',
  '5 c 4 d e 5 . f 4 g',                  // bar 1: quarter, two eighths, dotted quarter, eighth
  '5 0 + g - b a',                         // bar 2: rest, G sharp, B flat, A
  '6 g 5 f e T',                           // bars 3-4: half, quarter, quarter tied over the barline
  '4 d c 5 Cmd+3 c d e 5 d',               // bar 4: eighths, an eighth triplet, quarter
  '5 c Shift+e Shift+g d / 6 e',           // bar 5: chord, quarter with a grace note, half
  '5 c Alt+. d Shift+v e s f g s a 6 b',   // bars 6-7: dynamic, accent, slur E to G
  '7 c',                                   // bar 8: whole note
].join(' ');

export function summarize(xml: string) {
  const core = importMusicXmlToCore(xml);
  const staff = core.score.parts[0]!.staves[0]!;
  const eventNames = new Map<string, string>();
  const lines: string[] = [];
  for (const measure of staff.measures) {
    for (const voice of measure.voices) {
      for (const event of voice.events) {
        const onset = Math.round((event.timestampNum / Math.max(event.timestampDen, 1)) * 4 * 1000) / 1000;
        const name = event.kind === 'note'
          ? `${event.pitch.step}${event.pitch.alter === 1 ? '#' : event.pitch.alter === -1 ? 'b' : ''}${event.pitch.octave}${event.isChord ? '(chord)' : ''}`
          : 'rest';
        eventNames.set(event.id, `${name}@m${measure.measureNumber}`);
        const extras = [
          event.kind === 'note' && event.tieStart ? 'tie' : '',
          ...(event.articulations ?? []),
          core.tuplets.some((tuplet) => tuplet.eventIds.includes(event.id)) ? 'triplet' : '',
          core.graceNotes.some((grace) => grace.eventId === event.id) ? 'grace' : '',
        ].filter(Boolean);
        lines.push(`m${measure.measureNumber}@${onset} ${name} ${event.durationType}${event.isDotted ? '.' : ''}${extras.length ? ` [${extras.join(',')}]` : ''}`);
      }
    }
    for (const direction of measure.directions.filter((entry) => entry.kind === 'dynamics')) {
      lines.push(`m${measure.measureNumber} dynamic ${direction.value}`);
    }
  }
  for (const slur of core.slurs) lines.push(`slur ${eventNames.get(slur.startEventId ?? '')} > ${eventNames.get(slur.stopEventId ?? '')}`);
  return lines;
}

/** The exact expected result, checked by hand against the keystrokes above. */
export const PASSAGE_1_EXPECTED = [
  'm1@0 C5 quarter',
  'm1@1 D5 eighth',
  'm1@1.5 E5 eighth',
  'm1@2 F5 quarter.',
  'm1@3.5 G5 eighth',
  'm2@0 rest quarter',
  'm2@1 G#5 quarter',
  'm2@2 Bb5 quarter',
  'm2@3 A5 quarter',
  'm3@0 G5 half',
  'm3@2 F5 quarter',
  'm3@3 E5 quarter [tie]',
  'm4@0 E5 quarter',
  'm4@1 D5 eighth',
  'm4@1.5 C5 eighth',
  'm4@2 C5 eighth [triplet]',
  'm4@2.333 D5 eighth [triplet]',
  'm4@2.667 E5 eighth [triplet]',
  'm4@3 D5 quarter',
  'm5@0 C5 quarter',
  'm5@0 E5(chord) quarter',
  'm5@0 G5(chord) quarter',
  'm5@1 D5 eighth [grace]',
  'm5@1 D5 quarter',
  'm5@2 E5 half',
  'm6@0 C5 quarter',
  'm6@1 D5 quarter [accent]',
  'm6@2 E5 quarter',
  'm6@3 F5 quarter',
  'm6 dynamic f',
  'm7@0 G5 quarter',
  'm7@1 A5 quarter',
  'm7@2 B5 half',
  'm8@0 C6 whole',
  'slur E5@m6 > G5@m7',
];

