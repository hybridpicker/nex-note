import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { GET, POST } from '@/app/api/local-agent/route';
import { getScoreSession, storeScoreSession } from '@/src/nex-note/server/score-session-cache';

const XML = `<?xml version="1.0"?><score-partwise version="3.1"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes><note><rest/><duration>4</duration><voice>1</voice><type>whole</type></note></measure></part></score-partwise>`;
const SECRET = 'test-agent-secret';

function request(body: unknown, options: { host?: string; secret?: string } = {}) {
  return new NextRequest(`http://${options.host ?? 'localhost'}:3000/api/local-agent`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(options.secret ? { authorization: `Bearer ${options.secret}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

test.beforeEach(() => {
  process.env.NEX_NOTE_ENABLE_LOCAL_AGENT = 'true';
  process.env.NEX_NOTE_AGENT_SECRET = SECRET;
  globalThis.__NEX_NOTE_SCORE_SESSIONS__ = undefined;
  globalThis.__NEX_NOTE_AGENT_PREVIEWS__ = undefined;
  storeScoreSession({ scoreKey: 'score-1', revision: 0, xml: XML, selection: { entityIds: ['note-1'], measureRange: { start: 1, end: 1 } } });
});

test.afterEach(() => {
  delete process.env.NEX_NOTE_ENABLE_LOCAL_AGENT;
  delete process.env.NEX_NOTE_AGENT_SECRET;
});

test('local agent rejects non-local and unauthorized requests and stays disabled by default', async () => {
  assert.equal((await POST(request({ tool: 'get_score_summary', scoreKey: 'score-1' }, { host: 'example.com', secret: SECRET }))).status, 403);
  assert.equal((await POST(request({ tool: 'get_score_summary', scoreKey: 'score-1' }))).status, 401);
  delete process.env.NEX_NOTE_ENABLE_LOCAL_AGENT;
  assert.equal((await GET(new NextRequest('http://localhost:3000/api/local-agent', {
    headers: { authorization: `Bearer ${SECRET}` },
  }))).status, 404);
});

test('read-only summary, selection, and validation do not mutate the score', async () => {
  const before = getScoreSession('score-1')!;
  for (const tool of ['get_score_summary', 'get_selection', 'validate_score'] as const) {
    const response = await POST(request({ tool, scoreKey: 'score-1' }, { secret: SECRET }));
    assert.equal(response.status, 200);
  }
  const after = getScoreSession('score-1')!;
  assert.equal(after.xml, before.xml);
  assert.equal(after.revision, before.revision);
});

test('preview is non-mutating, apply requires confirmation, rejects replay, and records undo availability', async () => {
  const previewResponse = await POST(request({
    tool: 'preview_score_commands',
    scoreKey: 'score-1',
    arguments: { commands: [{ type: 'setTitle', title: 'Agent title' }] },
  }, { secret: SECRET }));
  assert.equal(previewResponse.status, 200);
  const preview = (await previewResponse.json()).result;
  assert.equal(getScoreSession('score-1')!.xml, XML);

  const unconfirmed = await POST(request({
    tool: 'apply_score_preview',
    scoreKey: 'score-1',
    arguments: { previewId: preview.previewId },
  }, { secret: SECRET }));
  assert.equal(unconfirmed.status, 409);
  assert.equal(getScoreSession('score-1')!.xml, XML);

  const applied = await POST(request({
    tool: 'apply_score_preview',
    scoreKey: 'score-1',
    arguments: { previewId: preview.previewId, confirm: true },
  }, { secret: SECRET }));
  assert.equal(applied.status, 200);
  assert.match(getScoreSession('score-1')!.xml, /Agent title/);
  assert.equal(getScoreSession('score-1')!.canUndo, true);

  const replay = await POST(request({
    tool: 'apply_score_preview',
    scoreKey: 'score-1',
    arguments: { previewId: preview.previewId, confirm: true },
  }, { secret: SECRET }));
  assert.equal(replay.status, 404);
});

test('stale previews, discard, and export path traversal fail safely', async () => {
  const previewResponse = await POST(request({
    tool: 'preview_score_commands',
    scoreKey: 'score-1',
    arguments: { commands: [{ type: 'setTitle', title: 'Stale' }] },
  }, { secret: SECRET }));
  const preview = (await previewResponse.json()).result;
  storeScoreSession({ scoreKey: 'score-1', revision: 1, xml: XML });
  const stale = await POST(request({
    tool: 'apply_score_preview',
    scoreKey: 'score-1',
    arguments: { previewId: preview.previewId, confirm: true },
  }, { secret: SECRET }));
  assert.equal(stale.status, 409);
  assert.equal(getScoreSession('score-1')!.xml, XML);

  const discarded = await POST(request({
    tool: 'discard_score_preview',
    scoreKey: 'score-1',
    arguments: { previewId: preview.previewId },
  }, { secret: SECRET }));
  assert.equal(discarded.status, 200);

  const traversal = await POST(request({
    tool: 'export_score',
    scoreKey: 'score-1',
    arguments: { format: 'musicxml', basename: '../../private' },
  }, { secret: SECRET }));
  assert.equal(traversal.status, 400);
});
