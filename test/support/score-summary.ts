import { importMusicXmlToCore } from '../../src/musicxml-adapter/import/import-musicxml.ts';

/*
 * A score as lines a musician can read and a test can compare: every note with bar, beat, value and
 * marks, every direction (dynamics, hairpins, text, chord symbols, pedal), lyrics, slurs, key, time
 * and clef changes, repeats and endings. Ids, division grids and layout are left out, so a score that
 * was typed and a score that was imported compare equal when they hold the same music.
 *
 * Rests are listed only in voices that hold a note in that bar: whole-bar rests of unused voices and
 * staves say nothing.
 */

const beat = (num: number | undefined, den: number | undefined) => {
  const value = Math.round(((num ?? 0) / Math.max(den ?? 1, 1)) * 4 * 1000) / 1000;
  return String(value);
};

export function summarizeScore(xml: string): string[] {
  const core = importMusicXmlToCore(xml);
  const lines: string[] = [];
  const eventNames = new Map<string, string>();
  const multiPart = core.score.parts.length > 1;

  core.score.parts.forEach((part, partIndex) => {
    const partLabel = multiPart ? `P${partIndex + 1} ` : '';
    const multiStaff = part.staves.length > 1;
    for (const staff of part.staves) {
      const staffLabel = multiStaff ? `s${staff.staffIndex} ` : '';
      let key: number | undefined;
      let time = '';
      let clef = '';
      for (const measure of staff.measures) {
        const where = `${partLabel}${staffLabel}m${measure.measureNumber}`;
        for (const attributes of measure.attributes) {
          if (attributes.keyFifths != null && attributes.keyFifths !== key) {
            key = attributes.keyFifths;
            lines.push(`${where} key ${key}`);
          }
          if (attributes.time) {
            const next = `${attributes.time.beatGroups?.join('+') ?? attributes.time.beats}/${attributes.time.beatType}`;
            if (next !== time) { time = next; lines.push(`${where} time ${time}`); }
          }
          for (const entry of attributes.clefs.filter((candidate) => candidate.staffIndex === staff.staffIndex)) {
            const next = `${entry.sign}${entry.line}`;
            if (next !== clef) { clef = next; lines.push(`${where} clef ${clef}`); }
          }
        }
        if (measure.implicit) lines.push(`${where} pickup`);
        if (measure.leftBarline && measure.leftBarline !== 'regular') lines.push(`${where} left ${measure.leftBarline}`);
        if (measure.leftEnding) lines.push(`${where} ending ${measure.leftEnding.number} ${measure.leftEnding.type}`);
        for (const voice of measure.voices) {
          const inputVoice = ((Math.max(1, voice.voiceId) - 1) % 4) + 1;
          const hasNote = voice.events.some((event) => event.kind === 'note');
          for (const event of voice.events) {
            const name = event.kind === 'note'
              ? `${event.isChord ? '+' : ''}${event.pitch.step}${event.pitch.alter > 0 ? '#'.repeat(event.pitch.alter) : event.pitch.alter < 0 ? 'b'.repeat(-event.pitch.alter) : ''}${event.pitch.octave}`
              : 'rest';
            eventNames.set(event.id, `${name.replace(/^\+/, '')}@${where}:${beat(event.timestampNum, event.timestampDen)}`);
            if (!hasNote) continue;
            const tuplet = core.tuplets.find((entry) => entry.eventIds.includes(event.id));
            const marks = [
              event.kind === 'note' && event.tieStart ? 'tie' : '',
              ...(event.articulations ?? []),
              tuplet ? `${tuplet.actualNotes ?? 3}:${tuplet.normalNotes ?? 2}` : '',
              core.graceNotes.some((grace) => grace.eventId === event.id) ? 'grace' : '',
              core.fermataEventIds.has(event.id) ? 'fermata' : '',
            ].filter(Boolean);
            lines.push(`${where} v${inputVoice} @${beat(event.timestampNum, event.timestampDen)} ${name} ${event.durationType ?? '?'}${event.isDotted ? '.' : ''}${marks.length ? ` [${marks.join(',')}]` : ''}`);
          }
        }
        for (const direction of measure.directions) {
          const onset = ` @${beat(direction.timestampNum, direction.timestampDen)}`;
          lines.push(`${where}${onset} ${direction.kind}${direction.value != null && direction.value !== '' ? ` ${direction.value}` : ''}${direction.text ? ` "${direction.text}"` : ''}`);
        }
        if (measure.rightEnding) lines.push(`${where} ending ${measure.rightEnding.number} ${measure.rightEnding.type}`);
        if (measure.rightBarline && measure.rightBarline !== 'regular') lines.push(`${where} right ${measure.rightBarline}`);
      }
    }
  });
  for (const lyric of core.lyricLines) {
    lines.push(`lyric ${lyric.verseNumber} ${eventNames.get(lyric.eventId) ?? '?'} "${lyric.text}" ${lyric.syllabic ?? 'single'}${lyric.extend ? ` extend:${lyric.extend}` : ''}`);
  }
  for (const slur of core.slurs) lines.push(`slur ${eventNames.get(slur.startEventId ?? '') ?? '?'} > ${eventNames.get(slur.stopEventId ?? '') ?? '?'}`);
  return lines;
}
