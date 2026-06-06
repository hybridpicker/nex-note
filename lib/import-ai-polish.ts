export type ImportPolishSourceFormat = 'xml' | 'mxl' | 'mscz' | 'pdf' | 'image' | 'gp' | 'midi' | 'unknown';

export const MAX_AUTO_IMPORT_POLISH_COMMANDS = 80;

export function getImportPolishSourceFormat(filename: string): ImportPolishSourceFormat {
  const lower = filename.toLowerCase();
  if (/\.(xml|musicxml)$/.test(lower)) return 'xml';
  if (/\.mxl$/.test(lower)) return 'mxl';
  if (/\.mscz$/.test(lower)) return 'mscz';
  if (/\.pdf$/.test(lower)) return 'pdf';
  if (/\.(png|jpe?g|tiff?|webp|bmp|heic|heif)$/.test(lower)) return 'image';
  if (/\.(gp|gp4|gp5|gp6|gpx)$/.test(lower)) return 'gp';
  if (/\.(mid|midi)$/.test(lower)) return 'midi';
  return 'unknown';
}

export function shouldPolishImportedScore(format: ImportPolishSourceFormat) {
  return format === 'xml' || format === 'mxl' || format === 'mscz' || format === 'pdf' || format === 'image' || format === 'gp';
}

export function shouldAutoApplyImportPolishCommands(commandCount: number) {
  return commandCount > 0 && commandCount <= MAX_AUTO_IMPORT_POLISH_COMMANDS;
}

export function buildImportPolishMessage(format: ImportPolishSourceFormat, filename: string) {
  const sourceLabel = format === 'gp'
    ? 'Guitar Pro'
    : format === 'mscz'
      ? 'MuseScore'
      : format === 'pdf'
        ? 'PDF'
        : format === 'image'
          ? 'image'
          : 'MusicXML';
  const guitarProGuardrail = format === 'gp'
    ? ' Preserve all TAB staves, staff-type=tab, string/fret notation, guitar techniques, bends, slides, palm mutes, repeats, and part order. Do not reduce the file to standard notation.'
    : '';
  return [
    '/layout-cleanup',
    `Polish the imported ${sourceLabel} score layout for readability after conversion.`,
    'Improve spacing, system breaks, page breaks, and staff spacing conservatively.',
    'Do not change pitches, rhythms, voices, articulations, lyrics, repeats, or instrumentation.',
    guitarProGuardrail,
    `Source file: ${filename}`,
  ].filter(Boolean).join(' ');
}

export function musicXmlTextHasTabStaff(xml: string) {
  return /<staff-type>\s*tab\s*<\/staff-type>/i.test(xml);
}

function countMatches(xml: string, pattern: RegExp) {
  return xml.match(pattern)?.length ?? 0;
}

export function shouldAcceptPolishedImportXml(input: {
  originalXml: string;
  polishedXml: string;
  format: ImportPolishSourceFormat;
}) {
  if (!input.polishedXml.trim()) return false;
  if (input.format !== 'gp') return true;

  const originalHasTab = musicXmlTextHasTabStaff(input.originalXml);
  if (originalHasTab && !musicXmlTextHasTabStaff(input.polishedXml)) return false;

  const originalStringMarkers = countMatches(input.originalXml, /<string\b/gi);
  const polishedStringMarkers = countMatches(input.polishedXml, /<string\b/gi);
  if (polishedStringMarkers < originalStringMarkers) return false;

  const originalFretMarkers = countMatches(input.originalXml, /<fret\b/gi);
  const polishedFretMarkers = countMatches(input.polishedXml, /<fret\b/gi);
  if (polishedFretMarkers < originalFretMarkers) return false;

  return true;
}
