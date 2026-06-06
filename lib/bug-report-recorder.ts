export interface BugReportEvent {
  id: string;
  timestamp: string;
  source: string;
  action: string;
  payload?: unknown;
}

export interface BugReportContextSnapshot {
  filename?: string;
  currentScoreId?: string | null;
  scoreKey?: string;
  scoreRevision?: number;
  provider?: string;
  ollamaModel?: string;
  workspaceTab?: string;
  sidebarCollapsed?: boolean;
  printView?: boolean;
  selectionCount?: number;
  selectedMeasureNumbers?: number[];
  noteInputMode?: boolean;
  chordInputMode?: boolean;
  selectedDuration?: string;
  selectedVoice?: number;
  clipboardCount?: number;
  canUndo?: boolean;
  canRedo?: boolean;
  historyDepth?: number;
  historyMeta?: unknown;
  lastCommands?: unknown;
  lastOperations?: unknown;
  scoreStats?: {
    measures: number;
    parts: number;
    notes: number;
    hasSelection: boolean;
  };
  selectedNote?: {
    measureNumber: number;
    staffIndex: number;
    voiceId: number;
    timestampNum: number;
    timestampDen: number;
    step?: string;
    octave?: number;
    alter?: number;
    isRest?: boolean;
  } | null;
  playback?: {
    state: string;
    currentMeasure: number | null;
    currentBeat: number | null;
    totalBeats: number | null;
    midiLoading: boolean;
    hasMidi: boolean;
    error: string | null;
    tempoOverride: number | null;
    metronomeEnabled: boolean;
  };
  benchmark?: {
    loading: boolean;
    suiteRunning: boolean;
    ollamaSuiteRunning: boolean;
    benchmarkResultCount: number;
    suiteResultCount: number;
    ollamaSuiteRowCount: number;
  };
  doctor?: {
    enabled: boolean;
    mode: string;
    lastIssueCount: number | null;
    lastErrorCount: number | null;
    historyCount: number;
  };
}

const MAX_EVENTS = 250;

type RecorderState = {
  events: BugReportEvent[];
  context: BugReportContextSnapshot | null;
};

declare global {
  interface Window {
    __NEX_NOTE_BUG_REPORT_STATE__?: RecorderState;
  }
}

function getState(): RecorderState {
  if (typeof window === 'undefined') {
    return { events: [], context: null };
  }
  if (!window.__NEX_NOTE_BUG_REPORT_STATE__) {
    window.__NEX_NOTE_BUG_REPORT_STATE__ = {
      events: [],
      context: null,
    };
  }
  return window.__NEX_NOTE_BUG_REPORT_STATE__;
}

function safeSerialize(value: unknown) {
  if (value == null) return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return String(value);
  }
}

export function recordBugReportEvent(source: string, action: string, payload?: unknown) {
  if (typeof window === 'undefined') return;
  const state = getState();
  const entry: BugReportEvent = {
    id: `${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    source,
    action,
    payload: safeSerialize(payload),
  };
  state.events = [...state.events.slice(-(MAX_EVENTS - 1)), entry];
}

export function getBugReportEvents() {
  return [...getState().events];
}

export function setBugReportContext(context: BugReportContextSnapshot) {
  if (typeof window === 'undefined') return;
  getState().context = safeSerialize(context) as BugReportContextSnapshot;
}

export function getBugReportContext() {
  return getState().context;
}
