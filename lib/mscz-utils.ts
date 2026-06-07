import JSZip from 'jszip';

export interface MsczArchiveInfo {
  filename?: string;
  scoreVersion?: string;
  programVersion?: string;
}

export async function inspectMsczArchive(buffer: Buffer): Promise<MsczArchiveInfo> {
  const zip = await JSZip.loadAsync(buffer);
  const containerFile = zip.file('META-INF/container.xml');
  let rootFile: string | undefined;

  if (containerFile) {
    const containerXml = await containerFile.async('string');
    rootFile = containerXml.match(/full-path="([^"]+\.mscx)"/)?.[1];
  }

  rootFile ??= Object.keys(zip.files)
    .filter((name) => name.toLowerCase().endsWith('.mscx') && !name.startsWith('META-INF/'))
    .sort()[0];

  if (!rootFile) return {};

  const scoreFile = zip.file(rootFile);
  if (!scoreFile) return {};

  const xml = await scoreFile.async('string');
  return {
    filename: rootFile,
    scoreVersion: xml.match(/<museScore\b[^>]*\bversion="([^"]+)"/)?.[1],
    programVersion: xml.match(/<programVersion>([^<]+)<\/programVersion>/)?.[1]?.trim(),
  };
}

export function extractVersionNumber(value: string | undefined) {
  return value?.match(/\d+(?:\.\d+){1,3}/)?.[0];
}

export function normalizeMuseScoreScoreVersion(value: string | undefined) {
  const version = extractVersionNumber(value);
  const match = version?.match(/^(\d+)\.(\d{2})$/);
  if (!match) return version;
  const [, major, minor] = match;
  if (!minor.endsWith('0')) return version;
  return `${major}.${Number.parseInt(minor.slice(0, -1), 10)}.0`;
}

export function compareVersionNumbers(left: string | undefined, right: string | undefined) {
  const leftVersion = extractVersionNumber(left);
  const rightVersion = extractVersionNumber(right);
  if (!leftVersion || !rightVersion) return null;

  const leftParts = leftVersion.split('.').map((part) => Number.parseInt(part, 10));
  const rightParts = rightVersion.split('.').map((part) => Number.parseInt(part, 10));
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const leftPart = leftParts[index] ?? 0;
    const rightPart = rightParts[index] ?? 0;
    if (leftPart > rightPart) return 1;
    if (leftPart < rightPart) return -1;
  }
  return 0;
}

export function formatMsczVersionMismatchError(input: {
  archive: MsczArchiveInfo;
  cliVersion: string;
}) {
  const savedBy = input.archive.programVersion
    ? `MuseScore ${input.archive.programVersion}`
    : input.archive.scoreVersion
      ? `MuseScore file format ${input.archive.scoreVersion}`
      : 'a newer MuseScore version';
  const fileFormat = input.archive.programVersion && input.archive.scoreVersion
    ? ` (file format ${input.archive.scoreVersion})`
    : '';

  return `This MSCZ was saved by ${savedBy}${fileFormat}, but the server converter is MuseScore ${input.cliVersion}. Export the score from MuseScore as MusicXML/MXL and upload that file, or update MUSESCORE_CLI on the server to MuseScore ${input.archive.programVersion ?? input.archive.scoreVersion} or newer.`;
}

export function shouldRejectMsczForCliVersion(archive: MsczArchiveInfo | undefined, cliVersion: string | undefined) {
  if (!archive || !cliVersion) return false;
  const sourceVersion = normalizeMuseScoreScoreVersion(archive.scoreVersion) ?? archive.programVersion;
  return compareVersionNumbers(sourceVersion, cliVersion) === 1;
}
