import { NextRequest, NextResponse } from 'next/server';
import { packXmlToMxl } from '@/lib/mxl-utils';

export async function POST(req: NextRequest) {
  try {
    const { xml, filename = 'score.mxl' } = await req.json() as { xml: string; filename?: string };
    if (!xml) return NextResponse.json({ error: 'xml required' }, { status: 400 });

    const mxlBuffer = await packXmlToMxl(xml);

    return new NextResponse(mxlBuffer as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/vnd.recordare.musicxml+zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(mxlBuffer.length),
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
