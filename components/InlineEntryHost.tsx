'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import InlineEntryPopover, { type InlineEntryAdvance } from '@/components/InlineEntryPopover';
import type { SelectedNote } from '@/hooks/useNoteEditor';
import { useI18n, type TranslationKey } from '@/lib/i18n';
import type { ScoreDocumentModel } from '@/src/score-core/model/types';
import { lyricSyllabic, parseInlineEntry, type InlineEntryKind } from '@/src/score-input/inline-entry';
import {
  chordNeighbour, endOfEvent, firstFreeVerse, lyricAt, lyricNeighbour, type EntryPosition,
} from '@/src/score-input/inline-entry-navigation';
import { describePosition } from '@/src/score-input/position-label';
import type { ScoreCommand } from '@/src/shared/schemas/score-command';

/*
 * Host of the inline-entry popover (K4 to K6 in docs/note-entry-mastery-ledger.md): it knows where the
 * popover stands in the score, what a commit writes and where the popover goes next. The score editor
 * supplies the geometry (`place`) and the two ways into the document.
 */

export type InlineEntryFlowKind = 'chord' | 'lyrics' | InlineEntryKind;

export interface InlineEntryRequest {
  kind: InlineEntryFlowKind;
  /** A new number for every request, also for the same kind. */
  serial: number;
  /** Open at this position instead of the selection (a click on an existing chord symbol). */
  at?: { note: SelectedNote; left: number; top: number; value: string };
}

interface InlineEntryHostProps {
  request: InlineEntryRequest | null;
  coreDocument: ScoreDocumentModel | null;
  selectedNote: SelectedNote | null;
  selectedNotes: SelectedNote[];
  /** Left and top of the popover for a position, in the overlay layer; null when it is not rendered. */
  place: (position: EntryPosition, below: boolean) => { left: number; top: number } | null;
  onSetChordSymbol?: (value: string, targetNote?: SelectedNote | null) => void | boolean;
  onApplyInlineEntry?: (commands: ScoreCommand[]) => { ok: boolean; message?: string };
  onClose: () => void;
}

interface OpenEntry {
  kind: InlineEntryFlowKind;
  position: EntryPosition;
  left: number;
  top: number;
  value: string;
  rangeEnd: EntryPosition | null;
  verse: number;
  /** The syllable before ended with a hyphen. */
  lyricContinues: boolean;
  /** A melisma line is open: where it started and the last note the entry passed with `_`. */
  melisma: { start: EntryPosition; startText: string; startSyllabic: 'single' | 'begin' | 'middle' | 'end'; last: EntryPosition | null } | null;
  step: number;
}

const BELOW: ReadonlySet<InlineEntryFlowKind> = new Set<InlineEntryFlowKind>(['lyrics', 'dynamic', 'expression']);

function toPosition(note: SelectedNote): EntryPosition {
  return {
    corePartId: note.corePartId ?? null,
    staffIndex: note.staffIndex,
    voiceId: note.voiceId,
    measureNumber: note.measureNumber,
    coreMeasureId: note.coreMeasureId ?? null,
    timestampNum: note.timestampNum,
    timestampDen: note.timestampDen,
    coreEntityId: note.coreEntityId ?? null,
    isRest: note.isRest,
  };
}

function toLocator(position: EntryPosition) {
  return {
    coreEntityId: position.coreEntityId ?? undefined,
    coreMeasureId: position.coreMeasureId ?? undefined,
    corePartId: position.corePartId ?? undefined,
    measureNumber: position.measureNumber,
    staffIndex: position.staffIndex,
    voiceId: position.voiceId,
    timestampNum: position.timestampNum,
    timestampDen: position.timestampDen,
  };
}

function toSelectedNote(position: EntryPosition): SelectedNote {
  return {
    coreEntityId: position.coreEntityId ?? null,
    coreMeasureId: position.coreMeasureId ?? null,
    corePartId: position.corePartId ?? null,
    measureNumber: position.measureNumber,
    staffIndex: position.staffIndex,
    voiceId: position.voiceId,
    timestampNum: position.timestampNum,
    timestampDen: position.timestampDen,
    step: 'C',
    octave: 4,
    alter: 0,
    isRest: position.isRest ?? true,
    graphicalNote: null,
  };
}

function harmonyAt(document: ScoreDocumentModel | null, position: EntryPosition) {
  if (!document) return '';
  for (const part of document.score.parts) {
    const wanted = position.corePartId?.replace(/^part:/, '') ?? null;
    if (wanted && part.id.replace(/^part:/, '') !== wanted && part.sourcePartId !== wanted) continue;
    for (const staff of part.staves) {
      const measure = staff.measures.find((entry) => entry.measureNumber === position.measureNumber);
      const harmony = measure?.directions.find((direction) => (
        direction.kind === 'harmony'
        && (direction.timestampNum ?? 0) * position.timestampDen === position.timestampNum * Math.max(direction.timestampDen ?? 1, 1)
      ));
      if (harmony?.value) return harmony.value;
    }
  }
  return '';
}

const byTime = (left: SelectedNote, right: SelectedNote) => (
  left.measureNumber - right.measureNumber
  || (left.timestampNum / Math.max(left.timestampDen, 1)) - (right.timestampNum / Math.max(right.timestampDen, 1))
);

export default function InlineEntryHost(props: InlineEntryHostProps) {
  const { request, coreDocument, selectedNote, selectedNotes, place, onSetChordSymbol, onApplyInlineEntry, onClose } = props;
  const { t } = useI18n();
  const [entry, setEntry] = useState<OpenEntry | null>(null);
  const handledSerial = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const placed = useCallback((kind: InlineEntryFlowKind, position: EntryPosition) => (
    place(position, BELOW.has(kind)) ?? { left: 24, top: 24 }
  ), [place]);

  // A new request opens the popover at the selection (or at the place the request names).
  useEffect(() => {
    if (!request) { setEntry(null); return; }
    if (request.serial === handledSerial.current) return;
    handledSerial.current = request.serial;
    if (request.at) {
      setEntry({
        kind: request.kind, position: toPosition(request.at.note), left: request.at.left, top: request.at.top,
        value: request.at.value, rangeEnd: null, verse: 1, lyricContinues: false, melisma: null, step: 0,
      });
      return;
    }
    const range = selectedNotes.length > 1 ? [...selectedNotes].sort(byTime) : [];
    const anchorNote = range[0] ?? selectedNote;
    if (!anchorNote) { onClose(); return; }
    let position = toPosition(anchorNote);
    let verse = 1;
    let value = '';
    if (request.kind === 'lyrics') {
      // Lyrics stand under notes: from a rest the entry starts at the next note.
      if (position.isRest) {
        const next = lyricNeighbour(coreDocument, position, 1);
        if (!next) { onClose(); return; }
        position = next;
      }
      verse = firstFreeVerse(coreDocument, position.coreEntityId);
    } else if (request.kind === 'chord') {
      value = harmonyAt(coreDocument, position);
    }
    setEntry({
      kind: request.kind, position, ...placed(request.kind, position), value,
      rangeEnd: range.length > 1 ? toPosition(range[range.length - 1]!) : null,
      verse, lyricContinues: false, melisma: null, step: 0,
    });
    // The selection at the moment of the request is what counts; later changes do not reopen it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);

  // Keep the popover inside the visible part of the score.
  useLayoutEffect(() => {
    containerRef.current?.querySelector('[data-testid="inline-entry-popover"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [entry?.step, entry?.kind]);

  const close = useCallback(() => { setEntry(null); onClose(); }, [onClose]);

  if (!entry) return null;
  const { kind, position } = entry;
  const flow = kind === 'chord' ? 'chord' : kind === 'lyrics' ? 'lyrics' : 'single';
  const where = t('status.position', describePosition(coreDocument, position));
  const positionLabel = kind === 'lyrics' ? `${where} · ${t('entry.verse', { verse: entry.verse })}` : where;

  const preview = (text: string) => {
    if (kind === 'chord') return { ok: true, text: t('entry.preview.chord', { value: text.trim() }) };
    if (kind === 'lyrics') return { ok: true, text: t('entry.preview.lyrics', { value: text.trim() }) };
    const result = parseInlineEntry(kind, text, {
      anchor: toLocator(position),
      rangeEnd: entry.rangeEnd ? toLocator(entry.rangeEnd) : null,
      rangeStop: endOfEvent(coreDocument, entry.rangeEnd ?? position),
    });
    return result.ok ? { ok: true, text: result.summary } : { ok: false, text: result.message };
  };

  const moveTo = (next: EntryPosition, patch: Partial<OpenEntry>, value: string) => {
    setEntry({ ...entry, ...patch, position: next, ...placed(kind, next), value, step: entry.step + 1 });
  };

  const commit = (text: string, advance: InlineEntryAdvance | null): boolean => {
    if (kind === 'chord') {
      const value = text.trim();
      if (value) onSetChordSymbol?.(value, toSelectedNote(position));
      if (advance == null) { close(); return true; }
      if (advance === 'hyphen' || advance === 'melisma' || advance === 'verseDown' || advance === 'verseUp') return true;
      const next = chordNeighbour(coreDocument, position, advance);
      if (next) moveTo(next, {}, harmonyAt(coreDocument, next));
      return true;
    }

    if (kind === 'lyrics') {
      const value = text.trim();
      const here = toLocator(position);
      const commands: ScoreCommand[] = [];
      let melisma = entry.melisma;
      let continues = entry.lyricContinues;
      if (value) {
        if (melisma) {
          // A new syllable ends the melisma on the note before it; a line that reached no further
          // note is taken back.
          if (melisma.last) commands.push({ type: 'setLyricLine', verseNumber: entry.verse, text: '', extend: 'stop', ...toLocator(melisma.last) } as ScoreCommand);
          else commands.push({ type: 'setLyricLine', verseNumber: entry.verse, text: melisma.startText, syllabic: melisma.startSyllabic, ...toLocator(melisma.start) } as ScoreCommand);
          melisma = null;
        }
        const syllabic = lyricSyllabic(continues, advance === 'hyphen');
        commands.push({ type: 'setLyricLine', verseNumber: entry.verse, text: value, syllabic, ...(advance === 'melisma' ? { extend: 'start' } : {}), ...here } as ScoreCommand);
        continues = advance === 'hyphen';
        if (advance === 'melisma') melisma = { start: position, startText: value, startSyllabic: syllabic, last: null };
      } else if (melisma) {
        if (advance === 'melisma') melisma = { ...melisma, last: position };
        else if (advance == null || advance === 'next') {
          // The line ends on this note.
          commands.push({ type: 'setLyricLine', verseNumber: entry.verse, text: '', extend: 'stop', ...here } as ScoreCommand);
          melisma = null;
        }
      }
      if (commands.length > 0) {
        const applied = onApplyInlineEntry?.(commands) ?? { ok: false };
        if (!applied.ok) return false;
      }
      if (advance == null) { close(); return true; }
      if (advance === 'verseDown' || advance === 'verseUp') {
        const verse = Math.max(1, entry.verse + (advance === 'verseDown' ? 1 : -1));
        setEntry({ ...entry, verse, lyricContinues: false, melisma: null, value: lyricAt(coreDocument, position.coreEntityId, verse)?.text ?? '', step: entry.step + 1 });
        return true;
      }
      const direction = advance === 'previous' || advance === 'previousBar' || advance === 'previousBeat' ? -1 : 1;
      const next = lyricNeighbour(coreDocument, position, direction);
      if (!next) { close(); return true; }
      moveTo(next, { lyricContinues: continues, melisma }, direction < 0 ? lyricAt(coreDocument, next.coreEntityId, entry.verse)?.text ?? '' : '');
      return true;
    }

    const result = parseInlineEntry(kind, text, {
      anchor: toLocator(position),
      rangeEnd: entry.rangeEnd ? toLocator(entry.rangeEnd) : null,
      rangeStop: endOfEvent(coreDocument, entry.rangeEnd ?? position),
    });
    if (!result.ok) return false;
    const applied = onApplyInlineEntry?.(result.commands) ?? { ok: false };
    if (!applied.ok) return false;
    close();
    return true;
  };

  return (
    <div ref={containerRef}>
      <InlineEntryPopover
        flow={flow}
        kind={kind}
        label={t(`entry.label.${kind}` as TranslationKey)}
        ariaLabel={kind === 'chord' ? 'Inline chord symbol' : undefined}
        hint={t(`entry.hint.${kind}` as TranslationKey)}
        placeholder={kind === 'chord' ? 'Cmaj7' : undefined}
        left={entry.left}
        top={entry.top}
        positionKey={`${kind}:${position.measureNumber}:${position.timestampNum}/${position.timestampDen}:${entry.verse}:${entry.step}`}
        initialValue={entry.value}
        positionLabel={positionLabel}
        preview={preview}
        onCommit={commit}
        onCancel={close}
      />
    </div>
  );
}
