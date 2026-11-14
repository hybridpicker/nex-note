// Every file type Nex Note opens, in one place. The upload zone, the file dialogs, the conversion
// route and the tests read this list. `electron/main.cjs` and the `fileAssociations` in package.json
// cannot import TypeScript and keep a copy; `test/score-import-formats.test.ts` fails when a copy
// falls behind.

export type ScoreImportKind =
  | 'nxn'
  | 'xml'
  | 'mxl'
  | 'mscz'
  /** Read by the MuseScore command line and converted to MusicXML. */
  | 'musescore-cli'
  | 'midi'
  | 'gp'
  | 'pdf'
  | 'image';

export interface ScoreImportFormat {
  extension: string;
  kind: ScoreImportKind;
  label: string;
}

export const SCORE_IMPORT_FORMATS: readonly ScoreImportFormat[] = [
  { extension: 'nxn', kind: 'nxn', label: 'Nex Note project' },
  { extension: 'pdf', kind: 'pdf', label: 'PDF (optical music recognition)' },
  { extension: 'png', kind: 'image', label: 'Image' },
  { extension: 'jpg', kind: 'image', label: 'Image' },
  { extension: 'jpeg', kind: 'image', label: 'Image' },
  { extension: 'tif', kind: 'image', label: 'Image' },
  { extension: 'tiff', kind: 'image', label: 'Image' },
  { extension: 'webp', kind: 'image', label: 'Image' },
  { extension: 'bmp', kind: 'image', label: 'Image' },
  { extension: 'heic', kind: 'image', label: 'Image' },
  { extension: 'heif', kind: 'image', label: 'Image' },
  { extension: 'mxl', kind: 'mxl', label: 'Compressed MusicXML' },
  { extension: 'xml', kind: 'xml', label: 'MusicXML' },
  { extension: 'musicxml', kind: 'xml', label: 'MusicXML' },
  { extension: 'mscz', kind: 'mscz', label: 'MuseScore' },
  { extension: 'mscx', kind: 'musescore-cli', label: 'MuseScore (uncompressed)' },
  { extension: 'mid', kind: 'midi', label: 'MIDI' },
  { extension: 'midi', kind: 'midi', label: 'MIDI' },
  { extension: 'kar', kind: 'midi', label: 'MIDI karaoke' },
  { extension: 'gp', kind: 'gp', label: 'Guitar Pro' },
  { extension: 'gp3', kind: 'gp', label: 'Guitar Pro 3' },
  { extension: 'gp4', kind: 'gp', label: 'Guitar Pro 4' },
  { extension: 'gp5', kind: 'gp', label: 'Guitar Pro 5' },
  { extension: 'gp6', kind: 'gp', label: 'Guitar Pro 6' },
  { extension: 'gpx', kind: 'gp', label: 'Guitar Pro 6' },
  { extension: 'gtp', kind: 'gp', label: 'Guitar Pro' },
  { extension: 'ptb', kind: 'musescore-cli', label: 'Power Tab' },
  { extension: 'cap', kind: 'musescore-cli', label: 'Capella' },
  { extension: 'capx', kind: 'musescore-cli', label: 'Capella' },
  { extension: 'mei', kind: 'musescore-cli', label: 'MEI' },
  { extension: 'ove', kind: 'musescore-cli', label: 'Overture' },
  { extension: 'scw', kind: 'musescore-cli', label: 'Score Writer' },
  { extension: 'bww', kind: 'musescore-cli', label: 'Bagpipe Music Writer' },
];

export const SCORE_IMPORT_EXTENSIONS: readonly string[] = SCORE_IMPORT_FORMATS.map((format) => format.extension);

/** Value for `<input type="file" accept>`. */
export const IMPORT_FILE_ACCEPT = SCORE_IMPORT_EXTENSIONS.map((extension) => `.${extension}`).join(',');

const KIND_BY_EXTENSION = new Map(SCORE_IMPORT_FORMATS.map((format) => [format.extension, format.kind]));

// Formats of other notation programs that nothing on this machine can read. Each has a way out.
const EXPORT_ADVICE: Record<string, string> = {
  sib: 'Sibelius files cannot be read directly. In Sibelius choose File > Export > MusicXML and open the .musicxml file.',
  musx: 'Finale files cannot be read directly. In Finale choose File > Export > MusicXML and open the .musicxml file.',
  mus: 'Finale files cannot be read directly. In Finale choose File > Export > MusicXML and open the .musicxml file.',
  dorico: 'Dorico projects cannot be read directly. In Dorico choose File > Export > MusicXML and open the .musicxml file.',
  nwc: 'NoteWorthy files cannot be read directly. Export MusicXML from NoteWorthy Composer and open that file.',
  ly: 'LilyPond sources cannot be read directly. Open the engraved PDF instead, or convert with a LilyPond-to-MusicXML tool.',
  abc: 'ABC files cannot be imported yet. Convert the tune to MusicXML (for example with abc2xml) and open that file.',
  krn: 'Humdrum files cannot be read directly. Convert to MusicXML (for example with Verovio or music21) and open that file.',
  kern: 'Humdrum files cannot be read directly. Convert to MusicXML (for example with Verovio or music21) and open that file.',
};

export function scoreImportExtension(filename: string): string {
  const match = /\.([^./\\]+)$/.exec(filename.trim().toLowerCase());
  return match ? match[1]! : '';
}

export function classifyScoreImport(filename: string): ScoreImportKind | 'unsupported' {
  return KIND_BY_EXTENSION.get(scoreImportExtension(filename)) ?? 'unsupported';
}

export function isSupportedScoreImport(filename: string): boolean {
  return classifyScoreImport(filename) !== 'unsupported';
}

/** What to tell somebody whose file cannot be opened. */
export function describeUnsupportedScoreImport(filename: string): string {
  const extension = scoreImportExtension(filename);
  const advice = EXPORT_ADVICE[extension];
  if (advice) return `${filename}: ${advice}`;
  return `Unsupported import format for ${filename}. Nex Note opens: ${SCORE_IMPORT_EXTENSIONS.join(', ')}.`;
}
