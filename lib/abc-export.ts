import { DOMParser } from '@xmldom/xmldom';

const STEP_TO_ABC: Record<string, string> = {
  C: 'C',
  D: 'D',
  E: 'E',
  F: 'F',
  G: 'G',
  A: 'A',
  B: 'B',
};

const FIFTHS_TO_KEY: Record<number, string> = {
  '-7': 'Cb',
  '-6': 'Gb',
  '-5': 'Db',
  '-4': 'Ab',
  '-3': 'Eb',
  '-2': 'Bb',
  '-1': 'F',
  '0': 'C',
  '1': 'G',
  '2': 'D',
  '3': 'A',
  '4': 'E',
  '5': 'B',
  '6': 'F#',
  '7': 'C#',
};

function octaveToAbc(step: string, octave: number) {
  const base = STEP_TO_ABC[step] ?? 'C';
  if (octave > 4) return base.toLowerCase() + "'".repeat(Math.max(0, octave - 5));
  if (octave < 4) return base + ','.repeat(Math.max(0, 4 - octave));
  return base;
}

function durationToAbc(duration: number, divisions: number) {
  const quarterUnits = duration / Math.max(divisions, 1);
  const length = quarterUnits * 2;
  if (Math.abs(length - 1) < 0.001) return '';
  if (Number.isInteger(length)) return String(length);
  if (Math.abs(length - 0.5) < 0.001) return '/';
  if (Math.abs(length - 0.25) < 0.001) return '/2';
  return `${Math.round(length * 100)}/100`;
}

function accidentalPrefix(alter: number) {
  if (alter === 2) return '^^';
  if (alter === 1) return '^';
  if (alter === -1) return '_';
  if (alter === -2) return '__';
  return '';
}

export function musicXmlToAbc(xml: string, filename?: string) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const title = doc.getElementsByTagName('movement-title')[0]?.textContent
    || doc.getElementsByTagName('work-title')[0]?.textContent
    || (filename ? filename.replace(/\.[^.]+$/, '') : 'Untitled');
  const composer = Array.from(doc.getElementsByTagName('creator'))
    .find((creator) => creator.getAttribute('type') === 'composer')?.textContent;
  const firstTime = doc.getElementsByTagName('time')[0];
  const meter = firstTime
    ? `${firstTime.getElementsByTagName('beats')[0]?.textContent ?? '4'}/${firstTime.getElementsByTagName('beat-type')[0]?.textContent ?? '4'}`
    : '4/4';
  const firstKey = parseInt(doc.getElementsByTagName('fifths')[0]?.textContent ?? '0', 10) || 0;
  const key = FIFTHS_TO_KEY[firstKey] ?? 'C';
  const tempo = doc.getElementsByTagName('per-minute')[0]?.textContent;
  const divisions = parseInt(doc.getElementsByTagName('divisions')[0]?.textContent ?? '1', 10) || 1;
  const parts = Array.from(doc.getElementsByTagName('part'));
  const firstPart = parts[0];
  const measures = firstPart ? Array.from(firstPart.getElementsByTagName('measure')) : [];

  const body: string[] = [];
  for (const measure of measures) {
    const tokens: string[] = [];
    for (const node of Array.from(measure.childNodes)) {
      const note = node as unknown as Element;
      if (note.nodeType !== 1 || note.tagName !== 'note') continue;
      const duration = parseInt(note.getElementsByTagName('duration')[0]?.textContent ?? '0', 10) || divisions;
      const suffix = durationToAbc(duration, divisions);
      if (note.getElementsByTagName('rest').length > 0) {
        tokens.push(`z${suffix}`);
        continue;
      }
      const pitch = note.getElementsByTagName('pitch')[0];
      if (!pitch) continue;
      const step = pitch.getElementsByTagName('step')[0]?.textContent?.toUpperCase() ?? 'C';
      const octave = parseInt(pitch.getElementsByTagName('octave')[0]?.textContent ?? '4', 10) || 4;
      const alter = parseInt(pitch.getElementsByTagName('alter')[0]?.textContent ?? '0', 10) || 0;
      tokens.push(`${accidentalPrefix(alter)}${octaveToAbc(step, octave)}${suffix}`);
    }
    body.push(`${tokens.join(' ')} |`);
  }

  const header = [
    'X:1',
    `T:${title}`,
    composer ? `C:${composer}` : '',
    `M:${meter}`,
    'L:1/8',
    tempo ? `Q:1/4=${tempo}` : '',
    `K:${key}`,
  ].filter(Boolean);

  return `${header.join('\n')}\n${body.join('\n')}\n`;
}
