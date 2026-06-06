import { NextRequest, NextResponse } from 'next/server';

type PreviewEntry = {
  entryId: string;
  filename: string;
  xml: string;
  expiresAt: number;
};

const PREVIEW_TTL_MS = 10 * 60 * 1000;
const MAX_PREVIEW_XML_BYTES = 2 * 1024 * 1024;

const globalPreviewStore = globalThis as typeof globalThis & {
  __NEX_NOTE_LIBRARY_SCORE_PREVIEWS__?: Map<string, PreviewEntry>;
};

function previewStore() {
  if (!globalPreviewStore.__NEX_NOTE_LIBRARY_SCORE_PREVIEWS__) {
    globalPreviewStore.__NEX_NOTE_LIBRARY_SCORE_PREVIEWS__ = new Map();
  }
  return globalPreviewStore.__NEX_NOTE_LIBRARY_SCORE_PREVIEWS__;
}

function cleanupExpiredPreviews(now = Date.now()) {
  for (const [previewId, entry] of previewStore()) {
    if (entry.expiresAt <= now) previewStore().delete(previewId);
  }
}

function xmlByteLength(xml: string) {
  return new TextEncoder().encode(xml).byteLength;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const entryId = typeof body?.entryId === 'string' ? body.entryId : '';
  const filename = typeof body?.filename === 'string' ? body.filename : `${entryId || 'score'}.musicxml`;
  const xml = typeof body?.xml === 'string' ? body.xml : '';

  if (!entryId || !xml) {
    return NextResponse.json({ error: 'Missing score preview payload.' }, { status: 400 });
  }
  if (xmlByteLength(xml) > MAX_PREVIEW_XML_BYTES) {
    return NextResponse.json({ error: 'Score preview payload is too large.' }, { status: 413 });
  }

  cleanupExpiredPreviews();
  const previewId = crypto.randomUUID();
  previewStore().set(previewId, {
    entryId,
    filename,
    xml,
    expiresAt: Date.now() + PREVIEW_TTL_MS,
  });
  return NextResponse.json({ previewId });
}

export async function GET(req: NextRequest) {
  cleanupExpiredPreviews();
  const previewId = req.nextUrl.searchParams.get('previewId') ?? '';
  const entryId = req.nextUrl.searchParams.get('entry') ?? '';
  const entry = previewStore().get(previewId);

  if (!entry || entry.entryId !== entryId) {
    return NextResponse.json({ error: 'Score preview not found.' }, { status: 404 });
  }

  entry.expiresAt = Date.now() + PREVIEW_TTL_MS;
  return NextResponse.json({
    success: true,
    xml: entry.xml,
    filename: entry.filename,
  });
}
