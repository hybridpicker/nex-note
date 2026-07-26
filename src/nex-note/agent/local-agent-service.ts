import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { packXmlToMxl } from '@/lib/mxl-utils';
import type { AiProviderRequestSettings } from '@/lib/ai-model-settings';
import type { ProviderName } from '@/lib/ai-provider-config';
import { applyDocumentCommands, buildDocumentState } from '@/src/score-core/commands/apply-document-commands';
import { buildAiScoreContext } from '@/src/nex-note/context/build-ai-score-context';
import { runAiCommandPipeline } from '@/src/nex-note/pipeline/run-ai-command-pipeline';
import { repairCommandBatch } from '@/src/nex-note/repair/repair-command-batch';
import { applyScoreSessionMutation, getScoreSession } from '@/src/nex-note/server/score-session-cache';

const PREVIEW_TTL_MS = 5 * 60_000;

type Preview = {
  id: string;
  scoreKey: string;
  revision: number;
  commands: unknown[];
  requiresConfirmation: boolean;
  affectedMeasures: number[];
  explanation: string;
  createdAt: number;
};

declare global {
  // eslint-disable-next-line no-var
  var __NEX_NOTE_AGENT_PREVIEWS__: Map<string, Preview> | undefined;
}

function previews() {
  globalThis.__NEX_NOTE_AGENT_PREVIEWS__ ??= new Map<string, Preview>();
  const now = Date.now();
  for (const [id, preview] of globalThis.__NEX_NOTE_AGENT_PREVIEWS__) {
    if (now - preview.createdAt > PREVIEW_TTL_MS) globalThis.__NEX_NOTE_AGENT_PREVIEWS__.delete(id);
  }
  return globalThis.__NEX_NOTE_AGENT_PREVIEWS__;
}

function requireSession(scoreKey: string) {
  const session = getScoreSession(scoreKey);
  if (!session) throw new LocalAgentError('score_session_unavailable', 'The requested live score session is unavailable.', 404);
  return session;
}

function createPreview(input: Omit<Preview, 'id' | 'createdAt'>) {
  const preview: Preview = { ...input, id: randomBytes(12).toString('base64url'), createdAt: Date.now() };
  previews().set(preview.id, preview);
  return preview;
}

function collectAffectedMeasures(commands: Array<Record<string, unknown>>) {
  const measures = new Set<number>();
  for (const command of commands) {
    for (const key of ['measureNumber', 'startMeasureNumber', 'endMeasureNumber']) {
      const value = command[key];
      if (typeof value === 'number' && Number.isFinite(value)) measures.add(value);
    }
    const range = command.range;
    if (range && typeof range === 'object') {
      for (const endpoint of ['start', 'end']) {
        const measure = (range as Record<string, unknown>)[endpoint];
        if (measure && typeof measure === 'object') {
          const value = (measure as Record<string, unknown>).measureNumber;
          if (typeof value === 'number' && Number.isFinite(value)) measures.add(value);
        }
      }
    }
  }
  return [...measures].sort((a, b) => a - b);
}

export class LocalAgentError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
    this.name = 'LocalAgentError';
  }
}

export type LocalAgentToolName =
  | 'get_score_summary'
  | 'get_selection'
  | 'validate_score'
  | 'plan_score_commands'
  | 'preview_score_commands'
  | 'apply_score_preview'
  | 'discard_score_preview'
  | 'export_score';

export async function runLocalAgentTool(params: {
  tool: LocalAgentToolName;
  scoreKey: string;
  arguments?: Record<string, unknown>;
  provider?: ProviderName;
  providerSettings?: AiProviderRequestSettings;
}) {
  const args = params.arguments ?? {};
  const session = requireSession(params.scoreKey);
  const state = buildDocumentState(session.xml);

  if (params.tool === 'get_score_summary') {
    const context = buildAiScoreContext(state, session.selection as never);
    return {
      score: { scoreKey: session.scoreKey, revision: session.revision, ...context.summary },
      tonalAndMeterSummary: context.attributeHints ?? {},
      diagnostics: context.diagnostics,
      capabilities: context.capabilities,
      selection: context.selection ?? null,
    };
  }

  if (params.tool === 'get_selection') {
    return { scoreKey: session.scoreKey, revision: session.revision, selection: session.selection ?? null };
  }

  if (params.tool === 'validate_score') {
    return { scoreKey: session.scoreKey, revision: session.revision, findings: state.diagnostics };
  }

  if (params.tool === 'plan_score_commands') {
    const instruction = typeof args.instruction === 'string' ? args.instruction.trim() : '';
    if (!instruction) throw new LocalAgentError('invalid_instruction', 'A non-empty instruction is required.');
    const result = await runAiCommandPipeline({
      message: instruction,
      xml: session.xml,
      provider: params.provider ?? 'openai',
      providerSettings: params.providerSettings,
      selection: (args.scope ?? session.selection) as never,
    });
    if ('error' in result) throw new LocalAgentError('planning_failed', result.error, result.status);
    if (result.commands.length === 0) {
      return { scoreKey: session.scoreKey, revision: session.revision, analysisOnly: true, ...result };
    }
    const preview = createPreview({
      scoreKey: session.scoreKey,
      revision: session.revision,
      commands: result.commands,
      requiresConfirmation: result.requiresConfirmation,
      affectedMeasures: result.affectedMeasures,
      explanation: result.explanation,
    });
    return { ...result, xml: undefined, coreDocument: undefined, previewId: preview.id, expiresInMs: PREVIEW_TTL_MS };
  }

  if (params.tool === 'preview_score_commands') {
    const commands = Array.isArray(args.commands) ? args.commands : [];
    const repaired = repairCommandBatch(commands);
    if (repaired.validCommands.length === 0 && commands.length > 0) {
      throw new LocalAgentError('invalid_commands', 'No supported score commands remained after validation.');
    }
    const execution = applyDocumentCommands(state, repaired.validCommands);
    const blocking = execution.diagnostics.filter((finding) => finding.level === 'error');
    if (blocking.length > 0) {
      throw new LocalAgentError('validator_rejected', `Preview rejected by score validation: ${blocking.map((item) => item.message).join('; ')}`);
    }
    const affectedMeasures = collectAffectedMeasures(execution.appliedCommands as unknown as Array<Record<string, unknown>>);
    const preview = createPreview({
      scoreKey: session.scoreKey,
      revision: session.revision,
      commands: execution.appliedCommands,
      requiresConfirmation: execution.appliedCommands.length > 0,
      affectedMeasures,
      explanation: typeof args.explanation === 'string' ? args.explanation : 'Validated semantic score-command preview.',
    });
    return {
      previewId: preview.id,
      scoreKey: session.scoreKey,
      revision: session.revision,
      requiresConfirmation: preview.requiresConfirmation,
      affectedMeasures,
      droppedCommands: repaired.droppedCommands,
      before: { revision: session.revision, bytes: Buffer.byteLength(session.xml) },
      after: { revision: execution.revision, bytes: Buffer.byteLength(execution.xml), diagnostics: execution.diagnostics },
      expiresInMs: PREVIEW_TTL_MS,
    };
  }

  if (params.tool === 'apply_score_preview') {
    const previewId = typeof args.previewId === 'string' ? args.previewId : '';
    const preview = previews().get(previewId);
    if (!preview || preview.scoreKey !== session.scoreKey) throw new LocalAgentError('preview_unavailable', 'Preview is invalid, expired, discarded, or already applied.', 404);
    if (preview.revision !== session.revision) throw new LocalAgentError('stale_preview', 'The score revision changed after this preview was created.', 409);
    if (preview.requiresConfirmation && args.confirm !== true) {
      throw new LocalAgentError('confirmation_required', 'Explicit confirmation is required for this score preview.', 409);
    }
    const execution = applyDocumentCommands(state, preview.commands);
    const blocking = execution.diagnostics.filter((finding) => finding.level === 'error');
    if (blocking.length > 0) throw new LocalAgentError('validator_rejected', 'Score validation rejected the preview; the score was not changed.', 422);
    const applied = applyScoreSessionMutation({
      scoreKey: session.scoreKey,
      expectedRevision: session.revision,
      xml: execution.xml,
      revision: execution.revision,
    });
    if (!applied) throw new LocalAgentError('stale_preview', 'The score changed while the preview was being applied.', 409);
    previews().delete(preview.id);
    return { applied: true, ...applied, affectedMeasures: preview.affectedMeasures };
  }

  if (params.tool === 'discard_score_preview') {
    const previewId = typeof args.previewId === 'string' ? args.previewId : '';
    const preview = previews().get(previewId);
    if (!preview || preview.scoreKey !== session.scoreKey) return { discarded: false };
    previews().delete(previewId);
    return { discarded: true, scoreKey: session.scoreKey, revision: session.revision };
  }

  if (params.tool === 'export_score') {
    const format = args.format === 'mxl' ? 'mxl' : args.format === 'musicxml' ? 'musicxml' : null;
    if (!format) throw new LocalAgentError('unsupported_export_format', 'Supported agent export formats are musicxml and mxl.');
    const basename = typeof args.basename === 'string' ? args.basename.trim() : 'nex-note-score';
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/.test(basename) || basename.includes('..')) {
      throw new LocalAgentError('unsafe_export_path', 'Export basename must not contain paths or traversal segments.');
    }
    const directory = path.resolve(process.cwd(), '.nex', 'agent-exports');
    await mkdir(directory, { recursive: true });
    const filename = `${basename.replace(/\.(musicxml|mxl)$/i, '')}.${format}`;
    const destination = path.join(directory, filename);
    const data = format === 'mxl' ? await packXmlToMxl(session.xml, `${basename}.musicxml`) : session.xml;
    await writeFile(destination, data);
    return { exported: true, format, destination, scoreKey: session.scoreKey, revision: session.revision };
  }

  throw new LocalAgentError('unknown_tool', 'Unknown local agent tool.', 404);
}
