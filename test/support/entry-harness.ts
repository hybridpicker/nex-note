import React from 'react';
import { act, create } from 'react-test-renderer';

import { useNoteEditor, type SelectedNote } from '../../hooks/useNoteEditor.ts';
import { applyDocumentCommands, buildDocumentState } from '../../src/score-core/commands/apply-document-commands.ts';
import { importMusicXmlToCore } from '../../src/musicxml-adapter/import/import-musicxml.ts';
import { validateScoreDocument } from '../../src/score-core/validation/validate-score-document.ts';
import type { ScoreCommand } from '../../src/shared/schemas/score-command.ts';

/*
 * Keyboard entry harness for the entry-correctness matrix. It mounts the real useNoteEditor hook
 * on a document state that applies every emitted command batch through the shared semantic
 * pipeline, so each key press produces exactly what the app would commit.
 */

export type EditorHook = ReturnType<typeof useNoteEditor>;

export interface EntryHarness {
  readonly current: EditorHook;
  readonly xml: string;
  readonly batches: ScoreCommand[][];
  press(script: string): void;
  rerender(): void;
  unmount(): void;
}

export function mountEditor(initialXml: string): EntryHarness {
  const ref: { current: EditorHook | null } = { current: null };
  let latestXml = initialXml;
  const batches: ScoreCommand[][] = [];

  function Harness() {
    const [document, setDocument] = React.useState(() => buildDocumentState(initialXml));
    latestXml = document.xml;
    ref.current = useNoteEditor(
      document.xml,
      document.coreDocument,
      (commands) => {
        batches.push(commands);
        setDocument((current) => {
          const next = applyDocumentCommands(current, commands);
          latestXml = next.xml;
          return next;
        });
      },
      {},
    );
    return null;
  }

  let renderer: ReturnType<typeof create> | null = null;
  act(() => {
    renderer = create(React.createElement(Harness));
  });

  const harness: EntryHarness = {
    get current() { return ref.current!; },
    get xml() { return latestXml; },
    get batches() { return batches; },
    press(script: string) {
      for (const token of script.trim().split(/\s+/).filter(Boolean)) {
        act(() => {
          ref.current!.handleKeyDown(keyEvent(token));
        });
        act(() => {
          renderer?.update(React.createElement(Harness));
        });
      }
    },
    rerender() {
      act(() => {
        renderer?.update(React.createElement(Harness));
      });
    },
    unmount() {
      act(() => {
        renderer?.unmount();
      });
    },
  };
  return harness;
}

/**
 * One token per key press: a bare key ("4", "c", ".", "N"), or modifiers joined with "+"
 * ("Cmd+3", "Cmd+Alt+2", "Shift+e"). Digits carry their physical code like a US keyboard.
 */
export function keyEvent(token: string) {
  // "+" alone (sharp) and a trailing "+" ("Shift++") are the plus key, not a separator.
  const parts = token === '+' ? [''] : token.endsWith('++') ? [...token.slice(0, -2).split('+'), '+'] : token.split('+');
  const base = token === '+' ? '+' : parts.pop()!;
  const modifiers = new Set(parts.map((part) => part.toLowerCase()));
  const shift = modifiers.has('shift');
  // US layout: physical code and shifted character for digits and punctuation.
  const usPunctuation: Record<string, [code: string, shifted: string]> = {
    '.': ['Period', '>'], ',': ['Comma', '<'], '/': ['Slash', '?'], '-': ['Minus', '_'], '=': ['Equal', '+'],
    ';': ['Semicolon', ':'], "'": ['Quote', '"'], '[': ['BracketLeft', '{'], ']': ['BracketRight', '}'],
  };
  const usDigitShifted = ')!@#$%^&*(';
  let key = base.length === 1 && /[a-z]/i.test(base) ? (shift ? base.toUpperCase() : base) : base;
  let code = /^[0-9]$/.test(base) ? `Digit${base}` : /^[a-z]$/i.test(base) ? `Key${base.toUpperCase()}` : '';
  if (usPunctuation[base]) {
    code = usPunctuation[base]![0];
    if (shift) key = usPunctuation[base]![1];
  } else if (/^[0-9]$/.test(base) && shift) {
    key = usDigitShifted[Number(base)]!;
  }
  if (base === '+') code = 'Equal';
  return {
    key,
    code,
    metaKey: modifiers.has('cmd'),
    ctrlKey: modifiers.has('ctrl'),
    shiftKey: shift,
    altKey: modifiers.has('alt'),
    repeat: false,
    preventDefault() {},
    target: { tagName: 'DIV', isContentEditable: false, closest: () => null },
  } as unknown as KeyboardEvent;
}

export function selectableNotes(xml: string): SelectedNote[] {
  const core = importMusicXmlToCore(xml);
  const notes: SelectedNote[] = [];
  for (const part of core.score.parts) {
    for (const staff of part.staves) {
      for (const measure of staff.measures) {
        for (const voice of measure.voices) {
          for (const event of voice.events) {
            notes.push({
              coreEntityId: event.id,
              coreVoiceId: voice.id,
              coreMeasureId: measure.id,
              corePartId: part.id,
              measureNumber: event.measureNumber,
              staffIndex: staff.staffIndex,
              voiceId: event.voiceId,
              timestampNum: event.timestampNum,
              timestampDen: event.timestampDen,
              step: event.kind === 'note' ? event.pitch.step : 'C',
              octave: event.kind === 'note' ? event.pitch.octave : 4,
              alter: event.kind === 'note' ? event.pitch.alter : 0,
              isRest: event.kind === 'rest',
              durationType: event.durationType,
              isDotted: event.isDotted ?? false,
              guitar: event.kind === 'note' ? event.guitar : undefined,
              graphicalNote: null,
            });
          }
        }
      }
    }
  }
  return notes;
}

/** Click the first event of a part/staff/voice/measure, as the user does before typing. */
export function clickFirstEvent(harness: EntryHarness, where: { partIndex?: number; staff?: number; voice?: number; measure?: number }) {
  const core = importMusicXmlToCore(harness.xml);
  const partId = core.score.parts[where.partIndex ?? 0]!.id;
  const target = selectableNotes(harness.xml).find((note) => (
    note.corePartId === partId
    && note.staffIndex === (where.staff ?? 1)
    && note.voiceId === (where.voice ?? 1)
    && note.measureNumber === (where.measure ?? 1)
  ));
  if (!target) throw new Error(`no event at ${JSON.stringify(where)}`);
  act(() => {
    harness.current.handleNoteClick(target);
  });
  harness.rerender();
}

const DOTS = (count: number) => '.'.repeat(count);

/**
 * Compact, exact description of one voice: "m<measure>@<onset in quarters> <pitch|r><type><dots>[~]"
 * where ~ marks a tie start. Hidden rests are marked with "h". Pitch is step, accidental, octave.
 */
export function voiceSummary(xml: string, where: { partIndex?: number; staff?: number; voice?: number }) {
  const core = importMusicXmlToCore(xml);
  const part = core.score.parts[where.partIndex ?? 0]!;
  const staff = part.staves.find((entry) => entry.staffIndex === (where.staff ?? 1))!;
  const out: string[] = [];
  for (const measure of staff.measures) {
    const voice = measure.voices.find((entry) => entry.voiceId === (where.voice ?? 1));
    for (const event of voice?.events ?? []) {
      const onset = Math.round((event.timestampNum / Math.max(event.timestampDen, 1)) * 4 * 1000) / 1000;
      const dots = DOTS(event.isDotted ? 1 : 0);
      if (event.kind === 'note') {
        const accidental = event.pitch.alter === 1 ? '#' : event.pitch.alter === -1 ? 'b' : event.pitch.alter === 2 ? 'x' : event.pitch.alter === -2 ? 'bb' : '';
        out.push(`m${measure.measureNumber}@${onset} ${event.pitch.step}${accidental}${event.pitch.octave}${event.isChord ? '(chord)' : ''} ${event.durationType}${dots}${event.tieStart ? '~' : ''}`);
      } else {
        out.push(`m${measure.measureNumber}@${onset} r${event.hidden ? 'h' : ''} ${event.durationType}${dots}`);
      }
    }
  }
  return out;
}

export function documentIssues(xml: string) {
  const state = buildDocumentState(xml);
  return state.coreDocument ? validateScoreDocument(state.coreDocument).filter((issue) => issue.level === 'error') : [{ level: 'error', code: 'no_core_document', message: '' }];
}

/** The starting document as the editor holds it (one import/export pass), for untouched-voice comparisons. */
export function normalizedXml(xml: string) {
  return buildDocumentState(xml).xml;
}
