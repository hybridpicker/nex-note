'use client';

import { useEffect, useRef } from 'react';

import PlaybackMixer from '@/components/PlaybackMixer';
import type { MixerState } from '@/lib/playback-mixer';
import { formatShortcutHint } from '@/lib/shortcut-hints';
import NoteInputToolbar from '@/components/NoteInputToolbar';
import { useI18n, type TranslationKey } from '@/lib/i18n';
import { describePosition, durationLabelKey } from '@/src/score-input/position-label';
import { inputVoiceOf } from '@/src/score-input/voice-mapping';
import type { PlaybackState, PlaybackTransport } from '@/hooks/usePlayback';
import type { NoteDuration, AccidentalChoice, NoteEntryMode, SelectedNote, ArticulationKind, BarlineKind, DynamicKind, GuitarTechniqueKind, TupletNumber } from '@/hooks/useNoteEditor';
import type { GuitarTuningId } from '@/src/score-input/guitar-fretboard';
import type { ScoreDocumentModel } from '@/src/score-core/model/types';
import type { MidiInputStatus } from '@/hooks/useMidiInput';
import type {
  MicrophoneDetectionMode,
  MicrophoneInstrumentMode,
  MicrophoneInputDevice,
  MicrophoneInputStatus,
  MicrophoneSignalQuality,
  InstrumentInputProfile,
  AmpInputChoiceReason,
} from '@/hooks/useMicrophonePitchInput';
import type { DiatonicIntervalNumber } from '@/src/score-input/staff-pitch';

interface Props {
  // Playback
  playbackState: PlaybackState;
  currentMeasure: number;
  totalBeats: number;
  currentBeat: number;
  /** Live playback clock: while playing, the progress bar follows it every frame. */
  playbackTransport?: PlaybackTransport | null;
  coreDocument: ScoreDocumentModel | null;
  midiLoading: boolean;
  hasMidi: boolean;
  playbackError: string | null;
  tempoOverride: number | null;
  metronomeEnabled: boolean;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onTempoChange: (bpm: number) => void;
  onSeek: (beat: number) => void;
  onToggleMetronome: () => void;
  onMixerChange?: (state: MixerState) => void;
  // Note editing
  noteInputMode: boolean;
  chordInputMode: boolean;
  stepInputKeyboardMode: boolean;
  inputByDurationMode: boolean;
  preparedDurationPitchLabel: string;
  midiInputEnabled: boolean;
  midiInputStatus: MidiInputStatus;
  midiInputDevices: string[];
  inputAuditionEnabled: boolean;
  microphoneInputEnabled: boolean;
  microphoneInputStatus: MicrophoneInputStatus;
  microphoneDetectedPitchLabel: string;
  microphoneDetectedSoundingPitchLabel: string;
  microphoneSignalLevelDb: number;
  microphoneSignalQuality: MicrophoneSignalQuality;
  microphoneInputDevices: MicrophoneInputDevice[];
  microphoneSelectedDeviceId: string;
  microphoneDetectionMode: MicrophoneDetectionMode;
  microphoneInstrumentMode: MicrophoneInstrumentMode;
  microphoneInputProfile?: InstrumentInputProfile;
  microphoneAmpInputChoice?: AmpInputChoiceReason | null;
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
  onChangeActivePitch: (step: string, addToChord?: boolean) => void;
  onChangeActiveOctave: (direction: 1 | -1) => void;
  onToggleNoteInput: () => void;
  onToggleEntryMode: () => void;
  onToggleChordInputMode: () => void;
  onToggleStepInputKeyboardMode: () => void;
  onToggleInputByDurationMode: () => void;
  onToggleMidiInput: () => void;
  onToggleInputAudition: () => void;
  onToggleMicrophoneInput: () => void;
  onSelectMicrophoneInput: (deviceId: string) => void;
  onSelectMicrophoneDetectionMode: (mode: MicrophoneDetectionMode) => void;
  onSelectMicrophoneInstrumentMode: (mode: MicrophoneInstrumentMode) => void;
  onSelectMicrophoneInputProfile?: (profile: InstrumentInputProfile) => void;
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
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onToggleArticulation: (a: ArticulationKind) => void;
  onAddDynamic: (d: DynamicKind) => void;
  onSetBarline: (b: BarlineKind) => void;
  onToggleSlur: () => void;
  onAddGraceNote: () => void;
  onAddTuplet: (tuplet: TupletNumber) => void;
  onAddInterval: (interval: DiatonicIntervalNumber) => void;
  onLayoutCleanup: () => void;
  layoutCleanupLoading: boolean;
  showNoteInputTools?: boolean;
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function IconUndo() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 10h11a5 5 0 0 1 5 5v2" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 6l-4 4 4 4" />
    </svg>
  );
}

function IconRedo() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20 10H9a5 5 0 0 0-5 5v2" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 6l4 4-4 4" />
    </svg>
  );
}

function IconPlay() {
  return (
    <svg className="h-4 w-4 translate-x-[1px]" fill="currentColor" viewBox="0 0 24 24">
      <path d="M8 5.6a1 1 0 0 1 1.55-.83l9.15 6a1 1 0 0 1 0 1.67l-9.15 6A1 1 0 0 1 8 17.6V5.6z" />
    </svg>
  );
}

function IconPause() {
  return (
    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
      <rect x="6.5" y="5" width="3.6" height="14" rx="1.3" />
      <rect x="13.9" y="5" width="3.6" height="14" rx="1.3" />
    </svg>
  );
}

function IconStop() {
  return (
    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}

function IconMetronome() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.5 3h7l3.5 18H5L8.5 3z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6" />
      <line x1="12" y1="4.5" x2="16.5" y2="14" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconSparkles() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M11 3l1.85 4.15L17 9l-4.15 1.85L11 15l-1.85-4.15L5 9l4.15-1.85L11 3z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M18.5 14l.9 2.1L21.5 17l-2.1.9L18.5 20l-.9-2.1L15.5 17l2.1-.9L18.5 14z" />
    </svg>
  );
}

function IconSpinner() {
  return (
    <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" d="M12 3a9 9 0 1 1-9 9" />
    </svg>
  );
}

// ─── Primitives ───────────────────────────────────────────────────────────────

function Divider() {
  return <div className="nex-brand-divider mx-1 h-5 w-px shrink-0" aria-hidden />;
}

function ToolBtn({
  onClick, disabled, title, active, children, disabledReason, ariaLabel,
}: {
  onClick?: () => void;
  disabled?: boolean;
  title: string;
  active?: boolean;
  children: React.ReactNode;
  disabledReason?: string;
  ariaLabel?: string;
}) {
  const resolvedTitle = disabled && disabledReason ? `${title} - ${disabledReason}` : title;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={resolvedTitle}
      aria-label={ariaLabel ?? resolvedTitle}
      className={`h-8 w-8 flex items-center justify-center rounded-md transition-colors shrink-0 ${
        disabled
          ? 'cursor-not-allowed text-slate-300'
          : active
            ? 'nex-brand-active'
            : 'nex-brand-button'
      }`}
    >
      {children}
    </button>
  );
}

function Group({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-0.5 shrink-0">{children}</div>;
}

function accidentalSuffix(alter: number) {
  if (alter === 2) return '𝄪';
  if (alter === 1) return '♯';
  if (alter === -1) return '♭';
  if (alter === -2) return '𝄫';
  return '';
}

function partLabelForSelection(coreDocument: ScoreDocumentModel | null, selectedNote: SelectedNote) {
  const part = coreDocument?.score.parts.find((candidate) => (
    (selectedNote.corePartId && candidate.id === selectedNote.corePartId)
    || candidate.staves.some((staff) => staff.measures.some((measure) => measure.id === selectedNote.coreMeasureId))
  )) ?? null;
  return part?.abbreviation ?? part?.name ?? selectedNote.corePartId ?? null;
}

type Translate = (key: TranslationKey, values?: Record<string, string | number>) => string;

/** Value of the selected event as the document holds it (the rendered note does not always carry it). */
function selectedEventValue(coreDocument: ScoreDocumentModel | null, selectedNote: SelectedNote) {
  if (coreDocument && selectedNote.coreEntityId) {
    for (const part of coreDocument.score.parts) {
      for (const staff of part.staves) {
        const measure = staff.measures.find((entry) => entry.id === selectedNote.coreMeasureId)
          ?? (staff.staffIndex === selectedNote.staffIndex ? staff.measures.find((entry) => entry.measureNumber === selectedNote.measureNumber) : undefined);
        for (const voice of measure?.voices ?? []) {
          const event = voice.events.find((entry) => entry.id === selectedNote.coreEntityId);
          if (event) return { durationType: event.durationType ?? null, isDotted: Boolean(event.isDotted) };
        }
      }
    }
  }
  return { durationType: selectedNote.durationType ?? null, isDotted: Boolean(selectedNote.isDotted) };
}

/**
 * The selection in a musician's words: bar and beat, pitch, value, then part, staff and voice (O4 in
 * docs/note-entry-mastery-ledger.md; it used to end in a raw onset fraction such as `0/16`).
 */
export function describeSelectionStatus(coreDocument: ScoreDocumentModel | null, selectedNote: SelectedNote | null, t: Translate) {
  if (!selectedNote) return null;
  const position = describePosition(coreDocument, selectedNote);
  const pitch = selectedNote.isRest
    ? t('status.rest')
    : `${selectedNote.step}${accidentalSuffix(selectedNote.alter)}${selectedNote.octave}`;
  const value = selectedEventValue(coreDocument, selectedNote);
  const valueKey = durationLabelKey(value.durationType);
  const valueName = valueKey ? t(`note.duration.${valueKey}` as TranslationKey).replace(/\s*\([^)]*\)\s*$/, '') : null;
  const valueLabel = valueName ? (value.isDotted ? `${valueName}, ${t('status.dotted')}` : valueName) : null;
  const staffCount = coreDocument?.score.parts.find((part) => (
    !selectedNote.corePartId || part.id === selectedNote.corePartId || part.sourcePartId === selectedNote.corePartId
  ))?.staves.length ?? 1;
  const guitarLabel = selectedNote.guitar
    ? `String ${selectedNote.guitar.string} · Fret ${selectedNote.guitar.fret}`
    : null;
  const text = [
    t('status.position', position),
    pitch,
    valueLabel,
    partLabelForSelection(coreDocument, selectedNote),
    staffCount > 1 ? `${t('status.staff')} ${selectedNote.staffIndex}` : null,
    `${t('note.voice')} ${inputVoiceOf(selectedNote.voiceId)}`,
    guitarLabel,
  ].filter(Boolean).join(' · ');
  return { text, bar: position.bar, beat: position.beat, pitch, value: value.durationType ?? '', dotted: value.isDotted };
}

export default function NotationToolbar({
  playbackState, currentMeasure, totalBeats, currentBeat, playbackTransport = null, midiLoading,
  playbackError, tempoOverride, metronomeEnabled, onPlay, onPause, onStop, onTempoChange, onSeek, onToggleMetronome, onMixerChange,
  noteInputMode, chordInputMode, stepInputKeyboardMode, inputByDurationMode, preparedDurationPitchLabel, midiInputEnabled, midiInputStatus, midiInputDevices, inputAuditionEnabled, microphoneInputEnabled, microphoneInputStatus, microphoneDetectedPitchLabel, microphoneDetectedSoundingPitchLabel, microphoneSignalLevelDb, microphoneSignalQuality, microphoneInputDevices, microphoneSelectedDeviceId, microphoneDetectionMode, microphoneInstrumentMode, microphoneInputProfile = 'microphone', microphoneAmpInputChoice = null, leadsheetMode, selectedDuration, selectedAccidental, isDotted, selectedVoice,
  guitarInputMode, selectedGuitarString, selectedGuitarFret, selectedGuitarTuning, guitarFretBuffer,
  entryMode, selectedNote, selectedBarlineMeasureNumber = null, onChangeActivePitch, onChangeActiveOctave, onToggleNoteInput, onToggleEntryMode, onToggleChordInputMode, onToggleStepInputKeyboardMode, onToggleInputByDurationMode, onToggleMidiInput, onToggleInputAudition, onToggleMicrophoneInput, onSelectMicrophoneInput, onSelectMicrophoneDetectionMode, onSelectMicrophoneInstrumentMode, onSelectMicrophoneInputProfile, onToggleLeadsheetMode, onToggleGuitarInputMode, onInsertGuitarFret, onGuitarTuningChange, onToggleGuitarTechnique, onDurationChange, onAccidentalChange,
  onToggleDotted, onVoiceChange, onInsertRest, onInsertSlash, onFillSlashMeasure, onInsertStepInputPitch, onSetChordSymbol, onDeleteNote,
  onCopySelection, onCutSelection, onPasteClipboard, clipboardCount,
  canUndo, canRedo, onUndo, onRedo,
  onToggleArticulation, onAddDynamic, onSetBarline, onToggleSlur, onAddGraceNote, onAddTuplet, onAddInterval,
  onLayoutCleanup, layoutCleanupLoading, coreDocument, showNoteInputTools = true,
}: Props) {
  const { t } = useI18n();
  const isPlaying = playbackState === 'playing';
  const isPaused  = playbackState === 'paused';
  const isStopped = playbackState === 'stopped';
  const playRestartsSelection = isPlaying && Boolean(selectedNote);
  const showPlaybackProgress = totalBeats > 0 && (isPlaying || isPaused || Boolean(selectedNote));
  const displayTempo = tempoOverride ?? 120;
  const progress = totalBeats > 0 ? Math.min(1, currentBeat / totalBeats) : 0;
  const progressFillRef = useRef<HTMLDivElement | null>(null);
  const followsTransport = isPlaying && Boolean(playbackTransport) && totalBeats > 0;
  useEffect(() => {
    // React publishes the position once per measure while playing; draw the bar per frame.
    if (!followsTransport || !playbackTransport) return;
    let frame = 0;
    let lastWidth = '';
    const draw = () => {
      const position = playbackTransport.read();
      const fill = progressFillRef.current;
      if (position && fill) {
        const width = `${(Math.min(1, Math.max(0, position.location.beats / totalBeats)) * 100).toFixed(2)}%`;
        if (width !== lastWidth) {
          fill.style.width = width;
          lastWidth = width;
        }
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [followsTransport, playbackTransport, totalBeats]);
  const selectionDescription = describeSelectionStatus(coreDocument, selectedNote, t);
  const selectionStatus = selectionDescription?.text ?? null;
  const toolbarStatus = (isPlaying || isPaused)
    ? `${t('toolbar.measure')} ${currentMeasure}`
    : selectionStatus ?? t('toolbar.ready');
  const undoDisabledReason = !canUndo ? t('command.disabled.undoEmpty') : undefined;
  const redoDisabledReason = !canRedo ? t('command.disabled.redoEmpty') : undefined;
  const playDisabledReason = midiLoading ? t('command.disabled.midiLoading') : undefined;
  const stopDisabledReason = isStopped ? t('command.disabled.alreadyStopped') : undefined;
  const layoutDisabledReason = layoutCleanupLoading ? t('command.disabled.layoutLoading') : undefined;
  const playButtonTitle = midiLoading
    ? t('toolbar.preparing')
    : playRestartsSelection || !isPlaying
      ? t('toolbar.play')
      : t('toolbar.pause');
  const microphoneSignalLabel = microphoneSignalQuality === 'silent'
    ? 'No input signal'
    : microphoneSignalQuality === 'too-low'
      ? 'Input too low'
      : microphoneSignalQuality === 'too-high'
        ? 'Input too high'
        : 'Signal good';
  const microphoneIdleLabel = microphoneSignalQuality === 'silent'
    ? 'NO INPUT'
    : microphoneSignalQuality === 'too-low'
      ? 'INPUT LOW'
      : microphoneSignalQuality === 'too-high'
        ? 'INPUT HIGH'
        : `REC ${Math.round(microphoneSignalLevelDb)} dB`;
  const microphoneSelectedDeviceLabel = microphoneInputDevices
    .find((device) => device.deviceId === microphoneSelectedDeviceId)?.label ?? '';
  const microphoneAmpInputHint = microphoneInputProfile !== 'guitar-amp'
    ? ''
    : microphoneAmpInputChoice === 'spark'
      ? t('instrumentRecord.amp.autoSelected', { name: microphoneSelectedDeviceLabel || 'Spark' })
      : microphoneAmpInputChoice === 'several-sparks'
        ? t('instrumentRecord.amp.severalSparks')
        : microphoneAmpInputChoice === 'not-found'
          ? t('instrumentRecord.amp.chooseInput')
          : '';

  return (
    <div className="nex-brand-toolbar relative shrink-0 select-none border-b px-3 py-2" data-testid="notation-toolbar">

      {/* Main row */}
      <div className="flex items-center gap-1 overflow-x-auto">

        {/* History */}
        <Group>
          <ToolBtn
            onClick={onUndo}
            disabled={!canUndo}
            title={t('toolbar.undo')}
            disabledReason={undoDisabledReason}
          >
            <IconUndo />
          </ToolBtn>
          <ToolBtn
            onClick={onRedo}
            disabled={!canRedo}
            title={t('toolbar.redo')}
            disabledReason={redoDisabledReason}
          >
            <IconRedo />
          </ToolBtn>
        </Group>

        <Divider />

        {/* Playback */}
        <Group>
          <ToolBtn
            onClick={playRestartsSelection || !isPlaying ? onPlay : onPause}
            disabled={midiLoading}
            title={playButtonTitle}
            active={isPlaying && !playRestartsSelection}
            disabledReason={playDisabledReason}
          >
            {midiLoading ? <IconSpinner /> : isPlaying && !playRestartsSelection ? <IconPause /> : <IconPlay />}
          </ToolBtn>
          <ToolBtn
            onClick={onStop}
            disabled={isStopped}
            title={t('toolbar.stop')}
            disabledReason={stopDisabledReason}
            ariaLabel={isStopped ? t('toolbar.stop') : undefined}
          >
            <IconStop />
          </ToolBtn>
          <ToolBtn onClick={onToggleMetronome} title={metronomeEnabled ? t('toolbar.metronomeOn') : t('toolbar.metronomeOff')} active={metronomeEnabled}>
            <IconMetronome />
          </ToolBtn>
        </Group>

        <Divider />

        {/* Tempo */}
        <div className="hidden sm:flex items-center gap-2 h-8 px-2 shrink-0">
          <span className="text-[11px] text-slate-500">♩=</span>
          <input
            type="range"
            min={40}
            max={220}
            value={displayTempo}
            onChange={e => onTempoChange(Number(e.target.value))}
            className="h-1 w-20 cursor-pointer accent-nex-accent"
            title={`Tempo: ${displayTempo} BPM`}
          />
          <span className="w-7 text-[11px] font-semibold tabular-nums text-slate-700">{displayTempo}</span>
        </div>

        {onMixerChange && coreDocument && (
          <PlaybackMixer parts={coreDocument.score.parts} onChange={onMixerChange} />
        )}

        <Divider />

        {/* Status */}
        <div
          className="min-w-[96px] max-w-[380px] shrink truncate px-1 text-[11px] font-medium text-slate-500"
          title={toolbarStatus}
          data-testid="selection-status"
          data-status-bar={selectionDescription?.bar ?? ''}
          data-status-beat={selectionDescription?.beat ?? ''}
          data-status-pitch={selectionDescription?.pitch ?? ''}
          data-status-value={selectionDescription?.value ?? ''}
          data-status-dotted={selectionDescription?.dotted ? 'true' : 'false'}
        >
          {toolbarStatus}
        </div>
        {isStopped && selectionStatus && (
          <div className="shrink-0 px-1 text-[11px] font-medium text-slate-400">
            {t('toolbar.ready')}
          </div>
        )}

        <div className="flex-1" />

        {/* Note Input toggle */}
        <button
          onClick={onToggleNoteInput}
          title={t('toolbar.noteInputTitle')}
          className={`h-8 flex items-center gap-1.5 px-3 rounded-md text-xs font-medium transition-colors shrink-0 ${
            noteInputMode
              ? 'nex-brand-active'
              : 'nex-brand-button'
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${noteInputMode ? 'bg-white' : 'bg-slate-400'}`} />
          {t('toolbar.noteInput')}
        </button>
        <button
          type="button"
          data-testid="instrument-record-toggle"
          onClick={onToggleMicrophoneInput}
          disabled={microphoneInputStatus === 'requesting' || microphoneInputStatus === 'unsupported'}
          aria-pressed={microphoneInputEnabled}
          title={[
            microphoneInputEnabled ? 'Stop microphone Instrument Record' : 'Start microphone Instrument Record',
            microphoneDetectionMode === 'single'
              ? 'Choose a note value with 1–9; every played pitch advances automatically'
              : microphoneDetectionMode === 'strum'
                ? 'Choose a note value with 1–9; every strummed chord is written at once and advances automatically'
                : 'Play chord tones one by one at the same position; press Right Arrow to advance',
            microphoneInputStatus === 'requesting' ? 'Requesting microphone access…' : null,
            microphoneInputStatus === 'listening' ? 'Listening to the microphone' : null,
            microphoneInputStatus === 'denied' ? 'Microphone access was denied; click to retry' : null,
            microphoneInputStatus === 'unsupported' ? 'Microphone input is not supported in this environment' : null,
            microphoneInputStatus === 'error' ? 'Microphone input could not be started; click to retry' : null,
            microphoneDetectedPitchLabel ? `Written: ${microphoneDetectedPitchLabel}` : null,
            microphoneInstrumentMode === 'guitar' && microphoneDetectedSoundingPitchLabel
              ? `Sounding: ${microphoneDetectedSoundingPitchLabel}`
              : null,
            microphoneInputEnabled ? `Input level: ${Math.round(microphoneSignalLevelDb)} dB` : null,
            microphoneInputEnabled ? microphoneSignalLabel : null,
          ].filter(Boolean).join('\n')}
          className={`h-8 flex items-center gap-1.5 rounded-md border px-3 text-xs font-semibold tracking-wide transition-colors shrink-0 ${
            microphoneInputEnabled
              ? 'border-red-500 bg-red-500 text-white shadow-[0_0_0_2px_rgba(239,68,68,0.12)]'
              : microphoneInputStatus === 'requesting' || microphoneInputStatus === 'unsupported'
                ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                : 'border-red-200 bg-red-50 text-red-700 hover:border-red-300 hover:bg-red-100'
          }`}
        >
          <span
            aria-hidden
            className={`h-2 w-2 rounded-full ${
              microphoneInputEnabled ? 'bg-white shadow-[0_0_6px_rgba(255,255,255,0.9)]' : 'bg-red-500'
            }`}
          />
          {microphoneInputEnabled && microphoneDetectedPitchLabel
            ? `REC ${microphoneDetectedPitchLabel}`
            : microphoneInputEnabled
              ? microphoneIdleLabel
              : 'MIC REC'}
        </button>
        {microphoneInputEnabled ? (
          <>
            <span
              data-testid="microphone-signal-status"
              className={`whitespace-nowrap text-[11px] font-medium ${
                microphoneSignalQuality === 'good'
                  ? 'text-emerald-700'
                  : microphoneSignalQuality === 'too-low' || microphoneSignalQuality === 'too-high'
                    ? 'text-amber-700'
                    : 'text-red-700'
              }`}
            >
              {microphoneSignalLabel} · {Math.round(microphoneSignalLevelDb)} dB
            </span>
            {onSelectMicrophoneInputProfile ? (
              <select
                aria-label={t('instrumentRecord.profile.label')}
                data-testid="instrument-record-profile"
                title={t('instrumentRecord.profile.title')}
                value={microphoneInputProfile}
                onChange={(event) => onSelectMicrophoneInputProfile(event.target.value as InstrumentInputProfile)}
                className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700"
              >
                <option value="microphone">{t('instrumentRecord.profile.microphone')}</option>
                <option value="guitar-amp">{t('instrumentRecord.profile.guitarAmp')}</option>
              </select>
            ) : null}
            {microphoneAmpInputHint ? (
              <span
                data-testid="instrument-record-amp-hint"
                className={`max-w-48 truncate whitespace-nowrap text-[11px] font-medium ${
                  microphoneAmpInputChoice === 'spark' ? 'text-emerald-700' : 'text-amber-700'
                }`}
                title={microphoneAmpInputHint}
              >
                {microphoneAmpInputHint}
              </span>
            ) : null}
            <select
              aria-label="Pitch recognition mode"
              title={formatShortcutHint(microphoneInputProfile === 'guitar-amp'
                ? "Single notes advance automatically; Build chord collects individually played tones until Right Arrow; Strummed chord writes up to six strings played together and advances; Alt/Option+C switches modes"
                : "Single notes advance automatically; Build chord collects individually played tones until Right Arrow; Alt/Option+C switches modes")}
              value={microphoneDetectionMode}
              onChange={(event) => onSelectMicrophoneDetectionMode(event.target.value as MicrophoneDetectionMode)}
              className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700"
            >
              <option value="single">Single notes · auto → · ⌥C</option>
              <option value="chord">Build chord · manual → · ⌥C</option>
              {microphoneInputProfile === 'guitar-amp' ? (
                <option value="strum">Strummed chord · auto → · ⌥C</option>
              ) : null}
            </select>
            <select
              aria-label="Instrument transposition"
              title="Guitar mode writes every sounding pitch one octave higher"
              value={microphoneInstrumentMode}
              onChange={(event) => onSelectMicrophoneInstrumentMode(event.target.value as MicrophoneInstrumentMode)}
              className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700"
            >
              <option value="concert">Concert pitch</option>
              <option value="guitar">Guitar · written +8va</option>
            </select>
          </>
        ) : null}
        {microphoneInputEnabled && microphoneInputDevices.length > 1 ? (
          <select
            aria-label="Microphone input"
            title="Choose the microphone used for Instrument Record"
            value={microphoneSelectedDeviceId}
            onChange={(event) => onSelectMicrophoneInput(event.target.value)}
            className="h-8 max-w-40 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700"
          >
            {microphoneInputDevices.map((device) => (
              <option key={device.deviceId} value={device.deviceId}>{device.label}</option>
            ))}
          </select>
        ) : null}
        <button
          onClick={onToggleLeadsheetMode}
          title={leadsheetMode ? t('toolbar.leadOn') : t('toolbar.leadOff')}
          className={`h-8 flex items-center gap-1.5 px-3 rounded-md text-xs font-medium transition-colors shrink-0 ${
            leadsheetMode
              ? 'nex-brand-active'
              : 'nex-brand-button'
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${leadsheetMode ? 'bg-white' : 'bg-slate-400'}`} />
          {t('toolbar.lead')}
        </button>

        <Divider />

        {/* Layout cleanup */}
        <button
          onClick={onLayoutCleanup}
          disabled={layoutCleanupLoading}
          title={layoutCleanupLoading ? `${t('toolbar.layoutTitle')} - ${layoutDisabledReason}` : t('toolbar.layoutTitle')}
          aria-label={layoutCleanupLoading ? `${t('toolbar.layoutTitle')} - ${layoutDisabledReason}` : t('toolbar.layoutTitle')}
          className={`h-8 flex items-center gap-1.5 px-3 rounded-md text-xs font-medium transition-colors shrink-0 ${
            layoutCleanupLoading
              ? 'cursor-wait text-slate-400'
              : 'nex-brand-button'
          }`}
        >
          {layoutCleanupLoading ? <IconSpinner /> : <IconSparkles />}
          {t('toolbar.layout')}
        </button>
      </div>

      {/* Playback progress bar. It lies over the toolbar's bottom edge and takes no room of its own:
          it appears with a selection or playback, and the score below must not move then (F2 in
          docs/note-entry-mastery-ledger.md: a click landed two staff steps off its preview). */}
      {showPlaybackProgress && (
        <div
          data-testid="playback-progress-bar"
          className="absolute inset-x-3 bottom-0.5 h-1 cursor-pointer overflow-hidden rounded-full bg-nex-border"
          onClick={e => {
            const rect = e.currentTarget.getBoundingClientRect();
            const ratio = (e.clientX - rect.left) / rect.width;
            onSeek(ratio * totalBeats);
          }}
        >
          <div
            ref={progressFillRef}
            data-testid="playback-progress-fill"
            className="h-full rounded-full bg-nex-accent transition-none"
            style={followsTransport ? undefined : { width: `${progress * 100}%` }}
          />
        </div>
      )}

      {playbackError && (
        <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {t('toolbar.playbackFailed')}: {playbackError}
        </div>
      )}

      {showNoteInputTools && (
        <NoteInputToolbar
          coreDocument={coreDocument}
          noteInputMode={noteInputMode}
          chordInputMode={chordInputMode}
          stepInputKeyboardMode={stepInputKeyboardMode}
          inputByDurationMode={inputByDurationMode}
          preparedDurationPitchLabel={preparedDurationPitchLabel}
          midiInputEnabled={midiInputEnabled}
          midiInputStatus={midiInputStatus}
          midiInputDevices={midiInputDevices}
          inputAuditionEnabled={inputAuditionEnabled}
          leadsheetMode={leadsheetMode}
          guitarInputMode={guitarInputMode}
          selectedGuitarString={selectedGuitarString}
          selectedGuitarFret={selectedGuitarFret}
          selectedGuitarTuning={selectedGuitarTuning}
          guitarFretBuffer={guitarFretBuffer}
          selectedDuration={selectedDuration}
          selectedAccidental={selectedAccidental}
          isDotted={isDotted}
          selectedVoice={selectedVoice}
          entryMode={entryMode}
          selectedNote={selectedNote}
          selectedBarlineMeasureNumber={selectedBarlineMeasureNumber}
          onChangeActivePitch={onChangeActivePitch}
          onChangeActiveOctave={onChangeActiveOctave}
          onToggleEntryMode={onToggleEntryMode}
          onToggleChordInputMode={onToggleChordInputMode}
          onToggleStepInputKeyboardMode={onToggleStepInputKeyboardMode}
          onToggleInputByDurationMode={onToggleInputByDurationMode}
          onToggleMidiInput={onToggleMidiInput}
          onToggleInputAudition={onToggleInputAudition}
          onToggleLeadsheetMode={onToggleLeadsheetMode}
          onToggleGuitarInputMode={onToggleGuitarInputMode}
          onInsertGuitarFret={onInsertGuitarFret}
          onGuitarTuningChange={onGuitarTuningChange}
          onToggleGuitarTechnique={onToggleGuitarTechnique}
          onDurationChange={(duration) => {
            if (!noteInputMode && !selectedNote) onToggleNoteInput();
            onDurationChange(duration);
          }}
          onAccidentalChange={onAccidentalChange}
          onToggleDotted={onToggleDotted}
          onVoiceChange={onVoiceChange}
          onInsertRest={onInsertRest}
          onInsertSlash={onInsertSlash}
          onFillSlashMeasure={onFillSlashMeasure}
          onInsertStepInputPitch={onInsertStepInputPitch}
          onSetChordSymbol={onSetChordSymbol}
          onDeleteNote={onDeleteNote}
          onCopySelection={onCopySelection}
          onCutSelection={onCutSelection}
          onPasteClipboard={onPasteClipboard}
          clipboardCount={clipboardCount}
          onToggleArticulation={onToggleArticulation}
          onAddDynamic={onAddDynamic}
          onSetBarline={onSetBarline}
          onToggleSlur={onToggleSlur}
          onAddGraceNote={onAddGraceNote}
          onAddTuplet={onAddTuplet}
          onAddInterval={onAddInterval}
        />
      )}
    </div>
  );
}
