import { DOMParser, XMLSerializer, type Element as XmlElement } from '@xmldom/xmldom';

function directChildrenByTag(parent: XmlElement, tag: string) {
  const matches: XmlElement[] = [];
  for (let i = 0; i < parent.childNodes.length; i++) {
    const child = parent.childNodes[i];
    if (child.nodeType === 1 && (child as XmlElement).tagName === tag) {
      matches.push(child as XmlElement);
    }
  }
  return matches;
}

export function extractPartMusicXml(xml: string, partId: string) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'application/xml');

  const scorePartwise = doc.getElementsByTagName('score-partwise')[0];
  if (!scorePartwise) {
    throw new Error('Score is not a MusicXML score-partwise document.');
  }

  const partList = doc.getElementsByTagName('part-list')[0];
  const selectedScorePart = Array.from(doc.getElementsByTagName('score-part')).find((entry) => entry.getAttribute('id') === partId);
  const selectedPart = Array.from(doc.getElementsByTagName('part')).find((entry) => entry.getAttribute('id') === partId);

  if (!selectedScorePart || !selectedPart) {
    throw new Error(`Part ${partId} was not found in the score.`);
  }

  if (partList) {
    const removableChildren = directChildrenByTag(partList, 'score-part')
      .filter((entry) => entry.getAttribute('id') !== partId);
    for (const child of removableChildren) {
      partList.removeChild(child);
    }

    // Drop empty part-group wrappers after the selected score-part has been isolated.
    for (const child of Array.from(partList.childNodes)) {
      if (child.nodeType !== 1) continue;
      const element = child as XmlElement;
      if (element.tagName !== 'part-group') continue;
      const groupNumber = element.getAttribute('number');
      const siblingScorePart = Array.from(partList.childNodes).some((node) => (
        node.nodeType === 1
        && (node as XmlElement).tagName === 'score-part'
        && (node as XmlElement).getAttribute('id') === partId
      ));
      if (!siblingScorePart || groupNumber == null) {
        partList.removeChild(element);
      }
    }
  }

  const removableParts = Array.from(doc.getElementsByTagName('part'))
    .filter((entry) => entry.getAttribute('id') !== partId);
  for (const part of removableParts) {
    part.parentNode?.removeChild(part);
  }

  const serialized = new XMLSerializer().serializeToString(doc);
  return serialized.startsWith('<?xml')
    ? serialized
    : `<?xml version="1.0" encoding="UTF-8"?>\n${serialized}`;
}

export function buildExtractedPartFilename(filename: string, partName: string) {
  const baseName = filename.replace(/\.[^.]+$/, '') || 'score';
  const extension = filename.match(/\.[^.]+$/)?.[0] ?? '.musicxml';
  const normalizedPart = partName
    .trim()
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    || 'part';
  return `${baseName}-${normalizedPart}${extension}`;
}
