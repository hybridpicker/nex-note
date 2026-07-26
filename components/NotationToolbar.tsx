'use client';

import NoteInputToolbar from '@/components/NoteInputToolbar';
import { useI18n } from '@/lib/i18n';
import type { PlaybackState } from '@/hooks/usePlayback';
import type { NoteDuration, AccidentalChoice, NoteEntryMode, SelectedNote, ArticulationKind, BarlineKind, DynamicKind, GuitarTechniqueKind, TupletNumber } from '@/hooks/useNoteEditor';
import type { GuitarTuningId } from '@/src/score-input/guitar-fretboard';
import type { ScoreDocumentModel } from '@/src/score-core/model/types';
import type { MidiInputStatus } from '@/hooks/useMidiInput';
import type { DiatonicIntervalNumber } from '@/src/score-input/staff-pitch';

interface Props {
  // Playback
  playbackState: PlaybackState;
  currentMeasure: number;
  totalBeats: number;
  currentBeat: number;
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
  // Note editing
  noteInputMode: boolean;
  chordInputMode: boolean;
  stepInputKeyboardMode: boolean;
  inputByDurationMode: boolean;
  preparedDurationPitchLabel: string;
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
  onChangeActivePitch: (step: string, addToChord?: boolean) => void;
  onChangeActiveOctave: (direction: 1 | -1) => void;
  onToggleNoteInput: () => void;
  onToggleEntryMode: () => void;
  onToggleChordInputMode: () => void;
  onToggleStepInputKeyboardMode: () => void;
  onToggleInputByDurationMode: () => void;
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
  if (alter === 2) return 'x';
  if (alter === 1) return '#';
  if (alter === -1) return 'b';
  if (alter === -2) return 'bb';
  return '';
}

function partLabelForSelection(coreDocument: ScoreDocumentModel | null, selectedNote: SelectedNote) {
  const part = coreDocument?.score.parts.find((candidate) => (
    (selectedNote.corePartId && candidate.id === selectedNote.corePartId)
    || candidate.staves.some((staff) => staff.measures.some((measure) => measure.id === selectedNote.coreMeasureId))
  )) ?? null;
  return part?.abbreviation ?? part?.name ?? selectedNote.corePartId ?? null;
}

function formatSelectionStatus(coreDocument: ScoreDocumentModel | null, selectedNote: SelectedNote | null) {
  if (!selectedNote) return null;
  const noteLabel = selectedNote.isRest
    ? 'Rest'
    : `${selectedNote.step}${accidentalSuffix(selectedNote.alter)}${selectedNote.octave}`;
  const partLabel = partLabelForSelection(coreDocument, selectedNote);
  const guitarLabel = selectedNote.guitar
    ? `String ${selectedNote.guitar.string} · Fret ${selectedNote.guitar.fret}`
    : null;
  return [
    noteLabel,
    partLabel,
    `M${selectedNote.measureNumber}`,
    `Staff ${selectedNote.staffIndex}`,
    `Voice ${selectedNote.voiceId}`,
    `${selectedNote.timestampNum}/${selectedNote.timestampDen}`,
    guitarLabel,
  ].filter(Boolean).join(' · ');
}

export default function NotationToolbar({
  playbackState, currentMeasure, totalBeats, currentBeat, midiLoading,
  playbackError, tempoOverride, metronomeEnabled, onPlay, onPause, onStop, onTempoChange, onSeek, onToggleMetronome,
  noteInputMode, chordInputMode, stepInputKeyboardMode, inputByDurationMode, preparedDurationPitchLabel, midiInputEnabled, midiInputStatus, midiInputDevices, leadsheetMode, selectedDuration, selectedAccidental, isDotted, selectedVoice,
  guitarInputMode, selectedGuitarString, selectedGuitarFret, selectedGuitarTuning, guitarFretBuffer,
  entryMode, selectedNote, selectedBarlineMeasureNumber = null, onChangeActivePitch, onChangeActiveOctave, onToggleNoteInput, onToggleEntryMode, onToggleChordInputMode, onToggleStepInputKeyboardMode, onToggleInputByDurationMode, onToggleMidiInput, onToggleLeadsheetMode, onToggleGuitarInputMode, onInsertGuitarFret, onGuitarTuningChange, onToggleGuitarTechnique, onDurationChange, onAccidentalChange,
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
  const selectionStatus = formatSelectionStatus(coreDocument, selectedNote);
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

  return (
    <div className="nex-brand-toolbar shrink-0 select-none border-b px-3 py-2" data-testid="notation-toolbar">

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

        <Divider />

        {/* Status */}
        <div
          className="min-w-[96px] max-w-[210px] shrink-0 truncate px-1 text-[11px] font-medium text-slate-500"
          title={toolbarStatus}
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
          onClick={onToggleMidiInput}
          disabled={midiInputStatus === 'requesting' || midiInputStatus === 'unsupported'}
          aria-pressed={midiInputEnabled}
          title={[
            midiInputEnabled ? 'Stop Instrument Record' : 'Start Instrument Record (MIDI)',
            'Choose a note value with 1–9, then play one pitch or a chord',
            'Notes arriving within 35 ms are notated as one chord',
            midiInputStatus === 'requesting' ? 'Requesting MIDI access…' : null,
            midiInputStatus === 'waiting' ? 'Waiting for a MIDI input device' : null,
            midiInputStatus === 'denied' ? 'MIDI access was denied; click to retry' : null,
            midiInputStatus === 'unsupported' ? 'Web MIDI is not supported in this browser' : null,
            midiInputStatus === 'error' ? 'MIDI input could not be started; click to retry' : null,
            midiInputDevices.length > 0 ? midiInputDevices.join(', ') : null,
          ].filter(Boolean).join('\n')}
          className={`h-8 flex items-center gap-1.5 rounded-md border px-3 text-xs font-semibold tracking-wide transition-colors shrink-0 ${
            midiInputEnabled
              ? 'border-red-500 bg-red-500 text-white shadow-[0_0_0_2px_rgba(239,68,68,0.12)]'
              : midiInputStatus === 'requesting' || midiInputStatus === 'unsupported'
                ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                : 'border-red-200 bg-red-50 text-red-700 hover:border-red-300 hover:bg-red-100'
          }`}
        >
          <span
            aria-hidden
            className={`h-2 w-2 rounded-full ${
              midiInputEnabled ? 'bg-white shadow-[0_0_6px_rgba(255,255,255,0.9)]' : 'bg-red-500'
            }`}
          />
          REC
        </button>
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

      {/* Playback progress bar */}
      {showPlaybackProgress && (
        <div
          data-testid="playback-progress-bar"
          className="relative mt-2 h-1 cursor-pointer overflow-hidden rounded-full bg-nex-border"
          onClick={e => {
            const rect = e.currentTarget.getBoundingClientRect();
            const ratio = (e.clientX - rect.left) / rect.width;
            onSeek(ratio * totalBeats);
          }}
        >
          <div data-testid="playback-progress-fill" className="h-full rounded-full bg-nex-accent transition-none" style={{ width: `${progress * 100}%` }} />
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
