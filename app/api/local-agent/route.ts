import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { normalizeAiProviderRequestSettings } from '@/lib/ai-model-settings';
import type { ProviderName } from '@/lib/ai-provider-config';
import {
  LocalAgentError,
  runLocalAgentTool,
  type LocalAgentToolName,
} from '@/src/nex-note/agent/local-agent-service';

const TOOL_NAMES: LocalAgentToolName[] = [
  'get_score_summary',
  'get_selection',
  'validate_score',
  'plan_score_commands',
  'preview_score_commands',
  'apply_score_preview',
  'discard_score_preview',
  'export_score',
];

function isLoopbackRequest(req: NextRequest) {
  const host = (req.headers.get('host') ?? req.nextUrl.host).split(':')[0].replace(/^\[|\]$/g, '').toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

function isAuthorized(req: NextRequest) {
  const expected = process.env.NEX_NOTE_AGENT_SECRET?.trim();
  const supplied = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
  if (!expected || !supplied) return false;
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  return expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes);
}

function accessError(req: NextRequest) {
  if (process.env.NEX_NOTE_ENABLE_LOCAL_AGENT !== 'true') {
    return NextResponse.json({ error: 'Local agent interface is disabled.', code: 'agent_disabled' }, { status: 404 });
  }
  if (!isLoopbackRequest(req)) {
    return NextResponse.json({ error: 'Local agent interface accepts localhost requests only.', code: 'localhost_required' }, { status: 403 });
  }
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Local agent authorization failed.', code: 'unauthorized' }, { status: 401 });
  }
  return null;
}

export async function GET(req: NextRequest) {
  const rejected = accessError(req);
  if (rejected) return rejected;
  return NextResponse.json({
    name: 'nex-note-local-agent',
    transport: 'authenticated-local-http',
    productionReadyMcp: false,
    tools: TOOL_NAMES,
  });
}

export async function POST(req: NextRequest) {
  const rejected = accessError(req);
  if (rejected) return rejected;
  try {
    const body = await req.json() as {
      tool?: LocalAgentToolName;
      scoreKey?: string;
      arguments?: Record<string, unknown>;
      provider?: ProviderName;
      aiSettings?: unknown;
    };
    if (!body.tool || !TOOL_NAMES.includes(body.tool) || !body.scoreKey) {
      return NextResponse.json({ error: 'A supported tool and scoreKey are required.', code: 'invalid_request' }, { status: 400 });
    }
    const result = await runLocalAgentTool({
      tool: body.tool,
      scoreKey: body.scoreKey,
      arguments: body.arguments,
      provider: body.provider,
      providerSettings: normalizeAiProviderRequestSettings(body.aiSettings),
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    if (error instanceof LocalAgentError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: 'Local agent tool failed safely.', code: 'agent_failure' }, { status: 500 });
  }
}
