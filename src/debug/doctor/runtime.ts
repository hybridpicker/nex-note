import { getBugReportContext, getBugReportEvents, recordBugReportEvent } from '@/lib/bug-report-recorder';
import {
  buildDoctorCodexReport,
  buildDoctorCodexPrompt,
  doctorCodexPromptSignature,
  readDoctorCodexHandoffMode,
} from '@/src/debug/doctor/codex-handoff';
import { readDoctorSettings } from '@/src/debug/doctor/flags';
import { DOCTOR_RULES } from '@/src/debug/doctor/rulebook';
import type { DoctorDomain, DoctorReport, DoctorSettings } from '@/src/debug/doctor/types';

type DoctorRunner = (domain?: DoctorDomain) => DoctorReport | null | Promise<DoctorReport | null>;

interface DoctorRuntimeState {
  settings: DoctorSettings;
  history: DoctorReport[];
  lastReport: DoctorReport | null;
  lastCodexPrompt: string | null;
  lastCodexPromptSignature: string | null;
  lastCodexAutoCopySignature: string | null;
  runner: DoctorRunner | null;
}

declare global {
  interface Window {
    __NEX_NOTE_DOCTOR__?: DoctorRuntimeState;
    nexDebug?: {
      status: () => unknown;
      rules: (domain?: DoctorDomain) => unknown;
      history: () => DoctorReport[];
      lastReport: () => DoctorReport | null;
      runAll: () => Promise<DoctorReport | null>;
      run: (domain: DoctorDomain) => Promise<DoctorReport | null>;
      copyReport: () => Promise<boolean>;
      copyLastFailures: () => Promise<boolean>;
      codexPrompt: () => string | null;
      copyCodexPrompt: () => Promise<boolean>;
      startCodex: () => Promise<unknown>;
      showPanel: () => DoctorReport | null;
      hidePanel: () => void;
      freeze: () => DoctorReport | null;
    };
  }
}

const MAX_DOCTOR_HISTORY = 100;

function getRuntimeState(): DoctorRuntimeState | null {
  if (typeof window === 'undefined') return null;
  if (!window.__NEX_NOTE_DOCTOR__) {
    window.__NEX_NOTE_DOCTOR__ = {
      settings: readDoctorSettings(),
      history: [],
      lastReport: null,
      lastCodexPrompt: null,
      lastCodexPromptSignature: null,
      lastCodexAutoCopySignature: null,
      runner: null,
    };
  }
  return window.__NEX_NOTE_DOCTOR__;
}

async function writeTextToClipboard(text: string) {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function reportConsoleLevel(report: DoctorReport) {
  if (report.errorCount > 0) return 'warn';
  if (report.warningCount > 0) return 'warn';
  return 'info';
}

export function doctorReportHasCodexHandoff(report: Pick<DoctorReport, 'issueCount' | 'errorCount' | 'warningCount'>) {
  return report.issueCount > 0 || report.errorCount > 0 || report.warningCount > 0;
}

function getOrCreateCodexPrompt(state: DoctorRuntimeState, report: DoctorReport) {
  if (!doctorReportHasCodexHandoff(report)) return null;
  const signature = doctorCodexPromptSignature(report);
  if (state.lastCodexPrompt && state.lastCodexPromptSignature === signature) {
    return state.lastCodexPrompt;
  }

  const prompt = buildDoctorCodexPrompt({
    report,
    context: getBugReportContext(),
    recentEvents: getBugReportEvents(),
  });
  state.lastCodexPrompt = prompt;
  state.lastCodexPromptSignature = signature;
  return prompt;
}

function styleDoctorPanelButton(button: HTMLButtonElement) {
  button.type = 'button';
  button.style.border = '1px solid rgba(226, 232, 240, 0.24)';
  button.style.borderRadius = '7px';
  button.style.background = 'rgba(255, 255, 255, 0.08)';
  button.style.color = 'white';
  button.style.padding = '5px 9px';
}

function compactStatusText(value: unknown, maxLength = 140) {
  const text = typeof value === 'string'
    ? value
    : value == null
      ? ''
      : String(value);
  const compact = text.replace(/\s+/g, ' ').trim();
  return compact.length > maxLength
    ? `${compact.slice(0, Math.max(0, maxLength - 3))}...`
    : compact;
}

export function formatCodexHandoffButtonTitle(result: unknown) {
  const payload = result && typeof result === 'object'
    ? result as Record<string, unknown>
    : {};
  const id = compactStatusText(payload.id, 64);
  const suffix = id ? ` (${id})` : '';

  if (payload.ok === true) {
    return payload.mode === 'terminal'
      ? `Codex handoff succeeded: Terminal opened${suffix}.`
      : `Codex handoff succeeded${suffix}.`;
  }

  const error = compactStatusText(payload.error || result);
  return error
    ? `Codex handoff failed: ${error}`
    : 'Codex handoff failed.';
}

async function startCodexFromReport(report: DoctorReport) {
  const state = getRuntimeState();
  const prompt = state ? getOrCreateCodexPrompt(state, report) : null;
  if (!prompt) return { ok: false, error: 'No Codex prompt is available for this report.' };
  const codexReport = buildDoctorCodexReport(report);

  let responseOk = false;
  let result: unknown;
  try {
    const response = await fetch('/api/codex-handoff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        report: codexReport,
        signature: state?.lastCodexPromptSignature ?? doctorCodexPromptSignature(report),
        openTerminal: true,
      }),
    });
    responseOk = response.ok;
    result = await response.json().catch(() => ({ ok: false, error: response.statusText }));
  } catch (err) {
    result = { ok: false, error: String(err) };
  }
  recordBugReportEvent('doctor-codex', responseOk && (result as { ok?: boolean } | null)?.ok ? 'start-codex' : 'start-codex-failed', {
    generatedAt: report.generatedAt,
    revision: report.revision,
    errorCount: report.errorCount,
    promptLength: prompt.length,
    result,
  });
  return result;
}

function renderDoctorPanel(report: DoctorReport | null) {
  if (typeof document === 'undefined') return report;
  document.getElementById('nex-note-doctor-panel')?.remove();
  if (!report) return null;

  const panel = document.createElement('div');
  panel.id = 'nex-note-doctor-panel';
  panel.style.position = 'fixed';
  panel.style.left = '16px';
  panel.style.bottom = '16px';
  panel.style.zIndex = '2147483647';
  panel.style.width = 'min(680px, calc(100vw - 32px))';
  panel.style.maxHeight = 'min(560px, calc(100vh - 32px))';
  panel.style.overflow = 'auto';
  panel.style.background = 'rgba(15, 23, 42, 0.97)';
  panel.style.color = 'white';
  panel.style.border = report.errorCount > 0
    ? '1px solid rgba(248, 113, 113, 0.7)'
    : report.warningCount > 0
      ? '1px solid rgba(251, 191, 36, 0.58)'
      : '1px solid rgba(134, 239, 172, 0.48)';
  panel.style.borderRadius = '10px';
  panel.style.boxShadow = '0 24px 80px rgba(15, 23, 42, 0.35)';
  panel.style.font = '12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';

  const header = document.createElement('div');
  header.style.display = 'flex';
  header.style.alignItems = 'center';
  header.style.justifyContent = 'space-between';
  header.style.gap = '12px';
  header.style.padding = '12px';
  header.style.borderBottom = '1px solid rgba(148, 163, 184, 0.22)';
  const title = document.createElement('strong');
  title.textContent = `Notation Doctor: ${report.issueCount} issue${report.issueCount === 1 ? '' : 's'}`;
  title.style.color = report.errorCount > 0 ? '#fca5a5' : report.warningCount > 0 ? '#fcd34d' : '#86efac';
  const actions = document.createElement('div');
  actions.style.display = 'flex';
  actions.style.gap = '6px';

  if (doctorReportHasCodexHandoff(report)) {
    const startCodex = document.createElement('button');
    styleDoctorPanelButton(startCodex);
    startCodex.textContent = 'Start Codex';
    startCodex.onclick = async () => {
      startCodex.disabled = true;
      startCodex.textContent = 'Starting...';
      const result = await startCodexFromReport(report);
      const ok = Boolean((result as { ok?: boolean } | null)?.ok);
      const mode = (result as { mode?: string } | null)?.mode;
      startCodex.textContent = ok
        ? mode === 'terminal'
          ? 'Terminal opened'
          : 'Codex started'
        : 'Start failed';
      startCodex.title = formatCodexHandoffButtonTitle(result);
      if (!ok) {
        // eslint-disable-next-line no-console
        console.warn('[nex-note:doctor-codex] start failed', result);
      }
      window.setTimeout(() => {
        startCodex.disabled = false;
        startCodex.textContent = 'Start Codex';
      }, 2200);
    };
    actions.append(startCodex);

    const codex = document.createElement('button');
    styleDoctorPanelButton(codex);
    codex.textContent = 'Copy Codex Prompt';
    codex.onclick = async () => {
      const state = getRuntimeState();
      const prompt = state ? getOrCreateCodexPrompt(state, report) : null;
      const copied = prompt ? await writeTextToClipboard(prompt) : false;
      codex.textContent = copied ? 'Copied' : 'Copy failed';
      window.setTimeout(() => {
        codex.textContent = 'Copy Codex Prompt';
      }, 1400);
    };
    actions.append(codex);
  }

  const close = document.createElement('button');
  styleDoctorPanelButton(close);
  close.textContent = 'Close';
  close.onclick = () => panel.remove();
  actions.append(close);
  header.append(title, actions);

  const body = document.createElement('pre');
  body.style.margin = '0';
  body.style.padding = '12px';
  body.style.whiteSpace = 'pre-wrap';
  body.style.wordBreak = 'break-word';
  body.textContent = JSON.stringify(report, null, 2);
  panel.append(header, body);
  document.body.append(panel);
  return report;
}

function renderDoctorBadge(state: DoctorRuntimeState) {
  if (typeof document === 'undefined') return;
  const existing = document.getElementById('nex-note-doctor-badge') as HTMLButtonElement | null;
  if (!state.settings.enabled) {
    existing?.remove();
    return;
  }

  const badge = existing ?? document.createElement('button');
  badge.id = 'nex-note-doctor-badge';
  badge.type = 'button';
  badge.style.position = 'fixed';
  badge.style.left = '16px';
  badge.style.top = '16px';
  badge.style.zIndex = '2147483647';
  badge.style.border = '1px solid rgba(15, 23, 42, 0.16)';
  badge.style.borderRadius = '8px';
  badge.style.boxShadow = '0 12px 32px rgba(15, 23, 42, 0.18)';
  badge.style.font = '12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
  badge.style.fontWeight = '800';
  badge.style.padding = '7px 10px';
  badge.style.cursor = 'pointer';
  badge.style.color = 'white';

  const report = state.lastReport;
  const tone = report?.errorCount
    ? 'error'
    : report?.warningCount
      ? 'warning'
      : 'clean';
  badge.style.background = tone === 'error'
    ? 'rgba(185, 28, 28, 0.94)'
    : tone === 'warning'
      ? 'rgba(180, 83, 9, 0.94)'
      : 'rgba(21, 128, 61, 0.94)';
  badge.textContent = report
    ? `Doctor ${state.settings.mode}: ${report.issueCount}`
    : `Doctor ${state.settings.mode}: ready`;
  badge.title = 'Notation Doctor is active. Click to run/show the current report.';
  badge.onclick = async () => {
    const nextReport = await state.runner?.();
    if (nextReport) publishDoctorReport(nextReport);
    renderDoctorPanel(state.lastReport);
  };

  if (!existing) document.body.append(badge);
}

function installConsoleApi(state: DoctorRuntimeState) {
  if (typeof window === 'undefined' || window.nexDebug) return;
  window.nexDebug = {
    status: () => ({
      settings: state.settings,
      lastReport: state.lastReport
        ? {
            generatedAt: state.lastReport.generatedAt,
            issueCount: state.lastReport.issueCount,
            warningCount: state.lastReport.warningCount,
            errorCount: state.lastReport.errorCount,
            trigger: state.lastReport.trigger,
            revision: state.lastReport.revision,
          }
        : null,
      historyCount: state.history.length,
      commands: [
        'nexDebug.runAll()',
        "nexDebug.run('rhythm')",
        'nexDebug.copyReport()',
        'nexDebug.startCodex()',
        'nexDebug.copyCodexPrompt()',
        'nexDebug.codexPrompt()',
        'nexDebug.copyLastFailures()',
        'nexDebug.showPanel()',
        'nexDebug.rules()',
      ],
    }),
    rules: (domain?: DoctorDomain) => (
      domain ? DOCTOR_RULES.filter((rule) => rule.domain === domain) : DOCTOR_RULES
    ),
    history: () => [...state.history],
    lastReport: () => state.lastReport,
    runAll: async () => {
      const report = await state.runner?.();
      if (report) publishDoctorReport(report);
      return report ?? state.lastReport;
    },
    run: async (domain: DoctorDomain) => {
      const report = await state.runner?.(domain);
      if (report) publishDoctorReport(report);
      return report ?? state.lastReport;
    },
    copyReport: async () => writeTextToClipboard(JSON.stringify(state.lastReport, null, 2)),
    copyLastFailures: async () => writeTextToClipboard(JSON.stringify(
      state.history.filter((report) => report.issueCount > 0),
      null,
      2,
    )),
    codexPrompt: () => {
      if (!state.lastReport) return null;
      return getOrCreateCodexPrompt(state, state.lastReport);
    },
    copyCodexPrompt: async () => {
      if (!state.lastReport) return false;
      const prompt = getOrCreateCodexPrompt(state, state.lastReport);
      return prompt ? writeTextToClipboard(prompt) : false;
    },
    startCodex: async () => {
      if (!state.lastReport) return { ok: false, error: 'No Doctor report is available.' };
      return startCodexFromReport(state.lastReport);
    },
    showPanel: () => renderDoctorPanel(state.lastReport),
    hidePanel: () => {
      document.getElementById('nex-note-doctor-panel')?.remove();
    },
    freeze: () => state.lastReport ? structuredClone(state.lastReport) : null,
  };
}

export function registerDoctorRunner(runner: DoctorRunner) {
  const state = getRuntimeState();
  if (!state) return;
  state.settings = readDoctorSettings();
  state.runner = runner;
  installConsoleApi(state);
  renderDoctorBadge(state);
}

export function publishDoctorReport(report: DoctorReport) {
  const state = getRuntimeState();
  if (!state) return;
  state.settings = readDoctorSettings();
  state.lastReport = report;
  state.history = [...state.history.slice(-(MAX_DOCTOR_HISTORY - 1)), report];
  installConsoleApi(state);
  renderDoctorBadge(state);

  const handoffMode = readDoctorCodexHandoffMode();
  const codexPrompt = getOrCreateCodexPrompt(state, report);
  if (
    codexPrompt
    && handoffMode === 'copy'
    && state.lastCodexAutoCopySignature !== state.lastCodexPromptSignature
  ) {
    state.lastCodexAutoCopySignature = state.lastCodexPromptSignature;
    void writeTextToClipboard(codexPrompt).then((copied) => {
      recordBugReportEvent('doctor-codex', copied ? 'auto-copy-prompt' : 'auto-copy-failed', {
        generatedAt: report.generatedAt,
        revision: report.revision,
        errorCount: report.errorCount,
        signature: state.lastCodexPromptSignature,
      });
    });
  }

  recordBugReportEvent('doctor', report.trigger, {
    generatedAt: report.generatedAt,
    mode: report.mode,
    revision: report.revision,
    previousRevision: report.previousRevision,
    commandCount: report.commandCount,
    commandTypes: report.commandTypes,
    issueCount: report.issueCount,
    warningCount: report.warningCount,
    errorCount: report.errorCount,
    summary: report.summary,
    issues: report.issues.slice(0, 30),
  });

  const level = reportConsoleLevel(report);
  // eslint-disable-next-line no-console
  console[level]('[nex-note:doctor]', {
    issueCount: report.issueCount,
    warningCount: report.warningCount,
    errorCount: report.errorCount,
    trigger: report.trigger,
    mode: report.mode,
    revision: report.revision,
    commandTypes: report.commandTypes,
    summary: report.summary,
    copy: 'nexDebug.copyReport()',
    startCodex: doctorReportHasCodexHandoff(report) ? 'nexDebug.startCodex()' : undefined,
    codexPrompt: doctorReportHasCodexHandoff(report) ? 'nexDebug.copyCodexPrompt()' : undefined,
    panel: 'nexDebug.showPanel()',
    report,
  });
}

export function getDoctorRuntimeState() {
  return getRuntimeState();
}
