export type WrittenAccidental = 'double-sharp' | 'sharp' | 'natural' | 'flat' | 'double-flat';

const WRITTEN_ACCIDENTALS = new Set<WrittenAccidental>(['double-sharp', 'sharp', 'natural', 'flat', 'double-flat']);

export function isWrittenAccidental(value: unknown): value is WrittenAccidental {
  return typeof value === 'string' && WRITTEN_ACCIDENTALS.has(value as WrittenAccidental);
}

export function writtenAccidentalToAlter(accidental: WrittenAccidental | null | undefined): number {
  if (accidental === 'double-sharp') return 2;
  if (accidental === 'sharp') return 1;
  if (accidental === 'flat') return -1;
  if (accidental === 'double-flat') return -2;
  return 0;
}

export function writtenAccidentalToMusicXml(accidental: WrittenAccidental): string {
  return accidental === 'double-flat' ? 'flat-flat' : accidental;
}

export function musicXmlToWrittenAccidental(value: string | null | undefined): WrittenAccidental | undefined {
  const normalized = (value ?? '').trim().toLowerCase();
  if (normalized === 'flat-flat') return 'double-flat';
  if (
    normalized === 'double-sharp'
    || normalized === 'sharp'
    || normalized === 'natural'
    || normalized === 'flat'
  ) {
    return normalized;
  }
  return undefined;
}
