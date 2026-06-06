import { musicXmlToAbc } from '@/lib/abc-export';
import { applyDocumentCommands, buildDocumentState } from '@/src/score-core/commands/apply-document-commands';

export interface PracticePackFile {
  name: string;
  mimeType: string;
  content: string;
}

export interface PracticePack {
  manifest: {
    title: string;
    commandCount: number;
    instrument?: string | null;
    generatedAt: string;
  };
  files: PracticePackFile[];
}

export function buildPracticePack(params: {
  xml: string;
  filename?: string;
  instrument?: 'voice' | 'flute' | 'violin' | 'clarinet-bb' | 'trumpet-bb' | 'alto-sax-eb' | 'cello' | null;
}) {
  const { xml, filename = 'score.musicxml', instrument = null } = params;
  const commands: unknown[] = [
    { type: 'setTempo', bpm: 80 },
    { type: 'addRehearsalMarksEvery', interval: 4, style: 'letters' },
    { type: 'applyPracticeProfile', profile: 'rehearsal' },
  ];
  if (instrument) commands.push({ type: 'fitPartToInstrument', instrument });

  const practice = applyDocumentCommands(buildDocumentState(xml), commands);
  const stem = filename.replace(/\.[^.]+$/, '') || 'score';
  const practiceXmlName = `${stem}.practice.musicxml`;
  const practiceAbcName = `${stem}.practice.abc`;

  return {
    manifest: {
      title: `${stem} practice pack`,
      commandCount: practice.appliedCommands.length,
      instrument,
      generatedAt: new Date().toISOString(),
    },
    files: [
      {
        name: practiceXmlName,
        mimeType: 'application/vnd.recordare.musicxml+xml',
        content: practice.xml,
      },
      {
        name: practiceAbcName,
        mimeType: 'text/plain; charset=utf-8',
        content: musicXmlToAbc(practice.xml, practiceXmlName),
      },
    ],
  } satisfies PracticePack;
}
