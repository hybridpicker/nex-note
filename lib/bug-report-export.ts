import JSZip from 'jszip';
import {
  chooseBugReportDirectoryHandle,
  ensureBugReportDirectoryPermission,
  formatBugReportDirectoryLabel,
  getSavedBugReportDirectoryHandle,
  supportsBugReportDirectoryExport,
  writeBlobToBugReportDirectory,
} from '@/lib/bug-report-directory';
import { getBugReportContext, getBugReportEvents, type BugReportContextSnapshot, type BugReportEvent } from '@/lib/bug-report-recorder';

export interface BugReportChatMessage {
  role: 'user' | 'assistant';
  text: string;
  provider?: string;
  model?: string;
  latencyMs?: number;
}

export interface BugReportFormInput {
  title?: string;
  whatHappened: string;
  expected: string;
  stepsTried?: string;
  includeXml: boolean;
  includeChatTranscript: boolean;
  includeStorageSnapshot: boolean;
}

export interface BugReportBundle {
  schemaVersion: 1;
  generatedAt: string;
  source: 'nex-note-debug-report';
  userReport: {
    title: string;
    whatHappened: string;
    expected: string;
    stepsTried: string;
  };
  app: {
    name: 'nex-note';
    url: string;
    userAgent: string;
    language: string;
    debugEnabled: boolean;
    nodeEnv?: string;
    nextPublicDebug?: string;
  };
  currentScore: {
    filename: string;
    xml?: string;
  };
  context: BugReportContextSnapshot | null;
  recentActions: BugReportEvent[];
  chatTranscript?: BugReportChatMessage[];
  storageSnapshot?: Record<string, unknown>;
  promptForAgents: string;
  markdown: string;
}

function sanitizeFilenamePart(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'bug-report';
}

export function buildBugReportArchiveName(report: Pick<BugReportBundle, 'currentScore' | 'userReport'>) {
  const stem = sanitizeFilenamePart(`${report.currentScore.filename.replace(/\.[^.]+$/, '')}-${report.userReport.title}`);
  return `${stem}.zip`;
}

function summarizePayload(payload: unknown) {
  if (payload == null) return '';
  const serialized = JSON.stringify(payload);
  return serialized.length > 240 ? `${serialized.slice(0, 237)}...` : serialized;
}

function buildPrompt() {
  return [
    'Analyze this nex-note bug bundle.',
    'Reconstruct the user workflow from the recentActions trace and the report text.',
    'Focus on the most likely failing path before suggesting fixes.',
    'State the likely root cause, affected files/modules, and a minimal patch strategy.',
  ].join(' ');
}

function readStorageSnapshot() {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return {};
  const keys = [
    'nex-note:debug',
    'nex-note:doctor',
    'nex-note:doctor-rules',
    'nex-note:visual-debug',
    'nex-note:recent-files',
    'nex-note:score-library',
  ];
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    const raw = localStorage.getItem(key);
    if (!raw) continue;
    try {
      out[key] = JSON.parse(raw);
    } catch {
      out[key] = raw;
    }
  }
  return out;
}

function formatChatTranscript(messages: BugReportChatMessage[]) {
  if (!messages.length) return 'No chat transcript included.';
  return messages.map((message, index) => {
    const meta = [
      message.provider ? `provider=${message.provider}` : null,
      message.model ? `model=${message.model}` : null,
      typeof message.latencyMs === 'number' ? `latencyMs=${message.latencyMs}` : null,
    ].filter(Boolean).join(', ');
    return `${index + 1}. ${message.role}${meta ? ` (${meta})` : ''}\n${message.text}`;
  }).join('\n\n');
}

function buildMarkdown(report: Omit<BugReportBundle, 'markdown'>) {
  const context = report.context;
  const selectedNote = context?.selectedNote
    ? `m.${context.selectedNote.measureNumber} staff ${context.selectedNote.staffIndex} voice ${context.selectedNote.voiceId} ts=${context.selectedNote.timestampNum}/${context.selectedNote.timestampDen}`
    : 'none';
  const actions = report.recentActions.length
    ? report.recentActions.map((event, index) => (
      `${index + 1}. ${event.timestamp} | ${event.source}.${event.action}${event.payload != null ? ` | ${summarizePayload(event.payload)}` : ''}`
    )).join('\n')
    : 'No recorded actions.';

  return [
    '# nex-note bug report',
    '',
    '## User report',
    `Title: ${report.userReport.title}`,
    '',
    'What happened:',
    report.userReport.whatHappened,
    '',
    'Expected:',
    report.userReport.expected,
    '',
    'Steps tried:',
    report.userReport.stepsTried || 'Not provided.',
    '',
    '## Current score',
    `Filename: ${report.currentScore.filename}`,
    '',
    '## Runtime state',
    `Provider: ${context?.provider ?? 'unknown'}`,
    `Workspace tab: ${context?.workspaceTab ?? 'unknown'}`,
    `Selection count: ${context?.selectionCount ?? 0}`,
    `Selected note: ${selectedNote}`,
    `Playback state: ${context?.playback?.state ?? 'unknown'}`,
    `History depth: ${context?.historyDepth ?? 0}`,
    '',
    '## Recent actions',
    actions,
    '',
    '## Chat transcript',
    report.chatTranscript ? formatChatTranscript(report.chatTranscript) : 'Not included.',
    '',
    '## Suggested debugging prompt',
    report.promptForAgents,
    '',
  ].join('\n');
}

export function buildBugReportBundle(params: {
  form: BugReportFormInput;
  filename: string;
  xml: string;
  chatTranscript: BugReportChatMessage[];
}) {
  const context = getBugReportContext();
  const events = getBugReportEvents();
  const report: Omit<BugReportBundle, 'markdown'> = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: 'nex-note-debug-report',
    userReport: {
      title: params.form.title?.trim() || 'Bug report',
      whatHappened: params.form.whatHappened.trim(),
      expected: params.form.expected.trim(),
      stepsTried: params.form.stepsTried?.trim() || '',
    },
    app: {
      name: 'nex-note',
      url: typeof window !== 'undefined' ? window.location.href : '',
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      language: typeof navigator !== 'undefined' ? navigator.language : '',
      debugEnabled: true,
      nodeEnv: process.env.NODE_ENV,
      nextPublicDebug: process.env.NEXT_PUBLIC_DEBUG,
    },
    currentScore: {
      filename: params.filename || context?.filename || 'score.musicxml',
      xml: params.form.includeXml ? params.xml : undefined,
    },
    context,
    recentActions: events,
    chatTranscript: params.form.includeChatTranscript
      ? params.chatTranscript.slice(-30)
      : undefined,
    storageSnapshot: params.form.includeStorageSnapshot ? readStorageSnapshot() : undefined,
    promptForAgents: buildPrompt(),
  };

  return {
    ...report,
    markdown: buildMarkdown(report),
  } satisfies BugReportBundle;
}

export async function downloadBugReportBundle(report: BugReportBundle) {
  const zip = new JSZip();
  const archiveName = buildBugReportArchiveName(report);
  zip.file('bug-report.md', report.markdown);
  zip.file('bug-report.json', `${JSON.stringify(report, null, 2)}\n`);
  if (report.currentScore.xml) {
    zip.file(report.currentScore.filename || 'current-score.musicxml', report.currentScore.xml);
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = archiveName;
  link.click();
  URL.revokeObjectURL(url);
}

async function buildBugReportArchiveBlob(report: BugReportBundle) {
  const zip = new JSZip();
  zip.file('bug-report.md', report.markdown);
  zip.file('bug-report.json', `${JSON.stringify(report, null, 2)}\n`);
  if (report.currentScore.xml) {
    zip.file(report.currentScore.filename || 'current-score.musicxml', report.currentScore.xml);
  }
  return zip.generateAsync({ type: 'blob' });
}

export async function exportBugReportBundle(report: BugReportBundle) {
  const archiveName = buildBugReportArchiveName(report);
  if (!supportsBugReportDirectoryExport()) {
    await downloadBugReportBundle(report);
    return {
      target: 'download' as const,
      archiveName,
      locationLabel: 'Browser download fallback',
    };
  }

  const blob = await buildBugReportArchiveBlob(report);
  let handle = await getSavedBugReportDirectoryHandle();

  if (handle) {
    try {
      const granted = await ensureBugReportDirectoryPermission(handle);
      if (!granted) {
        handle = null;
      }
    } catch {
      handle = null;
    }
  }

  if (!handle) {
    try {
      handle = await chooseBugReportDirectoryHandle();
      if (!handle || !(await ensureBugReportDirectoryPermission(handle))) {
        handle = null;
      }
    } catch {
      handle = null;
    }
  }

  if (!handle) {
    await downloadBugReportBundle(report);
    return {
      target: 'download' as const,
      archiveName,
      locationLabel: 'Browser download fallback',
    };
  }

  await writeBlobToBugReportDirectory(handle, archiveName, blob);
  return {
    target: 'directory' as const,
    archiveName,
    locationLabel: formatBugReportDirectoryLabel(handle),
  };
}
