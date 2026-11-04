/** Synthetic fixtures for the entry-correctness matrix. Every score is generated, none is real music. */

interface PartSpec {
  id: string;
  name: string;
  clefs: Array<{ sign: 'G' | 'F' | 'C'; line: number }>;
  transpose?: { chromatic: number; diatonic: number };
  /** Optional voice-1 content per measure per staff (MusicXML <note> elements); default: whole-measure rest. */
  content?: Record<string, string>;
}

export interface ScoreSpec {
  beats: number;
  beatType: number;
  measures: number;
  fifths?: number;
  divisions?: number;
  parts: PartSpec[];
}

export function scoreXml(spec: ScoreSpec) {
  const divisions = spec.divisions ?? 4;
  const measureDuration = Math.round((spec.beats * 4 * divisions) / spec.beatType);
  const partList = spec.parts.map((part) => `<score-part id="${part.id}"><part-name>${part.name}</part-name></score-part>`).join('');
  const parts = spec.parts.map((part) => {
    const measures = Array.from({ length: spec.measures }, (_, index) => {
      const number = index + 1;
      const attributes = index === 0
        ? `<attributes><divisions>${divisions}</divisions><key><fifths>${spec.fifths ?? 0}</fifths></key><time><beats>${spec.beats}</beats><beat-type>${spec.beatType}</beat-type></time>${part.clefs.length > 1 ? `<staves>${part.clefs.length}</staves>` : ''}${part.clefs.map((clef, clefIndex) => `<clef${part.clefs.length > 1 ? ` number="${clefIndex + 1}"` : ''}><sign>${clef.sign}</sign><line>${clef.line}</line></clef>`).join('')}${part.transpose ? `<transpose><diatonic>${part.transpose.diatonic}</diatonic><chromatic>${part.transpose.chromatic}</chromatic></transpose>` : ''}</attributes>`
        : '';
      const staves = part.clefs.map((_, staffIndex) => {
        const staff = staffIndex + 1;
        const custom = part.content?.[`${number}:${staff}`];
        const body = custom ?? `<note><rest measure="yes"/><duration>${measureDuration}</duration><voice>${staffIndex * 4 + 1}</voice>${part.clefs.length > 1 ? `<staff>${staff}</staff>` : ''}</note>`;
        return body;
      });
      return `<measure number="${number}">${attributes}${staves.join(`<backup><duration>${measureDuration}</duration></backup>`)}</measure>`;
    }).join('');
    return `<part id="${part.id}">${measures}</part>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<score-partwise version="4.0"><part-list>${partList}</part-list>${parts}</score-partwise>`;
}

export const TREBLE = { id: 'P1', name: 'Flute', clefs: [{ sign: 'G' as const, line: 2 }] };
export const BASS = { id: 'P2', name: 'Cello', clefs: [{ sign: 'F' as const, line: 4 }] };
export const PIANO = { id: 'P1', name: 'Piano', clefs: [{ sign: 'G' as const, line: 2 }, { sign: 'F' as const, line: 4 }] };
export const CLARINET_BB = { id: 'P2', name: 'Clarinet in Bb', clefs: [{ sign: 'G' as const, line: 2 }], transpose: { chromatic: -2, diatonic: -1 } };
