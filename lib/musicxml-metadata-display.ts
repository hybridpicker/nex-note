import type { ScoreDocumentModel } from '@/src/score-core/model/types';

const METADATA_PLACEHOLDER_TEXT = new Set(['title', 'subtitle', 'work number', 'composer', 'arranger', 'lyricist']);
let cachedMetadataXml = '';
let cachedMetadataDrawOptions: ReturnType<typeof buildMusicXmlMetadataDrawOptions> | null = null;

function hasConcreteText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return Boolean(trimmed && !METADATA_PLACEHOLDER_TEXT.has(trimmed.toLowerCase()));
}

function firstConcreteText(doc: Document, tagName: string) {
  return Array.from(doc.getElementsByTagName(tagName)).some((node) => hasConcreteText(node.textContent));
}

function hasConcreteCreator(doc: Document, type: string) {
  return Array.from(doc.getElementsByTagName('creator')).some((node) => (
    node.getAttribute('type') === type && hasConcreteText(node.textContent)
  ));
}

export function resolveMusicXmlMetadataDrawOptions(xml: string, coreDocument?: ScoreDocumentModel | null) {
  if (coreDocument) {
    return {
      drawTitle: hasConcreteText(coreDocument.metadata.title),
      drawSubtitle: hasConcreteText(coreDocument.metadata.subtitle),
      drawComposer: hasConcreteText(coreDocument.metadata.composer),
      drawLyricist: false,
    };
  }

  if (cachedMetadataDrawOptions && cachedMetadataXml === xml) return cachedMetadataDrawOptions;
  const options = buildMusicXmlMetadataDrawOptions(xml);
  cachedMetadataXml = xml;
  cachedMetadataDrawOptions = options;
  return options;
}

function buildMusicXmlMetadataDrawOptions(xml: string) {
  if (typeof DOMParser === 'undefined') {
    return {
      drawTitle: false,
      drawSubtitle: false,
      drawComposer: false,
      drawLyricist: false,
    };
  }

  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  return {
    drawTitle: firstConcreteText(doc, 'movement-title') || firstConcreteText(doc, 'work-title'),
    drawSubtitle: firstConcreteText(doc, 'work-number'),
    drawComposer: hasConcreteCreator(doc, 'composer'),
    drawLyricist: hasConcreteCreator(doc, 'lyricist'),
  };
}
