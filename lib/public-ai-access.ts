import { NextRequest, NextResponse } from 'next/server';

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export const PUBLIC_AI_DISABLED_MESSAGE = 'AI editing is disabled on the public web alpha. Use the local desktop app or a local developer build to connect your own AI provider.';

function requestHostname(req: NextRequest) {
  const forwardedHost = req.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  const host = forwardedHost || req.headers.get('host') || req.nextUrl.hostname || '';
  if (host.startsWith('[')) return host.slice(0, host.indexOf(']') + 1);
  return host.split(':')[0] ?? '';
}

export function isLocalAiRequest(req: NextRequest) {
  return LOCAL_HOSTNAMES.has(requestHostname(req));
}

export function isPublicAiEnabled() {
  return process.env.NEX_NOTE_ENABLE_PUBLIC_AI === 'true';
}

export function isAiEnabledForRequest(req: NextRequest) {
  return isPublicAiEnabled() || isLocalAiRequest(req);
}

export function publicAiDisabledResponse() {
  return NextResponse.json({
    error: PUBLIC_AI_DISABLED_MESSAGE,
    aiEnabled: false,
  }, { status: 403 });
}
