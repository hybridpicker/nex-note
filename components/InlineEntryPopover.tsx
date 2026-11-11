'use client';

import { useLayoutEffect, useRef, useState } from 'react';

/*
 * The shared inline-entry popover (K4 to K6 in docs/note-entry-mastery-ledger.md): one text field
 * anchored at the caret or selection for lyrics, chord symbols, dynamics and hairpins, tempo, key and
 * time signature, clef, text, rehearsal marks, octave and pedal lines, repeats and barlines.
 *
 * It opens on a key, takes typed text and shows the parsed result before anything is written.
 * `Enter` commits as one Undo step and closes, `Esc` closes without a trace. Chord symbols and lyrics
 * advance from position to position without leaving the field: `Space`, `Tab`, `-`, `_` and the arrow
 * keys commit what is typed and move on, as MuseScore does.
 */

export type InlineEntryAdvance =
  | 'next' | 'previous' | 'nextBar' | 'previousBar' | 'nextBeat' | 'previousBeat'
  | 'hyphen' | 'melisma' | 'verseDown' | 'verseUp'
  | { value: string };

export interface InlineEntryPreview {
  ok: boolean;
  /** The parsed result in words, or why the text is not accepted. */
  text: string;
}

export interface InlineEntryPopoverProps {
  /** `lyrics` and `chord` advance; every other kind commits once. */
  flow: 'single' | 'chord' | 'lyrics';
  kind: string;
  label: string;
  /** Accessible name of the field when it differs from the visible label. */
  ariaLabel?: string;
  /** Short reminder of what can be typed, shown while the field is empty. */
  hint: string;
  placeholder?: string;
  left: number;
  top: number;
  /** Changes whenever the popover moves to another position: the field restarts with `initialValue`. */
  positionKey: string;
  initialValue: string;
  /** Where the popover stands, in words (`Bar 3, beat 2 · verse 1`). */
  positionLabel?: string;
  preview: (text: string) => InlineEntryPreview | null;
  /** Commit the text. `advance` is null for `Enter`. Returns false when the text was not accepted. */
  onCommit: (text: string, advance: InlineEntryAdvance | null) => boolean;
  onCancel: () => void;
}

const VALUE_KEYS: Record<string, string> = { '1': '64', '2': '32', '3': '16', '4': '8', '5': '4', '6': '2', '7': '1' };

export default function InlineEntryPopover(props: InlineEntryPopoverProps) {
  const { flow, kind, label, ariaLabel, hint, placeholder, left, top, positionKey, initialValue, positionLabel, preview, onCommit, onCancel } = props;
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(initialValue);
  const [rejected, setRejected] = useState<string | null>(null);

  // The field restarts when the popover moves to another position. The reset happens in the same
  // render as the move, and the focus in the layout phase, so a key typed right after Space or Tab
  // (fast typing, a key script) lands in the new position and is not cleared afterwards.
  const [shownKey, setShownKey] = useState(positionKey);
  if (shownKey !== positionKey) {
    setShownKey(positionKey);
    setValue(initialValue);
    setRejected(null);
  }
  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    if (input.value) input.select();
  }, [positionKey]);

  const parsed = value.trim() ? preview(value) : null;
  const commit = (advance: InlineEntryAdvance | null) => {
    const current = inputRef.current?.value ?? value;
    const accepted = onCommit(current, advance);
    if (!accepted) setRejected(preview(current)?.text ?? 'Not accepted.');
    return accepted;
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const meta = event.metaKey || event.ctrlKey;
    // The score's shortcuts must not see the keys typed here.
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      commit(null);
      return;
    }
    if (flow === 'single') return;

    const advance = (target: InlineEntryAdvance) => {
      event.preventDefault();
      commit(target);
    };
    if (event.key === 'Tab') return advance(event.shiftKey ? 'previousBar' : 'nextBar');
    if (meta && event.key === 'ArrowRight') return advance('nextBar');
    if (meta && event.key === 'ArrowLeft') return advance('previousBar');
    if (event.key === ' ' && !meta && !event.altKey) return advance(event.shiftKey ? 'previous' : 'next');
    if (flow === 'chord') {
      if (event.key === ';') return advance('nextBeat');
      if (event.key === ':') return advance('previousBeat');
      const digit = /^Digit([1-7])$/.exec(event.code)?.[1] ?? (/^[1-7]$/.test(event.key) ? event.key : null);
      if (meta && digit) return advance({ value: VALUE_KEYS[digit]! });
      return;
    }
    // Lyrics. A real hyphen or space inside a syllable is typed with Alt (MuseScore: Ctrl/Option).
    if (event.key === '-' && !event.altKey && !meta) return advance('hyphen');
    if (event.key === '_' && !event.altKey && !meta) return advance('melisma');
    if (event.key === 'ArrowDown') return advance('verseDown');
    if (event.key === 'ArrowUp') return advance('verseUp');
  };

  const status = rejected ?? (parsed ? parsed.text : hint);
  const statusTone = rejected || (parsed && !parsed.ok) ? 'text-rose-700' : parsed ? 'text-emerald-700' : 'text-slate-500';

  return (
    <div
      className="pointer-events-auto absolute z-30 flex flex-col gap-1 rounded-lg border border-nex-accent bg-white p-1.5 shadow-xl"
      data-testid="inline-entry-popover"
      data-entry-kind={kind}
      data-entry-position={positionKey}
      style={{ left: `${left}px`, top: `${top}px` }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="flex items-center gap-1.5">
        <span className="shrink-0 rounded bg-nex-accent-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-nex-accent">{label}</span>
        <input
          ref={inputRef}
          value={value}
          onChange={(event) => { setValue(event.target.value); setRejected(null); }}
          onKeyDown={onKeyDown}
          aria-label={ariaLabel ?? label}
          aria-describedby="inline-entry-status"
          aria-invalid={Boolean(rejected) || (parsed ? !parsed.ok : false)}
          placeholder={placeholder}
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="off"
          className="h-7 w-40 rounded-md border border-nex-border bg-white px-2 text-xs font-semibold text-nex-ink outline-none focus:border-nex-accent placeholder:font-normal placeholder:text-slate-300"
        />
      </div>
      <div
        id="inline-entry-status"
        data-testid="inline-entry-preview"
        data-entry-ok={parsed ? String(parsed.ok) : ''}
        role="status"
        className={`max-w-[18rem] px-0.5 text-[11px] leading-4 ${statusTone}`}
      >
        {positionLabel && <span className="mr-1 text-slate-400">{positionLabel} ·</span>}
        {status}
      </div>
    </div>
  );
}
