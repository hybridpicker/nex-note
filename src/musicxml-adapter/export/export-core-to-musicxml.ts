import { DOMParser, XMLSerializer, type Document as XmlDocument } from '@xmldom/xmldom';
import type { MeasureNode, PartNode, ScoreDocumentModel, TimedEvent, VoiceNode } from '@/src/score-core/model/types';
import { getEffectiveMeasureTimingFromStaff } from '@/src/score-core/measure-timing';
import { writtenAccidentalToMusicXml } from '@/src/shared/music/accidentals';

type XmlEl = ReturnType<XmlDocument['createElement']>;

const METADATA_PLACEHOLDER_TEXT = new Set(['title', 'subtitle', 'work number', 'composer', 'arranger']);

function isMetadataPlaceholder(value: string | null | undefined) {
  const trimmed = value?.trim();
  return Boolean(trimmed && METADATA_PLACEHOLDER_TEXT.has(trimmed.toLowerCase()));
}

const HARMONY_SUFFIX_KIND: Record<string, string> = {
  '': 'major',
  m: 'minor',
  min: 'minor',
  '-': 'minor',
  aug: 'augmented',
  '+': 'augmented',
  dim: 'diminished',
  o: 'diminished',
  '7': 'dominant',
  m7: 'minor-seventh',
  min7: 'minor-seventh',
  '-7': 'minor-seventh',
  maj7: 'major-seventh',
  ma7: 'major-seventh',
  'M7': 'major-seventh',
  delta7: 'major-seventh',
  dim7: 'diminished-seventh',
  o7: 'diminished-seventh',
  aug7: 'augmented-seventh',
  '+7': 'augmented-seventh',
  m7b5: 'half-diminished',
  'm7(b5)': 'half-diminished',
  min7b5: 'half-diminished',
  'min7(b5)': 'half-diminished',
  'ø': 'half-diminished',
  'ø7': 'half-diminished',
  'm(maj7)': 'major-minor',
  'min(maj7)': 'major-minor',
  'mM7': 'major-minor',
  'mMaj7': 'major-minor',
  '6': 'major-sixth',
  m6: 'minor-sixth',
  min6: 'minor-sixth',
  '9': 'dominant-ninth',
  maj9: 'major-ninth',
  ma9: 'major-ninth',
  m9: 'minor-ninth',
  min9: 'minor-ninth',
  '11': 'dominant-11th',
  maj11: 'major-11th',
  ma11: 'major-11th',
  m11: 'minor-11th',
  min11: 'minor-11th',
  '13': 'dominant-13th',
  maj13: 'major-13th',
  ma13: 'major-13th',
  m13: 'minor-13th',
  min13: 'minor-13th',
  sus2: 'suspended-second',
  sus4: 'suspended-fourth',
  sus: 'suspended-fourth',
  '5': 'power',
  '(9)': 'dominant',
};

const HARMONY_SUFFIX_CANONICAL: Record<string, string> = {
  m7b5: 'm7b5',
  'm7(b5)': 'm7b5',
  min7b5: 'm7b5',
  'min7(b5)': 'm7b5',
  mal7b5: 'm7b5',
  mal7: 'm7',
};

const GERMAN_HARMONY_ROOTS: Record<string, { step: string; alter: number }> = {
  cis: { step: 'C', alter: 1 },
  ces: { step: 'C', alter: -1 },
  des: { step: 'D', alter: -1 },
  dis: { step: 'D', alter: 1 },
  es: { step: 'E', alter: -1 },
  ees: { step: 'E', alter: -1 },
  eis: { step: 'E', alter: 1 },
  fes: { step: 'F', alter: -1 },
  fis: { step: 'F', alter: 1 },
  ges: { step: 'G', alter: -1 },
  gis: { step: 'G', alter: 1 },
  as: { step: 'A', alter: -1 },
  aes: { step: 'A', alter: -1 },
  ais: { step: 'A', alter: 1 },
  h: { step: 'B', alter: 0 },
};

function normalizeHarmonySuffixText(suffix: string) {
  const trimmed = suffix.trim();
  if (!trimmed) return '';
  const compact = trimmed.replace(/\s+/g, '');
  const direct = HARMONY_SUFFIX_KIND[trimmed] ? trimmed : HARMONY_SUFFIX_KIND[compact] ? compact : null;
  if (direct) return direct;
  return HARMONY_SUFFIX_CANONICAL[compact.toLowerCase()] ?? compact;
}

function resolveHarmonyKindFromSuffix(suffix: string) {
  const normalized = normalizeHarmonySuffixText(suffix);
  return HARMONY_SUFFIX_KIND[normalized]
    ?? HARMONY_SUFFIX_KIND[normalized.toLowerCase()]
    ?? 'other';
}

function splitHarmonySuffixDegrees(suffix: string) {
  const normalized = normalizeHarmonySuffixText(suffix);
  if (!normalized) return { kindText: '', degrees: [] as Array<{ value: string; alter: number }> };
  if (resolveHarmonyKindFromSuffix(normalized) !== 'dominant') {
    return { kindText: normalized, degrees: [] as Array<{ value: string; alter: number }> };
  }

  const degrees: Array<{ value: string; alter: number }> = [];
  const kindText = normalized.replace(/([#b])(\d+)/g, (_match, accidental: string, value: string) => {
    degrees.push({ value, alter: accidental === '#' ? 1 : -1 });
    return '';
  }) || normalized;

  return { kindText, degrees };
}

function shouldRenderHarmonyAsLiteralWords(suffix: string) {
  const normalized = normalizeHarmonySuffixText(suffix);
  if (!normalized) return false;
  if (resolveHarmonyKindFromSuffix(normalized) !== 'other') return false;
  return /(?:[#b]\d|add|alt)/i.test(normalized);
}

function suffixResolvesToKnownKind(suffix: string) {
  const normalized = normalizeHarmonySuffixText(suffix);
  return normalized === '' || resolveHarmonyKindFromSuffix(normalized) !== 'other';
}

function parseGermanHarmonyRoot(value: string) {
  const compact = value.trim();
  const rootMatch = compact.match(/^(cis|ces|des|dis|ees|eis|fes|fis|ges|gis|aes|ais|es|as|h)(.*)$/i);
  if (!rootMatch) return null;
  const [, rootName, suffix = ''] = rootMatch;
  if ((rootName.toLowerCase() === 'as' || rootName.toLowerCase() === 'es') && /^us/i.test(suffix)) return null;
  const root = GERMAN_HARMONY_ROOTS[rootName.toLowerCase()];
  if (!root) return null;
  return { ...root, suffix };
}

function parseEnglishHarmonyRoot(value: string) {
  const rootMatch = value.trim().match(/^([A-Ga-g])([#b]?)(.*)$/);
  if (!rootMatch) return null;
  const [, step, accidental, suffix = ''] = rootMatch;
  return {
    step: step.toUpperCase(),
    alter: accidental === '#' ? 1 : accidental === 'b' ? -1 : 0,
    suffix,
  };
}

function parseHarmonyRoot(value: string) {
  const english = parseEnglishHarmonyRoot(value);
  const german = parseGermanHarmonyRoot(value);
  if (!german) return english;
  if (!english) return german;
  if (!suffixResolvesToKnownKind(english.suffix) && suffixResolvesToKnownKind(german.suffix)) return german;
  return english;
}

function serialize(doc: XmlDocument) {
  const serialized = new XMLSerializer().serializeToString(doc);
  return serialized.startsWith('<?xml') ? serialized : '<?xml version="1.0" encoding="UTF-8"?>\n' + serialized;
}

function parseXmlFragment(doc: XmlDocument, xml: string) {
  const parsed = new DOMParser().parseFromString(`<root>${xml}</root>`, 'application/xml');
  const root = parsed.documentElement;
  const cloned: XmlEl[] = [];
  if (!root) return cloned;
  for (let i = 0; i < root.childNodes.length; i += 1) {
    const child = root.childNodes[i];
    if (child.nodeType !== 1) continue;
    cloned.push(doc.importNode ? doc.importNode(child, true) as XmlEl : child.cloneNode(true) as XmlEl);
  }
  return cloned;
}

function appendPreservedXmlFragments(doc: XmlDocument, parent: XmlEl, fragments?: string[]) {
  fragments?.forEach((fragment) => {
    parseXmlFragment(doc, fragment).forEach((node) => parent.appendChild(node));
  });
}

function getOrCreateDirectChild(doc: XmlDocument, parent: XmlEl, tag: string) {
  for (let i = 0; i < parent.childNodes.length; i++) {
    const child = parent.childNodes[i] as XmlEl;
    if (child.nodeType === 1 && child.tagName === tag) return child;
  }
  const created = doc.createElement(tag);
  parent.appendChild(created);
  return created;
}

const SCORE_PARTWISE_CHILD_ORDER = [
  'work',
  'movement-number',
  'movement-title',
  'identification',
  'defaults',
  'credit',
  'part-list',
  'part',
];

function scorePartwiseChildOrder(tag: string) {
  const index = SCORE_PARTWISE_CHILD_ORDER.indexOf(tag);
  return index < 0 ? SCORE_PARTWISE_CHILD_ORDER.length : index;
}

function getDirectChild(parent: XmlEl, tag: string) {
  for (let i = 0; i < parent.childNodes.length; i++) {
    const child = parent.childNodes[i] as XmlEl;
    if (child.nodeType === 1 && child.tagName === tag) return child;
  }
  return null;
}

function appendRootChildInMusicXmlOrder(doc: XmlDocument, root: XmlEl, tag: string) {
  const created = doc.createElement(tag);
  const order = scorePartwiseChildOrder(tag);
  for (let i = 0; i < root.childNodes.length; i++) {
    const child = root.childNodes[i] as XmlEl;
    if (child.nodeType !== 1) continue;
    if (scorePartwiseChildOrder(child.tagName) > order) {
      root.insertBefore(created, child);
      return created;
    }
  }
  root.appendChild(created);
  return created;
}

function getOrCreateRootChildInMusicXmlOrder(doc: XmlDocument, root: XmlEl, tag: string) {
  return getDirectChild(root, tag) ?? appendRootChildInMusicXmlOrder(doc, root, tag);
}

function setOrCreateTextElement(doc: XmlDocument, parent: XmlEl, tag: string, value: string) {
  const element = getOrCreateDirectChild(doc, parent, tag);
  element.textContent = value;
  return element;
}

function removeDirectChildrenByTag(parent: XmlEl, tag: string) {
  const toRemove: XmlEl[] = [];
  for (let i = 0; i < parent.childNodes.length; i++) {
    const child = parent.childNodes[i] as XmlEl;
    if (child.nodeType === 1 && child.tagName === tag) toRemove.push(child);
  }
  for (const child of toRemove) parent.removeChild(child);
}

function setCreator(doc: XmlDocument, root: XmlEl, type: 'arranger' | 'composer', value?: string) {
  let identification = getDirectChild(root, 'identification');
  if (!identification && !value?.trim()) return;
  identification ??= getOrCreateRootChildInMusicXmlOrder(doc, root, 'identification');
  const creators = Array.from(identification.getElementsByTagName('creator'));
  let creator = creators.find((entry) => entry.getAttribute('type') === type) ?? null;
  if (!value?.trim()) {
    if (creator) identification.removeChild(creator);
    if (!Array.from(identification.childNodes).some((child) => child.nodeType === 1)) {
      identification.parentNode?.removeChild(identification);
    }
    return;
  }
  if (!creator) {
    creator = doc.createElement('creator');
    creator.setAttribute('type', type);
    identification.appendChild(creator);
  }
  creator.textContent = value;
}

function removePlaceholderCreditBlocks(root: XmlEl) {
  const credits = Array.from(root.getElementsByTagName('credit')) as XmlEl[];
  for (const credit of credits) {
    const words = Array.from(credit.getElementsByTagName('credit-words'));
    if (words.some((word) => isMetadataPlaceholder(word.textContent))) {
      credit.parentNode?.removeChild(credit);
    }
  }
}

function getMeasureByXmlNumber(part: XmlEl, xmlMeasureNumber: number) {
  return Array.from(part.getElementsByTagName('measure')).find((measure) => parseInt(measure.getAttribute('number') ?? '0', 10) === xmlMeasureNumber) ?? null;
}

function sourceMeasureNumberFor(measure: Pick<MeasureNode, 'measureNumber' | 'sourceMeasureNumber'>) {
  return measure.measureNumber;
}

function getMeasureForCoreMeasure(part: XmlEl, measure: Pick<MeasureNode, 'measureNumber' | 'sourceMeasureNumber'>) {
  return getMeasureByXmlNumber(part, sourceMeasureNumberFor(measure))
    ?? getMeasureByXmlNumber(part, measure.measureNumber);
}

function stripMeasureContent(measure: XmlEl) {
  const removableTags = new Set(['note', 'backup', 'forward', 'direction', 'harmony', 'print', 'barline']);
  const toRemove: XmlEl[] = [];
  for (let i = 0; i < measure.childNodes.length; i++) {
    const child = measure.childNodes[i] as XmlEl;
    if (child.nodeType === 1 && removableTags.has(child.tagName)) {
      toRemove.push(child);
    }
  }
  for (const child of toRemove) measure.removeChild(child);
}

function findCanonicalMeasures(partNode: Pick<PartNode, 'staves'>): MeasureNode[] {
  // Use the first staff that actually has measures as canonical.
  // This prevents silent data loss when staves[0] is empty (e.g. all notes
  // happen to be on a different staff after a multi-part import or AI edit).
  for (const staff of partNode.staves) {
    if (staff.measures.length > 0) return staff.measures;
  }
  // Fallback: return staves[0] measures (empty array) if no staff has measures.
  return partNode.staves[0]?.measures ?? [];
}

function syncPartMeasures(doc: XmlDocument, coreDocument: ScoreDocumentModel) {
  const xmlParts = Array.from(doc.getElementsByTagName('part'));
  for (const partNode of coreDocument.score.parts) {
    const xmlPart = xmlParts.find((part) => part.getAttribute('id') === partNode.sourcePartId) as XmlEl | undefined;
    if (!xmlPart) continue;

    const existingMeasures = Array.from(xmlPart.getElementsByTagName('measure')) as XmlEl[];
    const bySourceNumber = new Map<number, XmlEl>();
    for (const measure of existingMeasures) {
      const number = parseInt(measure.getAttribute('number') ?? '0', 10);
      if (Number.isFinite(number) && number >= 0) bySourceNumber.set(number, measure);
    }

    const canonicalMeasures = findCanonicalMeasures(partNode);
    const orderedMeasures: XmlEl[] = [];
    canonicalMeasures.forEach((coreMeasure, index) => {
      const sourceMeasure = coreMeasure.sourceMeasureNumber != null
        ? bySourceNumber.get(coreMeasure.sourceMeasureNumber) ?? null
        : null;
      const measureEl = sourceMeasure
        ? sourceMeasure.cloneNode(true) as XmlEl
        : ((orderedMeasures[index - 1]?.cloneNode(true) as XmlEl | undefined)
          ?? (existingMeasures[Math.max(0, index - 1)]?.cloneNode(true) as XmlEl | undefined)
          ?? doc.createElement('measure'));
      stripMeasureContent(measureEl);
      measureEl.setAttribute('number', String(sourceMeasureNumberFor(coreMeasure)));
      if (coreMeasure.implicit) {
        measureEl.setAttribute('implicit', 'yes');
      } else {
        measureEl.removeAttribute('implicit');
      }
      orderedMeasures.push(measureEl);
    });

    for (const measure of existingMeasures) {
      xmlPart.removeChild(measure);
    }
    for (const measure of orderedMeasures) {
      xmlPart.appendChild(measure);
    }
  }
}

function updatePartList(doc: XmlDocument, coreDocument: ScoreDocumentModel) {
  const scoreParts = Array.from(doc.getElementsByTagName('score-part'));
  for (const partNode of coreDocument.score.parts) {
    const scorePart = scoreParts.find((entry) => entry.getAttribute('id') === partNode.sourcePartId);
    if (!scorePart) continue;
    setOrCreateTextElement(doc, scorePart as XmlEl, 'part-name', partNode.name);
    if (partNode.abbreviation) {
      setOrCreateTextElement(doc, scorePart as XmlEl, 'part-abbreviation', partNode.abbreviation);
    }
    if (partNode.instrumentName) {
      const scoreInstrument = getOrCreateDirectChild(doc, scorePart as XmlEl, 'score-instrument');
      if (!scoreInstrument.getAttribute('id')) scoreInstrument.setAttribute('id', `${partNode.sourcePartId}-I1`);
      setOrCreateTextElement(doc, scoreInstrument, 'instrument-name', partNode.instrumentName);
    }
  }
}

function updateTranspose(doc: XmlDocument, coreDocument: ScoreDocumentModel) {
  const xmlParts = Array.from(doc.getElementsByTagName('part'));
  for (const partNode of coreDocument.score.parts) {
    const xmlPart = xmlParts.find((part) => part.getAttribute('id') === partNode.sourcePartId);
    const canonicalMeasures = findCanonicalMeasures(partNode);
    const firstMeasureRef = canonicalMeasures[0] ?? null;
    const firstMeasure = xmlPart && firstMeasureRef ? getMeasureForCoreMeasure(xmlPart as XmlEl, firstMeasureRef) : null;
    if (!firstMeasure) continue;
    const attributes = getOrCreateDirectChild(doc, firstMeasure as XmlEl, 'attributes');
    if (partNode.chromaticTranspose == null && partNode.diatonicTranspose == null) continue;
    const transpose = getOrCreateDirectChild(doc, attributes, 'transpose');
    if (partNode.chromaticTranspose != null) setOrCreateTextElement(doc, transpose, 'chromatic', String(partNode.chromaticTranspose));
    if (partNode.diatonicTranspose != null) setOrCreateTextElement(doc, transpose, 'diatonic', String(partNode.diatonicTranspose));
  }
}

function updateMetadata(doc: XmlDocument, coreDocument: ScoreDocumentModel) {
  const root = doc.documentElement as XmlEl | null;
  if (!root) return;
  removePlaceholderCreditBlocks(root);

  const work = root.getElementsByTagName('work')[0] as XmlEl | undefined;
  const movementTitle = root.getElementsByTagName('movement-title')[0] as XmlEl | undefined;

  if (coreDocument.metadata.title?.trim()) {
    if (work) {
      setOrCreateTextElement(doc, work, 'work-title', coreDocument.metadata.title);
      if (movementTitle?.parentNode) movementTitle.parentNode.removeChild(movementTitle);
    } else {
      const nextMovementTitle = movementTitle ?? appendRootChildInMusicXmlOrder(doc, root, 'movement-title');
      nextMovementTitle.textContent = coreDocument.metadata.title;
    }
  } else {
    if (work) removeDirectChildrenByTag(work, 'work-title');
    if (movementTitle?.parentNode) movementTitle.parentNode.removeChild(movementTitle);
  }

  if (coreDocument.metadata.subtitle?.trim()) {
    const ensuredWork = getOrCreateRootChildInMusicXmlOrder(doc, root, 'work');
    setOrCreateTextElement(doc, ensuredWork, 'work-number', coreDocument.metadata.subtitle);
  } else if (work) {
    removeDirectChildrenByTag(work, 'work-number');
  }

  if (work && !Array.from(work.childNodes).some((child) => child.nodeType === 1)) {
    work.parentNode?.removeChild(work);
  }

  setCreator(doc, root, 'composer', coreDocument.metadata.composer);
  setCreator(doc, root, 'arranger', coreDocument.metadata.arranger);
}

function updateAttributes(doc: XmlDocument, coreDocument: ScoreDocumentModel) {
  const xmlParts = Array.from(doc.getElementsByTagName('part'));
  for (const partNode of coreDocument.score.parts) {
    const xmlPart = xmlParts.find((part) => part.getAttribute('id') === partNode.sourcePartId);
    if (!xmlPart) continue;

    for (const staff of partNode.staves) {
      for (const measure of staff.measures) {
        const xmlMeasure = getMeasureForCoreMeasure(xmlPart as XmlEl, measure);
        if (!xmlMeasure) continue;
        const attributeSource = measure.attributes[0];
        if (!attributeSource) continue;
        const attributes = getOrCreateDirectChild(doc, xmlMeasure as XmlEl, 'attributes');
        if (attributeSource.divisions != null) {
          setOrCreateTextElement(doc, attributes, 'divisions', String(attributeSource.divisions));
        }

        if (attributeSource.keyFifths != null) {
          const key = getOrCreateDirectChild(doc, attributes, 'key');
          setOrCreateTextElement(doc, key, 'fifths', String(attributeSource.keyFifths));
        }

        if (attributeSource.time) {
          const time = getOrCreateDirectChild(doc, attributes, 'time');
          const beatGroups = attributeSource.time.beatGroups;
          const hasValidBeatGroups = Boolean(
            beatGroups
            && beatGroups.length > 1
            && beatGroups.every((group) => Number.isInteger(group) && group > 0)
            && beatGroups.reduce((sum, group) => sum + group, 0) === attributeSource.time.beats,
          );
          setOrCreateTextElement(
            doc,
            time,
            'beats',
            hasValidBeatGroups ? beatGroups!.join('+') : String(attributeSource.time.beats),
          );
          setOrCreateTextElement(doc, time, 'beat-type', String(attributeSource.time.beatType));
        }

        removeDirectChildrenByTag(attributes, 'clef');
        if (attributeSource.clefs.length > 0) {
          for (const clefData of attributeSource.clefs) {
            const clef = doc.createElement('clef');
            if (clefData.staffIndex >= 1) clef.setAttribute('number', String(clefData.staffIndex));
            if (clefData.sign) setOrCreateTextElement(doc, clef, 'sign', clefData.sign);
            if (clefData.line != null) setOrCreateTextElement(doc, clef, 'line', String(clefData.line));
            attributes.appendChild(clef);
          }
        }

        // Measure repeat (%)
        removeDirectChildrenByTag(attributes, 'measure-style');
        if (measure.measureRepeat != null && measure.measureRepeat > 0) {
          const measureStyle = doc.createElement('measure-style');
          const measureRepeat = doc.createElement('measure-repeat');
          measureRepeat.setAttribute('type', 'start');
          measureRepeat.textContent = String(measure.measureRepeat);
          measureStyle.appendChild(measureRepeat);
          attributes.appendChild(measureStyle);
        }
      }
    }
  }
}

function buildForward(doc: XmlDocument, duration: number) {
  const forward = doc.createElement('forward');
  setOrCreateTextElement(doc, forward, 'duration', String(duration));
  return forward;
}

function buildBackup(doc: XmlDocument, duration: number) {
  const backup = doc.createElement('backup');
  setOrCreateTextElement(doc, backup, 'duration', String(duration));
  return backup;
}

function getEventLyrics(coreDocument: ScoreDocumentModel, event: TimedEvent) {
  const semanticLyrics = coreDocument.lyricLines
    .filter((line) => line.eventId === event.id)
    .sort((a, b) => a.verseNumber - b.verseNumber)
    .map((line) => ({
      verseNumber: line.verseNumber,
      text: line.text,
      syllabic: line.syllabic,
    }));
  return semanticLyrics.length > 0 ? semanticLyrics : (event.lyrics ?? []);
}

function notePitchesEqual(left: TimedEvent | undefined, right: TimedEvent | undefined) {
  if (!left || !right || left.kind !== 'note' || right.kind !== 'note') return false;
  return left.pitch.step === right.pitch.step
    && left.pitch.alter === right.pitch.alter
    && left.pitch.octave === right.pitch.octave;
}

function compareTimedEventPosition(left: TimedEvent, right: TimedEvent) {
  return left.measureNumber - right.measureNumber
    || (left.timestampNum / Math.max(left.timestampDen, 1)) - (right.timestampNum / Math.max(right.timestampDen, 1))
    || Number(left.isChord) - Number(right.isChord)
    || left.id.localeCompare(right.id);
}

function compareTimedEventOnsetPosition(left: TimedEvent, right: TimedEvent) {
  return left.measureNumber - right.measureNumber
    || (left.timestampNum / Math.max(left.timestampDen, 1)) - (right.timestampNum / Math.max(right.timestampDen, 1));
}

function sameTimedEventOnset(left: TimedEvent, right: TimedEvent) {
  return left.measureNumber === right.measureNumber
    && left.timestampNum === right.timestampNum
    && left.timestampDen === right.timestampDen;
}

function findTieStopEvent(previous: TimedEvent, orderedEvents: TimedEvent[]) {
  if (previous.kind !== 'note') return null;
  const laterNotes = orderedEvents
    .filter((event) => event.kind === 'note' && compareTimedEventOnsetPosition(event, previous) > 0)
    .sort(compareTimedEventPosition);
  const next = laterNotes[0];
  if (!next) return null;
  return laterNotes
    .filter((event) => sameTimedEventOnset(event, next))
    .find((event) => notePitchesEqual(previous, event)) ?? null;
}

function buildTieStopEventPlacements(partNode: ScoreDocumentModel['score']['parts'][number]) {
  const stopPlacements = new Map<string, TimedEvent['tiePlacement']>();

  for (const staff of partNode.staves) {
    const voices = new Map<number, VoiceNode[]>();
    for (const measure of [...staff.measures].sort((a, b) => a.measureNumber - b.measureNumber)) {
      for (const voice of [...measure.voices].sort((a, b) => a.voiceId - b.voiceId)) {
        const existing = voices.get(voice.voiceId) ?? [];
        existing.push(voice);
        voices.set(voice.voiceId, existing);
      }
    }

    for (const voiceGroup of voices.values()) {
      const orderedEvents = voiceGroup
        .flatMap((voice) => voice.events)
        .sort((a, b) => (
          a.measureNumber - b.measureNumber
          || a.timestampNum - b.timestampNum
          || Number(a.isChord) - Number(b.isChord)
        ));

      for (const event of orderedEvents) {
        if (!event.tieStart) continue;
        const stopEvent = findTieStopEvent(event, orderedEvents);
        if (stopEvent) stopPlacements.set(stopEvent.id, event.tiePlacement);
      }
    }
  }

  return stopPlacements;
}

function buildEventElement(
  doc: XmlDocument,
  coreDocument: ScoreDocumentModel,
  event: TimedEvent,
  tieStopEventPlacements: Map<string, TimedEvent['tiePlacement']>,
  chord = false,
) {
  const note = doc.createElement('note');
  if (event.hidden) note.setAttribute('print-object', 'no');
  const grace = coreDocument.graceNotes.find((entry) => entry.eventId === event.id);
  if (grace) {
    const graceEl = doc.createElement('grace');
    if (grace.slash) graceEl.setAttribute('slash', 'yes');
    note.appendChild(graceEl);
  }
  appendPreservedXmlFragments(doc, note, event.preservedXml?.beforePitch);
  if (chord && event.kind === 'note') note.appendChild(doc.createElement('chord'));

  if (event.kind === 'note') {
    const pitch = doc.createElement('pitch');
    setOrCreateTextElement(doc, pitch, 'step', event.pitch.step);
    if (event.pitch.alter !== 0) setOrCreateTextElement(doc, pitch, 'alter', String(event.pitch.alter));
    setOrCreateTextElement(doc, pitch, 'octave', String(event.pitch.octave));
    note.appendChild(pitch);
  } else {
    note.appendChild(doc.createElement('rest'));
  }

  if (!grace) {
    setOrCreateTextElement(doc, note, 'duration', String(event.durationDivisions));
  }
  setOrCreateTextElement(doc, note, 'voice', String(event.voiceId));
  if (event.durationType) setOrCreateTextElement(doc, note, 'type', event.durationType);
  if (event.isDotted) note.appendChild(doc.createElement('dot'));
  if (event.kind === 'note' && event.writtenAccidental) {
    const accidental = setOrCreateTextElement(doc, note, 'accidental', writtenAccidentalToMusicXml(event.writtenAccidental));
    if (event.accidentalCautionary) accidental.setAttribute('cautionary', 'yes');
    if (event.accidentalEnclosure === 'round') accidental.setAttribute('parentheses', 'yes');
    if (event.accidentalEnclosure === 'square') accidental.setAttribute('bracket', 'yes');
  }
  if (event.notehead === 'slash') setOrCreateTextElement(doc, note, 'notehead', 'slash');
  if (event.stem) setOrCreateTextElement(doc, note, 'stem', event.stem);
  appendPreservedXmlFragments(doc, note, event.preservedXml?.afterType);
  const beams = coreDocument.beams
    .filter((beam) => beam.eventIds.includes(event.id))
    .sort((a, b) => a.number - b.number);
  beams.forEach((beam) => {
    const beamEl = doc.createElement('beam');
    beamEl.setAttribute('number', String(beam.number));
    const index = beam.eventIds.indexOf(event.id);
    if (beam.eventIds.length === 1 && beam.hook) {
      beamEl.textContent = beam.hook === 'forward' ? 'forward hook' : 'backward hook';
    } else if (index === 0) {
      beamEl.textContent = 'begin';
    } else if (index === beam.eventIds.length - 1) {
      beamEl.textContent = 'end';
    } else {
      beamEl.textContent = 'continue';
    }
    note.appendChild(beamEl);
  });

  const tuplet = coreDocument.tuplets.find((entry) => entry.eventIds.includes(event.id));
  if (tuplet && tuplet.actualNotes && tuplet.normalNotes) {
    const timeModification = doc.createElement('time-modification');
    setOrCreateTextElement(doc, timeModification, 'actual-notes', String(tuplet.actualNotes));
    setOrCreateTextElement(doc, timeModification, 'normal-notes', String(tuplet.normalNotes));
    note.appendChild(timeModification);
  }
  const hasTieStop = tieStopEventPlacements.has(event.id);
  if (hasTieStop) {
    const tie = doc.createElement('tie');
    tie.setAttribute('type', 'stop');
    note.appendChild(tie);
  }
  if (event.tieStart) {
    const tie = doc.createElement('tie');
    tie.setAttribute('type', 'start');
    note.appendChild(tie);
  }

  const eventSlurs = coreDocument.slurs.filter((slur) => slur.startEventId === event.id || slur.stopEventId === event.id);
  const guitarTechniques = event.kind === 'note' ? new Set(event.guitar?.techniques ?? []) : new Set<string>();
  // Only write a tuplet notation element for the first and last note of the span;
  // middle notes carry only <time-modification> and do not need a <notations> block.
  const hasTupletNotation = Boolean(tuplet)
    && (tuplet!.eventIds[0] === event.id || tuplet!.eventIds[tuplet!.eventIds.length - 1] === event.id);
  const hasGuitarTechnical = event.kind === 'note' && Boolean(event.guitar);
  const hasFermata = coreDocument.fermataEventIds.has(event.id);
  const eventTremolo = coreDocument.tremolos.find((t) => t.eventId === event.id);
  const eventGlissandos = coreDocument.glissandos.filter(
    (g) => g.startEventId === event.id || g.stopEventId === event.id,
  );
  const eventArpeggio = coreDocument.arpeggios.find((a) => a.eventId === event.id);
  if ((event.articulations?.length ?? 0) > 0 || hasTieStop || event.tieStart || eventSlurs.length > 0 || hasTupletNotation || hasGuitarTechnical || hasFermata || eventTremolo || eventGlissandos.length > 0 || eventArpeggio || (event.preservedXml?.notationChildren?.length ?? 0) > 0) {
    const notations = doc.createElement('notations');
    if ((event.articulations?.length ?? 0) > 0) {
      const articulations = doc.createElement('articulations');
      event.articulations?.forEach((articulation) => {
        const articulationEl = doc.createElement(articulation);
        const placement = event.articulationPlacements?.[articulation];
        if (placement) articulationEl.setAttribute('placement', placement);
        articulations.appendChild(articulationEl);
      });
      notations.appendChild(articulations);
    }
    if (hasTieStop) {
      const tied = doc.createElement('tied');
      tied.setAttribute('type', 'stop');
      const stopPlacement = tieStopEventPlacements.get(event.id);
      if (stopPlacement) tied.setAttribute('placement', stopPlacement);
      notations.appendChild(tied);
    }
    if (event.tieStart) {
      const tied = doc.createElement('tied');
      tied.setAttribute('type', 'start');
      if (event.tiePlacement) tied.setAttribute('placement', event.tiePlacement);
      notations.appendChild(tied);
    }
    eventSlurs.forEach((slur) => {
      const slurEl = doc.createElement('slur');
      slurEl.setAttribute('number', String(slur.number));
      slurEl.setAttribute('type', slur.startEventId === event.id ? 'start' : 'stop');
      if (slur.placement) slurEl.setAttribute('placement', slur.placement);
      notations.appendChild(slurEl);
    });
    if (tuplet && (tuplet.eventIds[0] === event.id || tuplet.eventIds[tuplet.eventIds.length - 1] === event.id)) {
      const tupletEl = doc.createElement('tuplet');
      tupletEl.setAttribute('number', String(tuplet.number));
      tupletEl.setAttribute('type', tuplet.eventIds[0] === event.id ? 'start' : 'stop');
      if (tuplet.bracket) tupletEl.setAttribute('bracket', 'yes');
      if (tuplet.showNumber) tupletEl.setAttribute('show-number', tuplet.showNumber);
      notations.appendChild(tupletEl);
    }
    if (event.kind === 'note' && guitarTechniques.has('slide')) {
      const slide = doc.createElement('slide');
      slide.setAttribute('type', 'start');
      notations.appendChild(slide);
    }
    if (event.kind === 'note' && guitarTechniques.has('vibrato')) {
      const ornaments = doc.createElement('ornaments');
      const wavy = doc.createElement('wavy-line');
      wavy.setAttribute('type', 'start');
      ornaments.appendChild(wavy);
      notations.appendChild(ornaments);
    }
    if (event.kind === 'note' && event.guitar) {
      const technical = doc.createElement('technical');
      setOrCreateTextElement(doc, technical, 'string', String(event.guitar.string));
      setOrCreateTextElement(doc, technical, 'fret', String(event.guitar.fret));
      if (guitarTechniques.has('hammer-on')) {
        const hammerOn = doc.createElement('hammer-on');
        hammerOn.setAttribute('type', 'start');
        hammerOn.textContent = 'H';
        technical.appendChild(hammerOn);
      }
      if (guitarTechniques.has('hammer-on-stop')) {
        const hammerOn = doc.createElement('hammer-on');
        hammerOn.setAttribute('type', 'stop');
        hammerOn.textContent = 'H';
        technical.appendChild(hammerOn);
      }
      if (guitarTechniques.has('pull-off')) {
        const pullOff = doc.createElement('pull-off');
        pullOff.setAttribute('type', 'start');
        pullOff.textContent = 'P';
        technical.appendChild(pullOff);
      }
      if (guitarTechniques.has('pull-off-stop')) {
        const pullOff = doc.createElement('pull-off');
        pullOff.setAttribute('type', 'stop');
        pullOff.textContent = 'P';
        technical.appendChild(pullOff);
      }
      if (guitarTechniques.has('bend')) {
        const bend = doc.createElement('bend');
        setOrCreateTextElement(doc, bend, 'bend-alter', '1');
        technical.appendChild(bend);
      }
      if (guitarTechniques.has('harmonic')) {
        const harmonic = doc.createElement('harmonic');
        harmonic.appendChild(doc.createElement('natural'));
        technical.appendChild(harmonic);
      }
      if (guitarTechniques.has('dead-note')) technical.appendChild(doc.createElement('mute'));
      if (guitarTechniques.has('pick-up')) technical.appendChild(doc.createElement('up-bow'));
      if (guitarTechniques.has('pick-down')) technical.appendChild(doc.createElement('down-bow'));
      if (guitarTechniques.has('palm-mute')) {
        const other = doc.createElement('other-technical');
        other.textContent = 'p.m.';
        technical.appendChild(other);
      }
      if (guitarTechniques.has('let-ring')) {
        const other = doc.createElement('other-technical');
        other.textContent = 'let ring';
        technical.appendChild(other);
      }
      notations.appendChild(technical);
    }
    if (hasFermata) {
      const fermata = doc.createElement('fermata');
      const placement = event.articulationPlacements?.fermata;
      if (placement) fermata.setAttribute('placement', placement);
      notations.appendChild(fermata);
    }
    if (eventTremolo) {
      const tremolo = doc.createElement('tremolo');
      tremolo.textContent = String(eventTremolo.lines);
      tremolo.setAttribute('type', eventTremolo.type);
      notations.appendChild(tremolo);
    }
    eventGlissandos.forEach((gliss) => {
      const glissando = doc.createElement('glissando');
      glissando.setAttribute('type', gliss.startEventId === event.id ? 'start' : 'stop');
      glissando.setAttribute('number', String(gliss.number));
      if (gliss.lineType) glissando.setAttribute('line-type', gliss.lineType);
      if (gliss.text) glissando.textContent = gliss.text;
      notations.appendChild(glissando);
    });
    if (eventArpeggio) {
      const arpeggiate = doc.createElement('arpeggiate');
      if (eventArpeggio.direction) arpeggiate.setAttribute('direction', eventArpeggio.direction);
      if (eventArpeggio.nonArpeggiate) arpeggiate.setAttribute('non-arpeggiate', 'yes');
      notations.appendChild(arpeggiate);
    }
    appendPreservedXmlFragments(doc, notations, event.preservedXml?.notationChildren);
    note.appendChild(notations);
  }
  getEventLyrics(coreDocument, event).forEach((lyricData) => {
    const lyric = doc.createElement('lyric');
    if (lyricData.verseNumber != null && lyricData.verseNumber !== 1) lyric.setAttribute('number', String(lyricData.verseNumber));
    if (lyricData.syllabic) setOrCreateTextElement(doc, lyric, 'syllabic', lyricData.syllabic);
    setOrCreateTextElement(doc, lyric, 'text', lyricData.text);
    note.appendChild(lyric);
  });
  setOrCreateTextElement(doc, note, 'staff', String(event.staffIndex));
  return note;
}

function buildDirectionElement(
  doc: XmlDocument,
  kind: string,
  value: string,
  staffIndex: number,
  placement?: string,
  spanNumber?: number,
  timing?: { timestampNum?: number; timestampDen?: number; divisions?: number },
) {
  if (kind === 'harmony') {
    const [rootPart, bassPart] = value.split('/');
    const root = parseHarmonyRoot(rootPart);
    if (!root) {
      const harmony = doc.createElement('harmony');
      const rootEl = doc.createElement('root');
      const rootStep = doc.createElement('root-step');
      rootStep.textContent = value.charAt(0).toUpperCase();
      rootEl.appendChild(rootStep);
      harmony.appendChild(rootEl);
      return harmony;
    }
    if (shouldRenderHarmonyAsLiteralWords(root.suffix)) {
      const direction = doc.createElement('direction');
      direction.setAttribute('placement', placement ?? 'above');
      const directionType = doc.createElement('direction-type');
      const words = doc.createElement('words');
      words.textContent = value.trim();
      directionType.appendChild(words);
      direction.appendChild(directionType);
      if (typeof timing?.timestampNum === 'number' && typeof timing?.timestampDen === 'number' && typeof timing?.divisions === 'number') {
        const offset = Math.round((timing.timestampNum / Math.max(timing.timestampDen, 1)) * timing.divisions * 4);
        setOrCreateTextElement(doc, direction, 'offset', String(offset));
      }
      setOrCreateTextElement(doc, direction, 'staff', String(staffIndex));
      return direction;
    }
    const harmony = doc.createElement('harmony');
    const rootEl = doc.createElement('root');
    const rootStep = doc.createElement('root-step');
    rootStep.textContent = root.step;
    rootEl.appendChild(rootStep);
    if (root.alter !== 0) {
      const rootAlter = doc.createElement('root-alter');
      rootAlter.textContent = String(root.alter);
      rootEl.appendChild(rootAlter);
    }
    harmony.appendChild(rootEl);
    const { kindText, degrees } = splitHarmonySuffixDegrees(root.suffix);
    const kindEl = doc.createElement('kind');
    if (kindText) kindEl.setAttribute('text', kindText);
    kindEl.textContent = resolveHarmonyKindFromSuffix(kindText);
    harmony.appendChild(kindEl);
    degrees.forEach((entry) => {
      const degree = doc.createElement('degree');
      setOrCreateTextElement(doc, degree, 'degree-value', entry.value);
      setOrCreateTextElement(doc, degree, 'degree-alter', String(entry.alter));
      setOrCreateTextElement(doc, degree, 'degree-type', 'alter');
      harmony.appendChild(degree);
    });
    if (bassPart?.trim()) {
      const bassRoot = parseHarmonyRoot(bassPart);
      if (bassRoot && !bassRoot.suffix.trim()) {
        const bass = doc.createElement('bass');
        const bassStep = doc.createElement('bass-step');
        bassStep.textContent = bassRoot.step;
        bass.appendChild(bassStep);
        if (bassRoot.alter !== 0) {
          const bassAlter = doc.createElement('bass-alter');
          bassAlter.textContent = String(bassRoot.alter);
          bass.appendChild(bassAlter);
        }
        harmony.appendChild(bass);
      }
    }
    return harmony;
  }

  const direction = doc.createElement('direction');
  if (placement) direction.setAttribute('placement', placement);
  const directionType = doc.createElement('direction-type');

  if (kind === 'wedge') {
    const wedge = doc.createElement('wedge');
    wedge.setAttribute('type', value || 'crescendo');
    if (spanNumber != null) wedge.setAttribute('number', String(spanNumber));
    directionType.appendChild(wedge);
    direction.appendChild(directionType);
    setOrCreateTextElement(doc, direction, 'staff', String(staffIndex));
    return direction;
  }

  if (kind === 'octave-shift') {
    const [shiftType, shiftSize] = (value || 'down:8').split(':');
    const octaveShift = doc.createElement('octave-shift');
    octaveShift.setAttribute('type', shiftType || 'down');
    if (shiftSize) octaveShift.setAttribute('size', shiftSize);
    if (spanNumber != null) octaveShift.setAttribute('number', String(spanNumber));
    directionType.appendChild(octaveShift);
    direction.appendChild(directionType);
    setOrCreateTextElement(doc, direction, 'staff', String(staffIndex));
    return direction;
  }

  if (kind === 'pedal') {
    const pedal = doc.createElement('pedal');
    pedal.setAttribute('type', value || 'start');
    if (spanNumber != null) pedal.setAttribute('number', String(spanNumber));
    directionType.appendChild(pedal);
    direction.appendChild(directionType);
    setOrCreateTextElement(doc, direction, 'staff', String(staffIndex));
    return direction;
  }

  if (kind === 'segno') {
    directionType.appendChild(doc.createElement('segno'));
  } else if (kind === 'coda') {
    directionType.appendChild(doc.createElement('coda'));
  } else if (kind === 'dynamics') {
    const dynamics = doc.createElement('dynamics');
    dynamics.appendChild(doc.createElement(value));
    directionType.appendChild(dynamics);
  } else if (kind === 'metronome') {
    const metronome = doc.createElement('metronome');
    metronome.setAttribute('parentheses', 'no');
    setOrCreateTextElement(doc, metronome, 'beat-unit', 'quarter');
    setOrCreateTextElement(doc, metronome, 'per-minute', value);
    directionType.appendChild(metronome);
  } else {
    const safeKind = /^[A-Za-z_][\w.-]*$/.test(kind) ? kind : 'words';
    const words = doc.createElement(safeKind);
    words.textContent = value;
    directionType.appendChild(words);
  }
  direction.appendChild(directionType);
  if (kind === 'metronome') {
    const sound = doc.createElement('sound');
    sound.setAttribute('tempo', value);
    direction.appendChild(sound);
  }
  if (typeof timing?.timestampNum === 'number' && typeof timing?.timestampDen === 'number' && typeof timing?.divisions === 'number') {
    const offset = Math.round((timing.timestampNum / Math.max(timing.timestampDen, 1)) * timing.divisions * 4);
    setOrCreateTextElement(doc, direction, 'offset', String(offset));
  }
  setOrCreateTextElement(doc, direction, 'staff', String(staffIndex));
  return direction;
}

function gcd(left: number, right: number): number {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b > 0) {
    const next = a % b;
    a = b;
    b = next;
  }
  return a || 1;
}

function swingRatioToMusicXmlPair(ratio: number) {
  if (Math.abs(ratio - (2 / 3)) < 0.01) return { first: 2, second: 1 };
  if (Math.abs(ratio - (3 / 4)) < 0.01) return { first: 3, second: 1 };
  if (Math.abs(ratio - (1 / 4)) < 0.01) return { first: 1, second: 3 };

  const clamped = Math.max(0.01, Math.min(0.99, ratio));
  const first = Math.max(1, Math.round(clamped * 1000));
  const second = Math.max(1, Math.round((1 - clamped) * 1000));
  const divisor = gcd(first, second);
  return {
    first: Math.max(1, Math.round(first / divisor)),
    second: Math.max(1, Math.round(second / divisor)),
  };
}

function buildSwingDirectionElement(doc: XmlDocument, coreDocument: ScoreDocumentModel, staffIndex: number) {
  if (coreDocument.swingRatio == null) return null;
  const pair = swingRatioToMusicXmlPair(coreDocument.swingRatio);
  const direction = doc.createElement('direction');
  direction.setAttribute('directive', 'yes');
  direction.setAttribute('placement', 'above');
  const directionType = doc.createElement('direction-type');
  const words = doc.createElement('words');
  words.textContent = coreDocument.swingUnit === '16th' ? 'Swing 16ths' : 'Swing';
  directionType.appendChild(words);
  direction.appendChild(directionType);
  const sound = doc.createElement('sound');
  const swing = doc.createElement('swing');
  setOrCreateTextElement(doc, swing, 'first', String(pair.first));
  setOrCreateTextElement(doc, swing, 'second', String(pair.second));
  setOrCreateTextElement(doc, swing, 'swing-type', coreDocument.swingUnit ?? 'eighth');
  sound.appendChild(swing);
  direction.appendChild(sound);
  setOrCreateTextElement(doc, direction, 'staff', String(staffIndex));
  return direction;
}

function groupEventsByTimestamp(voice: VoiceNode) {
  const groups = new Map<number, TimedEvent[]>();
  const ordered = [...voice.events].sort((a, b) => a.timestampNum - b.timestampNum || Number(a.isChord) - Number(b.isChord));
  for (const event of ordered) {
    const key = event.timestampNum;
    const existing = groups.get(key) ?? [];
    existing.push(event);
    groups.set(key, existing);
  }
  return Array.from(groups.entries()).sort((a, b) => a[0] - b[0]);
}

function isGraceEvent(coreDocument: ScoreDocumentModel, eventId: string) {
  return coreDocument.graceNotes.some((entry) => entry.eventId === eventId);
}

function getRenderableEventsAtTimestamp(eventsAtTimestamp: TimedEvent[]) {
  const notes = eventsAtTimestamp.filter((event): event is Extract<TimedEvent, { kind: 'note' }> => event.kind === 'note');
  if (notes.length > 0) return notes;
  const primaryEvent = eventsAtTimestamp.find((event) => !event.isChord) ?? eventsAtTimestamp[0];
  return primaryEvent ? [primaryEvent] : [];
}

function shouldWriteChordMarker(eventsAtTimestamp: TimedEvent[], eventIndex: number, coreDocument: ScoreDocumentModel) {
  const event = eventsAtTimestamp[eventIndex];
  if (!event || event.kind !== 'note') return false;
  if (eventIndex === 0) return false;
  if (isGraceEvent(coreDocument, event.id)) return false;

  // Grace notes often share the same semantic timestamp as their anchor note,
  // but they must stay sequential in MusicXML rather than becoming a chord.
  return eventsAtTimestamp.slice(0, eventIndex).some((entry) => (
    entry.kind === 'note' && !isGraceEvent(coreDocument, entry.id)
  ));
}

function maxMeasureDuration(coreDocument: ScoreDocumentModel, partIndex: number, measureNumber: number) {
  const part = coreDocument.score.parts[partIndex];
  let maxDuration = 0;
  for (const staff of part.staves) {
    const measure = staff.measures.find((entry) => entry.measureNumber === measureNumber);
    if (!measure) continue;
    for (const voice of measure.voices) {
      for (const event of voice.events) {
        maxDuration = Math.max(maxDuration, event.timestampNum + event.durationDivisions);
      }
    }
  }
  return maxDuration;
}

function getMeasureLayoutHints(
  coreDocument: ScoreDocumentModel,
  partId: string,
  measureNumber: number,
  staffIndex?: number,
) {
  return coreDocument.layoutHints.filter((hint) => (
    hint.measureNumber === measureNumber
    && (!hint.partId || hint.partId === partId)
    && (hint.staffIndex == null || staffIndex == null || hint.staffIndex === staffIndex)
  ));
}

function updateMeasureContent(doc: XmlDocument, coreDocument: ScoreDocumentModel) {
  const xmlParts = Array.from(doc.getElementsByTagName('part'));
  coreDocument.score.parts.forEach((partNode, partIndex) => {
    const xmlPart = xmlParts.find((part) => part.getAttribute('id') === partNode.sourcePartId) as XmlEl | undefined;
    if (!xmlPart) return;
    const tieStopEventPlacements = buildTieStopEventPlacements(partNode);

    const canonicalMeasures = findCanonicalMeasures(partNode);
    canonicalMeasures.forEach((measureRef) => {
      const xmlMeasure = getMeasureForCoreMeasure(xmlPart, measureRef) as XmlEl | null;
      if (!xmlMeasure) return;

      const nonContentChildren: XmlEl[] = [];
      for (let i = 0; i < xmlMeasure.childNodes.length; i++) {
        const child = xmlMeasure.childNodes[i] as XmlEl;
        if (child.nodeType === 1 && !['note', 'backup', 'forward'].includes(child.tagName)) {
          nonContentChildren.push(child);
        }
      }
      while (xmlMeasure.firstChild) {
        xmlMeasure.removeChild(xmlMeasure.firstChild);
      }
      nonContentChildren.forEach((child) => xmlMeasure.appendChild(child));

      const layoutHints = getMeasureLayoutHints(coreDocument, partNode.sourcePartId, measureRef.measureNumber);
      const newSystem = measureRef.print?.newSystem || layoutHints.some((hint) => hint.kind === 'newSystem' && hint.value === true);
      const newPage = measureRef.print?.newPage || layoutHints.some((hint) => hint.kind === 'newPage' && hint.value === true);
      const staffSpacing = layoutHints.find((hint) => hint.kind === 'staffSpacing' && typeof hint.value === 'number');

      if (newSystem || newPage || staffSpacing) {
        const print = doc.createElement('print');
        if (newSystem) print.setAttribute('new-system', 'yes');
        if (newPage) print.setAttribute('new-page', 'yes');
        if (staffSpacing) {
          const staffLayout = doc.createElement('staff-layout');
          setOrCreateTextElement(doc, staffLayout, 'staff-distance', String(staffSpacing.value));
          print.appendChild(staffLayout);
        }
        xmlMeasure.appendChild(print);
      }

      if (measureRef.leftBarline === 'repeat-start' || measureRef.leftEnding) {
        const barline = doc.createElement('barline');
        barline.setAttribute('location', 'left');
        if (measureRef.leftBarline === 'repeat-start') {
          const repeat = doc.createElement('repeat');
          repeat.setAttribute('direction', 'forward');
          barline.appendChild(repeat);
        }
        if (measureRef.leftEnding) {
          const ending = doc.createElement('ending');
          ending.setAttribute('number', measureRef.leftEnding.number);
          ending.setAttribute('type', measureRef.leftEnding.type);
          barline.appendChild(ending);
        }
        xmlMeasure.appendChild(barline);
      }

      const timingStaff = partNode.staves.find((staff) => staff.measures.some((measure) => measure.id === measureRef.id)) ?? partNode.staves[0];
      const measureTiming = timingStaff
        ? getEffectiveMeasureTimingFromStaff(timingStaff, {
          measureId: measureRef.id,
          measureNumber: measureRef.measureNumber,
        })
        : null;
      const measureDivisions = measureTiming?.divisions ?? 1;
      const firstDocumentMeasure = partIndex === 0 && canonicalMeasures[0]?.measureNumber === measureRef.measureNumber;

      if (firstDocumentMeasure) {
        const swingDirection = buildSwingDirectionElement(doc, coreDocument, 1);
        if (swingDirection) xmlMeasure.appendChild(swingDirection);
      }

      measureRef.directions
        .filter((direction) => direction.timestampNum == null || direction.timestampNum === 0)
        .forEach((direction) => {
          xmlMeasure.appendChild(buildDirectionElement(
            doc,
            direction.kind,
            direction.value ?? '',
            direction.staffIndex ?? 1,
            direction.placement,
            direction.number,
            {
              timestampNum: direction.timestampNum,
              timestampDen: direction.timestampDen,
              divisions: measureDivisions,
            },
          ));
        });

      const measureDuration = maxMeasureDuration(coreDocument, partIndex, measureRef.measureNumber);
      let firstSequence = true;

      partNode.staves.forEach((staff) => {
        const measure = staff.measures.find((entry) => entry.measureNumber === measureRef.measureNumber);
        if (!measure) return;
        const voices = [...measure.voices].sort((a, b) => a.voiceId - b.voiceId);
        voices.forEach((voice) => {
          if (!firstSequence && measureDuration > 0) {
            xmlMeasure.appendChild(buildBackup(doc, measureDuration));
          }

          let cursor = 0;
          const eventGroups = new Map(groupEventsByTimestamp(voice));
          const directionTimestamps = measure.directions
            .filter((direction) => typeof direction.timestampNum === 'number' && direction.timestampNum !== 0 && (!direction.staffIndex || direction.staffIndex === staff.staffIndex))
            .map((direction) => direction.timestampNum!);
          const timestamps = [...new Set([...eventGroups.keys(), ...directionTimestamps])].sort((a, b) => a - b);
          for (const timestamp of timestamps) {
            const events = eventGroups.get(timestamp) ?? [];
            if (timestamp > cursor) {
              xmlMeasure.appendChild(buildForward(doc, timestamp - cursor));
              cursor = timestamp;
            }

            measure.directions
              .filter((direction) => direction.timestampNum === timestamp && timestamp !== 0 && (!direction.staffIndex || direction.staffIndex === staff.staffIndex))
              .forEach((direction) => {
                xmlMeasure.appendChild(buildDirectionElement(
                  doc,
                  direction.kind,
                  direction.value ?? '',
                  direction.staffIndex ?? staff.staffIndex,
                  direction.placement,
                  direction.number,
                  {
                    timestampNum: direction.timestampNum,
                    timestampDen: direction.timestampDen,
                    divisions: measureDivisions,
                  },
                ));
            });

            const renderableEvents = getRenderableEventsAtTimestamp(events);
            renderableEvents.forEach((event, index) => {
              xmlMeasure.appendChild(buildEventElement(
                doc,
                coreDocument,
                event,
                tieStopEventPlacements,
                shouldWriteChordMarker(renderableEvents, index, coreDocument),
              ));
            });
            const rhythmicEvent = renderableEvents.find((event) => (
              !event.isChord && !isGraceEvent(coreDocument, event.id)
            ));
            cursor += rhythmicEvent?.durationDivisions ?? 0;
          }

          firstSequence = false;
        });
      });

      const rightBarline = measureRef.rightBarline;
      if ((rightBarline && rightBarline !== 'regular') || measureRef.rightEnding) {
        const barline = doc.createElement('barline');
        barline.setAttribute('location', 'right');
        if (rightBarline && rightBarline !== 'regular') {
          const barStyle = doc.createElement('bar-style');
          if (rightBarline === 'double') barStyle.textContent = 'light-light';
          else if (rightBarline === 'final' || rightBarline === 'repeat-end') barStyle.textContent = 'light-heavy';
          else if (rightBarline === 'repeat-start') barStyle.textContent = 'heavy-light';
          barline.appendChild(barStyle);
        }
        if (measureRef.rightEnding) {
          const ending = doc.createElement('ending');
          ending.setAttribute('number', measureRef.rightEnding.number);
          ending.setAttribute('type', measureRef.rightEnding.type);
          barline.appendChild(ending);
        }
        if (rightBarline === 'repeat-end') {
          const repeat = doc.createElement('repeat');
          repeat.setAttribute('direction', 'backward');
          barline.appendChild(repeat);
        }
        if (rightBarline === 'repeat-start') {
          const repeat = doc.createElement('repeat');
          repeat.setAttribute('direction', 'forward');
          barline.appendChild(repeat);
        }
        xmlMeasure.appendChild(barline);
      }
    });
  });
}

export function exportCoreToMusicXml(sourceXml: string, coreDocument: ScoreDocumentModel) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(sourceXml, 'application/xml');
  syncPartMeasures(doc, coreDocument);
  updateMetadata(doc, coreDocument);
  updatePartList(doc, coreDocument);
  updateTranspose(doc, coreDocument);
  updateAttributes(doc, coreDocument);
  updateMeasureContent(doc, coreDocument);
  return serialize(doc);
}
