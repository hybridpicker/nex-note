import type { ScoreDocumentModel } from '@/src/score-core/model/types';
import type { DocumentDiagnostic } from '@/src/score-core/commands/apply-document-commands';
import { writtenAccidentalToAlter } from '@/src/shared/music/accidentals';

interface EventRef {
  event: ScoreDocumentModel['score']['parts'][number]['staves'][number]['measures'][number]['voices'][number]['events'][number];
  measureNumber: number;
  staffIndex: number;
  voiceId: number;
}

function isNoteEvent(event: EventRef['event'] | null | undefined): event is Extract<EventRef['event'], { kind: 'note' }> {
  return event?.kind === 'note';
}

function expectedMeasureDuration(beats: number, beatType: number, divisions: number) {
  return Math.round((beats * 4 * divisions) / beatType);
}

function durationTypeToDivisions(durationType: string | undefined, isDotted: boolean | undefined, divisions: number) {
  const denominatorByType: Record<string, number> = {
    whole: 1,
    half: 2,
    quarter: 4,
    eighth: 8,
    '16th': 16,
    '32nd': 32,
    '64th': 64,
  };
  const denominator = durationType ? denominatorByType[durationType] : undefined;
  if (!denominator) return null;
  const base = (4 * divisions) / denominator;
  return Math.max(1, Math.round(base * (isDotted ? 1.5 : 1)));
}

function buildGraceEventIdSet(document: ScoreDocumentModel) {
  return new Set(document.graceNotes.map((graceNote) => graceNote.eventId));
}

function tupletScaledDuration(
  document: ScoreDocumentModel,
  eventId: string,
  baseDuration: number,
) {
  const tuplet = document.tuplets.find((entry) => (
    entry.eventIds.includes(eventId)
    && entry.actualNotes
    && entry.normalNotes
  ));
  if (!tuplet?.actualNotes || !tuplet.normalNotes) return baseDuration;
  return Math.max(1, Math.round((baseDuration * tuplet.normalNotes) / tuplet.actualNotes));
}

function getEffectiveAttributes(document: ScoreDocumentModel, partIndex: number, staffIndex: number, measureIndex: number) {
  let divisions: number | undefined;
  let time: { beats: number; beatType: number; beatGroups?: number[] } | undefined;

  for (let m = measureIndex; m >= 0; m--) {
    const measure = document.score.parts[partIndex].staves[staffIndex].measures[m];
    if (!measure) continue;

    for (let index = measure.attributes.length - 1; index >= 0; index--) {
      const attribute = measure.attributes[index];
      if (!attribute) continue;
      if (divisions == null && typeof attribute.divisions === 'number' && attribute.divisions > 0) {
        divisions = attribute.divisions;
      }
      if (time == null && attribute.time?.beats && attribute.time.beatType) {
        time = {
          beats: attribute.time.beats,
          beatType: attribute.time.beatType,
          ...(attribute.time.beatGroups ? { beatGroups: [...attribute.time.beatGroups] } : {}),
        };
      }
      if (divisions != null && time != null) {
        return { divisions, time };
      }
    }
  }

  return divisions != null || time != null ? { divisions, time } : undefined;
}

function totalVoiceDuration(voice: ScoreDocumentModel['score']['parts'][number]['staves'][number]['measures'][number]['voices'][number]) {
  let maxEnd = 0;
  for (const event of voice.events) {
    maxEnd = Math.max(maxEnd, event.timestampNum + event.durationDivisions);
  }
  return maxEnd;
}

function totalVoiceRhythmicValue(voice: ScoreDocumentModel['score']['parts'][number]['staves'][number]['measures'][number]['voices'][number]) {
  return voice.events.reduce((total, event) => (
    event.isChord ? total : total + Math.max(event.durationDivisions, 0)
  ), 0);
}

function findVoiceGaps(
  voice: ScoreDocumentModel['score']['parts'][number]['staves'][number]['measures'][number]['voices'][number],
  expectedDuration: number | null,
) {
  const sortedEvents = [...voice.events].sort((a, b) => a.timestampNum - b.timestampNum || Number(a.isChord) - Number(b.isChord));
  const gaps: Array<{ start: number; end: number }> = [];
  let cursor = 0;

  for (const event of sortedEvents) {
    if (event.isChord) continue;
    if (event.timestampNum > cursor) {
      gaps.push({ start: cursor, end: event.timestampNum });
    }
    cursor = Math.max(cursor, event.timestampNum + event.durationDivisions);
  }

  if (expectedDuration != null && cursor < expectedDuration) {
    gaps.push({ start: cursor, end: expectedDuration });
  }

  return gaps;
}

function voiceKey(partId: string, staffIndex: number, voiceId: number) {
  return `${partId}:${staffIndex}:${voiceId}`;
}

function compareEventRefPosition(left: EventRef, right: EventRef) {
  return left.measureNumber - right.measureNumber
    || (left.event.timestampNum / Math.max(left.event.timestampDen, 1)) - (right.event.timestampNum / Math.max(right.event.timestampDen, 1))
    || Number(left.event.isChord) - Number(right.event.isChord)
    || left.event.id.localeCompare(right.event.id);
}

function compareEventRefOnsetPosition(left: EventRef, right: EventRef) {
  return left.measureNumber - right.measureNumber
    || (left.event.timestampNum / Math.max(left.event.timestampDen, 1)) - (right.event.timestampNum / Math.max(right.event.timestampDen, 1));
}

function sameEventRefOnset(left: EventRef, right: EventRef) {
  return left.measureNumber === right.measureNumber
    && left.event.timestampNum === right.event.timestampNum
    && left.event.timestampDen === right.event.timestampDen;
}

function notePitchesEqual(left: EventRef['event'] | undefined, right: EventRef['event'] | undefined) {
  if (!isNoteEvent(left) || !isNoteEvent(right)) return false;
  return left.pitch.step === right.pitch.step
    && left.pitch.alter === right.pitch.alter
    && left.pitch.octave === right.pitch.octave;
}

function tieContinuesAtNextOnset(refs: EventRef[], current: EventRef) {
  if (!isNoteEvent(current.event)) return false;
  const laterNotes = refs
    .filter((ref) => isNoteEvent(ref.event) && compareEventRefOnsetPosition(ref, current) > 0)
    .sort(compareEventRefPosition);
  const next = laterNotes[0];
  if (!next) return false;
  return laterNotes
    .filter((ref) => sameEventRefOnset(ref, next))
    .some((ref) => notePitchesEqual(current.event, ref.event));
}

export const DOCUMENT_DIAGNOSTIC_LEVELS = {
  missing_core_document: 'warning',
  no_parts: 'error',
  no_staves: 'error',
  invalid_measure_number: 'error',
  measure_order: 'warning',
  invalid_time_signature: 'error',
  key_range: 'warning',
  transpose_range: 'warning',
  empty_voice: 'warning',
  voice_overlap: 'warning',
  measure_balance: 'warning',
  voice_rhythm_sum_mismatch: 'warning',
  event_duration_notation_mismatch: 'warning',
  written_accidental_pitch_mismatch: 'error',
  accidental_display_without_written_accidental: 'error',
  invalid_accidental_enclosure: 'error',
  voice_timeline_gap: 'warning',
  voice_duration_mismatch: 'warning',
  multi_voice_rhythm_gap: 'warning',
  tie_continuity: 'warning',
  lyric_continuity: 'warning',
  dangling_tuplet: 'warning',
  tuplet_span_short: 'warning',
  tuplet_voice_mismatch: 'warning',
  tuplet_count_mismatch: 'warning',
  repeat_end_without_start: 'warning',
  ending_without_repeat: 'warning',
  duplicate_ending_start: 'warning',
  ending_stop_without_start: 'warning',
  dangling_lyric_line: 'warning',
  invalid_layout_hint: 'warning',
  dangling_slur: 'warning',
  dangling_grace_note: 'warning',
  dangling_beam: 'warning',
  dangling_tremolo: 'warning',
  dangling_glissando: 'warning',
  dangling_arpeggio: 'warning',
} as const satisfies Record<string, DocumentDiagnostic['level']>;

type DocumentDiagnosticCode = keyof typeof DOCUMENT_DIAGNOSTIC_LEVELS;

function createDiagnostic(code: DocumentDiagnosticCode, message: string): DocumentDiagnostic {
  return {
    level: DOCUMENT_DIAGNOSTIC_LEVELS[code],
    code,
    message,
  };
}

export function validateScoreDocument(document: ScoreDocumentModel | null): DocumentDiagnostic[] {
  if (!document) {
    return [createDiagnostic('missing_core_document', 'No core score document is available.')];
  }

  const diagnostics: DocumentDiagnostic[] = [];
  const eventLookup = new Map<string, EventRef>();
  const voiceEvents = new Map<string, EventRef[]>();
  const graceEventIds = buildGraceEventIdSet(document);

  for (const part of document.score.parts) {
    for (const staff of part.staves) {
      for (const measure of staff.measures) {
        for (const voice of measure.voices) {
          const key = voiceKey(part.id, staff.staffIndex, voice.voiceId);
          const refs = voice.events.map((event) => ({
            event,
            measureNumber: measure.measureNumber,
            staffIndex: staff.staffIndex,
            voiceId: voice.voiceId,
          }));
          voiceEvents.set(key, [...(voiceEvents.get(key) ?? []), ...refs]);
          refs.forEach((ref) => eventLookup.set(ref.event.id, ref));
        }
      }
    }
  }

  const knownEventIds = new Set(eventLookup.keys());

  if (document.score.parts.length === 0) {
    diagnostics.push(createDiagnostic('no_parts', 'Score document contains no parts.'));
  }

  for (const part of document.score.parts) {
    if (part.staves.length === 0) {
      diagnostics.push(createDiagnostic('no_staves', `Part ${part.sourcePartId} contains no staves.`));
    }

    if (part.chromaticTranspose != null && (part.chromaticTranspose < -24 || part.chromaticTranspose > 24)) {
      diagnostics.push(createDiagnostic('transpose_range', `Part ${part.sourcePartId} contains a chromatic transpose outside the supported range.`));
    }

    for (const [staffIndex, staff] of part.staves.entries()) {
      let previousMeasure = 0;
      for (const [measureIndex, measure] of staff.measures.entries()) {
        if (measure.measureNumber <= 0) {
          diagnostics.push(createDiagnostic('invalid_measure_number', `Staff ${staff.staffIndex} in part ${part.sourcePartId} has a non-positive measure number.`));
        }

        if (previousMeasure > 0 && measure.measureNumber < previousMeasure) {
          diagnostics.push(createDiagnostic('measure_order', `Staff ${staff.staffIndex} in part ${part.sourcePartId} has descending measure numbers.`));
        }
        previousMeasure = measure.measureNumber;

        const effectiveAttributes = getEffectiveAttributes(document, document.score.parts.indexOf(part), staffIndex, measureIndex);
        for (const attribute of measure.attributes) {
          if (attribute.time && (attribute.time.beats <= 0 || attribute.time.beatType <= 0)) {
            diagnostics.push(createDiagnostic('invalid_time_signature', `Measure ${measure.measureNumber} contains an invalid time signature.`));
          }
          if (attribute.time?.beatGroups) {
            const validGroups = attribute.time.beatGroups.every((group) => Number.isInteger(group) && group > 0);
            const groupedBeats = attribute.time.beatGroups.reduce((sum, group) => sum + group, 0);
            if (!validGroups || attribute.time.beatGroups.length < 2 || groupedBeats !== attribute.time.beats) {
              diagnostics.push(createDiagnostic(
                'invalid_time_signature',
                `Measure ${measure.measureNumber} contains additive beat groups that do not match its time signature.`,
              ));
            }
          }
          if (attribute.keyFifths != null && (attribute.keyFifths < -7 || attribute.keyFifths > 7)) {
            diagnostics.push(createDiagnostic('key_range', `Measure ${measure.measureNumber} contains a key signature outside the supported fifths range.`));
          }
        }

        const expectedDuration = effectiveAttributes?.time
          ? expectedMeasureDuration(effectiveAttributes.time.beats, effectiveAttributes.time.beatType, effectiveAttributes.divisions ?? 1)
          : null;
        const voiceDurations = measure.voices.map((voice) => totalVoiceDuration(voice));
        let measureHasMultiVoiceGap = false;

        for (const voice of measure.voices) {
          const key = voiceKey(part.id, staff.staffIndex, voice.voiceId);
          const refs = voiceEvents.get(key) ?? [];

          if (voice.events.length === 0) {
            diagnostics.push(createDiagnostic('empty_voice', `Measure ${measure.measureNumber} staff ${staff.staffIndex} voice ${voice.voiceId} is empty.`));
            continue;
          }

          const sortedEvents = [...voice.events].sort((a, b) => a.timestampNum - b.timestampNum);
          for (let i = 1; i < sortedEvents.length; i++) {
            const previous = sortedEvents[i - 1];
            const current = sortedEvents[i];
            if (current.timestampNum === previous.timestampNum && current.timestampDen === previous.timestampDen) {
              continue;
            }
            if (current.timestampNum < previous.timestampNum + (previous.isChord ? 0 : previous.durationDivisions)) {
              diagnostics.push(createDiagnostic('voice_overlap', `Measure ${measure.measureNumber} staff ${staff.staffIndex} voice ${voice.voiceId} contains overlapping events.`));
              break;
            }
          }

          if (!measure.implicit && expectedDuration != null && totalVoiceDuration(voice) !== expectedDuration) {
            diagnostics.push(createDiagnostic('measure_balance', `Measure ${measure.measureNumber} staff ${staff.staffIndex} voice ${voice.voiceId} does not fill the expected measure duration.`));
          }

          if (!measure.implicit && expectedDuration != null) {
            const rhythmicValue = totalVoiceRhythmicValue(voice);
            if (rhythmicValue !== expectedDuration) {
              const time = effectiveAttributes?.time;
              const timeSignature = time ? `${time.beats}/${time.beatType}` : 'unknown meter';
              diagnostics.push(createDiagnostic(
                'voice_rhythm_sum_mismatch',
                `Measure ${measure.measureNumber} staff ${staff.staffIndex} voice ${voice.voiceId} has rhythmic value sum ${rhythmicValue}/${expectedDuration} divisions, but ${timeSignature} requires ${expectedDuration}.`,
              ));
            }
          }

          const divisions = effectiveAttributes?.divisions ?? 1;
          for (const event of voice.events) {
            if (
              event.kind === 'note'
              && (event.accidentalCautionary || event.accidentalEnclosure)
              && !event.writtenAccidental
            ) {
              diagnostics.push(createDiagnostic(
                'accidental_display_without_written_accidental',
                `Measure ${measure.measureNumber} staff ${staff.staffIndex} voice ${voice.voiceId} ${event.pitch.step}${event.pitch.octave}@${event.timestampNum}/${event.timestampDen} has accidental display metadata without an explicitly written accidental.`,
              ));
            }
            if (
              event.kind === 'note'
              && event.accidentalEnclosure != null
              && event.accidentalEnclosure !== 'round'
              && event.accidentalEnclosure !== 'square'
            ) {
              diagnostics.push(createDiagnostic(
                'invalid_accidental_enclosure',
                `Measure ${measure.measureNumber} staff ${staff.staffIndex} voice ${voice.voiceId} ${event.pitch.step}${event.pitch.octave}@${event.timestampNum}/${event.timestampDen} has unsupported accidental enclosure ${String(event.accidentalEnclosure)}.`,
              ));
            }
            if (
              event.kind === 'note'
              && event.writtenAccidental
              && event.pitch.alter !== writtenAccidentalToAlter(event.writtenAccidental)
            ) {
              diagnostics.push(createDiagnostic(
                'written_accidental_pitch_mismatch',
                `Measure ${measure.measureNumber} staff ${staff.staffIndex} voice ${voice.voiceId} ${event.pitch.step}${event.pitch.octave}@${event.timestampNum}/${event.timestampDen} has written accidental ${event.writtenAccidental} but alter ${event.pitch.alter}.`,
              ));
            }
            if (graceEventIds.has(event.id)) continue;
            const notatedDuration = durationTypeToDivisions(event.durationType, event.isDotted, divisions);
            const expectedNotatedDuration = notatedDuration == null
              ? null
              : tupletScaledDuration(document, event.id, notatedDuration);
            if (expectedNotatedDuration != null && event.durationDivisions !== expectedNotatedDuration) {
              diagnostics.push(createDiagnostic(
                'event_duration_notation_mismatch',
                `Measure ${measure.measureNumber} staff ${staff.staffIndex} voice ${voice.voiceId} ${event.kind}@${event.timestampNum}/${event.timestampDen} is notated as ${event.isDotted ? 'dotted ' : ''}${event.durationType} (${expectedNotatedDuration} divisions) but has ${event.durationDivisions} divisions.`,
              ));
            }
          }

          const gaps = findVoiceGaps(voice, measure.implicit ? null : expectedDuration);
          if (gaps.length > 0) {
            const firstGap = gaps[0];
            diagnostics.push(createDiagnostic('voice_timeline_gap', `Measure ${measure.measureNumber} staff ${staff.staffIndex} voice ${voice.voiceId} contains an uncovered rhythmic gap from ${firstGap.start} to ${firstGap.end}.`));
            if (measure.voices.length > 1) {
              measureHasMultiVoiceGap = true;
            }
          }

          for (let i = 0; i < sortedEvents.length; i++) {
            const event = sortedEvents[i];
            if (event.tieStart) {
              if (!tieContinuesAtNextOnset(refs, {
                event,
                measureNumber: measure.measureNumber,
                staffIndex: staff.staffIndex,
                voiceId: voice.voiceId,
              })) {
                diagnostics.push(createDiagnostic('tie_continuity', `Measure ${measure.measureNumber} voice ${voice.voiceId} has a tie start without a matching following note.`));
              }
            }

            const semanticLyrics = document.lyricLines
              .filter((line) => line.eventId === event.id)
              .sort((a, b) => a.verseNumber - b.verseNumber);
            const lyric = semanticLyrics[0] ?? event.lyrics?.[0];
            if (lyric?.syllabic && ['begin', 'middle'].includes(lyric.syllabic)) {
              const nextWithLyric = sortedEvents.slice(i + 1).find((candidate) => (
                document.lyricLines.some((line) => line.eventId === candidate.id) || candidate.lyrics?.length
              ));
              if (!nextWithLyric) {
                diagnostics.push(createDiagnostic('lyric_continuity', `Measure ${measure.measureNumber} voice ${voice.voiceId} has an unterminated lyric syllable.`));
              }
            }
          }
        }

        if (!measure.implicit && voiceDurations.length > 1) {
          const distinctDurations = new Set(voiceDurations);
          if (distinctDurations.size > 1) {
            diagnostics.push(createDiagnostic('voice_duration_mismatch', `Measure ${measure.measureNumber} contains voices with inconsistent total durations.`));
          }

          if (measureHasMultiVoiceGap) {
            diagnostics.push(createDiagnostic('multi_voice_rhythm_gap', `Measure ${measure.measureNumber} contains a rhythmic gap in at least one voice while multiple voices are active.`));
          }
        }
      }
    }
  }

  for (const tuplet of document.tuplets) {
    const refs = tuplet.eventIds
      .map((eventId) => eventLookup.get(eventId))
      .filter((ref): ref is EventRef => Boolean(ref));

    if (refs.length !== tuplet.eventIds.length) {
      diagnostics.push(createDiagnostic('dangling_tuplet', `Tuplet ${tuplet.id} references one or more unknown events.`));
      continue;
    }

    if (refs.length < 2) {
      diagnostics.push(createDiagnostic('tuplet_span_short', `Tuplet ${tuplet.id} spans fewer than two events.`));
    }

    const voices = new Set(refs.map((ref) => `${ref.staffIndex}:${ref.voiceId}`));
    if (voices.size > 1) {
      diagnostics.push(createDiagnostic('tuplet_voice_mismatch', `Tuplet ${tuplet.id} spans multiple voices or staves.`));
    }

    const rhythmicRefs = refs.filter((ref) => !ref.event.isChord);
    if (tuplet.actualNotes && rhythmicRefs.length !== tuplet.actualNotes) {
      diagnostics.push(createDiagnostic('tuplet_count_mismatch', `Tuplet ${tuplet.id} contains ${rhythmicRefs.length} rhythmic events but declares ${tuplet.actualNotes} actual notes.`));
    }
  }

  // Split comma-separated ending numbers (e.g. "1,2" → ["1","2"]) for set-based tracking.
  function parseEndingNumbers(numberString: string): string[] {
    return numberString.split(',').map((n) => n.trim()).filter(Boolean);
  }

  for (const part of document.score.parts) {
    for (const staff of part.staves) {
      let seenRepeatStart = false;
      // A volta alt-ending that follows immediately after a repeat-end barline is
      // semantically valid even though seenRepeatStart has been reset.  Keep this
      // flag true while open alt-endings exist after the repeat closed.
      let prevMeasureClosedRepeat = false;
      const openEndings = new Set<string>();

      for (const measure of staff.measures) {
        if (measure.leftBarline === 'repeat-start') {
          seenRepeatStart = true;
          prevMeasureClosedRepeat = false;
        }

        if (measure.rightBarline === 'repeat-end' && !seenRepeatStart) {
          diagnostics.push(createDiagnostic('repeat_end_without_start', `Measure ${measure.measureNumber} ends a repeat without a preceding repeat start.`));
        }

        const hasAnyEnding = measure.leftEnding || measure.rightEnding;
        const endingIsValid = seenRepeatStart || prevMeasureClosedRepeat || measure.leftBarline === 'repeat-start';
        if (hasAnyEnding && !endingIsValid) {
          diagnostics.push(createDiagnostic('ending_without_repeat', `Measure ${measure.measureNumber} defines an ending without an active repeat section.`));
        }

        for (const endingMark of [measure.leftEnding, measure.rightEnding]) {
          if (!endingMark) continue;
          // Parse multi-number tokens ("1,2" → ["1","2"]) before set operations so
          // that compound endings are tracked individually.
          const numbers = parseEndingNumbers(endingMark.number);
          if (endingMark.type === 'start') {
            const alreadyOpen = numbers.some((n) => openEndings.has(n));
            if (alreadyOpen) {
              diagnostics.push(createDiagnostic('duplicate_ending_start', `Measure ${measure.measureNumber} starts ending ${endingMark.number} more than once without closing it.`));
            }
            numbers.forEach((n) => openEndings.add(n));
          } else {
            const anyOpen = numbers.some((n) => openEndings.has(n));
            if (!anyOpen) {
              diagnostics.push(createDiagnostic('ending_stop_without_start', `Measure ${measure.measureNumber} closes ending ${endingMark.number} without a matching start.`));
            } else {
              numbers.forEach((n) => openEndings.delete(n));
            }
          }
        }

        if (measure.rightBarline === 'repeat-end') {
          seenRepeatStart = false;
          prevMeasureClosedRepeat = true;
          openEndings.clear();
        } else if (!hasAnyEnding && openEndings.size === 0) {
          // Once we leave the alt-ending zone (no endings active, none open), the
          // closed-repeat context no longer applies.
          prevMeasureClosedRepeat = false;
        }
      }
    }
  }

  for (const slur of document.slurs) {
    const startMissing = slur.startEventId != null && !knownEventIds.has(slur.startEventId);
    const stopMissing = slur.stopEventId != null && !knownEventIds.has(slur.stopEventId);
    if (startMissing || stopMissing) {
      diagnostics.push(createDiagnostic('dangling_slur', `Slur ${slur.id} references one or more unknown events.`));
    }
  }

  for (const graceNote of document.graceNotes) {
    if (!knownEventIds.has(graceNote.eventId)) {
      diagnostics.push(createDiagnostic('dangling_grace_note', `Grace note ${graceNote.id} references an unknown event.`));
    }
  }

  for (const tremolo of document.tremolos) {
    if (!knownEventIds.has(tremolo.eventId)) {
      diagnostics.push(createDiagnostic('dangling_tremolo', `Tremolo ${tremolo.id} references an unknown event.`));
    }
  }

  for (const glissando of document.glissandos) {
    const startMissing = glissando.startEventId != null && !knownEventIds.has(glissando.startEventId);
    const stopMissing = glissando.stopEventId != null && !knownEventIds.has(glissando.stopEventId);
    if (startMissing || stopMissing) {
      diagnostics.push(createDiagnostic('dangling_glissando', `Glissando ${glissando.id} references one or more unknown events.`));
    }
  }

  for (const arpeggio of document.arpeggios) {
    if (!knownEventIds.has(arpeggio.eventId)) {
      diagnostics.push(createDiagnostic('dangling_arpeggio', `Arpeggio ${arpeggio.id} references an unknown event.`));
    }
  }

  for (const beam of document.beams) {
    const anyMissing = beam.eventIds.some((id) => !knownEventIds.has(id));
    if (anyMissing) {
      diagnostics.push(createDiagnostic('dangling_beam', `Beam group ${beam.id} references one or more unknown events.`));
    }
  }

  document.lyricLines.forEach((line) => {
    if (!knownEventIds.has(line.eventId)) {
      diagnostics.push(createDiagnostic('dangling_lyric_line', `Lyric line ${line.id} references an unknown event.`));
    }
  });

  document.layoutHints.forEach((hint) => {
    if (hint.kind === 'staffSpacing' && typeof hint.value === 'number' && hint.value <= 0) {
      diagnostics.push(createDiagnostic('invalid_layout_hint', `Layout hint ${hint.id} contains a non-positive staff spacing.`));
    }
  });

  return diagnostics;
}
