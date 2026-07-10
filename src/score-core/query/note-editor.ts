import type { NoteClipboardItem, NotePitchSnapshot } from '@/lib/note-editor';
import type {
  DirectionNode,
  MeasureNode,
  PartNode,
  ScoreDocumentModel,
  StaffNode,
  TimedEvent,
  VoiceNode,
} from '@/src/score-core/model/types';
import type { ScoreDocumentSelectionAnchor } from '@/src/score-session/types';
import { timestampsEqual } from '@/src/shared/music/timestamp-match';
import type { AccidentalEnclosure, WrittenAccidental } from '@/src/shared/music/accidentals';

export interface ScoreEventLocator {
  coreEntityId?: string | null;
  coreMeasureId?: string | null;
  corePartId?: string | null;
  measureNumber: number;
  staffIndex: number;
  voiceId: number;
  timestampNum: number;
  timestampDen: number;
}

export interface SemanticSelectionEntry extends ScoreEventLocator {
  coreEntityId: string;
  coreVoiceId: string;
  coreMeasureId: string;
  corePartId: string;
  step: string;
  octave: number;
  alter: number;
  writtenAccidental?: WrittenAccidental;
  accidentalCautionary?: boolean;
  accidentalEnclosure?: Exclude<AccidentalEnclosure, 'none'>;
  isRest: boolean;
  durationType?: string;
  isDotted?: boolean;
  guitar?: Extract<TimedEvent, { kind: 'note' }>['guitar'];
}

export interface ScoreEventReference {
  part: PartNode;
  staff: StaffNode;
  measure: MeasureNode;
  voice: VoiceNode;
  event: TimedEvent;
}

const semanticSelectionCache = new WeakMap<ScoreDocumentModel, SemanticSelectionEntry[]>();

function selectionTimestampValue(note: Pick<SemanticSelectionEntry, 'timestampNum' | 'timestampDen'>) {
  return note.timestampNum / Math.max(note.timestampDen, 1);
}

export function compareSemanticSelectionEntries(a: SemanticSelectionEntry, b: SemanticSelectionEntry) {
  return a.measureNumber - b.measureNumber
    || a.staffIndex - b.staffIndex
    || a.voiceId - b.voiceId
    || selectionTimestampValue(a) - selectionTimestampValue(b)
    || a.step.localeCompare(b.step)
    || a.octave - b.octave
    || a.alter - b.alter;
}

function buildSemanticSelectionEntry(
  part: PartNode,
  measure: MeasureNode,
  voice: VoiceNode,
  event: TimedEvent,
): SemanticSelectionEntry {
  return {
    coreEntityId: event.id,
    coreVoiceId: voice.id,
    coreMeasureId: measure.id,
    corePartId: part.id,
    measureNumber: event.measureNumber,
    staffIndex: event.staffIndex,
    voiceId: event.voiceId,
    timestampNum: event.timestampNum,
    timestampDen: event.timestampDen,
    step: event.kind === 'note' ? event.pitch.step : 'C',
    octave: event.kind === 'note' ? event.pitch.octave : 4,
    alter: event.kind === 'note' ? event.pitch.alter : 0,
    writtenAccidental: event.kind === 'note' ? event.writtenAccidental : undefined,
    accidentalCautionary: event.kind === 'note' ? event.accidentalCautionary : undefined,
    accidentalEnclosure: event.kind === 'note' ? event.accidentalEnclosure : undefined,
    isRest: event.kind === 'rest',
    durationType: event.durationType,
    isDotted: event.isDotted,
    guitar: event.kind === 'note' ? event.guitar : undefined,
  };
}

export function buildSemanticSelectionEntries(document: ScoreDocumentModel | null | undefined): SemanticSelectionEntry[] {
  if (!document) return [];
  const cached = semanticSelectionCache.get(document);
  if (cached) return cached;

  const ordered = document.score.parts
    .flatMap((part) => part.staves.flatMap((staff) => staff.measures.flatMap((measure) => measure.voices.flatMap((voice) => (
      [...voice.events]
        .sort((a, b) => (
          selectionTimestampValue(a) - selectionTimestampValue(b)
          || Number(a.isChord) - Number(b.isChord)
        ))
        .map((event) => buildSemanticSelectionEntry(part, measure, voice, event))
    )))))
    .sort(compareSemanticSelectionEntries);

  semanticSelectionCache.set(document, ordered);
  return ordered;
}

export function findEventReference(
  document: ScoreDocumentModel | null | undefined,
  target: ScoreEventLocator,
): ScoreEventReference | null {
  if (!document) return null;

  for (const part of document.score.parts) {
    if (target.corePartId && part.id !== target.corePartId) continue;
    for (const staff of part.staves) {
      if (staff.staffIndex !== target.staffIndex) continue;
      const measure = staff.measures.find((entry) => (
        target.coreMeasureId
          ? entry.id === target.coreMeasureId
          : entry.measureNumber === target.measureNumber
      ));
      const voice = measure?.voices.find((entry) => entry.voiceId === target.voiceId);
      const timestampMatches = (entry: TimedEvent) => (
        timestampsEqual(entry.timestampNum, entry.timestampDen, target.timestampNum, target.timestampDen)
      );
      const event = target.coreEntityId
        ? voice?.events.find((entry) => entry.id === target.coreEntityId && timestampMatches(entry))
          ?? voice?.events.find(timestampMatches)
        : voice?.events.find(timestampMatches);
      if (measure && voice && event) {
        return { part, staff, measure, voice, event };
      }
    }
  }

  return null;
}

export function findSemanticSelectionEntry(
  document: ScoreDocumentModel | null | undefined,
  target: ScoreEventLocator,
): SemanticSelectionEntry | null {
  const ref = findEventReference(document, target);
  return ref ? buildSemanticSelectionEntry(ref.part, ref.measure, ref.voice, ref.event) : null;
}

function compareVoiceOnsets(left: SemanticSelectionEntry, right: SemanticSelectionEntry) {
  return left.measureNumber - right.measureNumber
    || (left.timestampNum / Math.max(left.timestampDen, 1)) - (right.timestampNum / Math.max(right.timestampDen, 1));
}

function samePitch(left: SemanticSelectionEntry, right: SemanticSelectionEntry) {
  return !left.isRest
    && !right.isRest
    && left.step === right.step
    && left.alter === right.alter
    && left.octave === right.octave;
}

/** Expands selected notes to complete tied pitch chains without crossing part, staff, or voice lanes. */
export function expandSelectionWithTiedNotes(
  document: ScoreDocumentModel | null | undefined,
  selected: SemanticSelectionEntry[],
): SemanticSelectionEntry[] {
  if (!document || selected.length === 0) return selected;
  const allEntries = buildSemanticSelectionEntries(document);
  const selectedById = new Map(selected.map((entry) => [entry.coreEntityId, entry]));

  const tieStartIds = new Set<string>();
  for (const part of document.score.parts) {
    for (const staff of part.staves) {
      for (const measure of staff.measures) {
        for (const voice of measure.voices) {
          for (const event of voice.events) {
            if (event.kind === 'note' && event.tieStart) tieStartIds.add(event.id);
          }
        }
      }
    }
  }

  const laneKey = (entry: SemanticSelectionEntry) => (
    `${entry.corePartId}:${entry.staffIndex}:${entry.voiceId}`
  );
  const laneEntries = new Map<string, SemanticSelectionEntry[]>();
  for (const entry of allEntries) {
    if (entry.isRest) continue;
    const key = laneKey(entry);
    const lane = laneEntries.get(key) ?? [];
    lane.push(entry);
    laneEntries.set(key, lane);
  }
  const laneGroups = new Map<string, SemanticSelectionEntry[][]>();
  const groupIndexByEventId = new Map<string, number>();
  for (const [key, entries] of laneEntries) {
    const groups = entries.sort(compareVoiceOnsets).reduce<SemanticSelectionEntry[][]>((result, entry) => {
      const group = result[result.length - 1];
      if (
        !group
        || group[0]!.measureNumber !== entry.measureNumber
        || !timestampsEqual(group[0]!.timestampNum, group[0]!.timestampDen, entry.timestampNum, entry.timestampDen)
      ) {
        result.push([entry]);
      } else {
        group.push(entry);
      }
      return result;
    }, []);
    groups.forEach((group, groupIndex) => {
      group.forEach((entry) => groupIndexByEventId.set(entry.coreEntityId, groupIndex));
    });
    laneGroups.set(key, groups);
  }

  for (const seed of selected) {
    if (seed.isRest) continue;
    const onsetGroups = laneGroups.get(laneKey(seed));
    const seedGroupIndex = groupIndexByEventId.get(seed.coreEntityId);
    if (!onsetGroups || seedGroupIndex == null) continue;

    let current = seed;
    for (let groupIndex = seedGroupIndex - 1; groupIndex >= 0; groupIndex -= 1) {
      const previous = onsetGroups[groupIndex]!.find((entry) => {
        if (!samePitch(entry, current)) return false;
        return tieStartIds.has(entry.coreEntityId);
      });
      if (!previous) break;
      selectedById.set(previous.coreEntityId, previous);
      current = previous;
    }

    current = seed;
    for (let groupIndex = seedGroupIndex + 1; groupIndex < onsetGroups.length; groupIndex += 1) {
      if (!tieStartIds.has(current.coreEntityId)) break;
      const next = onsetGroups[groupIndex]!.find((entry) => samePitch(entry, current));
      if (!next) break;
      selectedById.set(next.coreEntityId, next);
      current = next;
    }
  }

  return [...selectedById.values()].sort(compareSemanticSelectionEntries);
}

export function extractClipboardItemFromDocument(
  document: ScoreDocumentModel | null | undefined,
  locator: ScoreEventLocator,
): NoteClipboardItem | null {
  const ref = findEventReference(document, locator);
  if (!ref) return null;

  const { event } = ref;
  return {
    isRest: event.kind === 'rest',
    step: event.kind === 'note' ? event.pitch.step : 'C',
    octave: event.kind === 'note' ? event.pitch.octave : 4,
    alter: event.kind === 'note' ? event.pitch.alter : 0,
    writtenAccidental: event.kind === 'note' ? event.writtenAccidental : undefined,
    accidentalCautionary: event.kind === 'note' ? event.accidentalCautionary : undefined,
    accidentalEnclosure: event.kind === 'note' ? event.accidentalEnclosure : undefined,
    durationType: event.durationType ?? 'quarter',
    isDotted: Boolean(event.isDotted),
    voiceId: event.voiceId,
    staffIndex: event.staffIndex,
    measureNumber: event.measureNumber,
    timestampNum: event.timestampNum,
    timestampDen: event.timestampDen,
  };
}

export function extractPitchSnapshotFromDocument(
  document: ScoreDocumentModel | null | undefined,
  locator: ScoreEventLocator,
): NotePitchSnapshot | null {
  const ref = findEventReference(document, locator);
  if (!ref) return null;

  const { event } = ref;
  return {
    isRest: event.kind === 'rest',
    step: event.kind === 'note' ? event.pitch.step : 'C',
    octave: event.kind === 'note' ? event.pitch.octave : 4,
    alter: event.kind === 'note' ? event.pitch.alter : 0,
  };
}

export function resolveSelectionAnchorEntries(
  document: ScoreDocumentModel | null | undefined,
  anchor: ScoreDocumentSelectionAnchor | null | undefined,
): SemanticSelectionEntry[] {
  if (!anchor) return [];

  const ordered = buildSemanticSelectionEntries(document);
  if (anchor.entityIds.length > 0) {
    const byIds = ordered.filter((entry) => anchor.entityIds.includes(entry.coreEntityId));
    if (byIds.length > 0) return byIds;
  }

  if (anchor.anchorEntityId) {
    const byAnchorId = ordered.filter((entry) => entry.coreEntityId === anchor.anchorEntityId);
    if (byAnchorId.length > 0) return byAnchorId;
  }

  if (anchor.selectionLocators?.length) {
    const byLocators = ordered.filter((entry) => anchor.selectionLocators?.some((locator) => (
      (!locator.corePartId || entry.corePartId === locator.corePartId)
      && (!locator.coreMeasureId || entry.coreMeasureId === locator.coreMeasureId)
      && entry.measureNumber === locator.measureNumber
      && entry.staffIndex === locator.staffIndex
      && entry.voiceId === locator.voiceId
      && timestampsEqual(entry.timestampNum, entry.timestampDen, locator.timestampNum, locator.timestampDen)
    )));
    if (byLocators.length > 0) return byLocators;
  }

  if (anchor.anchorLocator) {
    const byLocator = ordered.filter((entry) => (
      (!anchor.anchorLocator?.corePartId || entry.corePartId === anchor.anchorLocator.corePartId)
      && (!anchor.anchorLocator?.coreMeasureId || entry.coreMeasureId === anchor.anchorLocator.coreMeasureId)
      && entry.measureNumber === anchor.anchorLocator?.measureNumber
      && entry.staffIndex === anchor.anchorLocator?.staffIndex
      && entry.voiceId === anchor.anchorLocator?.voiceId
      && timestampsEqual(
        entry.timestampNum,
        entry.timestampDen,
        anchor.anchorLocator?.timestampNum ?? 0,
        anchor.anchorLocator?.timestampDen ?? 1,
      )
    ));
    if (byLocator.length > 0) return byLocator;
  }

  return [];
}

export function findDirectionByText(
  document: ScoreDocumentModel | null | undefined,
  text: string,
  options?: {
    measureNumber?: number | null;
    staffIndex?: number | null;
  },
): { measure: MeasureNode; staff: StaffNode; direction: DirectionNode } | null {
  if (!document) return null;

  for (const part of document.score.parts) {
    for (const staff of part.staves) {
      if (options?.staffIndex != null && staff.staffIndex !== options.staffIndex) continue;
      for (const measure of staff.measures) {
        if (options?.measureNumber != null && measure.measureNumber !== options.measureNumber) continue;
        const direction = measure.directions.find((entry) => (
          entry.value?.trim() === text
          && (options?.staffIndex == null || entry.staffIndex == null || entry.staffIndex === options.staffIndex)
        ));
        if (direction) return { measure, staff, direction };
      }
    }
  }

  return null;
}
