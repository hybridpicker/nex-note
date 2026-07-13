import type { UserTemplateSampleBank } from '@/lib/score-templates';
import type { ScoreDocumentModel } from '@/src/score-core/model/types';

export interface PlaybackSampleBank extends UserTemplateSampleBank {
  id: string;
  loadSample: (filename: string) => Promise<ArrayBuffer>;
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function midiNumberToPitchName(midi: number) {
  if (!Number.isInteger(midi) || midi < 0 || midi > 127) return null;
  return `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

function normalizeName(value: string | null | undefined) {
  return (value ?? '').replace(/\s+/g, ' ').trim().toLocaleLowerCase();
}

export function resolvePlaybackSampleFilename(
  sampleBank: Pick<PlaybackSampleBank, 'parts'> | UserTemplateSampleBank,
  document: ScoreDocumentModel | null | undefined,
  partId: string | null | undefined,
  midi: number,
) {
  const pitch = midiNumberToPitchName(midi);
  if (!pitch) return null;

  const parts = document?.score.parts ?? [];
  const part = (partId
    ? parts.find((candidate) => candidate.id === partId || candidate.sourcePartId === partId)
    : null) ?? (parts.length === 1 ? parts[0] : null);
  if (!part) return null;

  const partNames = new Set([part.name, part.instrumentName].map(normalizeName).filter(Boolean));
  for (const partSamples of sampleBank.parts) {
    const partMatches = partSamples.partNames.some((name) => partNames.has(normalizeName(name)));
    if (!partMatches) continue;
    const filename = partSamples.samples[pitch];
    if (filename) return filename;
  }
  return null;
}
