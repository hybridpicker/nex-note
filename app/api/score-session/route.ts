import { NextRequest, NextResponse } from 'next/server';
import { storeScoreSession } from '@/src/nex-note/server/score-session-cache';

export async function POST(req: NextRequest) {
  try {
    const { scoreKey, revision, xml } = await req.json() as {
      scoreKey?: string;
      revision?: number;
      xml?: string;
    };

    if (!scoreKey || typeof scoreKey !== 'string' || !xml || typeof xml !== 'string') {
      return NextResponse.json({ error: 'scoreKey and xml required' }, { status: 400 });
    }

    const session = storeScoreSession({
      scoreKey,
      revision: typeof revision === 'number' ? revision : 0,
      xml,
    });

    return NextResponse.json({ ok: true, session });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
