import { noteTypeToDivisions } from '@/lib/note-editor';
import { getEffectiveMeasureTiming } from '@/src/score-core/measure-timing';
import type {
  MeasureNode,
  ScoreDocumentModel,
  StaffNode,
  TimedEvent,
  VoiceNode,
} from '@/src/score-core/model/types';
import { isPercussionStaffAtMeasure } from '@/src/score-input/staff-pitch';
import type { ResolvedEditTarget } from '@/src/score-input/types';

interface MeasureContext {
  partId: string;
  staff: StaffNode;
  measure: MeasureNode;
  voice: VoiceNode | null;
  divisions: number;
  measureDurationDivisions: number;
}

export interface InspectResolvedEditTargetInput {
  coreDocument: ScoreDocumentModel | null | undefined;
  target: ResolvedEditTarget;
  durationType: string;
  isDotted: boolean;
}

export interface InspectResolvedEditTargetResult {
  target: ResolvedEditTarget | null;
  rejectionReason: string | null;
  diagnostics: string[];
}

function eventStartOffset(event: TimedEvent, divisions: number) {
  return Math.max(0, Math.round((event.timestampNum / Math.max(event.timestampDen, 1)) * divisions * 4));
}

function eventEndOffset(event: TimedEvent, divisions: number) {
  return eventStartOffset(event, divisions) + Math.max(event.durationDivisions, 0);
}

function targetStartOffset(target: ResolvedEditTarget, divisions: number) {
  const rawOffset = (target.timestampNum / Math.max(target.timestampDen, 1)) * divisions * 4;
  const rounded = Math.round(rawOffset);
  if (Math.abs(rawOffset - rounded) > 1e-9) return null;
  return Math.max(0, rounded);
}

function requestedDurationDivisions(durationType: string, isDotted: boolean, divisions: number) {
  const base = noteTypeToDivisions(durationType, divisions);
  return Math.max(1, Math.round(base * (isDotted ? 1.5 : 1)));
}

function sortVoiceEvents(events: TimedEvent[], divisions: number) {
  return [...events].sort((left, right) => (
    eventStartOffset(left, divisions) - eventStartOffset(right, divisions)
    || Number(left.isChord) - Number(right.isChord)
    || left.id.localeCompare(right.id)
  ));
}

function findMeasureContext(
  coreDocument: ScoreDocumentModel | null | undefined,
  target: ResolvedEditTarget,
): MeasureContext | null {
  if (!coreDocument) return null;

  for (const part of coreDocument.score.parts) {
    if (target.corePartId && part.id !== target.corePartId && part.sourcePartId !== target.corePartId) continue;
    for (const staff of part.staves) {
      if (staff.staffIndex !== target.staffIndex) continue;
      const measure = staff.measures.find((entry) => (
        (target.measureId ? entry.id === target.measureId : false)
        || entry.measureNumber === target.measureNumber
      ));
      if (!measure) continue;

      const timing = getEffectiveMeasureTiming(coreDocument, {
        measureId: measure.id,
        measureNumber: measure.measureNumber,
        staffIndex: staff.staffIndex,
        partId: part.id,
      });
      if (!timing) continue;

      return {
        partId: part.id,
        staff,
        measure,
        voice: measure.voices.find((entry) => entry.voiceId === target.voiceId) ?? null,
        divisions: timing.divisions,
        measureDurationDivisions: timing.durationDivisions,
      };
    }
  }

  return null;
}

function summarizeBlockingEvent(event: TimedEvent) {
  return `${event.kind}:${event.measureNumber}:${event.staffIndex}:${event.voiceId}:${event.timestampNum}/${event.timestampDen}`;
}

function inspectSilentCoverage(input: {
  events: TimedEvent[];
  divisions: number;
  startOffset: number;
  endOffset: number;
  allowStartNote: boolean;
  allowGaps?: boolean;
}) {
  const sorted = sortVoiceEvents(input.events, input.divisions).filter((event) => !event.isChord);
  let cursor = input.startOffset;

  for (const event of sorted) {
    const start = eventStartOffset(event, input.divisions);
    const end = eventEndOffset(event, input.divisions);
    if (end <= input.startOffset || start >= input.endOffset) continue;

    if (start > cursor) {
      if (input.allowGaps) {
        cursor = start;
      } else {
        return {
          ok: false,
          reason: `gap:${cursor}-${Math.min(start, input.endOffset)}`,
        };
      }
    }

    const isAllowedStartNote = input.allowStartNote && event.kind === 'note' && start === input.startOffset;
    if (event.kind !== 'rest' && !isAllowedStartNote) {
      return {
        ok: false,
        reason: `blocking-event:${summarizeBlockingEvent(event)}`,
      };
    }

    cursor = Math.max(cursor, Math.min(end, input.endOffset));
    if (cursor >= input.endOffset) {
      return { ok: true, reason: null };
    }
  }

  if (sorted.length === 0 || input.allowGaps) {
    return { ok: true, reason: null };
  }

  return {
    ok: false,
    reason: `gap:${cursor}-${input.endOffset}`,
  };
}

function isSingleFullMeasureEvent(
  events: TimedEvent[],
  event: TimedEvent,
  divisions: number,
  measureDurationDivisions: number,
) {
  const timelineEvents = events.filter((entry) => !entry.isChord);
  return timelineEvents.length === 1
    && timelineEvents[0]?.id === event.id
    && eventStartOffset(event, divisions) === 0
    && eventEndOffset(event, divisions) >= measureDurationDivisions;
}

export function inspectResolvedEditTarget(input: InspectResolvedEditTargetInput): InspectResolvedEditTargetResult {
  const diagnostics = [...input.target.diagnostics];
  const context = findMeasureContext(input.coreDocument, input.target);
  if (!context) {
    diagnostics.push('validation:measure-context-missing');
    return {
      target: null,
      rejectionReason: 'measure-context-missing',
      diagnostics,
    };
  }

  if (isPercussionStaffAtMeasure(input.coreDocument, input.target.measureNumber, input.target.staffIndex, {
    corePartId: input.target.corePartId,
    measureId: input.target.measureId,
  })) {
    diagnostics.push('validation:percussion-staff-pitch-entry-unsupported');
    return {
      target: null,
      rejectionReason: 'percussion-staff-pitch-entry-unsupported',
      diagnostics,
    };
  }

  const startOffset = targetStartOffset(input.target, context.divisions);
  if (startOffset == null) {
    diagnostics.push('validation:non-integral-target-timestamp');
    return {
      target: null,
      rejectionReason: 'non-integral-target-timestamp',
      diagnostics,
    };
  }
  const requestedDuration = requestedDurationDivisions(input.durationType, input.isDotted, context.divisions);
  const endOffset = startOffset + requestedDuration;
  const voiceEvents = context.voice?.events ?? [];
  const exactEvents = voiceEvents.filter((event) => (
    Math.abs(eventStartOffset(event, context.divisions) - startOffset) === 0
  ));
  const exactNotes = exactEvents.filter((event) => event.kind === 'note');
  const exactRests = exactEvents.filter((event) => event.kind === 'rest' && !event.isChord);
  const spanningRest = sortVoiceEvents(voiceEvents, context.divisions).find((event) => (
    !event.isChord
    && event.kind === 'rest'
    && eventStartOffset(event, context.divisions) <= startOffset
    && eventEndOffset(event, context.divisions) > startOffset
  )) ?? null;
  const spanningRestIsSingleFullMeasureEvent = spanningRest
    ? isSingleFullMeasureEvent(voiceEvents, spanningRest, context.divisions, context.measureDurationDivisions)
    : false;
  const isPreservedInternalRestSlot = input.target.mode === 'insert'
    && input.target.allowOccupiedInsert
    && spanningRest
    && (
      input.target.diagnostics.includes('keyboard-cross-voice-cursor')
      || (
        !spanningRestIsSingleFullMeasureEvent
        && (
          input.target.diagnostics.includes('rest-only-internal-slot-preserved')
          || input.target.diagnostics.includes('rest-only-quantized-internal-slot')
        )
      )
    );

  if (startOffset >= context.measureDurationDivisions) {
    diagnostics.push('validation:start-outside-measure');
    return {
      target: null,
      rejectionReason: 'start-outside-measure',
      diagnostics,
    };
  }

  if (endOffset > context.measureDurationDivisions) {
    diagnostics.push('validation:overflow-rejected');
    return {
      target: null,
      rejectionReason: 'overflow-rejected',
      diagnostics,
    };
  }

  if (input.target.mode === 'chord') {
    if (exactNotes.length === 0) {
      diagnostics.push('validation:chord-missing-anchor');
      return {
        target: null,
        rejectionReason: 'chord-missing-anchor',
        diagnostics,
      };
    }

    diagnostics.push('validation:chord-exact-note');
    return {
      target: {
        ...input.target,
        corePartId: input.target.corePartId ?? context.partId,
        existingEventKind: 'note',
        existingEventStartsAtTarget: true,
        diagnostics,
      },
      rejectionReason: null,
      diagnostics,
    };
  }

  if (input.target.mode === 'replace') {
    const allowsTiedChordReplace = exactNotes.length > 1
      && input.target.diagnostics.includes('tied-chord-replace');
    if (exactNotes.length > 1 && !allowsTiedChordReplace) {
      diagnostics.push('validation:replace-ambiguous-chord');
      return {
        target: null,
        rejectionReason: 'replace-ambiguous-chord',
        diagnostics,
      };
    }

    if (exactNotes.length >= 1) {
      const coverage = inspectSilentCoverage({
        events: voiceEvents,
        divisions: context.divisions,
        startOffset,
        endOffset,
        allowStartNote: true,
      });
      if (!coverage.ok) {
        diagnostics.push(`validation:replace-note-rejected:${coverage.reason}`);
        return {
          target: null,
          rejectionReason: coverage.reason,
          diagnostics,
        };
      }

      diagnostics.push(allowsTiedChordReplace
        ? 'validation:replace-tied-chord'
        : 'validation:replace-note');
      return {
        target: {
          ...input.target,
          corePartId: input.target.corePartId ?? context.partId,
          existingEventKind: 'note',
          existingEventStartsAtTarget: true,
          diagnostics,
        },
        rejectionReason: null,
        diagnostics,
      };
    }

    if (exactRests.length > 1) {
      diagnostics.push('validation:replace-ambiguous-rest');
      return {
        target: null,
        rejectionReason: 'replace-ambiguous-rest',
        diagnostics,
      };
    }

    if (exactRests.length === 1) {
      const coverage = inspectSilentCoverage({
        events: voiceEvents,
        divisions: context.divisions,
        startOffset,
        endOffset,
        allowStartNote: false,
      });
      if (!coverage.ok) {
        diagnostics.push(`validation:replace-rest-rejected:${coverage.reason}`);
        return {
          target: null,
          rejectionReason: coverage.reason,
          diagnostics,
        };
      }

      diagnostics.push('validation:replace-rest-exact');
      return {
        target: {
          ...input.target,
          corePartId: input.target.corePartId ?? context.partId,
          existingEventKind: 'rest',
          existingEventStartsAtTarget: true,
          diagnostics,
        },
        rejectionReason: null,
        diagnostics,
      };
    }

    if (spanningRest) {
      diagnostics.push(spanningRestIsSingleFullMeasureEvent
        ? 'validation:full-measure-rest-internal-slot-rejected'
        : 'validation:target-inside-rest-rejected');
      return {
        target: null,
        rejectionReason: 'target-inside-rest',
        diagnostics,
      };
    }

    diagnostics.push('validation:replace-target-missing');
    return {
      target: null,
      rejectionReason: 'replace-target-missing',
      diagnostics,
    };
  }

  // Reject targets that hit no element anchor — but only in voices that
  // already have events. A still-empty voice has no anchors yet; its first
  // entry (e.g. starting voice 2 at a voice-1 anchor) must stay possible.
  if (voiceEvents.length > 0 && exactNotes.length === 0 && exactRests.length === 0) {
    if (isPreservedInternalRestSlot) {
      diagnostics.push('validation:insert-inside-rest-allowed');
      return {
        target: {
          ...input.target,
          corePartId: input.target.corePartId ?? context.partId,
          existingEventKind: 'rest',
          existingEventStartsAtTarget: false,
          diagnostics,
        },
        rejectionReason: null,
        diagnostics,
      };
    }
    diagnostics.push(spanningRest
      ? spanningRestIsSingleFullMeasureEvent
        ? 'validation:full-measure-rest-internal-slot-rejected'
        : 'validation:target-inside-rest-rejected'
      : 'validation:insert-target-missing');
    return {
      target: null,
      rejectionReason: spanningRest ? 'target-inside-rest' : 'insert-target-missing',
      diagnostics,
    };
  }

  const coverage = inspectSilentCoverage({
    events: voiceEvents,
    divisions: context.divisions,
    startOffset,
    endOffset,
    allowStartNote: false,
    allowGaps: true,
  });
  if (!coverage.ok && input.target.allowOccupiedInsert && String(coverage.reason ?? '').startsWith('blocking-event:')) {
    const availableRestAfterStart = voiceEvents
      .filter((event) => !event.isChord && event.kind === 'rest' && eventEndOffset(event, context.divisions) > startOffset)
      .reduce((sum, event) => sum + Math.max(event.durationDivisions, 0), 0);
    const voiceEndAfterInsert = voiceEvents
      .filter((event) => !event.isChord)
      .reduce((max, event) => Math.max(max, eventEndOffset(event, context.divisions)), 0) + requestedDuration;
    if (
      !input.target.preserveOverflow
      && availableRestAfterStart < requestedDuration
      && voiceEndAfterInsert > context.measureDurationDivisions
    ) {
      diagnostics.push('validation:occupied-insert-overflow-rejected');
      return {
        target: null,
        rejectionReason: 'overflow-rejected',
        diagnostics,
      };
    }

    diagnostics.push(`validation:insert-occupied-allowed:${coverage.reason}`);
    return {
      target: {
        ...input.target,
        corePartId: input.target.corePartId ?? context.partId,
        existingEventKind: exactNotes.length > 0 ? 'note' : exactRests.length > 0 || spanningRest ? 'rest' : null,
        existingEventStartsAtTarget: exactNotes.length > 0 || exactRests.length > 0,
        diagnostics,
      },
      rejectionReason: null,
      diagnostics,
    };
  }
  if (!coverage.ok) {
    diagnostics.push(`validation:insert-rejected:${coverage.reason}`);
    return {
      target: null,
      rejectionReason: coverage.reason,
      diagnostics,
    };
  }

  diagnostics.push('validation:insert-silent-span');
  return {
    target: {
      ...input.target,
      corePartId: input.target.corePartId ?? context.partId,
      existingEventKind: exactRests.length > 0 || spanningRest ? 'rest' : null,
      existingEventStartsAtTarget: exactRests.length > 0,
      diagnostics,
    },
    rejectionReason: null,
    diagnostics,
  };
}

export function validateResolvedEditTarget(input: InspectResolvedEditTargetInput) {
  return inspectResolvedEditTarget(input).target;
}
