import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';

import {
  isAiEnabledForRequest,
  isLocalAiRequest,
  isNativeAiRequest,
  isPublicAiEnabled,
  PUBLIC_AI_DISABLED_MESSAGE,
} from '@/lib/public-ai-access';
import {
  PUBLIC_AI_PROVIDER_UNAVAILABLE_CODE,
  PUBLIC_AI_RATE_LIMITED_CODE,
  PUBLIC_AI_SESSION_KEY_REQUIRED_CODE,
  chatAiAccessDeniedResponse,
  resolveChatAiAccess,
} from '@/lib/public-ai-access';
import {
  clientAddressFromHeaders,
  createRateLimiter,
  hashClientAddress,
  publicAiRateLimitConfig,
} from '@/lib/public-ai-rate-limit';
import { guessBrowserPreview } from '@/lib/ai-access-surface';

test.beforeEach(() => {
  delete process.env.NEX_NOTE_ENABLE_PUBLIC_AI;
});

test('AI provider endpoints are enabled for localhost desktop and dev requests', () => {
  const req = new NextRequest('http://localhost:3000/api/chat');

  assert.equal(isLocalAiRequest(req), true);
  assert.equal(isAiEnabledForRequest(req), true);
});

test('AI provider endpoints are disabled by default on public hosts', () => {
  const req = new NextRequest('https://nex-note.com/api/chat');

  assert.equal(isLocalAiRequest(req), false);
  assert.equal(isPublicAiEnabled(), false);
  assert.equal(isAiEnabledForRequest(req), false);
  assert.match(PUBLIC_AI_DISABLED_MESSAGE, /Session Key/);
});

test('public host headers stay disabled even when the app server URL is localhost', () => {
  const req = new NextRequest('http://127.0.0.1:3031/api/chat', {
    headers: { host: 'nex-note.com' },
  });

  assert.equal(isLocalAiRequest(req), false);
  assert.equal(isAiEnabledForRequest(req), false);
});

test('signed native app requests can use local AI providers over the LAN', () => {
  const req = new NextRequest('http://192.168.1.20:3000/api/chat', {
    headers: {
      host: '192.168.1.20:3000',
      'user-agent': 'Mozilla/5.0 AppleWebKit/605.1.15 NexNoteNative/0.0.7',
    },
  });

  assert.equal(isLocalAiRequest(req), false);
  assert.equal(isNativeAiRequest(req), true);
  assert.equal(isAiEnabledForRequest(req), true);
});

test('a generic LAN browser is not treated as the native app', () => {
  const req = new NextRequest('http://192.168.1.20:3000/api/chat', {
    headers: { 'user-agent': 'Mozilla/5.0 AppleWebKit/605.1.15' },
  });

  assert.equal(isNativeAiRequest(req), false);
  assert.equal(isAiEnabledForRequest(req), false);
});

test('public AI can only be enabled through an explicit server env flag', () => {
  process.env.NEX_NOTE_ENABLE_PUBLIC_AI = 'true';
  const req = new NextRequest('https://nex-note.com/api/chat');

  assert.equal(isPublicAiEnabled(), true);
  assert.equal(isAiEnabledForRequest(req), true);
});

// --- Session Key gate for the Browser Preview (docs/adr/0003-session-keys-relayed-by-server.md) ---


const SESSION_KEY = 'sk-test-session-key-000000000001';

function publicRequest(headers: Record<string, string> = {}) {
  return new NextRequest('https://nex-note.com/api/chat', {
    method: 'POST',
    headers: { 'x-forwarded-for': '203.0.113.7', ...headers },
  });
}

function freshLimiter(limit = 20) {
  return createRateLimiter({ limit, windowMs: 600_000 });
}

test('public host without a Session Key is refused', () => {
  const access = resolveChatAiAccess(publicRequest(), { provider: 'claude', providerSettings: {} }, { limiter: freshLimiter() });
  assert.equal(access.ok, false);
  if (access.ok) return;
  assert.equal(access.status, 403);
  assert.equal(access.code, PUBLIC_AI_SESSION_KEY_REQUIRED_CODE);
});

test('public host with a Session Key for a cloud provider is allowed and never falls back to server keys', () => {
  for (const provider of ['claude', 'openai', 'gemini'] as const) {
    const access = resolveChatAiAccess(publicRequest(), {
      provider,
      providerSettings: {
        enabledProviders: ['ollama', 'openai', 'claude', 'gemini'],
        apiKeys: { [provider]: SESSION_KEY, ollama: 'sk-test-other-provider-key-0002' },
        models: { [provider]: 'some-model', ollama: 'gemma4:31b' },
        ollamaBaseUrl: 'http://10.0.0.5:11434',
      },
    }, { limiter: freshLimiter() });
    assert.equal(access.ok, true, provider);
    if (!access.ok) continue;
    assert.equal(access.mode, 'session-key');
    assert.deepEqual(access.providerSettings, {
      enabledProviders: [provider],
      apiKeys: { [provider]: SESSION_KEY },
      models: { [provider]: 'some-model' },
      serverKeyFallback: false,
    });
  }
});

test('Ollama is refused on public hosts, even with a key', () => {
  const access = resolveChatAiAccess(publicRequest(), {
    provider: 'ollama',
    providerSettings: { apiKeys: { ollama: SESSION_KEY } },
  }, { limiter: freshLimiter() });
  assert.equal(access.ok, false);
  if (access.ok) return;
  assert.equal(access.code, PUBLIC_AI_PROVIDER_UNAVAILABLE_CODE);
});

test('server env keys are not used for public requests: a key for another provider does not open the gate', () => {
  process.env.ANTHROPIC_API_KEY = 'sk-test-server-env-key-0003';
  try {
    const access = resolveChatAiAccess(publicRequest(), {
      provider: 'claude',
      providerSettings: { apiKeys: { openai: SESSION_KEY } },
    }, { limiter: freshLimiter() });
    assert.equal(access.ok, false);
  } finally {
    delete process.env.ANTHROPIC_API_KEY;
  }
});

test('localhost, the native shell and the explicit env flag keep trusted access (Ollama, server keys)', () => {
  const settings = { apiKeys: {} };
  const local = resolveChatAiAccess(new NextRequest('http://localhost:3000/api/chat'), { provider: 'ollama', providerSettings: settings });
  assert.equal(local.ok && local.mode, 'trusted');
  assert.equal(local.ok && local.providerSettings.serverKeyFallback, undefined);

  const native = resolveChatAiAccess(new NextRequest('http://192.168.1.20:3000/api/chat', {
    headers: { 'user-agent': 'Mozilla/5.0 NexNoteNative/0.0.7' },
  }), { provider: 'ollama', providerSettings: settings });
  assert.equal(native.ok && native.mode, 'trusted');

  process.env.NEX_NOTE_ENABLE_PUBLIC_AI = 'true';
  const flagged = resolveChatAiAccess(publicRequest(), { provider: 'ollama', providerSettings: settings });
  assert.equal(flagged.ok && flagged.mode, 'trusted');
});

test('public Session Key requests are rate limited per client and answer 429 with Retry-After', async () => {
  const limiter = freshLimiter(2);
  const input = { provider: 'openai', providerSettings: { apiKeys: { openai: SESSION_KEY } } };
  assert.equal(resolveChatAiAccess(publicRequest(), input, { limiter }).ok, true);
  assert.equal(resolveChatAiAccess(publicRequest(), input, { limiter }).ok, true);
  const third = resolveChatAiAccess(publicRequest(), input, { limiter });
  assert.equal(third.ok, false);
  if (third.ok) return;
  assert.equal(third.status, 429);
  assert.equal(third.code, PUBLIC_AI_RATE_LIMITED_CODE);

  // Another client is not affected.
  assert.equal(resolveChatAiAccess(publicRequest({ 'x-forwarded-for': '198.51.100.9' }), input, { limiter }).ok, true);

  const response = chatAiAccessDeniedResponse(third);
  assert.equal(response.status, 429);
  assert.ok(Number(response.headers.get('retry-after')) > 0);
  const body = await response.text();
  assert.doesNotMatch(body, /sk-test-|203\.0\.113\.7/);
});

test('rate limiter: sliding window, bounded memory, env configuration', () => {
  let now = 0;
  const limiter = createRateLimiter({ limit: 3, windowMs: 1000, now: () => now, maxClients: 2 });
  assert.equal(limiter.check('a').allowed, true);
  assert.equal(limiter.check('a').allowed, true);
  assert.equal(limiter.check('a').allowed, true);
  const blocked = limiter.check('a');
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterSeconds, 1);
  now = 1001;
  assert.equal(limiter.check('a').allowed, true, 'window slid');

  assert.equal(limiter.check('b').allowed, true);
  assert.equal(limiter.check('c').allowed, false, 'full table refuses new clients instead of growing');
  now = 5000;
  assert.equal(limiter.check('c').allowed, true, 'expired entries are pruned');
  assert.ok(limiter.size() <= 2);

  assert.deepEqual(publicAiRateLimitConfig({ NODE_ENV: 'test' }), { limit: 20, windowMs: 600_000 });
  assert.deepEqual(
    publicAiRateLimitConfig({ NODE_ENV: 'test', NEX_NOTE_PUBLIC_AI_RATE_LIMIT: '5', NEX_NOTE_PUBLIC_AI_RATE_WINDOW_MS: '60000' }),
    { limit: 5, windowMs: 60_000 },
  );
  assert.deepEqual(publicAiRateLimitConfig({ NODE_ENV: 'test', NEX_NOTE_PUBLIC_AI_RATE_LIMIT: 'nope' }).limit, 20);
});

test('client addresses are hashed, never kept raw', () => {
  const headers = new Headers({ 'x-real-ip': '203.0.113.7', 'x-forwarded-for': '192.0.2.99, 203.0.113.7' });
  const address = clientAddressFromHeaders(headers);
  assert.equal(address, '203.0.113.7');
  const hashed = hashClientAddress(address);
  assert.notEqual(hashed, address);
  assert.doesNotMatch(hashed, /203|113/);
  assert.equal(hashClientAddress(address), hashed, 'stable within the process');
});

test('client guess: public host is the Browser Preview; desktop, native and localhost are not', () => {
  assert.equal(guessBrowserPreview({ hostname: 'nex-note.com', userAgent: 'Mozilla/5.0' }), true);
  assert.equal(guessBrowserPreview({ hostname: 'localhost' }), false);
  assert.equal(guessBrowserPreview({ hostname: '127.0.0.1', hasDesktopBridge: true }), false);
  assert.equal(guessBrowserPreview({ hostname: '192.168.1.20', userAgent: 'x NexNoteNative/0.0.7' }), false);
});

// --- Spoofed proxy headers (nginx sets X-Real-IP; clients control Host, X-Forwarded-*, User-Agent) ---

function proxiedRequest(headers: Record<string, string>) {
  return new NextRequest('http://127.0.0.1:3031/api/chat', {
    method: 'POST',
    headers: { 'x-real-ip': '198.51.100.40', 'x-forwarded-for': '198.51.100.40', ...headers },
  });
}

test('a client cannot claim localhost through X-Forwarded-Host or Host behind the proxy', () => {
  assert.equal(isLocalAiRequest(proxiedRequest({ 'x-forwarded-host': 'localhost' })), false);
  assert.equal(isLocalAiRequest(proxiedRequest({ host: 'localhost' })), false);
  assert.equal(isAiEnabledForRequest(proxiedRequest({ 'x-forwarded-host': 'localhost', host: 'nex-note.com' })), false);
  // Without the proxy, X-Forwarded-Host is ignored and only Host counts.
  const direct = new NextRequest('https://nex-note.com/api/chat', { headers: { 'x-forwarded-host': 'localhost' } });
  assert.equal(isLocalAiRequest(direct), false);
});

test('a native user agent is not trusted when the request came through the proxy', () => {
  const ua = { 'user-agent': 'Mozilla/5.0 NexNoteNative/0.1.0' };
  assert.equal(isNativeAiRequest(proxiedRequest(ua)), false);
  assert.equal(isNativeAiRequest(new NextRequest('http://192.168.1.20:3000/api/chat', { headers: ua })), true);
});

test('the rate limit ignores a client-supplied first X-Forwarded-For entry', () => {
  assert.equal(clientAddressFromHeaders(new Headers({ 'x-forwarded-for': '192.0.2.1, 198.51.100.40' })), '198.51.100.40');
  assert.equal(clientAddressFromHeaders(new Headers()), 'unknown');
});
