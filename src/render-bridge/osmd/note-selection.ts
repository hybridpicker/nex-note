import type { SelectedNote } from '@/hooks/useNoteEditor';
import type { ScoreDocumentModel, TimedEvent } from '@/src/score-core/model/types';
import { noteTimestampValue } from '@/src/score-core/rhythm-utils';
import { timestampsEqual } from '@/src/shared/music/timestamp-match';
import { dbg } from '@/lib/debug';

export interface PointLike {
  x: number;
  y: number;
}

export interface RectLike {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RenderedNote {
  id: string;
  coreEntityId: string | null;
  note: SelectedNote;
  svgCenter: PointLike;
  domCenter: PointLike;
  domRect: RectLike;
  svgElement: SVGGElement | null;
  tintElement: SVGElement | null;
}

interface SemanticTargetCandidate {
  note: SelectedNote;
  sortX: number;
  sortY: number;
}

interface TimedEventMatch {
  partId: string;
  measureId: string;
  voiceId: string;
  event: TimedEvent;
  visualOrder: number;
}

function matchesTimedEvent(note: SelectedNote, event: TimedEvent) {
  if (event.measureNumber !== note.measureNumber) return false;
  if (event.staffIndex !== note.staffIndex) return false;
  if (event.voiceId !== note.voiceId) return false;
  if (!timestampsEqual(event.timestampNum, event.timestampDen, note.timestampNum, note.timestampDen)) return false;
  if (note.isRest) return event.kind === 'rest';
  if (event.kind !== 'note') return false;
  return event.pitch.step === note.step
    && event.pitch.octave === note.octave
    && event.pitch.alter === note.alter;
}

function eventStartRatio(event: TimedEvent) {
  return event.timestampNum / Math.max(event.timestampDen, 1);
}

function eventDurationRatio(event: TimedEvent, divisions: number) {
  return Math.max(event.durationDivisions, 0) / Math.max(divisions * 4, 1);
}

function effectiveMeasureDivisions(measure: ScoreDocumentModel['score']['parts'][number]['staves'][number]['measures'][number]) {
  const attribute = [...measure.attributes].reverse().find((entry) => typeof entry.divisions === 'number');
  return Math.max(attribute?.divisions ?? 1, 1);
}

function findRestSpanEventInVoice(
  note: SelectedNote,
  measure: ScoreDocumentModel['score']['parts'][number]['staves'][number]['measures'][number],
  voice: ScoreDocumentModel['score']['parts'][number]['staves'][number]['measures'][number]['voices'][number],
) {
  if (!note.isRest) return null;
  const noteRatio = note.timestampNum / Math.max(note.timestampDen, 1);
  const divisions = effectiveMeasureDivisions(measure);

  const restEvents = voice.events.filter((entry) => (
    entry.kind === 'rest'
    && entry.measureNumber === note.measureNumber
    && entry.staffIndex === note.staffIndex
    && entry.voiceId === note.voiceId
  ));
  const spanMatch = restEvents.find((entry) => {
    if (entry.kind !== 'rest') return false;
    const start = eventStartRatio(entry);
    const end = start + eventDurationRatio(entry, divisions);
    return noteRatio >= start - 1e-6 && noteRatio < end - 1e-6;
  });
  if (spanMatch) return spanMatch;

  return restEvents.length === 1 ? restEvents[0]! : null;
}

function findRestSpanEventMatches(note: SelectedNote, coreDocument?: ScoreDocumentModel | null): TimedEventMatch[] {
  if (!coreDocument || !note.isRest) return [];

  const matches: TimedEventMatch[] = [];
  let visualOrder = 0;
  for (const part of coreDocument.score.parts) {
    for (const staff of part.staves) {
      const currentVisualOrder = visualOrder++;
      if (staff.staffIndex !== note.staffIndex) continue;
      const measure = staff.measures.find((entry) => entry.measureNumber === note.measureNumber);
      if (!measure) continue;
      const voice = measure.voices.find((entry) => entry.voiceId === note.voiceId);
      if (!voice) continue;

      const event = findRestSpanEventInVoice(note, measure, voice);
      if (!event) continue;

      matches.push({
        partId: part.id,
        measureId: measure.id,
        voiceId: voice.id,
        event,
        visualOrder: currentVisualOrder,
      });
    }
  }

  return matches;
}

function findRestSpanEventMatch(note: SelectedNote, coreDocument?: ScoreDocumentModel | null): TimedEventMatch | null {
  return findRestSpanEventMatches(note, coreDocument)[0] ?? null;
}

function findCoreIdentity(note: SelectedNote, coreDocument?: ScoreDocumentModel | null) {
  if (!coreDocument) {
    return {
      coreEntityId: null,
      coreVoiceId: null,
      coreMeasureId: null,
      corePartId: null,
      durationType: note.durationType,
      isDotted: note.isDotted,
    };
  }

  for (const part of coreDocument.score.parts) {
    for (const staff of part.staves) {
      if (staff.staffIndex !== note.staffIndex) continue;
      const measure = staff.measures.find((entry) => entry.measureNumber === note.measureNumber);
      if (!measure) continue;
      const voice = measure.voices.find((entry) => entry.voiceId === note.voiceId);
      if (!voice) continue;
      const restSpanMatch = findRestSpanEventInVoice(note, measure, voice);
      if (restSpanMatch) {
        return {
          coreEntityId: restSpanMatch.id,
          coreVoiceId: voice.id,
          coreMeasureId: measure.id,
          corePartId: part.id,
          durationType: restSpanMatch.durationType,
          isDotted: restSpanMatch.isDotted,
        };
      }
      const timestampMatches = voice.events.filter((entry) => (
        entry.measureNumber === note.measureNumber
        && entry.staffIndex === note.staffIndex
        && entry.voiceId === note.voiceId
        && timestampsEqual(entry.timestampNum, entry.timestampDen, note.timestampNum, note.timestampDen)
      ));
      if (timestampMatches.length === 0) continue;

      const exactMatch = timestampMatches.find((entry) => matchesTimedEvent(note, entry));
      const event = exactMatch ?? (timestampMatches.length === 1 ? timestampMatches[0] : null);
      if (!event) continue;

      return {
        coreEntityId: event.id,
        coreVoiceId: voice.id,
        coreMeasureId: measure.id,
        corePartId: part.id,
        durationType: event.durationType,
        isDotted: event.isDotted,
        guitar: event.kind === 'note' ? event.guitar : undefined,
      };
    }
  }

  return {
    coreEntityId: null,
    coreVoiceId: null,
    coreMeasureId: null,
    corePartId: null,
    durationType: note.durationType,
    isDotted: note.isDotted,
  };
}

function findExactTimedEventMatch(note: SelectedNote, coreDocument?: ScoreDocumentModel | null): TimedEventMatch | null {
  if (!coreDocument) return null;

  let visualOrder = 0;
  for (const part of coreDocument.score.parts) {
    for (const staff of part.staves) {
      const currentVisualOrder = visualOrder++;
      if (staff.staffIndex !== note.staffIndex) continue;
      const measure = staff.measures.find((entry) => entry.measureNumber === note.measureNumber);
      if (!measure) continue;
      const voice = measure.voices.find((entry) => entry.voiceId === note.voiceId);
      if (!voice) continue;
      const event = voice.events.find((entry) => matchesTimedEvent(note, entry));
      if (!event) continue;
      return {
        partId: part.id,
        measureId: measure.id,
        voiceId: voice.id,
        event,
        visualOrder: currentVisualOrder,
      };
    }
  }

  return null;
}

function findTimedEventLocation(coreDocument: ScoreDocumentModel, event: TimedEvent): TimedEventMatch | null {
  let visualOrder = 0;
  for (const part of coreDocument.score.parts) {
    for (const staff of part.staves) {
      const currentVisualOrder = visualOrder++;
      const measure = staff.measures.find((entry) => entry.measureNumber === event.measureNumber);
      if (!measure) continue;
      const voice = measure.voices.find((entry) => entry.voiceId === event.voiceId);
      if (!voice) continue;
      const matched = voice.events.find((entry) => entry.id === event.id);
      if (!matched) continue;
      return {
        partId: part.id,
        measureId: measure.id,
        voiceId: voice.id,
        event: matched,
        visualOrder: currentVisualOrder,
      };
    }
  }
  return null;
}

export function attachCoreSelectionIdentity(note: SelectedNote, coreDocument?: ScoreDocumentModel | null): SelectedNote {
  return {
    ...note,
    ...findCoreIdentity(note, coreDocument),
  };
}

function buildSelectedNoteFromMatchedEvent(
  note: SelectedNote,
  match: TimedEvent | TimedEventMatch,
  coreDocument: ScoreDocumentModel,
): SelectedNote {
  const matched = 'event' in match
    ? buildSelectedNoteFromEvent(match.event, coreDocument, match)
    : buildSelectedNoteFromEvent(match, coreDocument);
  return {
    ...note,
    ...matched,
    graphicalNote: note.graphicalNote,
  };
}

function buildSelectedNoteFromEvent(
  event: TimedEvent,
  coreDocument: ScoreDocumentModel,
  location: TimedEventMatch | null = findTimedEventLocation(coreDocument, event),
): SelectedNote {
  return {
    measureNumber: event.measureNumber,
    staffIndex: event.staffIndex,
    voiceId: event.voiceId,
    timestampNum: event.timestampNum,
    timestampDen: event.timestampDen,
    step: event.kind === 'note' ? event.pitch.step : 'C',
    octave: event.kind === 'note' ? event.pitch.octave : 4,
    alter: event.kind === 'note' ? event.pitch.alter : 0,
    isRest: event.kind === 'rest',
    durationType: event.durationType,
    isDotted: event.isDotted,
    guitar: event.kind === 'note' ? event.guitar : undefined,
    coreEntityId: event.id,
    coreVoiceId: location?.voiceId ?? null,
    coreMeasureId: location?.measureId ?? null,
    corePartId: location?.partId ?? null,
    graphicalNote: null,
  };
}

export function selectedNoteEquals(a: SelectedNote | null | undefined, b: SelectedNote | null | undefined) {
  if (!a || !b) return false;
  if (a.coreEntityId && b.coreEntityId) {
    if (a.corePartId && b.corePartId && a.corePartId !== b.corePartId) return false;
    return a.coreEntityId === b.coreEntityId;
  }
  if (a.isRest !== b.isRest) return false;
  return a.measureNumber === b.measureNumber
    && a.staffIndex === b.staffIndex
    && a.voiceId === b.voiceId
    && timestampsEqual(a.timestampNum, a.timestampDen, b.timestampNum, b.timestampDen)
    && (
      a.isRest
      || (
        a.step === b.step
        && a.octave === b.octave
        && a.alter === b.alter
      )
    );
}

const NOTE_ENUM_TO_STEP: Record<number, string> = { 0: 'C', 2: 'D', 4: 'E', 5: 'F', 7: 'G', 9: 'A', 11: 'B' };

function isPointInsideNoteRect(point: PointLike, rect: RectLike): boolean {
  return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
}

function getSourceNote(graphicalNote: any): any | null {
  return graphicalNote?.sourceNote ?? graphicalNote?.SourceNote ?? null;
}

function getGraphicalNoteGroup(graphicalNote: any): SVGGElement | null {
  try {
    const el = graphicalNote?.getSVGGElement?.();
    return el instanceof SVGGElement ? el : null;
  } catch {
    return null;
  }
}

export function normalizeSelectedNote(graphicalNote: any, coreDocument?: ScoreDocumentModel | null): SelectedNote | null {
  const sourceNote = getSourceNote(graphicalNote);
  if (!sourceNote) return null;

  const sourceMeasure = sourceNote.SourceMeasure ?? sourceNote.sourceMeasure;
  const parentVoiceEntry = sourceNote.ParentVoiceEntry ?? sourceNote.parentVoiceEntry;
  const parentVoice = parentVoiceEntry?.ParentVoice ?? parentVoiceEntry?.parentVoice;
  const parentStaff = sourceNote.ParentStaff ?? sourceNote.parentStaff;
  const timestamp = parentVoiceEntry?.Timestamp ?? parentVoiceEntry?.timestamp;
  const pitch = sourceNote.Pitch ?? sourceNote.pitch;

  let step = 'C';
  let octave = 4;
  let alter = 0;

  if (pitch) {
    const fundamentalNote = pitch.FundamentalNote ?? pitch.fundamentalNote ?? 0;
    const accidental = pitch.Accidental ?? pitch.accidental ?? 2;
    step = NOTE_ENUM_TO_STEP[fundamentalNote] ?? 'C';
    octave = pitch.Octave ?? pitch.octave ?? 4;
    alter = accidental === 0 ? 1 : accidental === 1 ? -1 : 0;
  }

  const normalized = attachCoreSelectionIdentity({
    measureNumber: sourceMeasure?.MeasureNumberXML ?? sourceMeasure?.measureNumberXML ?? 1,
    staffIndex: parentStaff?.Id ?? parentStaff?.id ?? 1,
    voiceId: parentVoice?.VoiceId ?? parentVoice?.voiceId ?? 1,
    timestampNum: timestamp?.Numerator ?? timestamp?.numerator ?? 0,
    timestampDen: timestamp?.Denominator ?? timestamp?.denominator ?? 1,
    step,
    octave,
    alter,
    isRest: !pitch,
    durationType: sourceNote.NoteTypeXml ?? sourceNote.noteTypeXml ?? undefined,
    isDotted: Boolean(sourceNote.NoteDots?.length ?? sourceNote.noteDots?.length ?? sourceNote.NoteDot ?? sourceNote.noteDot),
    graphicalNote,
  }, coreDocument);

  if (!coreDocument || !normalized.coreEntityId) return normalized;

  for (const part of coreDocument.score.parts) {
    for (const staff of part.staves) {
      const measure = staff.measures.find((entry) => entry.id === normalized.coreMeasureId);
      if (!measure) continue;
      const voice = measure.voices.find((entry) => entry.id === normalized.coreVoiceId);
      const event = voice?.events.find((entry) => entry.id === normalized.coreEntityId);
      if (event) return buildSelectedNoteFromMatchedEvent(normalized, event, coreDocument);
    }
  }

  return normalized;
}

function getBoundingBoxCenter(boundingBox: any): PointLike | null {
  if (!boundingBox) return null;
  try {
    const absolute = boundingBox.AbsolutePosition ?? boundingBox.absolutePosition;
    const center = boundingBox.Center ?? boundingBox.center;
    if (center) return { x: center.x ?? center.X ?? 0, y: center.y ?? center.Y ?? 0 };
    const size = boundingBox.Size ?? boundingBox.size;
    if (absolute && size) {
      const width = size.width ?? size.Width ?? 0;
      const height = size.height ?? size.Height ?? 0;
      return { x: (absolute.x ?? absolute.X ?? 0) + width / 2, y: (absolute.y ?? absolute.Y ?? 0) + height / 2 };
    }
  } catch {}
  return null;
}

function getBoundingBoxRect(boundingBox: any): RectLike | null {
  if (!boundingBox) return null;
  try {
    const absolute = boundingBox.AbsolutePosition ?? boundingBox.absolutePosition;
    const size = boundingBox.Size ?? boundingBox.size;
    if (!absolute || !size) return null;
    return {
      x: absolute.x ?? absolute.X ?? 0,
      y: absolute.y ?? absolute.Y ?? 0,
      width: size.width ?? size.Width ?? 0,
      height: size.height ?? size.Height ?? 0,
    };
  } catch {}
  return null;
}

function toArray(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

function svgPointToContainer(svgEl: SVGSVGElement, container: HTMLElement, point: PointLike): PointLike | null {
  const ctm = svgEl.getScreenCTM();
  if (!ctm) return null;
  const svgPoint = svgEl.createSVGPoint();
  svgPoint.x = point.x;
  svgPoint.y = point.y;
  const screenPoint = svgPoint.matrixTransform(ctm);
  const rect = container.getBoundingClientRect();
  return { x: screenPoint.x - rect.left, y: screenPoint.y - rect.top };
}

function isPlausibleSvgDomCenter(svgCenterDom: PointLike | null, domCenter: PointLike, domRect: RectLike) {
  if (!svgCenterDom) return false;
  const tolerance = Math.max(domRect.width, domRect.height, 16) * 2;
  return Math.abs(svgCenterDom.x - domCenter.x) <= tolerance
    && Math.abs(svgCenterDom.y - domCenter.y) <= tolerance;
}

function findNoteheadCandidates(svgElement: SVGGElement | null): SVGElement[] {
  if (!svgElement) return [];
  const direct = [
    ...(svgElement.matches('.vf-notehead') ? [svgElement] : []),
    ...Array.from(svgElement.querySelectorAll<SVGElement>('.vf-notehead')),
  ];
  if (direct.length > 0) return direct;

  const stavenote = svgElement.closest<SVGElement>('.vf-stavenote, .vf-tabnote');
  const stavenoteHeads = stavenote
    ? Array.from(stavenote.querySelectorAll<SVGElement>('.vf-notehead'))
    : [];
  if (stavenoteHeads.length > 0) return stavenoteHeads;

  const staffEntry = svgElement.closest<SVGElement>('.vf-staffentry');
  const staffEntryHeads = staffEntry
    ? Array.from(staffEntry.querySelectorAll<SVGElement>('.vf-notehead'))
    : [];
  return staffEntryHeads;
}

function noteheadInkCandidates(notehead: SVGElement): SVGElement[] {
  const ink = Array.from(notehead.querySelectorAll<SVGElement>('path, ellipse, circle, polygon, polyline, rect'))
    .filter(hasRenderableClientRect);
  return ink.length > 0 ? ink : [notehead];
}

function findBestTintElement(container: HTMLElement, svgElement: SVGGElement | null, domCenter: PointLike): SVGElement | null {
  if (!svgElement) return null;
  const noteheadCandidates = findNoteheadCandidates(svgElement);
  const candidates = noteheadCandidates.length > 0
    ? noteheadCandidates.flatMap(noteheadInkCandidates)
    : Array.from(svgElement.querySelectorAll<SVGElement>('.vf-stavenote, .vf-tabnote'));
  if (candidates.length === 0) return svgElement;
  if (candidates.length === 1) return candidates[0];

  let best: SVGElement | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const rect = candidate.getBoundingClientRect();
    if (rect.width <= 0 && rect.height <= 0) continue;
    const domRect = clientRectToContainer(container, rect);
    const centerX = domRect.x + domRect.width / 2;
    const centerY = domRect.y + domRect.height / 2;
    const dx = centerX - domCenter.x;
    const dy = centerY - domCenter.y;
    const distance = dx * dx + dy * dy;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  return best ?? candidates[0] ?? svgElement;
}

function describeSvgElement(element: SVGElement | null) {
  if (!element) return 'null';
  const className = 'className' in element ? String((element as SVGElement & { className?: { baseVal?: string } }).className?.baseVal ?? element.getAttribute('class') ?? '') : '';
  return `${element.tagName.toLowerCase()}${className ? `.${className.replace(/\s+/g, '.')}` : ''}`;
}

function describeSvgRect(element: SVGElement | null) {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  return {
    x: Number(rect.left.toFixed(2)),
    y: Number(rect.top.toFixed(2)),
    width: Number(rect.width.toFixed(2)),
    height: Number(rect.height.toFixed(2)),
  };
}

function clientRectToContainer(container: HTMLElement, rect: DOMRect): RectLike {
  const containerRect = container.getBoundingClientRect();
  return { x: rect.left - containerRect.left, y: rect.top - containerRect.top, width: rect.width, height: rect.height };
}

function hasRenderableClientRect(element: SVGElement | null) {
  if (!element) return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 || rect.height > 0;
}

function renderedNoteIdentity(note: RenderedNote) {
  return note.coreEntityId ? [
    note.note.corePartId ?? '',
    note.note.coreMeasureId ?? '',
    note.note.coreVoiceId ?? '',
    note.coreEntityId,
  ].join('|') : [
    note.note.measureNumber,
    note.note.staffIndex,
    note.note.voiceId,
    note.note.timestampNum,
    note.note.timestampDen,
    note.note.isRest ? 'rest' : `${note.note.step}:${note.note.alter}:${note.note.octave}`,
  ].join('|');
}

function renderedNoteQualityScore(note: RenderedNote) {
  const tintVisible = hasRenderableClientRect(note.tintElement);
  const svgVisible = hasRenderableClientRect(note.svgElement);
  const area = Math.max(note.domRect.width * note.domRect.height, 0);
  const centerDistanceFromOrigin = Math.abs(note.domCenter.x) + Math.abs(note.domCenter.y);
  return (tintVisible ? 100000 : 0)
    + (svgVisible ? 10000 : 0)
    + (note.coreEntityId ? 2500 : 0)
    + Math.min(area, 5000)
    + Math.min(centerDistanceFromOrigin, 2000);
}

function dedupeRenderedNotes(notes: RenderedNote[]) {
  const deduped = new Map<string, RenderedNote>();
  for (const note of notes) {
    const identity = renderedNoteIdentity(note);
    const current = deduped.get(identity);
    if (!current) {
      deduped.set(identity, note);
      continue;
    }
    if (renderedNoteQualityScore(note) > renderedNoteQualityScore(current)) {
      deduped.set(identity, note);
    }
  }
  return [...deduped.values()];
}

function filterSuspiciousRenderedNotes(notes: RenderedNote[]) {
  if (notes.length === 0) return notes;
  return notes.filter((note) => {
    if (note.coreEntityId) return true;
    const looksTopLeftBroken = note.domCenter.x < 120 && note.domCenter.y < 80;
    const hasRenderableSvg = hasRenderableClientRect(note.svgElement) || hasRenderableClientRect(note.tintElement);
    if (!looksTopLeftBroken) return true;
    if (hasRenderableSvg) return true;
    return false;
  });
}


function selectedNotePitchRank(note: SelectedNote) {
  if (note.isRest) return Number.NEGATIVE_INFINITY;
  const stepOrder: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  return note.octave * 12 + (stepOrder[note.step] ?? 0) + note.alter;
}

function hasStrictlyUniqueTimestamps(events: TimedEvent[]) {
  const seen = new Set<string>();
  for (const event of events) {
    const key = `${event.timestampNum}/${event.timestampDen}`;
    if (seen.has(key)) return false;
    seen.add(key);
  }
  return true;
}

export function repairRenderedRestPartIdentity(notes: RenderedNote[], coreDocument: ScoreDocumentModel) {
  const restGroups = new Map<string, RenderedNote[]>();
  for (const note of notes) {
    if (!note.note.isRest) continue;
    const key = [
      note.note.measureNumber,
      note.note.staffIndex,
      note.note.voiceId,
      note.note.timestampNum,
      note.note.timestampDen,
    ].join(':');
    const group = restGroups.get(key) ?? [];
    group.push(note);
    restGroups.set(key, group);
  }

  for (const group of restGroups.values()) {
    if (group.length < 2) continue;
    const seed = group[0]?.note;
    if (!seed) continue;

    const candidates = findRestSpanEventMatches(seed, coreDocument)
      .sort((a, b) => (
        a.visualOrder - b.visualOrder
        || a.event.id.localeCompare(b.event.id)
      ));
    if (candidates.length !== group.length) continue;

    const orderedGroup = [...group].sort((a, b) => (
      a.domCenter.y - b.domCenter.y
      || a.domCenter.x - b.domCenter.x
      || a.id.localeCompare(b.id)
    ));

    orderedGroup.forEach((entry, index) => {
      const candidate = candidates[index];
      if (!candidate) return;
      const matched = buildSelectedNoteFromMatchedEvent(entry.note, candidate, coreDocument);
      entry.id = matched.coreEntityId ?? entry.id;
      entry.coreEntityId = matched.coreEntityId ?? entry.coreEntityId;
      entry.note = matched;
    });
  }
}

function repairRenderedNoteVisualOrder(notes: RenderedNote[], coreDocument: ScoreDocumentModel) {
  const laneGroups = new Map<string, RenderedNote[]>();
  for (const note of notes) {
    if (note.note.isRest) continue;
    const key = [
      note.note.corePartId ?? '',
      note.note.measureNumber,
      note.note.staffIndex,
      note.note.voiceId,
    ].join(':');
    const group = laneGroups.get(key) ?? [];
    group.push(note);
    laneGroups.set(key, group);
  }

  for (const group of laneGroups.values()) {
    const repairGroup = group.filter((entry) => entry.svgElement || entry.tintElement);
    if (repairGroup.length < 2) continue;
    const seed = repairGroup[0]?.note;
    if (!seed) continue;

    const semanticOrder = [...repairGroup].sort((a, b) => (
      noteTimestampValue(a.note) - noteTimestampValue(b.note)
      || selectedNotePitchRank(a.note) - selectedNotePitchRank(b.note)
      || a.id.localeCompare(b.id)
    ));
    const hasVisualOrderConflict = semanticOrder.some((entry, index) => {
      const previous = semanticOrder[index - 1];
      return Boolean(previous && previous.domCenter.x > entry.domCenter.x + 1.5);
    });
    if (!hasVisualOrderConflict) continue;

    let candidates: TimedEvent[] = [];
    for (const part of coreDocument.score.parts) {
      if (seed.corePartId && part.id !== seed.corePartId && part.sourcePartId !== seed.corePartId) continue;
      for (const staff of part.staves) {
        if (staff.staffIndex !== seed.staffIndex) continue;
        const measure = staff.measures.find((entry) => entry.measureNumber === seed.measureNumber);
        if (!measure) continue;
        const voice = measure.voices.find((entry) => entry.voiceId === seed.voiceId);
        if (!voice) continue;
        candidates = voice.events.filter((entry) => (
          entry.kind === 'note'
          && !entry.isChord
          && entry.measureNumber === seed.measureNumber
          && entry.staffIndex === seed.staffIndex
          && entry.voiceId === seed.voiceId
        ));
        if (candidates.length > 0) break;
      }
      if (candidates.length > 0) break;
    }

    if (candidates.length !== repairGroup.length) continue;
    if (!hasStrictlyUniqueTimestamps(candidates)) continue;

    const orderedGroup = [...repairGroup].sort((a, b) => (
      a.domCenter.x - b.domCenter.x
      || a.domCenter.y - b.domCenter.y
      || a.id.localeCompare(b.id)
    ));
    const orderedCandidates = [...candidates].sort((a, b) => (
      noteTimestampValue(a) - noteTimestampValue(b)
      || semanticPitchRank(b) - semanticPitchRank(a)
      || a.id.localeCompare(b.id)
    ));

    orderedGroup.forEach((entry, index) => {
      const event = orderedCandidates[index];
      if (!event) return;
      const matched = buildSelectedNoteFromMatchedEvent(entry.note, event, coreDocument);
      entry.id = matched.coreEntityId ?? entry.id;
      entry.coreEntityId = matched.coreEntityId ?? entry.coreEntityId;
      entry.note = matched;
    });

    if (dbg.enabled()) {
      dbg.score(`rendered note visual order repaired ${JSON.stringify({
        measure: seed.measureNumber,
        staff: seed.staffIndex,
        voice: seed.voiceId,
        count: repairGroup.length,
      })}`);
    }
  }
}

function isTabEventMatch(coreDocument: ScoreDocumentModel, match: TimedEventMatch) {
  for (const part of coreDocument.score.parts) {
    if (part.id !== match.partId) continue;
    const staff = part.staves.find((entry) => entry.measures.some((measure) => measure.id === match.measureId));
    const measure = staff?.measures.find((entry) => entry.id === match.measureId);
    return Boolean(measure?.attributes.some((attribute) => (
      attribute.clefs.some((clef) => clef.sign?.toUpperCase() === 'TAB')
    )));
  }
  return false;
}

export function repairRenderedDuplicatePartIdentity(notes: RenderedNote[], coreDocument: ScoreDocumentModel) {
  const groupedByOnset = new Map<string, RenderedNote[]>();
  for (const note of notes) {
    if (note.note.isRest) continue;
    const key = [
      note.note.measureNumber,
      note.note.staffIndex,
      note.note.voiceId,
      note.note.timestampNum,
      note.note.timestampDen,
      note.note.step,
      note.note.alter,
      note.note.octave,
    ].join(':');
    const group = groupedByOnset.get(key) ?? [];
    group.push(note);
    groupedByOnset.set(key, group);
  }

  for (const group of groupedByOnset.values()) {
    if (group.length < 2) continue;
    const seed = group[0]?.note;
    if (!seed) continue;

    const candidates: TimedEventMatch[] = [];
    let visualOrder = 0;
    for (const part of coreDocument.score.parts) {
      for (const staff of part.staves) {
        const currentVisualOrder = visualOrder++;
        if (staff.staffIndex !== seed.staffIndex) continue;
        const measure = staff.measures.find((entry) => entry.measureNumber === seed.measureNumber);
        if (!measure) continue;
        const voice = measure.voices.find((entry) => entry.voiceId === seed.voiceId);
        if (!voice) continue;
        const event = voice.events.find((entry) => matchesTimedEvent(seed, entry));
        if (!event) continue;
        candidates.push({
          partId: part.id,
          measureId: measure.id,
          voiceId: voice.id,
          event,
          visualOrder: currentVisualOrder,
        });
      }
    }

    if (candidates.length !== group.length) continue;
    if (new Set(candidates.map((entry) => entry.partId)).size !== candidates.length) continue;

    const orderedGroup = [...group].sort((a, b) => (
      a.domCenter.y - b.domCenter.y
      || a.domCenter.x - b.domCenter.x
      || a.id.localeCompare(b.id)
    ));
    const orderedCandidates = [...candidates].sort((a, b) => (
      Number(isTabEventMatch(coreDocument, a)) - Number(isTabEventMatch(coreDocument, b))
      || a.visualOrder - b.visualOrder
      || a.partId.localeCompare(b.partId)
    ));

    orderedGroup.forEach((entry, index) => {
      const match = orderedCandidates[index];
      if (!match) return;
      const matched = buildSelectedNoteFromMatchedEvent(entry.note, match, coreDocument);
      entry.id = matched.coreEntityId ?? entry.id;
      entry.coreEntityId = matched.coreEntityId ?? entry.coreEntityId;
      entry.note = matched;
    });
  }
}

function findNotationTwinForGuitarNote(note: SelectedNote, coreDocument: ScoreDocumentModel): TimedEventMatch | null {
  if (!note.guitar || note.isRest) return null;

  let visualOrder = 0;
  for (const part of coreDocument.score.parts) {
    for (const staff of part.staves) {
      const currentVisualOrder = visualOrder++;
      if (staff.staffIndex !== note.staffIndex) continue;
      const measure = staff.measures.find((entry) => entry.measureNumber === note.measureNumber);
      if (!measure) continue;
      const voice = measure.voices.find((entry) => entry.voiceId === note.voiceId);
      if (!voice) continue;
      const event = voice.events.find((entry) => (
        entry.kind === 'note'
        && !entry.guitar
        && entry.measureNumber === note.measureNumber
        && entry.staffIndex === note.staffIndex
        && entry.voiceId === note.voiceId
        && timestampsEqual(entry.timestampNum, entry.timestampDen, note.timestampNum, note.timestampDen)
        && entry.pitch.step === note.step
        && entry.pitch.octave === note.octave
        && entry.pitch.alter === note.alter
      ));
      if (!event) continue;
      return {
        partId: part.id,
        measureId: measure.id,
        voiceId: voice.id,
        event,
        visualOrder: currentVisualOrder,
      };
    }
  }

  return null;
}

function repairRenderedTabNotationNoteheadIdentity(notes: RenderedNote[], coreDocument: ScoreDocumentModel) {
  for (const entry of notes) {
    const match = findNotationTwinForGuitarNote(entry.note, coreDocument);
    if (!match) continue;
    const matched = buildSelectedNoteFromMatchedEvent(entry.note, match, coreDocument);
    entry.id = matched.coreEntityId ?? entry.id;
    entry.coreEntityId = matched.coreEntityId ?? entry.coreEntityId;
    entry.note = matched;
  }
}

export function eventToSvgPoint(container: HTMLElement, osmd: any, e: PointerEvent): PointLike {
  const svgEl = container.querySelector('svg');
  if (svgEl instanceof SVGSVGElement) {
    const screenPoint = svgEl.createSVGPoint();
    screenPoint.x = e.clientX;
    screenPoint.y = e.clientY;
    const ctm = svgEl.getScreenCTM();
    if (ctm) {
      const svgPoint = screenPoint.matrixTransform(ctm.inverse());
      return { x: svgPoint.x, y: svgPoint.y };
    }
  }
  const rect = container.getBoundingClientRect();
  return osmd.GraphicSheet.domToSvg({ x: e.clientX - rect.left, y: e.clientY - rect.top });
}

export function collectRenderedNotes(osmd: any, container: HTMLElement, coreDocument?: ScoreDocumentModel | null): RenderedNote[] {
  const containers = osmd?.GraphicSheet?.VerticalGraphicalStaffEntryContainers;
  if (!Array.isArray(containers)) return [];
  const svgEl = container.querySelector('svg');
  if (!(svgEl instanceof SVGSVGElement)) return [];

  const notes: RenderedNote[] = [];
  for (const verticalEntry of containers) {
    const staffEntries = toArray(verticalEntry?.StaffEntries ?? verticalEntry?.staffEntries);
    for (const staffEntry of staffEntries) {
      const voiceEntries = toArray(staffEntry?.graphicalVoiceEntries ?? staffEntry?.GraphicalVoiceEntries);
      for (const voiceEntry of voiceEntries) {
        const graphicalNotes = toArray(voiceEntry?.notes ?? voiceEntry?.Notes);
        for (let noteIndex = 0; noteIndex < graphicalNotes.length; noteIndex++) {
          const graphicalNote = graphicalNotes[noteIndex];
          const normalized = normalizeSelectedNote(graphicalNote, coreDocument);
          const svgElement = getGraphicalNoteGroup(graphicalNote);
          const clientRect = svgElement?.getBoundingClientRect();
          const boundingBox = graphicalNote?.PositionAndShape ?? graphicalNote?.positionAndShape;
          const svgCenter = getBoundingBoxCenter(boundingBox);
          const svgRect = getBoundingBoxRect(boundingBox);
          const svgCenterDom = svgCenter ? svgPointToContainer(svgEl, container, svgCenter) : null;
          if (!normalized) continue;
          const semanticMatch = coreDocument
            ? findExactTimedEventMatch(normalized, coreDocument)
              ?? findRestSpanEventMatch(normalized, coreDocument)
            : null;
          const enriched = semanticMatch
            ? buildSelectedNoteFromMatchedEvent(normalized, semanticMatch, coreDocument!)
            : normalized;

          let domCenter: PointLike | null = null;
          let domRect: RectLike | null = null;
          // OSMD's boundingBox.Center is a *local* coordinate on many note
          // objects and can transform to ~(0,0) in container space — which
          // silently corrupted downstream X anchoring for the ghost preview.
          // Prefer the browser-measured rect and only fall back to SVG
          // coordinates when no client rect is available.
          if (clientRect && clientRect.width > 0 && clientRect.height > 0) {
            domRect = clientRectToContainer(container, clientRect);
            domCenter = {
              x: domRect.x + domRect.width / 2,
              y: domRect.y + domRect.height / 2,
            };
          } else if (svgCenter && svgRect) {
            const fallbackCenter = svgPointToContainer(svgEl, container, svgCenter);
            const domTopLeft = svgPointToContainer(svgEl, container, { x: svgRect.x, y: svgRect.y });
            const domBottomRight = svgPointToContainer(svgEl, container, { x: svgRect.x + svgRect.width, y: svgRect.y + svgRect.height });
            if (fallbackCenter && domTopLeft && domBottomRight) {
              domRect = {
                x: Math.min(domTopLeft.x, domBottomRight.x) - 6,
                y: Math.min(domTopLeft.y, domBottomRight.y) - 6,
                width: Math.max(Math.abs(domBottomRight.x - domTopLeft.x), 10) + 12,
                height: Math.max(Math.abs(domBottomRight.y - domTopLeft.y), 10) + 12,
              };
              domCenter = { x: domRect.x + domRect.width / 2, y: domRect.y + domRect.height / 2 };
            }
          }

          if (!domCenter || !domRect) continue;
          const tintReferenceCenter = isPlausibleSvgDomCenter(svgCenterDom, domCenter, domRect)
            ? svgCenterDom!
            : domCenter;
          const tintElement = findBestTintElement(container, svgElement, tintReferenceCenter);
          if (hasRenderableClientRect(tintElement)) {
            const tintRect = clientRectToContainer(container, tintElement!.getBoundingClientRect());
            if (tintRect.width > 0 || tintRect.height > 0) {
              domRect = tintRect;
              domCenter = {
                x: tintRect.x + tintRect.width / 2,
                y: tintRect.y + tintRect.height / 2,
              };
            }
          }

          notes.push({
            id: enriched.coreEntityId ?? [enriched.measureNumber, enriched.staffIndex, enriched.voiceId, enriched.timestampNum, enriched.timestampDen, enriched.step, enriched.octave, noteIndex].join(':'),
            coreEntityId: enriched.coreEntityId ?? null,
            note: enriched,
            svgCenter: svgCenter ?? { x: 0, y: 0 },
            domCenter,
            domRect,
            svgElement,
            tintElement,
          });
        }
      }
    }
  }

  if (coreDocument) {
    repairRenderedDuplicatePartIdentity(notes, coreDocument);

    const pitchGroups = new Map<string, RenderedNote[]>();
    for (const note of notes) {
      if (note.note.isRest) continue;
      const key = [
        note.note.measureNumber,
        note.note.staffIndex,
        note.note.voiceId,
        note.note.timestampNum,
        note.note.timestampDen,
      ].join(':');
      const group = pitchGroups.get(key) ?? [];
      group.push(note);
      pitchGroups.set(key, group);
    }

    for (const group of pitchGroups.values()) {
      if (group.every((entry) => entry.coreEntityId)) continue;
      const seed = group[0]?.note;
      if (!seed) continue;

      let candidates: TimedEvent[] = [];
      for (const part of coreDocument.score.parts) {
        for (const staff of part.staves) {
          if (staff.staffIndex !== seed.staffIndex) continue;
          const measure = staff.measures.find((entry) => entry.measureNumber === seed.measureNumber);
          if (!measure) continue;
          const voice = measure.voices.find((entry) => entry.voiceId === seed.voiceId);
          if (!voice) continue;
          candidates = voice.events.filter((entry) => (
            entry.kind === 'note'
            && entry.measureNumber === seed.measureNumber
            && entry.staffIndex === seed.staffIndex
            && entry.voiceId === seed.voiceId
            && timestampsEqual(entry.timestampNum, entry.timestampDen, seed.timestampNum, seed.timestampDen)
          ));
          if (candidates.length > 0) break;
        }
        if (candidates.length > 0) break;
      }

      if (candidates.length !== group.length) continue;

      const orderedGroup = [...group].sort((a, b) => (
        a.domCenter.y - b.domCenter.y
        || a.domCenter.x - b.domCenter.x
        || a.id.localeCompare(b.id)
      ));
      const orderedCandidates = [...candidates].sort((a, b) => (
        semanticPitchRank(b) - semanticPitchRank(a)
        || a.timestampNum - b.timestampNum
        || a.voiceId - b.voiceId
      ));

      orderedGroup.forEach((entry, index) => {
        const event = orderedCandidates[index];
        if (!event) return;
        const matched = buildSelectedNoteFromMatchedEvent(entry.note, event, coreDocument);
        entry.id = matched.coreEntityId ?? entry.id;
        entry.coreEntityId = matched.coreEntityId ?? entry.coreEntityId;
        entry.note = matched;
      });
    }

    const voicePitchGroups = new Map<string, RenderedNote[]>();
    for (const note of notes) {
      if (note.note.isRest) continue;
      const key = [
        note.note.measureNumber,
        note.note.staffIndex,
        note.note.voiceId,
        note.note.step,
        note.note.alter,
        note.note.octave,
      ].join(':');
      const group = voicePitchGroups.get(key) ?? [];
      group.push(note);
      voicePitchGroups.set(key, group);
    }

    for (const group of voicePitchGroups.values()) {
      if (group.length < 2) continue;
      const seed = group[0]?.note;
      if (!seed) continue;

      let candidates: TimedEvent[] = [];
      for (const part of coreDocument.score.parts) {
        for (const staff of part.staves) {
          if (staff.staffIndex !== seed.staffIndex) continue;
          const measure = staff.measures.find((entry) => entry.measureNumber === seed.measureNumber);
          if (!measure) continue;
          const voice = measure.voices.find((entry) => entry.voiceId === seed.voiceId);
          if (!voice) continue;
          candidates = voice.events.filter((entry) => (
            entry.kind === 'note'
            && entry.measureNumber === seed.measureNumber
            && entry.staffIndex === seed.staffIndex
            && entry.voiceId === seed.voiceId
            && entry.pitch.step === seed.step
            && entry.pitch.alter === seed.alter
            && entry.pitch.octave === seed.octave
          ));
          if (candidates.length > 0) break;
        }
        if (candidates.length > 0) break;
      }

      if (candidates.length !== group.length) continue;

      const orderedGroup = [...group].sort((a, b) => (
        a.domCenter.x - b.domCenter.x
        || a.domCenter.y - b.domCenter.y
        || a.id.localeCompare(b.id)
      ));
      const orderedCandidates = [...candidates].sort((a, b) => (
        (a.timestampNum / Math.max(a.timestampDen, 1)) - (b.timestampNum / Math.max(b.timestampDen, 1))
        || a.id.localeCompare(b.id)
      ));

      orderedGroup.forEach((entry, index) => {
        const event = orderedCandidates[index];
        if (!event) return;
        const matched = buildSelectedNoteFromMatchedEvent(entry.note, event, coreDocument);
        entry.id = matched.coreEntityId ?? entry.id;
        entry.coreEntityId = matched.coreEntityId ?? entry.coreEntityId;
        entry.note = matched;
      });
    }

    repairRenderedRestPartIdentity(notes, coreDocument);
    repairRenderedNoteVisualOrder(notes, coreDocument);
    repairRenderedTabNotationNoteheadIdentity(notes, coreDocument);
  }

  const uniqueNotes = dedupeRenderedNotes(filterSuspiciousRenderedNotes(notes));

  if (dbg.enabled()) {
    const tintGroups = new Map<SVGElement | null, RenderedNote[]>();
    for (const note of uniqueNotes) {
      const current = tintGroups.get(note.tintElement) ?? [];
      current.push(note);
      tintGroups.set(note.tintElement, current);
    }
    const collisions = [...tintGroups.entries()].filter((entry) => entry[0] && entry[1].length > 1);
    if (collisions.length > 0) {
      const measures = [...new Set(collisions.flatMap(([, grouped]) => grouped.map((entry) => entry.note.measureNumber)))].sort((a, b) => a - b);
      const worst = collisions.reduce((max, [, grouped]) => Math.max(max, grouped.length), 0);
      const invisibleTintCount = collisions.filter(([element]) => {
        const rect = element?.getBoundingClientRect();
        return !rect || (rect.width === 0 && rect.height === 0);
      }).length;
      const sample = collisions.slice(0, 4).map(([element, grouped]) => ({
        tintElement: describeSvgElement(element),
        tintRect: describeSvgRect(element),
        count: grouped.length,
        measure: grouped[0]?.note.measureNumber ?? null,
        timestamp: grouped[0] ? `${grouped[0].note.timestampNum}/${grouped[0].note.timestampDen}` : null,
      }));
      dbg.score(`rendered note tint collisions ${JSON.stringify({
        groups: collisions.length,
        worstCount: worst,
        invisibleTintGroups: invisibleTintCount,
        measures,
        sample,
      })}`);
    }
  }

  return uniqueNotes;
}

function semanticPitchRank(event: TimedEvent) {
  if (event.kind !== 'note') return Number.NEGATIVE_INFINITY;
  const stepOrder: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  return event.pitch.octave * 12 + (stepOrder[event.pitch.step] ?? 0) + event.pitch.alter;
}

export function resolveSemanticMeasureClickTarget(
  coreDocument: ScoreDocumentModel | null | undefined,
  measureId: string | null | undefined,
  noteheadRects: RectLike[],
  clickPoint: PointLike,
  measureBounds?: RectLike | null,
): SelectedNote | null {
  if (!coreDocument || !measureId) return null;

  const graceIds = new Set(coreDocument.graceNotes.map((entry) => entry.eventId));
  const candidates: SemanticTargetCandidate[] = [];
  let measureDurationRatio = 0;
  let visualOrder = 0;
  for (const part of coreDocument.score.parts) {
    for (const staff of part.staves) {
      const currentVisualOrder = visualOrder++;
      const measure = staff.measures.find((entry) => entry.id === measureId);
      if (!measure) continue;
      if (measureDurationRatio <= 0) {
        const activeAttributes = [...measure.attributes].reverse().find((entry) => entry.time) ?? measure.attributes.at(-1);
        const beats = activeAttributes?.time?.beats ?? 0;
        const beatType = activeAttributes?.time?.beatType ?? 0;
        if (beats > 0 && beatType > 0) measureDurationRatio = beats / beatType;
      }
      for (const voice of measure.voices) {
        for (const event of voice.events) {
          if (graceIds.has(event.id)) continue;
          if (event.isChord) continue;
          candidates.push({
            note: buildSelectedNoteFromEvent(event, coreDocument, {
              partId: part.id,
              measureId: measure.id,
              voiceId: voice.id,
              event,
              visualOrder: currentVisualOrder,
            }),
            sortX: event.timestampNum / Math.max(event.timestampDen, 1),
            sortY: -semanticPitchRank(event),
          });
        }
      }
    }
  }

  if (candidates.length === 0) return null;

  if (measureDurationRatio <= 0) {
    measureDurationRatio = candidates.reduce((max, candidate) => {
      const note = candidate.note;
      const measure = coreDocument.score.parts
        .flatMap((part) => part.staves)
        .flatMap((staff) => staff.measures)
        .find((entry) => entry.id === measureId);
      const voice = measure?.voices.find((entry) => entry.voiceId === note.voiceId);
      const event = voice?.events.find((entry) => entry.id === note.coreEntityId);
      const durationRatio = event ? event.durationDivisions / Math.max(event.timestampDen, 1) : 0;
      return Math.max(max, candidate.sortX + durationRatio);
    }, 0);
  }

  const orderedCandidates = candidates.sort((a, b) => (
    a.sortX - b.sortX
    || a.sortY - b.sortY
    || a.note.voiceId - b.note.voiceId
    || a.note.staffIndex - b.note.staffIndex
  ));

  if (noteheadRects.length === 0) {
    if (measureBounds && measureBounds.width > 0 && measureDurationRatio > 0) {
      const clickRatio = Math.max(0, Math.min(1, (clickPoint.x - measureBounds.x) / measureBounds.width)) * measureDurationRatio;
      let nearest = orderedCandidates[0] ?? null;
      let nearestDistance = Number.POSITIVE_INFINITY;
      orderedCandidates.forEach((candidate) => {
        const distance = Math.abs(candidate.sortX - clickRatio);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearest = candidate;
        }
      });
      return nearest?.note ?? null;
    }
    return orderedCandidates.length === 1 ? orderedCandidates[0].note : null;
  }

  if (noteheadRects.length !== orderedCandidates.length) {
    if (measureBounds && measureBounds.width > 0 && measureDurationRatio > 0) {
      const clickRatio = Math.max(0, Math.min(1, (clickPoint.x - measureBounds.x) / measureBounds.width)) * measureDurationRatio;
      let nearest = orderedCandidates[0] ?? null;
      let nearestDistance = Number.POSITIVE_INFINITY;
      orderedCandidates.forEach((candidate) => {
        const distance = Math.abs(candidate.sortX - clickRatio);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearest = candidate;
        }
      });
      return nearest?.note ?? null;
    }
    return orderedCandidates.length === 1 ? orderedCandidates[0].note : null;
  }

  const orderedRects = noteheadRects
    .map((rect, index) => ({
      index,
      rect,
      centerX: rect.x + rect.width / 2,
      centerY: rect.y + rect.height / 2,
    }))
    .sort((a, b) => a.centerX - b.centerX || a.centerY - b.centerY);

  let nearestRectIndex = 0;
  let nearestDistanceSq = Number.POSITIVE_INFINITY;
  orderedRects.forEach((entry, index) => {
    const dx = entry.centerX - clickPoint.x;
    const dy = entry.centerY - clickPoint.y;
    const distanceSq = dx * dx + dy * dy;
    if (distanceSq < nearestDistanceSq) {
      nearestDistanceSq = distanceSq;
      nearestRectIndex = index;
    }
  });

  return orderedCandidates[nearestRectIndex]?.note ?? null;
}

export function findNearestRenderedNote(renderedNotes: RenderedNote[], domPos: PointLike): SelectedNote | null {
  let nearest: RenderedNote | null = null;
  let nearestDistanceSq = Number.POSITIVE_INFINITY;

  for (const renderedNote of renderedNotes) {
    let distanceSq = 0;
    if (!isPointInsideNoteRect(domPos, renderedNote.domRect)) {
      const dx = renderedNote.domCenter.x - domPos.x;
      const dy = renderedNote.domCenter.y - domPos.y;
      distanceSq = dx * dx + dy * dy;
    }
    if (distanceSq < nearestDistanceSq) {
      nearestDistanceSq = distanceSq;
      nearest = renderedNote;
    }
  }

  return nearestDistanceSq <= 24 * 24 ? nearest?.note ?? null : null;
}
