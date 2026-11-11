/*
 * Pending notes (gate 3, step 1 of docs/note-entry-mastery-ledger.md).
 *
 * A note entered in note input is in the document at once, but the score is drawn again from the
 * whole document, which takes longer the larger the score is. Until that drawing lands the editor
 * shows the entered note itself, at the place the caret stood on. The note editor publishes what was
 * entered here; the score view draws it and drops it when the rendering of that revision is there.
 *
 * Memory only. The list is valid for one document revision chain: an entry belongs to the revision
 * its edit produced, and anything else that changes the document (Undo, another command) clears it.
 */

export interface PendingEntryNote {
  coreMeasureId: string | null;
  corePartId: string | null;
  measureNumber: number;
  staffIndex: number;
  voiceId: number;
  timestampNum: number;
  timestampDen: number;
  step: string;
  octave: number;
  alter: number;
  duration: string;
  dotted: boolean;
}

export interface PendingEntry {
  /** Revision of the document that holds this note. */
  revision: number;
  note: PendingEntryNote;
}

let entries: PendingEntry[] = [];
const listeners = new Set<() => void>();

function emit(next: PendingEntry[]) {
  if (next === entries || (next.length === 0 && entries.length === 0)) return;
  entries = next;
  for (const listener of [...listeners]) listener();
}

/** A note was entered and the document of `revision` holds it. */
export function publishPendingEntry(entry: PendingEntry) {
  // Entries of a revision that is not before this one belong to an undone or replaced history.
  emit([...entries.filter((existing) => existing.revision < entry.revision), entry]);
}

/** The rendering of `renderedRevision` is on screen: its notes are drawn by the score itself. */
export function settlePendingEntries(renderedRevision: number) {
  if (entries.some((entry) => entry.revision <= renderedRevision)) {
    emit(entries.filter((entry) => entry.revision > renderedRevision));
  }
}

export function clearPendingEntries() {
  emit([]);
}

export function getPendingEntries(): PendingEntry[] {
  return entries;
}

const NONE: PendingEntry[] = [];
export function getServerPendingEntries(): PendingEntry[] {
  return NONE;
}

export function subscribePendingEntries(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/**
 * The entries to draw for a document: those newer than what is rendered, and only while the newest
 * of them is the document's own revision. A document that moved on by another way has no pending
 * notes.
 */
export function pendingEntriesFor(all: PendingEntry[], documentRevision: number, renderedRevision: number): PendingEntry[] {
  if (all.length === 0 || all[all.length - 1]!.revision !== documentRevision) return NONE;
  const open = all.filter((entry) => entry.revision > renderedRevision);
  return open.length === all.length ? all : open;
}
