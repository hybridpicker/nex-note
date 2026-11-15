import { DOMParser, XMLSerializer, type Document as XmlDocument, type Element as XmlElement } from '@xmldom/xmldom';
import { Midi } from '@tonejs/midi';
import { importMusicXmlToCore } from '@/src/musicxml-adapter/import/import-musicxml';
import { getEffectiveMeasureTimingFromStaff } from '@/src/score-core/measure-timing';
import type { DirectionNode, MeasureNode, PartNode, StaffNode, TimedEvent, TremoloSpan } from '@/src/score-core/model/types';
import { cleanMuseScoreStderr } from './musescore-stderr';
import { buildPlaybackMeasureOrder } from './playback-measure-order';
import {
  musicXmlProgramToToneProgram,
  instrumentContextFromPart,
  resolveInstrumentIdFromSource,
  resolveMidiInstrumentSound,
  resolvePartInstrumentId,
  type InstrumentNameContext,
  type MidiInstrumentSound,
} from './midi-instruments';

type XmlEl = XmlElement;

export { cleanMuseScoreStderr };

const MIDI_PPQ = 480;
const DEFAULT_TEMPO_BPM = 120;
const MIDI_TICKS_PER_WHOLE = MIDI_PPQ * 4;

const STEP_TO_SEMITONE: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

export interface MuseScoreMidiExit {
  code: number | null;
  signal: NodeJS.Signals | null;
  stderr: string;
  timeoutMs: number;
  /**
   * True when the route's own timer stopped the process. When it is not given, a SIGTERM without
   * an exit code counts as a timeout, which is how Node's `spawn({ timeout })` ends a process.
   */
  timedOut?: boolean;
}

function museScoreExitTimedOut(input: MuseScoreMidiExit) {
  return input.timedOut ?? (input.code === null && input.signal === 'SIGTERM');
}

function museScoreExitReason(input: MuseScoreMidiExit) {
  if (museScoreExitTimedOut(input)) {
    return `timed out after ${Math.round(input.timeoutMs / 1000)}s${input.signal ? ` (${input.signal})` : ''}`;
  }
  if (input.code === null) return `was terminated by signal ${input.signal ?? 'unknown'}`;
  return `exited with code ${input.code}`;
}

export function formatMuseScoreMidiExportError(input: MuseScoreMidiExit) {
  const cleanedStderr = cleanMuseScoreStderr(input.stderr);
  return `MuseScore MIDI export failed: ${museScoreExitReason(input)}${cleanedStderr ? `: ${cleanedStderr}` : ''}`;
}

function readUint32(data: Uint8Array, offset: number) {
  return ((data[offset] << 24) >>> 0) + (data[offset + 1] << 16) + (data[offset + 2] << 8) + data[offset + 3];
}

function chunkTag(data: Uint8Array, offset: number) {
  return String.fromCharCode(data[offset], data[offset + 1], data[offset + 2], data[offset + 3]);
}

/**
 * A Standard MIDI File whose every chunk is present in full: the header, as many `MTrk` chunks
 * as it announces, and an end-of-track event at the end of each of them. A file cut off while
 * it was written fails this check even when a lenient parser still reads some notes from it.
 */
export function isCompleteStandardMidiFile(data: Uint8Array | null | undefined) {
  if (!data || data.length < 14 || chunkTag(data, 0) !== 'MThd') return false;
  const headerLength = readUint32(data, 4);
  if (headerLength < 6 || 8 + headerLength > data.length) return false;
  const trackCount = (data[10] << 8) + data[11];
  if (trackCount < 1) return false;
  let offset = 8 + headerLength;
  let tracks = 0;
  while (offset + 8 <= data.length) {
    const length = readUint32(data, offset + 4);
    const end = offset + 8 + length;
    if (end > data.length) return false;
    if (chunkTag(data, offset) === 'MTrk') {
      if (length < 3 || data[end - 3] !== 0xff || data[end - 2] !== 0x2f || data[end - 1] !== 0x00) return false;
      tracks++;
    }
    offset = end;
  }
  return offset === data.length && tracks === trackCount;
}

function countMidiNotes(data: Uint8Array) {
  try {
    return new Midi(data).tracks.reduce((count, track) => count + track.notes.length, 0);
  } catch {
    return 0;
  }
}

export type MuseScoreMidiOutcome =
  | { accepted: true; renderer: 'musescore'; data: Uint8Array; abnormalExit: string | null }
  | { accepted: false; error: string };

/**
 * Whether the route may answer with the file MuseScore wrote. MuseScore 4.7 often aborts while it
 * shuts down ("mutex lock failed", SIGABRT) after it has written a complete MIDI file, so an
 * abnormal exit alone is no reason to fall back: the file is used when it is a complete MIDI file
 * with at least one note. A clean exit keeps the previous behaviour and uses whatever it wrote.
 */
export function evaluateMuseScoreMidiOutput(exit: MuseScoreMidiExit, data: Uint8Array | null): MuseScoreMidiOutcome {
  if (exit.code === 0 && !exit.timedOut) {
    return data
      ? { accepted: true, renderer: 'musescore', data, abnormalExit: null }
      : { accepted: false, error: 'MuseScore MIDI export failed: no output file was written' };
  }
  if (data && isCompleteStandardMidiFile(data) && countMidiNotes(data) > 0) {
    return { accepted: true, renderer: 'musescore', data, abnormalExit: museScoreExitReason(exit) };
  }
  return { accepted: false, error: formatMuseScoreMidiExportError(exit) };
}

function directChildrenByTag(parent: XmlEl, tag: string) {
  const matches: XmlEl[] = [];
  for (let i = 0; i < parent.childNodes.length; i++) {
    const child = parent.childNodes[i];
    if (child.nodeType === 1 && (child as XmlEl).tagName === tag) matches.push(child as XmlEl);
  }
  return matches;
}

function directChildText(parent: XmlEl, tag: string) {
  return directChildrenByTag(parent, tag)[0]?.textContent ?? null;
}

function notePitchKey(note: XmlEl) {
  const pitch = directChildrenByTag(note, 'pitch')[0];
  if (!pitch) return null;
  const step = directChildText(pitch, 'step') ?? 'C';
  const alter = directChildText(pitch, 'alter') ?? '0';
  const octave = directChildText(pitch, 'octave') ?? '4';
  return `${step}:${alter}:${octave}`;
}

function hasDirectTieType(note: XmlEl, type: 'start' | 'stop') {
  return directChildrenByTag(note, 'tie').some((tie) => tie.getAttribute('type') === type);
}

function hasNotationTiedType(note: XmlEl, type: 'start' | 'stop') {
  return directChildrenByTag(note, 'notations')
    .some((notations) => Array.from(notations.getElementsByTagName('tied')).some((tied) => tied.getAttribute('type') === type));
}

function removeTieStartMarkers(note: XmlEl) {
  for (const tie of directChildrenByTag(note, 'tie')) {
    if (tie.getAttribute('type') === 'start') note.removeChild(tie);
  }
  for (const notations of directChildrenByTag(note, 'notations')) {
    const tiedToRemove = Array.from(notations.getElementsByTagName('tied')).filter((tied) => tied.getAttribute('type') === 'start');
    for (const tied of tiedToRemove) tied.parentNode?.removeChild(tied);
    if (!notations.childNodes.length) notations.parentNode?.removeChild(notations);
  }
}

function stripMalformedTieStarts(doc: XmlDocument) {
  let removed = 0;
  for (const part of Array.from(doc.getElementsByTagName('part'))) {
    const notes = Array.from(part.getElementsByTagName('note'));
    for (let index = 0; index < notes.length; index++) {
      const note = notes[index];
      if (!hasDirectTieType(note, 'start') && !hasNotationTiedType(note, 'start')) continue;

      const staff = directChildText(note, 'staff') ?? '1';
      const voice = directChildText(note, 'voice') ?? '1';
      const pitchKey = notePitchKey(note);
      if (!pitchKey) continue;

      let nextMatch: XmlEl | null = null;
      for (let nextIndex = index + 1; nextIndex < notes.length; nextIndex++) {
        const candidate = notes[nextIndex];
        if ((directChildText(candidate, 'staff') ?? '1') !== staff) continue;
        if ((directChildText(candidate, 'voice') ?? '1') !== voice) continue;
        const candidatePitch = notePitchKey(candidate);
        if (!candidatePitch) continue;
        if (candidatePitch === pitchKey) {
          nextMatch = candidate;
          break;
        }
      }

      const hasMatchingStop = nextMatch
        ? (hasDirectTieType(nextMatch, 'stop') || hasNotationTiedType(nextMatch, 'stop'))
        : false;

      if (!hasMatchingStop) {
        removeTieStartMarkers(note);
        removed++;
      }
    }
  }
  return removed;
}

function removeDirectChildrenByTag(parent: XmlEl, tag: string) {
  const toRemove = directChildrenByTag(parent, tag);
  for (const child of toRemove) {
    parent.removeChild(child);
  }
  return toRemove.length;
}

function stripPlaybackMetadata(doc: XmlDocument, keepPartIds: ReadonlySet<string> = new Set()) {
  let removedTranspose = 0;
  let removedInstrumentSound = 0;
  let removedMidiDevice = 0;
  let removedMidiInstrument = 0;
  let removedVirtualInstrument = 0;

  for (const scorePart of Array.from(doc.getElementsByTagName('score-part'))) {
    // Percussion parts keep their instruments: MuseScore needs `<midi-unpitched>` to play drum keys.
    if (keepPartIds.has(scorePart.getAttribute('id') ?? '')) continue;
    for (const scoreInstrument of Array.from(scorePart.getElementsByTagName('score-instrument'))) {
      removedInstrumentSound += removeDirectChildrenByTag(scoreInstrument, 'instrument-sound');
      removedVirtualInstrument += removeDirectChildrenByTag(scoreInstrument, 'virtual-instrument');
    }
    removedMidiDevice += removeDirectChildrenByTag(scorePart, 'midi-device');
    removedMidiInstrument += removeDirectChildrenByTag(scorePart, 'midi-instrument');
  }

  for (const part of Array.from(doc.getElementsByTagName('part'))) {
    const firstMeasure = Array.from(part.getElementsByTagName('measure'))[0] as XmlEl | undefined;
    const attributes = firstMeasure
      ? directChildrenByTag(firstMeasure, 'attributes')[0]
      : undefined;
    if (!attributes) continue;
    // <transpose> stays: MuseScore renders written pitch plus transpose as sounding pitch (a
    // B-flat clarinet's written D5 is MIDI 72 with it and 74 without it).
  }

  return {
    removedTranspose,
    removedInstrumentSound,
    removedMidiDevice,
    removedMidiInstrument,
    removedVirtualInstrument,
  };
}

function normalizeName(value: string | null | undefined) {
  return (value ?? '').trim();
}

function tabBaseName(value: string) {
  return value
    .replace(/\b(tab|tablature)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function scorePartDisplayName(scorePart: XmlEl) {
  return normalizeName(directChildText(scorePart, 'part-name'))
    || normalizeName(scorePart.getElementsByTagName('instrument-name')[0]?.textContent)
    || normalizeName(scorePart.getAttribute('id'));
}

function partHasTabNotation(part: XmlEl | undefined) {
  if (!part) return false;
  return Array.from(part.getElementsByTagName('staff-type')).some((entry) => /tab/i.test(entry.textContent ?? ''))
    || Array.from(part.getElementsByTagName('clef')).some((entry) => /tab/i.test(entry.getElementsByTagName('sign')[0]?.textContent ?? ''));
}

function isTabScorePart(scorePart: XmlEl, part: XmlEl | undefined) {
  const name = scorePartDisplayName(scorePart);
  return /\b(tab|tablature)\b/i.test(name) || partHasTabNotation(part);
}

function clampMidiNumber(value: number) {
  return Math.max(0, Math.min(127, Math.round(value)));
}

function pitchToMidiNumber(pitch: { step: string; alter: number; octave: number }) {
  const step = pitch.step.trim().toUpperCase();
  return clampMidiNumber(((pitch.octave + 1) * 12) + (STEP_TO_SEMITONE[step] ?? 0) + pitch.alter);
}

function divisionsToTicks(divisions: number, divisionsPerQuarter: number) {
  if (!Number.isFinite(divisions) || !Number.isFinite(divisionsPerQuarter) || divisionsPerQuarter <= 0) return 0;
  return Math.max(0, Math.round((divisions / divisionsPerQuarter) * MIDI_PPQ));
}

function fractionToTicks(numerator: number | undefined, denominator: number | undefined) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || !denominator) return 0;
  return Math.max(0, Math.round((numerator! / denominator!) * MIDI_TICKS_PER_WHOLE));
}

function eventOffsetTicks(event: TimedEvent) {
  return fractionToTicks(event.timestampNum, event.timestampDen);
}

function eventDurationTicks(event: TimedEvent) {
  return Math.max(1, fractionToTicks(event.durationDivisions, event.timestampDen));
}

function measureFallbackDurationTicks(measure: MeasureNode) {
  const eventEnd = measure.voices.reduce((maxEnd, voice) => (
    voice.events.reduce((voiceEnd, event) => Math.max(
      voiceEnd,
      eventOffsetTicks(event) + eventDurationTicks(event),
    ), maxEnd)
  ), 0);
  return Math.max(eventEnd, MIDI_PPQ * 4);
}

/**
 * Where each measure pass starts, in playback order: repeats and first/second endings are
 * unrolled with the same order the playback timeline uses (lib/playback-measure-order.ts).
 */
// Measure lengths per staff of one imported score; the renderer asks for them many times.
const measureDurationCache = new WeakMap<StaffNode, { measures: MeasureNode[]; durations: number[] }>();

function staffMeasureDurations(staff: StaffNode) {
  const cached = measureDurationCache.get(staff);
  if (cached && cached.measures === staff.measures) return cached.durations;
  const durations = staff.measures.map((measure) => {
    const timing = getEffectiveMeasureTimingFromStaff(staff, { measureId: measure.id });
    const duration = timing
      ? divisionsToTicks(timing.durationDivisions, timing.divisions)
      : measureFallbackDurationTicks(measure);
    return Math.max(1, duration || measureFallbackDurationTicks(measure));
  });
  measureDurationCache.set(staff, { measures: staff.measures, durations });
  return durations;
}

function buildMeasureTiming(staff: StaffNode, order: number[] | null) {
  const durations = staffMeasureDurations(staff);
  const passes: Array<{ measure: MeasureNode; startTicks: number }> = [];
  let cursorTicks = 0;
  for (const measureIndex of order ?? staff.measures.map((_, index) => index)) {
    const measure = staff.measures[measureIndex];
    if (!measure) continue;
    passes.push({ measure, startTicks: cursorTicks });
    cursorTicks += durations[measureIndex] ?? 1;
  }
  return { passes };
}

function scorePlaybackOrder(parts: PartNode[]) {
  return buildPlaybackMeasureOrder(parts[0]?.staves[0]?.measures);
}

function tempoFromDirection(direction: DirectionNode) {
  if (direction.kind !== 'metronome') return null;
  const bpm = Number.parseFloat(direction.value ?? '');
  return Number.isFinite(bpm) && bpm > 0 ? bpm : null;
}

function collectFallbackTempoEvents(parts: PartNode[]) {
  const events = new Map<number, number>();

  const order = scorePlaybackOrder(parts);
  for (const part of parts) {
    for (const staff of part.staves) {
      const timing = buildMeasureTiming(staff, order);
      for (const { measure, startTicks: measureStart } of timing.passes) {
        for (const direction of measure.directions) {
          const bpm = tempoFromDirection(direction);
          if (!bpm) continue;
          const ticks = measureStart + fractionToTicks(direction.timestampNum, direction.timestampDen);
          if (!events.has(ticks)) events.set(ticks, bpm);
        }
      }
    }
  }

  if (!events.has(0)) events.set(0, DEFAULT_TEMPO_BPM);
  return [...events.entries()]
    .sort(([a], [b]) => a - b)
    .map(([ticks, bpm]) => ({ ticks, bpm }));
}

function collectFallbackTimeSignatureEvents(parts: PartNode[]) {
  const events = new Map<number, number[]>();

  const order = scorePlaybackOrder(parts);
  for (const part of parts) {
    for (const staff of part.staves) {
      const timing = buildMeasureTiming(staff, order);
      for (const { measure, startTicks: measureStart } of timing.passes) {
        for (const attributes of measure.attributes) {
          const time = attributes.time;
          if (!time?.beats || !time.beatType) continue;
          if (!events.has(measureStart)) events.set(measureStart, [time.beats, time.beatType]);
        }
      }
    }
  }

  if (!events.has(0)) events.set(0, [4, 4]);
  return [...events.entries()]
    .sort(([a], [b]) => a - b)
    .map(([ticks, timeSignature]) => ({ ticks, timeSignature }));
}

function nextMidiChannel(index: number) {
  const channel = index % 15;
  return channel >= 9 ? channel + 1 : channel;
}

function trackNameForStaff(part: PartNode, staff: StaffNode) {
  return part.staves.length > 1 ? `${part.name} staff ${staff.staffIndex}` : part.name;
}

// ---------------------------------------------------------------------------------------------
// Expression of the fallback renderer. The values follow what the MuseScore 4 CLI writes for the
// same notation, so desktop (MuseScore) and iPad (this renderer) play a score alike.
// ---------------------------------------------------------------------------------------------

/** MuseScore's velocities for dynamic marks. */
export const DYNAMIC_VELOCITIES: Readonly<Record<string, number>> = {
  pppppp: 1, ppppp: 5, pppp: 10, ppp: 16, pp: 33, p: 49, mp: 64, mf: 80, f: 96, ff: 112, fff: 126, ffff: 127, fffff: 127, ffffff: 127,
};

/**
 * One-note accents: the velocity of the note on the mark, and the level after it (else the
 * previous level). MuseScore 4.7 holds sf-type marks 18 below their peak afterwards (p, sfz, ...
 * plays 49, 112, 94, 94, ...; sff 126 then 108).
 */
const ACCENT_DYNAMICS: Readonly<Record<string, { velocity: number; after?: number }>> = {
  sf: { velocity: 112, after: 94 }, sfz: { velocity: 112, after: 94 }, fz: { velocity: 112, after: 94 },
  rf: { velocity: 112, after: 94 }, rfz: { velocity: 112, after: 94 },
  sff: { velocity: 126, after: 108 }, sffz: { velocity: 126, after: 108 },
  sfp: { velocity: 112, after: 49 }, sfpp: { velocity: 112, after: 33 }, fp: { velocity: 96, after: 49 }, pf: { velocity: 49, after: 96 },
};

const DEFAULT_VELOCITY = DYNAMIC_VELOCITIES.mf;
/** MuseScore 4.7 plays accents and marcatos at 1.2 times the level (p 49 -> 58, mf 80 -> 96, ff 112 -> 127). */
const ACCENT_VELOCITY_FACTOR = 1.2;
const DYNAMIC_STEPS = [1, 5, 10, 16, 33, 49, 64, 80, 96, 112, 126, 127];
/** Sounding length of articulated notes, as MuseScore 4.7 plays them (marcato 320 of 480 ticks). */
const ARTICULATION_LENGTH_FACTORS: Readonly<Record<string, number>> = { staccato: 0.5, staccatissimo: 1 / 3, 'strong-accent': 2 / 3, tenuto: 1 };
const FERMATA_TEMPO_FACTOR = 0.5;
const PEDAL_CHANGE_GAP_TICKS = MIDI_PPQ / 32;

interface DynamicMark { ticks: number; velocity: number; accent: boolean }
interface VelocityRamp { start: number; end: number; from: number; to: number }
interface VelocityTimeline { levels: DynamicMark[]; accents: Map<number, number>; ramps: VelocityRamp[] }

interface PlacedDirection { direction: DirectionNode; ticks: number; key: string }

function placedDirections(staff: StaffNode, order: number[] | null): PlacedDirection[] {
  return buildMeasureTiming(staff, order).passes.flatMap(({ measure, startTicks }) => measure.directions.map((direction) => ({
    direction,
    ticks: startTicks + fractionToTicks(direction.timestampNum, direction.timestampDen),
    key: `${startTicks}:${direction.id}`,
  })));
}

function isExpressionDirection(direction: DirectionNode) {
  return direction.kind === 'dynamics' || direction.kind === 'wedge';
}

/**
 * The dynamics that shape one staff. A staff with dynamics of its own (a direction with a
 * `<staff>` for it) follows only those and the part-wide ones; a staff without them follows the
 * dynamics of the whole part, as a pianist's left hand follows a mark written between the staves.
 */
function staffExpressionDirections(part: PartNode, staff: StaffNode, order: number[] | null) {
  const own = placedDirections(staff, order).filter(({ direction }) => isExpressionDirection(direction));
  if (own.some(({ direction }) => direction.staffIndex === staff.staffIndex) || part.staves.length === 1) return own;
  const merged = new Map<string, PlacedDirection>();
  for (const other of part.staves) {
    for (const placed of placedDirections(other, order)) {
      if (isExpressionDirection(placed.direction)) merged.set(placed.key, placed);
    }
  }
  return [...merged.values()];
}

function levelAt(levels: DynamicMark[], ticks: number) {
  let level = DEFAULT_VELOCITY;
  for (const mark of levels) {
    if (mark.ticks > ticks) break;
    level = mark.velocity;
  }
  return level;
}

function buildVelocityTimeline(directions: PlacedDirection[]): VelocityTimeline {
  const sorted = [...directions].sort((a, b) => a.ticks - b.ticks);
  const levels: DynamicMark[] = [];
  const accents = new Map<number, number>();
  for (const { direction, ticks } of sorted) {
    if (direction.kind !== 'dynamics' || !direction.value) continue;
    const value = direction.value.toLowerCase();
    const level = DYNAMIC_VELOCITIES[value];
    if (level != null) {
      levels.push({ ticks, velocity: level, accent: false });
      continue;
    }
    const accent = ACCENT_DYNAMICS[value];
    if (!accent) continue;
    accents.set(ticks, accent.velocity);
    if (accent.after != null) levels.push({ ticks: ticks + 1, velocity: accent.after, accent: true });
  }
  levels.sort((a, b) => a.ticks - b.ticks);

  const ramps: VelocityRamp[] = [];
  const openWedges = new Map<number, { ticks: number; kind: 'crescendo' | 'diminuendo' }>();
  const wedges: Array<{ start: number; stop: number | null; kind: 'crescendo' | 'diminuendo' }> = [];
  for (const { direction, ticks } of sorted) {
    if (direction.kind !== 'wedge') continue;
    const number = direction.number ?? 1;
    if (direction.value === 'crescendo' || direction.value === 'diminuendo') {
      openWedges.set(number, { ticks, kind: direction.value });
    } else if (direction.value === 'stop') {
      const open = openWedges.get(number);
      if (!open) continue;
      openWedges.delete(number);
      wedges.push({ start: open.ticks, stop: ticks, kind: open.kind });
    }
  }
  for (const open of openWedges.values()) wedges.push({ start: open.ticks, stop: null, kind: open.kind });
  wedges.sort((a, b) => a.start - b.start);

  for (const wedge of wedges) {
    const from = levelAt(levels, wedge.start);
    // The hairpin leads to the next dynamic when one follows it closely; else it moves one step.
    const target = levels.find((mark) => !mark.accent && mark.ticks > wedge.start
      && (wedge.stop == null || mark.ticks <= wedge.stop + MIDI_PPQ));
    if (target) {
      ramps.push({ start: wedge.start, end: target.ticks, from, to: target.velocity });
      continue;
    }
    const to = wedge.kind === 'crescendo'
      ? DYNAMIC_STEPS.find((step) => step > from) ?? 127
      : [...DYNAMIC_STEPS].reverse().find((step) => step < from) ?? 1;
    const end = wedge.stop ?? wedge.start + MIDI_TICKS_PER_WHOLE;
    if (end <= wedge.start) continue;
    ramps.push({ start: wedge.start, end, from, to });
    levels.push({ ticks: end, velocity: to, accent: false });
    levels.sort((a, b) => a.ticks - b.ticks);
  }
  return { levels, accents, ramps };
}

function velocityAt(timeline: VelocityTimeline, ticks: number) {
  const accent = timeline.accents.get(ticks);
  if (accent != null) return accent;
  for (let index = timeline.ramps.length - 1; index >= 0; index--) {
    const ramp = timeline.ramps[index];
    if (ticks >= ramp.start && ticks < ramp.end) {
      return Math.floor(ramp.from + (ramp.to - ramp.from) * ((ticks - ramp.start) / (ramp.end - ramp.start)));
    }
  }
  return levelAt(timeline.levels, ticks);
}

function articulationVelocity(base: number, event: TimedEvent) {
  const accented = event.articulations?.some((name) => name === 'accent' || name === 'strong-accent');
  return Math.max(1, Math.min(127, accented ? Math.floor(base * ACCENT_VELOCITY_FACTOR) : base));
}

function articulationLengthFactor(event: TimedEvent) {
  let factor = 1;
  for (const name of event.articulations ?? []) {
    const value = ARTICULATION_LENGTH_FACTORS[name];
    if (value != null) factor = Math.min(factor, value);
  }
  return factor;
}

/** @tonejs/midi writes `floor(velocity * 127)`; half a step up keeps the intended integer. */
function toneVelocity(velocity: number) {
  return (Math.max(1, Math.min(127, velocity)) + 0.5) / 127;
}

/** Pedal marks of the whole part as CC64 changes: the pedal belongs to the instrument, not to a staff. */
function collectPartPedalEvents(part: PartNode, order: number[] | null) {
  const changes = new Map<string, { ticks: number; value: number }>();
  for (const staff of part.staves) {
    for (const { direction, ticks, key } of placedDirections(staff, order)) {
      if (direction.kind !== 'pedal') continue;
      const type = direction.value ?? 'start';
      if (type === 'start' || type === 'resume') changes.set(`${key}:down`, { ticks, value: 1 });
      else if (type === 'stop' || type === 'discontinue') changes.set(`${key}:up`, { ticks, value: 0 });
      else if (type === 'change') {
        changes.set(`${key}:up`, { ticks, value: 0 });
        changes.set(`${key}:down`, { ticks: ticks + PEDAL_CHANGE_GAP_TICKS, value: 1 });
      }
    }
  }
  const byTick = new Map<string, { ticks: number; value: number }>();
  for (const change of changes.values()) byTick.set(`${change.ticks}:${change.value}`, change);
  return [...byTick.values()].sort((a, b) => a.ticks - b.ticks || a.value - b.value);
}

/** Fermata spans, by start tick: MuseScore holds a fermata twice as long by halving the tempo. */
function collectFermataSpans(core: ReturnType<typeof importMusicXmlToCore>, order: number[] | null) {
  const spans = new Map<number, number>();
  if (core.fermataEventIds.size === 0) return spans;
  for (const part of core.score.parts) {
    for (const staff of part.staves) {
      for (const { measure, startTicks } of buildMeasureTiming(staff, order).passes) {
        for (const voice of measure.voices) {
          for (const event of voice.events) {
            if (event.hidden || event.durationDivisions === 0 || !core.fermataEventIds.has(event.id)) continue;
            const ticks = startTicks + eventOffsetTicks(event);
            const duration = eventDurationTicks(event);
            spans.set(ticks, Math.min(spans.get(ticks) ?? Number.POSITIVE_INFINITY, duration));
          }
        }
      }
    }
  }
  return spans;
}

function applyFermataTempos(tempos: Array<{ ticks: number; bpm: number }>, spans: Map<number, number>) {
  if (spans.size === 0) return tempos;
  const original = [...tempos].sort((a, b) => a.ticks - b.ticks);
  const bpmAt = (ticks: number) => {
    let bpm = original[0]?.bpm ?? DEFAULT_TEMPO_BPM;
    for (const tempo of original) {
      if (tempo.ticks > ticks) break;
      bpm = tempo.bpm;
    }
    return bpm;
  };
  const inFermata = (ticks: number) => [...spans].some(([start, duration]) => ticks >= start && ticks < start + duration);
  const result = new Map<number, number>();
  for (const tempo of original) result.set(tempo.ticks, inFermata(tempo.ticks) ? tempo.bpm * FERMATA_TEMPO_FACTOR : tempo.bpm);
  for (const [start, duration] of spans) {
    result.set(start, bpmAt(start) * FERMATA_TEMPO_FACTOR);
    const end = start + duration;
    if (!inFermata(end)) result.set(end, bpmAt(end));
  }
  return [...result.entries()].sort(([a], [b]) => a - b).map(([ticks, bpm]) => ({ ticks, bpm }));
}

/** Lines of a tremolo to the length of its repeated notes: one line repeats eighths. */
function tremoloStepTicks(lines: number) {
  return Math.max(MIDI_PPQ / 16, MIDI_PPQ / 2 ** Math.max(1, Math.min(3, lines)));
}

// --- Unpitched percussion -------------------------------------------------------------------

/** General MIDI percussion keys from instrument names (English, German, French, Italian). */
const DRUM_KEYS_BY_NAME: ReadonlyArray<readonly [RegExp, number]> = [
  [/open\s*hi-?\s*hat/i, 46], [/(pedal|foot)\s*hi-?\s*hat|hi-?\s*hat\s*(pedal|foot)/i, 44], [/hi-?\s*hat/i, 42],
  [/side\s*stick|cross\s*stick|rim/i, 37], [/electric\s*snare/i, 40], [/snare|side drum|kleine trommel|caisse claire|rullante/i, 38],
  [/acoustic\s*bass\s*drum/i, 35], [/bass\s*drum|kick|gro(ß|ss)e\s*trommel|grosse\s*caisse|grancassa/i, 36],
  [/hand\s*clap|clap/i, 39], [/low\s*floor\s*tom/i, 41], [/floor\s*tom/i, 43], [/low[-\s]*mid\s*tom/i, 47],
  [/hi(gh)?[-\s]*mid\s*tom/i, 48], [/low\s*tom/i, 45], [/hi(gh)?\s*tom/i, 50], [/\btoms?\b/i, 47],
  [/ride\s*bell/i, 53], [/ride/i, 51], [/china/i, 52], [/splash/i, 55], [/crash|cymbal|becken|piatti|cymbale/i, 49],
  [/tambourine|tamburin/i, 54], [/cowbell|kuhglocke/i, 56], [/vibraslap/i, 58], [/hi(gh)?\s*bongo/i, 60], [/bongo/i, 61],
  [/low\s*conga/i, 64], [/conga/i, 63], [/timbale/i, 65], [/agogo/i, 67], [/cabasa/i, 69], [/maracas|shaker/i, 70],
  [/whistle/i, 71], [/g(u|ü)iro/i, 73], [/claves/i, 75], [/wood\s*block|holzblock/i, 76], [/cuica/i, 78],
  [/triangle|triangel/i, 81],
];

export function drumKeyFromInstrumentName(name: string | null | undefined) {
  const text = (name ?? '').trim();
  if (!text) return null;
  return DRUM_KEYS_BY_NAME.find(([pattern]) => pattern.test(text))?.[1] ?? null;
}

/** General MIDI percussion key for a position on a five-line drum staff (common drum-set notation). */
export function drumKeyFromDisplayPosition(step: string, octave: number, notehead?: string | null) {
  const head = (notehead ?? '').trim().toLowerCase();
  const cross = head === 'x' || head === 'cross' || head === 'circle-x';
  switch (`${step.trim().toUpperCase()}${octave}`) {
    case 'D4': return 44;
    case 'E4': return 35;
    case 'F4': return 36;
    case 'G4': return 41;
    case 'A4': return 43;
    case 'B4': return 45;
    case 'C5': return cross ? 37 : 38;
    case 'D5': return 47;
    case 'E5': return 48;
    case 'F5': return head === 'diamond' ? 53 : cross ? 51 : 50;
    case 'G5': return head === 'circle-x' ? 46 : 42;
    case 'A5': return 49;
    case 'B5': return 57;
    case 'C6': return 55;
    default: return 38;
  }
}

interface ScoreInstrumentInfo { name: string; unpitched: number | null }

interface ScorePartPlaybackInfo {
  id: string;
  instrumentSound: string | null;
  midiProgram: number | null;
  names: string[];
  /** The part has unpitched notes or a percussion clef. */
  percussion: boolean;
  hasLyrics: boolean;
  octaveChange: number | null;
  meanPitch: number | null;
  /** Score instruments by id, with their one-based `<midi-unpitched>`. */
  instruments: Map<string, ScoreInstrumentInfo>;
}

function parseOptionalInt(text: string | null | undefined) {
  const value = Number.parseInt((text ?? '').trim(), 10);
  return Number.isFinite(value) ? value : null;
}

type PartContent = Pick<ScorePartPlaybackInfo, 'percussion' | 'hasLyrics' | 'octaveChange' | 'meanPitch'>;

/** Percussion, lyrics, transposition and register of a part, from the score model. */
function corePartContent(part: PartNode): PartContent {
  const context = instrumentContextFromPart(part);
  const percussion = part.staves.some((staff) => staff.measures.some((measure) => (
    measure.attributes.some((attributes) => attributes.clefs.some((clef) => /percussion/i.test(clef.sign ?? '')))
    || measure.voices.some((voice) => voice.events.some((event) => event.kind === 'rest' && Boolean(event.unpitched)))
  )));
  return {
    percussion,
    hasLyrics: Boolean(context.hasLyrics),
    octaveChange: context.octaveChange ?? null,
    meanPitch: context.meanPitch ?? null,
  };
}

/**
 * The renderer reads instrument data from `<part-list>` only; parsing the whole score a second
 * time would cost as much as the import itself on a long score.
 */
function parsePartListDocument(xml: string) {
  const partList = /<part-list\b[\s\S]*?<\/part-list>/.exec(xml)?.[0];
  return new DOMParser().parseFromString(`<score-partwise>${partList ?? ''}</score-partwise>`, 'application/xml');
}

/** What the source score says about each part's sound, read before anything is changed. */
function readScorePartsPlaybackInfo(doc: XmlDocument, contentOf?: (partId: string) => PartContent | undefined) {
  const parts = new Map((Array.from(doc.getElementsByTagName('part')) as XmlEl[]).map((part) => [part.getAttribute('id') ?? '', part] as const));
  const infos = new Map<string, ScorePartPlaybackInfo>();
  for (const scorePart of Array.from(doc.getElementsByTagName('score-part')) as XmlEl[]) {
    const id = scorePart.getAttribute('id') ?? '';
    const part = contentOf ? undefined : parts.get(id);
    const scoreInstruments = directChildrenByTag(scorePart, 'score-instrument');
    const midiInstruments = directChildrenByTag(scorePart, 'midi-instrument');
    const instruments = new Map<string, ScoreInstrumentInfo>();
    for (const scoreInstrument of scoreInstruments) {
      const instrumentId = scoreInstrument.getAttribute('id') ?? '';
      const midiInstrument = midiInstruments.find((entry) => entry.getAttribute('id') === instrumentId);
      instruments.set(instrumentId, {
        name: normalizeName(directChildText(scoreInstrument, 'instrument-name')),
        unpitched: midiInstrument ? parseOptionalInt(directChildText(midiInstrument, 'midi-unpitched')) : null,
      });
    }
    let pitchSum = 0;
    let pitchCount = 0;
    let percussion = false;
    let hasLyrics = false;
    let chromatic = 0;
    let octaveChange: number | null = null;
    if (part) {
      percussion = part.getElementsByTagName('unpitched').length > 0
        || Array.from(part.getElementsByTagName('clef')).some((clef) => /percussion/i.test(clef.getElementsByTagName('sign')[0]?.textContent ?? ''));
      hasLyrics = Array.from(part.getElementsByTagName('lyric')).some((lyric) => (lyric.getElementsByTagName('text')[0]?.textContent ?? '').trim());
      const transpose = part.getElementsByTagName('transpose')[0];
      if (transpose) {
        chromatic = parseOptionalInt(transpose.getElementsByTagName('chromatic')[0]?.textContent) ?? 0;
        octaveChange = parseOptionalInt(transpose.getElementsByTagName('octave-change')[0]?.textContent);
      }
      for (const pitch of Array.from(part.getElementsByTagName('pitch'))) {
        pitchSum += pitchToMidiNumber({
          step: pitch.getElementsByTagName('step')[0]?.textContent ?? 'C',
          alter: Number.parseFloat(pitch.getElementsByTagName('alter')[0]?.textContent ?? '0') || 0,
          octave: parseOptionalInt(pitch.getElementsByTagName('octave')[0]?.textContent) ?? 4,
        });
        pitchCount++;
      }
    }
    const firstScoreInstrument = scoreInstruments[0];
    const content: PartContent = contentOf?.(id) ?? {
      percussion,
      hasLyrics,
      octaveChange,
      meanPitch: pitchCount > 0 ? pitchSum / pitchCount + chromatic + 12 * (octaveChange ?? 0) : null,
    };
    infos.set(id, {
      id,
      instrumentSound: firstScoreInstrument ? normalizeName(directChildText(firstScoreInstrument, 'instrument-sound')) || null : null,
      midiProgram: midiInstruments[0] ? parseOptionalInt(directChildText(midiInstruments[0], 'midi-program')) : null,
      names: [
        firstScoreInstrument ? normalizeName(directChildText(firstScoreInstrument, 'instrument-name')) : '',
        normalizeName(directChildText(scorePart, 'part-name')),
      ].filter(Boolean),
      ...content,
      instruments,
    });
  }
  return infos;
}

function resolveScorePartInstrumentId(info: ScorePartPlaybackInfo, all: Map<string, ScorePartPlaybackInfo>) {
  const context: InstrumentNameContext = {
    hasLyrics: info.hasLyrics,
    octaveChange: info.octaveChange,
    meanPitch: info.meanPitch,
    siblingNames: [...all.values()].filter((other) => other.id !== info.id).flatMap((other) => other.names),
  };
  return resolveInstrumentIdFromSource({
    instrumentSound: info.instrumentSound,
    midiProgram: info.midiProgram,
    names: info.names,
    context,
  });
}

function preservedTagText(fragments: string[] | undefined, tag: string, attribute?: string) {
  for (const fragment of fragments ?? []) {
    const match = attribute
      ? new RegExp(`<${tag}\\b[^>]*\\b${attribute}="([^"]*)"`).exec(fragment)
      : new RegExp(`<${tag}\\b[^>]*>([^<]*)<`).exec(fragment);
    if (match) return match[1];
  }
  return null;
}

/** The General MIDI percussion key (0-based note number) an unpitched note plays. */
function unpitchedDrumKey(event: Extract<TimedEvent, { kind: 'rest' }>, info: ScorePartPlaybackInfo | undefined) {
  const instrumentId = preservedTagText(event.preservedXml?.afterDuration, 'instrument', 'id');
  const instruments = info?.instruments ?? new Map<string, ScoreInstrumentInfo>();
  const instrument = instrumentId ? instruments.get(instrumentId) : instruments.size === 1 ? [...instruments.values()][0] : undefined;
  if (instrument?.unpitched != null) return clampMidiNumber(instrument.unpitched - 1);
  const byName = drumKeyFromInstrumentName(instrument?.name);
  if (byName != null) return byName;
  const display = event.unpitched ?? { displayStep: 'C', displayOctave: 5 };
  return drumKeyFromDisplayPosition(display.displayStep, display.displayOctave, preservedTagText(event.preservedXml?.afterType, 'notehead'));
}

// --- Note rendering --------------------------------------------------------------------------

type RenderedNote = { midi: number; ticks: number; durationTicks: number; velocity: number };
type RenderEntry = { event: TimedEvent; ticks: number };

interface VoiceRenderContext {
  keyOf: (event: TimedEvent) => number;
  timeline: VelocityTimeline;
  tremolos: Map<string, TremoloSpan>;
}

function noteDurationTicks(event: TimedEvent) {
  // Round absolute endpoints, so unusual tuplets do not accumulate tick drift.
  return Math.max(1, fractionToTicks(event.timestampNum + event.durationDivisions, event.timestampDen) - eventOffsetTicks(event));
}

function pushRepeatedNotes(rendered: RenderedNote[], keys: number[], ticks: number, span: number, step: number, context: VoiceRenderContext, event: TimedEvent) {
  const count = Math.max(1, Math.floor(span / step));
  for (let index = 0; index < count; index++) {
    const start = ticks + index * step;
    const end = index === count - 1 ? ticks + span : start + step;
    rendered.push({
      midi: keys[index % keys.length],
      ticks: start,
      durationTicks: Math.max(1, end - start),
      velocity: articulationVelocity(velocityAt(context.timeline, start), event),
    });
  }
}

/**
 * The notes one voice plays. Ties merge into one note without a new attack, grace notes take
 * time from their main note, dynamics and articulations set velocity and length, and tremolos
 * become repeated notes. Note onsets stay where the score puts them.
 */
function renderVoiceEntries(entries: RenderEntry[], context: VoiceRenderContext) {
  const rendered: RenderedNote[] = [];
  const pendingTies = new Map<number, RenderedNote>();
  const graceGroups = new Map<number, RenderEntry[]>();
  for (const entry of entries) if (entry.event.durationDivisions === 0) {
    const group = graceGroups.get(entry.ticks) ?? []; group.push(entry); graceGroups.set(entry.ticks, group);
  }
  const graceBudgets = new Map<number, number>();
  for (const [ticks, graces] of graceGroups) {
    const anchors = entries.filter(entry => entry.ticks === ticks && entry.event.durationDivisions > 0);
    if (!anchors.length) continue;
    const budget = Math.min(Math.floor(Math.min(...anchors.map(entry => eventDurationTicks(entry.event))) / 2), graces.length * MIDI_PPQ / 8);
    if (budget < graces.length) continue;
    graceBudgets.set(ticks, budget);
    graces.forEach((entry, index) => {
      const start = Math.round(index * budget / graces.length);
      const end = Math.round((index + 1) * budget / graces.length);
      rendered.push({ midi: context.keyOf(entry.event), ticks: ticks + start, durationTicks: end - start, velocity: velocityAt(context.timeline, ticks) });
    });
  }
  const onsetCounts = new Map<number, number>();
  for (const entry of entries) if (entry.event.durationDivisions > 0) onsetCounts.set(entry.ticks, (onsetCounts.get(entry.ticks) ?? 0) + 1);
  const consumed = new Set<RenderEntry>();

  entries.forEach((entry, entryIndex) => {
    const { event, ticks } = entry;
    if (event.durationDivisions === 0 || consumed.has(entry)) return;
    const key = context.keyOf(event);
    const durationTicks = noteDurationTicks(event);
    const tied = pendingTies.get(key);
    const continuation = tied && tied.ticks + tied.durationTicks === ticks;
    if (continuation) {
      tied.durationTicks += event.tieStart ? durationTicks : Math.max(1, Math.round(durationTicks * articulationLengthFactor(event)));
      if (event.tieStart) pendingTies.set(key, tied);
      else pendingTies.delete(key);
      return;
    }
    const delay = graceBudgets.get(ticks) ?? 0;
    const tremolo = context.tremolos.get(event.id);
    if (tremolo && !event.tieStart && !delay) {
      const step = tremoloStepTicks(tremolo.lines);
      if (tremolo.type === 'single' && durationTicks >= step * 2) {
        pushRepeatedNotes(rendered, [key], ticks, durationTicks, step, context, event);
        pendingTies.delete(key);
        return;
      }
      if (tremolo.type === 'start' && onsetCounts.get(ticks) === 1) {
        const partner = entries.slice(entryIndex + 1).find((candidate) => candidate.event.durationDivisions > 0);
        if (partner && partner.ticks === ticks + durationTicks && onsetCounts.get(partner.ticks) === 1
          && context.tremolos.get(partner.event.id)?.type === 'stop') {
          const span = durationTicks + noteDurationTicks(partner.event);
          if (span >= step * 2) {
            pushRepeatedNotes(rendered, [key, context.keyOf(partner.event)], ticks, span, step, context, event);
            consumed.add(partner);
            pendingTies.delete(key);
            return;
          }
        }
      }
    }
    const playedTicks = durationTicks - delay;
    const note: RenderedNote = {
      midi: key,
      ticks: ticks + delay,
      durationTicks: event.tieStart ? playedTicks : Math.max(1, Math.round(playedTicks * articulationLengthFactor(event))),
      velocity: articulationVelocity(velocityAt(context.timeline, ticks), event),
    };
    rendered.push(note);
    if (event.tieStart) pendingTies.set(key, note);
    else pendingTies.delete(key);
  });
  return rendered;
}

function staffVoiceEntries(staff: StaffNode, order: number[] | null, include: (event: TimedEvent) => boolean) {
  const timing = buildMeasureTiming(staff, order);
  const voiceIds = [...new Set(staff.measures.flatMap(measure => measure.voices.map(voice => voice.voiceId)))];
  return voiceIds.map((voiceId) => timing.passes.flatMap(({ measure, startTicks }) => (measure.voices.find(voice => voice.voiceId === voiceId)?.events ?? [])
    .filter((event) => !event.hidden && include(event))
    .map((event): RenderEntry => ({ event, ticks: startTicks + eventOffsetTicks(event) }))))
    .filter((entries) => entries.length > 0);
}

const isPitchedNote = (event: TimedEvent): event is Extract<TimedEvent, { kind: 'note' }> => event.kind === 'note';
const isUnpitchedNote = (event: TimedEvent): event is Extract<TimedEvent, { kind: 'rest' }> => event.kind === 'rest' && Boolean(event.unpitched);

export function buildFallbackMidiFromMusicXml(xml: string) {
  const core = importMusicXmlToCore(xml);
  const coreParts = new Map(core.score.parts.map((part) => [part.sourcePartId, part] as const));
  const partInfos = readScorePartsPlaybackInfo(parsePartListDocument(xml), (partId) => {
    const part = coreParts.get(partId);
    return part ? corePartContent(part) : undefined;
  });
  const midi = new Midi();
  midi.name = core.metadata.title ?? 'Nex Note fallback MIDI';
  const playbackOrder = scorePlaybackOrder(core.score.parts);
  midi.header.tempos = applyFermataTempos(collectFallbackTempoEvents(core.score.parts), collectFermataSpans(core, playbackOrder));
  midi.header.timeSignatures = collectFallbackTimeSignatureEvents(core.score.parts);
  midi.header.update();

  let noteCount = 0;
  let channelIndex = 0;
  const tremolos = new Map(core.tremolos.map((tremolo) => [tremolo.eventId, tremolo] as const));

  for (const part of core.score.parts) {
    const info = partInfos.get(part.sourcePartId);
    const instrumentId = info
      ? resolveScorePartInstrumentId(info, partInfos)
      : resolvePartInstrumentId(part, { siblings: core.score.parts });
    const playbackInstrument = resolveMidiInstrumentSound(instrumentId);
    // Written pitch to sounding pitch for transposing instruments.
    const soundingOffset = (part.chromaticTranspose ?? 0) + 12 * (part.transposeOctaveChange ?? 0);
    const pedalEvents = collectPartPedalEvents(part, playbackOrder);
    for (const staff of part.staves) {
      const timeline = buildVelocityTimeline(staffExpressionDirections(part, staff, playbackOrder));
      // Pitched notes play the part's instrument; unpitched notes play General MIDI percussion keys
      // on their own channel-10 track (in the score model they are rest-kind events).
      const lanes = [
        {
          percussion: playbackInstrument.percussion,
          program: playbackInstrument.midiProgram,
          voices: staffVoiceEntries(staff, playbackOrder, isPitchedNote),
          keyOf: (event: TimedEvent) => (isPitchedNote(event) ? pitchToMidiNumber(event.pitch) + soundingOffset : 0),
        },
        {
          percussion: true,
          program: resolveMidiInstrumentSound('drum-set').midiProgram,
          voices: staffVoiceEntries(staff, playbackOrder, isUnpitchedNote),
          keyOf: (event: TimedEvent) => (isUnpitchedNote(event) ? unpitchedDrumKey(event, info) : 0),
        },
      ];
      for (const lane of lanes) {
        if (lane.voices.length === 0) continue;
        const track = midi.addTrack();
        track.name = trackNameForStaff(part, staff);
        track.channel = lane.percussion ? 9 : nextMidiChannel(channelIndex++);
        track.instrument.number = musicXmlProgramToToneProgram(lane.program);
        for (const entries of lane.voices) {
          for (const note of renderVoiceEntries(entries, { keyOf: lane.keyOf, timeline, tremolos })) {
            track.addNote({ ...note, velocity: toneVelocity(note.velocity) });
            noteCount++;
          }
        }
        if (!lane.percussion) {
          for (const change of pedalEvents) track.addCC({ number: 64, ticks: change.ticks, value: change.value });
        }
      }
    }
  }

  if (noteCount === 0) {
    throw new Error('Internal MIDI fallback could not find playable notes in the score.');
  }

  return {
    data: midi.toArray(),
    noteCount,
    trackCount: midi.tracks.length,
  };
}

function appendTextElement(doc: XmlDocument, parent: XmlEl, tagName: string, text: string) {
  const child = doc.createElement(tagName);
  child.appendChild(doc.createTextNode(text));
  parent.appendChild(child);
  return child;
}

function appendMidiInstrument(doc: XmlDocument, scorePart: XmlEl, partId: string, instrument: MidiInstrumentSound, melodicChannelIndex: number) {
  const midiInstrument = doc.createElement('midi-instrument');
  // A <midi-instrument> refers to its <score-instrument> by id.
  const scoreInstrumentId = directChildrenByTag(scorePart, 'score-instrument')[0]?.getAttribute('id');
  midiInstrument.setAttribute('id', scoreInstrumentId || `${partId}-I1`);
  const midiChannel = instrument.percussion ? 10 : nextMidiChannel(melodicChannelIndex) + 1;
  appendTextElement(doc, midiInstrument, 'midi-channel', String(midiChannel));
  appendTextElement(doc, midiInstrument, 'midi-program', String(instrument.midiProgram));
  appendTextElement(doc, midiInstrument, 'volume', '78.7402');
  appendTextElement(doc, midiInstrument, 'pan', '0');
  scorePart.appendChild(midiInstrument);
}

const MIDI_INSTRUMENT_CHILD_ORDER = ['midi-channel', 'midi-name', 'midi-bank', 'midi-program', 'midi-unpitched', 'volume', 'pan', 'elevation'];

/** Sets a child of `<midi-instrument>` in the order the MusicXML schema requires. */
function setMidiInstrumentChild(doc: XmlDocument, midiInstrument: XmlEl, tag: string, text: string) {
  const existing = directChildrenByTag(midiInstrument, tag)[0];
  if (existing) {
    existing.textContent = text;
    return;
  }
  const child = doc.createElement(tag);
  child.appendChild(doc.createTextNode(text));
  const rank = MIDI_INSTRUMENT_CHILD_ORDER.indexOf(tag);
  const before = Array.from(midiInstrument.childNodes).find((node) => (
    node.nodeType === 1 && MIDI_INSTRUMENT_CHILD_ORDER.indexOf((node as XmlEl).tagName) > rank
  ));
  if (before) midiInstrument.insertBefore(child, before);
  else midiInstrument.appendChild(child);
}

/** The display position and notehead of the first note that plays `instrumentId` (or any note). */
function firstUnpitchedNoteDisplay(part: XmlEl | undefined, instrumentId: string | null) {
  for (const note of Array.from(part?.getElementsByTagName('note') ?? []) as XmlEl[]) {
    const unpitched = directChildrenByTag(note, 'unpitched')[0];
    if (!unpitched) continue;
    const noteInstrument = directChildrenByTag(note, 'instrument')[0]?.getAttribute('id') ?? null;
    if (instrumentId && noteInstrument !== instrumentId) continue;
    return {
      step: directChildText(unpitched, 'display-step') ?? 'C',
      octave: parseOptionalInt(directChildText(unpitched, 'display-octave')) ?? 5,
      notehead: directChildText(note, 'notehead'),
    };
  }
  return null;
}

/**
 * A drum part keeps its name and instruments for MuseScore. Every score instrument gets a
 * `<midi-instrument>` on channel 10 with a `<midi-unpitched>` key: the source's own key, else one
 * from the instrument name, else one from where its notes are written on the staff.
 */
function preparePercussionScorePart(doc: XmlDocument, scorePart: XmlEl, part: XmlEl | undefined, info: ScorePartPlaybackInfo) {
  const scoreInstruments = directChildrenByTag(scorePart, 'score-instrument');
  if (scoreInstruments.length === 0) {
    appendMidiInstrument(doc, scorePart, info.id, resolveMidiInstrumentSound('drum-set'), 0);
    return;
  }
  const midiInstruments = directChildrenByTag(scorePart, 'midi-instrument');
  for (const scoreInstrument of scoreInstruments) {
    const instrumentId = scoreInstrument.getAttribute('id') ?? '';
    let midiInstrument = midiInstruments.find((entry) => entry.getAttribute('id') === instrumentId);
    if (!midiInstrument) {
      midiInstrument = doc.createElement('midi-instrument') as XmlEl;
      midiInstrument.setAttribute('id', instrumentId);
      scorePart.appendChild(midiInstrument);
    }
    setMidiInstrumentChild(doc, midiInstrument, 'midi-channel', '10');
    if (directChildrenByTag(midiInstrument, 'midi-unpitched').length > 0) continue;
    const display = firstUnpitchedNoteDisplay(part, scoreInstruments.length > 1 ? instrumentId : null);
    const key = drumKeyFromInstrumentName(directChildText(scoreInstrument, 'instrument-name'))
      ?? (display ? drumKeyFromDisplayPosition(display.step, display.octave, display.notehead) : null);
    if (key != null) setMidiInstrumentChild(doc, midiInstrument, 'midi-unpitched', String(key + 1));
  }
}

function removeDuplicateTabPlaybackParts(doc: XmlDocument) {
  const scoreParts = Array.from(doc.getElementsByTagName('score-part')) as XmlEl[];
  const parts = Array.from(doc.getElementsByTagName('part')) as XmlEl[];
  const partById = new Map(parts.map((part) => [part.getAttribute('id') ?? '', part] as const));
  const tabPartIds = new Set(
    scoreParts
      .filter((scorePart) => isTabScorePart(scorePart, partById.get(scorePart.getAttribute('id') ?? '')))
      .map((scorePart) => scorePart.getAttribute('id') ?? '')
      .filter(Boolean),
  );
  if (tabPartIds.size === 0) return [];

  const nonTabBaseNames = new Set(
    scoreParts
      .filter((scorePart) => !tabPartIds.has(scorePart.getAttribute('id') ?? ''))
      .map((scorePart) => tabBaseName(scorePartDisplayName(scorePart)))
      .filter(Boolean),
  );
  const removed: Array<{ id: string; name: string }> = [];

  for (const scorePart of scoreParts) {
    const id = scorePart.getAttribute('id') ?? '';
    if (!tabPartIds.has(id)) continue;
    const name = scorePartDisplayName(scorePart);
    const base = tabBaseName(name);
    const hasNotationPartner = nonTabBaseNames.has(base) || (/guitar/i.test(name) && [...nonTabBaseNames].some((entry) => /guitar/i.test(entry)));
    if (!hasNotationPartner) continue;

    const part = partById.get(id);
    scorePart.parentNode?.removeChild(scorePart);
    part?.parentNode?.removeChild(part);
    removed.push({ id, name });
  }

  return removed;
}

export function sanitizeXmlForMidiExport(xml: string) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'application/xml');
  const renamedParts: Array<{ id: string; from: string; to: string }> = [];
  const renamedInstruments: Array<{ id: string; from: string; to: string }> = [];
  const removedMalformedTieStarts = stripMalformedTieStarts(doc);
  // Read the source's <instrument-sound> and <midi-program> before they are stripped.
  const partInfos = readScorePartsPlaybackInfo(doc);
  const percussionPartIds = new Set([...partInfos.values()].filter((info) => info.percussion).map((info) => info.id));
  const strippedPlaybackMetadata = stripPlaybackMetadata(doc, percussionPartIds);
  const removedDuplicateTabParts = removeDuplicateTabPlaybackParts(doc);
  const parts = new Map((Array.from(doc.getElementsByTagName('part')) as XmlEl[]).map((part) => [part.getAttribute('id') ?? '', part] as const));

  let melodicChannelIndex = 0;
  for (const scorePart of Array.from(doc.getElementsByTagName('score-part')) as XmlEl[]) {
    const partId = scorePart.getAttribute('id') ?? 'unknown';
    const info = partInfos.get(partId);
    if (info?.percussion) {
      preparePercussionScorePart(doc, scorePart, parts.get(partId), info);
      continue;
    }
    const target = resolveMidiInstrumentSound(info ? resolveScorePartInstrumentId(info, partInfos) : null);
    const partName = scorePart.getElementsByTagName('part-name')[0];
    if (partName?.textContent && partName.textContent !== target.displayName) {
      renamedParts.push({ id: partId, from: partName.textContent, to: target.displayName });
      partName.textContent = target.displayName;
    }

    const instrumentName = scorePart.getElementsByTagName('instrument-name')[0];
    if (instrumentName?.textContent && instrumentName.textContent !== target.displayName) {
      renamedInstruments.push({ id: partId, from: instrumentName.textContent, to: target.displayName });
      instrumentName.textContent = target.displayName;
    }
    appendMidiInstrument(doc, scorePart, partId, target, melodicChannelIndex);
    if (!target.percussion) melodicChannelIndex += 1;
  }

  const sanitized = new XMLSerializer().serializeToString(doc);
  return {
    xml: sanitized.startsWith('<?xml') ? sanitized : `<?xml version="1.0" encoding="UTF-8"?>\n${sanitized}`,
    renamedParts,
    renamedInstruments,
    removedDuplicateTabParts,
    removedMalformedTieStarts,
    strippedPlaybackMetadata,
  };
}
