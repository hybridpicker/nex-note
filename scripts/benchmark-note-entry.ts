import fs from 'node:fs';
import os from 'node:os';
import { performance } from 'node:perf_hooks';
import { buildDocumentState, applyDocumentCommands, prepareDocumentCommands, commitPreparedDocumentCommands } from '../src/score-core/commands/apply-document-commands';
import type { ScoreCommand } from '../src/shared/schemas/score-command';

export function syntheticScore(measures: number, parts = 1): string {
  return `<score-partwise version="4.0"><part-list>${Array.from({ length: parts }, (_, p) => `<score-part id="P${p + 1}"><part-name>Synthetic ${p + 1}</part-name></score-part>`).join('')}</part-list>${Array.from({ length: parts }, (_, p) => `<part id="P${p + 1}">${Array.from({ length: measures }, (_, m) => `<measure number="${m + 1}">${m === 0 ? '<attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>' : ''}${Array.from({ length: 8 }, (_, n) => `<note><pitch><step>${'CDEFGAB'[n % 7]}</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>eighth</type><staff>1</staff></note>`).join('')}</measure>`).join('')}</part>`).join('')}</score-partwise>`;
}

if (process.argv[1]?.endsWith('benchmark-note-entry.ts')) {
  const samples = [];
  for (const [size, measures, parts] of [['small', 4, 1], ['medium', 32, 2], ['large', 128, 4]] as const) {
    let state = buildDocumentState(syntheticScore(measures, parts));
    const timings: number[] = [];
    for (let index = 0; index < 24; index++) {
      const event = state.coreDocument!.score.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events[0]!;
      const commands: ScoreCommand[] = [{ type: 'changeNotePitch', coreEntityId: event.id, corePartId: 'P1', measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: event.timestampDen, step: index % 2 ? 'C' : 'D', alter: 0, octave: 4 }];
      const started = performance.now();
      const prepared = process.argv.includes("--prepared") ? prepareDocumentCommands(state, commands) : undefined;
      const preview = prepared?.result ?? applyDocumentCommands(state, commands);
      // The baseline editor verifies a batch, then the document history applies it again.
      const committed = commitPreparedDocumentCommands(state, commands, prepared);
      if (preview.xml !== committed.xml) throw new Error('Preview/commit mismatch');
      if (index >= 4) timings.push(performance.now() - started);
      state = committed;
    }
    timings.sort((a, b) => a - b);
    samples.push({ size, measures, parts, events: measures * parts * 8, samples: timings.length, medianMs: timings[Math.floor(timings.length / 2)], p95Ms: timings[Math.ceil(timings.length * .95) - 1], maxMs: timings.at(-1) });
  }
  const report = { environment: { cpu: os.cpus()[0]?.model, platform: os.platform(), arch: os.arch(), node: process.version }, metric: 'synchronous editor verification plus document commit; excludes renderer, display and hardware audio', samples };
  fs.writeFileSync(process.argv[2] ?? '.nex/note-entry-quality/baseline.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
