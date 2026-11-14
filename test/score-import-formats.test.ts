import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { PDFDocument } from 'pdf-lib';

import {
  IMPORT_FILE_ACCEPT,
  SCORE_IMPORT_EXTENSIONS,
  classifyScoreImport,
  describeUnsupportedScoreImport,
  isSupportedScoreImport,
} from '../lib/score-import-formats.ts';
import { describeOmrFailure, inspectPdfForImport } from '../lib/pdf-import-preflight.ts';

const sorted = (values: Iterable<string>) => [...values].sort();

test('file names are classified by their extension, whatever the case', () => {
  assert.equal(classifyScoreImport('Sonata.PDF'), 'pdf');
  assert.equal(classifyScoreImport('scan.jpeg'), 'image');
  assert.equal(classifyScoreImport('song.musicxml'), 'xml');
  assert.equal(classifyScoreImport('song.mxl'), 'mxl');
  assert.equal(classifyScoreImport('song.mscz'), 'mscz');
  assert.equal(classifyScoreImport('song.mscx'), 'musescore-cli');
  assert.equal(classifyScoreImport('chor.capx'), 'musescore-cli');
  assert.equal(classifyScoreImport('edition.mei'), 'musescore-cli');
  assert.equal(classifyScoreImport('riff.gp3'), 'gp');
  assert.equal(classifyScoreImport('riff.gp'), 'gp');
  assert.equal(classifyScoreImport('tune.kar'), 'midi');
  assert.equal(classifyScoreImport('project.nxn'), 'nxn');
  assert.equal(classifyScoreImport('notes.txt'), 'unsupported');
  assert.equal(classifyScoreImport('no-extension'), 'unsupported');
  assert.equal(isSupportedScoreImport('a.b.c.PNG'), true);
});

test('the file input accepts every extension once', () => {
  const accepted = IMPORT_FILE_ACCEPT.split(',');
  assert.equal(accepted.length, new Set(accepted).size);
  assert.deepEqual(accepted, SCORE_IMPORT_EXTENSIONS.map((extension) => `.${extension}`));
});

test('files of other notation programs get a way out instead of a bare refusal', () => {
  assert.match(describeUnsupportedScoreImport('symphony.sib'), /Sibelius.*Export.*MusicXML/);
  assert.match(describeUnsupportedScoreImport('symphony.musx'), /Finale.*Export.*MusicXML/);
  assert.match(describeUnsupportedScoreImport('symphony.dorico'), /Dorico/);
  assert.match(describeUnsupportedScoreImport('notes.txt'), /Nex Note opens: .*pdf.*musicxml/);
});

test('the Electron open list matches the shared list', () => {
  const main = readFileSync(new URL('../electron/main.cjs', import.meta.url), 'utf8');
  const block = /const SUPPORTED_OPEN_EXTENSIONS = new Set\(\[([\s\S]*?)\]\);/.exec(main)?.[1] ?? '';
  const electron = [...block.matchAll(/'\.([a-z0-9]+)'/g)].map((match) => match[1]!);
  assert.deepEqual(sorted(electron), sorted(SCORE_IMPORT_EXTENSIONS));
});

test('the packaged file associations match the shared list', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const associated = pkg.build.fileAssociations.flatMap((entry: { ext: string[] }) => entry.ext);
  assert.deepEqual(sorted(associated), sorted(SCORE_IMPORT_EXTENSIONS));
});

test('a PDF is counted, and unreadable files are refused with a reason', async () => {
  const pdf = await PDFDocument.create();
  pdf.addPage([200, 200]);
  pdf.addPage([200, 200]);
  pdf.addPage([200, 200]);
  assert.deepEqual(await inspectPdfForImport(await pdf.save()), { ok: true, pageCount: 3 });

  const broken = await inspectPdfForImport(new TextEncoder().encode('this is not a pdf'));
  assert.equal(broken.ok, false);
  assert.equal(!broken.ok && broken.reason, 'unreadable');
});

test('converter failures become sentences about what is missing', () => {
  assert.match(describeOmrFailure(new Error('spawn bash ENOENT')), /needs Audiveris and Tesseract/);
  assert.match(describeOmrFailure(new Error('Could not resolve Tesseract for Audiveris.')), /brew install tesseract/);
  assert.match(describeOmrFailure(new Error('Could not read output MXL: Error: No .mxl file was produced by the OMR converter')), /No music was recognized/);
  assert.match(describeOmrFailure(new Error('pdf-to-musescore.sh failed (exit 3): boom\nlast line')), /could not be recognized: last line/);
});
