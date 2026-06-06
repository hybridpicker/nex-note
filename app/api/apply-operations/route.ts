import { NextRequest, NextResponse } from 'next/server';
import type { ScoreCommand } from '@/lib/score-commands';
import { applyDocumentCommands, buildDocumentState } from '@/src/score-core/commands/apply-document-commands';
import { formatValidationError } from '@/src/shared/errors/command-errors';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { xml: string; operations?: ScoreCommand[]; commands?: ScoreCommand[] };
    const commands = body.commands ?? body.operations;
    if (!body.xml || !Array.isArray(commands)) {
      return NextResponse.json({ error: 'xml and commands[] required' }, { status: 400 });
    }

    const result = applyDocumentCommands(buildDocumentState(body.xml), commands);
    return NextResponse.json({
      xml: result.xml,
      coreDocument: result.coreDocument,
      diagnostics: result.diagnostics,
      commands: result.appliedCommands,
      operations: result.appliedCommands,
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'CommandValidationError') {
      return NextResponse.json(formatValidationError(err), { status: 400 });
    }
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
