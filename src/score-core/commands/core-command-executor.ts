import { midiNoteToPitch } from '@/src/score-input/midi-input';
import { noteTypeToDivisions } from '@/lib/note-editor';
import { getEffectiveMeasureTimingFromStaff } from '@/src/score-core/measure-timing';
import { buildDurationCandidates, decomposeDurationDivisions, describeDuration, isRepresentableDuration } from '@/src/score-core/duration-utils';
import type { ScoreDocumentModel, ScoreIndex, TimedEvent, VoiceNode } from '@/src/score-core/model/types';
import {
  chooseDistinctGuitarFingeringsForPitches,
  chooseGuitarFingeringForPitch,
  guitarSoundingToWrittenPitch,
  guitarWrittenToSoundingPitch,
  pitchToMidi,
  resolveGuitarFretPitch,
  resolveGuitarTuning,
} from '@/src/score-input/guitar-fretboard';
import { timestampsEqual } from '@/src/shared/music/timestamp-match';
import type { ClipboardAbsoluteEvent, ClipboardTargetOffset, ClipboardTimedDirection, ScoreClipboardPayload } from '@/src/shared/schemas/clipboard';
import type { ValidatedScoreCommand } from '@/src/shared/schemas/score-command';
import { applyRhythmSpellingToDocument, type RhythmSpellingTarget } from '@/src/layout/rhythm-speller';

const CORE_SUPPORTED_COMMANDS = new Set([
  'setTitle',
  'setSubtitle',
  'setComposer',
  'setArranger',
  'setKey',
  'transposeDocumentChromatic',
  'setTimeSignature',
  'setClef',
  'removeClefChange',
  'setPartName',
  'setPartAbbreviation',
  'setInstrumentName',
  'setPartTranspose',
  'fitRangeOctaves',
  'fitPartToInstrument',
  'applyPracticeProfile',
  'insertMeasureAfter',
  'deleteMeasure',
  'changeNotePitch',
  'setAccidentalDisplay',
  'changeNoteDuration',
  'replaceWithRest',
  'deleteNote',
  'deleteRange',
  'clearMeasureVoice',
  'replaceMidiPassage',
  'editRhythm',
  'editTupletUnit',
  'rippleDelete',
  'rippleDeleteRange',
  'insertNote',
  'insertNoteAt',
  'insertRest',
  'insertRestAt',
  'setNoteStyle',
  'toggleStemDirection',
  'setGuitarFret',
  'toggleGuitarTechnique',
  'fillSlashMeasure',
  'transposeChromatic',
  'transposeRangeChromatic',
  'toggleArticulation',
  'setArticulationPlacement',
  'clearArticulations',
  'clearRangeArticulations',
  'toggleTie',
  'setTiePlacement',
  'toggleSlur',
  'setSlurPlacement',
  'addDynamic',
  'setBarline',
  'addLyric',
  'removeLyricLine',
  'removeDirection',
  'removeArticulations',
  'setTempo',
  'addStartRepeat',
  'addEndRepeat',
  'addVolta2',
  'setEnding',
  'addChords',
  'setHarmonyAt',
  'addRehearsalMark',
  'addRehearsalMarksEvery',
  'addWords',
  'addExpressionText',
  'addAnalysisAnnotation',
  'addTechniqueInstruction',
  'addSyncPoint',
  'addOrchestrationNote',
  'setSystemBreak',
  'setPageBreak',
  'setMeasureLayoutHint',
  'setLyricLine',
  'duplicateNote',
  'addTuplet',
  'setAccidentalPolicy',
  'setRhythmSpelling',
  'moveGraceNote',
  'addGraceNote',
  'removeGraceNote',
  'addFingering',
  'addOrnament',
  'addWedge',
  'addPedalSpan',
  'addOttava',
  'pasteContent',
  'addFermata',
  'removeFermata',
  'addTremolo',
  'addGlissando',
  'addArpeggio',
  'addSegno',
  'addCoda',
  'addDacapo',
  'addDalsegno',
  'addFine',
  'addToCoda',
  'setMeasureRepeat',
  'addTempoText',
  'setSwing',
  'setInstrumentChange',
  'setCueNote',
  'setMultiMeasureRest',
  'addGuitarBend',
  'addGuitarTap',
]);

const RHYTHM_SPELLING_COMMANDS = new Set<ValidatedScoreCommand['type']>([
  'changeNoteDuration',
  'insertNote',
  'insertNoteAt',
  'insertRest',
  'insertRestAt',
]);

function cloneDocument<T>(value: T): T {
  return structuredClone(value);
}

const STEP_ORDER = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;

function diatonicPitchIndex(step: string, octave: number): number {
  const idx = STEP_ORDER.indexOf(step.toUpperCase() as typeof STEP_ORDER[number]);
  return octave * 7 + (idx >= 0 ? idx : 0);
}

function clefMiddleLineDiatonicIndex(sign: string | undefined, line: number | undefined) {
  const normalizedSign = sign === 'F' || sign === 'C' || sign === 'G' ? sign : 'G';
  const anchor = normalizedSign === 'F'
    ? { step: 'F', octave: 3, defaultLine: 4 }
    : normalizedSign === 'C'
      ? { step: 'C', octave: 4, defaultLine: 3 }
      : { step: 'G', octave: 4, defaultLine: 2 };
  const clefLine = Number.isFinite(line) && line! >= 1 && line! <= 5 ? line! : anchor.defaultLine;
  const anchorIndex = diatonicPitchIndex(anchor.step, anchor.octave);
  return anchorIndex + 2 * (3 - clefLine);
}

function resolveMeasureClef(document: ScoreDocumentModel, measureNumber: number, staffIndex: number) {
  for (const part of document.score.parts) {
    const staff = part.staves.find((entry) => entry.staffIndex === staffIndex);
    if (!staff) continue;
    const measures = [...staff.measures]
      .filter((measure) => measure.measureNumber <= measureNumber)
      .sort((a, b) => b.measureNumber - a.measureNumber);
    for (const measure of measures) {
      for (const attribute of measure.attributes) {
        const clef = attribute.clefs.find((entry) => entry.staffIndex === staffIndex);
        if (clef?.sign) return clef;
      }
    }
  }
  return { staffIndex, sign: 'G', line: 2 };
}

function defaultStemDirection(document: ScoreDocumentModel, event: TimedEvent): 'up' | 'down' {
  if (event.kind !== 'note') return 'up';
  const clef = resolveMeasureClef(document, event.measureNumber, event.staffIndex);
  const middleLine = clefMiddleLineDiatonicIndex(clef.sign, clef.line);
  const pitch = diatonicPitchIndex(event.pitch.step, event.pitch.octave);
  return pitch < middleLine ? 'up' : 'down';
}

function setEventArticulationPlacement(
  event: TimedEvent,
  articulation: string,
  placement?: 'above' | 'below',
) {
  const nextPlacements = { ...(event.articulationPlacements ?? {}) };
  if (placement) nextPlacements[articulation] = placement;
  else delete nextPlacements[articulation];
  event.articulationPlacements = Object.keys(nextPlacements).length > 0 ? nextPlacements : undefined;
}

function clearEventArticulationPlacement(event: TimedEvent, articulation: string) {
  if (!event.articulationPlacements?.[articulation]) return;
  setEventArticulationPlacement(event, articulation, undefined);
}

function clearEventArticulations(document: ScoreDocumentModel, event: TimedEvent) {
  event.articulations = [];
  event.articulationPlacements = undefined;
  document.fermataEventIds.delete(event.id);
}

export function supportsCoreExecution(command: ValidatedScoreCommand) {
  return CORE_SUPPORTED_COMMANDS.has(command.type);
}

export type SelectionRemap = Record<string, string>;

export interface CoreCommandExecutionResult {
  coreDocument: ScoreDocumentModel;
  selectionRemap: SelectionRemap;
  diagnostics: Array<{ level: 'info' | 'warning' | 'error'; code: string; message: string }>;
}

function applyToMatchingMeasures(
  document: ScoreDocumentModel,
  measureNumber: number,
  callback: (args: { partIndex: number; staffIndex: number; measureIndex: number }) => void,
) {
  document.score.parts.forEach((part, partIndex) => {
    part.staves.forEach((staff, staffIndex) => {
      const measureIndex = staff.measures.findIndex((measure) => measure.measureNumber === measureNumber);
      if (measureIndex >= 0) callback({ partIndex, staffIndex, measureIndex });
    });
  });
}

function ensureMeasureAttributes(document: ScoreDocumentModel, partIndex: number, staffIndex: number, measureIndex: number) {
  const measure = document.score.parts[partIndex].staves[staffIndex].measures[measureIndex];
  if (measure.attributes.length === 0) {
    measure.attributes.push({
      id: `attr:${measure.id}:0`,
      clefs: [],
    });
  }
  return measure.attributes[0];
}


const BEAMABLE_DURATION_LEVEL: Record<string, number> = {
  eighth: 1,
  '16th': 2,
  '32nd': 3,
  '64th': 4,
};

function eventBeamLevel(event: TimedEvent) {
  if (event.kind !== 'note' || event.isChord) return 0;
  if (!event.durationType) return 0;
  return BEAMABLE_DURATION_LEVEL[event.durationType] ?? 0;
}

function resolveBeamGroupUnitDivisions(divisions: number, timeSignature: { beats: number; beatType: number } | null) {
  const beats = timeSignature?.beats ?? 4;
  const beatType = timeSignature?.beatType ?? 4;
  const beatDivisions = Math.max(1, Math.round((Math.max(divisions, 1) * 4) / Math.max(beatType, 1)));
  const compoundMeter = beatType === 8 && beats >= 6 && beats % 3 === 0;
  const commonTimeHalfBarGrouping = beatType === 4 && beats === 4;
  if (commonTimeHalfBarGrouping) return beatDivisions * 2;
  return compoundMeter ? beatDivisions * 3 : beatDivisions;
}

function rebuildDefaultBeams(document: ScoreDocumentModel, baseline: ScoreDocumentModel) {
  const rebuilt: ScoreDocumentModel['beams'] = [];

  document.score.parts.forEach((part) => {
    part.staves.forEach((staff) => {
      staff.measures.forEach((measure) => {
        const timing = resolveMeasureTiming(staff, measure);
        const groupUnitDivisions = resolveBeamGroupUnitDivisions(timing.divisions, timing.timeSignature);
        const groups = timing.timeSignature?.beatGroups;
        const groupEnds = groups?.map((_, index) => groups.slice(0, index + 1).reduce((sum, value) => sum + value, 0) * timing.divisions * 4 / timing.timeSignature!.beatType);
        const previousStaff = baseline.score.parts.find(p => p.id === part.id)?.staves.find(s => s.staffIndex === staff.staffIndex);
        const previousMeasure = previousStaff?.measures.find(m => m.measureNumber === measure.measureNumber);

        measure.voices.forEach((voice) => {
          const previousVoice = previousMeasure?.voices.find(v => v.voiceId === voice.voiceId);
          const rhythmKey = (events: TimedEvent[]) => JSON.stringify(events.map(e => [e.id, e.kind, e.timestampNum, e.timestampDen, e.durationDivisions, e.durationType, e.isDotted, e.isChord, e.kind === 'note' ? e.pitch : null]));
          if (previousVoice && previousStaff && previousMeasure
            && rhythmKey(previousVoice.events) === rhythmKey(voice.events)
            && JSON.stringify(resolveMeasureTiming(previousStaff, previousMeasure).timeSignature) === JSON.stringify(timing.timeSignature)) {
            const ids = new Set(voice.events.map(e => e.id));
            rebuilt.push(...baseline.beams.filter(beam => beam.eventIds.every(id => ids.has(id))));
            return;
          }
          const ordered = [...voice.events].sort((left, right) => (
            left.timestampNum - right.timestampNum
            || Number(left.isChord) - Number(right.isChord)
            || left.id.localeCompare(right.id)
          ));

          const flushSequence = (sequence: TimedEvent[], bucketIndex: number) => {
            if (sequence.length < 2) return;
            const levels = sequence.map((event) => eventBeamLevel(event));
            const highestLevel = Math.max(...levels, 0);

            for (let level = 1; level <= highestLevel; level += 1) {
              let start = -1;
              for (let index = 0; index <= sequence.length; index += 1) {
                const active = index < sequence.length && levels[index]! >= level;
                if (active) {
                  if (start < 0) start = index;
                  continue;
                }
                if (start < 0) continue;
                const segment = sequence.slice(start, index);
                if (segment.length >= 2) {
                  rebuilt.push({
                    id: `beam:${part.id}:${staff.staffIndex}:${measure.measureNumber}:${voice.voiceId}:${bucketIndex}:${level}:${segment[0]!.id}`,
                    number: level,
                    eventIds: segment.map((event) => event.id),
                  });
                } else if (level > 1) {
                  const isolatedIndex = start;
                  const hasPreviousPrimaryNeighbor = isolatedIndex > 0 && levels[isolatedIndex - 1]! >= level - 1;
                  const hasNextPrimaryNeighbor = isolatedIndex < levels.length - 1 && levels[isolatedIndex + 1]! >= level - 1;
                  if (hasPreviousPrimaryNeighbor || hasNextPrimaryNeighbor) {
                    rebuilt.push({
                      id: `beam:${part.id}:${staff.staffIndex}:${measure.measureNumber}:${voice.voiceId}:${bucketIndex}:${level}:${segment[0]!.id}:hook`,
                      number: level,
                      eventIds: [segment[0]!.id],
                      hook: hasNextPrimaryNeighbor ? 'forward' : 'backward',
                    });
                  }
                }
                start = -1;
              }
            }
          };

          let activeSequence: TimedEvent[] = [];
          let activeBucketIndex: number | null = null;
          let previousEnd: number | null = null;

          ordered.forEach((event) => {
            const level = eventBeamLevel(event);
            if (level === 0) {
              if (activeSequence.length > 0 && activeBucketIndex != null) {
                flushSequence(activeSequence, activeBucketIndex);
              }
              activeSequence = [];
              activeBucketIndex = null;
              previousEnd = null;
              return;
            }

            const bucketFor = (offset: number) => groupEnds
              ? groupEnds.filter(end => offset >= end).length
              : Math.floor(offset / Math.max(groupUnitDivisions, 1));
            const bucketIndex = bucketFor(event.timestampNum);
            const crossesBoundary = bucketFor(Math.max(event.timestampNum + event.durationDivisions - 1, event.timestampNum)) !== bucketIndex;
            const contiguous = previousEnd == null || previousEnd === event.timestampNum;
            if (
              crossesBoundary
              || activeBucketIndex == null
              || bucketIndex !== activeBucketIndex
              || !contiguous
            ) {
              if (activeSequence.length > 0 && activeBucketIndex != null) {
                flushSequence(activeSequence, activeBucketIndex);
              }
              activeSequence = crossesBoundary ? [] : [event];
              activeBucketIndex = crossesBoundary ? null : bucketIndex;
              previousEnd = crossesBoundary ? null : event.timestampNum + event.durationDivisions;
              return;
            }

            activeSequence.push(event);
            previousEnd = event.timestampNum + event.durationDivisions;
          });

          if (activeSequence.length > 0 && activeBucketIndex != null) {
            flushSequence(activeSequence, activeBucketIndex);
          }
        });
      });
    });
  });

  document.beams = rebuilt;
}

function rebuildScoreIndex(document: ScoreDocumentModel): ScoreIndex {
  const measureIds: Record<number, string[]> = {};
  const voiceIds: Record<string, string> = {};
  const eventIds: Record<string, string> = {};

  document.score.parts.forEach((part) => {
    part.staves.forEach((staff) => {
      staff.measures.forEach((measure) => {
        measureIds[measure.measureNumber] = [...(measureIds[measure.measureNumber] ?? []), measure.id];
        measure.voices.forEach((voice) => {
          voiceIds[`${measure.measureNumber}:${staff.staffIndex}:${voice.voiceId}`] = voice.id;
          voice.events.forEach((event) => {
            eventIds[`${measure.measureNumber}:${staff.staffIndex}:${voice.voiceId}:${event.timestampNum}/${event.timestampDen}`] = event.id;
          });
        });
      });
    });
  });

  return { measureIds, voiceIds, eventIds };
}


function cloneMeasureForInsertion(
  sourceMeasure: ScoreDocumentModel['score']['parts'][number]['staves'][number]['measures'][number],
  nextMeasureNumber: number,
): ScoreDocumentModel['score']['parts'][number]['staves'][number]['measures'][number] {
  return {
    ...structuredClone(sourceMeasure),
    id: `${sourceMeasure.id}:insert:${nextMeasureNumber}`,
    measureNumber: nextMeasureNumber,
    sourceMeasureNumber: null,
    implicit: undefined,
    directions: [],
    voices: sourceMeasure.voices.map((voice) => ({
      ...structuredClone(voice),
      id: `${voice.id}:insert:${nextMeasureNumber}`,
      events: [],
    })),
    // A new bar is plain: repeats, endings, special barlines, breaks and measure repeats stay on
    // the source bar.
    leftBarline: undefined,
    rightBarline: undefined,
    leftEnding: undefined,
    rightEnding: undefined,
    print: undefined,
    measureRepeat: undefined,
    multiMeasureRest: undefined,
    attributes: sourceMeasure.attributes.map((attribute, index) => ({
      ...structuredClone(attribute),
      id: `${sourceMeasure.id}:attr:${nextMeasureNumber}:${index}`,
    })),
  };
}

/** Layout hints are keyed by measure number; shift those after an inserted or deleted bar. */
function shiftLayoutHintsAfterMeasure(document: ScoreDocumentModel, measureNumber: number, delta: 1 | -1) {
  document.layoutHints = document.layoutHints
    .filter((hint) => !(delta === -1 && hint.measureNumber === measureNumber))
    .map((hint) => (hint.measureNumber > measureNumber ? { ...hint, measureNumber: hint.measureNumber + delta } : hint));
}

function renumberMeasures(document: ScoreDocumentModel) {
  document.score.parts.forEach((part) => {
    part.staves.forEach((staff) => {
      staff.measures.forEach((measure, measureIndex) => {
        const nextMeasureNumber = measureIndex + 1;
        measure.measureNumber = nextMeasureNumber;
        measure.voices.forEach((voice) => {
          voice.events.forEach((event) => {
            event.measureNumber = nextMeasureNumber;
          });
        });
        measure.directions.forEach((direction) => {
          direction.measureNumber = nextMeasureNumber;
        });
      });
    });
  });
}

function getMeasureDivisions(measure: ScoreDocumentModel['score']['parts'][number]['staves'][number]['measures'][number]) {
  return measure.attributes[0]?.divisions ?? 1;
}

function timestampToDivisionsOffset(
  divisions: number,
  timestampNum: number,
  timestampDen: number,
) {
  return Math.max(0, Math.round((timestampNum / Math.max(timestampDen, 1)) * divisions * 4));
}

function getLocalMeasureDurationDivisions(measure: ScoreDocumentModel['score']['parts'][number]['staves'][number]['measures'][number]) {
  const divisions = getMeasureDivisions(measure);
  const time = measure.attributes.find((entry) => entry.time)?.time ?? measure.attributes[0]?.time;
  if (time?.beats && time?.beatType) {
    return Math.max(1, Math.round((time.beats * divisions * 4) / time.beatType));
  }
  return Math.max(
    1,
    measure.voices.reduce((max, voice) => (
      Math.max(
        max,
        voice.events.reduce((voiceMax, event) => Math.max(voiceMax, event.timestampNum + event.durationDivisions), 0),
      )
    ), divisions * 4),
  );
}

function resolveMeasureTiming(
  staff: ScoreDocumentModel['score']['parts'][number]['staves'][number],
  measure: ScoreDocumentModel['score']['parts'][number]['staves'][number]['measures'][number],
) {
  const effective = getEffectiveMeasureTimingFromStaff(staff, {
    measureNumber: measure.measureNumber,
  });
  if (effective) return effective;

  const divisions = getMeasureDivisions(measure);
  return {
    staff,
    measure,
    measureIndex: staff.measures.findIndex((entry) => entry.measureNumber === measure.measureNumber),
    divisions,
    timeSignature: null,
    durationDivisions: getLocalMeasureDurationDivisions(measure),
    durationRatio: 1,
  };
}

function requestedDurationDivisions(durationType: string, isDotted: boolean | undefined, divisions: number) {
  const baseDuration = noteTypeToDivisions(durationType, divisions);
  return Math.max(1, Math.round(baseDuration * (isDotted ? 1.5 : 1)));
}

function gcd(left: number, right: number): number {
  let a = Math.abs(Math.trunc(left));
  let b = Math.abs(Math.trunc(right));
  while (b !== 0) {
    const next = a % b;
    a = b;
    b = next;
  }
  return a || 1;
}

function lcm(left: number, right: number) {
  const a = Math.max(1, Math.trunc(left));
  const b = Math.max(1, Math.trunc(right));
  return (a / gcd(a, b)) * b;
}

function requiredDivisionsForDuration(durationType: string, isDotted: boolean | undefined, currentDivisions: number) {
  const quarters: Record<string, { num: number; den: number }> = {
    maxima: { num: 32, den: 1 },
    long: { num: 16, den: 1 },
    breve: { num: 8, den: 1 },
    whole: { num: 4, den: 1 },
    half: { num: 2, den: 1 },
    quarter: { num: 1, den: 1 },
    eighth: { num: 1, den: 2 },
    '16th': { num: 1, den: 4 },
    '32nd': { num: 1, den: 8 },
    '64th': { num: 1, den: 16 },
  };
  const duration = quarters[durationType] ?? quarters.quarter!;
  const dottedMultiplier = isDotted ? { num: 3, den: 2 } : { num: 1, den: 1 };
  const rawNum = duration.num * dottedMultiplier.num;
  const rawDen = duration.den * dottedMultiplier.den;
  const divisor = rawDen / gcd(rawNum, rawDen);
  return lcm(currentDivisions, divisor);
}

function dividedTupletUnitDuration(
  durationType: string | undefined,
  isDotted: boolean | undefined,
  normalNotes: number,
) {
  const quarterFractions: Record<string, { num: number; den: number }> = {
    maxima: { num: 32, den: 1 },
    long: { num: 16, den: 1 },
    breve: { num: 8, den: 1 },
    whole: { num: 4, den: 1 },
    half: { num: 2, den: 1 },
    quarter: { num: 1, den: 1 },
    eighth: { num: 1, den: 2 },
    '16th': { num: 1, den: 4 },
    '32nd': { num: 1, den: 8 },
    '64th': { num: 1, den: 16 },
  };
  const group = durationType ? quarterFractions[durationType] : undefined;
  if (!group || !Number.isInteger(normalNotes) || normalNotes < 1) return null;
  const groupNum = group.num * (isDotted ? 3 : 1);
  const groupDen = group.den * (isDotted ? 2 : 1) * normalNotes;

  for (const [type, fraction] of Object.entries(quarterFractions)) {
    for (const dotted of [false, true]) {
      const candidateNum = fraction.num * (dotted ? 3 : 1);
      const candidateDen = fraction.den * (dotted ? 2 : 1);
      if (candidateNum * groupDen === groupNum * candidateDen) {
        return { type, dotted };
      }
    }
  }
  return null;
}

function scaleMeasureTiming(
  measure: ScoreDocumentModel['score']['parts'][number]['staves'][number]['measures'][number],
  factor: number,
) {
  if (factor === 1) return;
  measure.voices.forEach((voice) => {
    voice.events.forEach((event) => {
      event.timestampNum *= factor;
      event.timestampDen *= factor;
      event.durationDivisions *= factor;
    });
  });
  measure.directions.forEach((direction) => {
    if (typeof direction.timestampNum === 'number') direction.timestampNum *= factor;
    if (typeof direction.timestampDen === 'number') direction.timestampDen *= factor;
  });
}

function measureHasExplicitDivisions(
  measure: ScoreDocumentModel['score']['parts'][number]['staves'][number]['measures'][number],
) {
  return measure.attributes.some((attribute) => typeof attribute.divisions === 'number' && attribute.divisions > 0);
}

/**
 * The part each staff of the document being edited belongs to. MusicXML has one `<divisions>` per
 * part, so a staff never changes its division grid alone (F11 in note-entry-mastery-ledger: a
 * finer value in one staff of a grand staff exported the other staff's grid and corrupted onsets).
 */
const partOfStaff = new WeakMap<ScoreDocumentModel['score']['parts'][number]['staves'][number], ScoreDocumentModel['score']['parts'][number]>();

function registerStaffParts(document: ScoreDocumentModel) {
  for (const part of document.score.parts) for (const staff of part.staves) partOfStaff.set(staff, part);
}

function setStaffDivisionsAtMeasure(
  staff: ScoreDocumentModel['score']['parts'][number]['staves'][number],
  measureNumber: number,
  nextDivisions: number,
) {
  const siblings = partOfStaff.get(staff)?.staves ?? [staff];
  for (const member of siblings.includes(staff) ? siblings : [staff]) {
    setSingleStaffDivisionsAtMeasure(member, measureNumber, nextDivisions);
  }
}

function setSingleStaffDivisionsAtMeasure(
  staff: ScoreDocumentModel['score']['parts'][number]['staves'][number],
  measureNumber: number,
  nextDivisions: number,
) {
  const timing = getEffectiveMeasureTimingFromStaff(staff, { measureNumber });
  if (!timing || nextDivisions <= timing.divisions) return;
  const factor = nextDivisions / timing.divisions;
  if (!Number.isInteger(factor) || factor <= 1) return;

  const targetMeasure = staff.measures[timing.measureIndex];
  if (!targetMeasure) return;
  const attributes = targetMeasure.attributes.length > 0
    ? targetMeasure.attributes
    : (targetMeasure.attributes = [{ id: `attr:${targetMeasure.id}:0`, clefs: [] }]);
  attributes[0]!.divisions = nextDivisions;

  for (let index = timing.measureIndex; index < staff.measures.length; index += 1) {
    const measure = staff.measures[index]!;
    if (index > timing.measureIndex && measureHasExplicitDivisions(measure)) break;
    scaleMeasureTiming(measure, factor);
  }
}

function ensureStaffDivisionsForDuration(
  staff: ScoreDocumentModel['score']['parts'][number]['staves'][number],
  measureNumber: number,
  durationType: string,
  isDotted: boolean | undefined,
) {
  const timing = getEffectiveMeasureTimingFromStaff(staff, { measureNumber });
  if (!timing) return;
  const nextDivisions = requiredDivisionsForDuration(durationType, isDotted, timing.divisions);
  if (nextDivisions <= timing.divisions) return;

  setStaffDivisionsAtMeasure(staff, measureNumber, nextDivisions);
}

function clampInsertionOffsetToMeasure(
  rawOffset: number,
  measureDurationDivisions: number,
  requestedDuration: number,
) {
  const safeMeasureDuration = Math.max(1, measureDurationDivisions);
  const safeRequestedDuration = Math.max(1, Math.min(requestedDuration, safeMeasureDuration));
  const maxStart = Math.max(0, safeMeasureDuration - safeRequestedDuration);
  return Math.max(0, Math.min(rawOffset, maxStart));
}

function clampDurationToMeasure(
  measureDurationDivisions: number,
  startOffset: number,
  requestedDurationDivisions: number,
) {
  const remaining = Math.max(1, measureDurationDivisions - startOffset);
  return Math.max(1, Math.min(requestedDurationDivisions, remaining));
}

/** The part and measure a command or locator names, when it names one. */
function commandScope(command: object) {
  return command as { coreMeasureId?: string | null; corePartId?: string | null };
}

function resolveVoiceScope(
  document: ScoreDocumentModel,
  scope?: { coreMeasureId?: string | null; corePartId?: string | null } | null,
) {
  const corePartId = scope?.corePartId && document.score.parts.some((part) => part.id === scope.corePartId)
    ? scope.corePartId
    : null;
  const coreMeasureId = scope?.coreMeasureId && document.score.parts.some((part) => (
    (!corePartId || part.id === corePartId)
    && part.staves.some((staff) => staff.measures.some((measure) => measure.id === scope.coreMeasureId))
  ))
    ? scope.coreMeasureId
    : null;
  return { coreMeasureId, corePartId };
}

function findVoice(
  document: ScoreDocumentModel,
  measureNumber: number,
  staffIndex: number,
  voiceId: number,
  scope?: { coreMeasureId?: string | null; corePartId?: string | null } | null,
) {
  const scoped = resolveVoiceScope(document, scope);
  for (const part of document.score.parts) {
    if (scoped.corePartId && part.id !== scoped.corePartId) continue;
    const staff = part.staves.find((entry) => entry.staffIndex === staffIndex);
    const measure = scoped.coreMeasureId
      ? staff?.measures.find((entry) => entry.id === scoped.coreMeasureId)
      : staff?.measures.find((entry) => entry.measureNumber === measureNumber);
    const voice = measure?.voices.find((entry) => entry.voiceId === voiceId);
    if (staff && measure && voice) return { part, staff, measure, voice };
  }
  return null;
}

function findEventIndex(voice: VoiceNode, timestampNum: number, timestampDen: number) {
  return voice.events.findIndex((event) => timestampsEqual(event.timestampNum, event.timestampDen, timestampNum, timestampDen));
}

function findCommandEventIndex(
  voice: VoiceNode,
  locator: {
    coreEntityId?: string | null;
    timestampNum: number;
    timestampDen: number;
    step?: string;
    octave?: number;
    alter?: number;
    isRest?: boolean;
  },
) {
  if (locator.coreEntityId) {
    const exactIndex = voice.events.findIndex((event) => (
      event.id === locator.coreEntityId
      && timestampsEqual(event.timestampNum, event.timestampDen, locator.timestampNum, locator.timestampDen)
    ));
    if (exactIndex >= 0) return exactIndex;

    const identityIndex = voice.events.findIndex((event) => event.id === locator.coreEntityId);
    if (identityIndex >= 0) return identityIndex;
  }
  const timestampMatches = voice.events
    .map((event, index) => ({ event, index }))
    .filter(({ event }) => timestampsEqual(event.timestampNum, event.timestampDen, locator.timestampNum, locator.timestampDen));
  if (locator.isRest) {
    const restMatch = timestampMatches.find(({ event }) => event.kind === 'rest');
    if (restMatch) return restMatch.index;
  }
  if (typeof locator.step === 'string' && typeof locator.octave === 'number' && typeof locator.alter === 'number') {
    const pitchMatch = timestampMatches.find(({ event }) => (
      event.kind === 'note'
      && event.pitch.step === locator.step
      && event.pitch.octave === locator.octave
      && event.pitch.alter === locator.alter
    ));
    if (pitchMatch) return pitchMatch.index;
  }
  if (locator.coreEntityId && timestampMatches.length !== 1) return -1;
  if (timestampMatches.length === 1) return timestampMatches[0]!.index;
  return findEventIndex(voice, locator.timestampNum, locator.timestampDen);
}

const pitchMidiNumber = pitchToMidi;

function isTabStaff(part: ScoreDocumentModel['score']['parts'][number], staffIndex: number) {
  return part.staves
    .find((staff) => staff.staffIndex === staffIndex)
    ?.measures.some((measure) => measure.attributes.some((attribute) => (
      attribute.clefs.some((clef) => clef.staffIndex === staffIndex && clef.sign?.toUpperCase() === 'TAB')
    ))) ?? false;
}

function findPairedTabNotationEvent(
  part: ScoreDocumentModel['score']['parts'][number],
  sourceStaffIndex: number,
  measureNumber: number,
  voiceId: number,
  timestampNum: number,
  timestampDen: number,
) {
  const sourceIsTab = isTabStaff(part, sourceStaffIndex);
  const pairedStaves = part.staves
    .filter((staff) => staff.staffIndex !== sourceStaffIndex && isTabStaff(part, staff.staffIndex) !== sourceIsTab)
    .sort((left, right) => Math.abs(left.staffIndex - sourceStaffIndex) - Math.abs(right.staffIndex - sourceStaffIndex));

  for (const staff of pairedStaves) {
    const measure = staff.measures.find((entry) => entry.measureNumber === measureNumber);
    const voice = measure?.voices.find((entry) => entry.voiceId === voiceId);
    const event = voice?.events.find((entry) => (
      entry.kind === 'note'
      && timestampsEqual(entry.timestampNum, entry.timestampDen, timestampNum, timestampDen)
    ));
    if (measure && voice && event?.kind === 'note') {
      return { staff, measure, voice, event, isTab: isTabStaff(part, staff.staffIndex) };
    }
  }

  return null;
}

function findPairedTabNotationTimedEvent(
  part: ScoreDocumentModel['score']['parts'][number],
  sourceStaffIndex: number,
  measureNumber: number,
  voiceId: number,
  timestampNum: number,
  timestampDen: number,
  sourceEvent?: TimedEvent | null,
) {
  const sourceIsTab = isTabStaff(part, sourceStaffIndex);
  const pairedStaves = part.staves
    .filter((staff) => staff.staffIndex !== sourceStaffIndex && isTabStaff(part, staff.staffIndex) !== sourceIsTab)
    .sort((left, right) => Math.abs(left.staffIndex - sourceStaffIndex) - Math.abs(right.staffIndex - sourceStaffIndex));

  for (const staff of pairedStaves) {
    const measure = staff.measures.find((entry) => entry.measureNumber === measureNumber);
    const voice = measure?.voices.find((entry) => entry.voiceId === voiceId);
    const timestampEvents = voice?.events.filter((entry) => (
      timestampsEqual(entry.timestampNum, entry.timestampDen, timestampNum, timestampDen)
    )) ?? [];
    const expectedPitch = sourceEvent?.kind === 'note'
      ? pitchForPairedGuitarStaff(part, sourceStaffIndex, isTabStaff(part, staff.staffIndex), sourceEvent.pitch)
      : null;
    const exactPitchMatches = expectedPitch
      ? timestampEvents.filter((entry) => (
          entry.kind === 'note'
          && entry.pitch.step === expectedPitch.step
          && entry.pitch.alter === expectedPitch.alter
          && entry.pitch.octave === expectedPitch.octave
        ))
      : [];
    const event = exactPitchMatches.find((entry) => entry.isChord === sourceEvent?.isChord)
      ?? exactPitchMatches[0]
      ?? timestampEvents.find((entry) => entry.isChord === sourceEvent?.isChord)
      ?? timestampEvents[0];
    if (measure && voice && event) {
      return { staff, measure, voice, event, isTab: isTabStaff(part, staff.staffIndex) };
    }
  }

  return null;
}

function findPairedStaffVoice(
  part: ScoreDocumentModel['score']['parts'][number],
  sourceStaffIndex: number,
  measureNumber: number,
  voiceId: number,
) {
  const sourceIsTab = isTabStaff(part, sourceStaffIndex);
  const pairedStaves = part.staves
    .filter((staff) => staff.staffIndex !== sourceStaffIndex && isTabStaff(part, staff.staffIndex) !== sourceIsTab)
    .sort((left, right) => Math.abs(left.staffIndex - sourceStaffIndex) - Math.abs(right.staffIndex - sourceStaffIndex));

  for (const staff of pairedStaves) {
    const measure = staff.measures.find((entry) => entry.measureNumber === measureNumber);
    const voice = measure?.voices.find((entry) => entry.voiceId === voiceId);
    if (measure && voice) return { staff, measure, voice, isTab: isTabStaff(part, staff.staffIndex) };
  }

  return null;
}

function pitchForPairedGuitarStaff(
  part: ScoreDocumentModel['score']['parts'][number],
  sourceStaffIndex: number,
  pairedIsTab: boolean,
  pitch: { step: string; alter: number; octave: number },
) {
  const sourceIsTab = isTabStaff(part, sourceStaffIndex);
  if (pairedIsTab && !sourceIsTab) return guitarWrittenToSoundingPitch(pitch);
  if (!pairedIsTab && sourceIsTab) return guitarSoundingToWrittenPitch(pitch);
  return pitch;
}

type CoreGuitarMetadata = NonNullable<Extract<TimedEvent, { kind: 'note' }>['guitar']>;
type CommandGuitarMetadata = {
  string: 1 | 2 | 3 | 4 | 5 | 6;
  fret: number;
  tuning?: string;
  techniques?: string[];
};

function resolveSyncedGuitarFingering(input: {
  pitch: { step: string; alter?: number; octave: number };
  requested?: CoreGuitarMetadata | CommandGuitarMetadata;
  existing?: CoreGuitarMetadata;
  preferredFret?: number;
}): CoreGuitarMetadata | undefined {
  if (input.requested) {
    const requested: CoreGuitarMetadata = {
      string: input.requested.string,
      fret: input.requested.fret,
    };
    if (input.requested.tuning) requested.tuning = input.requested.tuning;
    if (input.requested.techniques) requested.techniques = [...input.requested.techniques] as CoreGuitarMetadata['techniques'];
    return requested;
  }
  const tuning = resolveGuitarTuning(input.existing?.tuning);
  const generated = chooseGuitarFingeringForPitch(
    input.pitch,
    tuning,
    input.existing?.string,
    input.preferredFret,
  );
  if (!generated) return undefined;
  const resolved: CoreGuitarMetadata = {
    string: generated.string,
    fret: generated.fret,
  };
  if (input.existing?.tuning) resolved.tuning = input.existing.tuning;
  if (input.existing?.techniques) resolved.techniques = [...input.existing.techniques];
  return resolved;
}

function findPreviousGuitarHandPosition(voice: VoiceNode, insertionOffset: number) {
  const priorNotes = voice.events.filter((event): event is Extract<TimedEvent, { kind: 'note' }> => (
    event.kind === 'note'
    && event.timestampNum < insertionOffset
    && event.guitar != null
  ));
  if (priorNotes.length === 0) return undefined;
  const latestOffset = Math.max(...priorNotes.map((event) => event.timestampNum));
  const latestFrets = priorNotes
    .filter((event) => event.timestampNum === latestOffset)
    .map((event) => event.guitar!.fret)
    .sort((left, right) => left - right);
  if (latestFrets.length === 0) return undefined;
  return latestFrets[Math.floor((latestFrets.length - 1) / 2)];
}

function findSimultaneousEventIndices(voice: VoiceNode, timestampNum: number, timestampDen: number) {
  return voice.events.reduce<number[]>((indices, event, index) => {
    if (timestampsEqual(event.timestampNum, event.timestampDen, timestampNum, timestampDen)) {
      indices.push(index);
    }
    return indices;
  }, []);
}

function compareLocators(
  a: { measureNumber: number; staffIndex: number; voiceId: number; timestampNum: number; timestampDen: number },
  b: { measureNumber: number; staffIndex: number; voiceId: number; timestampNum: number; timestampDen: number },
) {
  return a.measureNumber - b.measureNumber
    || a.staffIndex - b.staffIndex
    || a.voiceId - b.voiceId
    || (a.timestampNum / Math.max(a.timestampDen, 1)) - (b.timestampNum / Math.max(b.timestampDen, 1));
}

function collectEventsInRange(
  document: ScoreDocumentModel,
  range: NonNullable<ValidatedScoreCommand['target']['range']>,
) {
  const start = compareLocators(range.start, range.end) <= 0 ? range.start : range.end;
  const end = start === range.start ? range.end : range.start;
  const corePartId = start.corePartId ?? end.corePartId ?? null;
  const collected: Array<EventVoiceContext & { eventIndex: number }> = [];

  document.score.parts.forEach((part) => {
    if (corePartId && part.id !== corePartId) return;
    part.staves.forEach((staff) => {
      if (staff.staffIndex !== start.staffIndex) return;
      staff.measures.forEach((measure) => {
        if (measure.measureNumber < start.measureNumber || measure.measureNumber > end.measureNumber) return;
        measure.voices.forEach((voice) => {
          if (voice.voiceId !== start.voiceId) return;
          voice.events.forEach((event, eventIndex) => {
            const locator = {
              measureNumber: event.measureNumber,
              staffIndex: event.staffIndex,
              voiceId: event.voiceId,
              timestampNum: event.timestampNum,
              timestampDen: event.timestampDen,
            };
            if (compareLocators(locator, start) >= 0 && compareLocators(locator, end) <= 0) {
              collected.push({ part, staff, measure, voice, eventIndex });
            }
          });
        });
      });
    });
  });

  return collected;
}

function matchesLocator(
  event: TimedEvent,
  locator: { measureNumber: number; staffIndex: number; voiceId: number; timestampNum: number; timestampDen: number },
) {
  return event.measureNumber === locator.measureNumber
    && event.staffIndex === locator.staffIndex
    && event.voiceId === locator.voiceId
    && timestampsEqual(event.timestampNum, event.timestampDen, locator.timestampNum, locator.timestampDen);
}

function findNextNoteEvent(
  document: ScoreDocumentModel,
  locator: { measureNumber: number; staffIndex: number; voiceId: number; timestampNum: number; timestampDen: number },
  corePartId?: string | null,
) {
  const candidates: Array<{ event: TimedEvent; locator: typeof locator }> = [];

  document.score.parts.forEach((part) => {
    if (!commandTargetsPart(part, corePartId)) return;
    part.staves.forEach((staff) => {
      if (staff.staffIndex !== locator.staffIndex) return;
      staff.measures.forEach((measure) => {
        measure.voices.forEach((voice) => {
          if (voice.voiceId !== locator.voiceId) return;
          voice.events.forEach((event) => {
            candidates.push({
              event,
              locator: {
                measureNumber: event.measureNumber,
                staffIndex: event.staffIndex,
                voiceId: event.voiceId,
                timestampNum: event.timestampNum,
                timestampDen: event.timestampDen,
              },
            });
          });
        });
      });
    });
  });

  const sorted = candidates.sort((a, b) => compareLocators(a.locator, b.locator));
  const startIndex = sorted.findIndex(({ event }) => matchesLocator(event, locator));
  if (startIndex < 0) return null;

  for (let index = startIndex + 1; index < sorted.length; index += 1) {
    if (sorted[index].event.kind === 'note') return sorted[index].event;
  }

  return null;
}

function ensureVoice(
  document: ScoreDocumentModel,
  measureNumber: number,
  staffIndex: number,
  voiceId: number,
  scope?: { coreMeasureId?: string | null; corePartId?: string | null } | null,
) {
  const scoped = resolveVoiceScope(document, scope);
  const found = findVoice(document, measureNumber, staffIndex, voiceId, scoped);
  if (found) return found;

  for (const part of document.score.parts) {
    if (scoped.corePartId && part.id !== scoped.corePartId) continue;
    const staff = part.staves.find((entry) => entry.staffIndex === staffIndex);
    const measure = scoped.coreMeasureId
      ? staff?.measures.find((entry) => entry.id === scoped.coreMeasureId)
      : staff?.measures.find((entry) => entry.measureNumber === measureNumber);
    if (!measure || !staff) continue;
    const voice: VoiceNode = {
      id: `${measure.id}:voice:${voiceId}`,
      voiceId,
      events: [],
    };
    measure.voices.push(voice);
    return { part, staff, measure, voice };
  }
  return null;
}

function durationTypeForBeatType(beatType: number | undefined) {
  if (beatType === 1) return 'whole';
  if (beatType === 2) return 'half';
  if (beatType === 8) return 'eighth';
  if (beatType === 16) return '16th';
  if (beatType === 32) return '32nd';
  if (beatType === 64) return '64th';
  return 'quarter';
}

function slashPitchForMeasure(
  measure: ScoreDocumentModel['score']['parts'][number]['staves'][number]['measures'][number],
  staffIndex: number,
) {
  const clef = [...measure.attributes]
    .reverse()
    .flatMap((attribute) => attribute.clefs)
    .find((entry) => entry.staffIndex === staffIndex || measure.attributes.length === 1);
  if (clef?.sign === 'F') return { step: 'D', alter: 0, octave: 3 };
  if (clef?.sign === 'C') return { step: 'C', alter: 0, octave: 4 };
  return { step: 'B', alter: 0, octave: 4 };
}

/**
 * Whether a command addressed to `corePartId` targets `part`. Commands without a part keep their
 * score-wide meaning; with a part (core id "part:P1" or MusicXML id "P1") only that part changes.
 */
function commandTargetsPart(part: { id: string; sourcePartId?: string }, corePartId: string | null | undefined) {
  if (!corePartId) return true;
  const wanted = corePartId.replace(/^part:/, '');
  return part.id === corePartId || part.id.replace(/^part:/, '') === wanted || part.sourcePartId === wanted;
}

function fillMeasureWithSlashes(
  document: ScoreDocumentModel,
  command: Extract<ValidatedScoreCommand, { type: 'fillSlashMeasure' }>,
) {
  const targetVoiceId = command.voiceId ?? 1;
  document.score.parts.forEach((part) => {
    if (!commandTargetsPart(part, command.corePartId)) return;
    part.staves.forEach((staff) => {
      if (command.staffIndex != null && staff.staffIndex !== command.staffIndex) return;
      const measure = staff.measures.find((entry) => entry.measureNumber === command.measureNumber);
      if (!measure) return;
      const time = measure.attributes.find((entry) => entry.time)?.time ?? measure.attributes[0]?.time;
      const durationType = durationTypeForBeatType(time?.beatType);
      ensureStaffDivisionsForDuration(staff, measure.measureNumber, durationType, false);
      const refreshedMeasure = staff.measures.find((entry) => entry.measureNumber === command.measureNumber) ?? measure;
      const timing = resolveMeasureTiming(staff, refreshedMeasure);
      const slashDuration = requestedDurationDivisions(durationType, false, timing.divisions);
      const pitch = slashPitchForMeasure(refreshedMeasure, staff.staffIndex);
      let voice = refreshedMeasure.voices.find((entry) => entry.voiceId === targetVoiceId);
      if (!voice) {
        voice = { id: `${refreshedMeasure.id}:voice:${targetVoiceId}`, voiceId: targetVoiceId, events: [] };
        refreshedMeasure.voices.push(voice);
      }
      const events: TimedEvent[] = [];
      let offset = 0;
      let index = 0;
      while (offset < timing.durationDivisions) {
        const durationDivisions = Math.min(slashDuration, timing.durationDivisions - offset);
        const duration = describeDuration(durationDivisions, timing.divisions);
        events.push({
          id: `${refreshedMeasure.id}:slash:${targetVoiceId}:${offset}:${index}`,
          kind: 'note',
          measureNumber: refreshedMeasure.measureNumber,
          staffIndex: staff.staffIndex,
          voiceId: targetVoiceId,
          timestampNum: offset,
          timestampDen: Math.max(timing.divisions * 4, 1),
          durationDivisions,
          durationType: duration.type,
          isDotted: duration.dotted,
          isChord: false,
          notehead: 'slash',
          stem: command.stem ?? 'none',
          articulations: [],
          tieStart: false,
          lyrics: [],
          pitch,
        });
        offset += durationDivisions;
        index += 1;
      }
      voice.events = events;
    });
  });
}

function transposePitch(step: string, alter: number, octave: number, semitones: number, preferFlats = false) {
  const STEP_TO_SEMITONE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const SEMITONE_TO_STEP_ALTER_SHARPS: Array<{ step: string; alter: number }> = [
    { step: 'C', alter: 0 }, { step: 'C', alter: 1 }, { step: 'D', alter: 0 }, { step: 'D', alter: 1 },
    { step: 'E', alter: 0 }, { step: 'F', alter: 0 }, { step: 'F', alter: 1 }, { step: 'G', alter: 0 },
    { step: 'G', alter: 1 }, { step: 'A', alter: 0 }, { step: 'A', alter: 1 }, { step: 'B', alter: 0 },
  ];
  const SEMITONE_TO_STEP_ALTER_FLATS: Array<{ step: string; alter: number }> = [
    { step: 'C', alter: 0 }, { step: 'D', alter: -1 }, { step: 'D', alter: 0 }, { step: 'E', alter: -1 },
    { step: 'E', alter: 0 }, { step: 'F', alter: 0 }, { step: 'G', alter: -1 }, { step: 'G', alter: 0 },
    { step: 'A', alter: -1 }, { step: 'A', alter: 0 }, { step: 'B', alter: -1 }, { step: 'B', alter: 0 },
  ];

  const midi = (STEP_TO_SEMITONE[step] ?? 0) + alter + octave * 12;
  const nextMidi = midi + semitones;
  const nextOctave = Math.floor(nextMidi / 12);
  const chroma = ((nextMidi % 12) + 12) % 12;
  const mapped = (preferFlats ? SEMITONE_TO_STEP_ALTER_FLATS : SEMITONE_TO_STEP_ALTER_SHARPS)[chroma];
  return { step: mapped.step, alter: mapped.alter, octave: nextOctave };
}

function transposeChordToken(token: string, semitones: number, preferFlats: boolean) {
  const match = token.match(/^([A-Ga-g])([#b]?)(.*)$/);
  if (!match) return token;
  const [, rawStep, accidental, suffix] = match;
  const transposed = transposePitch(rawStep.toUpperCase(), accidental === '#' ? 1 : accidental === 'b' ? -1 : 0, 4, semitones, preferFlats);
  return `${transposed.step}${transposed.alter === 1 ? '#' : transposed.alter === -1 ? 'b' : ''}${suffix}`;
}

function transposeHarmonyValue(value: string | undefined, semitones: number, preferFlats: boolean) {
  if (!value?.trim()) return value;
  const [rootPart, bassPart] = value.split('/');
  const nextRoot = transposeChordToken(rootPart.trim(), semitones, preferFlats);
  if (!bassPart) return nextRoot;
  const nextBass = transposeChordToken(bassPart.trim(), semitones, preferFlats);
  return `${nextRoot}/${nextBass}`;
}

function noteToMidi(step: string, alter: number, octave: number) {
  const stepToSemitone: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  return (stepToSemitone[step] ?? 0) + alter + (octave + 1) * 12;
}

function rehearsalLabel(index: number, style: 'letters' | 'numbers' = 'letters') {
  if (style === 'numbers') return String(index + 1);
  let current = index;
  let result = '';
  do {
    result = String.fromCharCode(65 + (current % 26)) + result;
    current = Math.floor(current / 26) - 1;
  } while (current >= 0);
  return result;
}

function shiftEventsAfter(voice: VoiceNode, fromOffset: number, byDuration: number) {
  voice.events.forEach((event) => {
    if (event.timestampNum >= fromOffset) {
      event.timestampNum += byDuration;
    }
  });
}

function constrainVoiceToMeasure(voice: VoiceNode, measureDurationDivisions: number, divisions = 1) {
  voice.events = voice.events
    .filter((event) => event.timestampNum < measureDurationDivisions)
    .map((event) => {
      const remaining = Math.max(1, measureDurationDivisions - event.timestampNum);
      if (event.durationDivisions <= remaining) return event;
      const duration = describeDuration(remaining, divisions);
      return {
        ...event,
        durationDivisions: remaining,
        durationType: duration.type,
        isDotted: duration.dotted,
      };
    });
}

function consumeVoiceEventsForDurationExpansion(
  document: ScoreDocumentModel,
  voice: VoiceNode,
  consumedStart: number,
  consumedEnd: number,
  divisions: number,
  protectedEventIds: Set<string>,
) {
  if (consumedEnd <= consumedStart) return;
  const deletedEventIds = new Set<string>();

  voice.events = voice.events.flatMap((event) => {
    if (protectedEventIds.has(event.id)) return [event];
    const eventStart = event.timestampNum;
    const eventEnd = eventStart + Math.max(event.durationDivisions, 0);
    const overlapsConsumedSpan = eventStart < consumedEnd && eventEnd > consumedStart;
    if (!overlapsConsumedSpan) return [event];

    if (eventEnd <= consumedEnd || eventStart >= consumedStart) {
      deletedEventIds.add(event.id);
      return [];
    }

    const nextDurationDivisions = eventEnd - consumedEnd;
    if (nextDurationDivisions <= 0) {
      deletedEventIds.add(event.id);
      return [];
    }
    const duration = describeDuration(nextDurationDivisions, divisions);
    return [{
      ...event,
      timestampNum: consumedEnd,
      durationDivisions: nextDurationDivisions,
      durationType: duration.type,
      isDotted: duration.dotted,
    }];
  });

  removeDeletedEventReferences(document, deletedEventIds);
}

function applyDurationChangeToVoice(
  document: ScoreDocumentModel,
  input: {
    staff: ScoreDocumentModel['score']['parts'][number]['staves'][number];
    measure: ScoreDocumentModel['score']['parts'][number]['staves'][number]['measures'][number];
    voice: VoiceNode;
    voiceId: number;
    timestampNum: number;
    timestampDen: number;
    durationType: string;
    isDotted?: boolean;
  },
) {
  ensureStaffDivisionsForDuration(input.staff, input.measure.measureNumber, input.durationType, input.isDotted);
  const timing = resolveMeasureTiming(input.staff, input.measure);
  const simultaneousIndices = findSimultaneousEventIndices(input.voice, input.timestampNum, input.timestampDen);
  const simultaneousEvents = simultaneousIndices.map((index) => input.voice.events[index]).filter(Boolean);
  const event = simultaneousEvents[0];
  if (!event) return false;
  const requestedDuration = requestedDurationDivisions(input.durationType, input.isDotted, timing.divisions);
  const nextDurationDivisions = clampDurationToMeasure(timing.durationDivisions, event.timestampNum, requestedDuration);
  const previousDurationDivisions = simultaneousEvents.reduce((max, current) => (
    Math.max(max, current.durationDivisions)
  ), 0);
  const delta = nextDurationDivisions - previousDurationDivisions;
  const fromOffset = event.timestampNum + previousDurationDivisions;
  simultaneousEvents.forEach((entry) => {
    entry.durationDivisions = nextDurationDivisions;
    entry.durationType = input.durationType;
    entry.isDotted = input.isDotted;
  });
  if (delta > 0) {
    consumeVoiceEventsForDurationExpansion(
      document,
      input.voice,
      fromOffset,
      event.timestampNum + nextDurationDivisions,
      timing.divisions,
      new Set(simultaneousEvents.map((entry) => entry.id)),
    );
    constrainVoiceToMeasure(input.voice, timing.durationDivisions, timing.divisions);
    input.voice.events.sort((a, b) => a.timestampNum - b.timestampNum || Number(a.isChord) - Number(b.isChord));
  } else if (delta < 0) {
    // A shorter value leaves its freed time as rests directly after the note; the following music
    // keeps its onsets (MuseScore Score::changeCRlen, "make shorter and fill with rest",
    // src/engraving/editing/cmd.cpp). The gap is filled below.
    input.voice.events.sort((a, b) => a.timestampNum - b.timestampNum || Number(a.isChord) - Number(b.isChord));
  }
  fillVoiceTimelineGaps(input.staff, input.voiceId, {
    startMeasureNumber: input.measure.measureNumber,
    endMeasureNumber: input.measure.measureNumber,
    preferExactTailRest: delta < 0 && simultaneousEvents.length > 1,
    keepMeasureRhythm: true,
  });
  return true;
}

function ensureMeasure(
  document: ScoreDocumentModel,
  measureNumber: number,
  staffIndex?: number,
  scope?: { corePartId?: string | null },
) {
  for (const part of document.score.parts) {
    if (!commandTargetsPart(part, scope?.corePartId)) continue;
    const staff = part.staves.find((entry) => entry.staffIndex === (staffIndex ?? 1));
    const measure = staff?.measures.find((entry) => entry.measureNumber === measureNumber);
    if (part && staff && measure) return { part, staff, measure };
  }
  return null;
}

function getMeasureKeyFifths(document: ScoreDocumentModel, measureNumber: number, staffIndex: number) {
  for (const part of document.score.parts) {
    const staff = part.staves.find((entry) => entry.staffIndex === staffIndex);
    if (!staff) continue;
    const measures = [...staff.measures]
      .filter((measure) => measure.measureNumber <= measureNumber)
      .sort((a, b) => b.measureNumber - a.measureNumber);
    for (const measure of measures) {
      const fifths = measure.attributes.find((attribute) => typeof attribute.keyFifths === 'number')?.keyFifths;
      if (typeof fifths === 'number') return fifths;
    }
  }
  return undefined;
}

function upsertLayoutHint(
  document: ScoreDocumentModel,
  input: {
    measureNumber: number;
    partId?: string;
    staffIndex?: number;
    kind: 'newSystem' | 'newPage' | 'staffSpacing' | 'collisionPolicy';
    value: boolean | number | string;
    scope?: 'measure' | 'staff' | 'system' | 'page' | 'part';
  },
) {
  const existing = document.layoutHints.find((hint) => (
    hint.measureNumber === input.measureNumber
    && hint.partId === input.partId
    && hint.staffIndex === input.staffIndex
    && hint.kind === input.kind
  ));
  if (existing) {
    existing.value = input.value;
    existing.scope = input.scope ?? existing.scope;
    return existing;
  }

  const created = {
    id: `layout:${input.partId ?? 'all'}:${input.staffIndex ?? 'all'}:${input.measureNumber}:${input.kind}`,
    scope: input.scope ?? 'measure',
    measureNumber: input.measureNumber,
    partId: input.partId,
    staffIndex: input.staffIndex,
    kind: input.kind,
    value: input.value,
  } as const;
  document.layoutHints.push(created);
  return created;
}

function upsertLyricLine(
  document: ScoreDocumentModel,
  eventId: string,
  verseNumber: number,
  text: string,
  syllabic?: 'single' | 'begin' | 'middle' | 'end',
) {
  const existing = document.lyricLines.find((line) => line.eventId === eventId && line.verseNumber === verseNumber);
  if (existing) {
    existing.text = text;
    existing.syllabic = syllabic;
    return existing;
  }
  const created = {
    id: `lyric:${eventId}:${verseNumber}`,
    eventId,
    verseNumber,
    text,
    syllabic,
  } as const;
  document.lyricLines.push(created);
  return created;
}

function removeLyricLine(
  document: ScoreDocumentModel,
  eventId: string,
  verseNumber: number,
) {
  document.lyricLines = document.lyricLines.filter((line) => !(line.eventId === eventId && line.verseNumber === verseNumber));
}

function removeDirection(
  document: ScoreDocumentModel,
  measureNumber: number,
  text: string,
  staffIndex?: number,
  kind?: string,
  corePartId?: string | null,
) {
  document.score.parts.forEach((part) => {
    if (corePartId && part.id !== corePartId) return;
    part.staves.forEach((staff) => {
      if (staffIndex != null && staff.staffIndex !== staffIndex) return;
      const measure = staff.measures.find((entry) => entry.measureNumber === measureNumber);
      if (!measure) return;
      const match = measure.directions.find((direction) =>
        direction.value === text
        && (kind ? direction.kind === kind : true)
        && (staffIndex != null ? direction.staffIndex === staffIndex : true));
      if (!match) return;
      measure.directions = measure.directions.filter((direction) => direction.id !== match.id);
    });
  });
}

function addVisibleTextDirection(input: {
  document: ScoreDocumentModel;
  measureNumber: number;
  text: string;
  idKind: string;
  placement?: string;
  staffIndex?: number;
  partId?: string;
  timestampNum?: number;
  timestampDen?: number;
}) {
  input.document.score.parts.forEach((part) => {
    if (input.partId && part.sourcePartId !== input.partId && part.id !== input.partId) return;
    part.staves.forEach((staff) => {
      if (input.staffIndex != null && staff.staffIndex !== input.staffIndex) return;
      const measure = staff.measures.find((entry) => entry.measureNumber === input.measureNumber);
      if (!measure) return;
      const timestampNum = input.timestampNum ?? 0;
      const timestampDen = input.timestampDen ?? Math.max((measure.attributes[0]?.divisions ?? 1) * 4, 1);
      measure.directions.push({
        id: `${measure.id}:${input.idKind}:${staff.staffIndex}:${timestampNum}:${input.text}`,
        kind: 'words',
        value: input.text,
        placement: input.placement ?? 'above',
        measureNumber: input.measureNumber,
        staffIndex: staff.staffIndex,
        timestampNum,
        timestampDen,
      });
    });
  });
}

function semanticRangeLabel(startMeasureNumber: number, endMeasureNumber: number) {
  return startMeasureNumber === endMeasureNumber
    ? `m.${startMeasureNumber}`
    : `m.${startMeasureNumber}-${endMeasureNumber}`;
}

function analysisTypeLabel(type?: string) {
  if (type === 'romanNumeral') return 'Roman numeral';
  if (type === 'forteSet') return 'Forte set';
  if (type === 'chordScale') return 'Chord-scale';
  if (type === 'neoRiemannian') return 'Neo-Riemannian';
  if (type === 'schenkerian') return 'Schenkerian';
  if (type === 'motivic') return 'Motivic';
  if (type === 'form') return 'Form';
  return 'Analysis';
}

type InstrumentProfile = {
  instrumentName: string;
  chromaticTranspose?: number;
  diatonicTranspose?: number;
  minMidi: number;
  maxMidi: number;
};

const INSTRUMENT_PROFILES: Record<string, InstrumentProfile> = {
  voice: { instrumentName: 'Voice', minMidi: 55, maxMidi: 79 },
  flute: { instrumentName: 'Flute', minMidi: 60, maxMidi: 96 },
  violin: { instrumentName: 'Violin', minMidi: 55, maxMidi: 103 },
  'clarinet-bb': { instrumentName: 'Clarinet in Bb', chromaticTranspose: 2, diatonicTranspose: 1, minMidi: 50, maxMidi: 91 },
  'trumpet-bb': { instrumentName: 'Trumpet in Bb', chromaticTranspose: 2, diatonicTranspose: 1, minMidi: 54, maxMidi: 82 },
  'alto-sax-eb': { instrumentName: 'Alto Sax in Eb', chromaticTranspose: 9, diatonicTranspose: 6, minMidi: 49, maxMidi: 81 },
  cello: { instrumentName: 'Cello', minMidi: 36, maxMidi: 76 },
};

function ensureNotationFragment(event: TimedEvent, containerTag: string, innerXml: string) {
  const fragments = [...(event.preservedXml?.notationChildren ?? [])].filter((fragment) => !fragment.includes(`<${containerTag}>`));
  fragments.push(`<${containerTag}>${innerXml}</${containerTag}>`);
  event.preservedXml = {
    ...event.preservedXml,
    notationChildren: fragments,
  };
}

function buildInsertedEvent(
  measure: ScoreDocumentModel['score']['parts'][number]['staves'][number]['measures'][number],
  command: Extract<ValidatedScoreCommand, { type: 'insertNote' | 'insertRest' | 'insertNoteAt' | 'insertRestAt' }>,
  insertionOffset: number,
  divisions: number,
  measureDurationDivisions: number,
): TimedEvent {
  const durationDivisions = clampDurationToMeasure(
    measureDurationDivisions,
    insertionOffset,
    requestedDurationDivisions(command.durationType, command.isDotted, divisions),
  );
  const guitar = 'guitar' in command && command.guitar
    ? structuredClone(command.guitar) as Extract<TimedEvent, { kind: 'note' }>['guitar']
    : undefined;
  const eventCount = measure.voices.reduce((sum, voice) => sum + voice.events.length, 0);
  const idBase = `${measure.id}:event:${command.voiceId}:${insertionOffset}:${Date.now()}:${eventCount}`;
  const existingIds = new Set(measure.voices.flatMap(voice => voice.events.map(event => event.id)));
  let id = idBase;
  for (let suffix = 1; existingIds.has(id); suffix += 1) id = `${idBase}:${suffix}`;
  const common = {
    id,
    kind: command.type === 'insertNote' ? 'note' as const : 'rest' as const,
    measureNumber: measure.measureNumber,
    staffIndex: command.staffIndex,
    voiceId: command.voiceId,
    timestampNum: insertionOffset,
    timestampDen: Math.max(divisions * 4, 1),
    durationDivisions,
    durationType: command.durationType,
    isDotted: command.isDotted,
    isChord: Boolean('asChord' in command && command.asChord),
    notehead: 'notehead' in command && command.notehead === 'slash' ? 'slash' as const : undefined,
    stem: 'stem' in command && command.stem === 'none' ? 'none' as const : undefined,
    articulations: [],
    tieStart: false,
    lyrics: [],
  };

  if (command.type === 'insertNote' || command.type === 'insertNoteAt') {
    return {
      ...common,
      kind: 'note',
      pitch: {
        step: command.step,
        alter: command.alter,
        octave: command.octave,
      },
      writtenAccidental: command.writtenAccidental,
      guitar,
    };
  }

  return {
    ...common,
    kind: 'rest',
  };
}

function buildRestEventFromSpan(
  measure: ScoreDocumentModel['score']['parts'][number]['staves'][number]['measures'][number],
  divisions: number,
  staffIndex: number,
  voiceId: number,
  insertionOffset: number,
  durationDivisions: number,
): TimedEvent {
  const duration = describeDuration(durationDivisions, divisions);
  return {
    id: `${measure.id}:event:${voiceId}:${insertionOffset}:rest:${Date.now()}`,
    kind: 'rest',
    measureNumber: measure.measureNumber,
    staffIndex,
    voiceId,
    timestampNum: insertionOffset,
    timestampDen: Math.max(divisions * 4, 1),
    durationDivisions,
    durationType: duration.type,
    isDotted: duration.dotted,
    isChord: false,
    articulations: [],
    tieStart: false,
    lyrics: [],
  };
}

function decomposeRestSpanDivisions(
  durationDivisions: number,
  divisions: number,
  preferredChunkDivisions: number,
  startOffset: number,
) {
  const chunks: number[] = [];
  const candidates = buildDurationCandidates(divisions);
  const preferred = preferredChunkDivisions > 0
    ? candidates.find((candidate) => candidate.value === preferredChunkDivisions) ?? null
    : null;
  const beatDivisions = Math.max(divisions, 1);
  const strongGroupDivisions = beatDivisions * 2;
  let remaining = Math.max(0, durationDivisions);
  let offset = Math.max(0, startOffset);

  while (remaining > 0) {
    const beatRemainder = offset % beatDivisions;
    const beatBoundaryFill = beatRemainder > 0 ? beatDivisions - beatRemainder : 0;
    const strongRemainder = strongGroupDivisions > beatDivisions ? offset % strongGroupDivisions : 0;
    const strongBoundaryFill = strongRemainder > 0 ? strongGroupDivisions - strongRemainder : 0;
    const limitedToBoundary = beatBoundaryFill > 0 && beatBoundaryFill < remaining
      ? beatBoundaryFill
      : strongBoundaryFill > 0 && strongBoundaryFill < remaining
        ? strongBoundaryFill
        : 0;
    const target = limitedToBoundary > 0 ? limitedToBoundary : remaining;
    const next = preferred && preferred.value <= target
      ? preferred
      : candidates.find((candidate) => candidate.value <= target) ?? { value: 1, type: '64th', dotted: false };
    chunks.push(next.value);
    remaining -= next.value;
    offset += next.value;
  }

  return chunks;
}

function buildRestEventsForSpan(
  measure: ScoreDocumentModel['score']['parts'][number]['staves'][number]['measures'][number],
  divisions: number,
  staffIndex: number,
  voiceId: number,
  startOffset: number,
  durationDivisions: number,
  preferredChunkDivisions: number,
) {
  const rests: TimedEvent[] = [];
  let offset = startOffset;
  const chunks = decomposeRestSpanDivisions(durationDivisions, divisions, Math.max(1, preferredChunkDivisions), startOffset);

  for (const nextDuration of chunks) {
    rests.push(buildRestEventFromSpan(measure, divisions, staffIndex, voiceId, offset, nextDuration));
    offset += nextDuration;
  }

  return rests;
}

type EventVoiceContext = NonNullable<ReturnType<typeof findVoice>>;

function deleteTimedEvent(document: ScoreDocumentModel, context: EventVoiceContext, event: TimedEvent) {
  const index = context.voice.events.indexOf(event);
  if (index < 0) return;
  // Grace notes share the onset but are not chord tones: deleting the main note of a grace leaves
  // a rest, not the grace note alone in a gap.
  const graceEventIds = new Set((document.graceNotes ?? []).map((link) => link.eventId));
  const remainingTones = context.voice.events.filter(entry => (
    entry !== event && entry.kind === 'note' && !graceEventIds.has(entry.id)
    && timestampsEqual(entry.timestampNum, entry.timestampDen, event.timestampNum, event.timestampDen)
  ));
  if (graceEventIds.has(event.id)) {
    context.voice.events.splice(index, 1);
  } else if (event.kind === 'note' && remainingTones.length > 0) {
    context.voice.events.splice(index, 1);
    if (!event.isChord) remainingTones[0]!.isChord = false;
  } else {
    const timing = resolveMeasureTiming(context.staff, context.measure);
    context.voice.events.splice(index, 1, ...buildRestEventsForSpan(
      context.measure, timing.divisions, event.staffIndex, event.voiceId,
      event.timestampNum, event.durationDivisions, event.durationDivisions,
    ));
  }
  removeDeletedEventReferences(document, new Set([event.id]));
}

function deleteEventAndPairedGuitarNote(document: ScoreDocumentModel, context: EventVoiceContext, event: TimedEvent) {
  // Resolve the matching tone before mutating either chord. A positional
  // fallback is useful for entry, but must never delete a different pitch.
  const paired = event.kind === 'note' ? findPairedTabNotationTimedEvent(
    context.part, context.staff.staffIndex, event.measureNumber, event.voiceId,
    event.timestampNum, event.timestampDen, event,
  ) : null;
  const expectedPitch = event.kind === 'note' && paired
    ? pitchForPairedGuitarStaff(context.part, context.staff.staffIndex, paired.isTab, event.pitch)
    : null;
  deleteTimedEvent(document, context, event);
  if (paired?.event.kind === 'note' && expectedPitch
    && pitchMidiNumber(paired.event.pitch) === pitchMidiNumber(expectedPitch)) {
    deleteTimedEvent(document, { ...paired, part: context.part }, paired.event);
  }
}

function mirrorGuitarInsertionToPairedStaff(input: {
  part: ScoreDocumentModel['score']['parts'][number];
  sourceStaffIndex: number;
  command: Extract<ValidatedScoreCommand, { type: 'insertNoteAt' | 'insertNote' }>;
  sourceInserted: TimedEvent;
}) {
  if (input.sourceInserted.kind !== 'note') return;
  const paired = findPairedStaffVoice(
    input.part,
    input.sourceStaffIndex,
    input.command.measureNumber,
    input.command.voiceId,
  );
  if (!paired) return;

  const sourceIsTab = isTabStaff(input.part, input.sourceStaffIndex);
  const pairedPitch = paired.isTab
    ? guitarWrittenToSoundingPitch(input.sourceInserted.pitch)
    : sourceIsTab
      ? guitarSoundingToWrittenPitch(input.sourceInserted.pitch)
      : input.sourceInserted.pitch;

  ensureStaffDivisionsForDuration(paired.staff, paired.measure.measureNumber, input.command.durationType, input.command.isDotted);
  const pairedTiming = resolveMeasureTiming(paired.staff, paired.measure);
  const pairedInsertionOffset = timestampToDivisionsOffset(
    pairedTiming.divisions,
    input.sourceInserted.timestampNum,
    input.sourceInserted.timestampDen,
  );
  const preferredFret = paired.isTab
    ? findPreviousGuitarHandPosition(paired.voice, pairedInsertionOffset)
    : undefined;

  let guitar = paired.isTab
    ? resolveSyncedGuitarFingering({
      pitch: pairedPitch,
      requested: 'guitar' in input.command ? input.command.guitar : undefined,
      preferredFret,
    })
    : undefined;

  if (paired.isTab && 'asChord' in input.command && input.command.asChord && !input.command.guitar) {
    const existingChordNotes = paired.voice.events.filter((event): event is Extract<TimedEvent, { kind: 'note' }> => (
      event.kind === 'note'
      && event.timestampNum === pairedInsertionOffset
    ));
    const tuning = resolveGuitarTuning(existingChordNotes.find((event) => event.guitar?.tuning)?.guitar?.tuning);
    const fingerings = chooseDistinctGuitarFingeringsForPitches(
      [...existingChordNotes.map((event) => event.pitch), pairedPitch],
      tuning,
      [...existingChordNotes.map((event) => event.guitar?.string), undefined],
      preferredFret,
    );
    if (!fingerings) return;
    existingChordNotes.forEach((event, index) => {
      const fingering = fingerings[index]!;
      event.guitar = {
        ...event.guitar,
        string: fingering.string,
        fret: fingering.fret,
      };
    });
    const newFingering = fingerings[fingerings.length - 1]!;
    guitar = { string: newFingering.string, fret: newFingering.fret };
  }
  if (paired.isTab && !guitar) return;
  const pairedDuration = requestedDurationDivisions(input.command.durationType, input.command.isDotted, pairedTiming.divisions);
  const pairedCommand = {
    ...input.command,
    staffIndex: paired.staff.staffIndex,
    step: pairedPitch.step,
    alter: pairedPitch.alter ?? 0,
    octave: pairedPitch.octave,
    guitar,
  };

  if ('asChord' in input.command && input.command.asChord) {
    const hasRhythmicRoot = paired.voice.events.some((event) => (
      !event.isChord
      && event.kind === 'note'
      && event.timestampNum === pairedInsertionOffset
    ));
    const duplicatePitch = paired.voice.events.some((event) => (
      event.kind === 'note'
      && event.timestampNum === pairedInsertionOffset
      && event.pitch.step === pairedPitch.step
      && event.pitch.alter === (pairedPitch.alter ?? 0)
      && event.pitch.octave === pairedPitch.octave
    ));
    if (!hasRhythmicRoot || duplicatePitch) return;

    paired.voice.events.push(buildInsertedEvent(
      paired.measure,
      pairedCommand,
      pairedInsertionOffset,
      pairedTiming.divisions,
      pairedTiming.durationDivisions,
    ));
    paired.voice.events.sort((a, b) => (
      a.timestampNum - b.timestampNum
      || Number(a.isChord) - Number(b.isChord)
      || a.id.localeCompare(b.id)
    ));
    return;
  }

  const pairedRestIndex = paired.voice.events.findIndex((event) => (
    !event.isChord
    && event.kind === 'rest'
    && event.timestampNum === pairedInsertionOffset
    && event.timestampNum + event.durationDivisions >= pairedInsertionOffset + pairedDuration
  ));
  const pairedRest = pairedRestIndex >= 0 ? paired.voice.events[pairedRestIndex] ?? null : null;
  if (!pairedRest) return;

  const inserted = buildInsertedEvent(
    paired.measure,
    pairedCommand,
    pairedInsertionOffset,
    pairedTiming.divisions,
    pairedTiming.durationDivisions,
  );
  paired.voice.events.splice(pairedRestIndex, 1);
  const leadingDuration = pairedInsertionOffset - pairedRest.timestampNum;
  const trailingOffset = pairedInsertionOffset + inserted.durationDivisions;
  const trailingDuration = (pairedRest.timestampNum + pairedRest.durationDivisions) - trailingOffset;

  if (leadingDuration > 0) {
    paired.voice.events.push(...buildRestEventsForSpan(
      paired.measure,
      pairedTiming.divisions,
      paired.staff.staffIndex,
      input.command.voiceId,
      pairedRest.timestampNum,
      leadingDuration,
      inserted.durationDivisions,
    ));
  }
  paired.voice.events.push(inserted);
  if (trailingDuration > 0) {
    paired.voice.events.push(...buildRestEventsForSpan(
      paired.measure,
      pairedTiming.divisions,
      paired.staff.staffIndex,
      input.command.voiceId,
      trailingOffset,
      trailingDuration,
      inserted.durationDivisions,
    ));
  }

  paired.voice.events = coalesceAdjacentRestsInMeasure(
    paired.measure,
    pairedTiming.divisions,
    paired.staff.staffIndex,
    input.command.voiceId,
    paired.voice.events,
  ).sort((a, b) => (
    a.timestampNum - b.timestampNum
    || Number(a.isChord) - Number(b.isChord)
    || a.id.localeCompare(b.id)
  ));
}

type StaffTimelineEntry = {
  measure: ScoreDocumentModel['score']['parts'][number]['staves'][number]['measures'][number];
  startOffset: number;
  durationDivisions: number;
  divisions: number;
};

type AbsoluteVoiceEvent = {
  event: TimedEvent;
  absStart: number;
  divisions: number;
};

type AbsoluteTimedDirection = {
  direction: ScoreDocumentModel['score']['parts'][number]['staves'][number]['measures'][number]['directions'][number];
  absStart: number;
};

type TimeSignatureRebarSnapshot = {
  partId: string;
  staffIndex: number;
  voices: Array<{
    voiceId: number;
    events: AbsoluteVoiceEvent[];
  }>;
  directions: AbsoluteTimedDirection[];
  minimumDurationDivisions: number;
};

type EventFragmentIdentity = {
  firstFragmentId: string;
  lastFragmentId: string;
  fragmentIds: string[];
};

type EventFragmentIdentityMap = Map<string, EventFragmentIdentity>;
type ClipboardLaneMapping = {
  sourceStaffIndex: number;
  sourceVoiceId: number;
  targetVoiceId: number;
};
type ClipboardEventIdentity = {
  selectionEventId: string;
  slurStartEventId: string;
  slurStopEventId: string;
};

function getOrCreateVoiceForMeasure(
  measure: ScoreDocumentModel['score']['parts'][number]['staves'][number]['measures'][number],
  voiceId: number,
) {
  const existing = measure.voices.find((voice) => voice.voiceId === voiceId);
  if (existing) return existing;
  const voice: VoiceNode = {
    id: `${measure.id}:voice:${voiceId}`,
    voiceId,
    events: [],
  };
  measure.voices.push(voice);
  return voice;
}

function buildStaffTimeline(
  staff: ScoreDocumentModel['score']['parts'][number]['staves'][number],
): StaffTimelineEntry[] {
  let startOffset = 0;
  return staff.measures.map((measure) => {
    const timing = resolveMeasureTiming(staff, measure);
    const entry = {
      measure,
      startOffset,
      durationDivisions: timing.durationDivisions,
      divisions: timing.divisions,
    };
    startOffset += timing.durationDivisions;
    return entry;
  });
}

function getTimelineEntryForMeasure(
  timeline: StaffTimelineEntry[],
  measureNumber: number,
) {
  return timeline.find((entry) => entry.measure.measureNumber === measureNumber) ?? null;
}

function getTimelineEntryForAbsoluteOffset(
  timeline: StaffTimelineEntry[],
  absOffset: number,
) {
  return timeline.find((entry) => absOffset >= entry.startOffset && absOffset < entry.startOffset + entry.durationDivisions)
    ?? timeline[timeline.length - 1]
    ?? null;
}

function sortAbsoluteVoiceEvents(events: AbsoluteVoiceEvent[]) {
  return events.sort((left, right) => (
    left.absStart - right.absStart
    || Number(right.event.durationDivisions === 0) - Number(left.event.durationDivisions === 0)
    || Number(left.event.isChord) - Number(right.event.isChord)
    || (left.event.durationDivisions === 0 && right.event.durationDivisions === 0 ? 0 : left.event.id.localeCompare(right.event.id))
  ));
}

function followSelectionRemap(selectionRemap: SelectionRemap, eventId: string) {
  let nextEventId = eventId;
  const seen = new Set<string>();
  while (selectionRemap[nextEventId] && !seen.has(nextEventId)) {
    seen.add(nextEventId);
    nextEventId = selectionRemap[nextEventId]!;
  }
  return nextEventId;
}

function findPartStaff(
  document: ScoreDocumentModel,
  partId: string,
  staffIndex: number,
) {
  const part = document.score.parts.find((entry) => entry.id === partId || entry.sourcePartId === partId) ?? null;
  const staff = part?.staves.find((entry) => entry.staffIndex === staffIndex) ?? null;
  return part && staff ? { part, staff } : null;
}

function buildTargetAbsoluteOffset(
  staff: ScoreDocumentModel['score']['parts'][number]['staves'][number],
  targetOffset: ClipboardTargetOffset,
) {
  const timeline = buildStaffTimeline(staff);
  const measureEntry = getTimelineEntryForMeasure(timeline, targetOffset.measureNumber);
  if (!measureEntry) return null;
  return measureEntry.startOffset + timestampToDivisionsOffset(
    measureEntry.divisions,
    targetOffset.timestampNum,
    targetOffset.timestampDen,
  );
}

function resolveClipboardLaneMappings(
  targetStaff: ScoreDocumentModel['score']['parts'][number]['staves'][number],
  clipboardData: ScoreClipboardPayload,
) {
  const lanes = [...clipboardData.lanes].sort((left, right) => (
    left.sourceStaffIndex - right.sourceStaffIndex
    || left.sourceVoiceId - right.sourceVoiceId
  ));
  if (lanes.length === 1) {
    return [{
      ...lanes[0]!,
      targetVoiceId: lanes[0]!.sourceVoiceId,
    }] satisfies ClipboardLaneMapping[];
  }

  const existingVoiceIds = new Set<number>(
    targetStaff.measures.flatMap((measure) => measure.voices.map((voice) => voice.voiceId)),
  );
  const assignedVoiceIds = new Set<number>();
  let nextVoiceId = Math.max(0, ...existingVoiceIds, ...lanes.map((lane) => lane.sourceVoiceId)) + 1;

  return lanes.map((lane) => {
    let targetVoiceId = lane.sourceVoiceId;
    if (existingVoiceIds.has(targetVoiceId) || assignedVoiceIds.has(targetVoiceId)) {
      while (existingVoiceIds.has(nextVoiceId) || assignedVoiceIds.has(nextVoiceId)) nextVoiceId += 1;
      targetVoiceId = nextVoiceId;
      nextVoiceId += 1;
    }
    assignedVoiceIds.add(targetVoiceId);
    return {
      ...lane,
      targetVoiceId,
    };
  });
}

function cloneClipboardLaneEvents(
  clipboardEvents: ClipboardAbsoluteEvent[],
  mapping: ClipboardLaneMapping,
  targetStaffIndex: number,
  targetAbsoluteOffset: number,
  identityMap: Map<string, ClipboardEventIdentity>,
  revision: number,
) {
  return clipboardEvents
    .filter((entry) => (
      entry.sourceStaffIndex === mapping.sourceStaffIndex
      && entry.sourceVoiceId === mapping.sourceVoiceId
    ))
    .map((entry, index) => {
      const nextEvent = structuredClone(entry.event);
      const nextId = `paste:${revision}:${targetAbsoluteOffset}:${targetStaffIndex}:${mapping.targetVoiceId}:${entry.absStart}:${index}:${entry.event.id}`;
      nextEvent.id = nextId;
      nextEvent.staffIndex = targetStaffIndex;
      nextEvent.voiceId = mapping.targetVoiceId;
      identityMap.set(entry.event.id, {
        selectionEventId: nextId,
        slurStartEventId: nextId,
        slurStopEventId: nextId,
      });
      return {
        event: nextEvent,
        absStart: targetAbsoluteOffset + entry.absStart,
        divisions: entry.event.timestampDen > 0 ? Math.max(1, Math.round(entry.event.timestampDen / 4)) : 1,
      };
    });
}

function overwriteAbsoluteTimelineEvents(
  events: AbsoluteVoiceEvent[],
  overwriteStart: number,
  overwriteEnd: number,
) {
  const nextEvents: AbsoluteVoiceEvent[] = [];
  const deletedEventIds = new Set<string>();

  for (const entry of events) {
    const eventEnd = entry.absStart + entry.event.durationDivisions;
    if (eventEnd <= overwriteStart || entry.absStart >= overwriteEnd) {
      nextEvents.push({
        event: structuredClone(entry.event),
        absStart: entry.absStart,
        divisions: entry.divisions,
      });
      continue;
    }

    const leadingDuration = Math.max(0, overwriteStart - entry.absStart);
    const trailingDuration = Math.max(0, eventEnd - overwriteEnd);
    const keepLeading = leadingDuration > 0 && !entry.event.isChord;
    const keepTrailing = trailingDuration > 0 && !entry.event.isChord;

    if (keepLeading) {
      nextEvents.push({
        event: cloneTimedEventWithDuration(entry.event, leadingDuration, entry.divisions, {
          tieStart: false,
        }),
        absStart: entry.absStart,
        divisions: entry.divisions,
      });
    }

    if (keepTrailing) {
      nextEvents.push({
        event: cloneTimedEventWithDuration(entry.event, trailingDuration, entry.divisions, {
          id: `${entry.event.id}:overwrite-tail:${overwriteEnd}`,
          articulations: [],
          lyrics: [],
          preservedXml: undefined,
          tieStart: false,
        }),
        absStart: overwriteEnd,
        divisions: entry.divisions,
      });
    }

    if (!keepLeading) deletedEventIds.add(entry.event.id);
  }

  return {
    events: sortAbsoluteVoiceEvents(nextEvents),
    deletedEventIds,
  };
}

function buildDocumentEventIdSet(document: ScoreDocumentModel) {
  return new Set(
    document.score.parts.flatMap((part) => part.staves)
      .flatMap((staff) => staff.measures)
      .flatMap((measure) => measure.voices)
      .flatMap((voice) => voice.events)
      .map((event) => event.id),
  );
}

function nextDirectionSpanNumber(
  document: ScoreDocumentModel,
  kind: string,
) {
  const numbers = document.score.parts.flatMap((part) => part.staves)
    .flatMap((staff) => staff.measures)
    .flatMap((measure) => measure.directions)
    .filter((direction) => direction.kind === kind && direction.number != null)
    .map((direction) => direction.number!);
  return numbers.length > 0 ? Math.max(...numbers) + 1 : 1;
}

function pasteClipboardTimedDirections(
  document: ScoreDocumentModel,
  staff: ScoreDocumentModel['score']['parts'][number]['staves'][number],
  targetAbsoluteOffset: number,
  timedDirections: ClipboardTimedDirection[],
) {
  if (timedDirections.length === 0) return;

  const timeline = buildStaffTimeline(staff);
  const spanKinds = new Set(['wedge', 'octave-shift', 'pedal']);
  const remappedNumbers = new Map<string, number>();

  timedDirections
    .slice()
    .sort((left, right) => left.absStart - right.absStart || left.direction.id.localeCompare(right.direction.id))
    .forEach((entry, index) => {
      const absoluteOffset = targetAbsoluteOffset + entry.absStart;
      const timelineEntry = getTimelineEntryForAbsoluteOffset(timeline, absoluteOffset);
      if (!timelineEntry) return;

      const direction = structuredClone(entry.direction);
      direction.id = `paste:${staff.staffIndex}:direction:${direction.kind}:${absoluteOffset}:${index}`;
      direction.measureNumber = timelineEntry.measure.measureNumber;
      direction.staffIndex = staff.staffIndex;
      direction.timestampNum = absoluteOffset - timelineEntry.startOffset;
      direction.timestampDen = Math.max(timelineEntry.divisions * 4, 1);

      if (direction.number != null && spanKinds.has(direction.kind)) {
        const key = `${entry.sourceStaffIndex}:${direction.kind}:${direction.number}`;
        if (!remappedNumbers.has(key)) {
          remappedNumbers.set(key, nextDirectionSpanNumber(document, direction.kind));
        }
        direction.number = remappedNumbers.get(key)!;
      }

      timelineEntry.measure.directions.push(direction);
    });
}

function pasteClipboardSlurs(
  document: ScoreDocumentModel,
  noteSpanners: ScoreClipboardPayload['noteSpanners'],
  identityMap: Map<string, ClipboardEventIdentity>,
) {
  if (noteSpanners.length === 0) return;

  const knownEventIds = buildDocumentEventIdSet(document);
  let nextNumber = document.slurs.length > 0
    ? Math.max(...document.slurs.map((slur) => slur.number).filter(Number.isFinite)) + 1
    : 1;

  noteSpanners.forEach((slur) => {
    const startEventId = slur.startEventId ? identityMap.get(slur.startEventId)?.slurStartEventId : undefined;
    const stopEventId = slur.stopEventId ? identityMap.get(slur.stopEventId)?.slurStopEventId : undefined;
    if (!startEventId || !stopEventId) return;
    if (!knownEventIds.has(startEventId) || !knownEventIds.has(stopEventId)) return;

    document.slurs.push({
      id: `slur:paste:${nextNumber}:${startEventId}:${stopEventId}`,
      number: nextNumber,
      startEventId,
      stopEventId,
      placement: slur.placement,
    });
    nextNumber += 1;
  });
}

function cloneTimedEventWithDuration(
  event: TimedEvent,
  durationDivisions: number,
  divisions: number,
  overrides?: Partial<TimedEvent>,
): TimedEvent {
  const duration = describeDuration(durationDivisions, divisions);
  const clone = structuredClone(event) as TimedEvent;
  clone.durationDivisions = durationDivisions;
  clone.durationType = duration.type;
  clone.isDotted = duration.dotted;
  return {
    ...clone,
    ...overrides,
  } as TimedEvent;
}

function flattenVoiceEventsToAbsoluteTimeline(
  staff: ScoreDocumentModel['score']['parts'][number]['staves'][number],
  voiceId: number,
) {
  const timeline = buildStaffTimeline(staff);
  const events: AbsoluteVoiceEvent[] = [];

  for (const entry of timeline) {
    const voice = entry.measure.voices.find((candidate) => candidate.voiceId === voiceId);
    if (!voice) continue;
    for (const event of voice.events) {
      events.push({
        event: structuredClone(event),
        absStart: entry.startOffset + event.timestampNum,
        divisions: entry.divisions,
      });
    }
  }

  return events.sort((a, b) => (
    a.absStart - b.absStart
    || Number(a.event.isChord) - Number(b.event.isChord)
    || a.event.id.localeCompare(b.event.id)
  ));
}

function dropTrailingRestOnlyMeasures(
  staff: ScoreDocumentModel['score']['parts'][number]['staves'][number],
  events: AbsoluteVoiceEvent[],
) {
  let lastNoteMeasureNumber: number | null = null;
  const timeline = buildStaffTimeline(staff);

  for (const entry of events) {
    if (entry.event.kind !== 'note') continue;
    const timelineEntry = getTimelineEntryForAbsoluteOffset(timeline, entry.absStart);
    if (!timelineEntry) continue;
    lastNoteMeasureNumber = Math.max(lastNoteMeasureNumber ?? timelineEntry.measure.measureNumber, timelineEntry.measure.measureNumber);
  }

  if (lastNoteMeasureNumber == null) return events;

  return events.filter((entry) => {
    if (entry.event.kind !== 'rest') return true;
    const timelineEntry = getTimelineEntryForAbsoluteOffset(timeline, entry.absStart);
    return !timelineEntry || timelineEntry.measure.measureNumber <= lastNoteMeasureNumber;
  });
}

function dropRestOnlyTimelineForOverflowEstimate(
  staff: ScoreDocumentModel['score']['parts'][number]['staves'][number],
  events: AbsoluteVoiceEvent[],
) {
  return events.some((entry) => entry.event.kind === 'note')
    ? dropTrailingRestOnlyMeasures(staff, events)
    : events.filter((entry) => entry.event.kind !== 'rest');
}

function pruneTrailingRestOnlyMeasuresForVoice(
  staff: ScoreDocumentModel['score']['parts'][number]['staves'][number],
  voiceId: number,
  options?: { keepMeasureNumber?: number },
) {
  let lastNoteMeasureNumber: number | null = null;

  for (const measure of staff.measures) {
    const voice = measure.voices.find((entry) => entry.voiceId === voiceId);
    if (voice?.events.some((event) => event.kind === 'note')) {
      lastNoteMeasureNumber = Math.max(lastNoteMeasureNumber ?? measure.measureNumber, measure.measureNumber);
    }
  }

  if (lastNoteMeasureNumber == null) return;

  for (const measure of staff.measures) {
    if (measure.measureNumber <= lastNoteMeasureNumber) continue;
    // A rest value just written in this bar is the user's rhythm, not filler.
    if (measure.measureNumber === options?.keepMeasureNumber) continue;
    // The staff's main voice keeps a whole-bar rest (voice 5 on a left-hand staff); only a
    // secondary voice may disappear from a bar.
    if (voiceId === 1 || voiceId <= Math.min(...measure.voices.map((entry) => entry.voiceId))) {
      const timing = resolveMeasureTiming(staff, measure);
      const voice = getOrCreateVoiceForMeasure(measure, voiceId);
      voice.events = buildRestEventsForSpan(
        measure,
        timing.divisions,
        staff.staffIndex,
        voiceId,
        0,
        timing.durationDivisions,
        timing.durationDivisions,
      );
      continue;
    }
    measure.voices = measure.voices
      .map((voice) => voice.voiceId === voiceId
        ? {
          ...voice,
          events: voice.events.filter((event) => event.kind !== 'rest'),
        }
        : voice)
      .filter((voice) => voice.events.length > 0);
  }
}

function buildRestTimelineFragments(
  entry: AbsoluteVoiceEvent,
  absStart: number,
  durationDivisions: number,
  options?: { splitDotted?: boolean },
) {
  const duration = describeDuration(durationDivisions, entry.divisions);
  const isRepresentable = isRepresentableDuration(durationDivisions, entry.divisions);
  const beatDivisions = Math.max(entry.divisions, 1);
  const localStart = absStart % beatDivisions;
  const crossesBeatBoundary = localStart !== 0 && durationDivisions > beatDivisions - localStart;
  const chunkDurations = (!isRepresentable || crossesBeatBoundary || (options?.splitDotted && duration.dotted))
    ? decomposeDurationDivisions(durationDivisions, entry.divisions, Math.max(1, entry.divisions), absStart)
    : [durationDivisions];
  const fragments: AbsoluteVoiceEvent[] = [];
  let cursor = absStart;

  chunkDurations.forEach((nextDuration, index) => {
    fragments.push({
      event: cloneTimedEventWithDuration(entry.event, nextDuration, entry.divisions, {
        id: `${entry.event.id}:rest-fragment:${absStart}:${index}`,
      }),
      absStart: cursor,
      divisions: entry.divisions,
    });
    cursor += nextDuration;
  });

  return fragments;
}

function estimateAbsoluteInsertTimelineEnd(
  events: AbsoluteVoiceEvent[],
  insertionAbsoluteOffset: number,
  insertedDurationDivisions: number,
  absorbedRestDivisions: number,
) {
  const absorbEnd = insertionAbsoluteOffset + absorbedRestDivisions;
  const shiftByDivisions = Math.max(insertedDurationDivisions - absorbedRestDivisions, 0);

  return events.reduce((max, entry) => {
    const eventEnd = entry.absStart + entry.event.durationDivisions;
    if (
      entry.event.kind === 'rest'
      && !entry.event.isChord
      && eventEnd > insertionAbsoluteOffset
      && entry.absStart < absorbEnd
    ) {
      const leadingDuration = Math.max(0, insertionAbsoluteOffset - entry.absStart);
      const trailingDuration = Math.max(0, eventEnd - absorbEnd);
      if (leadingDuration > 0) {
        max = Math.max(max, entry.absStart + leadingDuration);
      }
      if (trailingDuration > 0) {
        max = Math.max(max, absorbEnd + trailingDuration);
      }
      return max;
    }
    if (entry.absStart >= absorbEnd) {
      return Math.max(max, eventEnd + shiftByDivisions);
    }
    if (!entry.event.isChord && eventEnd > insertionAbsoluteOffset) {
      return Math.max(max, insertionAbsoluteOffset + shiftByDivisions + (eventEnd - insertionAbsoluteOffset));
    }
    return Math.max(max, eventEnd);
  }, insertionAbsoluteOffset + insertedDurationDivisions);
}

function computeContiguousRestAbsorption(
  events: AbsoluteVoiceEvent[],
  insertionAbsoluteOffset: number,
  requestedDurationDivisions: number,
) {
  let cursor = insertionAbsoluteOffset;
  let remaining = Math.max(requestedDurationDivisions, 0);

  for (const entry of events) {
    if (remaining <= 0) break;
    if (entry.event.isChord || entry.event.kind !== 'rest') {
      if (entry.absStart <= cursor && entry.absStart + entry.event.durationDivisions > cursor) break;
      if (entry.absStart === cursor) break;
      continue;
    }

    const eventEnd = entry.absStart + entry.event.durationDivisions;
    if (eventEnd <= cursor) continue;
    if (entry.absStart > cursor) break;

    const available = eventEnd - cursor;
    if (available <= 0) continue;

    const absorbed = Math.min(remaining, available);
    cursor += absorbed;
    remaining -= absorbed;
  }

  return Math.max(requestedDurationDivisions - remaining, 0);
}

/**
 * A new bar holds a whole-bar rest in the staff's first voice. An empty <measure> has no duration
 * and nothing to select or enter into.
 */
function buildAppendedBar(
  staff: ScoreDocumentModel['score']['parts'][number]['staves'][number],
  reference: ScoreDocumentModel['score']['parts'][number]['staves'][number]['measures'][number],
  measureNumber: number,
) {
  const inserted = cloneMeasureForInsertion(reference, measureNumber);
  const timing = resolveMeasureTiming(staff, reference);
  const firstVoice = [...inserted.voices].sort((a, b) => a.voiceId - b.voiceId)[0];
  if (firstVoice) {
    firstVoice.events = buildRestEventsForSpan(
      inserted,
      timing.divisions,
      staff.staffIndex,
      firstVoice.voiceId,
      0,
      timing.durationDivisions,
      timing.durationDivisions,
    );
    inserted.voices = [firstVoice];
  }
  return inserted;
}

function ensureStaffTimelineDuration(
  document: ScoreDocumentModel,
  partId: string,
  staffIndex: number,
  minimumDurationDivisions: number,
) {
  while (true) {
    const part = document.score.parts.find((entry) => entry.id === partId) ?? null;
    const staff = part?.staves.find((entry) => entry.staffIndex === staffIndex) ?? null;
    if (!part || !staff) return;

    const totalDuration = buildStaffTimeline(staff)
      .reduce((sum, entry) => sum + entry.durationDivisions, 0);
    if (totalDuration >= minimumDurationDivisions) return;

    document.score.parts.forEach((candidatePart) => {
      candidatePart.staves.forEach((candidateStaff) => {
        const reference = candidateStaff.measures[candidateStaff.measures.length - 1];
        if (!reference) return;
        candidateStaff.measures.push(buildAppendedBar(candidateStaff, reference, reference.measureNumber + 1));
      });
    });
    renumberMeasures(document);
  }
}

function buildInsertedOverflowFragments(
  staff: ScoreDocumentModel['score']['parts'][number]['staves'][number],
  command: Extract<ValidatedScoreCommand, { type: 'insertNoteAt' | 'insertRestAt' }>,
  insertionAbsoluteOffset: number,
  requestedDurationDivisions: number,
) {
  const timeline = buildStaffTimeline(staff);
  const inserted: AbsoluteVoiceEvent[] = [];
  let cursor = insertionAbsoluteOffset;
  let remaining = requestedDurationDivisions;
  let fragmentIndex = 0;

  while (remaining > 0) {
    const entry = getTimelineEntryForAbsoluteOffset(timeline, cursor);
    if (!entry) break;
    const localOffset = cursor - entry.startOffset;
    const available = Math.max(1, entry.durationDivisions - localOffset);
    const fragmentDuration = Math.min(remaining, available);
    const duration = describeDuration(fragmentDuration, entry.divisions);
    const tieStart = command.type === 'insertNoteAt' && remaining > fragmentDuration;
    const guitar = 'guitar' in command && command.guitar
      ? structuredClone(command.guitar) as Extract<TimedEvent, { kind: 'note' }>['guitar']
      : undefined;
    const common = {
      id: `${entry.measure.id}:event:${command.voiceId}:${localOffset}:overflow:${fragmentIndex}`,
      measureNumber: entry.measure.measureNumber,
      staffIndex: command.staffIndex,
      voiceId: command.voiceId,
      timestampNum: localOffset,
      timestampDen: Math.max(entry.divisions * 4, 1),
      durationDivisions: fragmentDuration,
      durationType: duration.type,
      isDotted: duration.dotted,
      isChord: Boolean('asChord' in command && command.asChord),
      notehead: 'notehead' in command && command.notehead === 'slash' ? 'slash' as const : undefined,
      stem: 'stem' in command && command.stem === 'none' ? 'none' as const : undefined,
      articulations: [],
      tieStart,
      lyrics: [],
    };

    const event: TimedEvent = command.type === 'insertNoteAt'
      ? {
        ...common,
        kind: 'note',
        pitch: {
          step: command.step,
          alter: command.alter,
          octave: command.octave,
        },
        writtenAccidental: fragmentIndex === 0 ? command.writtenAccidental : undefined,
        guitar,
      }
      : {
        ...common,
        kind: 'rest',
      };

    inserted.push({
      event,
      absStart: cursor,
      divisions: entry.divisions,
    });
    cursor += fragmentDuration;
    remaining -= fragmentDuration;
    fragmentIndex += 1;
  }

  return inserted;
}

function buildTupletEventIdSet(document: ScoreDocumentModel) {
  return new Set(document.tuplets.flatMap((tuplet) => tuplet.eventIds));
}

function buildTimelineFragmentsForEvent(
  staff: ScoreDocumentModel['score']['parts'][number]['staves'][number],
  entry: AbsoluteVoiceEvent,
  fragmentIdMap: EventFragmentIdentityMap,
  splitUnrepresentable = false,
) {
  const timeline = buildStaffTimeline(staff);
  const fragments: AbsoluteVoiceEvent[] = [];
  let cursor = entry.absStart;
  let remaining = Math.max(0, entry.event.durationDivisions);
  let fragmentIndex = 0;
  const fragmentIds: string[] = [];

  while (remaining > 0) {
    const timelineEntry = getTimelineEntryForAbsoluteOffset(timeline, cursor);
    if (!timelineEntry) break;
    const localOffset = cursor - timelineEntry.startOffset;
    const available = Math.max(1, timelineEntry.durationDivisions - localOffset);
    const availableDuration = Math.min(remaining, available);
    const fragmentDuration = splitUnrepresentable && !isRepresentableDuration(availableDuration, timelineEntry.divisions)
      ? decomposeDurationDivisions(availableDuration, timelineEntry.divisions, 0, localOffset)[0]!
      : availableDuration;
    const isFirst = fragmentIndex === 0;
    const hasNextFragment = remaining > fragmentDuration;
    const fragmentId = isFirst ? entry.event.id : `${entry.event.id}:fragment:${fragmentIndex}`;
    const overrides: Partial<TimedEvent> = {
      id: fragmentId,
      articulations: isFirst ? [...(entry.event.articulations ?? [])] : [],
      articulationPlacements: isFirst ? structuredClone(entry.event.articulationPlacements) : undefined,
      lyrics: isFirst ? structuredClone(entry.event.lyrics ?? []) : [],
      preservedXml: isFirst ? structuredClone(entry.event.preservedXml) : undefined,
    };

    if (entry.event.kind === 'note') {
      overrides.tieStart = hasNextFragment ? true : Boolean(entry.event.tieStart);
    } else {
      overrides.tieStart = false;
    }

    fragments.push({
      event: cloneTimedEventWithDuration(entry.event, fragmentDuration, timelineEntry.divisions, overrides),
      absStart: cursor,
      divisions: timelineEntry.divisions,
    });
    fragmentIds.push(fragmentId);
    cursor += fragmentDuration;
    remaining -= fragmentDuration;
    fragmentIndex += 1;
  }

  if (fragmentIds.length > 1) {
    fragmentIdMap.set(entry.event.id, {
      firstFragmentId: fragmentIds[0]!,
      lastFragmentId: fragmentIds[fragmentIds.length - 1]!,
      fragmentIds,
    });
  }

  return fragments.length > 0 ? fragments : [entry];
}

function repairIdentitySpans(
  document: ScoreDocumentModel,
  fragmentIdMap: EventFragmentIdentityMap,
) {
  if (fragmentIdMap.size === 0) return;

  document.slurs = document.slurs
    .map((slur) => ({
      ...slur,
      startEventId: slur.startEventId ? fragmentIdMap.get(slur.startEventId)?.firstFragmentId ?? slur.startEventId : slur.startEventId,
      stopEventId: slur.stopEventId ? fragmentIdMap.get(slur.stopEventId)?.lastFragmentId ?? slur.stopEventId : slur.stopEventId,
    }));

  document.graceNotes = document.graceNotes
    .map((graceNote) => ({
      ...graceNote,
      eventId: fragmentIdMap.get(graceNote.eventId)?.firstFragmentId ?? graceNote.eventId,
    }));

  document.lyricLines = document.lyricLines
    .map((line) => ({
      ...line,
      eventId: fragmentIdMap.get(line.eventId)?.firstFragmentId ?? line.eventId,
    }));

  document.chordGroups = document.chordGroups
    .map((group) => ({
      ...group,
      eventIds: group.eventIds.map((eventId) => fragmentIdMap.get(eventId)?.firstFragmentId ?? eventId),
    }));
}

function remapCollapsedEventReferences(
  document: ScoreDocumentModel,
  eventIdMap: Map<string, string>,
) {
  if (eventIdMap.size === 0) return;

  document.slurs = document.slurs
    .map((slur) => ({
      ...slur,
      startEventId: slur.startEventId ? eventIdMap.get(slur.startEventId) ?? slur.startEventId : slur.startEventId,
      stopEventId: slur.stopEventId ? eventIdMap.get(slur.stopEventId) ?? slur.stopEventId : slur.stopEventId,
    }));

  document.graceNotes = document.graceNotes
    .map((graceNote) => ({
      ...graceNote,
      eventId: eventIdMap.get(graceNote.eventId) ?? graceNote.eventId,
    }));

  document.lyricLines = document.lyricLines
    .map((line) => ({
      ...line,
      eventId: eventIdMap.get(line.eventId) ?? line.eventId,
    }));

  document.chordGroups = document.chordGroups
    .map((group) => ({
      ...group,
      eventIds: [...new Set(group.eventIds.map((eventId) => eventIdMap.get(eventId) ?? eventId))],
    }))
    .filter((group) => group.eventIds.length > 1);

  document.tuplets = document.tuplets
    .map((tuplet) => ({
      ...tuplet,
      eventIds: [...new Set(tuplet.eventIds.map((eventId) => eventIdMap.get(eventId) ?? eventId))],
    }));
}

function removeDeletedEventReferences(
  document: ScoreDocumentModel,
  deletedEventIds: Set<string>,
) {
  if (deletedEventIds.size === 0) return;

  document.slurs = document.slurs.filter((slur) => (
    !slur.startEventId
    || !slur.stopEventId
    || (!deletedEventIds.has(slur.startEventId) && !deletedEventIds.has(slur.stopEventId))
  ));
  document.graceNotes = document.graceNotes.filter((graceNote) => !deletedEventIds.has(graceNote.eventId));
  document.lyricLines = document.lyricLines.filter((line) => !deletedEventIds.has(line.eventId));
  document.chordGroups = document.chordGroups
    .map((group) => ({
      ...group,
      eventIds: group.eventIds.filter((eventId) => !deletedEventIds.has(eventId)),
    }))
    .filter((group) => group.eventIds.length > 1);
  document.tuplets = document.tuplets
    .filter((tuplet) => !tuplet.eventIds.some((eventId) => deletedEventIds.has(eventId)));
}

type TieContinuityEventRef = {
  event: TimedEvent;
  measureNumber: number;
  staffIndex: number;
  voiceId: number;
  partId: string;
};

function compareTieContinuityRefs(left: TieContinuityEventRef, right: TieContinuityEventRef) {
  return left.measureNumber - right.measureNumber
    || left.event.timestampNum - right.event.timestampNum
    || left.event.timestampDen - right.event.timestampDen
    || Number(left.event.isChord) - Number(right.event.isChord)
    || left.event.id.localeCompare(right.event.id);
}

function sameTiePitch(left: TimedEvent | null | undefined, right: TimedEvent | null | undefined) {
  return left?.kind === 'note'
    && right?.kind === 'note'
    && left.pitch.step === right.pitch.step
    && left.pitch.alter === right.pitch.alter
    && left.pitch.octave === right.pitch.octave;
}

function hasIncomingTie(staff: ScoreDocumentModel['score']['parts'][number]['staves'][number], voiceId: number, targets: TimedEvent[]) {
  const events = staff.measures.flatMap(measure => measure.voices.filter(voice => voice.voiceId === voiceId).flatMap(voice => voice.events))
    .filter(event => event.durationDivisions > 0)
    .sort((a, b) => a.measureNumber - b.measureNumber || a.timestampNum / a.timestampDen - b.timestampNum / b.timestampDen);
  return targets.some(target => {
    if (target.kind !== 'note') return false;
    const earlier = events.filter(event => event.measureNumber < target.measureNumber || (event.measureNumber === target.measureNumber && event.timestampNum / event.timestampDen < target.timestampNum / target.timestampDen));
    const previous = earlier.at(-1);
    return previous && earlier.some(event => event.measureNumber === previous.measureNumber
      && timestampsEqual(event.timestampNum, event.timestampDen, previous.timestampNum, previous.timestampDen)
      && event.tieStart && sameTiePitch(event, target));
  });
}

function tieContinuesAtNextCoreOnset(refs: TieContinuityEventRef[], current: TieContinuityEventRef) {
  if (current.event.kind !== 'note') return false;
  const laterNotes = refs
    .filter((ref) => (
      ref.event.kind === 'note'
      && compareTieContinuityRefs(ref, current) > 0
      && (
        ref.measureNumber !== current.measureNumber
        || !timestampsEqual(
          ref.event.timestampNum,
          ref.event.timestampDen,
          current.event.timestampNum,
          current.event.timestampDen,
        )
      )
    ))
    .sort(compareTieContinuityRefs);
  const next = laterNotes[0];
  if (!next) return false;
  return laterNotes
    .filter((ref) => (
      ref.measureNumber === next.measureNumber
      && ref.event.timestampNum === next.event.timestampNum
      && ref.event.timestampDen === next.event.timestampDen
    ))
    .some((ref) => sameTiePitch(current.event, ref.event));
}

function pruneDanglingTieStarts(document: ScoreDocumentModel) {
  const byVoice = new Map<string, TieContinuityEventRef[]>();

  for (const part of document.score.parts) {
    for (const staff of part.staves) {
      for (const measure of staff.measures) {
        for (const voice of measure.voices) {
          const key = `${part.id}:${staff.staffIndex}:${voice.voiceId}`;
          const refs = byVoice.get(key) ?? [];
          for (const event of voice.events) {
            refs.push({
              event,
              measureNumber: measure.measureNumber,
              staffIndex: staff.staffIndex,
              voiceId: voice.voiceId,
              partId: part.id,
            });
          }
          byVoice.set(key, refs);
        }
      }
    }
  }

  for (const refs of byVoice.values()) {
    const ordered = refs.sort(compareTieContinuityRefs);
    for (const ref of ordered) {
      if (ref.event.kind !== 'note') {
        ref.event.tieStart = false;
        continue;
      }
      if (ref.event.tieStart && !tieContinuesAtNextCoreOnset(ordered, ref)) {
        ref.event.tieStart = false;
      }
    }
  }
}

function normalizeVoiceTimelineAcrossMeasures(
  document: ScoreDocumentModel,
  staff: ScoreDocumentModel['score']['parts'][number]['staves'][number],
  voiceId: number,
  input: {
    startMeasureNumber: number;
    endMeasureNumber: number;
  },
) {
  const timeline = buildStaffTimeline(staff);
  const tupletEventIds = buildTupletEventIdSet(document);
  const fragmentIdMap: EventFragmentIdentityMap = new Map();
  let changed = false;

  const nextEvents = flattenVoiceEventsToAbsoluteTimeline(staff, voiceId)
    .flatMap((entry) => {
      const timelineEntry = getTimelineEntryForAbsoluteOffset(timeline, entry.absStart);
      if (!timelineEntry) return [entry];
      if (
        timelineEntry.measure.measureNumber < input.startMeasureNumber
        || timelineEntry.measure.measureNumber > input.endMeasureNumber
      ) {
        return [entry];
      }

      const localOffset = entry.absStart - timelineEntry.startOffset;
      const localEnd = localOffset + entry.event.durationDivisions;
      if (localEnd <= timelineEntry.durationDivisions) return [entry];

      if (tupletEventIds.has(entry.event.id)) {
        return [entry];
      }

      changed = true;
      return buildTimelineFragmentsForEvent(staff, entry, fragmentIdMap);
    });

  if (!changed) return { changed: false, fragmentIdMap };

  rewriteVoiceFromAbsoluteTimeline(staff, voiceId, nextEvents);
  repairIdentitySpans(document, fragmentIdMap);

  return { changed: true, fragmentIdMap };
}

function rewriteTimedDirectionsAfterAbsoluteInsert(
  staff: ScoreDocumentModel['score']['parts'][number]['staves'][number],
  insertionAbsoluteOffset: number,
  insertedDurationDivisions: number,
  absorbedRestDivisions: number,
) {
  const shiftByDivisions = Math.max(insertedDurationDivisions - absorbedRestDivisions, 0);
  if (shiftByDivisions <= 0) return;

  const absorbEnd = insertionAbsoluteOffset + absorbedRestDivisions;
  const timeline = buildStaffTimeline(staff);
  const timedDirectionKinds = new Set(['wedge', 'octave-shift', 'pedal', 'dynamics']);
  const updates: Array<{
    sourceMeasureId: string;
    targetMeasureId: string;
    directionId: string;
    measureNumber: number;
    timestampNum: number;
    timestampDen: number;
  }> = [];

  for (const entry of timeline) {
    for (const direction of [...entry.measure.directions]) {
      if (!timedDirectionKinds.has(direction.kind)) continue;
      if (direction.staffIndex != null && direction.staffIndex !== staff.staffIndex) continue;

      const localOffset = direction.timestampNum ?? 0;
      const absoluteOffset = entry.startOffset + localOffset;
      if (absoluteOffset < absorbEnd) continue;

      const nextAbsoluteOffset = absoluteOffset + shiftByDivisions;
      const nextEntry = getTimelineEntryForAbsoluteOffset(timeline, nextAbsoluteOffset);
      if (!nextEntry) continue;

      updates.push({
        sourceMeasureId: entry.measure.id,
        targetMeasureId: nextEntry.measure.id,
        directionId: direction.id,
        measureNumber: nextEntry.measure.measureNumber,
        timestampNum: nextAbsoluteOffset - nextEntry.startOffset,
        timestampDen: Math.max(nextEntry.divisions * 4, 1),
      });
    }
  }

  for (const update of updates) {
    const sourceEntry = timeline.find((entry) => entry.measure.id === update.sourceMeasureId);
    const targetEntry = timeline.find((entry) => entry.measure.id === update.targetMeasureId);
    const direction = sourceEntry?.measure.directions.find((candidate) => candidate.id === update.directionId);
    if (!sourceEntry || !targetEntry || !direction) continue;
    direction.measureNumber = update.measureNumber;
    direction.timestampNum = update.timestampNum;
    direction.timestampDen = update.timestampDen;
    if (sourceEntry.measure.id !== targetEntry.measure.id) {
      sourceEntry.measure.directions = sourceEntry.measure.directions.filter((candidate) => candidate.id !== direction.id);
      targetEntry.measure.directions.push(direction);
    }
  }
}

function rewriteTimedDirectionsAfterAbsoluteDelete(
  staff: ScoreDocumentModel['score']['parts'][number]['staves'][number],
  removedIntervals: Array<{ start: number; end: number }>,
) {
  if (removedIntervals.length === 0) return;

  const timeline = buildStaffTimeline(staff);
  const timedDirectionKinds = new Set(['wedge', 'octave-shift', 'pedal', 'dynamics']);
  const updates: Array<{
    sourceMeasureId: string;
    targetMeasureId: string;
    directionId: string;
    measureNumber: number;
    timestampNum: number;
    timestampDen: number;
  }> = [];

  const removedDurationBefore = (absOffset: number) => removedIntervals.reduce((sum, interval) => {
    if (absOffset <= interval.start) return sum;
    return sum + Math.max(0, Math.min(absOffset, interval.end) - interval.start);
  }, 0);

  for (const entry of timeline) {
    for (const direction of [...entry.measure.directions]) {
      if (!timedDirectionKinds.has(direction.kind)) continue;
      if (direction.staffIndex != null && direction.staffIndex !== staff.staffIndex) continue;

      const localOffset = direction.timestampNum ?? 0;
      const absoluteOffset = entry.startOffset + localOffset;
      const nextAbsoluteOffset = absoluteOffset - removedDurationBefore(absoluteOffset);
      const nextEntry = getTimelineEntryForAbsoluteOffset(timeline, nextAbsoluteOffset);
      if (!nextEntry) continue;

      updates.push({
        sourceMeasureId: entry.measure.id,
        targetMeasureId: nextEntry.measure.id,
        directionId: direction.id,
        measureNumber: nextEntry.measure.measureNumber,
        timestampNum: nextAbsoluteOffset - nextEntry.startOffset,
        timestampDen: Math.max(nextEntry.divisions * 4, 1),
      });
    }
  }

  for (const update of updates) {
    const sourceEntry = timeline.find((entry) => entry.measure.id === update.sourceMeasureId);
    const targetEntry = timeline.find((entry) => entry.measure.id === update.targetMeasureId);
    const direction = sourceEntry?.measure.directions.find((candidate) => candidate.id === update.directionId);
    if (!sourceEntry || !targetEntry || !direction) continue;
    direction.measureNumber = update.measureNumber;
    direction.timestampNum = update.timestampNum;
    direction.timestampDen = update.timestampDen;
    if (sourceEntry.measure.id !== targetEntry.measure.id) {
      sourceEntry.measure.directions = sourceEntry.measure.directions.filter((candidate) => candidate.id !== direction.id);
      targetEntry.measure.directions.push(direction);
    }
  }
}

function transformAbsoluteInsertTimelineEvents(
  events: AbsoluteVoiceEvent[],
  insertionAbsoluteOffset: number,
  insertedDurationDivisions: number,
  absorbedRestDivisions: number,
  options?: { splitDottedRestFragments?: boolean },
) {
  const absorbEnd = insertionAbsoluteOffset + absorbedRestDivisions;
  const shiftByDivisions = Math.max(insertedDurationDivisions - absorbedRestDivisions, 0);
  const transformed: AbsoluteVoiceEvent[] = [];

  for (const entry of events) {
    const eventEnd = entry.absStart + entry.event.durationDivisions;

    if (
      entry.event.kind === 'rest'
      && !entry.event.isChord
      && eventEnd > insertionAbsoluteOffset
      && entry.absStart < absorbEnd
    ) {
      const leadingDuration = Math.max(0, insertionAbsoluteOffset - entry.absStart);
      const trailingDuration = Math.max(0, eventEnd - absorbEnd);

      if (leadingDuration > 0) {
        transformed.push(...buildRestTimelineFragments(entry, entry.absStart, leadingDuration, {
          splitDotted: options?.splitDottedRestFragments,
        }));
      }

      if (trailingDuration > 0) {
        transformed.push(...buildRestTimelineFragments(entry, absorbEnd, trailingDuration, {
          splitDotted: options?.splitDottedRestFragments,
        }));
      }
      continue;
    }

    if (entry.absStart >= absorbEnd) {
      transformed.push({
        event: structuredClone(entry.event),
        absStart: entry.absStart + shiftByDivisions,
        divisions: entry.divisions,
      });
      continue;
    }

    if (!entry.event.isChord && eventEnd > insertionAbsoluteOffset) {
      const leadingDuration = insertionAbsoluteOffset - entry.absStart;
      const trailingDuration = eventEnd - insertionAbsoluteOffset;

      if (leadingDuration > 0) {
        transformed.push({
          event: cloneTimedEventWithDuration(
            entry.event,
            leadingDuration,
            entry.divisions,
            entry.event.kind === 'note'
              ? { tieStart: shiftByDivisions === 0 && trailingDuration > 0 }
              : undefined,
          ),
          absStart: entry.absStart,
          divisions: entry.divisions,
        });
      }

      if (trailingDuration > 0) {
        transformed.push({
          event: cloneTimedEventWithDuration(entry.event, trailingDuration, entry.divisions, {
            articulations: [],
            lyrics: [],
            preservedXml: undefined,
            tieStart: entry.event.kind === 'note' ? Boolean(entry.event.tieStart) : false,
          }),
          absStart: insertionAbsoluteOffset + shiftByDivisions,
          divisions: entry.divisions,
        });
      }
      continue;
    }

    transformed.push({
      event: structuredClone(entry.event),
      absStart: entry.absStart,
      divisions: entry.divisions,
    });
  }

  return transformed.sort((a, b) => (
    a.absStart - b.absStart
    || Number(a.event.isChord) - Number(b.event.isChord)
    || a.event.id.localeCompare(b.event.id)
  ));
}

function rewriteVoiceFromAbsoluteTimeline(
  staff: ScoreDocumentModel['score']['parts'][number]['staves'][number],
  voiceId: number,
  absoluteEvents: AbsoluteVoiceEvent[],
) {
  const timeline = buildStaffTimeline(staff);

  for (const entry of timeline) {
    const existing = entry.measure.voices.find((voice) => voice.voiceId === voiceId);
    if (existing) existing.events = [];
  }

  for (const absoluteEvent of absoluteEvents) {
    const timelineEntry = getTimelineEntryForAbsoluteOffset(timeline, absoluteEvent.absStart);
    if (!timelineEntry) continue;

    const localOffset = absoluteEvent.absStart - timelineEntry.startOffset;
    const voice = getOrCreateVoiceForMeasure(timelineEntry.measure, voiceId);
    const event = structuredClone(absoluteEvent.event);
    event.measureNumber = timelineEntry.measure.measureNumber;
    event.staffIndex = staff.staffIndex;
    event.voiceId = voiceId;
    event.timestampNum = localOffset;
    event.timestampDen = Math.max(timelineEntry.divisions * 4, 1);
    voice.events.push(event);
  }

  for (const entry of timeline) {
    const voice = getOrCreateVoiceForMeasure(entry.measure, voiceId);
    voice.events.sort((a, b) => (
      a.timestampNum - b.timestampNum
      || Number(a.isChord) - Number(b.isChord)
      || a.id.localeCompare(b.id)
    ));
  }
}

function snapshotStaffForTimeSignatureRebar(
  partId: string,
  staff: ScoreDocumentModel['score']['parts'][number]['staves'][number],
): TimeSignatureRebarSnapshot {
  const voiceIds = new Set<number>(
    staff.measures.flatMap((measure) => measure.voices.map((voice) => voice.voiceId)),
  );
  const timeline = buildStaffTimeline(staff);
  const directions = timeline.flatMap((entry) => entry.measure.directions.map((direction) => ({
    direction: structuredClone(direction),
    absStart: entry.startOffset + Math.max(0, direction.timestampNum ?? 0),
  })));
  const voices = [...voiceIds].map((voiceId) => ({
    voiceId,
    events: flattenVoiceEventsToAbsoluteTimeline(staff, voiceId),
  }));
  const minimumDurationDivisions = voices.reduce((maximum, voice) => (
    Math.max(
      maximum,
      ...voice.events.map((entry) => entry.absStart + entry.event.durationDivisions),
    )
  ), timeline.reduce((sum, entry) => sum + entry.durationDivisions, 0));

  return {
    partId,
    staffIndex: staff.staffIndex,
    voices,
    directions,
    minimumDurationDivisions,
  };
}

function rewriteTimedDirectionsFromAbsoluteTimeline(
  staff: ScoreDocumentModel['score']['parts'][number]['staves'][number],
  directions: AbsoluteTimedDirection[],
) {
  const timeline = buildStaffTimeline(staff);
  timeline.forEach((entry) => {
    entry.measure.directions = [];
  });

  directions.forEach((absoluteDirection) => {
    const timelineEntry = getTimelineEntryForAbsoluteOffset(timeline, absoluteDirection.absStart);
    if (!timelineEntry) return;
    const direction = structuredClone(absoluteDirection.direction);
    direction.measureNumber = timelineEntry.measure.measureNumber;
    direction.staffIndex = staff.staffIndex;
    direction.timestampNum = absoluteDirection.absStart - timelineEntry.startOffset;
    direction.timestampDen = Math.max(timelineEntry.divisions * 4, 1);
    timelineEntry.measure.directions.push(direction);
  });
}

function rebarTimeSignatureSnapshots(
  document: ScoreDocumentModel,
  snapshots: TimeSignatureRebarSnapshot[],
) {
  snapshots.forEach((snapshot) => {
    ensureStaffTimelineDuration(
      document,
      snapshot.partId,
      snapshot.staffIndex,
      snapshot.minimumDurationDivisions,
    );

    const part = document.score.parts.find((entry) => entry.id === snapshot.partId);
    const staff = part?.staves.find((entry) => entry.staffIndex === snapshot.staffIndex);
    if (!staff) return;

    snapshot.voices.forEach(({ voiceId, events }) => {
      rewriteVoiceFromAbsoluteTimeline(staff, voiceId, events);
      const firstMeasureNumber = staff.measures[0]?.measureNumber ?? 1;
      const lastMeasureNumber = staff.measures.at(-1)?.measureNumber ?? firstMeasureNumber;
      normalizeVoiceTimelineAcrossMeasures(document, staff, voiceId, {
        startMeasureNumber: firstMeasureNumber,
        endMeasureNumber: lastMeasureNumber,
      });
      fillVoiceTimelineGaps(staff, voiceId, {
        startMeasureNumber: firstMeasureNumber,
        endMeasureNumber: lastMeasureNumber,
      });
    });

    rewriteTimedDirectionsFromAbsoluteTimeline(staff, snapshot.directions);
  });
}

function remapSelectionRemapTargets(
  selectionRemap: SelectionRemap,
  eventIdMap: Map<string, string>,
) {
  if (eventIdMap.size === 0) return selectionRemap;

  const remapTarget = (eventId: string) => {
    let nextEventId = eventId;
    const seen = new Set<string>();
    while (eventIdMap.has(nextEventId) && !seen.has(nextEventId)) {
      seen.add(nextEventId);
      nextEventId = eventIdMap.get(nextEventId)!;
    }
    return nextEventId;
  };

  return Object.fromEntries(
    Object.entries(selectionRemap).map(([oldEventId, nextEventId]) => [oldEventId, remapTarget(nextEventId)]),
  );
}

function mergeSelectionRemaps(
  base: SelectionRemap,
  next: SelectionRemap,
) {
  const merged: SelectionRemap = { ...base };

  Object.entries(merged).forEach(([oldEventId, nextEventId]) => {
    if (next[nextEventId]) {
      merged[oldEventId] = next[nextEventId]!;
    }
  });

  Object.entries(next).forEach(([oldEventId, nextEventId]) => {
    merged[oldEventId] = nextEventId;
  });

  return merged;
}


function collapseTiedFragmentsAcrossMeasures(
  document: ScoreDocumentModel,
  staff: ScoreDocumentModel['score']['parts'][number]['staves'][number],
  voiceId: number,
  selectionRemap: SelectionRemap,
  /** Limit the merge to tied pairs inside this span; music outside it keeps its spelling. */
  range?: { startAbs: number; endAbs: number },
) {
  const timeline = buildStaffTimeline(staff);
  const tupletEventIds = buildTupletEventIdSet(document);
  const collapsedIdMap = new Map<string, string>();
  const flattened = dropTrailingRestOnlyMeasures(staff, flattenVoiceEventsToAbsoluteTimeline(staff, voiceId));
  const collapsed: AbsoluteVoiceEvent[] = [];
  let changed = false;

  const hasForeignAttachments = (event: TimedEvent) => (
    (event.articulations?.length ?? 0) > 0
    || (event.lyrics?.length ?? 0) > 0
    || Boolean(event.preservedXml?.beforePitch?.length)
    || Boolean(event.preservedXml?.afterType?.length)
    || Boolean(event.preservedXml?.notationChildren?.length)
  );

  // Onsets that carry chord tones. A tied pair is one note written twice only when neither side is a
  // chord: merging the principal notes would leave the chord tones of the second onset without their
  // note, as separate events in an overfull bar (F24).
  const chordOnsets = new Set(flattened.filter((entry) => entry.event.isChord).map((entry) => entry.absStart));

  for (const entry of flattened) {
    const previous = collapsed[collapsed.length - 1];
    const previousTimelineEntry = previous ? getTimelineEntryForAbsoluteOffset(timeline, previous.absStart) : null;
    const mergedDuration = previous ? previous.event.durationDivisions + entry.event.durationDivisions : 0;
    const availableInMeasure = previous && previousTimelineEntry
      ? previousTimelineEntry.startOffset + previousTimelineEntry.durationDivisions - previous.absStart
      : 0;

    const canCollapse = Boolean(
      previous
      && previous.event.kind === 'note'
      && entry.event.kind === 'note'
      && !previous.event.isChord
      && !entry.event.isChord
      && previous.event.voiceId === entry.event.voiceId
      && previous.event.pitch.step === entry.event.pitch.step
      && previous.event.pitch.alter === entry.event.pitch.alter
      && previous.event.pitch.octave === entry.event.pitch.octave
      && previous.event.tieStart
      && previous.absStart + previous.event.durationDivisions === entry.absStart
      && !chordOnsets.has(previous.absStart)
      && !chordOnsets.has(entry.absStart)
      && (!range || (previous.absStart >= range.startAbs && entry.absStart < range.endAbs))
      && !tupletEventIds.has(previous.event.id)
      && !tupletEventIds.has(entry.event.id)
      && !hasForeignAttachments(entry.event)
      && mergedDuration <= availableInMeasure
      && isRepresentableDuration(mergedDuration, previousTimelineEntry?.divisions ?? previous.divisions)
    );

    if (!canCollapse || !previous) {
      collapsed.push({
        event: structuredClone(entry.event),
        absStart: entry.absStart,
        divisions: entry.divisions,
      });
      continue;
    }

    previous.event = cloneTimedEventWithDuration(
      previous.event,
      mergedDuration,
      previousTimelineEntry?.divisions ?? previous.divisions,
      { tieStart: Boolean(entry.event.tieStart) },
    );
    collapsedIdMap.set(entry.event.id, previous.event.id);
    changed = true;
  }

  if (!changed) return selectionRemap;

  rewriteVoiceFromAbsoluteTimeline(staff, voiceId, collapsed);
  // The flattened timeline leaves out trailing bars that hold only rests; give them their rests back.
  const firstMeasureNumber = staff.measures[0]?.measureNumber ?? 1;
  fillVoiceTimelineGaps(staff, voiceId, {
    startMeasureNumber: firstMeasureNumber,
    endMeasureNumber: staff.measures[staff.measures.length - 1]?.measureNumber ?? firstMeasureNumber,
  });
  remapCollapsedEventReferences(document, collapsedIdMap);
  return remapSelectionRemapTargets(selectionRemap, collapsedIdMap);
}

function removeAndPullVoiceTimeline(
  document: ScoreDocumentModel,
  staff: ScoreDocumentModel['score']['parts'][number]['staves'][number],
  voiceId: number,
  eventIdsToRemove: string[],
) {
  const removedEventIds = new Set(eventIdsToRemove);
  if (removedEventIds.size === 0) return { selectionRemap: {} as SelectionRemap };

  const flattened = dropTrailingRestOnlyMeasures(staff, flattenVoiceEventsToAbsoluteTimeline(staff, voiceId));
  const removedEntries = flattened.filter((entry) => removedEventIds.has(entry.event.id));
  if (removedEntries.length === 0) return { selectionRemap: {} as SelectionRemap };

  const removedIntervals = removedEntries
    .map((entry) => ({
      start: entry.absStart,
      end: entry.absStart + entry.event.durationDivisions,
    }))
    .sort((left, right) => left.start - right.start || left.end - right.end)
    .reduce<Array<{ start: number; end: number }>>((merged, interval) => {
      const previous = merged[merged.length - 1];
      if (!previous || interval.start > previous.end) {
        merged.push({ ...interval });
        return merged;
      }
      previous.end = Math.max(previous.end, interval.end);
      return merged;
    }, []);

  const removedDurationBefore = (absOffset: number) => removedIntervals.reduce((sum, interval) => {
    if (absOffset <= interval.start) return sum;
    return sum + Math.max(0, Math.min(absOffset, interval.end) - interval.start);
  }, 0);

  const selectionRemap: SelectionRemap = {};
  removedEntries.forEach((entry, index) => {
    const currentIndex = flattened.findIndex((candidate) => candidate.event.id === entry.event.id);
    const successor = flattened.slice(currentIndex + 1).find((candidate) => !removedEventIds.has(candidate.event.id));
    const predecessor = [...flattened.slice(0, currentIndex)].reverse().find((candidate) => !removedEventIds.has(candidate.event.id));
    const remapTarget = successor?.event.id ?? predecessor?.event.id ?? null;
    if (remapTarget) {
      selectionRemap[entry.event.id] = remapTarget;
    } else if (index === 0) {
      delete selectionRemap[entry.event.id];
    }
  });

  const nextEvents = flattened
    .filter((entry) => !removedEventIds.has(entry.event.id))
    .map((entry) => ({
      event: structuredClone(entry.event),
      absStart: entry.absStart - removedDurationBefore(entry.absStart),
      divisions: entry.divisions,
    }));

  rewriteTimedDirectionsAfterAbsoluteDelete(staff, removedIntervals);
  rewriteVoiceFromAbsoluteTimeline(staff, voiceId, nextEvents);
  removeDeletedEventReferences(document, removedEventIds);

  const firstMeasureNumber = staff.measures[0]?.measureNumber ?? 1;
  const lastMeasureNumber = staff.measures[staff.measures.length - 1]?.measureNumber ?? firstMeasureNumber;
  normalizeVoiceTimelineAcrossMeasures(document, staff, voiceId, {
    startMeasureNumber: firstMeasureNumber,
    endMeasureNumber: lastMeasureNumber,
  });
  fillVoiceTimelineGaps(staff, voiceId, {
    startMeasureNumber: firstMeasureNumber,
    endMeasureNumber: lastMeasureNumber,
  });

  return {
    selectionRemap: collapseTiedFragmentsAcrossMeasures(document, staff, voiceId, selectionRemap),
  };
}

function fillVoiceTimelineGaps(
  staff: ScoreDocumentModel['score']['parts'][number]['staves'][number],
  voiceId: number,
  range?: { startMeasureNumber?: number; endMeasureNumber?: number; preferExactTailRest?: boolean; keepMeasureRhythm?: boolean },
) {
  for (const measure of staff.measures) {
    if (range?.startMeasureNumber != null && measure.measureNumber < range.startMeasureNumber) continue;
    if (range?.endMeasureNumber != null && measure.measureNumber > range.endMeasureNumber) continue;
    const timing = resolveMeasureTiming(staff, measure);
    let voice = measure.voices.find((entry) => entry.voiceId === voiceId);
    if (!voice || voice.events.length === 0) {
      if (voiceId !== 1) continue;
      voice = getOrCreateVoiceForMeasure(measure, voiceId);
      voice.events = buildRestEventsForSpan(
        measure,
        timing.divisions,
        staff.staffIndex,
        voiceId,
        0,
        timing.durationDivisions,
        timing.durationDivisions,
      );
      continue;
    }
    const sorted = [...voice.events].sort((a, b) => (
      a.timestampNum - b.timestampNum
      || Number(a.isChord) - Number(b.isChord)
      || a.id.localeCompare(b.id)
    ));

    const rebuilt: TimedEvent[] = [];
    let cursor = 0;
    for (const event of sorted) {
      if (event.timestampNum > cursor) {
        const gapDuration = event.timestampNum - cursor;
        rebuilt.push(...buildRestEventsForSpan(
          measure,
          timing.divisions,
          staff.staffIndex,
          voiceId,
          cursor,
          gapDuration,
          gapDuration,
        ));
      }
      rebuilt.push(event);
      if (!event.isChord) {
        cursor = Math.max(cursor, event.timestampNum + event.durationDivisions);
      }
    }

    if (cursor < timing.durationDivisions) {
      const gapDuration = timing.durationDivisions - cursor;
      const exactTailDuration = describeDuration(gapDuration, timing.divisions);
      if (range?.preferExactTailRest && exactTailDuration.value === gapDuration) {
        rebuilt.push(buildRestEventFromSpan(
          measure,
          timing.divisions,
          staff.staffIndex,
          voiceId,
          cursor,
          gapDuration,
        ));
      } else {
        rebuilt.push(...buildRestEventsForSpan(
          measure,
          timing.divisions,
          staff.staffIndex,
          voiceId,
          cursor,
          gapDuration,
          gapDuration,
        ));
      }
    }

    voice.events = rebuilt.sort((a, b) => (
      a.timestampNum - b.timestampNum
      || Number(a.isChord) - Number(b.isChord)
      || a.id.localeCompare(b.id)
    ));
  }

  pruneTrailingRestOnlyMeasuresForVoice(staff, voiceId, {
    keepMeasureNumber: range?.keepMeasureRhythm ? range.startMeasureNumber : undefined,
  });
}

function coalesceAdjacentRestsInMeasure(
  measure: ScoreDocumentModel['score']['parts'][number]['staves'][number]['measures'][number],
  divisions: number,
  staffIndex: number,
  voiceId: number,
  events: TimedEvent[],
) {
  const sorted = [...events].sort((a, b) => (
    a.timestampNum - b.timestampNum
    || Number(a.isChord) - Number(b.isChord)
    || a.id.localeCompare(b.id)
  ));
  const rebuilt: TimedEvent[] = [];
  let restSpanStart: number | null = null;
  let restSpanEnd = 0;

  const flushRestSpan = () => {
    if (restSpanStart == null) return;
    const duration = restSpanEnd - restSpanStart;
    if (duration > 0) {
      rebuilt.push(...buildRestEventsForSpan(
        measure,
        divisions,
        staffIndex,
        voiceId,
        restSpanStart,
        duration,
        duration,
      ));
    }
    restSpanStart = null;
    restSpanEnd = 0;
  };

  for (const event of sorted) {
    const isMergeableRest = event.kind === 'rest' && !event.isChord;
    if (
      isMergeableRest
      && restSpanStart != null
      && event.timestampNum === restSpanEnd
    ) {
      restSpanEnd = Math.max(restSpanEnd, event.timestampNum + event.durationDivisions);
      continue;
    }
    flushRestSpan();
    if (isMergeableRest) {
      restSpanStart = event.timestampNum;
      restSpanEnd = event.timestampNum + event.durationDivisions;
      continue;
    }
    rebuilt.push(event);
  }
  flushRestSpan();

  return rebuilt;
}

/** Bounded time editing uses one integer grid and rejects conflicts before publishing. */
function replaceMidiPassage(document: ScoreDocumentModel, command: Extract<ValidatedScoreCommand, { type: 'replaceMidiPassage' }>): string | null {
  const onsets = new Map<number, { duration: number; pitches: Set<number> }>();
  for (const note of command.notes) {
    if (note.startTick + note.durationTicks > command.lengthTicks) return 'A recorded note exceeds the take boundary.';
    const group = onsets.get(note.startTick);
    if (group && (group.duration !== note.durationTicks || group.pitches.has(note.midi))) return 'Recorded chords require equal gates and unique pitches.';
    if (group) group.pitches.add(note.midi);
    else onsets.set(note.startTick, { duration: note.durationTicks, pitches: new Set([note.midi]) });
  }
  const starts = [...onsets.keys()].sort((a, b) => a - b);
  if (starts.some((start, i) => i > 0 && starts[i-1]! + onsets.get(starts[i-1]!)!.duration > start)) return 'Overlapping onsets require separate voices.';
  command = { ...command, notes: [...command.notes].sort((a,b) => a.startTick - b.startTick || a.midi - b.midi) };
  const found = findVoice(document, command.measureNumber, command.staffIndex, command.voiceId, command);
  if (!found) return 'Select an existing voice before applying a MIDI take.';
  if (findPairedStaffVoice(found.part, command.staffIndex, command.measureNumber, command.voiceId)) return 'Real-time take replacement on linked TAB is not supported; use MIDI step entry.';
  let grid = 16;
  for (const measure of found.staff.measures) grid = lcm(grid, resolveMeasureTiming(found.staff, measure).divisions);
  if (!Number.isSafeInteger(grid) || grid > 1048576) return 'The recording requires an unsupported division grid.';
  for (const measure of found.staff.measures) setStaffDivisionsAtMeasure(found.staff, measure.measureNumber, grid);
  const timeline = buildStaffTimeline(found.staff);
  const measure = getTimelineEntryForMeasure(timeline, command.measureNumber)!;
  const start = measure.startOffset + timestampToDivisionsOffset(grid, command.timestampNum, command.timestampDen);
  const end = start + command.lengthTicks * grid / command.ticksPerQuarter;
  const last = timeline.at(-1)!;
  if (end > last.startOffset + last.durationDivisions) return 'The take exceeds the score. Add empty bars before applying it.';
  const entries = flattenVoiceEventsToAbsoluteTimeline(found.staff, command.voiceId);
  const removed = new Set<string>();
  const retained: AbsoluteVoiceEvent[] = [];
  for (const entry of entries) {
    const eventEnd = entry.absStart + entry.event.durationDivisions;
    if (entry.absStart >= end || eventEnd <= start) { retained.push(entry); continue; }
    if (entry.event.kind !== 'rest' && (entry.absStart < start || eventEnd > end)) return 'The take boundary cuts an existing note. Use an empty or exactly bounded passage.';
    removed.add(entry.event.id);
    if (entry.event.kind === 'rest') {
      if (entry.absStart < start) retained.push({ ...entry, event: cloneTimedEventWithDuration(entry.event, start - entry.absStart, grid) });
      if (eventEnd > end) retained.push({ ...entry, absStart: end, event: cloneTimedEventWithDuration(entry.event, eventEnd - end, grid, { id: `${entry.event.id}:midi-tail` }) });
    }
  }
  for (const tuplet of document.tuplets) if (tuplet.eventIds.some(id => removed.has(id)) && !tuplet.eventIds.every(id => removed.has(id))) return 'The take boundary cuts a tuplet.';
  if (entries.some(entry => entry.event.tieStart && (removed.has(entry.event.id) || entry.absStart < start && entry.absStart + entry.event.durationDivisions === start))) return 'The take touches tied music; remove or include its complete phrase first.';
  if (document.graceNotes.some(g => removed.has(g.eventId))) return 'Replace grace passages with the grace editor before recording.';
  const inserted: AbsoluteVoiceEvent[] = command.notes.map((note, index) => {
    const pitch = midiNoteToPitch(note.midi);
    const absolute = start + note.startTick * grid / command.ticksPerQuarter;
    const target = getTimelineEntryForAbsoluteOffset(timeline, absolute)!;
    const durationDivisions = note.durationTicks * grid / command.ticksPerQuarter;
    const spelling = describeDuration(durationDivisions, grid);
    return { absStart: absolute, divisions: grid, event: {
      id: `midi-take:${command.takeId}:${index}`, kind: 'note', pitch: { step: pitch.step, alter: pitch.alter, octave: pitch.octave },
      measureNumber: target.measure.measureNumber, staffIndex: command.staffIndex, voiceId: command.voiceId,
      timestampNum: absolute - target.startOffset, timestampDen: grid * 4, durationDivisions,
      durationType: spelling.type, isDotted: spelling.dotted, isChord: index > 0 && command.notes[index - 1]!.startTick === note.startTick,
      articulations: [], lyrics: [], tieStart: false,
    } };
  });
  const fragmentMap: EventFragmentIdentityMap = new Map();
  const fragments = [...retained, ...inserted].flatMap(entry => buildTimelineFragmentsForEvent(found.staff, entry, fragmentMap, true));
  rewriteVoiceFromAbsoluteTimeline(found.staff, command.voiceId, fragments);
  removeDeletedEventReferences(document, removed);
  const endMeasure = getTimelineEntryForAbsoluteOffset(timeline, Math.max(start, end - 1))!.measure.measureNumber;
  fillVoiceTimelineGaps(found.staff, command.voiceId, { startMeasureNumber: command.measureNumber, endMeasureNumber: endMeasure });
  return null;
}

function convertTupletRange(document: ScoreDocumentModel, command: Extract<ValidatedScoreCommand, { type: 'addTuplet' }>): string | null {
  const found = findVoice(document, command.measureNumber, command.staffIndex, command.voiceId, command);
  if (!found || command.normalNotes > command.actualNotes) return 'Range conversion requires one voice and a compressing ratio.';
  const timing = resolveMeasureTiming(found.staff, found.measure);
  const start = timestampToDivisionsOffset(timing.divisions, command.startTimestampNum, command.startTimestampDen);
  const stop = timestampToDivisionsOffset(timing.divisions, command.stopTimestampNum, command.stopTimestampDen);
  const selected = found.voice.events.filter(e => e.timestampNum >= start && e.timestampNum <= stop);
  const roots = selected.filter(e => !e.isChord && e.durationDivisions > 0);
  if (roots.length !== command.actualNotes || roots.some(e => e.durationDivisions !== roots[0]!.durationDivisions)) return 'Select exactly the requested number of equal rhythmic units.';
  if (hasIncomingTie(found.staff, command.voiceId, selected) || selected.some(e => e.durationDivisions === 0 || e.tieStart || document.tuplets.some(t => t.eventIds.includes(e.id)))) return 'Range conversion requires untied units outside existing tuplets and grace groups.';
  if (roots.some((event, i) => i > 0 && event.timestampNum !== roots[i - 1]!.timestampNum + roots[i - 1]!.durationDivisions)) return 'The selected units must be contiguous.';
  const paired = findPairedStaffVoice(found.part, command.staffIndex, command.measureNumber, command.voiceId);
  if (paired) return 'Convert ranges on unpaired notation; paired TAB supports dividing an anchor.';
  const factor = command.actualNotes / gcd(roots[0]!.durationDivisions * command.normalNotes, command.actualNotes);
  if (timing.divisions * factor > 1048576) return 'This ratio exceeds the supported exact division grid.';
  // One absolute grid for the whole part (setStaffDivisionsAtMeasure scales every staff of it).
  setStaffDivisionsAtMeasure(found.staff, command.measureNumber, timing.divisions * factor);
  const scaledStart = start * factor;
  const lastEnd = (roots.at(-1)!.timestampNum + roots.at(-1)!.durationDivisions);
  for (const event of selected) {
    event.timestampNum = scaledStart + (event.timestampNum - scaledStart) * command.normalNotes / command.actualNotes;
    event.durationDivisions = event.durationDivisions * command.normalNotes / command.actualNotes;
    if (!Number.isSafeInteger(event.timestampNum) || !Number.isSafeInteger(event.durationDivisions)) return 'The range could not be represented exactly.';
  }
  const number = Math.max(0, ...document.tuplets.map(t => t.number)) + 1;
  document.tuplets.push({ id: `tuplet:converted:${roots[0]!.id}:${number}`, number, eventIds: selected.map(e => e.id), actualNotes: command.actualNotes, normalNotes: command.normalNotes, bracket: command.bracket, showNumber: command.showNumber });
  const newEnd = roots.at(-1)!.timestampNum + roots.at(-1)!.durationDivisions;
  if (newEnd < lastEnd) fillVoiceTimelineGaps(found.staff, command.voiceId, { startMeasureNumber: command.measureNumber, endMeasureNumber: command.measureNumber });
  return null;
}

function editRhythmPassage(document: ScoreDocumentModel, command: Extract<ValidatedScoreCommand, { type: 'editRhythm' }>): string | null {
  const found = findVoice(document, command.measureNumber, command.staffIndex, command.voiceId, command);
  const anchor = found?.voice.events[findCommandEventIndex(found.voice, command)];
  if (!found || !anchor || anchor.durationDivisions <= 0) return 'Select a rhythmic note, chord, or rest.';
  if (command.endMeasureNumber < command.measureNumber) return 'The stop bar must follow the selected onset.';
  const parts = command.scope === 'score' ? document.score.parts : [found.part];
  const paired = findPairedStaffVoice(found.part, command.staffIndex, command.measureNumber, command.voiceId);
  const staves = parts.flatMap(part => part.staves.filter(staff => command.scope !== 'voice' || staff === found.staff || staff === paired?.staff));
  let grid = 16;
  for (const staff of staves) for (const measure of staff.measures) grid = lcm(grid, resolveMeasureTiming(staff, measure).divisions);
  if (!Number.isSafeInteger(grid) || grid > 1048576) return 'This passage requires an unsupported division grid.';
  const sourceTiming = resolveMeasureTiming(found.staff, found.measure);
  const originalDuration = anchor.durationDivisions * grid / sourceTiming.divisions;
  const newDuration = requestedDurationDivisions(command.durationType, command.isDotted, grid);
  for (const staff of staves) for (const measure of staff.measures) setStaffDivisionsAtMeasure(staff, measure.measureNumber, grid);
  const sourceTimeline = buildStaffTimeline(found.staff);
  const sourceMeasure = getTimelineEntryForMeasure(sourceTimeline, command.measureNumber)!;
  const start = sourceMeasure.startOffset + timestampToDivisionsOffset(grid, command.timestampNum, command.timestampDen);
  const delta = command.operation === 'delete' ? -originalDuration : command.operation === 'resize' ? newDuration - originalDuration : newDuration;
  const pivot = command.operation === 'resize' ? start + originalDuration : start;
  const removeEnd = command.operation === 'delete' ? start + originalDuration : pivot;
  const deleted = new Set<string>();
  const tupletIds = buildTupletEventIdSet(document);
  for (const staff of staves) {
    const timeline = buildStaffTimeline(staff);
    const stopMeasure = getTimelineEntryForMeasure(timeline, command.endMeasureNumber);
    if (!stopMeasure) return 'Every affected staff must contain the selected stop bar.';
    const stop = stopMeasure.startOffset + stopMeasure.durationDivisions;
    const voices = command.scope === 'voice' ? [command.voiceId] : [...new Set(staff.measures.flatMap(m => m.voices.map(v => v.voiceId)))];
    for (const voiceId of voices) {
      const entries = flattenVoiceEventsToAbsoluteTimeline(staff, voiceId);
      const isResizedLane = command.operation === 'resize' && (staff === found.staff || staff === paired?.staff) && voiceId === command.voiceId;
      const changedIds = new Set<string>();
      const next: AbsoluteVoiceEvent[] = [];
      for (const entry of entries) {
        const end = entry.absStart + entry.event.durationDivisions;
        if ((entry.absStart < start || !isResizedLane && entry.absStart < pivot) && end > pivot) return 'A sustained event crosses the edit point in another voice.';
        if (entry.absStart >= stop || end <= start && entry.event.durationDivisions > 0) { next.push(entry); continue; }
        if (isResizedLane && entry.absStart === start) {
          if (entry.event.durationDivisions === 0) { next.push(entry); continue; }
          if (tupletIds.has(entry.event.id) || entry.event.tieStart) return 'Resize tied notes or tuplet units with their dedicated tools.';
          if (start + newDuration > stop) return 'The resized note would pass the stop bar.';
          entry.event.durationDivisions = newDuration;
          entry.event.durationType = command.durationType;
          entry.event.isDotted = command.isDotted;
          changedIds.add(entry.event.id);
          next.push(entry);
          continue;
        }
        if (command.operation === 'delete' && entry.absStart >= start && entry.absStart < removeEnd) {
          if (end > removeEnd) return 'The deletion would cut through an event in an affected voice.';
          deleted.add(entry.event.id);
          changedIds.add(entry.event.id);
          continue;
        }
        if (entry.absStart < pivot) { next.push(entry); continue; }
        entry.absStart += delta;
        changedIds.add(entry.event.id);
        const nextEnd = entry.absStart + entry.event.durationDivisions;
        if (entry.absStart < start) return 'The shift would overlap earlier music.';
        if (nextEnd > stop) {
          if (entry.event.kind !== 'rest') return 'Music would pass the stop bar. Extend the range or add empty bars first.';
          if (entry.absStart >= stop) { deleted.add(entry.event.id); continue; }
          entry.event.durationDivisions = stop - entry.absStart;
          const spelling = describeDuration(entry.event.durationDivisions, grid);
          entry.event.durationType = spelling.type;
          entry.event.isDotted = spelling.dotted;
        }
        if (tupletIds.has(entry.event.id)) {
          const target = getTimelineEntryForAbsoluteOffset(timeline, entry.absStart);
          if (!target || nextEnd > target.startOffset + target.durationDivisions) return 'A tuplet cannot be split across a barline.';
        }
        next.push(entry);
      }
      for (const tuplet of document.tuplets) {
        const membership = tuplet.eventIds.filter(id => changedIds.has(id));
        if (membership.length && membership.length !== tuplet.eventIds.length) return 'Move or delete the complete tuplet, including nested units.';
        const destinations = new Set(next.filter(e => tuplet.eventIds.includes(e.event.id)).map(e => getTimelineEntryForAbsoluteOffset(timeline, e.absStart)?.measure.id));
        if (membership.length && destinations.size > 1) return 'The complete tuplet must fit inside one bar.';
      }
      for (let index = 0; index < entries.length; index++) {
        const entry = entries[index]!;
        if (!entry.event.tieStart || entry.event.kind !== 'note') continue;
        const pitch = pitchMidiNumber(entry.event.pitch);
        const receiver = entries.slice(index + 1).find(other => other.event.kind === 'note' && pitchMidiNumber(other.event.pitch) === pitch);
        if (receiver && (changedIds.has(entry.event.id) !== changedIds.has(receiver.event.id)
          || deleted.has(entry.event.id) !== deleted.has(receiver.event.id))) return 'The edit boundary cuts an existing tie. Include both ends.';
      }
      rewriteVoiceFromAbsoluteTimeline(staff, voiceId, next);
      normalizeVoiceTimelineAcrossMeasures(document, staff, voiceId, { startMeasureNumber: command.measureNumber, endMeasureNumber: command.endMeasureNumber });
      fillVoiceTimelineGaps(staff, voiceId, { startMeasureNumber: command.measureNumber, endMeasureNumber: command.endMeasureNumber });
    }
  }
  removeDeletedEventReferences(document, deleted);
  return null;
}

/** For each grace event: the kind of its main event (same voice, same onset). */
function graceMainKinds(document: ScoreDocumentModel) {
  const graceIds = new Set((document.graceNotes ?? []).map((link) => link.eventId));
  const kinds = new Map<string, 'note' | 'rest' | 'none'>();
  for (const part of document.score.parts) {
    for (const staff of part.staves) {
      for (const measure of staff.measures) {
        for (const voice of measure.voices) {
          voice.events.forEach((event) => {
            if (!graceIds.has(event.id)) return;
            const onset = event.timestampNum / Math.max(event.timestampDen, 1);
            // Before normalization a grace can follow its main event in the array, so look at every
            // non-grace event of the voice at the same onset.
            const atOnset = voice.events.filter((candidate) => (
              !graceIds.has(candidate.id)
              && Math.abs(candidate.timestampNum / Math.max(candidate.timestampDen, 1) - onset) < 1e-9
            ));
            kinds.set(event.id, atOnset.some((candidate) => candidate.kind === 'note') ? 'note' : atOnset.length ? 'rest' : 'none');
          });
        }
      }
    }
  }
  return kinds;
}

/**
 * A grace note belongs to the note after it. When an edit turns that note into a rest or removes it,
 * the grace goes too, as in MuseScore, where grace notes are part of a chord. Graces that already
 * stood before a rest in the document before this edit are left alone. F13 in
 * note-entry-mastery-ledger: an orphaned grace made the following tuplet rest import as a
 * <forward>, so the tuplet lost a member on the next round trip.
 */
function pruneGracesWithoutMainNote(nextDocument: ScoreDocumentModel, currentDocument: ScoreDocumentModel) {
  if (!nextDocument.graceNotes?.length) return;
  const before = graceMainKinds(currentDocument);
  const after = graceMainKinds(nextDocument);
  const orphaned = new Set([...after].filter(([id, kind]) => kind !== 'note' && before.get(id) === 'note').map(([id]) => id));
  if (!orphaned.size) return;
  for (const part of nextDocument.score.parts) {
    for (const staff of part.staves) {
      for (const measure of staff.measures) {
        for (const voice of measure.voices) {
          // Only the grace note goes. A rest that took over the id of a grace (Delete on a note with a
          // grace keeps the first event's id) stays, or the bar would get a hidden gap there.
          if (voice.events.some((event) => orphaned.has(event.id) && event.kind === 'note')) {
            voice.events = voice.events.filter((event) => !(orphaned.has(event.id) && event.kind === 'note'));
          }
        }
      }
    }
  }
  nextDocument.graceNotes = (nextDocument.graceNotes ?? []).filter((link) => !orphaned.has(link.eventId));
  nextDocument.slurs = (nextDocument.slurs ?? []).filter((slur) => !orphaned.has(slur.startEventId ?? '') && !orphaned.has(slur.stopEventId ?? ''));
  nextDocument.lyricLines = (nextDocument.lyricLines ?? []).filter((line) => !orphaned.has(line.eventId));
  nextDocument.tuplets = (nextDocument.tuplets ?? []).map((tuplet) => ({ ...tuplet, eventIds: tuplet.eventIds.filter((id) => !orphaned.has(id)) }));
}

export function executeCoreCommands(
  currentDocument: ScoreDocumentModel,
  commands: ValidatedScoreCommand[],
): CoreCommandExecutionResult {
  const nextDocument = cloneDocument(currentDocument);
  registerStaffParts(nextDocument);
  let selectionRemap: SelectionRemap = {};
  const diagnostics: CoreCommandExecutionResult['diagnostics'] = [];
  const batchTargetKeyFifths = [...commands]
    .reverse()
    .find((command) => command.type === 'setKey')?.fifths;
  const preferFlatsForMeasure = (measureNumber: number, staffIndex: number) => {
    const keyFifths = batchTargetKeyFifths ?? getMeasureKeyFifths(nextDocument, measureNumber, staffIndex);
    return (keyFifths ?? 0) < 0;
  };

  for (const command of commands) {
    let commandSelectionRemap: SelectionRemap = {};

    switch (command.type) {
      case 'setTitle':
        nextDocument.metadata.title = command.title;
        break;
      case 'setSubtitle':
        nextDocument.metadata.subtitle = command.subtitle;
        break;
      case 'setComposer':
        nextDocument.metadata.composer = command.composer;
        break;
      case 'setArranger':
        nextDocument.metadata.arranger = command.arranger;
        break;
      case 'removeArticulations': {
        nextDocument.score.parts.forEach((part) => {
          part.staves.forEach((staff) => {
            staff.measures.forEach((measure) => {
              measure.voices.forEach((voice) => {
                voice.events.forEach((event) => {
                  clearEventArticulations(nextDocument, event);
                });
              });
              measure.directions = measure.directions.filter((direction) => !['dynamics', 'octave-shift'].includes(direction.kind));
            });
          });
        });
        break;
      }
      case 'setKey':
        applyToMatchingMeasures(nextDocument, 1, ({ partIndex, staffIndex, measureIndex }) => {
          const attributes = ensureMeasureAttributes(nextDocument, partIndex, staffIndex, measureIndex);
          attributes.keyFifths = command.fifths;
        });
        break;
      case 'transposeDocumentChromatic': {
        nextDocument.score.parts.forEach((part) => {
          part.staves.forEach((staff) => {
            staff.measures.forEach((measure) => {
              const measureKeyFifths = getMeasureKeyFifths(nextDocument, measure.measureNumber, staff.staffIndex);
              const preferFlats = batchTargetKeyFifths != null
                ? batchTargetKeyFifths < 0
                : (measureKeyFifths ?? 0) < 0;
              measure.voices.forEach((voice) => {
                voice.events.forEach((event) => {
                  if (event.kind !== 'note') return;
                  event.pitch = transposePitch(
                    event.pitch.step,
                    event.pitch.alter,
                    event.pitch.octave,
                    command.semitones,
                    preferFlats,
                  );
                  event.writtenAccidental = undefined;
                  event.accidentalCautionary = undefined;
                  event.accidentalEnclosure = undefined;
                });
              });
              measure.directions.forEach((direction) => {
                if (direction.kind !== 'harmony') return;
                direction.value = transposeHarmonyValue(direction.value, command.semitones, preferFlats);
              });
            });
          });
        });
        break;
      }
      case 'setTempo': {
        nextDocument.score.parts.forEach((part) => {
          part.staves.forEach((staff) => {
            const measure = staff.measures.find((entry) => entry.measureNumber === 1);
            if (!measure || staff.staffIndex !== 1) return;
            measure.directions = measure.directions.filter((direction) => direction.kind !== 'metronome');
            measure.directions.unshift({
              id: `${measure.id}:tempo`,
              kind: 'metronome',
              value: String(command.bpm),
              placement: 'above',
              measureNumber: 1,
              staffIndex: 1,
              timestampNum: 0,
              timestampDen: Math.max((measure.attributes[0]?.divisions ?? 1) * 4, 1),
            });
          });
        });
        break;
      }
      case 'setTimeSignature': {
        const targetMeasure = command.measureNumber ?? 1;
        const affectedStaves = nextDocument.score.parts.flatMap((part) => (
          part.staves
            .filter((staff) => staff.measures.some((measure) => measure.measureNumber === targetMeasure))
            .map((staff) => ({ part, staff }))
        ));
        const meterChangesContent = affectedStaves.some(({ staff }) => {
          const measure = staff.measures.find((entry) => entry.measureNumber === targetMeasure);
          const current = measure ? resolveMeasureTiming(staff, measure).timeSignature : null;
          return current?.beats !== command.beats || current?.beatType !== command.beatType;
        });
        const snapshots = meterChangesContent
          ? affectedStaves.map(({ part, staff }) => snapshotStaffForTimeSignatureRebar(part.id, staff))
          : [];
        applyToMatchingMeasures(nextDocument, targetMeasure, ({ partIndex, staffIndex, measureIndex }) => {
          const attributes = ensureMeasureAttributes(nextDocument, partIndex, staffIndex, measureIndex);
          attributes.time = {
            beats: command.beats,
            beatType: command.beatType,
            beatGroups: command.beatGroups?.slice(),
          };
        });
        if (snapshots.length > 0) rebarTimeSignatureSnapshots(nextDocument, snapshots);
        break;
      }
      case 'setClef': {
        const targetMeasure = command.measureNumber ?? 1;
        const targetStaff = command.staffIndex ?? 1;
        applyToMatchingMeasures(nextDocument, targetMeasure, ({ partIndex, staffIndex, measureIndex }) => {
          if (staffIndex + 1 !== targetStaff) return;
          const attributes = ensureMeasureAttributes(nextDocument, partIndex, staffIndex, measureIndex);
          const existing = attributes.clefs.find((clef) => clef.staffIndex === targetStaff);
          if (existing) {
            existing.sign = command.sign;
            existing.line = command.line;
          } else {
            attributes.clefs.push({
              staffIndex: targetStaff,
              sign: command.sign,
              line: command.line,
            });
          }
        });
        break;
      }
      case 'removeClefChange': {
        const targetStaff = command.staffIndex ?? 1;
        applyToMatchingMeasures(nextDocument, command.measureNumber, ({ partIndex, staffIndex, measureIndex }) => {
          if (staffIndex + 1 !== targetStaff) return;
          const measure = nextDocument.score.parts[partIndex].staves[staffIndex].measures[measureIndex];
          measure.attributes.forEach((attributes) => {
            attributes.clefs = attributes.clefs.filter((clef) => clef.staffIndex !== targetStaff);
          });
        });
        break;
      }
      case 'setPartName': {
        const part = nextDocument.score.parts.find((entry) => entry.sourcePartId === command.partId);
        if (part) part.name = command.name;
        break;
      }
      case 'setPartAbbreviation': {
        const part = nextDocument.score.parts.find((entry) => entry.sourcePartId === command.partId);
        if (part) part.abbreviation = command.abbreviation;
        break;
      }
      case 'setInstrumentName': {
        const part = nextDocument.score.parts.find((entry) => entry.sourcePartId === command.partId);
        if (part) part.instrumentName = command.instrumentName;
        break;
      }
      case 'setPartTranspose': {
        const part = nextDocument.score.parts.find((entry) => entry.sourcePartId === command.partId);
        if (part) {
          part.chromaticTranspose = command.chromatic;
          part.diatonicTranspose = command.diatonic;
        }
        break;
      }
      case 'fitRangeOctaves': {
        nextDocument.score.parts.forEach((part) => {
          part.staves.forEach((staff) => {
            if (command.staffIndex != null && staff.staffIndex !== command.staffIndex) return;
            staff.measures.forEach((measure) => {
              if (command.startMeasureNumber != null && measure.measureNumber < command.startMeasureNumber) return;
              if (command.endMeasureNumber != null && measure.measureNumber > command.endMeasureNumber) return;
              measure.voices.forEach((voice) => {
                if (command.voiceId != null && voice.voiceId !== command.voiceId) return;
                voice.events.forEach((event) => {
                  if (event.kind !== 'note') return;
                  let midi = noteToMidi(event.pitch.step, event.pitch.alter, event.pitch.octave);
                  while (midi < command.minMidi) {
                    event.pitch.octave += 1;
                    midi += 12;
                  }
                  while (midi > command.maxMidi) {
                    event.pitch.octave -= 1;
                    midi -= 12;
                  }
                });
              });
            });
          });
        });
        break;
      }
      case 'fitPartToInstrument': {
        const profile = INSTRUMENT_PROFILES[command.instrument];
        if (!profile) break;
        nextDocument.score.parts.forEach((part) => {
          if (command.partId && part.sourcePartId !== command.partId) return;
          part.instrumentName = profile.instrumentName;
          part.chromaticTranspose = profile.chromaticTranspose;
          part.diatonicTranspose = profile.diatonicTranspose;
          part.staves.forEach((staff) => {
            staff.measures.forEach((measure) => {
              measure.voices.forEach((voice) => {
                voice.events.forEach((event) => {
                  if (event.kind !== 'note') return;
                  let midi = noteToMidi(event.pitch.step, event.pitch.alter, event.pitch.octave);
                  while (midi < profile.minMidi) {
                    event.pitch.octave += 1;
                    midi += 12;
                  }
                  while (midi > profile.maxMidi) {
                    event.pitch.octave -= 1;
                    midi -= 12;
                  }
                });
              });
            });
          });
        });
        break;
      }
      case 'insertMeasureAfter': {
        nextDocument.score.parts.forEach((part) => {
          part.staves.forEach((staff) => {
            const index = staff.measures.findIndex((measure) => measure.measureNumber === command.measureNumber);
            if (index < 0) return;
            const reference = staff.measures[index];
            const inserted = buildAppendedBar(staff, reference, command.measureNumber + 1);
            // Appending after the last bar moves the final barline to the new end.
            if (index === staff.measures.length - 1 && reference.rightBarline === 'final') {
              inserted.rightBarline = 'final';
              reference.rightBarline = undefined;
            }
            staff.measures.splice(index + 1, 0, inserted);
          });
        });
        shiftLayoutHintsAfterMeasure(nextDocument, command.measureNumber, 1);
        renumberMeasures(nextDocument);
        break;
      }
      case 'deleteMeasure': {
        nextDocument.score.parts.forEach((part) => {
          part.staves.forEach((staff) => {
            const index = staff.measures.findIndex((measure) => measure.measureNumber === command.measureNumber);
            if (index >= 0) {
              staff.measures.splice(index, 1);
            }
          });
        });
        shiftLayoutHintsAfterMeasure(nextDocument, command.measureNumber, -1);
        renumberMeasures(nextDocument);
        break;
      }
      case 'addStartRepeat': {
        nextDocument.score.parts.forEach((part) => {
          part.staves.forEach((staff) => {
            const measure = staff.measures.find((entry) => entry.measureNumber === 1);
            if (measure) measure.leftBarline = 'repeat-start';
          });
        });
        break;
      }
      case 'addEndRepeat': {
        nextDocument.score.parts.forEach((part) => {
          part.staves.forEach((staff) => {
            const targetMeasureNumber = command.measureNumber ?? staff.measures[staff.measures.length - 1]?.measureNumber;
            const measure = staff.measures.find((entry) => entry.measureNumber === targetMeasureNumber);
            if (measure) measure.rightBarline = 'repeat-end';
          });
        });
        break;
      }
      case 'addVolta2': {
        nextDocument.score.parts.forEach((part) => {
          part.staves.forEach((staff) => {
            const measure = staff.measures.find((entry) => entry.measureNumber === 1);
            if (measure) measure.leftEnding = { number: '2', type: 'start' };
          });
        });
        break;
      }
      case 'setEnding': {
        nextDocument.score.parts.forEach((part) => {
          part.staves.forEach((staff) => {
            const measure = staff.measures.find((entry) => entry.measureNumber === command.measureNumber);
            if (measure) {
              if (command.endingType === 'start') {
                measure.leftEnding = { number: command.number, type: 'start' };
              } else {
                measure.rightEnding = { number: command.number, type: command.endingType };
              }
            }
          });
        });
        break;
      }
      case 'changeNotePitch': {
        const found = findVoice(nextDocument, command.measureNumber, command.staffIndex, command.voiceId, command);
        const event = found?.voice.events[findCommandEventIndex(found.voice, {
          coreEntityId: command.coreEntityId,
          timestampNum: command.timestampNum,
          timestampDen: command.timestampDen,
        })];
        if (event && event.kind !== 'note') {
          // A rest has no pitch to change; entering a note into a rest is insertNote. A stale target
          // used to crash here (F10 in note-entry-mastery-ledger).
          diagnostics.push({ level: 'warning', code: 'pitch_command_rejected', message: 'There is a rest at this position; enter a note instead.' });
          break;
        }
        if (event) {
          event.kind = 'note';
          const noteEvent = event as Extract<TimedEvent, { kind: 'note' }>;
          const paired = found
            ? findPairedTabNotationTimedEvent(
                found.part,
                command.staffIndex,
                command.measureNumber,
                command.voiceId,
                command.timestampNum,
                command.timestampDen,
                noteEvent,
              )
            : null;
          const nextPitch = {
            step: command.step,
            alter: command.alter,
            octave: command.octave,
          };
          const soundingPitchUnchanged = pitchMidiNumber(noteEvent.pitch) === pitchMidiNumber(nextPitch);
          noteEvent.pitch = nextPitch;
          noteEvent.writtenAccidental = command.writtenAccidental;
          if (!command.writtenAccidental) {
            noteEvent.accidentalCautionary = undefined;
            noteEvent.accidentalEnclosure = undefined;
          } else {
            if ('accidentalCautionary' in command) noteEvent.accidentalCautionary = command.accidentalCautionary || undefined;
            if ('accidentalEnclosure' in command) {
              noteEvent.accidentalEnclosure = command.accidentalEnclosure === 'none' ? undefined : command.accidentalEnclosure;
            }
          }

          if (found) {
            const sourceIsTab = isTabStaff(found.part, command.staffIndex);
            if (sourceIsTab && !soundingPitchUnchanged) {
              noteEvent.guitar = resolveSyncedGuitarFingering({
                pitch: nextPitch,
                existing: noteEvent.guitar,
              });
            }

            if (paired?.event) {
              paired.event.kind = 'note';
              const pairedNote = paired.event as Extract<TimedEvent, { kind: 'note' }>;
              const pairedPitch = paired.isTab
                ? guitarWrittenToSoundingPitch(nextPitch)
                : sourceIsTab
                  ? guitarSoundingToWrittenPitch(nextPitch)
                  : nextPitch;
              const pairedSoundingPitchUnchanged = pitchMidiNumber(pairedNote.pitch) === pitchMidiNumber(pairedPitch);
              pairedNote.pitch = { ...pairedPitch };
              pairedNote.writtenAccidental = command.writtenAccidental;
              if (!command.writtenAccidental) {
                pairedNote.accidentalCautionary = undefined;
                pairedNote.accidentalEnclosure = undefined;
              } else {
                if ('accidentalCautionary' in command) pairedNote.accidentalCautionary = command.accidentalCautionary || undefined;
                if ('accidentalEnclosure' in command) {
                  pairedNote.accidentalEnclosure = command.accidentalEnclosure === 'none' ? undefined : command.accidentalEnclosure;
                }
              }
              if (paired.isTab && !pairedSoundingPitchUnchanged) {
                pairedNote.guitar = resolveSyncedGuitarFingering({
                  pitch: pairedPitch,
                  existing: pairedNote.guitar,
                });
              }
            }
          }
        }
        break;
      }
      case 'setAccidentalDisplay': {
        const found = findVoice(nextDocument, command.measureNumber, command.staffIndex, command.voiceId, command);
        const event = found?.voice.events[findCommandEventIndex(found.voice, {
          coreEntityId: command.coreEntityId,
          timestampNum: command.timestampNum,
          timestampDen: command.timestampDen,
        })];
        if (event?.kind === 'note' && event.writtenAccidental) {
          event.accidentalCautionary = command.cautionary || undefined;
          event.accidentalEnclosure = command.enclosure === 'none' ? undefined : command.enclosure;

          if (found) {
            const paired = findPairedTabNotationTimedEvent(
              found.part,
              command.staffIndex,
              command.measureNumber,
              command.voiceId,
              command.timestampNum,
              command.timestampDen,
              event,
            );
            if (paired?.event.kind === 'note' && paired.event.writtenAccidental) {
              paired.event.accidentalCautionary = command.cautionary || undefined;
              paired.event.accidentalEnclosure = command.enclosure === 'none' ? undefined : command.enclosure;
            }
          }
        }
        break;
      }
      case 'changeNoteDuration': {
        const found = findVoice(nextDocument, command.measureNumber, command.staffIndex, command.voiceId, command);
        if (!found) break;
        const applied = applyDurationChangeToVoice(nextDocument, {
          staff: found.staff,
          measure: found.measure,
          voice: found.voice,
          voiceId: command.voiceId,
          timestampNum: command.timestampNum,
          timestampDen: command.timestampDen,
          durationType: command.durationType,
          isDotted: command.isDotted,
        });
        if (!applied) break;
        const paired = findPairedTabNotationEvent(
          found.part,
          command.staffIndex,
          command.measureNumber,
          command.voiceId,
          command.timestampNum,
          command.timestampDen,
        );
        if (paired?.voice && paired.voice !== found.voice) {
          applyDurationChangeToVoice(nextDocument, {
            staff: paired.staff,
            measure: paired.measure,
            voice: paired.voice,
            voiceId: command.voiceId,
            timestampNum: command.timestampNum,
            timestampDen: command.timestampDen,
            durationType: command.durationType,
            isDotted: command.isDotted,
          });
        }
        break;
      }
      case 'replaceWithRest': {
        const found = findVoice(nextDocument, command.measureNumber, command.staffIndex, command.voiceId, command);
        if (!found) break;

        const replaceVoiceOnset = (
          staff: typeof found.staff,
          measure: typeof found.measure,
          voice: typeof found.voice,
        ) => {
          ensureStaffDivisionsForDuration(staff, measure.measureNumber, command.durationType, command.isDotted);
          const timing = resolveMeasureTiming(staff, measure);
          const simultaneousIndices = findSimultaneousEventIndices(voice, command.timestampNum, command.timestampDen);
          const simultaneousEvents = simultaneousIndices.map((index) => voice.events[index]).filter(Boolean);
          const root = simultaneousEvents.find((event) => !event.isChord) ?? simultaneousEvents[0];
          if (!root) return null;

          // A value other than the unit's own, written on a tuplet unit (F22b): the tuplet cannot keep
          // its shape. On its first unit the whole tuplet goes and what is left of its time becomes
          // rests (MuseScore Score::makeGap, "We have to remove the complete tuplet"). On a later unit
          // the onset is not on the plain grid, so the edit is rejected as a whole.
          const rootTuplet = nextDocument.tuplets.find((tuplet) => tuplet.eventIds.includes(root.id));
          const keepsUnit = root.durationType === command.durationType && Boolean(root.isDotted) === Boolean(command.isDotted);
          let tupletSpanDuration = 0;
          const tupletMemberIds = new Set<string>();
          if (rootTuplet && !keepsUnit) {
            const members = voice.events.filter((event) => rootTuplet.eventIds.includes(event.id));
            const firstOnset = Math.min(...members.map((event) => event.timestampNum));
            if (members.length !== rootTuplet.eventIds.length || root.timestampNum !== firstOnset) return 'tuplet-unit' as const;
            const memberOnsets = new Set(members.map((event) => event.timestampNum));
            voice.events
              .filter((event) => memberOnsets.has(event.timestampNum) && event.timestampDen === root.timestampDen)
              .forEach((event) => tupletMemberIds.add(event.id));
            tupletSpanDuration = Math.max(...members.map((event) => event.timestampNum + event.durationDivisions)) - firstOnset;
          }

          const previousDuration = tupletSpanDuration || simultaneousEvents.reduce((max, event) => (
            Math.max(max, event.durationDivisions)
          ), root.durationDivisions);
          const replacedIds = new Set([...simultaneousEvents.map((event) => event.id), ...tupletMemberIds]);
          const rest = buildRestEventFromSpan(
            measure,
            timing.divisions,
            staff.staffIndex,
            command.voiceId,
            root.timestampNum,
            previousDuration,
          );
          rest.id = root.id;
          voice.events = voice.events
            .filter((event) => !replacedIds.has(event.id))
            .concat(rest)
            .sort((left, right) => (
              left.timestampNum - right.timestampNum
              || Number(left.isChord) - Number(right.isChord)
              || left.id.localeCompare(right.id)
            ));

          // The retained rhythmic entity may remain inside a tuplet, but
          // note-only attachments and chord members must not survive on a rest.
          nextDocument.slurs = nextDocument.slurs.filter((slur) => (
            !slur.startEventId
            || !slur.stopEventId
            || (!replacedIds.has(slur.startEventId) && !replacedIds.has(slur.stopEventId))
          ));
          nextDocument.graceNotes = nextDocument.graceNotes.filter((graceNote) => !replacedIds.has(graceNote.eventId));
          nextDocument.lyricLines = nextDocument.lyricLines.filter((line) => !replacedIds.has(line.eventId));
          nextDocument.tremolos = nextDocument.tremolos.filter((tremolo) => !replacedIds.has(tremolo.eventId));
          nextDocument.glissandos = nextDocument.glissandos.filter((glissando) => (
            !glissando.startEventId
            || !glissando.stopEventId
            || (!replacedIds.has(glissando.startEventId) && !replacedIds.has(glissando.stopEventId))
          ));
          nextDocument.arpeggios = nextDocument.arpeggios.filter((arpeggio) => !replacedIds.has(arpeggio.eventId));
          replacedIds.forEach((eventId) => nextDocument.fermataEventIds.delete(eventId));
          nextDocument.chordGroups = nextDocument.chordGroups
            .map((group) => ({
              ...group,
              eventIds: group.eventIds.filter((eventId) => !replacedIds.has(eventId)),
            }))
            .filter((group) => group.eventIds.length > 1);
          nextDocument.tuplets = nextDocument.tuplets
            .map((tuplet) => ({
              ...tuplet,
              eventIds: tuplet.eventIds.filter((eventId) => eventId === root.id || !replacedIds.has(eventId)),
            }))
            .filter((tuplet) => tuplet.eventIds.length > 0)
            .filter((tuplet) => !(tupletSpanDuration && tuplet.eventIds.includes(root.id)));

          // A rest of the unit's own value on a tuplet unit keeps the unit's time; the plain value of
          // that name is longer and would grow over the next unit.
          if (!(rootTuplet && keepsUnit)) applyDurationChangeToVoice(nextDocument, {
            staff,
            measure,
            voice,
            voiceId: command.voiceId,
            timestampNum: command.timestampNum,
            timestampDen: command.timestampDen,
            durationType: command.durationType,
            isDotted: command.isDotted,
          });
          return { rootId: root.id, replacedIds };
        };

        const replacement = replaceVoiceOnset(found.staff, found.measure, found.voice);
        if (replacement === 'tuplet-unit') {
          diagnostics.push({ level: 'warning', code: 'tuplet_command_rejected', message: 'This value does not fit on a later note of a tuplet. Enter the tuplet\'s own note value here, or start on the first note of the tuplet.' });
          break;
        }
        if (!replacement) break;
        replacement.replacedIds.forEach((eventId) => {
          if (eventId !== replacement.rootId) commandSelectionRemap[eventId] = replacement.rootId;
        });

        const paired = findPairedTabNotationEvent(
          found.part,
          command.staffIndex,
          command.measureNumber,
          command.voiceId,
          command.timestampNum,
          command.timestampDen,
        );
        if (paired?.voice && paired.voice !== found.voice) {
          replaceVoiceOnset(paired.staff, paired.measure, paired.voice);
        }
        break;
      }
      case 'setNoteStyle': {
        const found = findVoice(nextDocument, command.measureNumber, command.staffIndex, command.voiceId, commandScope(command));
        const event = found?.voice.events[findEventIndex(found.voice, command.timestampNum, command.timestampDen)];
        if (event) {
          event.notehead = command.notehead;
          event.stem = command.stem;
        }
        break;
      }
      case 'toggleStemDirection': {
        const found = findVoice(nextDocument, command.measureNumber, command.staffIndex, command.voiceId, commandScope(command));
        const event = found?.voice.events[findEventIndex(found.voice, command.timestampNum, command.timestampDen)];
        if (event?.kind === 'note') {
          const current = event.stem === 'up' || event.stem === 'down'
            ? event.stem
            : defaultStemDirection(nextDocument, event);
          event.stem = current === 'up' ? 'down' : 'up';
        }
        break;
      }
      case 'setGuitarFret': {
        const found = findVoice(nextDocument, command.measureNumber, command.staffIndex, command.voiceId, command);
        const event = found?.voice.events[findCommandEventIndex(found.voice, {
          coreEntityId: command.coreEntityId,
          timestampNum: command.timestampNum,
          timestampDen: command.timestampDen,
          step: command.step,
          octave: command.octave,
          alter: command.alter,
        })];
        if (event && event.kind === 'note') {
          const tuning = resolveGuitarTuning(command.tuning ?? event.guitar?.tuning);
          const pitch = resolveGuitarFretPitch(command.string, command.fret, tuning);
          const sourceIsTab = found ? isTabStaff(found.part, command.staffIndex) : Boolean(event.guitar);
          const sourcePitch = sourceIsTab ? pitch : guitarSoundingToWrittenPitch(pitch);
          const previous = event.guitar;
          // Keep the existing spelling when the sounding pitch is unchanged —
          // a string change at constant pitch must not respell Bb as A#.
          if (pitchMidiNumber(event.pitch) !== pitchMidiNumber(sourcePitch)) {
            event.pitch = { step: sourcePitch.step, alter: sourcePitch.alter, octave: sourcePitch.octave };
            event.writtenAccidental = undefined;
            event.accidentalCautionary = undefined;
            event.accidentalEnclosure = undefined;
          }
          event.guitar = {
            string: command.string,
            fret: pitch.fret,
          };
          const nextTuning = command.tuning ?? previous?.tuning;
          if (nextTuning) event.guitar.tuning = nextTuning;
          const nextTechniques = command.techniques ?? previous?.techniques;
          if (nextTechniques) {
            event.guitar.techniques = [...nextTechniques] as NonNullable<typeof event.guitar>['techniques'];
          }
          const paired = findPairedTabNotationEvent(
            found.part,
            command.staffIndex,
            command.measureNumber,
            command.voiceId,
            command.timestampNum,
            command.timestampDen,
          );
          if (paired?.event) {
            const pairedPitch = paired.isTab ? pitch : guitarSoundingToWrittenPitch(pitch);
            if (pitchMidiNumber(paired.event.pitch) !== pitchMidiNumber(pairedPitch)) {
              paired.event.pitch = { step: pairedPitch.step, alter: pairedPitch.alter, octave: pairedPitch.octave };
              paired.event.writtenAccidental = undefined;
              paired.event.accidentalCautionary = undefined;
              paired.event.accidentalEnclosure = undefined;
            }
            if (paired.isTab) {
              const previousPairedGuitar = paired.event.guitar;
              paired.event.guitar = {
                string: command.string,
                fret: pitch.fret,
              };
              const nextPairedTuning = command.tuning ?? previousPairedGuitar?.tuning;
              if (nextPairedTuning) paired.event.guitar.tuning = nextPairedTuning;
              const pairedTechniques = command.techniques ?? previousPairedGuitar?.techniques;
              if (pairedTechniques) {
                paired.event.guitar.techniques = [...pairedTechniques] as NonNullable<typeof paired.event.guitar>['techniques'];
              }
            }
          }
        }
        break;
      }
      case 'toggleGuitarTechnique': {
        const found = findVoice(nextDocument, command.measureNumber, command.staffIndex, command.voiceId, commandScope(command));
        const event = found?.voice.events[findEventIndex(found.voice, command.timestampNum, command.timestampDen)];
        if (event && event.kind === 'note') {
          const current = event.guitar ?? { string: 1 as const, fret: 0 };
          const techniques = new Set(current.techniques ?? []);
          const technique = command.technique as NonNullable<typeof current.techniques>[number];
          if (techniques.has(technique)) techniques.delete(technique);
          else techniques.add(technique);
          event.guitar = {
            ...current,
            techniques: [...techniques],
          };
        }
        break;
      }
      case 'deleteNote': {
        const found = findVoice(nextDocument, command.measureNumber, command.staffIndex, command.voiceId, command);
        const index = found ? findCommandEventIndex(found.voice, command) : -1;
        const event = index >= 0 ? found?.voice.events[index] : null;
        if (found && event) deleteEventAndPairedGuitarNote(nextDocument, found, event);
        break;
      }
      case 'deleteRange': {
        const range = command.target.range;
        if (!range) break;
        // Snapshot identities because deleting chord tones changes array indices.
        const targets = collectEventsInRange(nextDocument, range)
          .map(target => ({ ...target, event: target.voice.events[target.eventIndex] }));
        for (const { part, staff, measure, voice, event } of targets) {
          if (event && voice.events.includes(event)) {
            deleteEventAndPairedGuitarNote(nextDocument, { part, staff, measure, voice }, event);
          }
        }
        break;
      }
      case 'clearMeasureVoice': {
        const found = findVoice(nextDocument, command.measureNumber, command.staffIndex, command.voiceId, command);
        if (!found) break;
        const deletedEventIds = new Set(found.voice.events.map((event) => event.id));
        const timing = resolveMeasureTiming(found.staff, found.measure);
        found.voice.events = buildRestEventsForSpan(
          found.measure,
          timing.divisions,
          command.staffIndex,
          command.voiceId,
          0,
          timing.durationDivisions,
          timing.durationDivisions,
        );
        removeDeletedEventReferences(nextDocument, deletedEventIds);
        break;
      }
      case 'replaceMidiPassage': {
        const rejection = replaceMidiPassage(nextDocument, command);
        if (rejection) diagnostics.push({ level: 'warning', code: 'midi_command_rejected', message: rejection });
        break;
      }
      case 'editRhythm': {
        const rejection = editRhythmPassage(nextDocument, command);
        if (rejection) diagnostics.push({ level: 'warning', code: 'rhythm_command_rejected', message: rejection });
        break;
      }
      case 'rippleDelete': {
        const found = findVoice(nextDocument, command.measureNumber, command.staffIndex, command.voiceId, commandScope(command));
        if (!found) break;
        const eventIdsToRemove = found.voice.events
          .filter((event) => timestampsEqual(event.timestampNum, event.timestampDen, command.timestampNum, command.timestampDen))
          .map((event) => event.id);
        commandSelectionRemap = removeAndPullVoiceTimeline(
          nextDocument,
          found.staff,
          command.voiceId,
          eventIdsToRemove,
        ).selectionRemap;
        break;
      }
      case 'rippleDeleteRange': {
        const range = command.target.range;
        if (!range) break;
        const start = compareLocators(range.start, range.end) <= 0 ? range.start : range.end;
        const end = start === range.start ? range.end : range.start;
        const found = findVoice(nextDocument, start.measureNumber, start.staffIndex, start.voiceId, commandScope(start));
        if (!found) break;
        const flattened = flattenVoiceEventsToAbsoluteTimeline(found.staff, start.voiceId);
        const staffTimeline = buildStaffTimeline(found.staff);
        const absoluteOffsetFor = (locator: typeof start) => {
          const measureTimeline = getTimelineEntryForMeasure(staffTimeline, locator.measureNumber);
          if (!measureTimeline) return 0;
          return measureTimeline.startOffset + timestampToDivisionsOffset(
            measureTimeline.divisions,
            locator.timestampNum,
            locator.timestampDen,
          );
        };
        const absoluteStart = absoluteOffsetFor(start);
        const absoluteEnd = absoluteOffsetFor(end);
        const eventIdsToRemove = flattened
          .filter((entry) => entry.absStart >= absoluteStart && entry.absStart <= absoluteEnd)
          .map((entry) => entry.event.id);
        commandSelectionRemap = removeAndPullVoiceTimeline(
          nextDocument,
          found.staff,
          start.voiceId,
          eventIdsToRemove,
        ).selectionRemap;
        break;
      }
      case 'transposeChromatic': {
        const found = findVoice(nextDocument, command.measureNumber, command.staffIndex, command.voiceId, command);
        const event = found?.voice.events[findCommandEventIndex(found.voice, command)];
        if (event?.kind === 'note') {
          const paired = found
            ? findPairedTabNotationTimedEvent(
                found.part,
                command.staffIndex,
                command.measureNumber,
                command.voiceId,
                command.timestampNum,
                command.timestampDen,
                event,
              )
            : null;
          const nextPitch = transposePitch(event.pitch.step, event.pitch.alter, event.pitch.octave, command.semitones, preferFlatsForMeasure(event.measureNumber, event.staffIndex));
          event.pitch = nextPitch;
          event.writtenAccidental = undefined;
          event.accidentalCautionary = undefined;
          event.accidentalEnclosure = undefined;
          if (found && paired?.event.kind === 'note') {
            const pairedPitch = pitchForPairedGuitarStaff(
              found.part,
              command.staffIndex,
              paired.isTab,
              nextPitch,
            );
            paired.event.pitch = { ...pairedPitch };
            paired.event.writtenAccidental = undefined;
            paired.event.accidentalCautionary = undefined;
            paired.event.accidentalEnclosure = undefined;
            if (paired.isTab) {
              paired.event.guitar = resolveSyncedGuitarFingering({
                pitch: pairedPitch,
                existing: paired.event.guitar,
              });
            }
          }
        }
        break;
      }
      case 'transposeRangeChromatic': {
        const range = command.target.range;
        if (!range) break;
        const targets = collectEventsInRange(nextDocument, range);
        targets.forEach(({ voice, eventIndex }) => {
          const event = voice.events[eventIndex];
          if (event?.kind === 'note') {
            event.pitch = transposePitch(event.pitch.step, event.pitch.alter, event.pitch.octave, command.semitones, preferFlatsForMeasure(event.measureNumber, event.staffIndex));
            event.writtenAccidental = undefined;
            event.accidentalCautionary = undefined;
            event.accidentalEnclosure = undefined;
          }
        });
        break;
      }
      case 'toggleArticulation': {
        const found = findVoice(nextDocument, command.measureNumber, command.staffIndex, command.voiceId, commandScope(command));
        const event = found?.voice.events[findEventIndex(found.voice, command.timestampNum, command.timestampDen)];
        if (event) {
          if (command.articulation === 'fermata') {
            if (nextDocument.fermataEventIds.has(event.id)) {
              nextDocument.fermataEventIds.delete(event.id);
              clearEventArticulationPlacement(event, 'fermata');
            } else {
              nextDocument.fermataEventIds.add(event.id);
              if (command.placement === 'above' || command.placement === 'below') {
                setEventArticulationPlacement(event, 'fermata', command.placement);
              }
            }
            break;
          }
          const articulations = new Set(event.articulations ?? []);
          if (articulations.has(command.articulation)) {
            articulations.delete(command.articulation);
            clearEventArticulationPlacement(event, command.articulation);
          } else {
            articulations.add(command.articulation);
            if (command.placement === 'above' || command.placement === 'below') {
              setEventArticulationPlacement(event, command.articulation, command.placement);
            }
          }
          event.articulations = [...articulations];
        }
        break;
      }
      case 'setArticulationPlacement': {
        const found = findVoice(nextDocument, command.measureNumber, command.staffIndex, command.voiceId, commandScope(command));
        const event = found?.voice.events[findEventIndex(found.voice, command.timestampNum, command.timestampDen)];
        if (!event) break;
        const articulationExists = command.articulation === 'fermata'
          ? nextDocument.fermataEventIds.has(event.id)
          : (event.articulations ?? []).includes(command.articulation);
        if (articulationExists) {
          setEventArticulationPlacement(event, command.articulation, command.placement);
        }
        break;
      }
      case 'clearArticulations': {
        const found = findVoice(nextDocument, command.measureNumber, command.staffIndex, command.voiceId, commandScope(command));
        const event = found?.voice.events[findEventIndex(found.voice, command.timestampNum, command.timestampDen)];
        if (event) clearEventArticulations(nextDocument, event);
        break;
      }
      case 'clearRangeArticulations': {
        const range = command.target.range;
        if (!range) break;
        const targets = collectEventsInRange(nextDocument, range);
        targets.forEach(({ voice, eventIndex }) => {
          const event = voice.events[eventIndex];
          if (event) clearEventArticulations(nextDocument, event);
        });
        break;
      }
      case 'toggleTie': {
        const found = findVoice(nextDocument, command.measureNumber, command.staffIndex, command.voiceId, command);
        const event = found?.voice.events[findCommandEventIndex(found.voice, command)];
        if (found && event?.kind === 'note') {
          const nextTieStart = !event.tieStart;
          event.tieStart = nextTieStart;
          if (!nextTieStart) event.tiePlacement = undefined;

          const paired = findPairedTabNotationEvent(
            found.part,
            command.staffIndex,
            command.measureNumber,
            command.voiceId,
            command.timestampNum,
            command.timestampDen,
          );
          const pairedEvent = paired?.event;
          if (pairedEvent?.kind === 'note') {
            pairedEvent.tieStart = nextTieStart;
            if (!nextTieStart) pairedEvent.tiePlacement = undefined;
          }
        }
        break;
      }
      case 'setTiePlacement': {
        const found = findVoice(nextDocument, command.measureNumber, command.staffIndex, command.voiceId, commandScope(command));
        const event = found?.voice.events[findEventIndex(found.voice, command.timestampNum, command.timestampDen)];
        if (event?.kind === 'note' && event.tieStart) event.tiePlacement = command.placement;
        break;
      }
      case 'toggleSlur': {
        const found = findVoice(nextDocument, command.measureNumber, command.staffIndex, command.voiceId, commandScope(command));
        const event = found?.voice.events[findEventIndex(found.voice, command.timestampNum, command.timestampDen)];
        if (event?.kind !== 'note') break;

        const stopLocator = command.stopLocator && typeof command.stopLocator === 'object'
          ? command.stopLocator
          : null;
        const stopEvent = stopLocator
          ? (() => {
              const stopFound = findVoice(nextDocument, stopLocator.measureNumber, stopLocator.staffIndex, stopLocator.voiceId, commandScope(command));
              const resolved = stopFound?.voice.events[findEventIndex(stopFound.voice, stopLocator.timestampNum, stopLocator.timestampDen)];
              return resolved?.kind === 'note' ? resolved : null;
            })()
          : findNextNoteEvent(nextDocument, {
              measureNumber: command.measureNumber,
              staffIndex: command.staffIndex,
              voiceId: command.voiceId,
              timestampNum: command.timestampNum,
              timestampDen: command.timestampDen,
            }, commandScope(command).corePartId);

        if (!stopEvent || stopEvent.id === event.id) break;

        const existingIndex = nextDocument.slurs.findIndex((slur) => slur.startEventId === event.id && slur.stopEventId === stopEvent.id);
        if (existingIndex >= 0) {
          nextDocument.slurs.splice(existingIndex, 1);
          break;
        }

        const existingNumbers = nextDocument.slurs.map((slur) => slur.number).filter((value) => Number.isFinite(value));
        const nextNumber = existingNumbers.length > 0 ? Math.max(...existingNumbers) + 1 : 1;
        nextDocument.slurs.push({
          id: `slur:${event.id}:${stopEvent.id}`,
          number: nextNumber,
          startEventId: event.id,
          stopEventId: stopEvent.id,
        });
        break;
      }
      case 'setSlurPlacement': {
        const found = findVoice(nextDocument, command.measureNumber, command.staffIndex, command.voiceId, commandScope(command));
        const event = found?.voice.events[findEventIndex(found.voice, command.timestampNum, command.timestampDen)];
        if (event?.kind !== 'note') break;

        const stopFound = findVoice(
          nextDocument,
          command.stopLocator.measureNumber,
          command.stopLocator.staffIndex,
          command.stopLocator.voiceId,
          commandScope(command),
        );
        const stopEvent = stopFound?.voice.events[
          findEventIndex(stopFound.voice, command.stopLocator.timestampNum, command.stopLocator.timestampDen)
        ];
        if (stopEvent?.kind !== 'note' || stopEvent.id === event.id) break;

        const slur = nextDocument.slurs.find((entry) => entry.startEventId === event.id && entry.stopEventId === stopEvent.id);
        if (!slur) break;
        slur.placement = command.placement;
        break;
      }
      case 'addDynamic': {
        for (const part of nextDocument.score.parts) {
          if (!commandTargetsPart(part, command.corePartId)) continue;
          const staff = part.staves.find((entry) => entry.staffIndex === command.staffIndex);
          const measure = staff?.measures.find((entry) => entry.measureNumber === command.measureNumber);
          if (!measure) continue;
          measure.directions = measure.directions.filter((direction) => !(
            direction.kind === 'dynamics'
            && direction.staffIndex === command.staffIndex
            && direction.timestampNum === command.timestampNum
            && direction.timestampDen === command.timestampDen
          ));
          measure.directions.push({
            id: `${measure.id}:dynamic:${command.dynamic}:${command.timestampNum}`,
            kind: 'dynamics',
            value: command.dynamic,
            placement: command.placement ?? 'below',
            measureNumber: command.measureNumber,
            staffIndex: command.staffIndex,
            timestampNum: command.timestampNum,
            timestampDen: command.timestampDen,
          });
        }
        break;
      }
      case 'addRehearsalMark': {
        nextDocument.score.parts.forEach((part) => {
          part.staves.forEach((staff) => {
            const measure = staff.measures.find((entry) => entry.measureNumber === command.measureNumber);
            if (!measure) return;
            measure.directions.push({
              id: `${measure.id}:rehearsal:${command.text}`,
              kind: 'rehearsal',
              value: command.text,
              placement: 'above',
              measureNumber: command.measureNumber,
              staffIndex: staff.staffIndex,
              timestampNum: 0,
              timestampDen: Math.max((measure.attributes[0]?.divisions ?? 1) * 4, 1),
            });
          });
        });
        break;
      }
      case 'addRehearsalMarksEvery': {
        nextDocument.score.parts.forEach((part) => {
          part.staves.forEach((staff) => {
            const measures = staff.measures
              .filter((measure) => measure.measureNumber >= (command.startMeasureNumber ?? 1))
              .filter((measure) => measure.measureNumber <= (command.endMeasureNumber ?? Number.POSITIVE_INFINITY))
              .sort((a, b) => a.measureNumber - b.measureNumber);
            measures.forEach((measure, index) => {
              if (index % command.interval !== 0) return;
              const label = rehearsalLabel(Math.floor(index / command.interval), command.style);
              measure.directions = measure.directions.filter((direction) => direction.kind !== 'rehearsal');
              measure.directions.unshift({
                id: `${measure.id}:rehearsal:${label}`,
                kind: 'rehearsal',
                value: label,
                placement: 'above',
                measureNumber: measure.measureNumber,
                staffIndex: staff.staffIndex,
                timestampNum: 0,
                timestampDen: Math.max((measure.attributes[0]?.divisions ?? 1) * 4, 1),
              });
            });
          });
        });
        break;
      }
      case 'addWords': {
        nextDocument.score.parts.forEach((part) => {
          if (!commandTargetsPart(part, command.corePartId)) return;
          part.staves.forEach((staff) => {
            if (command.staffIndex != null && staff.staffIndex !== command.staffIndex) return;
            const measure = staff.measures.find((entry) => entry.measureNumber === command.measureNumber);
            if (!measure) return;
            measure.directions.push({
              id: `${measure.id}:words:${command.text}`,
              kind: 'words',
              value: command.text,
              placement: command.placement ?? 'above',
              measureNumber: command.measureNumber,
              staffIndex: staff.staffIndex,
              timestampNum: 0,
              timestampDen: Math.max((measure.attributes[0]?.divisions ?? 1) * 4, 1),
            });
          });
        });
        break;
      }
      case 'addExpressionText': {
        nextDocument.score.parts.forEach((part) => {
          if (!commandTargetsPart(part, command.corePartId)) return;
          part.staves.forEach((staff) => {
            if (command.staffIndex != null && staff.staffIndex !== command.staffIndex) return;
            const measure = staff.measures.find((entry) => entry.measureNumber === command.measureNumber);
            if (!measure) return;
            measure.directions.push({
              id: `${measure.id}:expression:${command.text}`,
              kind: 'words',
              value: command.text,
              placement: command.placement ?? 'above',
              measureNumber: command.measureNumber,
              staffIndex: staff.staffIndex,
              timestampNum: 0,
              timestampDen: Math.max((measure.attributes[0]?.divisions ?? 1) * 4, 1),
            });
          });
        });
        break;
      }
      case 'addAnalysisAnnotation': {
        const startMeasureNumber = command.startMeasureNumber ?? command.measureNumber ?? 1;
        const endMeasureNumber = command.endMeasureNumber ?? command.measureNumber ?? startMeasureNumber;
        const label = analysisTypeLabel(command.analysisType);
        addVisibleTextDirection({
          document: nextDocument,
          measureNumber: startMeasureNumber,
          staffIndex: command.staffIndex,
          idKind: 'analysis',
          placement: command.placement ?? 'above',
          text: `${label} ${semanticRangeLabel(startMeasureNumber, endMeasureNumber)}: ${command.text.trim()}`,
        });
        break;
      }
      case 'addTechniqueInstruction': {
        const text = `Technique (${command.instrument}, ${semanticRangeLabel(command.startMeasureNumber, command.endMeasureNumber)}): ${command.text.trim()}`;
        addVisibleTextDirection({
          document: nextDocument,
          measureNumber: command.startMeasureNumber,
          staffIndex: command.staffIndex,
          partId: command.partId,
          idKind: 'technique',
          placement: command.placement ?? 'above',
          text,
        });
        break;
      }
      case 'addSyncPoint': {
        const timestampNum = command.timestampNum ?? 0;
        const timestampDen = command.timestampDen ?? 4;
        const timecode = command.timecode ? ` ${command.timecode}` : '';
        const text = `Sync${timecode} ${command.label.trim()}: ${command.scoringIntent.trim()}`;
        addVisibleTextDirection({
          document: nextDocument,
          measureNumber: command.measureNumber,
          staffIndex: command.staffIndex,
          idKind: 'sync',
          placement: command.placement ?? 'above',
          timestampNum,
          timestampDen,
          text,
        });
        break;
      }
      case 'addOrchestrationNote': {
        const target = command.partName ?? command.partId ?? 'score';
        const text = `Orchestration (${target}, ${semanticRangeLabel(command.startMeasureNumber, command.endMeasureNumber)}): ${command.instruction.trim()}`;
        addVisibleTextDirection({
          document: nextDocument,
          measureNumber: command.startMeasureNumber,
          staffIndex: command.staffIndex,
          partId: command.partId,
          idKind: 'orchestration',
          placement: command.placement ?? 'above',
          text,
        });
        break;
      }
      case 'removeDirection': {
        removeDirection(nextDocument, command.measureNumber, command.text, command.staffIndex, command.kind, command.corePartId);
        break;
      }
      case 'addChords': {
        const segments = command.chords.split(',').map((entry) => entry.trim()).filter(Boolean);
        segments.forEach((segment, index) => {
          const [measureToken, chordToken] = segment.split(':');
          const measureNumber = Number.parseInt(measureToken, 10);
          if (!Number.isFinite(measureNumber) || !chordToken?.trim()) return;
          nextDocument.score.parts.forEach((part) => {
            const hostStaff = part.staves.find((staff) => staff.measures.some((entry) => entry.measureNumber === measureNumber));
            part.staves.forEach((staff) => {
              const measure = staff.measures.find((entry) => entry.measureNumber === measureNumber);
              if (!measure) return;
              measure.directions = measure.directions.filter((direction) => direction.kind !== 'harmony');
            });
            const hostMeasure = hostStaff?.measures.find((entry) => entry.measureNumber === measureNumber);
            if (hostStaff && hostMeasure) {
              hostMeasure.directions.push({
                id: `${hostMeasure.id}:harmony:${index}`,
                kind: 'harmony',
                value: chordToken.trim(),
                measureNumber,
                staffIndex: hostStaff.staffIndex,
                timestampNum: 0,
                timestampDen: Math.max((hostMeasure.attributes[0]?.divisions ?? 1) * 4, 1),
              });
            }
          });
        });
        break;
      }
      case 'setHarmonyAt': {
        nextDocument.score.parts.forEach((part) => {
          if (!commandTargetsPart(part, command.corePartId)) return;
          const partHasTargetStaff = command.staffIndex == null || part.staves.some((staff) => (
            staff.staffIndex === command.staffIndex
            && staff.measures.some((entry) => entry.measureNumber === command.measureNumber)
          ));
          if (!partHasTargetStaff) return;
          const hostStaff = part.staves.find((staff) => staff.measures.some((entry) => entry.measureNumber === command.measureNumber));
          const hostMeasure = hostStaff?.measures.find((entry) => entry.measureNumber === command.measureNumber);
          if (!hostStaff || !hostMeasure) return;
          part.staves.forEach((staff) => {
            const measure = staff.measures.find((entry) => entry.measureNumber === command.measureNumber);
            if (!measure) return;
            measure.directions = measure.directions.filter((direction) => !(
              direction.kind === 'harmony'
              && direction.timestampNum === command.timestampNum
              && direction.timestampDen === command.timestampDen
            ));
          });
          hostMeasure.directions.push({
            id: `${hostMeasure.id}:harmony:${hostStaff.staffIndex}:${command.timestampNum}:${Date.now()}`,
            kind: 'harmony',
            value: command.value.trim(),
            measureNumber: command.measureNumber,
            staffIndex: hostStaff.staffIndex,
            timestampNum: command.timestampNum,
            timestampDen: command.timestampDen,
          });
        });
        break;
      }
      case 'fillSlashMeasure': {
        fillMeasureWithSlashes(nextDocument, command);
        break;
      }
      case 'setBarline': {
        nextDocument.score.parts.forEach((part) => {
          part.staves.forEach((staff) => {
            const measure = staff.measures.find((entry) => entry.measureNumber === command.measureNumber);
            if (measure) measure.rightBarline = command.barline;
          });
        });
        break;
      }
      case 'setSystemBreak': {
        nextDocument.score.parts.forEach((part) => {
          part.staves.forEach((staff) => {
            const measure = staff.measures.find((entry) => entry.measureNumber === command.measureNumber);
            if (!measure) return;
            measure.print = {
              ...measure.print,
              newSystem: command.value ?? true,
            };
            upsertLayoutHint(nextDocument, {
              measureNumber: command.measureNumber,
              partId: part.sourcePartId,
              staffIndex: staff.staffIndex,
              kind: 'newSystem',
              value: command.value ?? true,
              scope: 'measure',
            });
          });
        });
        break;
      }
      case 'setPageBreak': {
        nextDocument.score.parts.forEach((part) => {
          part.staves.forEach((staff) => {
            const measure = staff.measures.find((entry) => entry.measureNumber === command.measureNumber);
            if (!measure) return;
            measure.print = {
              ...measure.print,
              newPage: command.value ?? true,
            };
            upsertLayoutHint(nextDocument, {
              measureNumber: command.measureNumber,
              partId: part.sourcePartId,
              staffIndex: staff.staffIndex,
              kind: 'newPage',
              value: command.value ?? true,
              scope: 'page',
            });
          });
        });
        break;
      }
      case 'setMeasureLayoutHint': {
        nextDocument.score.parts.forEach((part) => {
          if (command.partId && part.sourcePartId !== command.partId) return;
          part.staves.forEach((staff) => {
            if (command.staffIndex && staff.staffIndex !== command.staffIndex) return;
            const measure = staff.measures.find((entry) => entry.measureNumber === command.measureNumber);
            if (!measure) return;
            if (command.hint === 'newSystem') {
              measure.print = { ...measure.print, newSystem: Boolean(command.value) };
            }
            if (command.hint === 'newPage') {
              measure.print = { ...measure.print, newPage: Boolean(command.value) };
            }
            upsertLayoutHint(nextDocument, {
              measureNumber: command.measureNumber,
              partId: part.sourcePartId,
              staffIndex: staff.staffIndex,
              kind: command.hint,
              value: command.value,
              scope: command.hint === 'newPage' ? 'page' : command.hint === 'staffSpacing' ? 'staff' : 'measure',
            });
          });
        });
        break;
      }
      case 'applyPracticeProfile': {
        const spacing = command.profile === 'compact' ? 84 : command.profile === 'roomy' ? 112 : 124;
        nextDocument.score.parts.forEach((part) => {
          part.staves.forEach((staff) => {
            staff.measures.forEach((measure, index) => {
              if (command.startMeasureNumber != null && measure.measureNumber < command.startMeasureNumber) return;
              if (command.endMeasureNumber != null && measure.measureNumber > command.endMeasureNumber) return;
              const shouldBreak = command.profile !== 'compact' && index > 0 && index % 4 === 0;
              if (shouldBreak) {
                measure.print = { ...measure.print, newSystem: true };
              }
              upsertLayoutHint(nextDocument, {
                measureNumber: measure.measureNumber,
                partId: part.sourcePartId,
                staffIndex: staff.staffIndex,
                kind: 'staffSpacing',
                value: spacing,
                scope: 'staff',
              });
              if (shouldBreak) {
                upsertLayoutHint(nextDocument, {
                  measureNumber: measure.measureNumber,
                  partId: part.sourcePartId,
                  staffIndex: staff.staffIndex,
                  kind: 'newSystem',
                  value: true,
                  scope: 'measure',
                });
              }
            });
          });
        });
        break;
      }
      case 'addLyric': {
        const found = findVoice(nextDocument, command.measureNumber, command.staffIndex, command.voiceId, commandScope(command));
        const event = found?.voice.events[findEventIndex(found.voice, command.timestampNum, command.timestampDen)];
        if (event) {
          event.lyrics = [{
            verseNumber: 1,
            text: command.text,
            syllabic: command.syllabic,
          }];
          upsertLyricLine(nextDocument, event.id, 1, command.text, command.syllabic);
        }
        break;
      }
      case 'setLyricLine': {
        const found = findVoice(nextDocument, command.measureNumber, command.staffIndex, command.voiceId, commandScope(command));
        const event = found?.voice.events[findEventIndex(found.voice, command.timestampNum, command.timestampDen)];
        if (event) {
          const lyrics = [...(event.lyrics ?? [])].filter((lyric) => (lyric.verseNumber ?? 1) !== command.verseNumber);
          lyrics.push({
            verseNumber: command.verseNumber,
            text: command.text,
            syllabic: command.syllabic,
          });
          event.lyrics = lyrics.sort((a, b) => (a.verseNumber ?? 1) - (b.verseNumber ?? 1));
          upsertLyricLine(nextDocument, event.id, command.verseNumber, command.text, command.syllabic);
        }
        break;
      }
      case 'removeLyricLine': {
        const found = findVoice(nextDocument, command.measureNumber, command.staffIndex, command.voiceId, commandScope(command));
        const event = found?.voice.events[findEventIndex(found.voice, command.timestampNum, command.timestampDen)];
        if (event) {
          event.lyrics = (event.lyrics ?? []).filter((lyric) => (lyric.verseNumber ?? 1) !== command.verseNumber);
          removeLyricLine(nextDocument, event.id, command.verseNumber);
        }
        break;
      }
      case 'editTupletUnit': {
        const found = findVoice(nextDocument, command.measureNumber, command.staffIndex, command.voiceId, command);
        const event = found?.voice.events[findCommandEventIndex(found.voice, command)];
        const spans = nextDocument.tuplets.filter(t => event && t.eventIds.includes(event.id));
        if (!found || !event || !spans.length || findPairedStaffVoice(found.part, command.staffIndex, command.measureNumber, command.voiceId)) {
          diagnostics.push({ level: 'warning', code: 'tuplet_command_rejected', message: 'Select a tuplet unit in unpaired notation for this edit.' }); break;
        }
        const onset = found.voice.events.filter(e => e.timestampNum === event.timestampNum && e.durationDivisions > 0);
        if (onset.some(e => e.tieStart) || hasIncomingTie(found.staff, command.voiceId, onset)) { diagnostics.push({ level: 'warning', code: 'tuplet_command_rejected', message: 'Resolve the unit tie before replacing its pitches.' }); break; }
        const root = onset.find(e => !e.isChord) ?? event;
        const pitch = { step: command.step, alter: command.alter, octave: command.octave };
        if (command.action === 'rest') {
          const removed = new Set(onset.filter(e => e !== root).map(e => e.id));
          found.voice.events = found.voice.events.filter(e => !removed.has(e.id));
          for (const span of nextDocument.tuplets) span.eventIds = span.eventIds.filter(id => !removed.has(id));
          removeDeletedEventReferences(nextDocument, removed);
          root.kind = 'rest'; root.isChord = false; root.tieStart = false;
        } else if (command.action === 'chord' && root.kind === 'note') {
          if (!onset.some(e => e.kind === 'note' && pitchMidiNumber(e.pitch) === pitchMidiNumber(pitch))) {
            const added = { ...structuredClone(root), id: `${root.id}:tuplet-chord:${nextDocument.revision}:${onset.length}`, pitch, isChord: true, writtenAccidental: undefined, accidentalCautionary: undefined, accidentalEnclosure: undefined, lyrics: [], articulations: [], preservedXml: undefined };
            found.voice.events.push(added);
            for (const span of nextDocument.tuplets.filter(t => t.eventIds.includes(root.id))) span.eventIds.splice(span.eventIds.indexOf(root.id) + 1, 0, added.id);
          }
        } else {
          event.kind = 'note';
          const note = event as Extract<TimedEvent, { kind: 'note' }>;
          note.pitch = pitch; note.writtenAccidental = undefined; note.accidentalCautionary = undefined; note.accidentalEnclosure = undefined;
        }
        break;
      }
      case 'duplicateNote': {
        const found = findVoice(nextDocument, command.measureNumber, command.staffIndex, command.voiceId, command);
        const index = found ? findCommandEventIndex(found.voice, command) : -1;
        const event = index >= 0 ? found?.voice.events[index] : null;
        if (found && event) {
          if (findPairedStaffVoice(found.part, command.staffIndex, command.measureNumber, command.voiceId)) {
            diagnostics.push({ level: 'warning', code: 'duplicate_command_rejected', message: 'Duplicating linked notation/TAB is not supported. Enter the new onset with linked note input.' }); break;
          }
          if (nextDocument.tuplets.some(t => t.eventIds.includes(event.id)) || event.durationDivisions === 0 || found.voice.events.some(e => e.durationDivisions === 0 && timestampsEqual(e.timestampNum, e.timestampDen, event.timestampNum, event.timestampDen))) {
            diagnostics.push({ level: 'warning', code: 'duplicate_command_rejected', message: 'Copy and paste the complete tuplet or grace passage.' }); break;
          }
          if (event.tieStart || hasIncomingTie(found.staff, command.voiceId, [event]) || found.voice.events.filter(e => e.durationDivisions > 0 && timestampsEqual(e.timestampNum, e.timestampDen, event.timestampNum, event.timestampDen)).length > 1) {
            diagnostics.push({ level: 'warning', code: 'duplicate_command_rejected', message: 'Copy and paste the complete chord or tie passage; single-event duplication cannot preserve these relationships.' }); break;
          }
          const duplicate = structuredClone(event);
          duplicate.id = `${event.id}:duplicate:${found.voice.events.length}`;
          duplicate.isChord = false;
          duplicate.tieStart = false;
          duplicate.lyrics = [];

          const staffTimeline = buildStaffTimeline(found.staff);
          const currentMeasureTimeline = getTimelineEntryForMeasure(staffTimeline, found.measure.measureNumber);
          if (!currentMeasureTimeline) break;
          const insertionAbsoluteOffset = currentMeasureTimeline.startOffset + event.timestampNum + event.durationDivisions;
          const flattenedVoiceEvents = flattenVoiceEventsToAbsoluteTimeline(found.staff, command.voiceId);
          const currentVoiceEnd = flattenedVoiceEvents.reduce(
            (max, entry) => Math.max(max, entry.absStart + entry.event.durationDivisions),
            insertionAbsoluteOffset,
          );
          const requiredTimelineEnd = Math.max(
            currentVoiceEnd + event.durationDivisions,
            insertionAbsoluteOffset + event.durationDivisions,
          );

          ensureStaffTimelineDuration(
            nextDocument,
            found.part.id,
            found.staff.staffIndex,
            requiredTimelineEnd,
          );
          rewriteTimedDirectionsAfterAbsoluteInsert(found.staff, insertionAbsoluteOffset, event.durationDivisions, 0);
          const transformedVoiceEvents = transformAbsoluteInsertTimelineEvents(
            flattenedVoiceEvents,
            insertionAbsoluteOffset,
            event.durationDivisions,
            0,
          );
          rewriteVoiceFromAbsoluteTimeline(found.staff, command.voiceId, [
            ...transformedVoiceEvents,
            {
              event: duplicate,
              absStart: insertionAbsoluteOffset,
              divisions: currentMeasureTimeline.divisions,
            },
          ]);
          const affectedTimeline = buildStaffTimeline(found.staff);
          const lastAffectedMeasure = getTimelineEntryForAbsoluteOffset(
            affectedTimeline,
            Math.max(requiredTimelineEnd - 1, insertionAbsoluteOffset),
          )?.measure.measureNumber ?? found.measure.measureNumber;
          normalizeVoiceTimelineAcrossMeasures(nextDocument, found.staff, command.voiceId, {
            startMeasureNumber: found.measure.measureNumber,
            endMeasureNumber: lastAffectedMeasure,
          });
          fillVoiceTimelineGaps(found.staff, command.voiceId, {
            startMeasureNumber: found.measure.measureNumber,
            endMeasureNumber: lastAffectedMeasure,
          });
        }
        break;
      }
      case 'addTuplet': {
        if (command.convertRange) {
          const rejection = convertTupletRange(nextDocument, command);
          if (rejection) diagnostics.push({ level: 'warning', code: 'tuplet_command_rejected', message: rejection });
          break;
        }
        const rejectTuplet = (message: string) => diagnostics.push({
          level: 'warning',
          code: 'tuplet_command_rejected',
          message,
        });
        if (!timestampsEqual(
          command.startTimestampNum,
          command.startTimestampDen,
          command.stopTimestampNum,
          command.stopTimestampDen,
        )) {
          rejectTuplet('Tuplet creation divides one selected rhythmic slot; range conversion is not safe.');
          break;
        }
        const found = findVoice(nextDocument, command.measureNumber, command.staffIndex, command.voiceId, command);
        if (!found) {
          rejectTuplet('The selected tuplet voice could not be resolved.');
          break;
        }
        const selectedIndex = findCommandEventIndex(found.voice, {
          coreEntityId: command.coreEntityId,
          timestampNum: command.startTimestampNum,
          timestampDen: command.startTimestampDen,
        });
        const selectedEvent = found.voice.events[selectedIndex];
        if (!selectedEvent) {
          rejectTuplet('The selected tuplet anchor no longer exists.');
          break;
        }
        const graceEventIds = new Set(nextDocument.graceNotes.map((entry) => entry.eventId));
        const resolveLane = (voice: VoiceNode) => {
          const onsetEvents = voice.events.filter((event) => (
            !graceEventIds.has(event.id)
            && timestampsEqual(
              event.timestampNum,
              event.timestampDen,
              selectedEvent.timestampNum,
              selectedEvent.timestampDen,
            )
          ));
          const root = onsetEvents.find((event) => !event.isChord);
          return root ? { voice, root, onsetEvents } : null;
        };
        const sourceLane = resolveLane(found.voice);
        if (!sourceLane) {
          rejectTuplet('Tuplet creation requires a rhythmic note, chord, or rest anchor.');
          break;
        }
        const unitNotation = dividedTupletUnitDuration(
          sourceLane.root.durationType,
          sourceLane.root.isDotted,
          command.normalNotes,
        );
        if (!unitNotation) {
          rejectTuplet(`The selected ${sourceLane.root.isDotted ? 'dotted ' : ''}${sourceLane.root.durationType ?? 'unknown'} duration cannot represent a ${command.actualNotes}:${command.normalNotes} tuplet exactly.`);
          break;
        }
        const pairedVoice = findPairedStaffVoice(
          found.part,
          command.staffIndex,
          command.measureNumber,
          command.voiceId,
        );
        const pairedLane = pairedVoice ? resolveLane(pairedVoice.voice) : null;
        const lanes = [sourceLane, pairedLane].filter((lane): lane is NonNullable<typeof lane> => Boolean(lane));
        if (lanes.some((lane) => lane.onsetEvents.some((event) => event.tieStart))
          || hasIncomingTie(found.staff, command.voiceId, sourceLane.onsetEvents)
          || (pairedLane && pairedVoice && hasIncomingTie(pairedVoice.staff, command.voiceId, pairedLane.onsetEvents))) {
          rejectTuplet('Tuplet creation on a tied source is unsafe; remove or complete the tie first.');
          break;
        }
        const enclosing = nextDocument.tuplets.filter(tuplet => lanes.some(lane => tuplet.eventIds.includes(lane.root.id)));
        if (enclosing.some(tuplet => lanes.some(lane =>
          tuplet.eventIds.includes(lane.root.id) && lane.onsetEvents.some(event => !tuplet.eventIds.includes(event.id))
        )) || enclosing.filter(tuplet => tuplet.eventIds.includes(sourceLane.root.id)).length >= 4) {
          rejectTuplet('Nested tuplets require a complete onset and support at most four enclosing levels.');
          break;
        }
        if (pairedLane && (
          pairedLane.root.durationType !== sourceLane.root.durationType
          || Boolean(pairedLane.root.isDotted) !== Boolean(sourceLane.root.isDotted)
        )) {
          rejectTuplet('Paired notation and TAB durations disagree at the selected tuplet anchor.');
          break;
        }

        const timing = resolveMeasureTiming(found.staff, found.measure);
        const durationFactor = command.actualNotes / gcd(sourceLane.root.durationDivisions, command.actualNotes);
        const notationDivisions = requiredDivisionsForDuration(unitNotation.type, unitNotation.dotted, timing.divisions);
        const targetDivisions = lcm(timing.divisions * durationFactor, notationDivisions);
        const scaleFactor = targetDivisions / timing.divisions;
        if (!Number.isSafeInteger(targetDivisions) || targetDivisions > 1048576 || !Number.isInteger(scaleFactor) || scaleFactor < 1) {
          rejectTuplet('Tuplet creation could not establish an exact integer division grid.');
          break;
        }
        // One absolute grid for the whole part (setStaffDivisionsAtMeasure scales every staff of it).
        setStaffDivisionsAtMeasure(found.staff, command.measureNumber, targetDivisions);

        if (sourceLane.root.durationDivisions % command.actualNotes !== 0) {
          rejectTuplet('Tuplet creation remained fractional after division-grid normalization.');
          break;
        }
        const existingNumbers = nextDocument.tuplets.map((tuplet) => tuplet.number).filter(Number.isFinite);
        const nextNumber = existingNumbers.length > 0 ? Math.max(...existingNumbers) + 1 : 1;
        const usedEventIds = new Set<string>();
        nextDocument.score.parts.forEach((part) => part.staves.forEach((staff) => (
          staff.measures.forEach((measure) => measure.voices.forEach((voice) => (
            voice.events.forEach((event) => usedEventIds.add(event.id))
          )))
        )));
        lanes.forEach((lane) => {
          const unitDuration = lane.root.durationDivisions / command.actualNotes;
          lane.onsetEvents.forEach((event) => {
            event.durationDivisions = unitDuration;
            event.durationType = unitNotation.type;
            event.isDotted = unitNotation.dotted || undefined;
          });
          const measure = found.part.staves
            .find((staff) => staff.staffIndex === lane.root.staffIndex)
            ?.measures.find((entry) => entry.measureNumber === command.measureNumber);
          if (!measure) return;
          const insertionIndex = Math.max(...lane.onsetEvents.map((event) => lane.voice.events.indexOf(event))) + 1;
          const restEvents: TimedEvent[] = [];
          for (let unitIndex = 1; unitIndex < command.actualNotes; unitIndex += 1) {
            const idPrefix = `${lane.root.id}:tuplet-rest:${nextNumber}:${unitIndex}`;
            let id = idPrefix;
            let collision = 1;
            while (usedEventIds.has(id)) {
              id = `${idPrefix}:${collision}`;
              collision += 1;
            }
            usedEventIds.add(id);
            restEvents.push({
              id,
              kind: 'rest',
              measureNumber: command.measureNumber,
              staffIndex: lane.root.staffIndex,
              voiceId: command.voiceId,
              timestampNum: lane.root.timestampNum + unitDuration * unitIndex,
              timestampDen: lane.root.timestampDen,
              durationDivisions: unitDuration,
              durationType: unitNotation.type,
              isDotted: unitNotation.dotted || undefined,
              isChord: false,
              articulations: [],
              tieStart: false,
              lyrics: [],
            });
          }
          lane.voice.events.splice(insertionIndex, 0, ...restEvents);
          for (const parent of enclosing.filter(tuplet => tuplet.eventIds.includes(lane.root.id))) {
            const lastToneIndex = Math.max(...lane.onsetEvents.map(event => parent.eventIds.indexOf(event.id)));
            parent.eventIds.splice(lastToneIndex + 1, 0, ...restEvents.map(event => event.id));
          }
          nextDocument.tuplets.push({
            id: `tuplet:${measure.id}:${lane.root.staffIndex}:${command.voiceId}:${lane.root.id}:${nextNumber}`,
            number: nextNumber,
            eventIds: [...lane.onsetEvents.map((event) => event.id), ...restEvents.map((event) => event.id)],
            actualNotes: command.actualNotes,
            normalNotes: command.normalNotes,
            bracket: command.bracket,
            showNumber: command.showNumber,
          });
        });
        break;
      }
      case 'setAccidentalPolicy': {
        nextDocument.accidentalPolicy = command.policy;
        break;
      }
      case 'setRhythmSpelling': {
        const found = findVoice(nextDocument, command.measureNumber, command.staffIndex, command.voiceId, command);
        const event = found?.voice.events[findCommandEventIndex(found.voice, command)];
        if (!event) break;
        const children = (event.preservedXml?.notationChildren ?? []).filter(xml => !xml.includes('nex-note:literal-duration'));
        if (command.literal) children.push('<other-notation type="single" print-object="no">nex-note:literal-duration</other-notation>');
        event.preservedXml = { ...event.preservedXml, notationChildren: children };
        break;
      }
      case 'moveGraceNote': {
        const found = findVoice(nextDocument, command.measureNumber, command.staffIndex, command.voiceId, command);
        const event = found?.voice.events[findCommandEventIndex(found.voice, command)];
        if (!found || !event) break;
        const ids = new Set(nextDocument.graceNotes.map(g => g.eventId));
        const sequence = found.voice.events.filter(e => ids.has(e.id) && timestampsEqual(e.timestampNum, e.timestampDen, event.timestampNum, event.timestampDen));
        const index = sequence.indexOf(event);
        const destination = index + (command.direction === 'earlier' ? -1 : 1);
        if (index < 0 || destination < 0 || destination >= sequence.length) break;
        const swap = (voice: VoiceNode) => {
          const siblings = voice.events.filter(e => ids.has(e.id) && timestampsEqual(e.timestampNum, e.timestampDen, event.timestampNum, event.timestampDen));
          if (siblings.length !== sequence.length) return false;
          const left = voice.events.indexOf(siblings[index]!);
          const right = voice.events.indexOf(siblings[destination]!);
          [voice.events[left], voice.events[right]] = [voice.events[right]!, voice.events[left]!];
          return true;
        };
        const paired = findPairedStaffVoice(found.part, command.staffIndex, command.measureNumber, command.voiceId);
        if (paired && !swap(paired.voice)) {
          diagnostics.push({ level: 'warning', code: 'grace_command_rejected', message: 'Paired grace sequences disagree; repair their order before moving notes.' });
          break;
        }
        swap(found.voice);
        break;
      }
      case 'addGraceNote': {
        const found = findVoice(nextDocument, command.measureNumber, command.staffIndex, command.voiceId, command);
        if (!found) break;
        const eventIndex = findCommandEventIndex(found.voice, command);
        const event = found.voice.events[eventIndex];
        if (event?.kind !== 'note') break;
        const existing = nextDocument.graceNotes.find((entry) => entry.eventId === event.id);
        if (existing) {
          existing.slash = command.slash;
        } else {
          const usedEventIds = new Set<string>();
          nextDocument.score.parts.forEach((part) => part.staves.forEach((staff) => (
            staff.measures.forEach((measure) => measure.voices.forEach((voice) => (
              voice.events.forEach((entry) => usedEventIds.add(entry.id))
            )))
          )));
          const buildGraceEvent = (source: Extract<TimedEvent, { kind: 'note' }>, staffIndex: number) => {
            const idPrefix = `${source.id}:grace:`;
            let idOrdinal = 1;
            while (usedEventIds.has(`${idPrefix}${idOrdinal}`)) idOrdinal += 1;
            const id = `${idPrefix}${idOrdinal}`;
            usedEventIds.add(id);
            return ({
              ...structuredClone(source),
              id,
              staffIndex,
              durationDivisions: 0,
              durationType: 'eighth' as const,
              isDotted: false,
              isChord: false,
              tieStart: false,
              tiePlacement: undefined,
              lyrics: [],
              articulations: [],
              articulationPlacements: undefined,
              preservedXml: undefined,
            });
          };
          const graceEvent = buildGraceEvent(event, found.staff.staffIndex);
          found.voice.events.splice(eventIndex, 0, graceEvent);
          nextDocument.graceNotes.push({
            id: `grace:${graceEvent.id}`,
            eventId: graceEvent.id,
            slash: command.slash,
          });

          const paired = findPairedStaffVoice(
            found.part,
            command.staffIndex,
            command.measureNumber,
            command.voiceId,
          );
          const expectedPairedPitch = paired
            ? pitchForPairedGuitarStaff(found.part, command.staffIndex, paired.isTab, event.pitch)
            : null;
          const pairedIndex = paired?.voice.events.findIndex((entry) => (
            entry.kind === 'note'
            && !nextDocument.graceNotes.some((grace) => grace.eventId === entry.id)
            && timestampsEqual(entry.timestampNum, entry.timestampDen, command.timestampNum, command.timestampDen)
            && expectedPairedPitch != null
            && pitchMidiNumber(entry.pitch) === pitchMidiNumber(expectedPairedPitch)
          )) ?? -1;
          const pairedEvent = pairedIndex >= 0 ? paired?.voice.events[pairedIndex] : undefined;
          if (pairedEvent?.kind === 'note' && paired) {
            const pairedGrace = buildGraceEvent(pairedEvent, paired.staff.staffIndex);
            paired.voice.events.splice(Math.max(0, pairedIndex), 0, pairedGrace);
            nextDocument.graceNotes.push({
              id: `grace:${pairedGrace.id}`,
              eventId: pairedGrace.id,
              slash: command.slash,
            });
          }
        }
        break;
      }
      case 'removeGraceNote': {
        const found = findVoice(nextDocument, command.measureNumber, command.staffIndex, command.voiceId, command);
        if (!found) break;
        const eventIndex = findCommandEventIndex(found.voice, command);
        const event = found.voice.events[eventIndex];
        if (!event || !nextDocument.graceNotes.some((entry) => entry.eventId === event.id)) break;
        const samePitchGraceOrdinal = event.kind === 'note'
          ? found.voice.events.slice(0, eventIndex).filter((entry) => (
            entry.kind === 'note'
            && nextDocument.graceNotes.some((grace) => grace.eventId === entry.id)
            && timestampsEqual(entry.timestampNum, entry.timestampDen, event.timestampNum, event.timestampDen)
            && pitchMidiNumber(entry.pitch) === pitchMidiNumber(event.pitch)
          )).length
          : 0;
        const deletedEventIds = new Set([event.id]);
        found.voice.events.splice(eventIndex, 1);
        nextDocument.graceNotes = nextDocument.graceNotes.filter((entry) => entry.eventId !== event.id);
        if (event.kind === 'note') {
          const paired = findPairedStaffVoice(
            found.part,
            command.staffIndex,
            command.measureNumber,
            command.voiceId,
          );
          const expectedPairedPitch = paired
            ? pitchForPairedGuitarStaff(found.part, command.staffIndex, paired.isTab, event.pitch)
            : null;
          const pairedGraceIndexes = paired?.voice.events.reduce<number[]>((indexes, entry, index) => {
            if (
              entry.kind === 'note'
              && nextDocument.graceNotes.some((grace) => grace.eventId === entry.id)
              && timestampsEqual(entry.timestampNum, entry.timestampDen, event.timestampNum, event.timestampDen)
              && expectedPairedPitch != null
              && pitchMidiNumber(entry.pitch) === pitchMidiNumber(expectedPairedPitch)
            ) indexes.push(index);
            return indexes;
          }, []) ?? [];
          const pairedIndex = pairedGraceIndexes[samePitchGraceOrdinal] ?? -1;
          if (paired && pairedIndex >= 0) {
            const [pairedEvent] = paired.voice.events.splice(pairedIndex, 1);
            if (pairedEvent) {
              deletedEventIds.add(pairedEvent.id);
              nextDocument.graceNotes = nextDocument.graceNotes.filter((entry) => entry.eventId !== pairedEvent.id);
            }
          }
        }
        removeDeletedEventReferences(nextDocument, deletedEventIds);
        break;
      }
      case 'addFingering': {
        const found = findVoice(nextDocument, command.measureNumber, command.staffIndex, command.voiceId, commandScope(command));
        const event = found?.voice.events[findEventIndex(found.voice, command.timestampNum, command.timestampDen)];
        if (event && event.kind === 'note') {
          ensureNotationFragment(event, 'technical', `<fingering>${command.fingering}</fingering>`);
        }
        break;
      }
      case 'addOrnament': {
        const found = findVoice(nextDocument, command.measureNumber, command.staffIndex, command.voiceId, commandScope(command));
        const event = found?.voice.events[findEventIndex(found.voice, command.timestampNum, command.timestampDen)];
        if (event && event.kind === 'note') {
          ensureNotationFragment(event, 'ornaments', `<${command.ornament}/>`);
        }
        break;
      }
      case 'addWedge': {
        // Assign the next available span number across all wedge directions in the document.
        const usedWedgeNumbers = nextDocument.score.parts
          .flatMap((p) => p.staves)
          .flatMap((s) => s.measures)
          .flatMap((m) => m.directions)
          .filter((d) => d.kind === 'wedge' && d.number != null)
          .map((d) => d.number!);
        const wedgeNumber = usedWedgeNumbers.length > 0 ? Math.max(...usedWedgeNumbers) + 1 : 1;
        const startAdded = ensureMeasure(nextDocument, command.startMeasureNumber, command.staffIndex, commandScope(command));
        const stopAdded = ensureMeasure(nextDocument, command.stopMeasureNumber, command.staffIndex, commandScope(command));
        if (startAdded) {
          startAdded.measure.directions.push({
            id: `wedge:${wedgeNumber}:start:${command.startMeasureNumber}:${Date.now()}`,
            kind: 'wedge',
            value: command.kind,
            number: wedgeNumber,
            placement: command.placement ?? 'below',
            measureNumber: command.startMeasureNumber,
            staffIndex: command.staffIndex,
            timestampNum: command.startTimestampNum,
            timestampDen: command.startTimestampDen,
          });
        }
        if (stopAdded) {
          stopAdded.measure.directions.push({
            id: `wedge:${wedgeNumber}:stop:${command.stopMeasureNumber}:${Date.now()}`,
            kind: 'wedge',
            value: 'stop',
            number: wedgeNumber,
            placement: command.placement ?? 'below',
            measureNumber: command.stopMeasureNumber,
            staffIndex: command.staffIndex,
            timestampNum: command.stopTimestampNum,
            timestampDen: command.stopTimestampDen,
          });
        }
        break;
      }
      case 'addPedalSpan': {
        const usedPedalNumbers = nextDocument.score.parts
          .flatMap((p) => p.staves)
          .flatMap((s) => s.measures)
          .flatMap((m) => m.directions)
          .filter((d) => d.kind === 'pedal' && d.number != null)
          .map((d) => d.number!);
        const pedalNumber = usedPedalNumbers.length > 0 ? Math.max(...usedPedalNumbers) + 1 : 1;
        const startAdded = ensureMeasure(nextDocument, command.startMeasureNumber, command.staffIndex, commandScope(command));
        const stopAdded = ensureMeasure(nextDocument, command.stopMeasureNumber, command.staffIndex, commandScope(command));
        if (startAdded) {
          startAdded.measure.directions.push({
            id: `pedal:${pedalNumber}:start:${command.startMeasureNumber}:${Date.now()}`,
            kind: 'pedal',
            value: 'start',
            number: pedalNumber,
            placement: 'below',
            measureNumber: command.startMeasureNumber,
            staffIndex: command.staffIndex,
            timestampNum: command.startTimestampNum,
            timestampDen: command.startTimestampDen,
          });
        }
        if (stopAdded) {
          stopAdded.measure.directions.push({
            id: `pedal:${pedalNumber}:stop:${command.stopMeasureNumber}:${Date.now()}`,
            kind: 'pedal',
            value: 'stop',
            number: pedalNumber,
            placement: 'below',
            measureNumber: command.stopMeasureNumber,
            staffIndex: command.staffIndex,
            timestampNum: command.stopTimestampNum,
            timestampDen: command.stopTimestampDen,
          });
        }
        break;
      }
      case 'addOttava': {
        const usedNumbers = nextDocument.score.parts
          .flatMap((p) => p.staves)
          .flatMap((s) => s.measures)
          .flatMap((m) => m.directions)
          .filter((d) => d.kind === 'octave-shift' && d.number != null)
          .map((d) => d.number!);
        const ottavaNumber = usedNumbers.length > 0 ? Math.max(...usedNumbers) + 1 : 1;
        // MusicXML 4.0: notes printed an octave higher (8va, 15ma) are an octave-shift "down" from
        // the sounding pitch data; 8vb and 15mb are "up". Size is 8 or 15.
        const ottavaUp = command.kind === '8va' || command.kind === '15ma';
        const ottavaSize = command.kind === '15ma' || command.kind === '15mb' ? 15 : 8;
        const ottavaPlacement = command.placement ?? (ottavaUp ? 'above' : 'below');
        const startAdded = ensureMeasure(nextDocument, command.startMeasureNumber, command.staffIndex, commandScope(command));
        const stopAdded = ensureMeasure(nextDocument, command.stopMeasureNumber, command.staffIndex, commandScope(command));
        if (startAdded) {
          startAdded.measure.directions.push({
            id: `ottava:${ottavaNumber}:start:${command.startMeasureNumber}:${Date.now()}`,
            kind: 'octave-shift',
            value: `${ottavaUp ? 'down' : 'up'}:${ottavaSize}`,
            number: ottavaNumber,
            placement: ottavaPlacement,
            measureNumber: command.startMeasureNumber,
            staffIndex: command.staffIndex,
            timestampNum: command.startTimestampNum,
            timestampDen: command.startTimestampDen,
          });
        }
        if (stopAdded) {
          stopAdded.measure.directions.push({
            id: `ottava:${ottavaNumber}:stop:${command.stopMeasureNumber}:${Date.now()}`,
            kind: 'octave-shift',
            value: `stop:${ottavaSize}`,
            number: ottavaNumber,
            placement: ottavaPlacement,
            measureNumber: command.stopMeasureNumber,
            staffIndex: command.staffIndex,
            timestampNum: command.stopTimestampNum,
            timestampDen: command.stopTimestampDen,
          });
        }
        break;
      }
      case 'pasteContent': {
        const clipboardData = structuredClone(command.clipboardData);
        const target = findPartStaff(nextDocument, command.targetPartId, command.targetStaffIndex);
        if (!target || clipboardData.timeline.length === 0) break;
        if (target.staff.measures.some(measure => measure.voices.some(voice => findPairedStaffVoice(target.part, target.staff.staffIndex, measure.measureNumber, voice.voiceId)))) {
          diagnostics.push({ level: 'warning', code: 'clipboard_command_rejected', message: 'Pasting into linked notation/TAB is not supported. Use linked note input to preserve both staves.' }); break;
        }

        if (clipboardData.sourceDivisions) {
          let grid = clipboardData.sourceDivisions;
          for (const measure of target.staff.measures) grid = lcm(grid, resolveMeasureTiming(target.staff, measure).divisions);
          if (!Number.isSafeInteger(grid) || grid > 1048576) { diagnostics.push({ level: 'warning', code: 'clipboard_command_rejected', message: 'Unsupported clipboard division grid.' }); break; }
          for (const measure of target.staff.measures) setStaffDivisionsAtMeasure(target.staff, measure.measureNumber, grid);
          const factor = grid / clipboardData.sourceDivisions;
          clipboardData.durationDivisions *= factor;
          clipboardData.timeline.forEach(entry => { entry.absStart *= factor; entry.event.timestampNum *= factor; entry.event.timestampDen *= factor; entry.event.durationDivisions *= factor; });
          clipboardData.timedDirections.forEach(entry => { entry.absStart *= factor; });
        }
        const targetAbsoluteOffset = buildTargetAbsoluteOffset(target.staff, command.targetOffset);
        if (targetAbsoluteOffset == null) break;

        const initialTimeline = buildStaffTimeline(target.staff);
        const initialTotalDuration = initialTimeline.reduce((sum, entry) => sum + entry.durationDivisions, 0);
        const requiredTimelineEnd = command.mode === 'insert'
          ? initialTotalDuration + clipboardData.durationDivisions
          : Math.max(initialTotalDuration, targetAbsoluteOffset + clipboardData.durationDivisions);

        ensureStaffTimelineDuration(
          nextDocument,
          target.part.id,
          target.staff.staffIndex,
          requiredTimelineEnd,
        );

        if (command.mode === 'insert') {
          rewriteTimedDirectionsAfterAbsoluteInsert(
            target.staff,
            targetAbsoluteOffset,
            clipboardData.durationDivisions,
            0,
          );
        }

        const laneMappings = resolveClipboardLaneMappings(target.staff, clipboardData);
        const pastedIdentityMap = new Map<string, ClipboardEventIdentity>();
        const deletedEventIds = new Set<string>();

        laneMappings.forEach((mapping) => {
          const currentEvents = flattenVoiceEventsToAbsoluteTimeline(target.staff, mapping.targetVoiceId);
          const pastedLaneEvents = cloneClipboardLaneEvents(
            clipboardData.timeline,
            mapping,
            target.staff.staffIndex,
            targetAbsoluteOffset,
            pastedIdentityMap,
            nextDocument.revision + 1,
          );
          if (pastedLaneEvents.length === 0) return;
          const timeline = buildStaffTimeline(target.staff);
          for (const tuplet of clipboardData.tuplets ?? []) {
            const mapped = tuplet.eventIds.map(id => pastedIdentityMap.get(id)?.selectionEventId);
            if (!mapped.every((id): id is string => Boolean(id))) continue;
            const entries = pastedLaneEvents.filter(entry => mapped.includes(entry.event.id));
            if (!entries.length) continue;
            const destinations = new Set(entries.map(entry => getTimelineEntryForAbsoluteOffset(timeline, entry.absStart)?.measure.id));
            if (destinations.size > 1 || entries.some(entry => { const m = getTimelineEntryForAbsoluteOffset(timeline, entry.absStart)!; return entry.absStart + entry.event.durationDivisions > m.startOffset + m.durationDivisions; })) {
              diagnostics.push({ level: 'warning', code: 'clipboard_command_rejected', message: 'Pasted tuplets must fit completely inside one bar.' }); return;
            }
            const number = Math.max(0, ...nextDocument.tuplets.map(t => t.number)) + 1;
            nextDocument.tuplets.push({ ...structuredClone(tuplet), id: `paste-tuplet:${number}:${mapped[0]}`, number, eventIds: mapped });
          }
          for (const grace of clipboardData.graceNotes ?? []) {
            const eventId = pastedIdentityMap.get(grace.eventId)?.selectionEventId;
            if (eventId && pastedLaneEvents.some(entry => entry.event.id === eventId)) nextDocument.graceNotes.push({ ...grace, id: `grace:${eventId}`, eventId });
          }


          const transformed = command.mode === 'insert'
            ? {
              events: transformAbsoluteInsertTimelineEvents(
                currentEvents,
                targetAbsoluteOffset,
                clipboardData.durationDivisions,
                0,
              ),
              deletedEventIds: new Set<string>(),
            }
            : overwriteAbsoluteTimelineEvents(
              currentEvents,
              targetAbsoluteOffset,
              targetAbsoluteOffset + clipboardData.durationDivisions,
            );

          rewriteVoiceFromAbsoluteTimeline(
            target.staff,
            mapping.targetVoiceId,
            sortAbsoluteVoiceEvents([
              ...transformed.events,
              ...pastedLaneEvents,
            ]),
          );
          transformed.deletedEventIds.forEach((eventId) => deletedEventIds.add(eventId));

          const refreshedTimeline = buildStaffTimeline(target.staff);
          const refreshedEvents = flattenVoiceEventsToAbsoluteTimeline(target.staff, mapping.targetVoiceId);
          const lastAbsoluteEnd = refreshedEvents.reduce(
            (max, entry) => Math.max(max, entry.absStart + entry.event.durationDivisions),
            targetAbsoluteOffset + clipboardData.durationDivisions,
          );
          const firstMeasureNumber = getTimelineEntryForAbsoluteOffset(refreshedTimeline, targetAbsoluteOffset)?.measure.measureNumber
            ?? command.targetOffset.measureNumber;
          const lastMeasureNumber = getTimelineEntryForAbsoluteOffset(
            refreshedTimeline,
            Math.max(targetAbsoluteOffset, lastAbsoluteEnd - 1),
          )?.measure.measureNumber ?? firstMeasureNumber;

          const normalizeResult = normalizeVoiceTimelineAcrossMeasures(nextDocument, target.staff, mapping.targetVoiceId, {
            startMeasureNumber: firstMeasureNumber,
            endMeasureNumber: lastMeasureNumber,
          });

          fillVoiceTimelineGaps(target.staff, mapping.targetVoiceId, {
            startMeasureNumber: firstMeasureNumber,
            endMeasureNumber: lastMeasureNumber,
          });

          const laneEventIds = clipboardData.timeline
            .filter((entry) => (
              entry.sourceStaffIndex === mapping.sourceStaffIndex
              && entry.sourceVoiceId === mapping.sourceVoiceId
            ))
            .map((entry) => entry.event.id);

          laneEventIds.forEach((eventId) => {
            const identity = pastedIdentityMap.get(eventId);
            if (!identity) return;
            const fragments = normalizeResult.fragmentIdMap.get(identity.selectionEventId);
            if (fragments) {
              identity.selectionEventId = fragments.firstFragmentId;
              identity.slurStartEventId = fragments.firstFragmentId;
              identity.slurStopEventId = fragments.lastFragmentId;
            }
          });

          const collapseRemap = collapseTiedFragmentsAcrossMeasures(nextDocument, target.staff, mapping.targetVoiceId, {}, {
            startAbs: targetAbsoluteOffset,
            endAbs: targetAbsoluteOffset + clipboardData.durationDivisions,
          });
          laneEventIds.forEach((eventId) => {
            const identity = pastedIdentityMap.get(eventId);
            if (!identity) return;
            identity.selectionEventId = followSelectionRemap(collapseRemap, identity.selectionEventId);
            identity.slurStartEventId = followSelectionRemap(collapseRemap, identity.slurStartEventId);
            identity.slurStopEventId = followSelectionRemap(collapseRemap, identity.slurStopEventId);
          });
        });

        removeDeletedEventReferences(nextDocument, deletedEventIds);
        pasteClipboardTimedDirections(
          nextDocument,
          target.staff,
          targetAbsoluteOffset,
          clipboardData.timedDirections,
        );
        pasteClipboardSlurs(nextDocument, clipboardData.noteSpanners, pastedIdentityMap);

        const knownEventIds = buildDocumentEventIdSet(nextDocument);
        pastedIdentityMap.forEach((identity, sourceEventId) => {
          if (knownEventIds.has(identity.selectionEventId)) {
            commandSelectionRemap[sourceEventId] = identity.selectionEventId;
          }
        });
        break;
      }
      case 'insertNote':
      case 'insertNoteAt':
      case 'insertRest':
      case 'insertRestAt': {
        const found = ensureVoice(nextDocument, command.measureNumber, command.staffIndex, command.voiceId, command);
        if (!found) break;
        ensureStaffDivisionsForDuration(found.staff, found.measure.measureNumber, command.durationType, command.isDotted);
        const timing = resolveMeasureTiming(found.staff, found.measure);
        const isAbsoluteInsert = command.type === 'insertNoteAt' || command.type === 'insertRestAt';
        if (isAbsoluteInsert && found.voice.voiceId === 1 && found.voice.events.length === 0) {
          found.voice.events = buildRestEventsForSpan(
            found.measure,
            timing.divisions,
            found.staff.staffIndex,
            command.voiceId,
            0,
            timing.durationDivisions,
            requestedDurationDivisions(command.durationType, command.isDotted, timing.divisions),
          );
        }
        const targetTimestampNum = isAbsoluteInsert ? command.timestampNum : command.afterTimestampNum;
        const targetTimestampDen = isAbsoluteInsert ? command.timestampDen : command.afterTimestampDen;
        const anchorIndex = isAbsoluteInsert ? -1 : findEventIndex(found.voice, targetTimestampNum, targetTimestampDen);
        const anchor = anchorIndex >= 0 ? found.voice.events[anchorIndex] : null;
        const requestedDuration = requestedDurationDivisions(command.durationType, command.isDotted, timing.divisions);
        const requestedAbsoluteOffset = timestampToDivisionsOffset(
          timing.divisions,
          targetTimestampNum,
          targetTimestampDen,
        );
        const splitDottedRestFragments = requestedAbsoluteOffset > timing.durationDivisions;
        const rawAbsoluteOffset = Math.min(requestedAbsoluteOffset, timing.durationDivisions);
        const insertionOffset = isAbsoluteInsert
          ? requestedAbsoluteOffset > timing.durationDivisions
            ? clampInsertionOffsetToMeasure(requestedAbsoluteOffset, timing.durationDivisions, requestedDuration)
            : rawAbsoluteOffset
          : anchor ? anchor.timestampNum + anchor.durationDivisions : rawAbsoluteOffset;
        const spanningRestIndex = isAbsoluteInsert
          ? found.voice.events.findIndex((event) => (
              !event.isChord
              && event.kind === 'rest'
              && event.timestampNum <= insertionOffset
              && event.timestampNum + event.durationDivisions >= insertionOffset + requestedDuration
            ))
          : -1;
        const spanningRest = spanningRestIndex >= 0 ? found.voice.events[spanningRestIndex] ?? null : null;

        if (isAbsoluteInsert && !spanningRest && !(command.type === 'insertNoteAt' && command.asChord)) {
          const staffTimeline = buildStaffTimeline(found.staff);
          const currentMeasureTimeline = getTimelineEntryForMeasure(staffTimeline, found.measure.measureNumber);
          if (!currentMeasureTimeline) break;

          const insertionAbsoluteOffset = currentMeasureTimeline.startOffset + insertionOffset;
          const flattenedVoiceEvents = flattenVoiceEventsToAbsoluteTimeline(found.staff, command.voiceId);
          const overflowEstimateEvents = dropRestOnlyTimelineForOverflowEstimate(found.staff, flattenedVoiceEvents);
          const absorbedRestDivisions = computeContiguousRestAbsorption(
            flattenedVoiceEvents,
            insertionAbsoluteOffset,
            requestedDuration,
          );
          const requiredTimelineEnd = estimateAbsoluteInsertTimelineEnd(
            overflowEstimateEvents,
            insertionAbsoluteOffset,
            requestedDuration,
            absorbedRestDivisions,
          );
          const preserveOverflow = command.type === 'insertNoteAt' && command.preserveOverflow !== false;
          const currentMeasureEnd = currentMeasureTimeline.startOffset + currentMeasureTimeline.durationDivisions;
          if (!preserveOverflow && requiredTimelineEnd > currentMeasureEnd) {
            break;
          }

          ensureStaffTimelineDuration(
            nextDocument,
            found.part.id,
            found.staff.staffIndex,
            requiredTimelineEnd,
          );
          rewriteTimedDirectionsAfterAbsoluteInsert(
            found.staff,
            insertionAbsoluteOffset,
            requestedDuration,
            absorbedRestDivisions,
          );

          const transformedVoiceEvents = transformAbsoluteInsertTimelineEvents(
            flattenedVoiceEvents,
            insertionAbsoluteOffset,
            requestedDuration,
            absorbedRestDivisions,
            { splitDottedRestFragments },
          );
          const insertedFragments = buildInsertedOverflowFragments(
            found.staff,
            command,
            insertionAbsoluteOffset,
            requestedDuration,
          );

          rewriteVoiceFromAbsoluteTimeline(
            found.staff,
            command.voiceId,
            [...transformedVoiceEvents, ...insertedFragments],
          );
          const affectedTimeline = buildStaffTimeline(found.staff);
          const lastAffectedMeasure = getTimelineEntryForAbsoluteOffset(
            affectedTimeline,
            Math.max(requiredTimelineEnd - 1, insertionAbsoluteOffset),
          )?.measure.measureNumber ?? found.measure.measureNumber;
          normalizeVoiceTimelineAcrossMeasures(nextDocument, found.staff, command.voiceId, {
            startMeasureNumber: found.measure.measureNumber,
            endMeasureNumber: lastAffectedMeasure,
          });
          fillVoiceTimelineGaps(found.staff, command.voiceId, {
            startMeasureNumber: found.measure.measureNumber,
            endMeasureNumber: lastAffectedMeasure,
          });
          break;
        }

        const inserted = buildInsertedEvent(found.measure, command, insertionOffset, timing.divisions, timing.durationDivisions);
        const pairedGuitarStaff = inserted.kind === 'note' && inserted.guitar
          ? findPairedStaffVoice(
            found.part,
            found.staff.staffIndex,
            command.measureNumber,
            command.voiceId,
          )
          : null;
        if (
          inserted.kind === 'note'
          && inserted.guitar
          && !isTabStaff(found.part, found.staff.staffIndex)
          && pairedGuitarStaff?.isTab
        ) {
          // The TAB controls always produce sounding pitches. In a blank
          // notation+TAB score the clickable rest belongs to the notation
          // staff, so convert that source event to conventional guitar
          // notation before mirroring its sounding pitch to TAB.
          inserted.pitch = guitarSoundingToWrittenPitch(inserted.pitch);
          inserted.guitar = undefined;
        }

        if (spanningRest && !(command.type === 'insertNoteAt' && command.asChord)) {
          found.voice.events.splice(spanningRestIndex, 1);
          const leadingDuration = insertionOffset - spanningRest.timestampNum;
          const trailingOffset = insertionOffset + inserted.durationDivisions;
          const trailingDuration = (spanningRest.timestampNum + spanningRest.durationDivisions) - trailingOffset;

          if (leadingDuration > 0) {
            found.voice.events.push(...buildRestEventsForSpan(
              found.measure,
              timing.divisions,
              command.staffIndex,
              command.voiceId,
              spanningRest.timestampNum,
              leadingDuration,
              inserted.durationDivisions,
            ));
          }
          found.voice.events.push(inserted);
          if (trailingDuration > 0) {
            found.voice.events.push(...buildRestEventsForSpan(
              found.measure,
              timing.divisions,
              command.staffIndex,
              command.voiceId,
              trailingOffset,
              trailingDuration,
              inserted.durationDivisions,
            ));
          }
        } else if (!(command.type === 'insertNoteAt' && command.asChord)) {
          shiftEventsAfter(found.voice, insertionOffset, inserted.durationDivisions);
          found.voice.events.push(inserted);
        } else {
          found.voice.events.push(inserted);
        }
        if ((command.type === 'insertNoteAt' || command.type === 'insertNote') && inserted.kind === 'note') {
          mirrorGuitarInsertionToPairedStaff({
            part: found.part,
            sourceStaffIndex: found.staff.staffIndex,
            command,
            sourceInserted: inserted,
          });
        }
        const preserveOverflow = command.type === 'insertNoteAt' && Boolean(command.preserveOverflow);
        if (!isAbsoluteInsert || !preserveOverflow) {
          constrainVoiceToMeasure(found.voice, timing.durationDivisions, timing.divisions);
        }
        found.voice.events = (
          splitDottedRestFragments
            ? found.voice.events
            : coalesceAdjacentRestsInMeasure(
              found.measure,
              timing.divisions,
              found.staff.staffIndex,
              command.voiceId,
              found.voice.events,
            )
        ).sort((a, b) => a.timestampNum - b.timestampNum);
        if (!isAbsoluteInsert) {
          fillVoiceTimelineGaps(found.staff, command.voiceId, {
            startMeasureNumber: found.measure.measureNumber,
            endMeasureNumber: found.measure.measureNumber,
          });
        }
        break;
      }
      case 'addFermata': {
        const found = findVoice(nextDocument, command.measureNumber, command.staffIndex, command.voiceId, commandScope(command));
        const event = found?.voice.events[findEventIndex(found.voice, command.timestampNum, command.timestampDen)];
        if (event) {
          nextDocument.fermataEventIds.add(event.id);
          if (command.placement === 'above' || command.placement === 'below') {
            setEventArticulationPlacement(event, 'fermata', command.placement);
          }
        }
        break;
      }
      case 'removeFermata': {
        const found = findVoice(nextDocument, command.measureNumber, command.staffIndex, command.voiceId, commandScope(command));
        const event = found?.voice.events[findEventIndex(found.voice, command.timestampNum, command.timestampDen)];
        if (event) {
          nextDocument.fermataEventIds.delete(event.id);
          clearEventArticulationPlacement(event, 'fermata');
        }
        break;
      }
      case 'addTremolo': {
        const found = findVoice(nextDocument, command.measureNumber, command.staffIndex, command.voiceId, commandScope(command));
        const event = found?.voice.events[findEventIndex(found.voice, command.timestampNum, command.timestampDen)];
        if (event) {
          nextDocument.tremolos = nextDocument.tremolos.filter((t) => t.eventId !== event!.id);
          nextDocument.tremolos.push({
            id: `tremolo:${event.id}`,
            eventId: event.id,
            lines: command.lines,
            type: command.tremoloType,
          });
        }
        break;
      }
      case 'addGlissando': {
        const startFound = findVoice(nextDocument, command.start.measureNumber, command.start.staffIndex, command.start.voiceId, commandScope(command.start));
        const startEvent = startFound?.voice.events[findEventIndex(startFound.voice, command.start.timestampNum, command.start.timestampDen)];
        const stopFound = findVoice(nextDocument, command.stop.measureNumber, command.stop.staffIndex, command.stop.voiceId, commandScope(command.stop));
        const stopEvent = stopFound?.voice.events[findEventIndex(stopFound.voice, command.stop.timestampNum, command.stop.timestampDen)];
        if (startEvent && stopEvent) {
          const nextNumber = (nextDocument.glissandos.reduce((max, g) => Math.max(max, g.number), 0)) + 1;
          nextDocument.glissandos.push({
            id: `gliss:${startEvent.id}:${stopEvent.id}`,
            number: nextNumber,
            startEventId: startEvent.id,
            stopEventId: stopEvent.id,
            lineType: command.lineType,
            text: command.text,
          });
        }
        break;
      }
      case 'addArpeggio': {
        const found = findVoice(nextDocument, command.measureNumber, command.staffIndex, command.voiceId, commandScope(command));
        const event = found?.voice.events[findEventIndex(found.voice, command.timestampNum, command.timestampDen)];
        if (event) {
          nextDocument.arpeggios = nextDocument.arpeggios.filter((a) => a.eventId !== event!.id);
          nextDocument.arpeggios.push({
            id: `arpeggio:${event.id}`,
            eventId: event.id,
            direction: command.direction,
            nonArpeggiate: command.nonArpeggiate,
          });
        }
        break;
      }
      case 'addSegno': {
        const part = nextDocument.score.parts[0];
        const staff = part?.staves.find((s) => s.staffIndex === (command.staffIndex ?? 1));
        const measure = staff?.measures.find((m) => m.measureNumber === command.measureNumber);
        if (measure) {
          measure.directions = measure.directions.filter((d) => d.kind !== 'segno');
          measure.directions.push({
            id: `segno:${command.measureNumber}`,
            kind: 'segno',
            placement: command.placement,
            measureNumber: command.measureNumber,
            staffIndex: command.staffIndex,
          });
        }
        break;
      }
      case 'addCoda': {
        const part = nextDocument.score.parts[0];
        const staff = part?.staves.find((s) => s.staffIndex === (command.staffIndex ?? 1));
        const measure = staff?.measures.find((m) => m.measureNumber === command.measureNumber);
        if (measure) {
          measure.directions = measure.directions.filter((d) => d.kind !== 'coda');
          measure.directions.push({
            id: `coda:${command.measureNumber}`,
            kind: 'coda',
            placement: command.placement,
            measureNumber: command.measureNumber,
            staffIndex: command.staffIndex,
          });
        }
        break;
      }
      case 'addDacapo': {
        const part = nextDocument.score.parts[0];
        const staff = part?.staves.find((s) => s.staffIndex === (command.staffIndex ?? 1));
        const measure = staff?.measures.find((m) => m.measureNumber === command.measureNumber);
        if (measure) {
          measure.directions = measure.directions.filter((d) => d.kind !== 'words' || d.value !== 'D.C.');
          measure.directions.push({
            id: `dacapo:${command.measureNumber}`,
            kind: 'words',
            value: 'D.C.',
            measureNumber: command.measureNumber,
            staffIndex: command.staffIndex,
          });
        }
        break;
      }
      case 'addDalsegno': {
        const part = nextDocument.score.parts[0];
        const staff = part?.staves.find((s) => s.staffIndex === (command.staffIndex ?? 1));
        const measure = staff?.measures.find((m) => m.measureNumber === command.measureNumber);
        if (measure) {
          measure.directions = measure.directions.filter((d) => d.kind !== 'words' || d.value !== 'D.S.');
          measure.directions.push({
            id: `dalsegno:${command.measureNumber}`,
            kind: 'words',
            value: 'D.S.',
            measureNumber: command.measureNumber,
            staffIndex: command.staffIndex,
          });
        }
        break;
      }
      case 'addFine': {
        const part = nextDocument.score.parts[0];
        const staff = part?.staves.find((s) => s.staffIndex === (command.staffIndex ?? 1));
        const measure = staff?.measures.find((m) => m.measureNumber === command.measureNumber);
        if (measure) {
          measure.directions = measure.directions.filter((d) => d.kind !== 'words' || d.value !== 'Fine');
          measure.directions.push({
            id: `fine:${command.measureNumber}`,
            kind: 'words',
            value: 'Fine',
            measureNumber: command.measureNumber,
            staffIndex: command.staffIndex,
          });
        }
        break;
      }
      case 'addToCoda': {
        const part = nextDocument.score.parts[0];
        const staff = part?.staves.find((s) => s.staffIndex === (command.staffIndex ?? 1));
        const measure = staff?.measures.find((m) => m.measureNumber === command.measureNumber);
        if (measure) {
          measure.directions = measure.directions.filter((d) => d.kind !== 'words' || d.value !== 'To Coda');
          measure.directions.push({
            id: `tocoda:${command.measureNumber}`,
            kind: 'words',
            value: 'To Coda',
            measureNumber: command.measureNumber,
            staffIndex: command.staffIndex,
          });
        }
        break;
      }
      case 'setMeasureRepeat': {
        for (const part of nextDocument.score.parts) {
          for (const staff of part.staves) {
            const measure = staff.measures.find((m) => m.measureNumber === command.measureNumber);
            if (measure) {
              measure.measureRepeat = command.repeatCount;
            }
          }
        }
        break;
      }
      case 'addTempoText': {
        const part = nextDocument.score.parts[0];
        const staff = part?.staves.find((s) => s.staffIndex === (command.staffIndex ?? 1));
        const measure = staff?.measures.find((m) => m.measureNumber === command.measureNumber);
        if (measure) {
          measure.directions = measure.directions.filter((d) => d.kind !== 'metronome' || d.staffIndex !== (command.staffIndex ?? 1));
          const dir: any = {
            id: `tempo:${command.measureNumber}`,
            kind: 'metronome',
            value: String(command.bpm ?? 120),
            measureNumber: command.measureNumber,
            staffIndex: command.staffIndex,
          };
          if (command.bpm == null && command.text) {
            dir.kind = 'words';
            dir.value = command.text;
          }
          measure.directions.push(dir);
        }
        break;
      }
      case 'setSwing': {
        nextDocument.swingRatio = command.ratio;
        break;
      }
      case 'setInstrumentChange': {
        for (const part of nextDocument.score.parts) {
          if (command.partId && part.sourcePartId !== command.partId) continue;
          const staff = part.staves.find((s) => s.staffIndex === 1);
          const measure = staff?.measures.find((m) => m.measureNumber === command.measureNumber);
          if (measure) {
            measure.directions = measure.directions.filter((d) => d.kind !== 'words' || !d.value?.startsWith('Instrument:'));
            measure.directions.push({
              id: `instrument:${command.measureNumber}`,
              kind: 'words',
              value: `Instrument: ${command.instrumentName}`,
              measureNumber: command.measureNumber,
            });
          }
        }
        break;
      }
      case 'setCueNote': {
        const found = findVoice(nextDocument, command.measureNumber, command.staffIndex, command.voiceId, commandScope(command));
        const event = found?.voice.events[findEventIndex(found.voice, command.timestampNum, command.timestampDen)];
        // A cue note keeps its value and duration; MusicXML marks it with <cue/> before the pitch,
        // the same fragment the importer preserves. Grace notes cannot also be cue notes.
        if (!event || event.kind !== 'note') {
          diagnostics.push({ level: 'warning', code: 'cue_command_rejected', message: 'Select a note to mark it as a cue note.' });
          break;
        }
        if (nextDocument.graceNotes.some((graceNote) => graceNote.eventId === event.id)) {
          diagnostics.push({ level: 'warning', code: 'cue_command_rejected', message: 'A grace note cannot also be a cue note.' });
          break;
        }
        const withoutCue = (event.preservedXml?.beforePitch ?? []).filter((fragment) => !/^<cue\s*\/>$/.test(fragment.trim()));
        event.preservedXml = {
          ...event.preservedXml,
          beforePitch: command.isCue ? ['<cue/>', ...withoutCue] : withoutCue,
        };
        break;
      }
      case 'setMultiMeasureRest': {
        for (const part of nextDocument.score.parts) {
          for (const staff of part.staves) {
            const measure = staff.measures.find((m) => m.measureNumber === command.measureNumber);
            if (measure) {
              measure.multiMeasureRest = command.enabled || undefined;
            }
          }
        }
        break;
      }
      case 'addGuitarBend': {
        const found = findVoice(nextDocument, command.measureNumber, command.staffIndex, command.voiceId, commandScope(command));
        const event = found?.voice.events[findEventIndex(found.voice, command.timestampNum, command.timestampDen)];
        // Bends belong to a fretted note; inventing string 1, fret 0 would contradict its pitch.
        if (!event || event.kind !== 'note' || !event.guitar) {
          diagnostics.push({ level: 'warning', code: 'guitar_command_rejected', message: 'Select a TAB note with a string and fret to add a bend.' });
          break;
        }
        {
          const techniques = event.guitar.techniques ?? [];
          if (!techniques.includes('bend')) event.guitar.techniques = [...techniques, 'bend'];
          const semitones = Number(command.bendSemitones);
          if (Number.isFinite(semitones) && semitones > 0 && semitones !== 1) event.guitar.bendAlter = semitones;
          else delete event.guitar.bendAlter;
        }
        break;
      }
      case 'addGuitarTap': {
        const found = findVoice(nextDocument, command.measureNumber, command.staffIndex, command.voiceId, commandScope(command));
        const event = found?.voice.events[findEventIndex(found.voice, command.timestampNum, command.timestampDen)];
        if (!event || event.kind !== 'note' || !event.guitar) {
          diagnostics.push({ level: 'warning', code: 'guitar_command_rejected', message: 'Select a TAB note with a string and fret to add a tap.' });
          break;
        }
        {
          const techniques = event.guitar.techniques ?? [];
          if (!techniques.includes('tap')) event.guitar.techniques = [...techniques, 'tap'];
        }
        break;
      }
      default:
        break;
    }

    selectionRemap = mergeSelectionRemaps(selectionRemap, commandSelectionRemap);
  }

  if (diagnostics.some(diagnostic => diagnostic.code.endsWith('_rejected'))) {
    return { coreDocument: currentDocument, diagnostics, selectionRemap: {} };
  }

  const rhythmSpellingTargets: RhythmSpellingTarget[] = [];
  const noteEntryBatch = commands.some((command) => (
    command.type === 'changeNotePitch'
    || command.type === 'insertNote'
    || command.type === 'insertNoteAt'
    || command.type === 'insertRest'
    || command.type === 'insertRestAt'
  ));
  for (const command of commands) {
    if (!RHYTHM_SPELLING_COMMANDS.has(command.type)) continue;
    if (command.type === 'changeNoteDuration' && !noteEntryBatch) continue;
    const candidate = command as {
      measureNumber?: unknown;
      staffIndex?: unknown;
      voiceId?: unknown;
      timestampNum?: unknown;
      timestampDen?: unknown;
      corePartId?: unknown;
    };
    if (
      !Number.isFinite(candidate.measureNumber)
      || !Number.isFinite(candidate.staffIndex)
      || !Number.isFinite(candidate.voiceId)
      || !Number.isFinite(candidate.timestampNum)
      || !Number.isFinite(candidate.timestampDen)
    ) continue;
    rhythmSpellingTargets.push({
      partId: typeof candidate.corePartId === 'string' ? candidate.corePartId : null,
      measureNumber: Number(candidate.measureNumber),
      staffIndex: Number(candidate.staffIndex),
      voiceId: Number(candidate.voiceId),
      timestampNum: Number(candidate.timestampNum),
      timestampDen: Number(candidate.timestampDen),
    });
  }
  if (noteEntryBatch && nextDocument.accidentalPolicy && nextDocument.accidentalPolicy !== 'none') {
    const oldEvents = new Map(currentDocument.score.parts.flatMap(p => p.staves.flatMap(s => s.measures.flatMap(m => m.voices.flatMap(v => v.events.map(e => [e.id, e] as const))))));
    for (const part of nextDocument.score.parts) for (const staff of part.staves) for (const measure of staff.measures) {
      const previous = staff.measures.filter(m => m.measureNumber < measure.measureNumber).at(-1);
      for (const event of measure.voices.flatMap(v => v.events)) {
        if (event.kind !== 'note' || event.writtenAccidental) continue;
        const old = oldEvents.get(event.id);
        if (old?.kind === 'note' && JSON.stringify(old.pitch) === JSON.stringify(event.pitch)) continue;
        const needsReminder = nextDocument.accidentalPolicy === 'always' || previous?.voices.some(v => v.events.some(e => e.kind === 'note'
          && e.pitch.step === event.pitch.step && e.pitch.octave === event.pitch.octave && e.pitch.alter !== event.pitch.alter));
        const glyphs = ['double-flat', 'flat', 'natural', 'sharp', 'double-sharp'] as const;
        const glyph = glyphs[event.pitch.alter + 2];
        if (needsReminder && glyph) {
          event.writtenAccidental = glyph;
          event.accidentalCautionary = true;
          event.accidentalEnclosure = 'round';
        }
      }
    }
  }
  applyRhythmSpellingToDocument(nextDocument, rhythmSpellingTargets);
  rebuildDefaultBeams(nextDocument, currentDocument);
  // Graces first: a tie must not survive because it ran into a grace note that is removed here.
  pruneGracesWithoutMainNote(nextDocument, currentDocument);
  pruneDanglingTieStarts(nextDocument);
  nextDocument.index = rebuildScoreIndex(nextDocument);
  nextDocument.revision += 1;
  return {
    coreDocument: nextDocument,
    selectionRemap,
    diagnostics,
  };
}

export function applyCoreCommands(
  currentDocument: ScoreDocumentModel,
  commands: ValidatedScoreCommand[],
): ScoreDocumentModel {
  return executeCoreCommands(currentDocument, commands).coreDocument;
}
