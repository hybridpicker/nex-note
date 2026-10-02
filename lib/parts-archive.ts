import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';
import { buildExtractedPartFilename, extractPartMusicXml } from './part-extraction';

export interface PartsArchiveEntry {
  partId: string;
  partName: string;
  filename: string;
}

function listScoreParts(xml: string) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  return Array.from(doc.getElementsByTagName('score-part')).map((entry) => {
    const nameNode = entry.getElementsByTagName('part-name')[0];
    return {
      partId: entry.getAttribute('id') ?? '',
      partName: nameNode?.textContent?.trim() || entry.getAttribute('id') || 'part',
    };
  }).filter((part) => part.partId);
}

/** Packs every part of a score into one ZIP of single-part MusicXML files (one file per player). */
export async function buildPartsArchive(xml: string, filename: string) {
  const parts = listScoreParts(xml);
  if (parts.length === 0) throw new Error('The score contains no parts to extract.');
  const zip = new JSZip();
  const entries: PartsArchiveEntry[] = [];
  const usedNames = new Set<string>();
  for (const part of parts) {
    let name = buildExtractedPartFilename(filename || 'score.musicxml', part.partName);
    if (usedNames.has(name)) name = buildExtractedPartFilename(filename || 'score.musicxml', `${part.partName}-${part.partId}`);
    usedNames.add(name);
    zip.file(name, extractPartMusicXml(xml, part.partId));
    entries.push({ ...part, filename: name });
  }
  const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  return { bytes, entries };
}
