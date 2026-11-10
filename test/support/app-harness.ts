import React from 'react';
import { act, create } from 'react-test-renderer';

import { useNoteEditor, type SelectedNote } from '../../hooks/useNoteEditor.ts';
import { useScoreDocument } from '../../hooks/useScoreDocument.ts';
import { keyEvent } from './entry-harness.ts';

/*
 * App-level entry harness: the real useScoreDocument history and the real useNoteEditor hook, wired
 * the way components/NexNoteApp.tsx wires them (command meta carries the selection anchor, history
 * changes restore the selection, Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z go to Undo and Redo before the
 * editor sees the key). Use it for anything that involves Undo, Redo or selection restoration.
 */

export type AppEditor = ReturnType<typeof useNoteEditor>;
export type AppDocument = ReturnType<typeof useScoreDocument>;

export interface AppHarness {
  readonly editor: AppEditor;
  readonly doc: AppDocument;
  readonly xml: string;
  /** Space-separated key tokens as in entry-harness ("N 5 a b", "Cmd+z", "Cmd+Shift+z"). */
  press(script: string): void;
  undo(): void;
  redo(): void;
  click(note: SelectedNote, options?: Parameters<AppEditor['handleNoteClick']>[1]): void;
  rerender(): void;
  unmount(): void;
}

export function mountApp(initialXml: string): AppHarness {
  const editorRef: { current: AppEditor | null } = { current: null };
  const docRef: { current: AppDocument | null } = { current: null };

  function Harness() {
    const doc = useScoreDocument(initialXml);
    docRef.current = doc;
    const editor = useNoteEditor(
      doc.xml,
      doc.coreDocument,
      (commands, meta) => doc.applyCommands(commands, {
        selectionAnchor: meta?.selectionAnchor ?? null,
        undoSelectionAnchor: meta?.undoSelectionAnchor,
        redoSelectionAnchor: meta?.redoSelectionAnchor,
        prepared: meta?.prepared,
      }),
      {},
    );
    editorRef.current = editor;
    const { historyMeta } = doc;
    const { restoreSelection } = editor;
    // Same effect as NexNoteApp: a history change restores the selection it recorded.
    React.useEffect(() => {
      const shouldRestoreEmptySelection = ['undo', 'redo', 'load', 'reset', 'replace'].includes(historyMeta.lastAction ?? '');
      if (historyMeta.currentSelectionAnchor == null && !shouldRestoreEmptySelection) return;
      restoreSelection(historyMeta.currentSelectionAnchor ?? null, historyMeta.lastAction ?? null);
    }, [historyMeta.currentSelectionAnchor, historyMeta.lastAction, historyMeta.lastTransaction?.id, restoreSelection]);
    return null;
  }

  let renderer: ReturnType<typeof create> | null = null;
  act(() => {
    renderer = create(React.createElement(Harness));
  });
  const settle = () => act(() => { renderer?.update(React.createElement(Harness)); });

  const harness: AppHarness = {
    get editor() { return editorRef.current!; },
    get doc() { return docRef.current!; },
    get xml() { return docRef.current!.xml; },
    press(script: string) {
      for (const token of script.trim().split(/\s+/).filter(Boolean)) {
        const lower = token.toLowerCase();
        if (lower === 'cmd+z' || lower === 'ctrl+z') { harness.undo(); continue; }
        if (lower === 'cmd+shift+z' || lower === 'ctrl+shift+z' || lower === 'cmd+y' || lower === 'ctrl+y') { harness.redo(); continue; }
        act(() => { editorRef.current!.handleKeyDown(keyEvent(token)); });
        settle();
      }
    },
    undo() {
      act(() => { docRef.current!.undo(); });
      settle();
    },
    redo() {
      act(() => { docRef.current!.redo(); });
      settle();
    },
    click(note, options) {
      act(() => { editorRef.current!.handleNoteClick(note, options); });
      settle();
    },
    rerender: settle,
    unmount() {
      act(() => { renderer?.unmount(); });
    },
  };
  return harness;
}
