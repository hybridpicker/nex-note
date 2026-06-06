import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';

import {
  isAiEnabledForRequest,
  isLocalAiRequest,
  isPublicAiEnabled,
  PUBLIC_AI_DISABLED_MESSAGE,
} from '@/lib/public-ai-access';

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
  assert.match(PUBLIC_AI_DISABLED_MESSAGE, /public web alpha/i);
});

test('public host headers stay disabled even when the app server URL is localhost', () => {
  const req = new NextRequest('http://127.0.0.1:3031/api/chat', {
    headers: { host: 'nex-note.com' },
  });

  assert.equal(isLocalAiRequest(req), false);
  assert.equal(isAiEnabledForRequest(req), false);
});

test('public AI can only be enabled through an explicit server env flag', () => {
  process.env.NEX_NOTE_ENABLE_PUBLIC_AI = 'true';
  const req = new NextRequest('https://nex-note.com/api/chat');

  assert.equal(isPublicAiEnabled(), true);
  assert.equal(isAiEnabledForRequest(req), true);
});
