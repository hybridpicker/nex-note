'use client';

import type { SelectedNote } from '@/hooks/useNoteEditor';

type Props = {
  selectedNote: SelectedNote | null;
  onDeleteNote: () => void;
};

function accidentalSymbol(alter: number) {
  if (alter === 2) return '𝄪';
  if (alter === 1) return '♯';
  if (alter === -1) return '♭';
  if (alter === -2) return '𝄫';
  return '';
}

export function formatIpadSelectedNote(selectedNote: SelectedNote) {
  if (selectedNote.isRest) return 'Rest';
  return `${selectedNote.step}${accidentalSymbol(selectedNote.alter)}${selectedNote.octave}`;
}

export default function IpadSelectionActions({ selectedNote, onDeleteNote }: Props) {
  if (!selectedNote) return null;

  const noteLabel = formatIpadSelectedNote(selectedNote);

  return (
    <div
      className="nex-ipad-selection-actions"
      data-testid="ipad-selection-actions"
      role="toolbar"
      aria-label="Selected note actions"
    >
      <span className="nex-ipad-selection-label" aria-live="polite">
        Selected: {noteLabel}
      </span>
      <button
        type="button"
        className="nex-ipad-delete-note"
        data-testid="ipad-delete-note"
        onClick={onDeleteNote}
        aria-label={`Delete selected ${selectedNote.isRest ? 'rest' : 'note'} ${noteLabel}`}
        title="Delete selected note"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 7h14M10 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M7 7l1 13a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2l1-13" />
          <path strokeLinecap="round" d="M10 11v7M14 11v7" />
        </svg>
        <span>Delete note</span>
      </button>
    </div>
  );
}
