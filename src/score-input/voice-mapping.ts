import type { ScoreDocumentModel } from '@/src/score-core/model/types';

/**
 * Input voices versus stored MusicXML voices.
 *
 * The user always enters into voice 1–4 of a staff, as in MuseScore, Dorico and Sibelius. MusicXML
 * numbers voices per part, and MuseScore and Finale write staff n as voices 4(n−1)+1 … 4n, so the
 * left hand of an imported piano score is stored as voice 5. nex-note's own templates write voice 1
 * on every staff. The core model keeps the stored numbers (export fidelity and the renderer both
 * depend on them); entry translates at this boundary.
 */

export type InputVoice = 1 | 2 | 3 | 4;

/** The input voice (1–4) that a stored voice number represents on its staff. */
export function inputVoiceOf(storedVoice: number): InputVoice {
  const voice = Math.max(1, Math.trunc(Number.isFinite(storedVoice) ? storedVoice : 1));
  return (((voice - 1) % 4) + 1) as InputVoice;
}

export interface StaffVoiceLocation {
  corePartId?: string | null;
  staffIndex: number;
}

function staffVoiceNumbers(document: ScoreDocumentModel | null | undefined, location: StaffVoiceLocation) {
  const voices = new Set<number>();
  if (!document) return voices;
  // Render overlays name parts by MusicXML id ("P1"); the core model by "part:P1".
  const wanted = location.corePartId?.replace(/^part:/, '') ?? null;
  const parts = wanted
    ? document.score.parts.filter((part) => part.id.replace(/^part:/, '') === wanted)
    : document.score.parts.slice(0, 1);
  for (const part of parts) {
    const staff = part.staves.find((entry) => entry.staffIndex === location.staffIndex);
    for (const measure of staff?.measures ?? []) {
      for (const voice of measure.voices) {
        if (voice.events.length > 0) voices.add(voice.voiceId);
      }
    }
  }
  return voices;
}

/**
 * The stored voice number for an input voice on a staff:
 * 1. a voice already on the staff that represents this input voice (voice 5 on a MuseScore piano
 *    left hand for input voice 1), preferring the MuseScore band of that staff when several match;
 * 2. otherwise the numbering band the staff already uses (a staff written as voices 5–8 gets 6 for
 *    a new second voice);
 * 3. otherwise the input voice itself (nex-note's own numbering).
 */
export function storedVoiceFor(
  document: ScoreDocumentModel | null | undefined,
  location: StaffVoiceLocation,
  inputVoice: number,
): number {
  const input = inputVoiceOf(inputVoice);
  const used = [...staffVoiceNumbers(document, location)].sort((left, right) => left - right);
  if (used.length === 0) return input;

  const matching = used.filter((voice) => inputVoiceOf(voice) === input);
  const staffBand = 4 * (Math.max(1, location.staffIndex) - 1) + input;
  if (matching.includes(staffBand)) return staffBand;
  if (matching.includes(input)) return input;
  if (matching.length > 0) return matching[0]!;

  const bands = new Set(used.map((voice) => Math.floor((voice - 1) / 4)));
  if (bands.size === 1) return [...bands][0]! * 4 + input;
  return input;
}

/** Whether a stored voice is the given input voice on its staff. */
export function isInputVoice(storedVoice: number, inputVoice: number) {
  return inputVoiceOf(storedVoice) === inputVoiceOf(inputVoice);
}
