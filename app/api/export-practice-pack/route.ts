import { NextRequest, NextResponse } from 'next/server';
import { buildPracticePack } from '@/lib/practice-pack';

export async function POST(req: NextRequest) {
  const { xml, filename, instrument } = await req.json() as {
    xml: string;
    filename?: string;
    instrument?: 'voice' | 'flute' | 'violin' | 'clarinet-bb' | 'trumpet-bb' | 'alto-sax-eb' | 'cello' | null;
  };
  if (!xml) return NextResponse.json({ error: 'No XML provided' }, { status: 400 });
  return NextResponse.json(buildPracticePack({ xml, filename, instrument: instrument ?? null }));
}
