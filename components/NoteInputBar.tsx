'use client';

import type { AccidentalChoice, NoteDuration, NoteEntryMode } from '@/hooks/useNoteEditor';
import { AccidentalGlyph, NoteDurationGlyph } from '@/components/NotationGlyphs';
import { useI18n, type TranslationKey } from '@/lib/i18n';
import { formatShortcutHint } from '@/lib/shortcut-hints';

/*
 * The armed state of note input, always in view while note input is on: note value, dot, accidental,
 * voice, entry mode and the tuplet the cursor stands in. Every field is a control. It lives in the
 * toolbar row, which is always there, so showing it never moves the score (F2 and O2 in
 * docs/note-entry-mastery-ledger.md).
 *
 * Tests read the state from `data-armed-field` / `data-armed-value` and act through
 * `data-armed-set`.
 */

const VALUES: Array<{ duration: NoteDuration; name: string; titleKey: TranslationKey }> = [
  { duration: '16', name: '16th', titleKey: 'note.duration.16' },
  { duration: '8', name: 'eighth', titleKey: 'note.duration.8' },
  { duration: '4', name: 'quarter', titleKey: 'note.duration.4' },
  { duration: '2', name: 'half', titleKey: 'note.duration.2' },
  { duration: '1', name: 'whole', titleKey: 'note.duration.1' },
];

/** Values without a button of their own still show, as the armed one. */
const VALUE_NAMES: Record<NoteDuration, { name: string; titleKey: TranslationKey }> = {
  '64': { name: '64th', titleKey: 'note.duration.64' },
  '32': { name: '32nd', titleKey: 'note.duration.32' },
  '16': { name: '16th', titleKey: 'note.duration.16' },
  '8': { name: 'eighth', titleKey: 'note.duration.8' },
  '4': { name: 'quarter', titleKey: 'note.duration.4' },
  '2': { name: 'half', titleKey: 'note.duration.2' },
  '1': { name: 'whole', titleKey: 'note.duration.1' },
  breve: { name: 'breve', titleKey: 'note.duration.breve' },
  long: { name: 'long', titleKey: 'note.duration.long' },
};

const ACCIDENTALS: Array<{ value: Exclude<AccidentalChoice, null>; titleKey: TranslationKey; shortcut: string }> = [
  { value: 'flat', titleKey: 'noteInputBar.flat', shortcut: '-' },
  { value: 'natural', titleKey: 'noteInputBar.natural', shortcut: '=' },
  { value: 'sharp', titleKey: 'noteInputBar.sharp', shortcut: '+' },
];

/** Voice colours, shared with the caret: the four MuseScore voice colours. */
export const VOICE_COLOURS: Record<number, string> = {
  1: '#2563eb',
  2: '#16a34a',
  3: '#ea580c',
  4: '#9333ea',
};

export interface NoteInputBarProps {
  selectedDuration: NoteDuration;
  isDotted: boolean;
  selectedAccidental: AccidentalChoice;
  selectedVoice: 1 | 2 | 3 | 4;
  entryMode: NoteEntryMode;
  /** `3:2` when the cursor stands in a tuplet, else null. */
  tupletLabel: string | null;
  onDurationChange: (duration: NoteDuration) => void;
  onToggleDotted: () => void;
  onAccidentalChange: (accidental: AccidentalChoice) => void;
  onVoiceChange: (voice: 1 | 2 | 3 | 4) => void;
  onToggleEntryMode: () => void;
}

function BarButton({
  title, active, set, onClick, children, colour,
}: {
  title: string;
  active: boolean;
  set: string;
  onClick: () => void;
  children: React.ReactNode;
  colour?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      data-armed-set={set}
      // Keep the keyboard focus on the score: the next key is a note.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={`flex h-7 min-w-7 shrink-0 items-center justify-center rounded-md px-1 text-[11px] font-semibold transition-colors ${
        active ? 'bg-nex-accent-muted text-nex-accent' : 'text-slate-500 hover:bg-nex-surface'
      }`}
      style={active && colour ? { color: colour, backgroundColor: `${colour}1f` } : undefined}
    >
      {children}
    </button>
  );
}

export default function NoteInputBar({
  selectedDuration, isDotted, selectedAccidental, selectedVoice, entryMode, tupletLabel,
  onDurationChange, onToggleDotted, onAccidentalChange, onVoiceChange, onToggleEntryMode,
}: NoteInputBarProps) {
  const { t } = useI18n();
  const armedValue = VALUE_NAMES[selectedDuration];
  const hasOwnButton = VALUES.some((entry) => entry.duration === selectedDuration);
  const modeLabel = entryMode === 'overwrite' ? t('noteInputBar.modeReplace') : t('noteInputBar.modeStandard');

  return (
    <div
      role="group"
      aria-label={t('noteInputBar.label')}
      data-testid="note-input-bar"
      className="ml-1 flex shrink-0 items-center gap-0.5 rounded-lg border border-nex-border bg-white px-1 py-0.5"
    >
      <div className="flex items-center" data-armed-field="value" data-armed-value={armedValue.name}>
        {!hasOwnButton && (
          <BarButton title={t(armedValue.titleKey)} active set={`value:${armedValue.name}`} onClick={() => onDurationChange(selectedDuration)}>
            <NoteDurationGlyph duration={selectedDuration} className="h-[18px] w-[18px]" />
          </BarButton>
        )}
        {VALUES.map((entry) => (
          <BarButton
            key={entry.duration}
            title={t(entry.titleKey)}
            active={selectedDuration === entry.duration}
            set={`value:${entry.name}`}
            onClick={() => onDurationChange(entry.duration)}
          >
            <NoteDurationGlyph duration={entry.duration} className="h-[18px] w-[18px]" />
          </BarButton>
        ))}
      </div>
      <div className="flex items-center" data-armed-field="dot" data-armed-value={isDotted ? 'on' : 'off'}>
        <BarButton title={t('note.dotted')} active={isDotted} set="dot:toggle" onClick={onToggleDotted}>
          <span className="text-base leading-none">•</span>
        </BarButton>
      </div>
      <span aria-hidden className="mx-0.5 h-4 w-px bg-nex-border" />
      <div className="flex items-center" data-armed-field="accidental" data-armed-value={selectedAccidental ?? 'none'}>
        {selectedAccidental && !ACCIDENTALS.some((entry) => entry.value === selectedAccidental) && (
          <BarButton title={selectedAccidental} active set={`accidental:${selectedAccidental}`} onClick={() => onAccidentalChange(null)}>
            <AccidentalGlyph accidental={selectedAccidental} className="h-4 w-4" />
          </BarButton>
        )}
        {ACCIDENTALS.map((entry) => (
          <BarButton
            key={entry.value}
            title={`${t(entry.titleKey)} (${formatShortcutHint(entry.shortcut)})`}
            active={selectedAccidental === entry.value}
            set={`accidental:${entry.value}`}
            onClick={() => onAccidentalChange(selectedAccidental === entry.value ? null : entry.value)}
          >
            <AccidentalGlyph accidental={entry.value} className="h-4 w-4" />
          </BarButton>
        ))}
      </div>
      <span aria-hidden className="mx-0.5 h-4 w-px bg-nex-border" />
      <div className="flex items-center" data-armed-field="voice" data-armed-value={String(selectedVoice)}>
        {([1, 2, 3, 4] as const).map((voice) => (
          <BarButton
            key={voice}
            title={`${t('note.voice')} ${voice} (${formatShortcutHint(`Cmd/Ctrl+Alt/Option+${voice}`)})`}
            active={selectedVoice === voice}
            set={`voice:${voice}`}
            onClick={() => onVoiceChange(voice)}
            colour={VOICE_COLOURS[voice]}
          >
            {voice}
          </BarButton>
        ))}
      </div>
      <span aria-hidden className="mx-0.5 h-4 w-px bg-nex-border" />
      <div className="flex items-center" data-armed-field="mode" data-armed-value={entryMode}>
        <BarButton
          title={`${t('noteInputBar.modeTitle')}: ${modeLabel} (I)`}
          active={entryMode === 'overwrite'}
          set="mode:toggle"
          onClick={onToggleEntryMode}
        >
          <span className="px-1">{modeLabel}</span>
        </BarButton>
      </div>
      <div
        className="flex items-center px-1 text-[11px] font-semibold text-slate-500"
        data-armed-field="tuplet"
        data-armed-value={tupletLabel ?? 'none'}
        title={tupletLabel ? `${t('noteInputBar.tuplet')} ${tupletLabel}` : t('noteInputBar.noTuplet')}
      >
        {tupletLabel ?? '–'}
      </div>
    </div>
  );
}
