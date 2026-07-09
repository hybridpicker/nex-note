'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { NoteDuration, AccidentalChoice, NoteEntryMode, SelectedNote, ArticulationKind, BarlineKind, DynamicKind, GuitarTechniqueKind, TupletNumber } from '@/hooks/useNoteEditor';
import { AccidentalGlyph, BarlineGlyph, NoteDurationGlyph, RestGlyph } from '@/components/NotationGlyphs';
import { useI18n, type TranslationKey } from '@/lib/i18n';
import { formatShortcutHint } from '@/lib/shortcut-hints';
import { GUITAR_TUNINGS, resolveGuitarFretPitch, resolveGuitarTuning, type GuitarTuningId } from '@/src/score-input/guitar-fretboard';
import type { ScoreDocumentModel } from '@/src/score-core/model/types';
import { QWERTY_PIANO_KEYS } from '@/src/score-input/repitch-mode';
import type { MidiInputStatus } from '@/hooks/useMidiInput';

const NOTE_ICONS: Record<NoteDuration, React.ReactNode> = {
  '1': <NoteDurationGlyph duration="1" />,
  '2': <NoteDurationGlyph duration="2" />,
  '4': <NoteDurationGlyph duration="4" />,
  '8': <NoteDurationGlyph duration="8" />,
  '16': <NoteDurationGlyph duration="16" />,
  '32': <NoteDurationGlyph duration="32" />,
  '64': <NoteDurationGlyph duration="64" />,
  breve: <NoteDurationGlyph duration="breve" />,
  long: <NoteDurationGlyph duration="long" />,
};

// ─── Constants ────────────────────────────────────────────────────────────────

const DURATIONS: { key: NoteDuration; titleKey: TranslationKey }[] = [
  { key: '64', titleKey: 'note.duration.64' },
  { key: '32', titleKey: 'note.duration.32' },
  { key: '16', titleKey: 'note.duration.16' },
  { key: '8',  titleKey: 'note.duration.8' },
  { key: '4',  titleKey: 'note.duration.4' },
  { key: '2',  titleKey: 'note.duration.2' },
  { key: '1',  titleKey: 'note.duration.1' },
  { key: 'breve', titleKey: 'note.duration.breve' },
  { key: 'long', titleKey: 'note.duration.long' },
];

const DURATION_SHORTCUTS: Record<NoteDuration, string> = {
  '64': '1',
  '32': '2',
  '16': '3',
  '8': '4',
  '4': '5',
  '2': '6',
  '1': '7',
  breve: '8',
  long: '9',
};

const ACCIDENTALS: {
  value: Exclude<AccidentalChoice, null>;
  icon: React.ReactNode;
  title: string;
}[] = [
  { value: 'double-flat',  icon: <AccidentalGlyph accidental="double-flat" className="h-5 w-5" />,  title: 'Double flat'  },
  { value: 'flat',         icon: <AccidentalGlyph accidental="flat" className="h-5 w-5" />,         title: 'Flat'         },
  { value: 'natural',      icon: <AccidentalGlyph accidental="natural" className="h-5 w-5" />,      title: 'Natural'      },
  { value: 'sharp',        icon: <AccidentalGlyph accidental="sharp" className="h-5 w-5" />,        title: 'Sharp'        },
  { value: 'double-sharp', icon: <AccidentalGlyph accidental="double-sharp" className="h-[18px] w-[18px]" />, title: 'Double sharp' },
];

// ─── Articulation glyphs ──────────────────────────────────────────────────────

function MarcatoIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path d="M1.2 9L6 2.3L10.8 9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AccentIcon() {
  return (
    <svg width="13" height="9" viewBox="0 0 14 10" fill="none" aria-hidden>
      <path d="M1 5L13 1.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M1 5L13 8.7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TenutoIcon() {
  return (
    <svg width="13" height="3" viewBox="0 0 14 3" fill="none" aria-hidden>
      <line x1="1" y1="1.5" x2="13" y2="1.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

function StaccatoIcon() {
  return (
    <svg width="6" height="6" viewBox="0 0 6 6" fill="currentColor" aria-hidden>
      <circle cx="3" cy="3" r="2.2" />
    </svg>
  );
}

function StaccatissimoIcon() {
  return (
    <svg width="8" height="10" viewBox="0 0 8 10" fill="currentColor" aria-hidden>
      <path d="M4 8.8L.9 1.4h6.2L4 8.8z" />
    </svg>
  );
}

function FermataIcon() {
  return (
    <svg width="16" height="13" viewBox="0 0 18 14" fill="none" aria-hidden>
      <path d="M2 9.2C3.6 4.4 6 2 9 2s5.4 2.4 7 7.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="9" cy="10" r="1.5" fill="currentColor" />
    </svg>
  );
}

const ARTICULATIONS_QUICK: { kind: ArticulationKind; icon: React.ReactNode; title: string }[] = [
  { kind: 'strong-accent', icon: <MarcatoIcon />,  title: 'Marcato (Shift+6)' },
  { kind: 'accent',        icon: <AccentIcon />,   title: 'Accent (Shift+.)' },
  { kind: 'tenuto',        icon: <TenutoIcon />,   title: 'Tenuto (Shift+-)' },
  { kind: 'staccato',      icon: <StaccatoIcon />, title: 'Staccato (Shift+S)' },
  { kind: 'staccatissimo', icon: <StaccatissimoIcon />, title: 'Staccatissimo' },
  { kind: 'fermata',       icon: <FermataIcon />, title: 'Fermata' },
];

const TUPLETS_QUICK: { actual: TupletNumber; normal: number; title: string }[] = [
  { actual: 2, normal: 3, title: 'Duplet 2:3 from selection (Cmd/Ctrl+2)' },
  { actual: 3, normal: 2, title: 'Triplet from selection (Cmd/Ctrl+3)' },
  { actual: 4, normal: 3, title: 'Quadruplet 4:3 from selection (Cmd/Ctrl+4)' },
  { actual: 5, normal: 4, title: 'Quintuplet from selection (Cmd/Ctrl+5)' },
  { actual: 6, normal: 4, title: 'Sextuplet 6:4 from selection (Cmd/Ctrl+6)' },
  { actual: 7, normal: 4, title: 'Septuplet 7:4 from selection (Cmd/Ctrl+7)' },
  { actual: 8, normal: 6, title: 'Octuplet 8:6 from selection (Cmd/Ctrl+8)' },
  { actual: 9, normal: 8, title: 'Nonuplet 9:8 from selection (Cmd/Ctrl+9)' },
];

const GUITAR_TECHNIQUES: Array<{ kind: GuitarTechniqueKind; label: string; title: string }> = [
  { kind: 'hammer-on', label: 'H', title: 'Hammer-on' },
  { kind: 'pull-off', label: 'P', title: 'Pull-off' },
  { kind: 'slide', label: 'SL', title: 'Slide' },
  { kind: 'bend', label: 'B', title: 'Bend' },
  { kind: 'vibrato', label: 'V', title: 'Vibrato' },
  { kind: 'palm-mute', label: 'PM', title: 'Palm mute' },
  { kind: 'let-ring', label: 'LR', title: 'Let ring' },
  { kind: 'dead-note', label: 'X', title: 'Dead note' },
  { kind: 'harmonic', label: 'Harm', title: 'Harmonic' },
  { kind: 'pick-up', label: 'Up', title: 'Pick upstroke' },
  { kind: 'pick-down', label: 'Dn', title: 'Pick downstroke' },
];

const DYNAMICS_QUICK: { kind: DynamicKind; label: string; title: string }[] = [
  { kind: 'pp', label: 'pp', title: 'Pianissimo' },
  { kind: 'p', label: 'p', title: 'Piano' },
  { kind: 'mp', label: 'mp', title: 'Mezzo piano' },
  { kind: 'mf', label: 'mf', title: 'Mezzo forte' },
  { kind: 'f', label: 'f', title: 'Forte' },
  { kind: 'ff', label: 'ff', title: 'Fortissimo' },
  { kind: 'fff', label: 'fff', title: 'Fortississimo' },
  { kind: 'sfz', label: 'sfz', title: 'Sforzando' },
];

const BARLINES_QUICK: { kind: BarlineKind; title: string }[] = [
  { kind: 'regular', title: 'Regular barline' },
  { kind: 'double', title: 'Double barline' },
  { kind: 'final', title: 'Final barline' },
  { kind: 'repeat-start', title: 'Start repeat' },
  { kind: 'repeat-end', title: 'End repeat' },
];

const ACCIDENTAL_SHORTCUTS: Record<Exclude<AccidentalChoice, null>, string> = {
  'double-flat': 'Alt/Option+-',
  flat: '-',
  natural: '=',
  sharp: '+',
  'double-sharp': 'Alt/Option+=',
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  placement?: 'toolbar' | 'sidebar';
  coreDocument: ScoreDocumentModel | null;
  noteInputMode: boolean;
  chordInputMode: boolean;
  stepInputKeyboardMode: boolean;
  midiInputEnabled: boolean;
  midiInputStatus: MidiInputStatus;
  midiInputDevices: string[];
  leadsheetMode: boolean;
  guitarInputMode: boolean;
  selectedGuitarString: 1 | 2 | 3 | 4 | 5 | 6;
  selectedGuitarFret: number;
  selectedGuitarTuning: GuitarTuningId;
  guitarFretBuffer: string;
  selectedDuration: NoteDuration;
  selectedAccidental: AccidentalChoice;
  isDotted: boolean;
  selectedVoice: number;
  entryMode: NoteEntryMode;
  selectedNote: SelectedNote | null;
  selectedBarlineMeasureNumber?: number | null;
  onChangeActivePitch: (step: string) => void;
  onChangeActiveOctave: (direction: 1 | -1) => void;
  onToggleEntryMode: () => void;
  onToggleChordInputMode: () => void;
  onToggleStepInputKeyboardMode: () => void;
  onToggleMidiInput: () => void;
  onToggleLeadsheetMode: () => void;
  onToggleGuitarInputMode: () => void;
  onInsertGuitarFret: (string: 1 | 2 | 3 | 4 | 5 | 6, fret: number, tuningId?: GuitarTuningId) => void;
  onGuitarTuningChange: (tuning: GuitarTuningId) => void;
  onToggleGuitarTechnique: (technique: GuitarTechniqueKind) => void;
  onDurationChange: (d: NoteDuration) => void;
  onAccidentalChange: (a: AccidentalChoice) => void;
  onToggleDotted: () => void;
  onVoiceChange: (v: number) => void;
  onInsertRest: () => void;
  onInsertSlash: () => void;
  onFillSlashMeasure: () => void;
  onInsertStepInputPitch: (step: string, octave: number, alter: number) => void;
  onSetChordSymbol: (value: string) => void;
  onDeleteNote: () => void;
  onCopySelection: () => void;
  onCutSelection: () => void;
  onPasteClipboard: () => void;
  clipboardCount: number;
  onToggleArticulation: (a: ArticulationKind) => void;
  onAddDynamic: (d: DynamicKind) => void;
  onSetBarline: (b: BarlineKind) => void;
  onToggleSlur: () => void;
  onAddGraceNote: () => void;
  onAddTuplet: (tuplet: TupletNumber) => void;
}

function resolveSelectedHarmony(
  coreDocument: ScoreDocumentModel | null,
  selectedNote: SelectedNote | null,
): string {
  if (!coreDocument || !selectedNote) return '';
  for (const part of coreDocument.score.parts) {
    const selectedStaff = part.staves.find((entry) => entry.staffIndex === selectedNote.staffIndex);
    const hasSelectedMeasure = selectedStaff?.measures.some((entry) => entry.measureNumber === selectedNote.measureNumber);
    if (!hasSelectedMeasure) continue;
    const measure = part.staves
      .flatMap((entry) => entry.measures)
      .find((entry) => entry.measureNumber === selectedNote.measureNumber);
    const harmony = measure?.directions.find((direction) => (
      direction.kind === 'harmony'
      && direction.timestampNum === selectedNote.timestampNum
      && direction.timestampDen === selectedNote.timestampDen
    ));
    if (harmony?.value) return harmony.value;
  }
  return '';
}

function selectedPartLabel(coreDocument: ScoreDocumentModel | null, selectedNote: SelectedNote | null): string | null {
  if (!coreDocument || !selectedNote) return null;
  const part = coreDocument.score.parts.find((candidate) => (
    (selectedNote.corePartId && candidate.id === selectedNote.corePartId)
    || candidate.staves.some((staff) => staff.measures.some((measure) => measure.id === selectedNote.coreMeasureId))
  )) ?? null;
  return part?.abbreviation ?? part?.name ?? selectedNote.corePartId ?? null;
}

// ─── Primitives ───────────────────────────────────────────────────────────────

function Divider() {
  return <div className="nex-note-tool-divider nex-brand-divider mx-1 h-5 w-px shrink-0" aria-hidden />;
}

function TBtn({
  onClick, disabled, title, active, children, wide, disabledReason,
}: {
  onClick?: () => void;
  disabled?: boolean;
  title: string;
  active?: boolean;
  children: React.ReactNode;
  wide?: boolean;
  disabledReason?: string;
}) {
  const w = wide ? 'px-2.5 min-w-9' : 'w-8';
  const resolvedTitle = disabled && disabledReason ? `${title} - ${disabledReason}` : title;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={resolvedTitle}
      aria-label={resolvedTitle}
      className={`${w} h-8 flex items-center justify-center rounded-md transition-colors shrink-0 select-none ${
        disabled
          ? 'cursor-not-allowed text-slate-300'
          : active
            ? 'bg-nex-accent-muted text-nex-accent'
            : 'nex-brand-button'
      }`}
    >
      {children}
    </button>
  );
}

function Group({ children }: { children: React.ReactNode }) {
  return (
    <div className="nex-note-tool-group flex items-center gap-0.5 shrink-0">
      {children}
    </div>
  );
}

type SidebarSectionId =
  | 'notes'
  | 'entry'
  | 'keyboard'
  | 'expression'
  | 'dynamics'
  | 'measures'
  | 'harmony'
  | 'guitar'
  | 'edit'
  | 'active';

const SIDEBAR_SECTION_DEFAULTS: Record<SidebarSectionId, boolean> = {
  notes: true,
  entry: true,
  keyboard: true,
  expression: false,
  dynamics: false,
  measures: false,
  harmony: false,
  guitar: true,
  edit: false,
  active: true,
};

function SidebarSection({
  title,
  summary,
  hoverTitle,
  open,
  onToggle,
  children,
}: {
  title: string;
  summary?: React.ReactNode;
  hoverTitle?: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="nex-note-sidebar-section">
      <button
        type="button"
        className="nex-note-sidebar-section-toggle"
        aria-expanded={open}
        title={hoverTitle}
        onClick={onToggle}
      >
        <span className="min-w-0">
          <span className="nex-note-sidebar-section-label block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{title}</span>
          {summary && (
            <span className="nex-note-sidebar-section-summary mt-0.5 block text-xs font-semibold text-nex-ink">{summary}</span>
          )}
        </span>
        <svg
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-90' : ''}`}
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden
        >
          <path d="M6 3.8L10.2 8L6 12.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="nex-note-sidebar-section-content">
          {children}
        </div>
      )}
    </section>
  );
}

function withShortcut(label: string, shortcut: string) {
  return `${label} (${shortcut})`;
}

function stripShortcutSuffix(label: string) {
  return label.replace(/\s*\([^)]*\)\s*$/, '');
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function NoteInputToolbar({
  placement = 'toolbar',
  coreDocument,
  noteInputMode, chordInputMode, stepInputKeyboardMode, midiInputEnabled, midiInputStatus, midiInputDevices, leadsheetMode, guitarInputMode, selectedGuitarString, selectedGuitarFret, selectedGuitarTuning, guitarFretBuffer,
  selectedDuration, selectedAccidental, isDotted, selectedVoice,
  entryMode, selectedNote, selectedBarlineMeasureNumber = null, onChangeActivePitch, onChangeActiveOctave,
  onToggleEntryMode, onToggleChordInputMode, onToggleStepInputKeyboardMode, onToggleMidiInput, onToggleLeadsheetMode, onToggleGuitarInputMode, onInsertGuitarFret, onGuitarTuningChange, onToggleGuitarTechnique,
  onDurationChange, onAccidentalChange, onToggleDotted,
  onVoiceChange, onInsertRest, onInsertSlash, onFillSlashMeasure, onInsertStepInputPitch, onSetChordSymbol, onDeleteNote,
  onCopySelection, onCutSelection, onPasteClipboard, clipboardCount,
  onToggleArticulation, onAddDynamic, onSetBarline, onToggleSlur, onAddGraceNote, onAddTuplet,
}: Props) {
  const { t } = useI18n();
  const [chordDraft, setChordDraft] = useState('');
  const [sidebarSections, setSidebarSections] = useState<Record<SidebarSectionId, boolean>>(SIDEBAR_SECTION_DEFAULTS);
  const chordInputRef = useRef<HTMLInputElement | null>(null);
  const isSidebar = placement === 'sidebar';
  const isRest = selectedNote?.isRest ?? false;
  const pitchSteps = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;
  const fretRange = Array.from({ length: 25 }, (_, index) => index);
  const activeTuning = resolveGuitarTuning(selectedGuitarTuning);
  const activeGuitarPitch = resolveGuitarFretPitch(selectedGuitarString, selectedGuitarFret, activeTuning);
  const selectedGuitar = selectedNote?.guitar;
  const selectedTechniqueSet = new Set(selectedGuitar?.techniques ?? []);
  const noteRequiredReason = t('command.disabled.noteRequired');
  const pitchedNoteRequiredReason = t('command.disabled.pitchedNoteRequired');
  const clipboardEmptyReason = t('command.disabled.clipboardEmpty');
  const selectionRequiredTitle = (title: string) => !selectedNote ? `${title} - ${noteRequiredReason}` : title;
  const pitchedSelectionDisabledReason = !selectedNote
    ? noteRequiredReason
    : isRest
      ? pitchedNoteRequiredReason
      : undefined;
  const pasteDisabledReason = !selectedNote
    ? noteRequiredReason
    : clipboardCount === 0
      ? clipboardEmptyReason
      : undefined;
  const selectedNoteLabel = selectedNote
    ? selectedNote.isRest
      ? 'Rest'
      : `${selectedNote.step}${
          selectedNote.alter === 2  ? '𝄪' :
          selectedNote.alter === 1  ? '♯' :
          selectedNote.alter === -1 ? '♭' :
          selectedNote.alter === -2 ? '𝄫' : ''
        }${selectedNote.octave}`
    : '—';
  const selectedNoteContext = selectedNote
    ? [
        selectedPartLabel(coreDocument, selectedNote),
        `m.${selectedNote.measureNumber}`,
        `st.${selectedNote.staffIndex}`,
        `v.${selectedNote.voiceId}`,
        `t.${selectedNote.timestampNum}/${selectedNote.timestampDen}`,
        selectedNote.guitar ? `str.${selectedNote.guitar.string}` : null,
        selectedNote.guitar ? `fr.${selectedNote.guitar.fret}` : null,
      ].filter(Boolean).join(' ')
    : null;
  const hasBarlineTarget = Boolean(selectedNote || selectedBarlineMeasureNumber);
  const barlineDisabledReason = hasBarlineTarget ? undefined : noteRequiredReason;
  const selectedDurationTitleKey = DURATIONS.find((duration) => duration.key === selectedDuration)?.titleKey ?? 'note.duration.4';
  const selectedAccidentalLabel = selectedAccidental
    ? ACCIDENTALS.find((accidental) => accidental.value === selectedAccidental)?.title ?? ''
    : t('note.natural');
  const activeModes = [
    `${t('note.voice')} ${selectedVoice}`,
    entryMode === 'overwrite' ? 'OVR' : 'INS',
    chordInputMode ? 'CHD' : null,
    stepInputKeyboardMode ? 'STEP' : null,
    midiInputEnabled ? 'MIDI' : null,
    leadsheetMode ? 'LEAD' : null,
    guitarInputMode ? 'TAB' : null,
  ].filter(Boolean).join(' · ');
  const selectedHarmony = useMemo(
    () => resolveSelectedHarmony(coreDocument, selectedNote),
    [
      coreDocument,
      selectedNote?.coreEntityId,
      selectedNote?.measureNumber,
      selectedNote?.staffIndex,
      selectedNote?.timestampNum,
      selectedNote?.timestampDen,
    ],
  );
  const lowerStepKeys = useMemo(
    () => QWERTY_PIANO_KEYS.filter((entry) => entry.row === 'lower'),
    [],
  );
  const upperStepKeys = useMemo(
    () => QWERTY_PIANO_KEYS.filter((entry) => entry.row === 'upper'),
    [],
  );
  const noteSectionShortcutTitle = useMemo(() => {
    const durationLines = DURATIONS.map((duration) => (
      `${stripShortcutSuffix(t(duration.titleKey))}: ${DURATION_SHORTCUTS[duration.key]}`
    ));
    const accidentalLines = ACCIDENTALS.map((accidental) => (
      `${accidental.title}: ${formatShortcutHint(ACCIDENTAL_SHORTCUTS[accidental.value])}`
    ));

    return [
      'Duration shortcuts (only when Note Input is active)',
      ...durationLines,
      `${stripShortcutSuffix(t('note.dotted'))}: .`,
      '',
      'Accidental shortcuts',
      ...accidentalLines,
    ].join('\n');
  }, [t]);

  const durationTitle = (duration: (typeof DURATIONS)[number]) => [
    `${stripShortcutSuffix(t(duration.titleKey))}: ${DURATION_SHORTCUTS[duration.key]}`,
    '',
    noteSectionShortcutTitle,
  ].join('\n');

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return undefined;
    const focusChord = () => {
      if (isSidebar) {
        setSidebarSections((current) => ({
          ...current,
          harmony: true,
        }));
      }
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          chordInputRef.current?.focus();
          chordInputRef.current?.select();
        });
      });
    };
    window.addEventListener('nex-note:focus-chord-symbol', focusChord);
    return () => window.removeEventListener('nex-note:focus-chord-symbol', focusChord);
  }, [isSidebar]);

  useEffect(() => {
    setChordDraft(selectedHarmony);
  }, [
    selectedHarmony,
    selectedNote?.coreEntityId,
    selectedNote?.measureNumber,
    selectedNote?.staffIndex,
    selectedNote?.voiceId,
    selectedNote?.timestampNum,
    selectedNote?.timestampDen,
  ]);

  useEffect(() => {
    if (!isSidebar) return;
    if (!stepInputKeyboardMode && !guitarInputMode) return;
    setSidebarSections((current) => ({
      ...current,
      keyboard: stepInputKeyboardMode ? true : current.keyboard,
      guitar: guitarInputMode ? true : current.guitar,
    }));
  }, [guitarInputMode, isSidebar, stepInputKeyboardMode]);

  const toggleSidebarSection = (section: SidebarSectionId) => {
    setSidebarSections((current) => ({
      ...current,
      [section]: !current[section],
    }));
  };

  const rootClassName = isSidebar
    ? 'nex-note-input-tools nex-note-input-tools--sidebar flex h-full min-h-0 min-w-0 flex-1 flex-col gap-1.5 overflow-y-auto border-r border-nex-border bg-white p-2'
    : 'nex-note-input-tools mt-2 flex flex-wrap items-center gap-1 border-t border-nex-border pt-2';

  const durationTools = (
    <Group>
      {DURATIONS.map(d => (
        <TBtn
          key={d.key}
          onClick={() => onDurationChange(d.key)}
          title={durationTitle(d)}
          active={selectedDuration === d.key}
        >
          {NOTE_ICONS[d.key]}
        </TBtn>
      ))}
      <TBtn onClick={onToggleDotted} title={t('note.dotted')} active={isDotted}>
        <svg width="6" height="6" viewBox="0 0 6 6" fill="currentColor" aria-hidden>
          <circle cx="3" cy="3" r="2.2" />
        </svg>
      </TBtn>
    </Group>
  );

  const accidentalTools = (
    <Group>
      {ACCIDENTALS.map(a => (
        <TBtn
          key={a.value}
          onClick={() => onAccidentalChange(selectedAccidental === a.value ? null : a.value)}
          title={withShortcut(a.title, ACCIDENTAL_SHORTCUTS[a.value])}
          active={selectedAccidental === a.value}
        >
          {a.icon}
        </TBtn>
      ))}
    </Group>
  );

  const expressionTools = (
    <Group>
      <TBtn
        onClick={onToggleSlur}
        disabled={!selectedNote || isRest}
        title={t('note.slur')}
        disabledReason={pitchedSelectionDisabledReason}
      >
        <svg width="16" height="9" viewBox="0 0 18 10" fill="none" aria-hidden>
          <path d="M1.2 8C4 3.2 14 3.2 16.8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none" />
        </svg>
      </TBtn>
      {ARTICULATIONS_QUICK.map(a => (
        <TBtn
          key={a.kind}
          onClick={() => onToggleArticulation(a.kind)}
          disabled={!selectedNote || isRest}
          title={a.title}
          disabledReason={pitchedSelectionDisabledReason}
        >
          {a.icon}
        </TBtn>
      ))}
      <TBtn
        onClick={onAddGraceNote}
        disabled={!selectedNote}
        title={t('note.grace')}
        disabledReason={!selectedNote ? noteRequiredReason : undefined}
      >
        <svg className="h-4 w-4" viewBox="0 0 16 20" fill="none" aria-hidden>
          <ellipse cx="5.5" cy="15" rx="3.7" ry="2.6" fill="currentColor" transform="rotate(-18 5.5 15)" />
          <line x1="8.8" y1="13.8" x2="8.8" y2="3.5" stroke="currentColor" strokeWidth="1.05" strokeLinecap="round" />
          <path d="M8.8 3.5C12.6 4.4 12.6 9.2 8.8 11.8" stroke="currentColor" strokeWidth="1.05" strokeLinecap="round" fill="none" />
          <line x1="3.2" y1="12" x2="12.2" y2="6" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
        </svg>
      </TBtn>
      {TUPLETS_QUICK.map((tuplet) => (
        <TBtn
          key={tuplet.actual}
          onClick={() => onAddTuplet(tuplet.actual)}
          disabled={!selectedNote}
          title={tuplet.title}
          disabledReason={!selectedNote ? noteRequiredReason : undefined}
          wide
        >
          <span className="text-[10px] font-semibold tracking-wider">{tuplet.actual}:{tuplet.normal}</span>
        </TBtn>
      ))}
    </Group>
  );

  const dynamicsTools = (
    <Group>
      {DYNAMICS_QUICK.map((dynamic) => (
        <TBtn
          key={dynamic.kind}
          onClick={() => onAddDynamic(dynamic.kind)}
          disabled={!selectedNote}
          title={dynamic.title}
          disabledReason={!selectedNote ? noteRequiredReason : undefined}
          wide
        >
          <span className="font-serif text-[13px] font-semibold italic leading-none tracking-normal">{dynamic.label}</span>
        </TBtn>
      ))}
    </Group>
  );

  const barlineTools = (
    <Group>
      {BARLINES_QUICK.map((barline) => (
        <TBtn
          key={barline.kind}
          onClick={() => onSetBarline(barline.kind)}
          disabled={!hasBarlineTarget}
          title={barline.title}
          disabledReason={barlineDisabledReason}
        >
          <BarlineGlyph barline={barline.kind} className="h-6 w-6" />
        </TBtn>
      ))}
    </Group>
  );

  const entryTools = (
    <Group>
      {([1, 2, 3, 4] as const).map(v => (
        <TBtn
          key={v}
          onClick={() => onVoiceChange(v)}
          title={withShortcut(`${t('note.voice')} ${v}`, `Cmd/Ctrl+Alt/Option+${v}`)}
          active={selectedVoice === v}
        >
          <span className="text-[11px] font-semibold tabular-nums">{v}</span>
        </TBtn>
      ))}
      <TBtn
        onClick={onToggleEntryMode}
        title={`${t('note.entry')}: ${entryMode} (I, Cmd/Ctrl+I, Cmd/Ctrl+Shift+I)`}
        active={entryMode === 'overwrite'}
        wide
      >
        <span className="text-[10px] font-semibold tracking-wider">{entryMode === 'overwrite' ? 'OVR' : 'INS'}</span>
      </TBtn>
      <TBtn
        onClick={onToggleChordInputMode}
        title={`${chordInputMode ? t('note.chordInputOn') : t('note.chordInputOff')} (Cmd/Ctrl+Shift+H)`}
        active={chordInputMode}
        wide
      >
        <span className="text-[10px] font-semibold tracking-wider">CHD</span>
      </TBtn>
      <TBtn
        onClick={onToggleStepInputKeyboardMode}
        title={`Toggle QWERTY step keyboard (P)${noteInputMode ? '' : ' - enables Note Input'}`}
        active={stepInputKeyboardMode}
        wide
      >
        <span className="text-[10px] font-semibold tracking-wider">STEP</span>
      </TBtn>
      <TBtn
        onClick={onToggleMidiInput}
        title={[
          midiInputEnabled ? 'Disable live MIDI input' : 'Enable live MIDI input',
          midiInputStatus === 'requesting' ? 'Requesting MIDI access…' : null,
          midiInputStatus === 'waiting' ? 'Waiting for a MIDI input device' : null,
          midiInputStatus === 'denied' ? 'MIDI access was denied; click to retry' : null,
          midiInputStatus === 'unsupported' ? 'Web MIDI is not supported in this browser' : null,
          midiInputStatus === 'error' ? 'MIDI input could not be started; click to retry' : null,
          midiInputDevices.length > 0 ? midiInputDevices.join(', ') : null,
        ].filter(Boolean).join('\n')}
        active={midiInputEnabled}
        disabled={midiInputStatus === 'requesting' || midiInputStatus === 'unsupported'}
        disabledReason={midiInputStatus === 'unsupported' ? 'Web MIDI is unavailable' : undefined}
        wide
      >
        <span className="text-[10px] font-semibold tracking-wider">MIDI</span>
      </TBtn>
      <TBtn
        onClick={onToggleLeadsheetMode}
        title={withShortcut(leadsheetMode ? t('toolbar.leadOn') : t('toolbar.leadOff'), 'L')}
        active={leadsheetMode}
        wide
      >
        <span className="text-[10px] font-semibold tracking-wider">LEAD</span>
      </TBtn>
      <TBtn
        onClick={onToggleGuitarInputMode}
        title={withShortcut('Guitar tab input', 'TAB button')}
        active={guitarInputMode}
        wide
      >
        <span className="text-[10px] font-semibold tracking-wider">TAB</span>
      </TBtn>
      <TBtn
        onClick={onInsertSlash}
        disabled={!selectedNote}
        title={t('note.insertSlash')}
        disabledReason={!selectedNote ? noteRequiredReason : undefined}
      >
        <span className="text-base font-semibold leading-none">/</span>
      </TBtn>
      <TBtn
        onClick={onFillSlashMeasure}
        disabled={!selectedNote}
        title={t('note.fillSlashes')}
        disabledReason={!selectedNote ? noteRequiredReason : undefined}
        wide
      >
        <span className="text-[10px] font-semibold tracking-wider">////</span>
      </TBtn>
      <TBtn
        onClick={onInsertRest}
        disabled={!selectedNote}
        title={t('note.insertRest')}
        disabledReason={!selectedNote ? noteRequiredReason : undefined}
      >
        <RestGlyph className="h-5 w-5" />
      </TBtn>
    </Group>
  );

  const stepKeyboardTools = stepInputKeyboardMode ? (
    <div
      className="flex shrink-0 items-center gap-2 rounded-md border border-nex-border bg-nex-surface px-2 py-1"
      data-testid="step-input-panel"
    >
      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">QWERTY</span>
      <div className="flex flex-col gap-1">
        {[upperStepKeys, lowerStepKeys].map((row, rowIndex) => (
          <div key={rowIndex === 0 ? 'upper' : 'lower'} className="flex items-center gap-0.5">
            {row.map((entry) => {
              const isSharp = entry.alter !== 0;
              const noteLabel = `${entry.step}${isSharp ? '#' : ''}${entry.octave}`;
              return (
                <button
                  key={`${entry.key}:${noteLabel}`}
                  type="button"
                  onClick={() => onInsertStepInputPitch(entry.step, entry.octave, entry.alter)}
                  title={`Insert ${noteLabel} (${entry.key})`}
                  className={`h-7 min-w-8 rounded-md border px-1 text-[10px] font-semibold transition-colors ${
                    isSharp
                      ? 'border-slate-700 bg-slate-800 text-white hover:bg-slate-700'
                      : 'border-nex-border bg-white text-slate-700 hover:bg-slate-50 hover:text-nex-ink'
                  }`}
                >
                  <span className="block leading-none">{entry.key}</span>
                  <span className={`block pt-0.5 text-[9px] leading-none ${isSharp ? 'text-slate-200' : 'text-slate-400'}`}>
                    {noteLabel}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  ) : null;

  const chordTools = (
    <form
      className="flex items-center gap-1 shrink-0"
      onSubmit={(event) => {
        event.preventDefault();
        if (!chordDraft.trim()) return;
        onSetChordSymbol(chordDraft);
        setChordDraft('');
      }}
    >
      <input
        ref={chordInputRef}
        value={chordDraft}
        onChange={(event) => setChordDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return;
          event.preventDefault();
          setChordDraft(selectedHarmony);
          chordInputRef.current?.blur();
        }}
        disabled={!selectedNote}
        aria-label={t('note.chordSymbol')}
        placeholder="Cmaj7"
        title={selectionRequiredTitle(`${t('note.chordSymbol')} (Cmd/Ctrl+K)`)}
        className="h-8 w-24 rounded-md border border-nex-border bg-white px-2 text-xs font-semibold text-nex-ink outline-none transition-colors placeholder:text-slate-300 focus:border-nex-accent disabled:bg-nex-surface disabled:text-slate-300"
      />
      <TBtn
        disabled={!selectedNote || !chordDraft.trim()}
        title={t('note.setChord')}
        disabledReason={!selectedNote ? noteRequiredReason : undefined}
        wide
      >
        <span className="text-[10px] font-semibold tracking-wider">ADD</span>
      </TBtn>
    </form>
  );

  const guitarTools = guitarInputMode ? (
    <div
      className="flex items-center gap-1.5 shrink-0 rounded-md border border-nex-border bg-nex-surface px-1.5 py-1"
      aria-label="Guitar fret input"
    >
      <select
        value={selectedGuitarTuning}
        onChange={(event) => onGuitarTuningChange(event.target.value as GuitarTuningId)}
        title="Guitar tuning"
        className="h-7 rounded border border-nex-border bg-white px-1.5 text-[10px] font-semibold text-slate-600 outline-none"
      >
        {GUITAR_TUNINGS.map((tuning) => (
          <option key={tuning.id} value={tuning.id}>{tuning.label}</option>
        ))}
      </select>
      <div className="flex items-center gap-0.5">
        {activeTuning.strings.map((string) => (
          <button
            key={string.string}
            type="button"
            onClick={() => onInsertGuitarFret(string.string, selectedGuitarFret, selectedGuitarTuning)}
            disabled={!selectedNote}
            title={selectionRequiredTitle(`String ${string.string} ${string.label} (Alt+${string.string})`)}
            className={`h-7 min-w-7 rounded px-1 text-[10px] font-semibold tabular-nums transition-colors ${
              selectedGuitarString === string.string
                ? 'nex-brand-active'
                : 'text-slate-600 hover:bg-white hover:text-nex-ink disabled:text-slate-300'
            }`}
          >
            {string.string}
          </button>
        ))}
      </div>
      <div className="h-5 w-px bg-nex-border" aria-hidden />
      <div className="flex items-center gap-0.5">
        {fretRange.map((fret) => {
          const pitch = resolveGuitarFretPitch(selectedGuitarString, fret, activeTuning);
          return (
            <button
              key={fret}
              type="button"
              onClick={() => onInsertGuitarFret(selectedGuitarString, fret, selectedGuitarTuning)}
              disabled={!selectedNote}
              title={selectionRequiredTitle(`Fret ${fret}: ${pitch.label}`)}
              className={`h-7 min-w-7 rounded px-1 text-[10px] font-semibold tabular-nums transition-colors ${
                selectedGuitarFret === fret
                  ? 'nex-brand-active'
                  : 'text-slate-600 hover:bg-white hover:text-nex-ink disabled:text-slate-300'
              }`}
            >
              {fret}
            </button>
          );
        })}
      </div>
      <span className="pl-1 text-[11px] font-semibold tabular-nums text-slate-500">
        {selectedGuitarString}/{guitarFretBuffer || selectedGuitarFret} {activeGuitarPitch.label}
      </span>
      <div className="h-5 w-px bg-nex-border" aria-hidden />
      <div className="grid w-28 grid-cols-[16px_repeat(4,1fr)] gap-x-1 gap-y-0.5 text-[9px] tabular-nums text-slate-500" data-testid="guitar-tab-mini-grid">
        {activeTuning.strings.map((string) => (
          <div key={`tab-string:${string.string}`} className="contents">
            <span className="text-right font-semibold">{string.string}</span>
            {[0, 1, 2, 3].map((slot) => (
              <span
                key={`${string.string}:${slot}`}
                className={`h-3 border-t border-slate-300 text-center leading-3 ${
                  selectedGuitar?.string === string.string && slot === 1 ? 'font-bold text-nex-accent' : ''
                }`}
              >
                {selectedGuitar?.string === string.string && slot === 1 ? selectedGuitar.fret : ''}
              </span>
            ))}
          </div>
        ))}
      </div>
      <div className="h-5 w-px bg-nex-border" aria-hidden />
      <Group>
        {GUITAR_TECHNIQUES.map((technique) => (
          <button
            key={technique.kind}
            type="button"
            onClick={() => onToggleGuitarTechnique(technique.kind)}
            disabled={!selectedNote || isRest}
            title={selectedNote && isRest
              ? `${technique.title} - ${pitchedNoteRequiredReason}`
              : !selectedNote
                ? selectionRequiredTitle(technique.title)
                : technique.title}
            className={`h-7 min-w-7 rounded px-1 text-[9px] font-semibold transition-colors ${
              selectedTechniqueSet.has(technique.kind)
                ? 'nex-brand-active'
                : 'text-slate-600 hover:bg-white hover:text-nex-ink disabled:text-slate-300'
            }`}
          >
            {technique.label}
          </button>
        ))}
      </Group>
    </div>
  ) : null;

  const editTools = (
    <Group>
      <TBtn
        onClick={onCopySelection}
        disabled={!selectedNote}
        title={t('note.copy')}
        disabledReason={!selectedNote ? noteRequiredReason : undefined}
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
          <rect x="9" y="9" width="13" height="13" rx="2.5" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      </TBtn>
      <TBtn
        onClick={onCutSelection}
        disabled={!selectedNote}
        title={t('note.cut')}
        disabledReason={!selectedNote ? noteRequiredReason : undefined}
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
          <circle cx="6.5" cy="17.5" r="2.5" />
          <circle cx="6.5" cy="6.5" r="2.5" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 8.5 19 18.5" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 15.5 19 5.5" />
        </svg>
      </TBtn>
      <TBtn
        onClick={onPasteClipboard}
        disabled={!selectedNote || clipboardCount === 0}
        title={t('note.paste')}
        disabledReason={pasteDisabledReason}
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
          <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
          <rect x="9" y="3" width="6" height="4" rx="1.2" />
        </svg>
      </TBtn>
      <TBtn
        onClick={onDeleteNote}
        disabled={!selectedNote}
        title={t('note.delete')}
        disabledReason={!selectedNote ? noteRequiredReason : undefined}
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 7h14M10 7V5a2 2 0 0 1 2-2h0a2 2 0 0 1 2 2v2M7 7l1 13a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2l1-13" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M10 11v7M14 11v7" />
        </svg>
      </TBtn>
    </Group>
  );

  const activeTools = (
    <div className="nex-note-active-summary ml-auto flex items-center gap-3 shrink-0 pl-2">
      <div className="flex items-baseline gap-1.5">
        <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400">{t('note.active')}</span>
        <span className={`text-xs font-semibold tabular-nums ${selectedNote ? 'text-nex-ink' : 'text-slate-400'}`}>
          {selectedNoteLabel}
        </span>
        {selectedNoteContext && (
          <span className="text-[11px] text-slate-400 tabular-nums">{selectedNoteContext}</span>
        )}
      </div>
      {selectedNote && !isRest && (
        <div className="flex items-center gap-1 rounded-lg border border-nex-border bg-nex-surface px-1.5 py-1">
          <button
            type="button"
            onClick={() => onChangeActiveOctave(-1)}
            title={`${t('note.lowerOctave')} (Shift+ArrowDown / Cmd/Ctrl+ArrowDown)`}
            className="h-7 min-w-8 rounded-md px-2 text-[10px] font-semibold tracking-wide text-slate-600 transition-colors hover:bg-white hover:text-nex-ink"
          >
            8va-
          </button>
          {pitchSteps.map((step) => (
            <button
              key={step}
              type="button"
              onClick={() => onChangeActivePitch(step)}
              title={withShortcut(t('note.setPitch', { step }), step)}
              className={`h-7 min-w-7 rounded-md px-1.5 text-[11px] font-semibold transition-colors ${
                selectedNote.step === step
                  ? 'nex-brand-active'
                  : 'text-slate-600 hover:bg-white hover:text-nex-ink'
              }`}
            >
              {step}
            </button>
          ))}
          <button
            type="button"
            onClick={() => onChangeActiveOctave(1)}
            title={`${t('note.raiseOctave')} (Shift+ArrowUp / Cmd/Ctrl+ArrowUp)`}
            className="h-7 min-w-8 rounded-md px-2 text-[10px] font-semibold tracking-wide text-slate-600 transition-colors hover:bg-white hover:text-nex-ink"
          >
            8va+
          </button>
        </div>
      )}
    </div>
  );

  if (isSidebar) {
    return (
      <div className={rootClassName} aria-label="Notation tools">
        <SidebarSection
          title={t('note.section.notes')}
          summary={`${t(selectedDurationTitleKey)} · ${isDotted ? t('note.dotted') : selectedAccidentalLabel}`}
          hoverTitle={noteSectionShortcutTitle}
          open={sidebarSections.notes}
          onToggle={() => toggleSidebarSection('notes')}
        >
          {durationTools}
          {accidentalTools}
        </SidebarSection>
        <SidebarSection
          title={t('note.section.entry')}
          summary={activeModes}
          open={sidebarSections.entry}
          onToggle={() => toggleSidebarSection('entry')}
        >
          {entryTools}
        </SidebarSection>
        {stepKeyboardTools && (
          <SidebarSection
            title={t('note.section.keyboard')}
            summary="QWERTY"
            open={sidebarSections.keyboard}
            onToggle={() => toggleSidebarSection('keyboard')}
          >
            {stepKeyboardTools}
          </SidebarSection>
        )}
        <SidebarSection
          title={t('note.section.expression')}
          summary={t('note.section.expressionSummary')}
          open={sidebarSections.expression}
          onToggle={() => toggleSidebarSection('expression')}
        >
          {expressionTools}
        </SidebarSection>
        <SidebarSection
          title={t('note.section.dynamics')}
          summary="pp · mf · ff · sfz"
          open={sidebarSections.dynamics}
          onToggle={() => toggleSidebarSection('dynamics')}
        >
          {dynamicsTools}
        </SidebarSection>
        <SidebarSection
          title={t('note.section.measures')}
          summary={t('note.section.measuresSummary')}
          open={sidebarSections.measures}
          onToggle={() => toggleSidebarSection('measures')}
        >
          {barlineTools}
        </SidebarSection>
        <SidebarSection
          title={t('note.section.harmony')}
          summary={selectedHarmony || 'Cmaj7'}
          open={sidebarSections.harmony}
          onToggle={() => toggleSidebarSection('harmony')}
        >
          {chordTools}
        </SidebarSection>
        {guitarTools && (
          <SidebarSection
            title={t('note.section.guitar')}
            summary={`${selectedGuitarString}/${guitarFretBuffer || selectedGuitarFret} ${activeGuitarPitch.label}`}
            open={sidebarSections.guitar}
            onToggle={() => toggleSidebarSection('guitar')}
          >
            {guitarTools}
          </SidebarSection>
        )}
        <SidebarSection
          title={t('note.section.edit')}
          summary={`${t('note.section.clipboard')}: ${clipboardCount}`}
          open={sidebarSections.edit}
          onToggle={() => toggleSidebarSection('edit')}
        >
          {editTools}
        </SidebarSection>
        <SidebarSection
          title={t('note.section.active')}
          summary={selectedNote ? `${selectedNoteLabel} m.${selectedNote.measureNumber}` : selectedNoteLabel}
          open={sidebarSections.active}
          onToggle={() => toggleSidebarSection('active')}
        >
          {activeTools}
        </SidebarSection>
      </div>
    );
  }

  return (
    <div className={rootClassName} aria-label="Notation tools">
      {durationTools}
      <Divider />
      {accidentalTools}
      <Divider />
      {expressionTools}
      <Divider />
      {dynamicsTools}
      <Divider />
      {barlineTools}
      <Divider />
      {entryTools}
      {stepKeyboardTools && (
        <>
          <Divider />
          {stepKeyboardTools}
        </>
      )}
      <Divider />
      {chordTools}
      {guitarTools && (
        <>
          <Divider />
          {guitarTools}
        </>
      )}
      <Divider />
      {editTools}
      {activeTools}
    </div>
  );
}
