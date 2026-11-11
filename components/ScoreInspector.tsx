'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { EditorSelection, SelectedNote } from '@/hooks/useNoteEditor';
import type { ArticulationKind, DynamicKind } from '@/lib/note-editor';
import { summarizeScoreDocument, type ScoreCommand } from '@/lib/score-commands';
import type { ScoreDocumentModel } from '@/src/score-core/model/types';
import { findEventReference } from '@/src/score-core/query/note-editor';
import { useI18n, type TranslationKey } from '@/lib/i18n';
import { describePosition, durationLabelKey } from '@/src/score-input/position-label';
import { inputVoiceOf } from '@/src/score-input/voice-mapping';
import type { AccidentalEnclosure } from '@/src/shared/music/accidentals';

interface Props {
  xml: string;
  coreDocument: ScoreDocumentModel | null;
  selection?: EditorSelection;
  selectedNote: SelectedNote | null;
  selectedNotes: SelectedNote[];
  currentMeasure: number;
  onApplyCommands: (commands: ScoreCommand[], label?: string) => void;
  onOpenExtractedPart: (partId: string, partName: string) => void;
}

const KEY_PRESETS = [
  { label: 'C', fifths: 0 },
  { label: 'G', fifths: 1 },
  { label: 'D', fifths: 2 },
  { label: 'A', fifths: 3 },
  { label: 'F', fifths: -1 },
  { label: 'Bb', fifths: -2 },
];

const TIME_PRESETS = [
  { label: '4/4', beats: 4, beatType: 4 },
  { label: '3/4', beats: 3, beatType: 4 },
  { label: '6/8', beats: 6, beatType: 8 },
  { label: '2/2', beats: 2, beatType: 2 },
];

const CLEF_PRESETS = [
  { label: 'Treble', sign: 'G' as const, line: 2 as const },
  { label: 'Bass', sign: 'F' as const, line: 4 as const },
  { label: 'Alto', sign: 'C' as const, line: 3 as const },
];

const PRINT_LAYOUT_PRESETS = [
  { label: 'Compact', spacing: 84, description: 'Dense lead sheets and sketch prints.' },
  { label: 'Balanced', spacing: 96, description: 'Default part layout with moderate air.' },
  { label: 'Roomy', spacing: 112, description: 'More space for dynamics and phrase marks.' },
  { label: 'Choir', spacing: 124, description: 'Extra clearance for lyric-heavy pages.' },
];

const DYNAMIC_CHOICES: DynamicKind[] = ['pp', 'p', 'mp', 'mf', 'f', 'ff', 'fff', 'sfz'];
const ARTICULATION_LABELS: Record<string, string> = {
  staccato: 'Staccato',
  staccatissimo: 'Staccatissimo',
  accent: 'Accent',
  'strong-accent': 'Marcato',
  tenuto: 'Tenuto',
  fermata: 'Fermata',
};

type InspectorSectionId =
  | 'selection'
  | 'score-setup'
  | 'key'
  | 'repeats-endings'
  | 'time-clef'
  | 'measure'
  | 'text-rehearsal'
  | 'lyrics'
  | 'parts';

const DEFAULT_OPEN_SECTIONS: Record<InspectorSectionId, boolean> = {
  selection: true,
  'score-setup': true,
  key: false,
  'repeats-endings': false,
  'time-clef': false,
  measure: false,
  'text-rehearsal': true,
  lyrics: true,
  parts: false,
};

const INSPECTOR_SECTION_LABELS: Array<{ id: InspectorSectionId; label: string }> = [
  { id: 'selection', label: 'Selection' },
  { id: 'score-setup', label: 'Score Setup' },
  { id: 'key', label: 'Key' },
  { id: 'repeats-endings', label: 'Repeats & Endings' },
  { id: 'time-clef', label: 'Time & Clef' },
  { id: 'measure', label: 'Measure' },
  { id: 'text-rehearsal', label: 'Text & Rehearsal' },
  { id: 'lyrics', label: 'Lyrics' },
  { id: 'parts', label: 'Parts & Instruments' },
];

function buildSelectionRange(selectedNotes: SelectedNote[]) {
  if (selectedNotes.length < 2) return null;
  const sorted = [...selectedNotes].sort((a, b) => (
    a.measureNumber - b.measureNumber
    || a.staffIndex - b.staffIndex
    || a.voiceId - b.voiceId
    || (a.timestampNum / Math.max(a.timestampDen, 1)) - (b.timestampNum / Math.max(b.timestampDen, 1))
  ));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  return {
    start: {
      ...partScope(first),
      measureNumber: first.measureNumber,
      staffIndex: first.staffIndex,
      voiceId: first.voiceId,
      timestampNum: first.timestampNum,
      timestampDen: first.timestampDen,
    },
    end: {
      ...partScope(last),
      measureNumber: last.measureNumber,
      staffIndex: last.staffIndex,
      voiceId: last.voiceId,
      timestampNum: last.timestampNum,
      timestampDen: last.timestampDen,
    },
  };
}

function sortSelection(selectedNotes: SelectedNote[]) {
  return [...selectedNotes].sort((a, b) => (
    a.measureNumber - b.measureNumber
    || a.staffIndex - b.staffIndex
    || a.voiceId - b.voiceId
    || (a.timestampNum / Math.max(a.timestampDen, 1)) - (b.timestampNum / Math.max(b.timestampDen, 1))
  ));
}

function resolveSelectedDynamic(
  coreDocument: ScoreDocumentModel | null,
  selectedNote: SelectedNote | null,
): { value: DynamicKind; placement: 'above' | 'below' } {
  if (!coreDocument || !selectedNote) return { value: 'mf', placement: 'below' };
  for (const part of coreDocument.score.parts) {
    const staff = part.staves.find((entry) => entry.staffIndex === selectedNote.staffIndex);
    const measure = staff?.measures.find((entry) => entry.measureNumber === selectedNote.measureNumber);
    const dynamic = measure?.directions.find((direction) => (
      direction.kind === 'dynamics'
      && direction.staffIndex === selectedNote.staffIndex
      && direction.timestampNum === selectedNote.timestampNum
      && direction.timestampDen === selectedNote.timestampDen
      && DYNAMIC_CHOICES.includes(direction.value as DynamicKind)
    ));
    if (dynamic?.value && DYNAMIC_CHOICES.includes(dynamic.value as DynamicKind)) {
      return {
        value: dynamic.value as DynamicKind,
        placement: dynamic.placement === 'above' ? 'above' : 'below',
      };
    }
  }
  return { value: 'mf', placement: 'below' };
}

function resolveSelectedLyric(
  coreDocument: ScoreDocumentModel | null,
  selectedNote: SelectedNote | null,
): { text: string; verse: string } {
  if (!coreDocument || !selectedNote) return { text: '', verse: '1' };
  const event = findEventReference(coreDocument, {
    coreEntityId: selectedNote.coreEntityId ?? null,
    coreMeasureId: selectedNote.coreMeasureId ?? null,
    corePartId: selectedNote.corePartId ?? null,
    measureNumber: selectedNote.measureNumber,
    staffIndex: selectedNote.staffIndex,
    voiceId: selectedNote.voiceId,
    timestampNum: selectedNote.timestampNum,
    timestampDen: selectedNote.timestampDen,
  })?.event;
  const lyric = event?.kind === 'note' ? event.lyrics?.[0] : undefined;
  return {
    text: lyric?.text ?? '',
    verse: String(lyric?.verseNumber ?? 1),
  };
}

function resolveSelectedSlur(
  coreDocument: ScoreDocumentModel | null,
  selectedNotes: SelectedNote[],
): {
  placement: 'above' | 'below';
  start: SelectedNote;
  stop: SelectedNote;
} | null {
  if (!coreDocument || selectedNotes.length < 2) return null;
  const pitchedSelection = sortSelection(selectedNotes).filter((note) => !note.isRest);
  if (pitchedSelection.length < 2) return null;
  const first = pitchedSelection[0];
  const last = pitchedSelection[pitchedSelection.length - 1];
  const startEvent = findEventReference(coreDocument, first)?.event;
  const stopEvent = findEventReference(coreDocument, last)?.event;
  if (startEvent?.kind !== 'note' || stopEvent?.kind !== 'note' || startEvent.id === stopEvent.id) return null;
  const slur = coreDocument.slurs.find((entry) => entry.startEventId === startEvent.id && entry.stopEventId === stopEvent.id);
  if (!slur) return null;
  return {
    placement: slur.placement === 'below' ? 'below' : 'above',
    start: first,
    stop: last,
  };
}

function resolveSelectedTie(
  coreDocument: ScoreDocumentModel | null,
  selectedNote: SelectedNote | null,
): { placement: 'above' | 'below'; note: SelectedNote } | null {
  if (!coreDocument || !selectedNote || selectedNote.isRest) return null;
  const event = findEventReference(coreDocument, selectedNote)?.event;
  if (event?.kind !== 'note' || !event.tieStart) return null;
  return {
    placement: event.tiePlacement === 'below' ? 'below' : 'above',
    note: selectedNote,
  };
}

function resolveSelectedArticulations(
  coreDocument: ScoreDocumentModel | null,
  selectedNote: SelectedNote | null,
): Array<{ kind: ArticulationKind; label: string; placement: 'above' | 'below' }> {
  if (!coreDocument || !selectedNote || selectedNote.isRest) return [];
  const event = findEventReference(coreDocument, selectedNote)?.event;
  if (!event?.id) return [];
  const kinds = new Set<string>(event.articulations ?? []);
  if (coreDocument.fermataEventIds.has(event.id)) kinds.add('fermata');
  return [...kinds]
    .filter((kind): kind is ArticulationKind => (
      kind === 'staccato'
      || kind === 'staccatissimo'
      || kind === 'accent'
      || kind === 'strong-accent'
      || kind === 'tenuto'
      || kind === 'fermata'
    ))
    .map((kind) => ({
      kind,
      label: ARTICULATION_LABELS[kind] ?? kind,
      placement: event.articulationPlacements?.[kind] === 'below' ? 'below' : 'above',
    }));
}

function buildPerNoteCommands(
  selectedNotes: SelectedNote[],
  mapNote: (note: SelectedNote) => ScoreCommand,
) {
  return sortSelection(selectedNotes).map(mapNote);
}

function buildAccidentalDisplayCommands(
  selectedNotes: SelectedNote[],
  cautionary: boolean,
  enclosure: AccidentalEnclosure,
): ScoreCommand[] {
  return sortSelection(selectedNotes)
    .filter((note) => !note.isRest && Boolean(note.writtenAccidental))
    .map((note) => ({
      type: 'setAccidentalDisplay',
      coreEntityId: note.coreEntityId ?? undefined,
      coreMeasureId: note.coreMeasureId ?? undefined,
      corePartId: note.corePartId ?? undefined,
      measureNumber: note.measureNumber,
      staffIndex: note.staffIndex,
      voiceId: note.voiceId,
      timestampNum: note.timestampNum,
      timestampDen: note.timestampDen,
      cautionary,
      enclosure,
    }));
}

function uniquePartMeasureNumbers(part: ScoreDocumentModel['score']['parts'][number]) {
  return Array.from(new Set(part.staves.flatMap((staff) => staff.measures.map((measure) => measure.measureNumber))))
    .sort((a, b) => a - b);
}

function InspectorSection({
  id,
  title,
  open,
  onToggle,
  children,
}: {
  id: InspectorSectionId;
  title: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="mt-3 rounded-2xl border border-gray-200 bg-white">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={`score-inspector-section-${id}`}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50"
      >
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</span>
        <svg
          className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div id={`score-inspector-section-${id}`} className="border-t border-gray-100 px-4 pb-4 pt-3">
          {children}
        </div>
      )}
    </section>
  );
}


function partScope(note: { corePartId?: string | null }) {
  return note.corePartId ? { corePartId: note.corePartId } : {};
}

export default function ScoreInspector({ xml, coreDocument, selection, selectedNote, selectedNotes, currentMeasure, onApplyCommands, onOpenExtractedPart }: Props) {
  const { t } = useI18n();
  // Properties of the one selected note or rest (O3 in docs/note-entry-mastery-ledger.md).
  const noteProperties = useMemo(() => {
    if (!coreDocument || !selectedNote || selectedNotes.length > 1) return null;
    let found: ScoreDocumentModel['score']['parts'][number]['staves'][number]['measures'][number]['voices'][number]['events'][number] | null = null;
    for (const part of coreDocument.score.parts) {
      for (const staff of part.staves) {
        for (const measure of staff.measures) {
          if (selectedNote.coreMeasureId ? measure.id !== selectedNote.coreMeasureId : measure.measureNumber !== selectedNote.measureNumber) continue;
          for (const voice of measure.voices) {
            found = voice.events.find((event) => event.id === selectedNote.coreEntityId) ?? found;
          }
        }
      }
    }
    if (!found) return null;
    const event = found;
    const position = describePosition(coreDocument, selectedNote);
    const valueKey = durationLabelKey(event.durationType);
    const valueName = valueKey ? t(`note.duration.${valueKey}` as TranslationKey).replace(/\s*\([^)]*\)\s*$/, '') : (event.durationType ?? '');
    const alter = event.kind === 'note' ? event.pitch.alter : 0;
    const accidental = alter === 2 ? '𝄪' : alter === 1 ? '♯' : alter === -1 ? '♭' : alter === -2 ? '𝄫' : '';
    return {
      isRest: event.kind === 'rest',
      pitch: event.kind === 'note' ? `${event.pitch.step}${accidental}${event.pitch.octave}` : t('status.rest'),
      value: event.isDotted ? `${valueName}, ${t('status.dotted')}` : valueName,
      position: t('status.position', position),
      voice: String(inputVoiceOf(event.voiceId)),
      stem: event.stem === 'up' || event.stem === 'down' ? event.stem : 'auto',
      hidden: Boolean(event.hidden),
      styleCommand: (change: { stem?: 'up' | 'down'; hidden?: boolean }): ScoreCommand => ({
        type: 'setNoteStyle',
        coreEntityId: selectedNote.coreEntityId ?? undefined,
        coreMeasureId: selectedNote.coreMeasureId ?? undefined,
        corePartId: selectedNote.corePartId ?? undefined,
        measureNumber: selectedNote.measureNumber,
        staffIndex: selectedNote.staffIndex,
        voiceId: selectedNote.voiceId,
        timestampNum: selectedNote.timestampNum,
        timestampDen: selectedNote.timestampDen,
        notehead: event.notehead,
        stem: 'stem' in change ? change.stem : (event.stem === 'none' || event.stem === 'up' || event.stem === 'down' ? event.stem : undefined),
        ...('hidden' in change ? { hidden: change.hidden } : {}),
      } as ScoreCommand),
    };
  }, [coreDocument, selectedNote, selectedNotes.length, t]);
  const [lyricText, setLyricText] = useState('');
  const [lyricVerse, setLyricVerse] = useState('1');
  const [staffSpacing, setStaffSpacing] = useState('');
  const [partLayoutDrafts, setPartLayoutDrafts] = useState<Record<string, { staffSpacing: string }>>({});
  const [rehearsalText, setRehearsalText] = useState('');
  const [staffText, setStaffText] = useState('');
  const [textKind, setTextKind] = useState<'words' | 'expression'>('words');
  const [textPlacement, setTextPlacement] = useState<'above' | 'below'>('above');
  const [dynamicMarking, setDynamicMarking] = useState<DynamicKind>('mf');
  const [dynamicPlacement, setDynamicPlacement] = useState<'above' | 'below'>('below');
  const [articulationPlacementKind, setArticulationPlacementKind] = useState<ArticulationKind | ''>('');
  const [articulationPlacement, setArticulationPlacement] = useState<'above' | 'below'>('above');
  const [tiePlacement, setTiePlacement] = useState<'above' | 'below'>('above');
  const [slurPlacement, setSlurPlacement] = useState<'above' | 'below'>('above');
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [composer, setComposer] = useState('');
  const [arranger, setArranger] = useState('');
  const [openSections, setOpenSections] = useState<Record<InspectorSectionId, boolean>>(DEFAULT_OPEN_SECTIONS);
  const [partDrafts, setPartDrafts] = useState<Record<string, { name: string; abbreviation: string; instrumentName: string; chromatic: string; diatonic: string }>>({});
  const staffTextRef = useRef<HTMLInputElement>(null);
  const rehearsalTextRef = useRef<HTMLInputElement>(null);
  const lyricTextRef = useRef<HTMLInputElement>(null);
  const dynamicMarkingRef = useRef<HTMLSelectElement>(null);
  const selectionSummaryRef = useRef<HTMLDivElement>(null);
  const scoreSetupTitleRef = useRef<HTMLInputElement>(null);
  const keyPresetRef = useRef<HTMLButtonElement>(null);
  const repeatActionRef = useRef<HTMLButtonElement>(null);
  const timePresetRef = useRef<HTMLButtonElement>(null);
  const measureActionRef = useRef<HTMLButtonElement>(null);
  const partNameRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const targetMeasure = selectedNote?.measureNumber ?? Math.max(currentMeasure, 1);
  const noteRequiredReason = t('command.disabled.noteRequired');
  const dynamicMarkingLabel = selectedNote ? 'Dynamic marking' : `Dynamic marking - ${noteRequiredReason}`;
  const addDynamicLabel = selectedNote ? 'Add dynamic' : `Add dynamic - ${noteRequiredReason}`;
  const lyricTextLabel = selectedNote ? 'Lyric for selected note' : `Lyric for selected note - ${noteRequiredReason}`;
  const lyricVerseLabel = selectedNote ? 'Lyric verse' : `Lyric verse - ${noteRequiredReason}`;
  const attachLyricLabel = selectedNote ? 'Attach lyric line' : `Attach lyric line - ${noteRequiredReason}`;
  const pitchedSelection = useMemo(() => sortSelection(selectedNotes).filter((note) => !note.isRest), [selectedNotes]);
  const selectedTie = useMemo(() => resolveSelectedTie(coreDocument, selectedNote), [coreDocument, selectedNote]);
  const selectedSlur = useMemo(() => resolveSelectedSlur(coreDocument, selectedNotes), [coreDocument, selectedNotes]);
  const selectedArticulations = useMemo(() => resolveSelectedArticulations(coreDocument, selectedNote), [coreDocument, selectedNote]);
  const selectedArticulationKey = selectedArticulations.map((entry) => `${entry.kind}:${entry.placement}`).join('|');
  const range = useMemo(() => buildSelectionRange(selectedNotes), [selectedNotes]);
  const accidentalDisplayTargets = useMemo(
    () => sortSelection(selectedNotes.length > 0 ? selectedNotes : selectedNote ? [selectedNote] : [])
      .filter((note) => !note.isRest && Boolean(note.writtenAccidental)),
    [selectedNote, selectedNotes],
  );
  const accidentalDisplayAnchor = accidentalDisplayTargets[0] ?? null;
  const summary = useMemo(() => {
    if (coreDocument) {
      return {
        title: coreDocument.metadata.title,
        subtitle: coreDocument.metadata.subtitle,
        composer: coreDocument.metadata.composer,
        arranger: coreDocument.metadata.arranger,
        parts: coreDocument.score.parts.map((part) => ({
          id: part.sourcePartId,
          name: part.name,
          abbreviation: part.abbreviation,
          instrumentName: part.instrumentName,
          chromaticTranspose: part.chromaticTranspose,
          diatonicTranspose: part.diatonicTranspose,
        })),
      };
    }
    return summarizeScoreDocument(xml);
  }, [coreDocument, xml]);

  useEffect(() => {
    setTitle(summary.title ?? '');
    setSubtitle(summary.subtitle ?? '');
    setComposer(summary.composer ?? '');
    setArranger(summary.arranger ?? '');
    setPartDrafts(Object.fromEntries(summary.parts.map((part) => [part.id, {
      name: part.name ?? '',
      abbreviation: part.abbreviation ?? '',
      instrumentName: part.instrumentName ?? '',
      chromatic: String(part.chromaticTranspose ?? 0),
      diatonic: String(part.diatonicTranspose ?? 0),
    }])));
    setPartLayoutDrafts(Object.fromEntries(summary.parts.map((part) => [part.id, {
      staffSpacing: '',
    }])));
  }, [summary]);

  useEffect(() => {
    const lyric = resolveSelectedLyric(coreDocument, selectedNote);
    const dynamic = resolveSelectedDynamic(coreDocument, selectedNote);
    setLyricText(lyric.text);
    setLyricVerse(lyric.verse);
    setDynamicMarking(dynamic.value);
    setDynamicPlacement(dynamic.placement);
  }, [
    coreDocument,
    selectedNote?.coreEntityId,
    selectedNote?.coreMeasureId,
    selectedNote?.corePartId,
    selectedNote?.measureNumber,
    selectedNote?.staffIndex,
    selectedNote?.voiceId,
    selectedNote?.timestampNum,
    selectedNote?.timestampDen,
  ]);

  useEffect(() => {
    setSlurPlacement(selectedSlur?.placement ?? 'above');
  }, [selectedSlur?.placement]);

  useEffect(() => {
    setTiePlacement(selectedTie?.placement ?? 'above');
  }, [selectedTie?.placement]);

  useEffect(() => {
    const current = selectedArticulations.find((entry) => entry.kind === articulationPlacementKind)
      ?? selectedArticulations[0];
    setArticulationPlacementKind(current?.kind ?? '');
    setArticulationPlacement(current?.placement ?? 'above');
  }, [selectedArticulationKey]);

  const submitRehearsalMark = () => {
    if (!rehearsalText.trim()) return;
    onApplyCommands([{ type: 'addRehearsalMark', measureNumber: targetMeasure, text: rehearsalText.trim() }], 'Rehearsal mark');
    setRehearsalText('');
  };

  const submitStaffText = () => {
    if (!staffText.trim()) return;
    onApplyCommands([{
      type: textKind === 'expression' ? 'addExpressionText' : 'addWords',
      measureNumber: targetMeasure,
      text: staffText.trim(),
      placement: textPlacement,
      // Staff text belongs to the selected staff; without a selection it stays score-wide.
      ...(selectedNote ? { corePartId: selectedNote.corePartId ?? null, staffIndex: selectedNote.staffIndex } : {}),
    }], textKind === 'expression' ? 'Expression text' : 'Staff text');
    setStaffText('');
  };

  const submitDynamic = () => {
    if (!selectedNote) return;
    onApplyCommands([{
      type: 'addDynamic',
      dynamic: dynamicMarking,
      placement: dynamicPlacement,
      corePartId: selectedNote.corePartId ?? null,
      measureNumber: selectedNote.measureNumber,
      staffIndex: selectedNote.staffIndex,
      voiceId: selectedNote.voiceId,
      timestampNum: selectedNote.timestampNum,
      timestampDen: selectedNote.timestampDen,
    }], `Add ${dynamicMarking} dynamic`);
  };

  const submitLyricLine = () => {
    if (!selectedNote || !lyricText.trim()) return;
    onApplyCommands([{
      type: 'setLyricLine',
      ...partScope(selectedNote),
      verseNumber: Math.max(1, Number(lyricVerse) || 1),
      text: lyricText.trim(),
      syllabic: 'single',
      measureNumber: selectedNote.measureNumber,
      staffIndex: selectedNote.staffIndex,
      voiceId: selectedNote.voiceId,
      timestampNum: selectedNote.timestampNum,
      timestampDen: selectedNote.timestampDen,
    }], 'Add lyric');
  };

  const staffTextActionLabel = textKind === 'expression'
    ? `Add expression ${textPlacement === 'below' ? 'below' : 'above'} staff`
    : `Add text ${textPlacement === 'below' ? 'below' : 'above'} staff`;

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return undefined;

    const focusTarget = (event: Event) => {
      const target = event instanceof CustomEvent ? event.detail?.target : null;
      const sectionId: InspectorSectionId | null =
        target === 'staff-text' || target === 'rehearsal-mark' || target === 'dynamic'
          ? 'text-rehearsal'
          : target === 'lyric'
            ? 'lyrics'
            : target === 'selection'
              || target === 'score-setup'
              || target === 'key'
              || target === 'repeats-endings'
              || target === 'time-clef'
              || target === 'measure'
              || target === 'text-rehearsal'
              || target === 'lyrics'
              || target === 'parts'
                ? target
                : null;
      if (sectionId) {
        setOpenSections((state) => ({ ...state, [sectionId]: true }));
      }
      const applyFocus = () => {
        const input =
          target === 'staff-text'
            ? staffTextRef.current
            : target === 'rehearsal-mark'
              ? rehearsalTextRef.current
              : target === 'lyric'
                ? lyricTextRef.current
                : target === 'dynamic'
                  ? dynamicMarkingRef.current
                  : target === 'selection'
                    ? selectionSummaryRef.current
                    : target === 'score-setup'
                      ? scoreSetupTitleRef.current
                      : target === 'key'
                        ? keyPresetRef.current
                        : target === 'repeats-endings'
                          ? repeatActionRef.current
                          : target === 'time-clef'
                            ? timePresetRef.current
                            : target === 'measure'
                              ? measureActionRef.current
                              : target === 'parts'
                                ? summary.parts[0] ? partNameRefs.current[summary.parts[0].id] ?? null : null
                                : target === 'text-rehearsal'
                                  ? rehearsalTextRef.current
                                  : target === 'lyrics'
                                    ? lyricTextRef.current
                  : null;
        if (!input) return;
        if ('disabled' in input && input.disabled) return;
        input.focus();
        if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) {
          input.select();
        }
      };
      if (sectionId) {
        window.setTimeout(applyFocus, 0);
        return;
      }
      applyFocus();
    };

    window.addEventListener('nex-note:focus-inspector-field', focusTarget);
    return () => window.removeEventListener('nex-note:focus-inspector-field', focusTarget);
  }, [summary.parts]);

  return (
    <div className="h-full overflow-auto rounded-[2rem] border border-gray-200 bg-white p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-gray-400">Inspector</p>
      <h3 className="mt-2 text-xl font-semibold text-gray-900">Score Commands</h3>
      <p className="mt-2 text-sm leading-6 text-gray-600">{t('inspector.intro')}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {INSPECTOR_SECTION_LABELS.map((section) => (
          <button
            key={section.id}
            type="button"
            onClick={() => setOpenSections((state) => ({ ...state, [section.id]: !state[section.id] }))}
            aria-pressed={openSections[section.id]}
            className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors ${
              openSections[section.id]
                ? 'border-sky-200 bg-sky-50 text-sky-800'
                : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:text-gray-700'
            }`}
          >
            {section.label}
          </button>
        ))}
      </div>

      <InspectorSection
        id="selection"
        title="Selection"
        open={openSections.selection}
        onToggle={() => setOpenSections((state) => ({ ...state, selection: !state.selection }))}
      >
        {noteProperties && (
          <dl
            data-testid="inspector-note-properties"
            aria-label={t('inspector.noteProperties')}
            className="mb-3 grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 rounded-2xl border border-gray-200 bg-white p-3 text-sm"
          >
            <dt className="text-xs font-semibold text-gray-500">{t('inspector.pitch')}</dt>
            <dd data-property="pitch" className="font-semibold text-gray-900">{noteProperties.pitch}</dd>
            <dt className="text-xs font-semibold text-gray-500">{t('inspector.value')}</dt>
            <dd data-property="value" className="text-gray-900">{noteProperties.value}</dd>
            <dt className="text-xs font-semibold text-gray-500">{t('inspector.position')}</dt>
            <dd data-property="position" className="text-gray-900">{noteProperties.position}</dd>
            <dt className="text-xs font-semibold text-gray-500">{t('note.voice')}</dt>
            <dd data-property="voice" className="text-gray-900">{noteProperties.voice}</dd>
            {!noteProperties.isRest && (
              <>
                <dt className="text-xs font-semibold text-gray-500">{t('inspector.stem')}</dt>
                <dd data-property="stem" className="flex gap-1">
                  {([['auto', 'inspector.stemAuto', 'Auto'], ['up', 'inspector.stemUp', '↑'], ['down', 'inspector.stemDown', '↓']] as const).map(([stem, key, glyph]) => (
                    <button
                      key={stem}
                      type="button"
                      title={t(key)}
                      aria-label={t(key)}
                      aria-pressed={noteProperties.stem === stem}
                      // Keep the keyboard focus on the score: the next key is Undo or a note.
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => onApplyCommands([noteProperties.styleCommand({ stem: stem === 'auto' ? undefined : stem })], t(key))}
                      className={`rounded-lg px-2 py-1 text-xs font-semibold ${noteProperties.stem === stem ? 'bg-sky-100 text-sky-900' : 'bg-stone-100 text-stone-700 hover:bg-stone-200'}`}
                    >
                      {glyph}
                    </button>
                  ))}
                </dd>
              </>
            )}
            <dt className="text-xs font-semibold text-gray-500">{t('inspector.visible')}</dt>
            <dd data-property="visible">
              <input
                type="checkbox"
                aria-label={t('inspector.visible')}
                checked={!noteProperties.hidden}
                onMouseDown={(event) => event.preventDefault()}
                onChange={(event) => onApplyCommands([noteProperties.styleCommand({ hidden: !event.target.checked })], t('inspector.visible'))}
              />
            </dd>
          </dl>
        )}
        <div ref={selectionSummaryRef} tabIndex={-1} className="rounded-2xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600 outline-none">
          {selection?.selectionCount
            ? `Selected ${selection.selectionCount} item(s)${range ? ` across m.${range.start.measureNumber}-${range.end.measureNumber}` : selectedNote ? ` at m.${selectedNote.measureNumber}` : ''}.`
            : 'No semantic selection active.'}
          {range && (
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                onClick={() => onApplyCommands([{ type: 'transposeRangeChromatic', semitones: -2, range }], 'Transpose selected range -2')}
                className="rounded-xl bg-sky-50 px-3 py-2 text-xs font-medium text-sky-900 hover:bg-sky-100"
              >
                Transpose -2
              </button>
              <button
                onClick={() => onApplyCommands([{ type: 'transposeRangeChromatic', semitones: 2, range }], 'Transpose selected range +2')}
                className="rounded-xl bg-sky-50 px-3 py-2 text-xs font-medium text-sky-900 hover:bg-sky-100"
              >
                Transpose +2
              </button>
              <button
                onClick={() => onApplyCommands([{ type: 'transposeRangeChromatic', semitones: 12, range }], 'Transpose selected range +12')}
                className="rounded-xl bg-sky-50 px-3 py-2 text-xs font-medium text-sky-900 hover:bg-sky-100"
              >
                +8va
              </button>
              <button
                onClick={() => onApplyCommands([{ type: 'transposeRangeChromatic', semitones: -12, range }], 'Transpose selected range -12')}
                className="rounded-xl bg-sky-50 px-3 py-2 text-xs font-medium text-sky-900 hover:bg-sky-100"
              >
                -8va
              </button>
              <button
                onClick={() => onApplyCommands([{ type: 'clearRangeArticulations', range }], 'Clear selected articulations')}
                className="rounded-xl bg-stone-100 px-3 py-2 text-xs font-medium text-stone-700 hover:bg-stone-200"
              >
                Clear articulations
              </button>
              <button
                onClick={() => onApplyCommands(buildPerNoteCommands(selectedNotes, (note) => ({
                  type: 'toggleArticulation',
                  ...partScope(note),
                  articulation: 'staccato',
                  measureNumber: note.measureNumber,
                  staffIndex: note.staffIndex,
                  voiceId: note.voiceId,
                  timestampNum: note.timestampNum,
                  timestampDen: note.timestampDen,
                })), 'Toggle staccato on selection')}
                className="rounded-xl bg-stone-100 px-3 py-2 text-xs font-medium text-stone-700 hover:bg-stone-200"
              >
                Toggle staccato
              </button>
              <button
                onClick={() => onApplyCommands(buildPerNoteCommands(selectedNotes, (note) => ({
                  type: 'toggleArticulation',
                  ...partScope(note),
                  articulation: 'accent',
                  measureNumber: note.measureNumber,
                  staffIndex: note.staffIndex,
                  voiceId: note.voiceId,
                  timestampNum: note.timestampNum,
                  timestampDen: note.timestampDen,
                })), 'Toggle accents on selection')}
                className="rounded-xl bg-stone-100 px-3 py-2 text-xs font-medium text-stone-700 hover:bg-stone-200"
              >
                Toggle accent
              </button>
              <button
                onClick={() => onApplyCommands(buildPerNoteCommands(pitchedSelection, (note) => ({
                  type: 'addDynamic',
                  dynamic: 'mf',
                  corePartId: note.corePartId ?? null,
                  measureNumber: note.measureNumber,
                  staffIndex: note.staffIndex,
                  voiceId: note.voiceId,
                  timestampNum: note.timestampNum,
                  timestampDen: note.timestampDen,
                })), 'Add mf to selection')}
                disabled={pitchedSelection.length === 0}
                className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-900 hover:bg-emerald-100 disabled:opacity-40"
              >
                Add mf
              </button>
              <button
                onClick={() => {
                  if (pitchedSelection.length < 2) return;
                  const first = pitchedSelection[0];
                  const last = pitchedSelection[pitchedSelection.length - 1];
                  onApplyCommands([{
                    type: 'toggleSlur',
                    ...partScope(first),
                    measureNumber: first.measureNumber,
                    staffIndex: first.staffIndex,
                    voiceId: first.voiceId,
                    timestampNum: first.timestampNum,
                    timestampDen: first.timestampDen,
                    stopLocator: {
                      ...partScope(last),
                      measureNumber: last.measureNumber,
                      staffIndex: last.staffIndex,
                      voiceId: last.voiceId,
                      timestampNum: last.timestampNum,
                      timestampDen: last.timestampDen,
                    },
                  }], 'Toggle slur across selection');
                }}
                disabled={pitchedSelection.length < 2}
                className="rounded-xl bg-violet-50 px-3 py-2 text-xs font-medium text-violet-900 hover:bg-violet-100 disabled:opacity-40"
              >
                Toggle slur
              </button>
              {selectedSlur ? (
                <>
                  <label className="sr-only" htmlFor="inspector-slur-placement">Slur placement</label>
                  <select
                    id="inspector-slur-placement"
                    value={slurPlacement}
                    onChange={(event) => setSlurPlacement(event.target.value === 'below' ? 'below' : 'above')}
                    className="rounded-xl border border-violet-200 bg-white px-3 py-2 text-xs text-violet-900"
                  >
                    <option value="above">Slur above</option>
                    <option value="below">Slur below</option>
                  </select>
                  <button
                    onClick={() => onApplyCommands([{
                      type: 'setSlurPlacement',
                      ...partScope(selectedSlur.start),
                      placement: slurPlacement,
                      measureNumber: selectedSlur.start.measureNumber,
                      staffIndex: selectedSlur.start.staffIndex,
                      voiceId: selectedSlur.start.voiceId,
                      timestampNum: selectedSlur.start.timestampNum,
                      timestampDen: selectedSlur.start.timestampDen,
                      stopLocator: {
                        measureNumber: selectedSlur.stop.measureNumber,
                        staffIndex: selectedSlur.stop.staffIndex,
                        voiceId: selectedSlur.stop.voiceId,
                        timestampNum: selectedSlur.stop.timestampNum,
                        timestampDen: selectedSlur.stop.timestampDen,
                      },
                    }], `Set slur ${slurPlacement}`)}
                    className="rounded-xl bg-violet-100 px-3 py-2 text-xs font-medium text-violet-900 hover:bg-violet-200"
                  >
                    Apply slur placement
                  </button>
                </>
              ) : null}
            </div>
          )}
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3" data-testid="inspector-accidental-display">
            <p className="text-xs font-semibold text-amber-950">Courtesy accidental</p>
            <p className="mt-1 text-[11px] leading-5 text-amber-800">
              Pitch-neutral cautionary intent and optional enclosure for explicitly written accidentals.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-xs text-amber-950">
                <input
                  type="checkbox"
                  aria-label="Mark selected accidentals as cautionary"
                  checked={Boolean(accidentalDisplayAnchor?.accidentalCautionary)}
                  disabled={accidentalDisplayTargets.length === 0}
                  onChange={(event) => onApplyCommands(
                    buildAccidentalDisplayCommands(
                      accidentalDisplayTargets,
                      event.target.checked,
                      accidentalDisplayAnchor?.accidentalEnclosure ?? 'none',
                    ),
                    event.target.checked ? 'Mark cautionary accidental' : 'Clear cautionary accidental',
                  )}
                />
                Cautionary
              </label>
              <label className="sr-only" htmlFor="inspector-accidental-enclosure">Accidental enclosure</label>
              <select
                id="inspector-accidental-enclosure"
                aria-label="Accidental enclosure"
                value={accidentalDisplayAnchor?.accidentalEnclosure ?? 'none'}
                disabled={accidentalDisplayTargets.length === 0}
                onChange={(event) => {
                  const enclosure = event.target.value as AccidentalEnclosure;
                  onApplyCommands(
                    buildAccidentalDisplayCommands(
                      accidentalDisplayTargets,
                      Boolean(accidentalDisplayAnchor?.accidentalCautionary),
                      enclosure,
                    ),
                    `Set accidental enclosure ${enclosure}`,
                  );
                }}
                className="rounded-lg border border-amber-200 bg-white px-2 py-1.5 text-xs text-amber-950 disabled:opacity-50"
              >
                <option value="none">No enclosure</option>
                <option value="round">Round parentheses</option>
                <option value="square">Square brackets</option>
              </select>
              {accidentalDisplayTargets.length === 0 ? (
                <span className="text-[10px] text-amber-700">Select an explicitly written accidental.</span>
              ) : (
                <span className="text-[10px] text-amber-700">Applies atomically to {accidentalDisplayTargets.length} selected note(s).</span>
              )}
            </div>
          </div>
          {selectedNote && selectedArticulations.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-2">
              <label className="sr-only" htmlFor="inspector-articulation-kind">Articulation</label>
              <select
                id="inspector-articulation-kind"
                value={articulationPlacementKind}
                onChange={(event) => {
                  const nextKind = event.target.value as ArticulationKind;
                  const nextArticulation = selectedArticulations.find((entry) => entry.kind === nextKind);
                  setArticulationPlacementKind(nextKind);
                  setArticulationPlacement(nextArticulation?.placement ?? 'above');
                }}
                className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs text-stone-900"
              >
                {selectedArticulations.map((entry) => (
                  <option key={entry.kind} value={entry.kind}>{entry.label}</option>
                ))}
              </select>
              <label className="sr-only" htmlFor="inspector-articulation-placement">Articulation placement</label>
              <select
                id="inspector-articulation-placement"
                value={articulationPlacement}
                onChange={(event) => setArticulationPlacement(event.target.value === 'below' ? 'below' : 'above')}
                className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs text-stone-900"
              >
                <option value="above">Articulation above</option>
                <option value="below">Articulation below</option>
              </select>
              <button
                onClick={() => {
                  if (!articulationPlacementKind) return;
                  onApplyCommands([{
                    type: 'setArticulationPlacement',
                    ...partScope(selectedNote),
                    articulation: articulationPlacementKind,
                    placement: articulationPlacement,
                    measureNumber: selectedNote.measureNumber,
                    staffIndex: selectedNote.staffIndex,
                    voiceId: selectedNote.voiceId,
                    timestampNum: selectedNote.timestampNum,
                    timestampDen: selectedNote.timestampDen,
                  }], `Set ${ARTICULATION_LABELS[articulationPlacementKind] ?? articulationPlacementKind} ${articulationPlacement}`);
                }}
                className="rounded-xl bg-stone-100 px-3 py-2 text-xs font-medium text-stone-800 hover:bg-stone-200"
              >
                Apply articulation placement
              </button>
            </div>
          ) : null}
          {selectedTie ? (
            <div className="mt-2 flex flex-wrap gap-2">
              <label className="sr-only" htmlFor="inspector-tie-placement">Tie placement</label>
              <select
                id="inspector-tie-placement"
                value={tiePlacement}
                onChange={(event) => setTiePlacement(event.target.value === 'below' ? 'below' : 'above')}
                className="rounded-xl border border-violet-200 bg-white px-3 py-2 text-xs text-violet-900"
              >
                <option value="above">Tie above</option>
                <option value="below">Tie below</option>
              </select>
              <button
                onClick={() => onApplyCommands([{
                  type: 'setTiePlacement',
                  ...partScope(selectedTie.note),
                  placement: tiePlacement,
                  measureNumber: selectedTie.note.measureNumber,
                  staffIndex: selectedTie.note.staffIndex,
                  voiceId: selectedTie.note.voiceId,
                  timestampNum: selectedTie.note.timestampNum,
                  timestampDen: selectedTie.note.timestampDen,
                }], `Set tie ${tiePlacement}`)}
                className="rounded-xl bg-violet-100 px-3 py-2 text-xs font-medium text-violet-900 hover:bg-violet-200"
              >
                Apply tie placement
              </button>
            </div>
          ) : null}
        </div>
      </InspectorSection>

      <InspectorSection
        id="score-setup"
        title="Score Setup"
        open={openSections['score-setup']}
        onToggle={() => setOpenSections((state) => ({ ...state, 'score-setup': !state['score-setup'] }))}
      >
        <div className="space-y-2">
          <input ref={scoreSetupTitleRef} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Title" aria-label="Title" className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400" />
          <input value={subtitle} onChange={(event) => setSubtitle(event.target.value)} placeholder="Subtitle / Work number" aria-label="Subtitle / Work number" className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400" />
          <div className="grid grid-cols-2 gap-2">
            <input value={composer} onChange={(event) => setComposer(event.target.value)} placeholder="Composer" aria-label="Composer" className="rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400" />
            <input value={arranger} onChange={(event) => setArranger(event.target.value)} placeholder="Arranger" aria-label="Arranger" className="rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400" />
          </div>
          <button
            onClick={() => {
              const commands: ScoreCommand[] = [];
              const nextTitle = title.trim();
              const nextSubtitle = subtitle.trim();
              const nextComposer = composer.trim();
              const nextArranger = arranger.trim();
              if ((summary.title ?? '') !== nextTitle) commands.push({ type: 'setTitle', title: nextTitle });
              if ((summary.subtitle ?? '') !== nextSubtitle) commands.push({ type: 'setSubtitle', subtitle: nextSubtitle });
              if ((summary.composer ?? '') !== nextComposer) commands.push({ type: 'setComposer', composer: nextComposer });
              if ((summary.arranger ?? '') !== nextArranger) commands.push({ type: 'setArranger', arranger: nextArranger });
              if (commands.length) onApplyCommands(commands, 'Score setup');
            }}
            className="rounded-xl bg-gray-900 px-3 py-2 text-xs font-medium text-white hover:bg-gray-700"
          >
            Apply score metadata
          </button>
        </div>
      </InspectorSection>

      <InspectorSection
        id="key"
        title="Key"
        open={openSections.key}
        onToggle={() => setOpenSections((state) => ({ ...state, key: !state.key }))}
      >
        <div className="flex flex-wrap gap-2">
          {KEY_PRESETS.map((preset) => (
            <button
              key={preset.label}
              ref={preset.label === KEY_PRESETS[0]?.label ? keyPresetRef : undefined}
              onClick={() => onApplyCommands([{ type: 'setKey', fifths: preset.fifths }], `Key ${preset.label}`)}
              className="rounded-xl bg-stone-100 px-3 py-2 text-xs font-medium text-stone-700 hover:bg-stone-200"
            >
              {preset.label} major
            </button>
          ))}
        </div>
      </InspectorSection>

      <InspectorSection
        id="repeats-endings"
        title="Repeats & Endings"
        open={openSections['repeats-endings']}
        onToggle={() => setOpenSections((state) => ({ ...state, 'repeats-endings': !state['repeats-endings'] }))}
      >
        <div className="grid grid-cols-2 gap-2">
          <button
            ref={repeatActionRef}
            onClick={() => onApplyCommands([{ type: 'addStartRepeat' }], 'Start repeat')}
            className="rounded-xl bg-violet-50 px-3 py-2 text-xs font-medium text-violet-900 hover:bg-violet-100"
          >
            Start repeat
          </button>
          <button
            onClick={() => onApplyCommands([{ type: 'addEndRepeat', measureNumber: targetMeasure }], 'End repeat')}
            className="rounded-xl bg-violet-50 px-3 py-2 text-xs font-medium text-violet-900 hover:bg-violet-100"
          >
            End repeat on m.{targetMeasure}
          </button>
          <button
            onClick={() => onApplyCommands([{ type: 'setEnding', measureNumber: targetMeasure, number: '1', endingType: 'start' }], 'Ending 1')}
            className="rounded-xl bg-violet-50 px-3 py-2 text-xs font-medium text-violet-900 hover:bg-violet-100"
          >
            1st ending
          </button>
          <button
            onClick={() => onApplyCommands([{ type: 'setEnding', measureNumber: targetMeasure, number: '2', endingType: 'start' }], 'Ending 2')}
            className="rounded-xl bg-violet-50 px-3 py-2 text-xs font-medium text-violet-900 hover:bg-violet-100"
          >
            2nd ending
          </button>
        </div>
      </InspectorSection>

      <InspectorSection
        id="time-clef"
        title="Time & Clef"
        open={openSections['time-clef']}
        onToggle={() => setOpenSections((state) => ({ ...state, 'time-clef': !state['time-clef'] }))}
      >
        <div className="flex flex-wrap gap-2">
          {TIME_PRESETS.map((preset) => (
            <button
              key={preset.label}
              ref={preset.label === TIME_PRESETS[0]?.label ? timePresetRef : undefined}
              onClick={() => onApplyCommands([{ type: 'setTimeSignature', ...preset, measureNumber: targetMeasure }], `Time ${preset.label}`)}
              className="rounded-xl bg-sky-50 px-3 py-2 text-xs font-medium text-sky-900 hover:bg-sky-100"
            >
              {preset.label}
            </button>
          ))}
          {CLEF_PRESETS.map((preset) => (
            <button
              key={preset.label}
              onClick={() => onApplyCommands([{ type: 'setClef', ...preset, measureNumber: targetMeasure, staffIndex: 1 }], `Clef ${preset.label}`)}
              className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-900 hover:bg-emerald-100"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </InspectorSection>

      <InspectorSection
        id="measure"
        title="Measure"
        open={openSections.measure}
        onToggle={() => setOpenSections((state) => ({ ...state, measure: !state.measure }))}
      >
        <div className="grid grid-cols-2 gap-2">
          <button
            ref={measureActionRef}
            onClick={() => onApplyCommands([{ type: 'insertMeasureAfter', measureNumber: targetMeasure }], 'Insert measure')}
            className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-950 hover:bg-amber-100"
          >
            Insert after m.{targetMeasure}
          </button>
          <button
            onClick={() => onApplyCommands([{ type: 'deleteMeasure', measureNumber: targetMeasure }], 'Delete measure')}
            className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 hover:bg-rose-100"
          >
            Delete m.{targetMeasure}
          </button>
          <button
            onClick={() => onApplyCommands([{ type: 'setSystemBreak', measureNumber: targetMeasure }], 'System break')}
            className="rounded-xl bg-gray-100 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-200"
          >
            System break
          </button>
          <button
            onClick={() => onApplyCommands([{ type: 'setPageBreak', measureNumber: targetMeasure }], 'Page break')}
            className="rounded-xl bg-gray-100 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-200"
          >
            Page break
          </button>
        </div>
        <div className="mt-3 flex gap-2">
          <input
            value={staffSpacing}
            onChange={(event) => setStaffSpacing(event.target.value)}
            placeholder="Staff spacing"
            className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
          />
          <button
            onClick={() => {
              const spacing = Number(staffSpacing);
              if (!Number.isFinite(spacing) || spacing <= 0) return;
              onApplyCommands([{ type: 'setMeasureLayoutHint', measureNumber: targetMeasure, hint: 'staffSpacing', value: spacing, staffIndex: selectedNote?.staffIndex ?? 1 }], 'Staff spacing');
              setStaffSpacing('');
            }}
            className="rounded-xl bg-gray-900 px-3 py-2 text-xs font-medium text-white hover:bg-gray-700"
          >
            Apply spacing
          </button>
        </div>
        <div className="mt-3">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Collision spacing</div>
          <div className="grid grid-cols-3 gap-2">
            {(['balanced', 'relaxed', 'open'] as const).map((policy) => (
              <button
                key={policy}
                type="button"
                title={`${policy[0]!.toUpperCase()}${policy.slice(1)} collision spacing from measure ${targetMeasure}`}
                onClick={() => onApplyCommands([{
                  type: 'setMeasureLayoutHint',
                  measureNumber: targetMeasure,
                  hint: 'collisionPolicy',
                  value: policy,
                  staffIndex: selectedNote?.staffIndex ?? 1,
                }], `${policy[0]!.toUpperCase()}${policy.slice(1)} collision spacing`)}
                className="rounded-xl bg-sky-50 px-2 py-2 text-xs font-medium capitalize text-sky-900 hover:bg-sky-100"
              >
                {policy}
              </button>
            ))}
          </div>
        </div>
      </InspectorSection>

      <InspectorSection
        id="text-rehearsal"
        title="Text & Rehearsal"
        open={openSections['text-rehearsal']}
        onToggle={() => setOpenSections((state) => ({ ...state, 'text-rehearsal': !state['text-rehearsal'] }))}
      >
        <div className="space-y-2">
          <input
            ref={rehearsalTextRef}
            value={rehearsalText}
            onChange={(event) => setRehearsalText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              event.preventDefault();
              submitRehearsalMark();
            }}
            placeholder="Rehearsal mark, e.g. A"
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
          />
          <button
            onClick={submitRehearsalMark}
            className="rounded-xl bg-gray-900 px-3 py-2 text-xs font-medium text-white hover:bg-gray-700"
          >
            Add rehearsal mark
          </button>
          <input
            ref={staffTextRef}
            value={staffText}
            onChange={(event) => setStaffText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              event.preventDefault();
              submitStaffText();
            }}
            placeholder="Staff text / expression"
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
          />
          <div className="grid grid-cols-2 gap-2">
            <label className="sr-only" htmlFor="inspector-text-kind">Text kind</label>
            <select
              id="inspector-text-kind"
              value={textKind}
              onChange={(event) => setTextKind(event.target.value === 'expression' ? 'expression' : 'words')}
              className="rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
            >
              <option value="words">Staff text</option>
              <option value="expression">Expression text</option>
            </select>
            <label className="sr-only" htmlFor="inspector-text-placement">Text placement</label>
            <select
              id="inspector-text-placement"
              value={textPlacement}
              onChange={(event) => setTextPlacement(event.target.value === 'below' ? 'below' : 'above')}
              className="rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
            >
              <option value="above">Above staff</option>
              <option value="below">Below staff</option>
            </select>
          </div>
          <button
            onClick={submitStaffText}
            className="rounded-xl bg-stone-100 px-3 py-2 text-xs font-medium text-stone-700 hover:bg-stone-200"
          >
            {staffTextActionLabel}
          </button>
          <div className="grid grid-cols-[1fr_150px_auto] gap-2">
            <label className="sr-only" htmlFor="inspector-dynamic-marking">Dynamic marking</label>
            <select
              id="inspector-dynamic-marking"
              ref={dynamicMarkingRef}
              value={dynamicMarking}
              onChange={(event) => setDynamicMarking(event.target.value as DynamicKind)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return;
                event.preventDefault();
                submitDynamic();
              }}
              disabled={!selectedNote}
              aria-label={dynamicMarkingLabel}
              title={dynamicMarkingLabel}
              className="rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400 disabled:bg-gray-50 disabled:text-gray-400"
            >
              {DYNAMIC_CHOICES.map((choice) => (
                <option key={choice} value={choice}>{choice}</option>
              ))}
            </select>
            <label className="sr-only" htmlFor="inspector-dynamic-placement">Dynamic placement</label>
            <select
              id="inspector-dynamic-placement"
              value={dynamicPlacement}
              onChange={(event) => setDynamicPlacement(event.target.value === 'above' ? 'above' : 'below')}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return;
                event.preventDefault();
                submitDynamic();
              }}
              disabled={!selectedNote}
              aria-label={selectedNote ? 'Dynamic placement' : `Dynamic placement - ${noteRequiredReason}`}
              title={selectedNote ? 'Dynamic placement' : `Dynamic placement - ${noteRequiredReason}`}
              className="rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400 disabled:bg-gray-50 disabled:text-gray-400"
            >
              <option value="below">Below staff</option>
              <option value="above">Above staff</option>
            </select>
            <button
              onClick={submitDynamic}
              disabled={!selectedNote}
              aria-label={addDynamicLabel}
              title={addDynamicLabel}
              className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-900 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Add dynamic
            </button>
          </div>
        </div>
      </InspectorSection>

      <InspectorSection
        id="lyrics"
        title="Lyrics"
        open={openSections.lyrics}
        onToggle={() => setOpenSections((state) => ({ ...state, lyrics: !state.lyrics }))}
      >
        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_88px] gap-2">
            <input
              ref={lyricTextRef}
              value={lyricText}
              onChange={(event) => setLyricText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return;
                event.preventDefault();
                submitLyricLine();
              }}
              placeholder={selectedNote ? 'Lyric for selected note' : 'Select a note first'}
              disabled={!selectedNote}
              aria-label={lyricTextLabel}
              title={lyricTextLabel}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400 disabled:bg-gray-50 disabled:text-gray-400"
            />
            <input
              value={lyricVerse}
              onChange={(event) => setLyricVerse(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return;
                event.preventDefault();
                submitLyricLine();
              }}
              placeholder="Verse"
              disabled={!selectedNote}
              aria-label={lyricVerseLabel}
              title={lyricVerseLabel}
              className="rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400 disabled:bg-gray-50 disabled:text-gray-400"
            />
          </div>
          <button
            onClick={submitLyricLine}
            disabled={!selectedNote}
            aria-label={attachLyricLabel}
            title={attachLyricLabel}
            className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-blue-200"
          >
            Attach lyric line
          </button>
        </div>
      </InspectorSection>

      <InspectorSection
        id="parts"
        title="Parts & Instruments"
        open={openSections.parts}
        onToggle={() => setOpenSections((state) => ({ ...state, parts: !state.parts }))}
      >
        <div className="space-y-3">
          {summary.parts.map((part) => {
            const draft = partDrafts[part.id] ?? {
              name: part.name ?? '',
              abbreviation: part.abbreviation ?? '',
              instrumentName: part.instrumentName ?? '',
              chromatic: String(part.chromaticTranspose ?? 0),
              diatonic: String(part.diatonicTranspose ?? 0),
            };
            const layoutDraft = partLayoutDrafts[part.id] ?? { staffSpacing: '' };
            const sourcePart = coreDocument?.score.parts.find((entry) => entry.sourcePartId === part.id);
            const partMeasureNumbers = sourcePart ? uniquePartMeasureNumbers(sourcePart) : [targetMeasure];
            return (
              <div key={part.id} className="rounded-2xl border border-gray-200 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-semibold text-gray-900">{part.id}</p>
                  <span className="text-[11px] text-gray-400">{part.name}</span>
                </div>
                <div className="space-y-2">
                  <input
                    ref={(element) => { partNameRefs.current[part.id] = element; }}
                    value={draft.name}
                    onChange={(event) => setPartDrafts((state) => ({ ...state, [part.id]: { ...draft, name: event.target.value } }))}
                    placeholder="Part name"
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      value={draft.abbreviation}
                      onChange={(event) => setPartDrafts((state) => ({ ...state, [part.id]: { ...draft, abbreviation: event.target.value } }))}
                      placeholder="Abbrev."
                      className="rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
                    />
                    <input
                      value={draft.instrumentName}
                      onChange={(event) => setPartDrafts((state) => ({ ...state, [part.id]: { ...draft, instrumentName: event.target.value } }))}
                      placeholder="Instrument"
                      className="rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      value={draft.chromatic}
                      onChange={(event) => setPartDrafts((state) => ({ ...state, [part.id]: { ...draft, chromatic: event.target.value } }))}
                      placeholder="Chromatic transpose"
                      className="rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
                    />
                    <input
                      value={draft.diatonic}
                      onChange={(event) => setPartDrafts((state) => ({ ...state, [part.id]: { ...draft, diatonic: event.target.value } }))}
                      placeholder="Diatonic transpose"
                      className="rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
                    />
                  </div>
                  <button
                    onClick={() => {
                      const commands: ScoreCommand[] = [
                        { type: 'setPartName', partId: part.id, name: draft.name.trim() || part.name },
                        { type: 'setPartAbbreviation', partId: part.id, abbreviation: draft.abbreviation.trim() },
                        { type: 'setInstrumentName', partId: part.id, instrumentName: draft.instrumentName.trim() || draft.name.trim() || part.name },
                        {
                          type: 'setPartTranspose',
                          partId: part.id,
                          chromatic: Number(draft.chromatic) || 0,
                          diatonic: Number(draft.diatonic) || 0,
                        },
                      ];
                      onApplyCommands(commands, `Update ${part.id}`);
                    }}
                    className="rounded-xl bg-stone-100 px-3 py-2 text-xs font-medium text-stone-700 hover:bg-stone-200"
                  >
                    Apply part setup
                  </button>
                  <button
                    onClick={() => onOpenExtractedPart(part.id, draft.name.trim() || part.name)}
                    className="rounded-xl bg-sky-50 px-3 py-2 text-xs font-medium text-sky-900 hover:bg-sky-100"
                  >
                    Open extracted part
                  </button>
                  <div className="rounded-xl bg-stone-50 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">
                      Print & Layout at m.{targetMeasure}
                    </p>
                    <div className="mt-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-400">Preset page setup</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {PRINT_LAYOUT_PRESETS.map((preset) => (
                          <button
                            key={`${part.id}-${preset.label}`}
                            onClick={() => onApplyCommands(
                              partMeasureNumbers.map((measureNumber) => ({
                                type: 'setMeasureLayoutHint',
                                measureNumber,
                                partId: part.id,
                                hint: 'staffSpacing',
                                value: preset.spacing,
                              })),
                              `${preset.label} print ${part.id}`,
                            )}
                            className="rounded-xl bg-white px-3 py-2 text-xs font-medium text-stone-700 hover:bg-stone-100"
                            title={preset.description}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                      <p className="mt-2 text-xs leading-5 text-stone-500">
                        Applies staff spacing across the full part for print preview and exported layout.
                      </p>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        onClick={() => onApplyCommands([{
                          type: 'setMeasureLayoutHint',
                          measureNumber: targetMeasure,
                          partId: part.id,
                          hint: 'newSystem',
                          value: true,
                        }], `System break ${part.id}`)}
                        className="rounded-xl bg-stone-100 px-3 py-2 text-xs font-medium text-stone-700 hover:bg-stone-200"
                      >
                        System break here
                      </button>
                      <button
                        onClick={() => onApplyCommands([{
                          type: 'setMeasureLayoutHint',
                          measureNumber: targetMeasure,
                          partId: part.id,
                          hint: 'newPage',
                          value: true,
                        }], `Page break ${part.id}`)}
                        className="rounded-xl bg-stone-100 px-3 py-2 text-xs font-medium text-stone-700 hover:bg-stone-200"
                      >
                        Page break here
                      </button>
                      <button
                        onClick={() => onApplyCommands([
                          {
                            type: 'setMeasureLayoutHint',
                            measureNumber: targetMeasure,
                            partId: part.id,
                            hint: 'newSystem',
                            value: false,
                          },
                          {
                            type: 'setMeasureLayoutHint',
                            measureNumber: targetMeasure,
                            partId: part.id,
                            hint: 'newPage',
                            value: false,
                          },
                        ], `Clear breaks ${part.id}`)}
                        className="rounded-xl bg-white px-3 py-2 text-xs font-medium text-stone-700 hover:bg-stone-100"
                      >
                        Clear breaks
                      </button>
                    </div>
                    <div className="mt-2 flex gap-2">
                      <input
                        value={layoutDraft.staffSpacing}
                        onChange={(event) => setPartLayoutDrafts((state) => ({ ...state, [part.id]: { staffSpacing: event.target.value } }))}
                        placeholder="Staff spacing"
                        className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
                      />
                      <button
                        onClick={() => {
                          const spacing = Number(layoutDraft.staffSpacing);
                          if (!Number.isFinite(spacing) || spacing <= 0) return;
                          onApplyCommands([{
                            type: 'setMeasureLayoutHint',
                            measureNumber: targetMeasure,
                            partId: part.id,
                            staffIndex: selectedNote?.staffIndex ?? 1,
                            hint: 'staffSpacing',
                            value: spacing,
                          }], `Staff spacing ${part.id}`);
                          setPartLayoutDrafts((state) => ({ ...state, [part.id]: { staffSpacing: '' } }));
                        }}
                        className="rounded-xl bg-gray-900 px-3 py-2 text-xs font-medium text-white hover:bg-gray-700"
                      >
                        Apply spacing
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </InspectorSection>
    </div>
  );
}
