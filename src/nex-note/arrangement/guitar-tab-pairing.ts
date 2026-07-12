import type { DocumentState } from '@/src/score-core/commands/apply-document-commands';
import type { MeasureNode, NoteEvent, ScoreDocumentModel } from '@/src/score-core/model/types';
import { guitarWrittenToSoundingPitch, MAX_GUITAR_FRET, STANDARD_GUITAR_TUNING } from '@/src/score-input/guitar-fretboard';

type ScorePart = ScoreDocumentModel['score']['parts'][number];

export interface ScopedArrangementNote {
  partId: string;
  corePartId: string;
  partName?: string;
  note: NoteEvent;
  measure: MeasureNode;
}

function writtenPitchToMidi(pitch: { step: string; alter: number; octave: number }) {
  const stepToSemitone: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  return (stepToSemitone[pitch.step] ?? 0) + pitch.alter + (pitch.octave + 1) * 12;
}

function sameTimestamp(left: { timestampNum: number; timestampDen: number }, right: { timestampNum: number; timestampDen: number }) {
  return left.timestampNum * right.timestampDen === right.timestampNum * left.timestampDen;
}

function sameWrittenPitch(left: NoteEvent, right: NoteEvent) {
  return left.pitch.step === right.pitch.step
    && left.pitch.alter === right.pitch.alter
    && left.pitch.octave === right.pitch.octave;
}

export function isTabStaffForArrangement(part: ScorePart, staffIndex: number) {
  return part.staves
    .find((staff) => staff.staffIndex === staffIndex)
    ?.measures.some((measure) => measure.attributes.some((attribute) => (
      attribute.clefs.some((clef) => clef.staffIndex === staffIndex && clef.sign?.toUpperCase() === 'TAB')
    ))) ?? false;
}

export function findPairedTabSourceNote(documentState: DocumentState, entry: ScopedArrangementNote) {
  const core = documentState.coreDocument;
  if (!core) return null;
  const part = core.score.parts.find((candidate) => candidate.sourcePartId === entry.partId || candidate.id === entry.partId);
  if (!part) return null;
  const sourceIsTab = isTabStaffForArrangement(part, entry.note.staffIndex);
  const sourcePartIndex = core.score.parts.findIndex((candidate) => candidate.id === part.id);
  const pairedStaffCandidates = core.score.parts
    .flatMap((candidatePart, candidatePartIndex) => candidatePart.staves.map((staff) => ({
      part: candidatePart,
      partIndex: candidatePartIndex,
      staff,
      isTab: isTabStaffForArrangement(candidatePart, staff.staffIndex),
    })))
    .filter((candidate) => (
      candidate.isTab !== sourceIsTab
      && !(candidate.part.id === part.id && candidate.staff.staffIndex === entry.note.staffIndex)
    ))
    .sort((left, right) => (
      Number(left.part.id !== part.id) - Number(right.part.id !== part.id)
      || Math.abs(left.staff.staffIndex - entry.note.staffIndex) - Math.abs(right.staff.staffIndex - entry.note.staffIndex)
      || Math.abs(left.partIndex - sourcePartIndex) - Math.abs(right.partIndex - sourcePartIndex)
    ));

  for (const candidate of pairedStaffCandidates) {
    const measure = candidate.staff.measures.find((candidateMeasure) => candidateMeasure.measureNumber === entry.measure.measureNumber);
    const sameVoiceEvent = measure?.voices
      .find((voice) => voice.voiceId === entry.note.voiceId)
      ?.events.find((candidateEvent) => (
        candidateEvent.kind === 'note'
        && sameTimestamp(candidateEvent, entry.note)
        && (!candidate.isTab || Boolean(candidateEvent.guitar))
        && (candidate.isTab || sameWrittenPitch(candidateEvent, entry.note))
      ));
    const event = sameVoiceEvent ?? measure?.voices
      .flatMap((voice) => voice.events)
      .find((candidateEvent) => (
        candidateEvent.kind === 'note'
        && sameTimestamp(candidateEvent, entry.note)
        && (!candidate.isTab || Boolean(candidateEvent.guitar))
        && (candidate.isTab || sameWrittenPitch(candidateEvent, entry.note))
      ));
    if (event?.kind === 'note' && event.guitar) {
      return { note: event, staffIndex: candidate.staff.staffIndex, corePartId: candidate.part.id };
    }
  }

  return null;
}

export function guitarPlacementForPitch(
  pitch: { step: string; alter: number; octave: number },
  sourceGuitar?: NonNullable<NoteEvent['guitar']>,
): NonNullable<NoteEvent['guitar']> | null {
  const targetMidi = writtenPitchToMidi(guitarWrittenToSoundingPitch(pitch));
  const sourceString = sourceGuitar?.string;
  const sourceFret = sourceGuitar?.fret;
  const sourceTuning = sourceGuitar?.tuning;
  const sourceStringTuning = sourceString ? STANDARD_GUITAR_TUNING.find((entry) => entry.string === sourceString) : null;
  if (sourceString && sourceStringTuning) {
    const fret = targetMidi - sourceStringTuning.openMidi;
    if (fret >= 0 && fret <= MAX_GUITAR_FRET) {
      return {
        string: sourceString,
        fret,
        ...(sourceTuning ? { tuning: sourceTuning } : {}),
        ...(sourceGuitar?.techniques?.length ? { techniques: [...sourceGuitar.techniques] } : {}),
      };
    }
  }

  const candidates = STANDARD_GUITAR_TUNING
    .map((stringTuning) => ({
      string: stringTuning.string,
      fret: targetMidi - stringTuning.openMidi,
    }))
    .filter((candidate) => candidate.fret >= 0 && candidate.fret <= MAX_GUITAR_FRET)
    .sort((left, right) => (
      Math.abs(left.string - (sourceString ?? left.string)) - Math.abs(right.string - (sourceString ?? right.string))
      || Math.abs(left.fret - (sourceFret ?? left.fret)) - Math.abs(right.fret - (sourceFret ?? right.fret))
      || left.fret - right.fret
    ));
  const selected = candidates[0];
  if (!selected) return null;
  return {
    string: selected.string,
    fret: selected.fret,
    ...(sourceTuning ? { tuning: sourceTuning } : {}),
    ...(sourceGuitar?.techniques?.length ? { techniques: [...sourceGuitar.techniques] } : {}),
  };
}

export function describeGuitarPlacementFailure(pitch: { step: string; alter: number; octave: number }) {
  const targetMidi = writtenPitchToMidi(guitarWrittenToSoundingPitch(pitch));
  const minMidi = Math.min(...STANDARD_GUITAR_TUNING.map((entry) => entry.openMidi));
  const maxMidi = Math.max(...STANDARD_GUITAR_TUNING.map((entry) => entry.openMidi + MAX_GUITAR_FRET));
  if (targetMidi < minMidi) {
    return `below standard guitar range (${pitch.step}${pitch.alter === 1 ? '#' : pitch.alter === -1 ? 'b' : ''}${pitch.octave})`;
  }
  if (targetMidi > maxMidi) {
    return `above standard guitar range (${pitch.step}${pitch.alter === 1 ? '#' : pitch.alter === -1 ? 'b' : ''}${pitch.octave})`;
  }
  return `no standard guitar string supports ${pitch.step}${pitch.alter === 1 ? '#' : pitch.alter === -1 ? 'b' : ''}${pitch.octave} within frets 0-${MAX_GUITAR_FRET}`;
}
