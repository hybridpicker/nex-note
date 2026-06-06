import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  const key = process.env.OLLAMA_API_KEY ?? '';
  const keyInfo = key
    ? { set: true, length: key.length, prefix: key.slice(0, 4) + '…', trimmed: key !== key.trim() }
    : { set: false };

  // Compare against what's currently on disk (key name + length only, no value)
  let fileInfo: Record<string, unknown> = {};
  try {
    const envPath = path.join(process.cwd(), '.env.local');
    const content = fs.readFileSync(envPath, 'utf8');
    const match = content.match(/^OLLAMA_API_KEY=(.*)$/m);
    if (match) {
      const fileKey = match[1].replace(/^["']|["']$/g, '').trim();
      fileInfo = {
        fileLength: fileKey.length,
        filePrefix: fileKey.slice(0, 4) + '…',
        matchesLoaded: fileKey === key,
      };
    } else {
      fileInfo = { found: false };
    }
  } catch (e) {
    fileInfo = { error: String(e) };
  }

  let pingStatus: number | string = 'not attempted';
  let pingBody = '';
  if (key) {
    try {
      // Test auth with /api/tags (no model needed)
      const res = await fetch('https://ollama.com/api/tags', {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(10000),
      });
      pingStatus = res.status;
      pingBody = await res.text().then(t => t.slice(0, 300)).catch(() => '');
    } catch (err) {
      pingStatus = String(err);
    }
  }

  return NextResponse.json({ keyInfo, fileInfo, pingStatus, pingBody });
}
