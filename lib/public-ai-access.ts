import { NextRequest, NextResponse } from 'next/server';
import type { ProviderName } from '@/lib/ai-provider-config';
import type { AiProviderRequestSettings } from '@/lib/ai-model-settings';
import {
  LOCAL_AI_HOSTNAMES,
  isNativeAiUserAgent,
  isSessionKeyProvider,
} from '@/lib/ai-access-surface';
import {
  clientAddressFromHeaders,
  hashClientAddress,
  publicAiRateLimiter,
  type RateLimiter,
} from '@/lib/public-ai-rate-limit';

export const PUBLIC_AI_DISABLED_MESSAGE = 'AI editing in the Browser Preview needs a Session Key. Connect Anthropic, OpenAI or Gemini with your own key, or use the desktop app.';
export const PUBLIC_AI_SESSION_KEY_REQUIRED_CODE = 'session_key_required';
export const PUBLIC_AI_PROVIDER_UNAVAILABLE_CODE = 'provider_unavailable_in_browser_preview';
export const PUBLIC_AI_RATE_LIMITED_CODE = 'rate_limited';

// Client-supplied headers (Host, X-Forwarded-Host, User-Agent) can claim anything, so they never
// make a request trusted on their own. nex-note.com runs behind nginx, which sets X-Real-IP to the
// real client address on every request (`proxy_set_header X-Real-IP $remote_addr`); the desktop
// app, `npm run dev` and the native shells talk to Next directly and send no X-Real-IP. A request
// that came through the proxy is therefore never local or native, whatever it claims.
export function isProxiedRequest(req: NextRequest) {
  return Boolean(req.headers.get('x-real-ip')?.trim());
}

function requestHostname(req: NextRequest) {
  // X-Forwarded-Host is ignored on purpose: a client could set it to "localhost".
  const host = req.headers.get('host') || req.nextUrl.hostname || '';
  if (host.startsWith('[')) return host.slice(0, host.indexOf(']') + 1);
  return host.split(':')[0] ?? '';
}

export function isLocalAiRequest(req: NextRequest) {
  if (isProxiedRequest(req)) return false;
  return LOCAL_AI_HOSTNAMES.has(requestHostname(req).toLowerCase());
}

export function isNativeAiRequest(req: NextRequest) {
  if (isProxiedRequest(req)) return false;
  return isNativeAiUserAgent(req.headers.get('user-agent'));
}

export function isPublicAiEnabled() {
  return process.env.NEX_NOTE_ENABLE_PUBLIC_AI === 'true';
}

/**
 * Trusted AI access: localhost, the native shells, or a server that explicitly opened public AI.
 * Only trusted requests may use Ollama or keys from the server environment.
 */
export function isAiEnabledForRequest(req: NextRequest) {
  return isPublicAiEnabled() || isLocalAiRequest(req) || isNativeAiRequest(req);
}

export function publicAiDisabledResponse() {
  return NextResponse.json({
    error: PUBLIC_AI_DISABLED_MESSAGE,
    code: PUBLIC_AI_SESSION_KEY_REQUIRED_CODE,
    aiEnabled: false,
  }, { status: 403 });
}

export type ChatAiAccess =
  | { ok: true; mode: 'trusted'; providerSettings: AiProviderRequestSettings }
  | { ok: true; mode: 'session-key'; providerSettings: AiProviderRequestSettings }
  | { ok: false; status: number; code: string; error: string; retryAfterSeconds?: number };

/**
 * Decides whether `/api/chat` may run for this request.
 *
 * Trusted requests keep today's behaviour. A request on a public host (the Browser Preview) is
 * allowed only with a Session Key for a cloud provider; it never reaches Ollama or the server's
 * own `.env` keys, keys for other providers are dropped, and it counts against a per-client rate
 * limit. Nothing here logs the key, the client address, or the request body.
 */
export function resolveChatAiAccess(
  req: NextRequest,
  input: { provider: unknown; providerSettings: AiProviderRequestSettings },
  options: { limiter?: RateLimiter } = {},
): ChatAiAccess {
  if (isAiEnabledForRequest(req)) {
    return { ok: true, mode: 'trusted', providerSettings: input.providerSettings };
  }

  if (!isSessionKeyProvider(input.provider)) {
    return {
      ok: false,
      status: 403,
      code: PUBLIC_AI_PROVIDER_UNAVAILABLE_CODE,
      error: 'This AI provider is only available in the desktop app. In the Browser Preview, connect Anthropic, OpenAI or Gemini with a Session Key.',
    };
  }

  const provider = input.provider as ProviderName;
  const sessionKey = input.providerSettings.apiKeys?.[provider]?.trim();
  if (!sessionKey) {
    return {
      ok: false,
      status: 403,
      code: PUBLIC_AI_SESSION_KEY_REQUIRED_CODE,
      error: PUBLIC_AI_DISABLED_MESSAGE,
    };
  }

  const limiter = options.limiter ?? publicAiRateLimiter();
  const decision = limiter.check(hashClientAddress(clientAddressFromHeaders(req.headers)));
  if (!decision.allowed) {
    return {
      ok: false,
      status: 429,
      code: PUBLIC_AI_RATE_LIMITED_CODE,
      error: 'Too many AI requests from this connection. Wait a few minutes and try again.',
      retryAfterSeconds: decision.retryAfterSeconds,
    };
  }

  const model = input.providerSettings.models?.[provider];
  return {
    ok: true,
    mode: 'session-key',
    providerSettings: {
      enabledProviders: [provider],
      apiKeys: { [provider]: sessionKey },
      ...(model ? { models: { [provider]: model } } : {}),
      serverKeyFallback: false,
    },
  };
}

export function chatAiAccessDeniedResponse(access: Extract<ChatAiAccess, { ok: false }>) {
  return NextResponse.json({
    error: access.error,
    code: access.code,
    aiEnabled: false,
  }, {
    status: access.status,
    ...(access.retryAfterSeconds ? { headers: { 'Retry-After': String(access.retryAfterSeconds) } } : {}),
  });
}
