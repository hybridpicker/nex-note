import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import { act, create, type ReactTestInstance } from 'react-test-renderer';

import NotationToolbar from '../components/NotationToolbar.tsx';
import NoteInputToolbar from '../components/NoteInputToolbar.tsx';
import LeftNotationSidebar from '../components/LeftNotationSidebar.tsx';
import IpadSelectionActions, { formatIpadSelectedNote } from '../components/IpadSelectionActions.tsx';
import CommandCenter from '../components/CommandCenter.tsx';
import FileMenu from '../components/FileMenu.tsx';
import { ScoreInputOverlay } from '../components/ScoreInputOverlay.tsx';
import ScoreInspector from '../components/ScoreInspector.tsx';
import ScoreLibrary, {
  SCORE_LIBRARY_PREVIEW_CONTAINER_STYLE,
  SCORE_LIBRARY_PREVIEW_IFRAME_STYLE,
  buildEmbeddedScorePreviewUrl,
  buildLibraryScorePreviewDataSource,
} from '../components/ScoreLibrary.tsx';
import RecentFiles from '../components/RecentFiles.tsx';
import UploadZone from '../components/UploadZone.tsx';
import WelcomeScreen from '../components/WelcomeScreen.tsx';
import EditPalette from '../components/EditPalette.tsx';
import { saveLibraryScore } from '../lib/score-library.ts';
import { addRecentFile } from '../lib/recent-files.ts';
import { DEFAULT_AI_MODEL_SETTINGS } from '../lib/ai-model-settings.ts';
import { formatShortcutHint } from '../lib/shortcut-hints.ts';
import { LEFT_NOTATION_SIDEBAR_STORAGE_KEY, parseLeftNotationSidebarCollapsed, readLeftNotationSidebarCollapsed, writeLeftNotationSidebarCollapsed } from '../lib/left-notation-sidebar.ts';
import { useScoreDocument } from '../hooks/useScoreDocument.ts';
import type { SelectedNote } from '../hooks/useNoteEditor.ts';
import { importMusicXmlToCore } from '../src/musicxml-adapter/import/import-musicxml.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1"><measure number="1"><attributes><divisions>1</divisions></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note></measure></part>
</score-partwise>`;

const INSPECTOR_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
    </measure>
    <measure number="2">
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`;

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string) { return this.data.has(key) ? this.data.get(key)! : null; }
  setItem(key: string, value: string) { this.data.set(key, value); }
  removeItem(key: string) { this.data.delete(key); }
  clear() { this.data.clear(); }
}

const storage = new MemoryStorage();

function buttonWithText(root: ReturnType<typeof create>['root'], text: string) {
  return root.findAll((node) => (
    node.type === 'button'
    && typeof node.props.onClick === 'function'
    && Array.isArray(node.children)
    && node.children.join('').includes(text)
  ))[0];
}

function nodeText(node: ReactTestInstance): string {
  return node.children.map((child) => (
    typeof child === 'string' ? child : nodeText(child as unknown as ReactTestInstance)
  )).join('');
}

function makeSelectedNotes(xml: string): SelectedNote[] {
  const core = importMusicXmlToCore(xml);
  return core.score.parts[0].staves[0].measures.flatMap((measure) => measure.voices.flatMap((voice) => voice.events.map((event) => ({
    coreEntityId: event.id,
    coreVoiceId: voice.id,
    coreMeasureId: measure.id,
    corePartId: core.score.parts[0].id,
    measureNumber: event.measureNumber,
    staffIndex: event.staffIndex,
    voiceId: event.voiceId,
    timestampNum: event.timestampNum,
    timestampDen: event.timestampDen,
    step: event.kind === 'note' ? event.pitch.step : 'C',
    octave: event.kind === 'note' ? event.pitch.octave : 4,
    alter: event.kind === 'note' ? event.pitch.alter : 0,
    isRest: event.kind === 'rest',
    graphicalNote: null,
  }))));
}

function toolbarProps(overrides: Partial<React.ComponentProps<typeof NotationToolbar>> = {}): React.ComponentProps<typeof NotationToolbar> {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  return {
    playbackState: 'stopped',
    currentMeasure: 1,
    totalBeats: 16,
    currentBeat: 0,
    coreDocument: importMusicXmlToCore(SAMPLE_XML),
    midiLoading: false,
    hasMidi: true,
    playbackError: null,
    tempoOverride: 132,
    metronomeEnabled: false,
    onPlay() {},
    onPause() {},
    onStop() {},
    onTempoChange() {},
    onSeek() {},
    onToggleMetronome() {},
    noteInputMode: false,
    chordInputMode: false,
    stepInputKeyboardMode: false,
    inputByDurationMode: false,
    preparedDurationPitchLabel: '',
    midiInputEnabled: false,
    midiInputStatus: 'idle',
    midiInputDevices: [],
    inputAuditionEnabled: true,
    microphoneInputEnabled: false,
    microphoneInputStatus: 'idle',
    microphoneDetectedPitchLabel: '',
    microphoneDetectedSoundingPitchLabel: '',
    microphoneSignalLevelDb: -120,
    microphoneSignalQuality: 'silent',
    microphoneInputDevices: [],
    microphoneSelectedDeviceId: '',
    microphoneDetectionMode: 'single',
    microphoneInstrumentMode: 'concert',
    leadsheetMode: false,
    guitarInputMode: false,
    selectedGuitarString: 1,
    selectedGuitarFret: 0,
    selectedGuitarTuning: 'standard',
    guitarFretBuffer: '',
    selectedDuration: '4',
    selectedAccidental: null,
    isDotted: false,
    selectedVoice: 1,
    entryMode: 'insert',
    selectedNote: null,
    onChangeActivePitch() {},
    onChangeActiveOctave() {},
    onToggleNoteInput() {},
    onToggleEntryMode() {},
    onToggleChordInputMode() {},
    onToggleStepInputKeyboardMode() {},
    onToggleInputByDurationMode() {},
    onToggleMidiInput() {},
    onToggleInputAudition() {},
    onToggleMicrophoneInput() {},
    onSelectMicrophoneInput() {},
    onSelectMicrophoneDetectionMode() {},
    onSelectMicrophoneInstrumentMode() {},
    onToggleLeadsheetMode() {},
    onToggleGuitarInputMode() {},
    onInsertGuitarFret() {},
    onGuitarTuningChange() {},
    onToggleGuitarTechnique() {},
    onDurationChange() {},
    onAccidentalChange() {},
    onToggleDotted() {},
    onVoiceChange() {},
    onInsertRest() {},
    onInsertSlash() {},
    onFillSlashMeasure() {},
    onInsertStepInputPitch() {},
    onSetChordSymbol() {},
    onDeleteNote() {},
    onCopySelection() {},
    onCutSelection() {},
    onPasteClipboard() {},
    clipboardCount: 0,
    canUndo: true,
    canRedo: false,
    onUndo() {},
    onRedo() {},
    onToggleArticulation() {},
    onAddDynamic() {},
    onSetBarline() {},
    onToggleSlur() {},
    onAddGraceNote() {},
    onAddTuplet() {},
    onAddInterval() {},
    onLayoutCleanup() {},
    layoutCleanupLoading: false,
    ...overrides,
  } as React.ComponentProps<typeof NotationToolbar>;
}

function noteInputToolbarProps(overrides: Partial<React.ComponentProps<typeof NoteInputToolbar>> = {}): React.ComponentProps<typeof NoteInputToolbar> {
  return {
    ...(toolbarProps() as unknown as React.ComponentProps<typeof NoteInputToolbar>),
    ...overrides,
  };
}

function paletteProps(overrides: Partial<React.ComponentProps<typeof EditPalette>> = {}): React.ComponentProps<typeof EditPalette> {
  return {
    selectedNote: null,
    selectedNotes: [],
    onToggleArticulation() {},
    onSetAccidentalDisplay() {},
    onClearArticulations() {},
    onAddDynamic() {},
    onToggleTie() {},
    onToggleSlur() {},
    onTransposeSemitones() {},
    onSetBarline() {},
    onDuplicateSelection() {},
    onCutSelection() {},
    onDeleteSelection() {},
    onClearSelection() {},
    onCopySelection() {},
    onPasteClipboard() {},
    clipboardCount: 0,
    ...overrides,
  };
}

test.beforeEach(() => {
  storage.clear();
  Object.assign(globalThis, {
    window: {
      setTimeout: (callback: () => void) => {
        callback();
        return 0;
      },
      localStorage: storage,
    },
    localStorage: storage,
  });
});

test('formatShortcutHint adapts command modifiers to the active platform', () => {
  assert.equal(formatShortcutHint('Cmd S', 'MacIntel'), 'Cmd S');
  assert.equal(formatShortcutHint('Shift Cmd S', 'Win32'), 'Shift Ctrl S');
  assert.equal(formatShortcutHint('Cmd/Ctrl+Alt/Option+1', 'Linux x86_64'), 'Ctrl+Alt+1');
  assert.equal(formatShortcutHint('Cmd/Ctrl+Alt/Option+1', 'iPad'), 'Cmd+Option+1');
});

test('iPad selection actions expose a direct, touch-sized note deletion control', () => {
  const selectedNote = makeSelectedNotes(SAMPLE_XML)[0];
  let deleteCount = 0;
  let renderer: ReturnType<typeof create> | null = null;

  act(() => {
    renderer = create(React.createElement(IpadSelectionActions, {
      selectedNote,
      onDeleteNote() {
        deleteCount += 1;
      },
    }));
  });

  assert.equal(formatIpadSelectedNote(selectedNote), 'C4');
  assert.equal(nodeText(renderer!.root.findByProps({ 'data-testid': 'ipad-selection-actions' })), 'Selected: C4Delete note');
  const deleteButton = renderer!.root.findByProps({ 'data-testid': 'ipad-delete-note' });
  assert.equal(deleteButton.props['aria-label'], 'Delete selected note C4');

  act(() => {
    deleteButton.props.onClick();
  });
  assert.equal(deleteCount, 1);

  act(() => {
    renderer?.unmount();
  });
});

test('LeftNotationSidebar hides the full tools panel behind an accessible reopen rail', () => {
  let collapsed = true;
  let renderer: ReturnType<typeof create> | null = null;
  const renderSidebar = () => React.createElement(LeftNotationSidebar, {
    collapsed,
    onToggleCollapsed() { collapsed = !collapsed; },
    labels: {
      show: 'Show notation tools',
      hide: 'Hide notation tools',
      title: 'Notation tools',
    },
  }, React.createElement('div', { id: 'sidebar-content' }, 'Tools'));

  act(() => {
    renderer = create(renderSidebar());
  });

  let root = renderer!.root;
  assert.equal(root.findAllByProps({ id: 'sidebar-content' }).length, 0);
  let toggle = root.findAllByProps({ 'aria-label': 'Show notation tools' })[0];
  assert.equal(toggle.props['aria-expanded'], false);
  assert.equal(toggle.props.title, 'Show notation tools');

  act(() => {
    toggle.props.onClick();
    renderer!.update(renderSidebar());
  });

  root = renderer!.root;
  assert.equal(root.findAllByProps({ id: 'sidebar-content' }).length, 1);
  toggle = root.findAllByProps({ 'aria-label': 'Hide notation tools' })[0];
  assert.equal(toggle.props['aria-expanded'], true);
  assert.equal(toggle.props['aria-controls'], 'nex-left-notation-tools-panel');

  act(() => {
    renderer?.unmount();
  });
});

test('left notation sidebar collapse preference is stored in localStorage', () => {
  assert.equal(parseLeftNotationSidebarCollapsed('true'), true);
  assert.equal(parseLeftNotationSidebarCollapsed('false'), false);
  assert.equal(readLeftNotationSidebarCollapsed(), true);

  writeLeftNotationSidebarCollapsed(true);
  assert.equal(storage.getItem(LEFT_NOTATION_SIDEBAR_STORAGE_KEY), 'true');
  assert.equal(readLeftNotationSidebarCollapsed(), true);
});

test('CommandCenter filters actions and runs the selected command', () => {
  let ran = '';
  let closed = false;
  let renderer: ReturnType<typeof create> | null = null;

  act(() => {
    renderer = create(React.createElement(CommandCenter, {
      open: true,
      onClose() {
        closed = true;
      },
      actions: [
        {
          id: 'play',
          title: 'Play score',
          description: 'Start playback',
          group: 'Playback',
          shortcut: 'Space',
          onRun() {
            ran = 'play';
          },
        },
        {
          id: 'export',
          title: 'Export compressed MusicXML',
          description: 'Download a .mxl file',
          group: 'Export',
          onRun() {
            ran = 'export';
          },
        },
        {
          id: 'disabled',
          title: 'Save project',
          group: 'File',
          disabled: true,
          onRun() {
            ran = 'disabled';
          },
        },
      ],
    }));
  });

  const root = renderer!.root;
  const input = root.findByType('input');
  act(() => {
    input.props.onChange({ target: { value: 'musicxml' } });
  });

  assert.equal(root.findAll((node) => node.children?.includes?.('Play score')).length, 0);
  assert.equal(root.findAll((node) => node.children?.includes?.('Export compressed MusicXML')).length, 1);

  act(() => {
    input.props.onKeyDown({ key: 'Enter', preventDefault() {} });
  });

  assert.equal(ran, 'export');
  assert.equal(closed, true);

  act(() => {
    renderer?.unmount();
  });
});

test('CommandCenter does not let disabled hover targets replace the active command', () => {
  let ran = '';
  let renderer: ReturnType<typeof create> | null = null;

  act(() => {
    renderer = create(React.createElement(CommandCenter, {
      open: true,
      onClose() {},
      actions: [
        {
          id: 'play',
          title: 'Play score',
          group: 'Playback',
          onRun() {
            ran = 'play';
          },
        },
        {
          id: 'save',
          title: 'Save project',
          group: 'File',
          disabled: true,
          onRun() {
            ran = 'save';
          },
        },
      ],
    }));
  });

  const root = renderer!.root;
  const input = root.findByType('input');
  const disabledButton = root.findAllByType('button')
    .find((button) => nodeText(button).includes('Save project'))!;

  act(() => {
    disabledButton.props.onPointerMove();
    input.props.onKeyDown({ key: 'Enter', preventDefault() {} });
  });

  assert.equal(ran, 'play');

  act(() => {
    renderer?.unmount();
  });
});

test('FileMenu opens, runs enabled file actions, and leaves disabled actions inert', () => {
  const runs: string[] = [];
  let renderer: ReturnType<typeof create> | null = null;

  act(() => {
    renderer = create(React.createElement(FileMenu, {
      menuId: 'file-menu',
      label: 'File',
      items: [
        { id: 'open', label: 'Open file', shortcut: 'Cmd O', onRun: () => { runs.push('open'); } },
        { id: 'save', label: 'Save', shortcut: 'Cmd S', disabled: true, onRun: () => { runs.push('save'); } },
        { id: 'close', label: 'Close score', danger: true, separatorBefore: true, onRun: () => { runs.push('close'); } },
      ],
    }));
  });

  const root = renderer!.root;
  act(() => {
    root.findAllByProps({ 'aria-haspopup': 'menu' })[0].props.onClick();
  });

  const buttons = root.findAllByType('button');
  assert.equal(buttons.some((button) => nodeText(button).includes('Open file')), true);
  assert.equal(buttons.some((button) => nodeText(button).includes('Save')), true);

  const saveButton = buttons.find((button) => nodeText(button).includes('Save'))!;
  act(() => {
    saveButton.props.onClick();
  });
  assert.deepEqual(runs, []);

  const openButton = buttons.find((button) => nodeText(button).includes('Open file'))!;
  act(() => {
    openButton.props.onClick();
  });
  assert.deepEqual(runs, ['open']);

  act(() => {
    renderer?.unmount();
  });
});

test('UploadZone advertises MIDI import support', () => {
  let renderer: ReturnType<typeof create> | null = null;
  act(() => {
    renderer = create(React.createElement(UploadZone, { onFileSelected: () => {} }));
  });
  const root = renderer!.root;
  const input = root.findByType('input');

  assert.match(input.props.accept, /\.mid/);
  assert.match(input.props.accept, /\.midi/);
  assert.match(input.props.accept, /\.png/);
  assert.match(input.props.accept, /\.jpe?g/);
  assert.equal(input.props.multiple, true);
  assert.ok(root.findAll((node) => node.children?.includes?.('NXN · PDF · image · MXL · XML · MSCZ · MIDI · GP · click to select')).length > 0);
});

test('WelcomeScreen surfaces AI readiness and opens setup', () => {
  let openSettingsCount = 0;
  let renderer: ReturnType<typeof create> | null = null;

  act(() => {
    renderer = create(React.createElement(WelcomeScreen, {
      onCreateBlankScore() {},
      onChooseTemplate() {},
      onOpenFile() {},
      onFileSelected() {},
      onOpenLibraryScore() {},
      aiModelSettings: DEFAULT_AI_MODEL_SETTINGS,
      aiSettingsHydrated: true,
      aiProvider: 'ollama',
      ollamaModel: 'gemma4:31b',
      ollamaConnectionState: 'offline',
      onOpenAiSettings() { openSettingsCount += 1; },
    }));
  });

  const root = renderer!.root;
  assert.match(nodeText(root), /AI setup needed/);
  assert.match(nodeText(root), /Setup needed/);
  assert.match(nodeText(root), /Local helpers/);
  assert.match(nodeText(root), /Always on/);

  const settingsButton = buttonWithText(root, 'AI settings');
  act(() => {
    settingsButton.props.onClick();
  });
  assert.equal(openSettingsCount, 1);

  act(() => {
    renderer?.unmount();
  });
});

test('CommandCenter keeps mixed enabled and disabled commands under one group heading', () => {
  let renderer: ReturnType<typeof create> | null = null;
  const noop = () => {};

  act(() => {
    renderer = create(React.createElement(CommandCenter, {
      open: true,
      onClose: noop,
      actions: [
        { id: 'play', title: 'Play score', group: 'Playback', onRun: noop },
        { id: 'stop', title: 'Stop playback', group: 'Playback', disabled: true, onRun: noop },
        { id: 'metronome', title: 'Toggle metronome', group: 'Playback', onRun: noop },
        { id: 'undo', title: 'Undo', group: 'History', onRun: noop },
        { id: 'redo', title: 'Redo', group: 'History', disabled: true, onRun: noop },
      ],
    }));
  });

  const sectionLabels = renderer!.root.findAllByType('section')
    .map((section) => section.findByType('p').children.join(''));

  assert.deepEqual(sectionLabels, ['Playback', 'History']);

  act(() => {
    renderer?.unmount();
  });
});

test('CommandCenter exposes shortcut and disabled reason in row titles', () => {
  let renderer: ReturnType<typeof create> | null = null;
  const noop = () => {};

  act(() => {
    renderer = create(React.createElement(CommandCenter, {
      open: true,
      onClose: noop,
      actions: [
        {
          id: 'save',
          title: 'Save',
          description: 'Save the current score to the local library',
          group: 'File',
          shortcut: 'Cmd S',
          disabled: true,
          disabledReason: 'Open or create a score first',
          onRun: noop,
        },
        {
          id: 'play',
          title: 'Play score',
          description: 'Start playback',
          group: 'Playback',
          shortcut: 'Space',
          onRun: noop,
        },
      ],
    }));
  });

  const buttons = renderer!.root.findAllByType('button');
  const saveButton = buttons.find((button) => nodeText(button).includes('Save'))!;
  const playButton = buttons.find((button) => nodeText(button).includes('Play score'))!;

  assert.equal(saveButton.props.title, 'Save - Cmd S - Unavailable: Open or create a score first');
  assert.equal(saveButton.props['aria-label'], 'Save - Cmd S - Unavailable: Open or create a score first');
  assert.equal(playButton.props.title, 'Play score - Space - Start playback');
  assert.equal(playButton.props['aria-label'], 'Play score - Space - Start playback');

  act(() => {
    renderer?.unmount();
  });
});

test('NotationToolbar surfaces playback, history, tempo, metronome, and error UI states', () => {
  let soughtBeat = -1;
  let renderer: ReturnType<typeof create> | null = null;
  act(() => {
    renderer = create(React.createElement(NotationToolbar, toolbarProps({
      playbackState: 'playing',
      currentMeasure: 3,
      currentBeat: 8,
      metronomeEnabled: true,
      playbackError: 'No MIDI loaded for playback.',
      onSeek(beat) { soughtBeat = beat; },
    })));
  });

  const root = renderer!.root;
  const buttons = root.findAllByType('button');
  const titles = buttons.map((button) => button.props.title).filter(Boolean);
  assert.ok(titles.includes('Undo (Cmd/Ctrl+Z)'));
  assert.ok(titles.includes('Pause (Space)'));
  assert.ok(titles.includes('Stop'));
  assert.ok(titles.includes('Metronome on'));
  assert.ok(titles.includes('Toggle note input (N)'));
  assert.ok(!titles.includes('Chromatic drag transpose'));
  assert.ok(!titles.includes('Diatonic drag transpose'));

  const statusText = root.findAll((node) => typeof node.children?.[0] === 'string').map((node) => String(node.children.join('')));
  assert.ok(statusText.includes('Measure 3'));
  assert.ok(statusText.includes('Playback failed: No MIDI loaded for playback.'));

  const progressBar = root.findAll((node) => typeof node.props.onClick === 'function' && String(node.props.className ?? '').includes('cursor-pointer overflow-hidden rounded-full'))[0];
  act(() => {
    progressBar.props.onClick({
      currentTarget: { getBoundingClientRect: () => ({ left: 0, width: 200 }) },
      clientX: 100,
    });
  });
  assert.equal(soughtBeat, 8);

  act(() => {
    renderer?.unmount();
  });
});

test('NotationToolbar exposes active-note controls when a note is selected', () => {
  const [selectedNote] = makeSelectedNotes(SAMPLE_XML);
  let chosenStep: string | null = null;
  let octaveDelta: 1 | -1 | null = null;
  let renderer: ReturnType<typeof create> | null = null;

  act(() => {
    renderer = create(React.createElement(NotationToolbar, toolbarProps({
      selectedNote,
      onChangeActivePitch(step) { chosenStep = step; },
      onChangeActiveOctave(direction) { octaveDelta = direction; },
    })));
  });

  const root = renderer!.root;
  const activeButtons = root.findAll((node) => (
    node.type === 'button'
    && typeof node.props.onClick === 'function'
    && typeof node.props.title === 'string'
    && (
      node.props.title === 'Set active note to C (C)'
      || node.props.title === 'Raise active note by one octave (Shift+ArrowUp / Cmd/Ctrl+ArrowUp)'
    )
  ));
  assert.equal(activeButtons.length, 2);

  act(() => {
    activeButtons[0]!.props.onClick();
    activeButtons[1]!.props.onClick();
  });

  assert.equal(chosenStep, 'C');
  assert.equal(octaveDelta, 1);

  const texts = root.findAll((node) => typeof node.children?.[0] === 'string').map((node) => String(node.children.join('')));
  assert.ok(texts.includes('Active'));
  assert.ok(texts.includes('C4'));
  assert.ok(root.findAllByProps({ title: 'C4 · Piano · M1 · Staff 1 · Voice 1 · 0/4' }).length > 0);

  act(() => {
    renderer?.unmount();
  });
});

test('NotationToolbar exposes a QWERTY step-input surface when the step keyboard is active', () => {
  let toggled = 0;
  const inserted: Array<{ step: string; octave: number; alter: number }> = [];
  let renderer: ReturnType<typeof create> | null = null;

  act(() => {
    renderer = create(React.createElement(NotationToolbar, toolbarProps({
      noteInputMode: true,
      stepInputKeyboardMode: true,
      selectedNote: makeSelectedNotes(SAMPLE_XML)[0] ?? null,
      onToggleStepInputKeyboardMode() {
        toggled += 1;
      },
      onInsertStepInputPitch(step, octave, alter) {
        inserted.push({ step, octave, alter });
      },
    })));
  });

  const root = renderer!.root;
  const stepToggle = root.findAll((node) => node.type === 'button' && node.props.title === 'Toggle QWERTY step keyboard (P)')[0];
  const c4Button = root.findAll((node) => node.type === 'button' && node.props.title === 'Insert C4 (Z)')[0];

  act(() => {
    stepToggle.props.onClick();
    c4Button.props.onClick();
  });

  assert.equal(root.findAllByProps({ 'data-testid': 'step-input-panel' }).length, 1);
  assert.equal(toggled, 1);
  assert.deepEqual(inserted, [{ step: 'C', octave: 4, alter: 0 }]);

  act(() => {
    renderer?.unmount();
  });
});

test('NotationToolbar exposes duration-first chord preparation inside Notation Edit mode', () => {
  let toggled = 0;
  let renderer: ReturnType<typeof create> | null = null;

  act(() => {
    renderer = create(React.createElement(NotationToolbar, toolbarProps({
      noteInputMode: true,
      inputByDurationMode: true,
      preparedDurationPitchLabel: 'C4+E4+G4',
      onToggleInputByDurationMode() {
        toggled += 1;
      },
    })));
  });

  const root = renderer!.root;
  const durationToggle = root.findAll((node) => (
    node.type === 'button'
    && typeof node.props.title === 'string'
    && node.props.title.startsWith('Input by duration (M)')
  ))[0];

  assert.ok(durationToggle);
  assert.equal(durationToggle.props['aria-pressed'], true);
  assert.ok(root.findAll((node) => String(node.children?.join('') ?? '') === 'DUR C4+E4+G4').length > 0);

  act(() => {
    durationToggle.props.onClick();
  });
  assert.equal(toggled, 1);

  act(() => {
    renderer?.unmount();
  });
});

test('NotationToolbar exposes microphone Instrument Record detection and keeps MIDI input separate', () => {
  let microphoneToggled = 0;
  let midiToggled = 0;
  let renderer: ReturnType<typeof create> | null = null;

  act(() => {
    renderer = create(React.createElement(NotationToolbar, toolbarProps({
      noteInputMode: true,
      microphoneInputEnabled: true,
      microphoneInputStatus: 'listening',
      microphoneDetectedPitchLabel: 'C4+E4+G4',
      microphoneDetectedSoundingPitchLabel: 'C3+E3+G3',
      microphoneSignalLevelDb: -28,
      microphoneSignalQuality: 'good',
      microphoneInputDevices: [
        { deviceId: 'external', label: 'External Microphone' },
        { deviceId: 'built-in', label: 'MacBook Pro Microphone' },
      ],
      microphoneSelectedDeviceId: 'built-in',
      microphoneDetectionMode: 'chord',
      microphoneInstrumentMode: 'guitar',
      midiInputEnabled: true,
      midiInputStatus: 'connected',
      midiInputDevices: ['Acme Stage 88'],
      onToggleMicrophoneInput() {
        microphoneToggled += 1;
      },
      onToggleMidiInput() {
        midiToggled += 1;
      },
    })));
  });

  const prominentRecordButton = renderer!.root.findAllByProps({ 'data-testid': 'instrument-record-toggle' })[0]!;
  assert.equal(prominentRecordButton.props['aria-pressed'], true);
  assert.match(prominentRecordButton.props.title, /Listening to the microphone/);
  assert.match(prominentRecordButton.props.title, /Written: C4\+E4\+G4/);
  assert.match(prominentRecordButton.props.title, /Sounding: C3\+E3\+G3/);
  assert.match(prominentRecordButton.props.title, /Input level: -28 dB/);
  assert.match(nodeText(prominentRecordButton), /REC C4\+E4\+G4/);
  assert.match(prominentRecordButton.props.className, /bg-red-500/);
  const microphonePicker = renderer!.root.findAllByProps({ 'aria-label': 'Microphone input' })[0]!;
  assert.equal(microphonePicker.props.value, 'built-in');
  const recognitionPicker = renderer!.root.findAllByProps({ 'aria-label': 'Pitch recognition mode' })[0]!;
  assert.equal(recognitionPicker.props.value, 'chord');
  assert.match(recognitionPicker.props.title, /Alt\/Option\+C/);
  const transpositionPicker = renderer!.root.findAllByProps({ 'aria-label': 'Instrument transposition' })[0]!;
  assert.equal(transpositionPicker.props.value, 'guitar');
  assert.match(nodeText(renderer!.root.findByProps({ 'data-testid': 'microphone-signal-status' })), /Signal good.*-28 dB/);

  const midiButton = renderer!.root.findAll((node) => (
    node.type === 'button'
    && typeof node.props.title === 'string'
    && node.props.title.includes('Acme Stage 88')
  ))[0];
  assert.ok(midiButton);
  assert.match(midiButton.props.title, /Disable MIDI note input/);
  assert.match(midiButton.props.title, /within 35 ms.*one chord/);
  assert.match(nodeText(midiButton), /MIDI/);

  act(() => prominentRecordButton.props.onClick());
  act(() => midiButton.props.onClick());
  assert.equal(microphoneToggled, 1);
  assert.equal(midiToggled, 1);
  act(() => renderer?.unmount());
});

test('NotationToolbar writes a clear warning when the microphone input is too low', () => {
  let renderer: ReturnType<typeof create> | null = null;
  act(() => {
    renderer = create(React.createElement(NotationToolbar, toolbarProps({
      microphoneInputEnabled: true,
      microphoneInputStatus: 'listening',
      microphoneSignalLevelDb: -67,
      microphoneSignalQuality: 'too-low',
      microphoneDetectionMode: 'single',
    })));
  });

  const recordButton = renderer!.root.findByProps({ 'data-testid': 'instrument-record-toggle' });
  assert.match(nodeText(recordButton), /INPUT LOW/);
  assert.match(recordButton.props.title, /Input too low/);
  assert.match(
    nodeText(renderer!.root.findByProps({ 'data-testid': 'microphone-signal-status' })),
    /Input too low.*-67 dB/,
  );

  act(() => renderer?.unmount());
});

test('NotationToolbar starts note input when a duration button is clicked', () => {
  let toggledNoteInput = 0;
  let chosenDuration: string | null = null;
  let renderer: ReturnType<typeof create> | null = null;

  act(() => {
    renderer = create(React.createElement(NotationToolbar, toolbarProps({
      noteInputMode: false,
      onToggleNoteInput() { toggledNoteInput += 1; },
      onDurationChange(duration) { chosenDuration = duration; },
    })));
  });

  const root = renderer!.root;
  const quarterDurationButton = root.findAllByType('button').find((button) => (
    typeof button.props.title === 'string'
    && button.props.title.startsWith('Quarter note: 5')
    && button.props.title.includes('64th note: 1')
  ));
  act(() => {
    quarterDurationButton!.props.onClick();
  });

  assert.equal(toggledNoteInput, 1);
  assert.equal(chosenDuration, '4');

  act(() => {
    renderer?.unmount();
  });
});

test('NotationToolbar changes the selected note duration without starting note input', () => {
  let toggledNoteInput = 0;
  let chosenDuration: string | null = null;
  let renderer: ReturnType<typeof create> | null = null;

  act(() => {
    renderer = create(React.createElement(NotationToolbar, toolbarProps({
      noteInputMode: false,
      selectedNote: makeSelectedNotes(SAMPLE_XML)[0] ?? null,
      onToggleNoteInput() { toggledNoteInput += 1; },
      onDurationChange(duration) { chosenDuration = duration; },
    })));
  });

  const root = renderer!.root;
  const quarterDurationButton = root.findAllByType('button').find((button) => (
    typeof button.props.title === 'string'
    && button.props.title.startsWith('Quarter note: 5')
    && button.props.title.includes('64th note: 1')
  ));
  act(() => {
    quarterDurationButton!.props.onClick();
  });

  assert.equal(toggledNoteInput, 0);
  assert.equal(chosenDuration, '4');

  act(() => {
    renderer?.unmount();
  });
});

test('NotationToolbar exposes MuseScore 1-9 duration buttons including breve and longa', () => {
  const chosenDurations: string[] = [];
  let renderer: ReturnType<typeof create> | null = null;

  act(() => {
    renderer = create(React.createElement(NotationToolbar, toolbarProps({
      noteInputMode: true,
      selectedDuration: 'breve',
      onDurationChange(duration) { chosenDurations.push(duration); },
    })));
  });

  const root = renderer!.root;
  const titles = root.findAllByType('button').map((button) => button.props.title).filter(Boolean);
  assert.equal(root.findAllByProps({ 'data-engraving-source': 'vexflow' }).length, 9);
  assert.ok(titles.some((title) => (
    typeof title === 'string'
    && title.startsWith('Breve: 8')
    && title.includes('Long: 9')
  )));
  assert.ok(titles.some((title) => (
    typeof title === 'string'
    && title.startsWith('Long: 9')
    && title.includes('Breve: 8')
  )));

  const longButton = root.findAllByType('button').find((button) => (
    typeof button.props.title === 'string'
    && button.props.title.startsWith('Long: 9')
  ));
  act(() => {
    longButton!.props.onClick();
  });

  assert.deepEqual(chosenDurations, ['long']);

  act(() => {
    renderer?.unmount();
  });
});

test('Notes palette optically balances long-duration and accidental glyphs without shrinking hit targets', () => {
  let renderer: ReturnType<typeof create> | null = null;

  act(() => {
    renderer = create(React.createElement(NoteInputToolbar, noteInputToolbarProps({
      placement: 'sidebar',
      noteInputMode: true,
    })));
  });

  const root = renderer!.root;
  const buttonByTitle = (prefix: string) => root.findAllByType('button').find((button) => (
    typeof button.props.title === 'string' && button.props.title.startsWith(prefix)
  ));
  const wholeButton = buttonByTitle('Whole note: 7')!;
  const breveButton = buttonByTitle('Breve: 8')!;
  const flatButton = buttonByTitle('Flat (')!;
  const doubleSharpButton = buttonByTitle('Double sharp (')!;

  assert.match(wholeButton.props.className, /\bw-8\b/);
  assert.match(wholeButton.props.className, /\bh-8\b/);
  assert.equal(wholeButton.findByProps({ 'data-engraving-source': 'vexflow' }).props.className, 'h-5 w-5');
  assert.equal(breveButton.findByProps({ 'data-engraving-source': 'vexflow' }).props.className, 'h-[18px] w-[18px]');
  assert.equal(flatButton.findByType('svg').props.className, 'h-[18px] w-[18px]');
  assert.equal(doubleSharpButton.findByType('svg').props.className, 'h-4 w-4');
  assert.match(flatButton.props.className, /\bw-8\b/);
  assert.match(flatButton.props.className, /\bh-8\b/);

  act(() => {
    renderer?.unmount();
  });
});

test('NotationToolbar explains selection-required disabled edit buttons', () => {
  let renderer: ReturnType<typeof create> | null = null;

  act(() => {
    renderer = create(React.createElement(NotationToolbar, toolbarProps({
      selectedNote: null,
    })));
  });

  const root = renderer!.root;
  const titles = root.findAllByType('button').map((button) => button.props.title).filter(Boolean);
  assert.ok(titles.includes('Toggle slur (S) - Select a note first'));
  assert.ok(titles.includes('Triplet from selection (Cmd/Ctrl+3) - Select a note first'));
  assert.ok(titles.includes('Insert rest (R or 0) - Select a note first'));

  const chordInput = root.findAllByProps({ placeholder: 'Cmaj7' })[0];
  assert.equal(chordInput.props.title, 'Chord symbol (Cmd/Ctrl+K) - Select a note first');

  act(() => {
    renderer?.unmount();
  });
});

test('NotationToolbar mirrors the selected harmony into the chord-symbol field and Escape restores it', () => {
  const [selectedNote] = makeSelectedNotes(SAMPLE_XML);
  const coreDocument = importMusicXmlToCore(SAMPLE_XML);
  coreDocument.score.parts[0].staves[0].measures[0].directions.push({
    id: 'test:harmony',
    kind: 'harmony',
    value: 'Fmaj7',
    measureNumber: 1,
    staffIndex: 1,
    timestampNum: 0,
    timestampDen: 4,
  });
  let renderer: ReturnType<typeof create> | null = null;

  act(() => {
    renderer = create(React.createElement(NotationToolbar, toolbarProps({
      coreDocument,
      selectedNote,
    })));
  });

  const root = renderer!.root;
  const chordInput = root.findAllByProps({ placeholder: 'Cmaj7' })[0];
  assert.equal(chordInput.props.value, 'Fmaj7');

  act(() => {
    chordInput.props.onChange({ target: { value: 'Bb7' } });
  });
  assert.equal(renderer!.root.findAllByProps({ placeholder: 'Cmaj7' })[0].props.value, 'Bb7');

  act(() => {
    renderer!.root.findAllByProps({ placeholder: 'Cmaj7' })[0].props.onKeyDown({
      key: 'Escape',
      preventDefault() {},
    });
  });
  assert.equal(renderer!.root.findAllByProps({ placeholder: 'Cmaj7' })[0].props.value, 'Fmaj7');

  act(() => {
    renderer?.unmount();
  });
});

test('NotationToolbar exposes consistent shortcut hints and pitched-note disabled reasons', () => {
  const [selectedNote] = makeSelectedNotes(SAMPLE_XML);
  const selectedRest = { ...selectedNote, isRest: true } satisfies SelectedNote;
  let renderer: ReturnType<typeof create> | null = null;

  act(() => {
    renderer = create(React.createElement(NotationToolbar, toolbarProps({
      selectedNote: selectedRest,
    })));
  });

  let root = renderer!.root;
  let titles = root.findAllByType('button').map((button) => button.props.title).filter(Boolean);
  assert.ok(titles.some((title) => (
    typeof title === 'string'
    && title.startsWith('Quarter note: 5')
    && title.includes('Duration shortcuts (only when Note Input is active)')
    && title.includes('64th note: 1')
    && title.includes('Breve: 8')
    && title.includes('Long: 9')
    && title.includes('Dotted note: .')
  )));
  assert.ok(titles.includes('Voice 3 (Cmd/Ctrl+Alt/Option+3)'));
  assert.ok(titles.includes('Flat (-)'));
  assert.ok(titles.includes('Toggle slur (S) - Select a pitched note first'));
  assert.ok(titles.includes('Staccato (Shift+S) - Select a pitched note first'));

  act(() => {
    renderer!.update(React.createElement(NotationToolbar, toolbarProps({
      selectedNote,
    })));
  });

  root = renderer!.root;
  titles = root.findAllByType('button').map((button) => button.props.title).filter(Boolean);
  assert.ok(titles.includes('Set active note to F (F)'));
  assert.ok(titles.includes('Raise active note by one octave (Shift+ArrowUp / Cmd/Ctrl+ArrowUp)'));

  act(() => {
    renderer?.unmount();
  });
});

test('NoteInputToolbar exposes the full Notes shortcut map on the sidebar header', () => {
  let renderer: ReturnType<typeof create> | null = null;

  act(() => {
    renderer = create(React.createElement(NoteInputToolbar, noteInputToolbarProps({
      placement: 'sidebar',
      noteInputMode: true,
    })));
  });

  const root = renderer!.root;
  const notesHeader = root.findAll((node) => (
    node.type === 'button'
    && typeof node.props.title === 'string'
    && node.props.title.includes('Duration shortcuts (only when Note Input is active)')
  ))[0];

  assert.ok(notesHeader.props.title.includes('64th note: 1'));
  assert.ok(notesHeader.props.title.includes('Quarter note: 5'));
  assert.ok(notesHeader.props.title.includes('Breve: 8'));
  assert.ok(notesHeader.props.title.includes('Long: 9'));
  assert.ok(notesHeader.props.title.includes('Dotted note: .'));
  assert.ok(notesHeader.props.title.includes('Sharp: +'));

  act(() => {
    renderer?.unmount();
  });
});

test('NoteInputToolbar states voice and entry intent without relying on active-button color', () => {
  let renderer: ReturnType<typeof create> | null = null;

  act(() => {
    renderer = create(React.createElement(NoteInputToolbar, noteInputToolbarProps({
      noteInputMode: true,
      selectedVoice: 3,
      entryMode: 'insert',
      chordInputMode: true,
    })));
  });

  let summary = renderer!.root.findByProps({ 'data-testid': 'note-input-state-summary' });
  assert.equal(nodeText(summary), 'Note Input · Voice 3 · Insert · Chord');
  assert.equal(summary.props['data-active-voice'], 3);
  assert.equal(summary.props['data-entry-mode'], 'insert');
  assert.equal(summary.props['data-chord-input'], 'chord');
  assert.equal(summary.props['aria-label'], 'Notation input state: Note Input, Voice 3, Insert, Chord');
  assert.equal(summary.props['aria-live'], 'off');

  act(() => {
    renderer!.update(React.createElement(NoteInputToolbar, noteInputToolbarProps({
      noteInputMode: true,
      selectedVoice: 3,
      entryMode: 'overwrite',
      chordInputMode: false,
    })));
  });

  summary = renderer!.root.findByProps({ 'data-testid': 'note-input-state-summary' });
  assert.equal(nodeText(summary), 'Note Input · Voice 3 · Replace · Single note');
  assert.equal(summary.props['data-entry-mode'], 'replace');
  assert.equal(summary.props['data-chord-input'], 'single-note');

  act(() => {
    renderer?.unmount();
  });
});

test('EditPalette explains disabled selection and pitched-note actions', () => {
  let renderer: ReturnType<typeof create> | null = null;

  act(() => {
    renderer = create(React.createElement(EditPalette, paletteProps()));
  });

  let root = renderer!.root;
  let titles = root.findAllByType('button').map((button) => button.props.title).filter(Boolean);
  assert.ok(titles.some((title) => /^Copy selection \((Cmd|Ctrl)\+C\) - Select a note first$/.test(title)));
  assert.ok(titles.some((title) => /^Paste selection \((Cmd|Ctrl)\+V\) - Select a note first$/.test(title)));
  assert.ok(titles.includes('−1 octave - Select a note first'));
  assert.ok(titles.includes('Staccato - Select a note first'));

  const [selectedNote] = makeSelectedNotes(SAMPLE_XML);
  act(() => {
    renderer!.update(React.createElement(EditPalette, paletteProps({
      selectedNote,
      selectedNotes: [selectedNote],
    })));
  });

  root = renderer!.root;
  titles = root.findAllByType('button').map((button) => button.props.title).filter(Boolean);
  assert.ok(titles.some((title) => /^Paste selection \((Cmd|Ctrl)\+V\) - Copy a selection first$/.test(title)));
  assert.ok(titles.includes('−1 octave'));
  assert.ok(titles.includes('Staccato'));

  const restSelection: SelectedNote = {
    ...selectedNote,
    isRest: true,
    step: 'C',
    alter: 0,
  };
  act(() => {
    renderer!.update(React.createElement(EditPalette, paletteProps({
      selectedNote: restSelection,
      selectedNotes: [restSelection],
    })));
  });

  root = renderer!.root;
  titles = root.findAllByType('button').map((button) => button.props.title).filter(Boolean);
  assert.ok(titles.includes('−1 octave - Select a pitched note first'));
  assert.ok(titles.includes('Staccato - Select a pitched note first'));

  act(() => {
    renderer?.unmount();
  });
});

test('EditPalette exposes accessible courtesy and enclosure controls for written accidentals', () => {
  const [baseNote] = makeSelectedNotes(SAMPLE_XML);
  const selectedNote: SelectedNote = {
    ...baseNote,
    writtenAccidental: 'sharp',
    accidentalCautionary: true,
    accidentalEnclosure: 'round',
  };
  const changes: Array<[boolean, string]> = [];
  let renderer: ReturnType<typeof create> | null = null;

  act(() => {
    renderer = create(React.createElement(EditPalette, paletteProps({
      selectedNote,
      selectedNotes: [selectedNote],
      onSetAccidentalDisplay(cautionary, enclosure) {
        changes.push([cautionary, enclosure]);
      },
    })));
  });

  const buttons = renderer!.root.findAllByType('button');
  const courtesy = buttons.find((button) => button.props.title === 'Courtesy / cautionary accidental');
  const square = buttons.find((button) => button.props.title === 'Square brackets');
  assert.equal(courtesy?.props['aria-pressed'], true);
  assert.equal(square?.props['aria-pressed'], false);
  act(() => courtesy!.props.onClick());
  act(() => square!.props.onClick());
  assert.deepEqual(changes, [[false, 'round'], [true, 'square']]);

  act(() => renderer?.unmount());
});

test('EditPalette opens icon-rail sections from focus events and keyboard', () => {
  const [selectedNote] = makeSelectedNotes(SAMPLE_XML);
  let renderer: ReturnType<typeof create> | null = null;
  const listeners = new Map<string, EventListener>();
  const originalDocument = globalThis.document;
  const originalCustomEvent = globalThis.CustomEvent;
  const originalWindow = globalThis.window;

  Object.assign(globalThis, {
    document: {
      activeElement: {
        dataset: { paletteSection: 'transpose' },
      },
    },
    CustomEvent: class TestCustomEvent<T = unknown> extends Event {
      detail: T;
      constructor(type: string, init?: CustomEventInit<T>) {
        super(type);
        this.detail = init?.detail as T;
      }
    },
    window: {
      setTimeout: (callback: () => void) => {
        callback();
        return 0;
      },
      addEventListener(name: string, listener: EventListener) {
        listeners.set(name, listener);
      },
      removeEventListener(name: string) {
        listeners.delete(name);
      },
    },
  });

  act(() => {
    renderer = create(React.createElement(EditPalette, paletteProps({
      iconMode: true,
      noteInputMode: true,
      selectedNote,
      selectedNotes: [selectedNote],
    })));
  });

  const focusListener = listeners.get('nex-note:focus-edit-palette-section');
  assert.ok(focusListener);
  act(() => {
    focusListener!(new CustomEvent('nex-note:focus-edit-palette-section', { detail: { section: 'transpose' } }));
  });
  assert.ok(renderer!.root.findAllByProps({ role: 'dialog', 'aria-label': 'Transpose' })[0]);

  act(() => {
    focusListener!(new CustomEvent('nex-note:focus-edit-palette-section', { detail: { section: 'ties' } }));
  });
  assert.ok(renderer!.root.findAllByProps({ role: 'dialog', 'aria-label': 'Ties / Slurs' })[0]);
  assert.ok(renderer!.root.findAllByType('button').some((button) => (
    button.props.title === 'Add tied note or chord (T)'
  )));

  const rail = renderer!.root.findAll((node: ReactTestInstance) => node.type === 'div' && typeof node.props.onKeyDown === 'function')[0];
  act(() => {
    rail.props.onKeyDown({ key: 'ArrowRight', preventDefault() {} });
  });
  assert.ok(renderer!.root.findAllByProps({ role: 'dialog', 'aria-label': 'Transpose' })[0]);

  act(() => {
    renderer?.unmount();
  });

  Object.assign(globalThis, {
    document: originalDocument,
    CustomEvent: originalCustomEvent,
    window: originalWindow,
  });
});

test('NotationToolbar exposes MuseScore tuplet buttons 2 through 9', () => {
  const [selectedNote] = makeSelectedNotes(SAMPLE_XML);
  const tuplets: number[] = [];
  let renderer: ReturnType<typeof create> | null = null;

  act(() => {
    renderer = create(React.createElement(NotationToolbar, toolbarProps({
      selectedNote,
      onAddTuplet(tuplet) { tuplets.push(tuplet); },
    })));
  });

  const root = renderer!.root;
  const titles = root.findAllByType('button').map((button) => button.props.title).filter(Boolean);
  assert.ok(titles.includes('Duplet 2:3 from selection (Cmd/Ctrl+2)'));
  assert.ok(titles.includes('Triplet from selection (Cmd/Ctrl+3)'));
  assert.ok(titles.includes('Nonuplet 9:8 from selection (Cmd/Ctrl+9)'));

  act(() => {
    root.findAllByProps({ title: 'Septuplet 7:4 from selection (Cmd/Ctrl+7)' })[0].props.onClick();
  });

  assert.deepEqual(tuplets, [7]);

  act(() => {
    renderer?.unmount();
  });
});

test('NotationToolbar exposes interval entry buttons 1 through 9', () => {
  const [selectedNote] = makeSelectedNotes(SAMPLE_XML);
  const intervals: number[] = [];
  let renderer: ReturnType<typeof create> | null = null;

  act(() => {
    renderer = create(React.createElement(NotationToolbar, toolbarProps({
      selectedNote,
      onAddInterval(interval) { intervals.push(interval); },
    })));
  });

  const root = renderer!.root;
  const titles = root.findAllByType('button').map((button) => button.props.title).filter(Boolean);
  assert.ok(titles.includes('Add unison above (Alt/Option+1)'));
  assert.ok(titles.includes('Add third above (Alt/Option+3)'));
  assert.ok(titles.includes('Add ninth above (Alt/Option+9)'));

  act(() => {
    root.findAllByProps({ title: 'Add fifth above (Alt/Option+5)' })[0].props.onClick();
  });
  assert.deepEqual(intervals, [5]);

  act(() => {
    renderer?.unmount();
  });
});

test('NotationToolbar exposes dynamics and barline quick controls', () => {
  const [selectedNote] = makeSelectedNotes(SAMPLE_XML);
  const dynamics: string[] = [];
  const barlines: string[] = [];
  let renderer: ReturnType<typeof create> | null = null;

  act(() => {
    renderer = create(React.createElement(NotationToolbar, toolbarProps({
      selectedNote,
      onAddDynamic(dynamic) { dynamics.push(dynamic); },
      onSetBarline(barline) { barlines.push(barline); },
    })));
  });

  const root = renderer!.root;
  const titles = root.findAllByType('button').map((button) => button.props.title).filter(Boolean);
  assert.ok(titles.includes('Pianissimo'));
  assert.ok(titles.includes('Sforzando'));
  assert.ok(titles.includes('Double barline'));
  assert.ok(titles.includes('End repeat'));

  act(() => {
    root.findAllByProps({ title: 'Sforzando' })[0].props.onClick();
    root.findAllByProps({ title: 'End repeat' })[0].props.onClick();
  });

  assert.deepEqual(dynamics, ['sfz']);
  assert.deepEqual(barlines, ['repeat-end']);

  act(() => {
    renderer?.unmount();
  });
});

test('NotationToolbar exposes GuitarPro-style string and fret entry', () => {
  const [selectedNote] = makeSelectedNotes(SAMPLE_XML);
  const selectedTabNote = { ...selectedNote!, guitar: { string: 6 as const, fret: 3, tuning: 'standard', techniques: ['palm-mute' as const] } };
  const inserted: Array<{ string: number; fret: number; tuning?: string }> = [];
  let toggledGuitarInput = 0;
  let selectedTuning = '';
  const toggledTechniques: string[] = [];
  let renderer: ReturnType<typeof create> | null = null;

  act(() => {
    renderer = create(React.createElement(NotationToolbar, toolbarProps({
      selectedNote: selectedTabNote,
      guitarInputMode: true,
      selectedGuitarString: 6,
      selectedGuitarFret: 3,
      selectedGuitarTuning: 'drop-d',
      guitarFretBuffer: '12',
      onToggleGuitarInputMode() { toggledGuitarInput += 1; },
      onInsertGuitarFret(string, fret, tuning) { inserted.push({ string, fret, tuning }); },
      onGuitarTuningChange(tuning) { selectedTuning = tuning; },
      onToggleGuitarTechnique(technique) { toggledTechniques.push(technique); },
    })));
  });

  const root = renderer!.root;
  act(() => {
    root.findAllByProps({ title: 'Guitar tab input (TAB button)' })[0].props.onClick();
    root.findAllByProps({ title: 'Guitar tuning' })[0].props.onChange({ target: { value: 'open-g' } });
    root.findAllByProps({ title: 'String 5 A2 (Alt+5)' })[0].props.onClick();
    root.findAllByProps({ title: 'Fret 7: A2' })[0].props.onClick();
    root.findAllByProps({ title: 'Palm mute' })[0].props.onClick();
    root.findAllByProps({ title: 'Slide' })[0].props.onClick();
  });

  assert.equal(toggledGuitarInput, 1);
  assert.equal(selectedTuning, 'open-g');
  assert.deepEqual(inserted, [{ string: 5, fret: 3, tuning: 'drop-d' }, { string: 6, fret: 7, tuning: 'drop-d' }]);
  assert.deepEqual(toggledTechniques, ['palm-mute', 'slide']);
  const texts = root.findAll((node) => typeof node.children?.[0] === 'string').map((node) => String(node.children.join('')));
  assert.ok(texts.includes('6/12 F2'));
  assert.ok(root.findAllByProps({ title: 'C4 · Piano · M1 · Staff 1 · Voice 1 · 0/4 · String 6 · Fret 3' }).length > 0);
  assert.ok(root.findAllByProps({ 'data-testid': 'guitar-tab-mini-grid' }).length > 0);

  act(() => {
    renderer?.unmount();
  });
});

test('ScoreInputOverlay keeps standard note entry focused on the notation glyph', () => {
  let renderer: ReturnType<typeof create> | null = null;
  act(() => {
    renderer = create(React.createElement(ScoreInputOverlay, {
      enabled: true,
      duration: '8',
      isDotted: false,
      target: {
        measureNumber: 1,
        staffIndex: 1,
        timestampNum: 0,
        timestampDen: 4,
        voiceId: 1,
        step: 'B',
        octave: 4,
        alter: 0,
        previewLeft: 96,
        previewTop: 64,
        previewWidth: 28,
        previewHeight: 54,
        accidentalOffsetX: 0,
        noteheadCenterX: 10.5,
        stemDirection: 'down',
        placementMode: 'insert',
        ledgerLines: [],
        reflowHints: [{
          left: 4,
          top: 4,
          shiftX: 12,
          width: 24,
          height: 24,
        }],
      },
    }));
  });

  const root = renderer!.root;
  const preview = root.findAll((node: ReactTestInstance) => node.props['data-testid'] === 'ghost-note-preview')[0];
  assert.equal(preview.props['data-ghost-stem'], 'down');
  assert.equal(root.findAllByProps({ 'data-engraving-source': 'vexflow' }).length, 1);
  assert.equal(root.findAll((node) => node.props['data-testid'] === 'ghost-piano-roll').length, 0);
  assert.equal(
    root.findAll((node) => node.props.style?.transform === 'translateX(12px)').length,
    0,
  );

  act(() => {
    renderer?.unmount();
  });
});

test('ScoreInputOverlay identifies the non-committing duration-first pitch cursor separately from mouse ghosts', () => {
  let renderer: ReturnType<typeof create> | null = null;
  act(() => {
    renderer = create(React.createElement(ScoreInputOverlay, {
      enabled: true,
      duration: '4',
      isDotted: false,
      target: {
        measureNumber: 1,
        staffIndex: 1,
        timestampNum: 0,
        timestampDen: 4,
        voiceId: 2,
        step: 'F',
        octave: 5,
        alter: 1,
        previewLeft: 96,
        previewTop: 64,
        previewWidth: 28,
        previewHeight: 54,
        accidentalOffsetX: 9,
        noteheadCenterX: 19.5,
        stemDirection: 'down',
        placementMode: 'replace',
        ledgerLines: [],
        cursorOnly: true,
      },
    }));
  });

  const root = renderer!.root;
  const cursor = root.findAllByProps({ 'data-testid': 'duration-input-pitch-cursor' });
  assert.equal(cursor.length, 1);
  assert.equal(cursor[0]?.props['data-duration-input-cursor'], 'true');
  assert.equal(cursor[0]?.props['data-ghost-pitch'], 'F♯5');
  assert.equal(root.findAllByProps({ 'data-testid': 'ghost-note-preview' }).length, 0);

  act(() => {
    renderer?.unmount();
  });
});

test('ScoreInputOverlay exposes a stable chip, lane, caret, placement, and finger loupe', () => {
  let renderer: ReturnType<typeof create> | null = null;
  act(() => {
    renderer = create(React.createElement(ScoreInputOverlay, {
      enabled: true,
      duration: '4',
      isDotted: true,
      tabletEntryPhase: 'contact-preview',
      previewPointerType: 'touch',
      contactPoint: { x: 280, y: 220 },
      viewportBounds: { left: 0, top: 0, width: 320, height: 480 },
      target: {
        measureId: 'm1',
        measureNumber: 1,
        staffIndex: 1,
        timestampNum: 1,
        timestampDen: 4,
        voiceId: 3,
        step: 'F',
        octave: 4,
        alter: 1,
        previewLeft: 250,
        previewTop: 190,
        previewWidth: 28,
        previewHeight: 54,
        accidentalOffsetX: 9,
        noteheadCenterX: 19.5,
        stemDirection: 'down',
        placementMode: 'replace',
        ledgerLines: [],
      },
    }));
  });

  const root = renderer!.root;
  const preview = root.findAllByProps({ 'data-testid': 'ghost-note-preview' })[0]!;
  assert.equal(preview.props['data-tablet-entry-phase'], 'contact-preview');
  assert.equal(preview.props['data-preview-pointer-type'], 'touch');
  assert.equal(preview.props['data-preview-stable-pitch'], 'F♯4');
  assert.equal(preview.props['data-preview-stable-timestamp'], '1/4');
  assert.equal(preview.props['data-preview-voice'], 3);
  assert.equal(preview.props['data-preview-placement'], 'replace');
  const pitchChip = root.findAllByProps({ 'data-testid': 'pitch-chip' })[0]!;
  assert.match(nodeText(pitchChip), /F♯4/);
  assert.equal(pitchChip.props['aria-live'], undefined);
  assert.equal(pitchChip.props.role, undefined);
  assert.equal(root.findAllByProps({ 'data-testid': 'pitch-lane-indicator' }).length, 1);
  assert.equal(root.findAllByProps({ 'data-testid': 'onset-caret' }).length, 1);
  const loupe = root.findAllByProps({ 'data-testid': 'pitch-loupe' })[0]!;
  assert.equal(loupe.props['data-loupe-placement'], 'above-left');
  assert.match(nodeText(loupe), /F♯4/);
  assert.match(nodeText(preview), /Replace/);
  assert.match(nodeText(preview), /Voice 3/);

  act(() => renderer?.unmount());
});

test('ScoreInputOverlay keeps the loupe contact-only and out of ordinary mouse hover', () => {
  let renderer: ReturnType<typeof create> | null = null;
  act(() => {
    renderer = create(React.createElement(ScoreInputOverlay, {
      enabled: true,
      duration: '8',
      isDotted: false,
      tabletEntryPhase: 'idle',
      previewPointerType: 'mouse',
      target: {
        measureNumber: 1,
        staffIndex: 1,
        timestampNum: 0,
        timestampDen: 1,
        voiceId: 1,
        step: 'C',
        octave: 4,
        alter: 0,
        previewLeft: 96,
        previewTop: 64,
        previewWidth: 28,
        previewHeight: 54,
        accidentalOffsetX: 0,
        noteheadCenterX: 10.5,
        stemDirection: 'up',
        placementMode: 'insert',
        ledgerLines: [],
      },
    }));
  });

  assert.equal(renderer!.root.findAllByProps({ 'data-testid': 'pitch-loupe' }).length, 0);
  assert.equal(renderer!.root.findAllByProps({ 'data-testid': 'pitch-chip' }).length, 1);
  act(() => renderer?.unmount());
});

test('NoteInputToolbar exposes the localized input-audition preference', () => {
  let toggled = 0;
  let renderer: ReturnType<typeof create> | null = null;
  act(() => {
    renderer = create(React.createElement(NoteInputToolbar, noteInputToolbarProps({
      inputAuditionEnabled: true,
      onToggleInputAudition() {
        toggled += 1;
      },
    })));
  });
  const button = renderer!.root.findAll((node) => (
    node.type === 'button' && node.props.title === 'Input audition'
  ))[0]!;
  assert.equal(button.props['aria-pressed'], true);
  act(() => button.props.onClick());
  assert.equal(toggled, 1);
  act(() => renderer?.unmount());
});

test('ScoreLibrary filters, favorites, opens, removes, and clears saved scores', async () => {
  const alpha = saveLibraryScore({ name: 'alpha.musicxml', xml: SAMPLE_XML });
  const beta = saveLibraryScore({ name: 'beta.mxl', xml: SAMPLE_XML.replace('C', 'D') });
  let openedId: string | null = null;

  let renderer: ReturnType<typeof create> | null = null;
  await act(async () => {
    renderer = create(React.createElement(ScoreLibrary, {
      currentScoreId: alpha.id,
      onOpenScore(score) { openedId = score.id; },
    }));
  });

  const root = renderer!.root;
  assert.equal(root.findAllByType('input')[0].props.placeholder, 'Filter by title or format...');
  assert.ok(root.findAll((node) => node.children?.includes?.('alpha.musicxml')).length > 0);
  assert.ok(root.findAll((node) => node.children?.includes?.('beta.mxl')).length > 0);
  assert.ok(root.findAll((node) => String(node.props.className ?? '').includes('bg-nex-accent text-white')).length > 0);

  await act(async () => {
    root.findAllByType('input')[0].props.onChange({ target: { value: 'beta' } });
  });
  assert.equal(root.findAll((node) => node.children?.includes?.('alpha.musicxml')).length, 0);
  assert.ok(root.findAll((node) => node.children?.includes?.('beta.mxl')).length > 0);

  await act(async () => {
    root.findAll((node) =>
      node.props.role === 'button'
      && typeof node.props.onClick === 'function'
      && node.findAll?.((child) => child.children?.includes?.('beta.mxl')).length > 0
    )[0].props.onClick();
  });
  assert.equal(root.findAll((node) => node.children?.includes?.('selected')).length, 1);

  await act(async () => {
    root.findAllByProps({ title: 'Toggle favorite' })[0].props.onClick();
  });
  await act(async () => {
    root.findAllByType('button').find((button) => button.children.includes('Favorites'))?.props.onClick();
  });
  assert.equal(root.findAll((node) => node.children?.includes?.('beta.mxl')).length, 1);

  await act(async () => {
    root.findAllByType('button').find((button) => button.children.includes('Open'))?.props.onClick();
  });
  assert.equal(openedId, beta.id);

  await act(async () => {
    root.findAllByType('button').find((button) => button.children.includes('Remove'))?.props.onClick();
  });
  assert.equal(root.findAll((node) => node.children?.includes?.('beta.mxl')).length, 0);

  await act(async () => {
    root.findAllByType('button').find((button) => button.children.includes('Clear all'))?.props.onClick();
  });
  assert.ok(root.findAll((node) => node.children?.includes?.('No scores in the library yet')).length > 0);

  await act(async () => {
    renderer?.unmount();
  });
});

test('ScoreLibrary cards use cropped real embedded score previews', async () => {
  const saved = saveLibraryScore({ name: 'preview.musicxml', xml: SAMPLE_XML });
  const originalFetch = globalThis.fetch;
  const previewRequests: Array<{ url: string; body: { entryId: string; xml: string; filename: string } }> = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    previewRequests.push({
      url: String(input),
      body: JSON.parse(String(init?.body ?? '{}')) as { entryId: string; xml: string; filename: string },
    });
    return Response.json({ previewId: 'preview-token' });
  }) as typeof fetch;

  let renderer: ReturnType<typeof create> | null = null;
  try {
    await act(async () => {
      renderer = create(React.createElement(ScoreLibrary, {
        currentScoreId: saved.id,
        onOpenScore() {},
      }));
    });
    await act(async () => {});
    await act(async () => {});

    const root = renderer!.root;
    assert.equal(
      root.findAll((node) => node !== root && nodeText(node).includes('MUSICXML') && nodeText(node).includes('parts')).length,
      0,
      'old textual score summary should not be rendered as the card preview',
    );

    const iframe = root.findAllByProps({ 'data-testid': 'library-score-preview-iframe' })[0];
    assert.ok(iframe);
    const previewDataSource = buildLibraryScorePreviewDataSource('preview-token', saved.id);
    assert.equal(
      iframe.props.src,
      buildEmbeddedScorePreviewUrl(saved, previewDataSource),
      'score card preview should use the embedded score iframe helper',
    );
    assert.match(iframe.props.src, /^\/nex-note-app\?/);
    assert.doesNotMatch(iframe.props.src, /^\/\?/);
    assert.match(iframe.props.src, /embed=1/);
    assert.match(iframe.props.src, /chrome=0/);
    assert.match(iframe.props.src, /entry=/);
    assert.match(iframe.props.src, /scoreDataUrl=%2Fapi%2Flibrary-score-preview%3FpreviewId%3Dpreview-token/);
    assert.doesNotMatch(iframe.props.src, /<score-partwise/);
    assert.equal(iframe.props.referrerPolicy, 'no-referrer');

    assert.equal(previewRequests.length, 1);
    assert.equal(previewRequests[0].url, '/api/library-score-preview');
    assert.equal(previewRequests[0].body.entryId, saved.id);
    assert.equal(previewRequests[0].body.xml, SAMPLE_XML);
    assert.equal(previewRequests[0].body.filename, 'preview.musicxml');

    const frame = root.findAllByProps({ 'data-testid': 'library-score-preview-frame' })[0];
    assert.ok(frame);
    assert.equal(frame.props.style, SCORE_LIBRARY_PREVIEW_CONTAINER_STYLE);
    assert.equal(frame.props.style.overflow, 'hidden');
    assert.equal(frame.props.style.height, '168px');
    assert.equal(iframe.props.style, SCORE_LIBRARY_PREVIEW_IFRAME_STYLE);
    assert.equal(iframe.props.style.pointerEvents, 'none');
    assert.match(String(iframe.props.style.top), /^-/);
    assert.equal(iframe.props.style.height, '560px');
  } finally {
    await act(async () => {
      renderer?.unmount();
    });
    globalThis.fetch = originalFetch;
  }
});

test('RecentFiles opens saved library scores directly when available', async () => {
  const saved = saveLibraryScore({ name: 'song.mxl', xml: SAMPLE_XML });
  addRecentFile('song.mscz', 12345);

  let openedId: string | null = null;
  let pickerUsed = false;
  let renderer: ReturnType<typeof create> | null = null;
  await act(async () => {
    renderer = create(React.createElement(RecentFiles, {
      onFileSelected() { pickerUsed = true; },
      onOpenSavedScore(score) { openedId = score.id; },
    }));
  });

  await act(async () => {
    renderer!.root.findAllByType('button').find((button) => (
      button.findAll((node) => node.children?.includes?.('song.mscz')).length > 0
    ))?.props.onClick();
  });

  assert.equal(openedId, saved.id);
  assert.equal(pickerUsed, false);

  await act(async () => {
    renderer?.unmount();
  });
});

test('ScoreInspector dispatches visible selection and measure commands', async () => {
  const notes = makeSelectedNotes(INSPECTOR_XML);
  const selectedNotes = notes.slice(0, 2);
  const coreDocument = importMusicXmlToCore(INSPECTOR_XML);
  const calls: Array<{ label?: string; commands: unknown[] }> = [];

  let renderer: ReturnType<typeof create> | null = null;
  await act(async () => {
    renderer = create(React.createElement(ScoreInspector, {
      xml: INSPECTOR_XML,
      coreDocument,
      selection: {
        entityIds: selectedNotes.map((note) => note.coreEntityId ?? '').filter(Boolean),
        anchorEntityId: selectedNotes[0].coreEntityId ?? null,
        anchor: selectedNotes[0],
        selectionCount: selectedNotes.length,
        partId: selectedNotes[0].corePartId ?? null,
        staffIndex: selectedNotes[0].staffIndex,
        voiceId: selectedNotes[0].voiceId,
      },
      selectedNote: notes[2],
      selectedNotes,
      currentMeasure: 2,
      onApplyCommands(commands, label) {
        calls.push({ commands, label });
      },
      onOpenExtractedPart() {},
    }));
  });

  const root = renderer!.root;

  await act(async () => {
    buttonWithText(root, 'Measure').props.onClick();
  });

  await act(async () => {
    buttonWithText(root, 'Transpose +2').props.onClick();
    buttonWithText(root, 'Toggle staccato').props.onClick();
    buttonWithText(root, 'Insert after m.2').props.onClick();
    buttonWithText(root, 'Delete m.2').props.onClick();
    buttonWithText(root, 'open').props.onClick();
  });

  assert.equal(calls.length, 5);
  assert.equal(calls[0]?.label, 'Transpose selected range +2');
  assert.deepEqual(calls[0]?.commands, [{
    type: 'transposeRangeChromatic',
    semitones: 2,
    range: {
      start: { measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 4 },
      end: { measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 1, timestampDen: 4 },
    },
  }]);
  assert.equal(calls[1]?.label, 'Toggle staccato on selection');
  assert.equal((calls[1]?.commands as Array<{ type: string; articulation?: string }>).every((command) => (
    command.type === 'toggleArticulation' && command.articulation === 'staccato'
  )), true);
  assert.deepEqual(calls[2]?.commands, [{ type: 'insertMeasureAfter', measureNumber: 2 }]);
  assert.deepEqual(calls[3]?.commands, [{ type: 'deleteMeasure', measureNumber: 2 }]);
  assert.equal(calls[4]?.label, 'Open collision spacing');
  assert.deepEqual(calls[4]?.commands, [{
    type: 'setMeasureLayoutHint',
    measureNumber: 2,
    hint: 'collisionPolicy',
    value: 'open',
    staffIndex: 1,
  }]);

  await act(async () => {
    renderer?.unmount();
  });
});

test('ScoreInspector batches courtesy accidental controls across the semantic selection', async () => {
  const notes = makeSelectedNotes(INSPECTOR_XML).slice(0, 2).map((note, index) => ({
    ...note,
    writtenAccidental: index === 0 ? 'sharp' as const : 'natural' as const,
  }));
  const calls: Array<{ label?: string; commands: Array<{ type: string; cautionary?: boolean; enclosure?: string }> }> = [];
  let renderer: ReturnType<typeof create> | null = null;

  await act(async () => {
    renderer = create(React.createElement(ScoreInspector, {
      xml: INSPECTOR_XML,
      coreDocument: importMusicXmlToCore(INSPECTOR_XML),
      selection: {
        entityIds: notes.map((note) => note.coreEntityId ?? '').filter(Boolean),
        anchorEntityId: notes[0]!.coreEntityId ?? null,
        anchor: notes[0]!,
        selectionCount: notes.length,
      },
      selectedNote: notes[0]!,
      selectedNotes: notes,
      currentMeasure: 1,
      onApplyCommands(commands, label) {
        calls.push({ commands, label });
      },
      onOpenExtractedPart() {},
    }));
  });

  const checkbox = renderer!.root.findByProps({ 'aria-label': 'Mark selected accidentals as cautionary' });
  const enclosure = renderer!.root.findByProps({ 'aria-label': 'Accidental enclosure' });
  await act(async () => checkbox.props.onChange({ target: { checked: true } }));
  await act(async () => enclosure.props.onChange({ target: { value: 'square' } }));

  assert.equal(calls.length, 2);
  assert.equal(calls[0]?.commands.length, 2);
  assert.equal(calls[0]?.commands.every((command) => command.type === 'setAccidentalDisplay' && command.cautionary === true && command.enclosure === 'none'), true);
  assert.equal(calls[1]?.commands.length, 2);
  assert.equal(calls[1]?.commands.every((command) => command.type === 'setAccidentalDisplay' && command.cautionary === false && command.enclosure === 'square'), true);

  await act(async () => renderer?.unmount());
});

test('ScoreInspector measure buttons can mutate the live document through the app command path', async () => {
  const ref: {
    current: null | {
      measureCount: () => number;
    };
  } = { current: null };

  function Harness() {
    const { xml, coreDocument, applyCommands } = useScoreDocument(INSPECTOR_XML);
    const notes = makeSelectedNotes(xml);
    const selectedNote = notes.find((note) => note.measureNumber === 2) ?? null;

    ref.current = {
      measureCount: () => (xml.match(/<measure\b/g) ?? []).length,
    };

    return React.createElement(ScoreInspector, {
      xml,
      coreDocument,
      selection: undefined,
      selectedNote,
      selectedNotes: selectedNote ? [selectedNote] : [],
      currentMeasure: 2,
      onApplyCommands(commands, label) {
        applyCommands(commands, { label });
      },
      onOpenExtractedPart() {},
    });
  }

  let renderer: ReturnType<typeof create> | null = null;
  await act(async () => {
    renderer = create(React.createElement(Harness));
  });

  assert.equal(ref.current?.measureCount(), 2);

  await act(async () => {
    buttonWithText(renderer!.root, 'Measure').props.onClick();
  });

  await act(async () => {
    buttonWithText(renderer!.root, 'Insert after m.2').props.onClick();
  });
  assert.equal(ref.current?.measureCount(), 3);

  await act(async () => {
    buttonWithText(renderer!.root, 'Delete m.2').props.onClick();
  });
  assert.equal(ref.current?.measureCount(), 2);

  await act(async () => {
    renderer?.unmount();
  });
});

test('ScoreInspector prefills lyric and dynamic fields from the selected note and Enter submits text edits', async () => {
  const xml = fs.readFileSync(new URL('./fixtures/choir-lyrics.musicxml', import.meta.url), 'utf8');
  const coreDocument = importMusicXmlToCore(xml);
  const selectedNote = makeSelectedNotes(xml).find((note) => note.measureNumber === 1 && note.timestampNum === 0) ?? null;
  assert.ok(selectedNote);
  const calls: Array<{ label?: string; commands: unknown[] }> = [];

  let renderer: ReturnType<typeof create> | null = null;
  await act(async () => {
    renderer = create(React.createElement(ScoreInspector, {
      xml,
      coreDocument,
      selection: undefined,
      selectedNote,
      selectedNotes: selectedNote ? [selectedNote] : [],
      currentMeasure: 1,
      onApplyCommands(commands, label) {
        calls.push({ commands, label });
      },
      onOpenExtractedPart() {},
    }));
  });

  const root = renderer!.root;
  const lyricInput = root.findAllByProps({ placeholder: 'Lyric for selected note' })[0];
  const verseInput = root.findAllByProps({ placeholder: 'Verse' })[0];
  const dynamicSelect = root.findAllByProps({ id: 'inspector-dynamic-marking' })[0];

  assert.equal(lyricInput.props.value, 'Hal');
  assert.equal(verseInput.props.value, '1');
  assert.equal(dynamicSelect.props.value, 'mf');

  await act(async () => {
    lyricInput.props.onChange({ target: { value: 'La' } });
  });
  await act(async () => {
    renderer!.root.findAllByProps({ placeholder: 'Lyric for selected note' })[0].props.onKeyDown({
      key: 'Enter',
      preventDefault() {},
    });
  });

  const rehearsalInput = root.findAllByProps({ placeholder: 'Rehearsal mark, e.g. A' })[0];
  await act(async () => {
    rehearsalInput.props.onChange({ target: { value: 'B' } });
  });
  await act(async () => {
    renderer!.root.findAllByProps({ placeholder: 'Rehearsal mark, e.g. A' })[0].props.onKeyDown({
      key: 'Enter',
      preventDefault() {},
    });
  });

  assert.equal(calls[0]?.label, 'Add lyric');
  assert.deepEqual(calls[0]?.commands, [{
    type: 'setLyricLine',
    verseNumber: 1,
    text: 'La',
    syllabic: 'single',
        measureNumber: 1,
        staffIndex: 1,
        voiceId: 1,
        timestampNum: 0,
        timestampDen: 8,
      }]);
  assert.equal(calls[1]?.label, 'Rehearsal mark');
  assert.deepEqual(calls[1]?.commands, [{
    type: 'addRehearsalMark',
    measureNumber: 1,
    text: 'B',
  }]);

  await act(async () => {
    renderer?.unmount();
  });
});

test('ScoreInspector exposes safe placement controls for expression text and dynamics', async () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <direction placement="above"><direction-type><dynamics><mf/></dynamics></direction-type><offset>0</offset><staff>1</staff></direction>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`;
  const coreDocument = importMusicXmlToCore(xml);
  const selectedNote = makeSelectedNotes(xml)[0] ?? null;
  assert.ok(selectedNote);
  const calls: Array<{ label?: string; commands: unknown[] }> = [];

  let renderer: ReturnType<typeof create> | null = null;
  await act(async () => {
    renderer = create(React.createElement(ScoreInspector, {
      xml,
      coreDocument,
      selection: undefined,
      selectedNote,
      selectedNotes: selectedNote ? [selectedNote] : [],
      currentMeasure: 1,
      onApplyCommands(commands, label) {
        calls.push({ commands, label });
      },
      onOpenExtractedPart() {},
    }));
  });

  const root = renderer!.root;
  const staffTextInput = root.findAllByProps({ placeholder: 'Staff text / expression' })[0];
  const textKindSelect = root.findAllByProps({ id: 'inspector-text-kind' })[0];
  const textPlacementSelect = root.findAllByProps({ id: 'inspector-text-placement' })[0];
  const dynamicMarkingSelect = root.findAllByProps({ id: 'inspector-dynamic-marking' })[0];
  const dynamicPlacementSelect = root.findAllByProps({ id: 'inspector-dynamic-placement' })[0];

  assert.equal(dynamicMarkingSelect.props.value, 'mf');
  assert.equal(dynamicPlacementSelect.props.value, 'above');

  await act(async () => {
    textKindSelect.props.onChange({ target: { value: 'expression' } });
    textPlacementSelect.props.onChange({ target: { value: 'below' } });
    staffTextInput.props.onChange({ target: { value: 'dolce' } });
  });
  await act(async () => {
    buttonWithText(root, 'Add expression below staff').props.onClick();
  });

  await act(async () => {
    dynamicPlacementSelect.props.onChange({ target: { value: 'below' } });
    dynamicMarkingSelect.props.onChange({ target: { value: 'ff' } });
  });
  await act(async () => {
    buttonWithText(root, 'Add dynamic').props.onClick();
  });

  assert.deepEqual(calls[0], {
    label: 'Expression text',
    commands: [{
      type: 'addExpressionText',
      measureNumber: 1,
      text: 'dolce',
      placement: 'below',
    }],
  });
  assert.deepEqual(calls[1], {
    label: 'Add ff dynamic',
    commands: [{
      type: 'addDynamic',
      dynamic: 'ff',
      placement: 'below',
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 0,
      timestampDen: 4,
    }],
  });

  await act(async () => {
    renderer?.unmount();
  });
});

test('ScoreInspector exposes slur placement only for an existing selected slur span', async () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>1</duration>
        <voice>1</voice>
        <type>quarter</type>
        <notations><slur type="start" number="1" placement="above"/></notations>
        <staff>1</staff>
      </note>
      <note>
        <pitch><step>D</step><octave>4</octave></pitch>
        <duration>1</duration>
        <voice>1</voice>
        <type>quarter</type>
        <notations><slur type="stop" number="1" placement="above"/></notations>
        <staff>1</staff>
      </note>
      <note><rest/><duration>2</duration><voice>1</voice><type>half</type><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`;
  const coreDocument = importMusicXmlToCore(xml);
  const selectedNotes = makeSelectedNotes(xml).slice(0, 2);
  const calls: Array<{ label?: string; commands: unknown[] }> = [];

  let renderer: ReturnType<typeof create> | null = null;
  await act(async () => {
    renderer = create(React.createElement(ScoreInspector, {
      xml,
      coreDocument,
      selection: undefined,
      selectedNote: selectedNotes[0] ?? null,
      selectedNotes,
      currentMeasure: 1,
      onApplyCommands(commands, label) {
        calls.push({ commands, label });
      },
      onOpenExtractedPart() {},
    }));
  });

  const root = renderer!.root;
  const slurPlacementSelect = root.findAllByProps({ id: 'inspector-slur-placement' })[0];
  assert.equal(slurPlacementSelect.props.value, 'above');

  await act(async () => {
    slurPlacementSelect.props.onChange({ target: { value: 'below' } });
  });
  await act(async () => {
    buttonWithText(root, 'Apply slur placement').props.onClick();
  });

  assert.deepEqual(calls[0], {
    label: 'Set slur below',
    commands: [{
      type: 'setSlurPlacement',
      placement: 'below',
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 0,
      timestampDen: 4,
      stopLocator: {
        measureNumber: 1,
        staffIndex: 1,
        voiceId: 1,
        timestampNum: 1,
        timestampDen: 4,
      },
    }],
  });

  await act(async () => {
    renderer?.unmount();
  });
});

test('ScoreInspector exposes tie placement for an existing selected tie start', async () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>1</duration>
        <voice>1</voice>
        <type>quarter</type>
        <tie type="start"/>
        <notations><tied type="start" placement="above"/></notations>
        <staff>1</staff>
      </note>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>1</duration>
        <voice>1</voice>
        <type>quarter</type>
        <tie type="stop"/>
        <notations><tied type="stop"/></notations>
        <staff>1</staff>
      </note>
      <note><rest/><duration>2</duration><voice>1</voice><type>half</type><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`;
  const coreDocument = importMusicXmlToCore(xml);
  const selectedNotes = makeSelectedNotes(xml).slice(0, 1);
  const calls: Array<{ label?: string; commands: unknown[] }> = [];

  let renderer: ReturnType<typeof create> | null = null;
  await act(async () => {
    renderer = create(React.createElement(ScoreInspector, {
      xml,
      coreDocument,
      selection: undefined,
      selectedNote: selectedNotes[0] ?? null,
      selectedNotes,
      currentMeasure: 1,
      onApplyCommands(commands, label) {
        calls.push({ commands, label });
      },
      onOpenExtractedPart() {},
    }));
  });

  const root = renderer!.root;
  const tiePlacementSelect = root.findAllByProps({ id: 'inspector-tie-placement' })[0];
  assert.equal(tiePlacementSelect.props.value, 'above');

  await act(async () => {
    tiePlacementSelect.props.onChange({ target: { value: 'below' } });
  });
  await act(async () => {
    buttonWithText(root, 'Apply tie placement').props.onClick();
  });

  assert.deepEqual(calls[0], {
    label: 'Set tie below',
    commands: [{
      type: 'setTiePlacement',
      placement: 'below',
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 0,
      timestampDen: 4,
    }],
  });

  await act(async () => {
    renderer?.unmount();
  });
});

test('ScoreInspector exposes articulation placement for an existing selected articulation', async () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>4</duration>
        <voice>1</voice>
        <type>whole</type>
        <notations><articulations><accent placement="above"/></articulations></notations>
        <staff>1</staff>
      </note>
    </measure>
  </part>
</score-partwise>`;
  const coreDocument = importMusicXmlToCore(xml);
  const selectedNotes = makeSelectedNotes(xml).slice(0, 1);
  const calls: Array<{ label?: string; commands: unknown[] }> = [];

  let renderer: ReturnType<typeof create> | null = null;
  await act(async () => {
    renderer = create(React.createElement(ScoreInspector, {
      xml,
      coreDocument,
      selection: undefined,
      selectedNote: selectedNotes[0] ?? null,
      selectedNotes,
      currentMeasure: 1,
      onApplyCommands(commands, label) {
        calls.push({ commands, label });
      },
      onOpenExtractedPart() {},
    }));
  });

  const root = renderer!.root;
  const kindSelect = root.findAllByProps({ id: 'inspector-articulation-kind' })[0];
  const placementSelect = root.findAllByProps({ id: 'inspector-articulation-placement' })[0];
  assert.equal(kindSelect.props.value, 'accent');
  assert.equal(placementSelect.props.value, 'above');

  await act(async () => {
    placementSelect.props.onChange({ target: { value: 'below' } });
  });
  await act(async () => {
    buttonWithText(root, 'Apply articulation placement').props.onClick();
  });

  assert.deepEqual(calls[0], {
    label: 'Set Accent below',
    commands: [{
      type: 'setArticulationPlacement',
      articulation: 'accent',
      placement: 'below',
      measureNumber: 1,
      staffIndex: 1,
      voiceId: 1,
      timestampNum: 0,
      timestampDen: 4,
    }],
  });

  await act(async () => {
    renderer?.unmount();
  });
});
