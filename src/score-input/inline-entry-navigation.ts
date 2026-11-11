import { getEffectiveMeasureTimingFromStaff } from '@/src/score-core/measure-timing';
import type { ScoreDocumentModel, StaffNode, TimedEvent } from '@/src/score-core/model/types';

/*
 * Where the inline-entry popover stands and where it goes next (K4, K6 in
 * docs/note-entry-mastery-ledger.md). A position is a bar and an onset in one voice of one staff. Lyrics
 * move from note to note; chord symbols move by note, rest or beat, by bar, or by a note value, as in
 * MuseScore (handbook, lyrics and chord symbols; `navigateToTextElementInNearMeasure`).
 */

export interface EntryPosition {
  corePartId: string | null;
  staffIndex: number;
  voiceId: number;
  measureNumber: number;
  /** Onset in the bar as a fraction of a whole note. */
  timestampNum: number;
  timestampDen: number;
  coreMeasureId?: string | null;
  /** The event that starts here, when one does. */
  coreEntityId?: string | null;
  isRest?: boolean;
}

export type ChordAdvance = 'next' | 'previous' | 'nextBar' | 'previousBar' | 'nextBeat' | 'previousBeat' | { value: string };

const VALUE_WHOLES: Record<string, number> = { '64': 1 / 64, '32': 1 / 32, '16': 1 / 16, '8': 1 / 8, '4': 1 / 4, '2': 1 / 2, '1': 1 };
const EPSILON = 1e-9;

function findStaff(document: ScoreDocumentModel, position: Pick<EntryPosition, 'corePartId' | 'staffIndex'>): StaffNode | null {
  const wanted = position.corePartId?.replace(/^part:/, '') ?? null;
  for (const part of document.score.parts) {
    if (wanted && part.id.replace(/^part:/, '') !== wanted && part.sourcePartId !== wanted) continue;
    const staff = part.staves.find((entry) => entry.staffIndex === position.staffIndex);
    if (staff) return staff;
  }
  return null;
}

const onsetOf = (event: Pick<TimedEvent, 'timestampNum' | 'timestampDen'>) => event.timestampNum / Math.max(event.timestampDen, 1);

function fraction(wholes: number): { timestampNum: number; timestampDen: number } {
  // Onsets are multiples of small note values or tuplet units: 6720 = 2^6 * 3 * 5 * 7 covers them.
  const den = 6720;
  const num = Math.round(wholes * den);
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const divisor = gcd(Math.abs(num), den) || 1;
  return { timestampNum: num / divisor, timestampDen: den / divisor };
}

/** The main events (no chord tones, no grace notes) of the position's voice in a bar, in order. */
function mainEvents(document: ScoreDocumentModel, staff: StaffNode, measureNumber: number, voiceId: number) {
  const measure = staff.measures.find((entry) => entry.measureNumber === measureNumber);
  const voice = measure?.voices.find((entry) => entry.voiceId === voiceId);
  const graces = new Set(document.graceNotes.map((grace) => grace.eventId));
  return {
    measure: measure ?? null,
    events: [...(voice?.events ?? [])]
      .filter((event) => !event.isChord && !graces.has(event.id))
      .sort((left, right) => onsetOf(left) - onsetOf(right)),
  };
}

function positionOfEvent(position: EntryPosition, measureNumber: number, measureId: string | null, event: TimedEvent): EntryPosition {
  return {
    corePartId: position.corePartId,
    staffIndex: position.staffIndex,
    voiceId: position.voiceId,
    measureNumber,
    coreMeasureId: measureId,
    timestampNum: event.timestampNum,
    timestampDen: event.timestampDen,
    coreEntityId: event.id,
    isRest: event.kind === 'rest',
  };
}

function barLength(staff: StaffNode, measureNumber: number) {
  return getEffectiveMeasureTimingFromStaff(staff, { measureNumber })?.durationRatio ?? 1;
}

function beatLength(staff: StaffNode, measureNumber: number) {
  const beatType = getEffectiveMeasureTimingFromStaff(staff, { measureNumber })?.timeSignature?.beatType ?? 4;
  return 1 / beatType;
}

function measureNumbers(staff: StaffNode) {
  return staff.measures.map((measure) => measure.measureNumber);
}

function at(position: EntryPosition, staff: StaffNode, document: ScoreDocumentModel, measureNumber: number, wholes: number): EntryPosition {
  const { measure, events } = mainEvents(document, staff, measureNumber, position.voiceId);
  const starting = events.find((event) => Math.abs(onsetOf(event) - wholes) < EPSILON) ?? null;
  return {
    corePartId: position.corePartId,
    staffIndex: position.staffIndex,
    voiceId: position.voiceId,
    measureNumber,
    coreMeasureId: measure?.id ?? null,
    ...(starting ? { timestampNum: starting.timestampNum, timestampDen: starting.timestampDen } : fraction(wholes)),
    coreEntityId: starting?.id ?? null,
    isRest: starting ? starting.kind === 'rest' : undefined,
  };
}

/** The next or previous note of the voice (rests are skipped): where the next syllable goes. */
export function lyricNeighbour(document: ScoreDocumentModel | null | undefined, position: EntryPosition, direction: 1 | -1): EntryPosition | null {
  if (!document) return null;
  const staff = findStaff(document, position);
  if (!staff) return null;
  const numbers = measureNumbers(staff);
  let measureIndex = numbers.indexOf(position.measureNumber);
  if (measureIndex < 0) return null;
  const here = onsetOf(position);
  for (let first = true; measureIndex >= 0 && measureIndex < numbers.length; measureIndex += direction, first = false) {
    const number = numbers[measureIndex]!;
    const { measure, events } = mainEvents(document, staff, number, position.voiceId);
    const notes = events.filter((event) => event.kind === 'note');
    const candidates = first
      ? notes.filter((event) => (direction > 0 ? onsetOf(event) > here + EPSILON : onsetOf(event) < here - EPSILON))
      : notes;
    const found = direction > 0 ? candidates[0] : candidates[candidates.length - 1];
    if (found) return positionOfEvent(position, number, measure?.id ?? null, found);
  }
  return null;
}

/** Where a chord symbol goes next. Null at the edges of the score. */
export function chordNeighbour(document: ScoreDocumentModel | null | undefined, position: EntryPosition, advance: ChordAdvance): EntryPosition | null {
  if (!document) return null;
  const staff = findStaff(document, position);
  if (!staff) return null;
  const numbers = measureNumbers(staff);
  const measureIndex = numbers.indexOf(position.measureNumber);
  if (measureIndex < 0) return null;
  const here = onsetOf(position);
  const length = barLength(staff, position.measureNumber);
  const beat = beatLength(staff, position.measureNumber);

  if (advance === 'nextBar' || advance === 'previousBar') {
    const target = numbers[measureIndex + (advance === 'nextBar' ? 1 : -1)];
    return target == null ? null : at(position, staff, document, target, 0);
  }

  const forward = (wholes: number): EntryPosition | null => {
    // Past the end of the bar the rest carries into the following bars.
    let index = measureIndex;
    let onset = wholes;
    let barLen = length;
    while (onset > barLen - EPSILON) {
      onset -= barLen;
      index += 1;
      if (index >= numbers.length) return null;
      barLen = barLength(staff, numbers[index]!);
    }
    return at(position, staff, document, numbers[index]!, Math.max(0, onset));
  };
  const backward = (wholes: number): EntryPosition | null => {
    if (wholes > -EPSILON) return at(position, staff, document, position.measureNumber, Math.max(0, wholes));
    const previous = numbers[measureIndex - 1];
    if (previous == null) return null;
    return at(position, staff, document, previous, Math.max(0, barLength(staff, previous) + wholes));
  };

  if (typeof advance === 'object') return forward(here + (VALUE_WHOLES[advance.value] ?? 0.25));

  const nextBeat = (Math.floor(here / beat + EPSILON) + 1) * beat;
  const previousBeat = (Math.ceil(here / beat - EPSILON) - 1) * beat;
  if (advance === 'nextBeat') return forward(nextBeat);
  if (advance === 'previousBeat') return backward(previousBeat);

  const { events } = mainEvents(document, staff, position.measureNumber, position.voiceId);
  if (advance === 'next') {
    // "The next beat, note, or rest (whichever comes first)."
    const nextEvent = events.map(onsetOf).find((onset) => onset > here + EPSILON);
    return forward(Math.min(nextBeat, nextEvent ?? Number.POSITIVE_INFINITY));
  }
  const previousEvent = [...events].map(onsetOf).reverse().find((onset) => onset < here - EPSILON);
  if (previousEvent == null && previousBeat < -EPSILON) {
    const previous = numbers[measureIndex - 1];
    if (previous == null) return null;
    const lastEvent = mainEvents(document, staff, previous, position.voiceId).events.map(onsetOf).pop() ?? 0;
    const lastBeat = (Math.ceil(barLength(staff, previous) / beatLength(staff, previous) - EPSILON) - 1) * beatLength(staff, previous);
    return at(position, staff, document, previous, Math.max(lastEvent, lastBeat));
  }
  return backward(Math.max(previousBeat, previousEvent ?? Number.NEGATIVE_INFINITY));
}

/** The onset right after an event ends: where a hairpin or line over it stops. May be the end of its bar. */
export function endOfEvent(document: ScoreDocumentModel | null | undefined, position: EntryPosition): { measureNumber: number; timestampNum: number; timestampDen: number } | null {
  if (!document) return null;
  const staff = findStaff(document, position);
  if (!staff) return null;
  const { events } = mainEvents(document, staff, position.measureNumber, position.voiceId);
  const event = events.find((entry) => entry.id === position.coreEntityId)
    ?? events.find((entry) => Math.abs(onsetOf(entry) - onsetOf(position)) < EPSILON);
  if (!event) return null;
  const den = Math.max(event.timestampDen, 1);
  return { measureNumber: position.measureNumber, timestampNum: event.timestampNum + event.durationDivisions, timestampDen: den };
}

/** The first verse (1-based) that has no syllable on the note: where a new lyric entry starts. */
export function firstFreeVerse(document: ScoreDocumentModel | null | undefined, eventId: string | null | undefined) {
  if (!document || !eventId) return 1;
  const used = new Set(document.lyricLines.filter((line) => line.eventId === eventId && (line.text || line.extend)).map((line) => line.verseNumber));
  let verse = 1;
  while (used.has(verse)) verse += 1;
  return verse;
}

export function lyricAt(document: ScoreDocumentModel | null | undefined, eventId: string | null | undefined, verseNumber: number) {
  return document?.lyricLines.find((line) => line.eventId === eventId && line.verseNumber === verseNumber) ?? null;
}
