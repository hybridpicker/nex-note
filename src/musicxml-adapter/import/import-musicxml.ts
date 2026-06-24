import { DOMParser, XMLSerializer, type Document as XmlDocument } from '@xmldom/xmldom';
import { describeDuration, isRepresentableDuration } from '@/src/score-core/duration-utils';
import type {
  ArpeggioMark,
  BeamGroup,
  ChordGroup,
  DirectionNode,
  GlissandoLine,
  GraceNoteLink,
  GuitarTechniqueKind,
  LayoutHint,
  LyricLine,
  MeasureAttributes,
  MeasureNode,
  PartNode,
  ScoreDocumentModel,
  SlurSpan,
  StaffNode,
  TimedEvent,
  TremoloSpan,
  TupletSpan,
  VoiceNode,
} from '@/src/score-core/model/types';

type XmlElement = ReturnType<XmlDocument['createElement']>;

interface SemanticCollectors {
  slurs: SlurSpan[];
  beams: BeamGroup[];
  tuplets: TupletSpan[];
  chordGroups: ChordGroup[];
  graceNotes: GraceNoteLink[];
  lyricLines: LyricLine[];
  layoutHints: LayoutHint[];
  tremolos: TremoloSpan[];
  glissandos: GlissandoLine[];
  arpeggios: ArpeggioMark[];
  fermataEventIds: Set<string>;
}

function makeId(...parts: Array<string | number>) {
  return parts.join(':');
}

function parseIntSafe(value: string | null | undefined, fallback = 0) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizePlacement(value: string | null | undefined): 'above' | 'below' | undefined {
  if (value === 'above' || value === 'over') return 'above';
  if (value === 'below' || value === 'under') return 'below';
  return undefined;
}

function normalizeFermataPlacement(element: XmlElement | undefined): 'above' | 'below' | undefined {
  if (!element) return undefined;
  const explicit = normalizePlacement(element.getAttribute('placement') ?? element.getAttribute('orientation'));
  if (explicit) return explicit;
  const type = element.getAttribute('type');
  if (type === 'upright') return 'above';
  if (type === 'inverted') return 'below';
  return undefined;
}

function readArticulationElements(note: XmlElement) {
  const articulations: string[] = [];
  const placements: Record<string, 'above' | 'below'> = {};

  for (const container of Array.from(note.getElementsByTagName('articulations'))) {
    for (const child of Array.from(container.childNodes)) {
      if (child.nodeType !== 1) continue;
      const element = child as XmlElement;
      articulations.push(element.tagName);
      const placement = normalizePlacement(
        element.getAttribute('placement')
          ?? element.getAttribute('orientation')
          ?? element.getAttribute('direction'),
      );
      if (placement) placements[element.tagName] = placement;
    }
  }

  return {
    articulations,
    placements: Object.keys(placements).length > 0 ? placements : undefined,
  };
}

function serializeElement(element: XmlElement) {
  return new XMLSerializer().serializeToString(element);
}

const METADATA_PLACEHOLDER_TEXT = new Set(['title', 'subtitle', 'work number', 'composer', 'arranger']);

function readConcreteMetadataText(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return METADATA_PLACEHOLDER_TEXT.has(trimmed.toLowerCase()) ? undefined : trimmed;
}

const HARMONY_KIND_TEXT: Record<string, string> = {
  major: '',
  minor: 'min',
  augmented: 'aug',
  diminished: 'dim',
  dominant: '7',
  'major-seventh': 'maj7',
  'minor-seventh': 'min7',
  'diminished-seventh': 'dim7',
  'augmented-seventh': 'aug7',
  'half-diminished': 'm7b5',
  'major-minor': 'm(maj7)',
  'major-sixth': '6',
  'minor-sixth': 'min6',
  'dominant-ninth': '9',
  'major-ninth': 'maj9',
  'minor-ninth': 'min9',
  'dominant-11th': '11',
  'major-11th': 'maj11',
  'minor-11th': 'min11',
  'dominant-13th': '13',
  'major-13th': 'maj13',
  'minor-13th': 'min13',
  'suspended-second': 'sus2',
  'suspended-fourth': 'sus4',
  power: '5',
  none: '',
};

function readHarmonyKindText(harmony: XmlElement) {
  const kind = harmony.getElementsByTagName('kind')[0];
  if (!kind) return '';

  const explicitText = kind.getAttribute('text');
  if (explicitText != null && explicitText.trim()) return explicitText.trim();

  const musicXmlKind = (kind.textContent ?? '').trim();
  return HARMONY_KIND_TEXT[musicXmlKind] ?? (musicXmlKind === 'other' ? '' : musicXmlKind);
}

const GUITAR_TECHNICAL_TAGS = new Set([
  'string',
  'fret',
  'hammer-on',
  'pull-off',
  'bend',
  'harmonic',
  'mute',
  'up-bow',
  'down-bow',
  'other-technical',
]);

function modeledOtherTechnicalText(element: XmlElement) {
  const text = (element.textContent ?? '').trim().toLowerCase();
  return text.includes('p.m')
    || text.includes('palm')
    || text.includes('let ring')
    || text.includes('vib');
}

function collectPreservedNoteXml(note: XmlElement, options?: { omitSlashNotehead?: boolean; omitStem?: string; omitGuitarTechnical?: boolean; omitGuitarSlide?: boolean; omitGuitarVibrato?: boolean }) {
  const beforePitch: string[] = [];
  const afterType: string[] = [];
  const notationChildren: string[] = [];

  for (let i = 0; i < note.childNodes.length; i += 1) {
    const child = note.childNodes[i];
    if (child.nodeType !== 1) continue;
    const element = child as XmlElement;
    if (element.tagName === 'cue') {
      beforePitch.push(serializeElement(element));
      continue;
    }
    if (element.tagName === 'notehead' && options?.omitSlashNotehead && (element.textContent ?? '').trim() === 'slash') {
      continue;
    }
    if (element.tagName === 'stem' && options?.omitStem && (element.textContent ?? '').trim() === options.omitStem) {
      continue;
    }
    if (element.tagName === 'notehead' || element.tagName === 'stem') {
      afterType.push(serializeElement(element));
      continue;
    }
    if (element.tagName !== 'notations') continue;

    for (let notationIndex = 0; notationIndex < element.childNodes.length; notationIndex += 1) {
      const notationChild = element.childNodes[notationIndex];
      if (notationChild.nodeType !== 1) continue;
      const notationElement = notationChild as XmlElement;
      if (['articulations', 'tied', 'slur', 'tuplet', 'fermata', 'tremolo', 'glissando', 'arpeggiate'].includes(notationElement.tagName)) continue;
      if (notationElement.tagName === 'slide' && options?.omitGuitarSlide) continue;
      if (notationElement.tagName === 'ornaments' && options?.omitGuitarVibrato) {
        const ownerDocument = note.ownerDocument ?? notationElement.ownerDocument;
        if (!ownerDocument) continue;
        const ornaments = ownerDocument.createElement('ornaments') as XmlElement;
        for (let childIndex = 0; childIndex < notationElement.childNodes.length; childIndex += 1) {
          const ornamentChild = notationElement.childNodes[childIndex];
          if (ornamentChild.nodeType !== 1) continue;
          const childElement = ornamentChild as XmlElement;
          if (childElement.tagName === 'wavy-line') continue;
          ornaments.appendChild(childElement.cloneNode(true));
        }
        if (ornaments.childNodes.length > 0) notationChildren.push(serializeElement(ornaments));
        continue;
      }
      if (notationElement.tagName === 'technical' && options?.omitGuitarTechnical) {
        const ownerDocument = note.ownerDocument ?? notationElement.ownerDocument;
        if (!ownerDocument) continue;
        const technical = ownerDocument.createElement('technical') as XmlElement;
        for (let childIndex = 0; childIndex < notationElement.childNodes.length; childIndex += 1) {
          const technicalChild = notationElement.childNodes[childIndex];
          if (technicalChild.nodeType !== 1) continue;
          const childElement = technicalChild as XmlElement;
          if (childElement.tagName === 'other-technical') {
            if (modeledOtherTechnicalText(childElement)) continue;
            technical.appendChild(childElement.cloneNode(true));
            continue;
          }
          if (GUITAR_TECHNICAL_TAGS.has(childElement.tagName)) continue;
          technical.appendChild(childElement.cloneNode(true));
        }
        if (technical.childNodes.length > 0) notationChildren.push(serializeElement(technical));
        continue;
      }
      notationChildren.push(serializeElement(notationElement));
    }
  }

  if (beforePitch.length === 0 && afterType.length === 0 && notationChildren.length === 0) return undefined;
  return { beforePitch, afterType, notationChildren };
}

function readGuitarTechnical(note: XmlElement): { string: 1 | 2 | 3 | 4 | 5 | 6; fret: number; tuning?: string; techniques?: GuitarTechniqueKind[] } | undefined {
  const technical = note.getElementsByTagName('technical')[0];
  const stringValue = technical ? parseIntSafe(technical.getElementsByTagName('string')[0]?.textContent, 0) : 0;
  const fretValue = technical ? parseIntSafe(technical.getElementsByTagName('fret')[0]?.textContent, -1) : -1;
  const techniques = new Set<GuitarTechniqueKind>();
  if (technical) {
    for (const hammerOn of Array.from(technical.getElementsByTagName('hammer-on'))) {
      techniques.add(hammerOn.getAttribute('type') === 'stop' ? 'hammer-on-stop' : 'hammer-on');
    }
    for (const pullOff of Array.from(technical.getElementsByTagName('pull-off'))) {
      techniques.add(pullOff.getAttribute('type') === 'stop' ? 'pull-off-stop' : 'pull-off');
    }
    if (technical.getElementsByTagName('bend').length > 0) techniques.add('bend');
    if (technical.getElementsByTagName('harmonic').length > 0) techniques.add('harmonic');
    if (technical.getElementsByTagName('mute').length > 0) techniques.add('dead-note');
    if (technical.getElementsByTagName('up-bow').length > 0) techniques.add('pick-up');
    if (technical.getElementsByTagName('down-bow').length > 0) techniques.add('pick-down');
    for (const other of Array.from(technical.getElementsByTagName('other-technical'))) {
      const text = (other.textContent ?? '').trim().toLowerCase();
      if (text.includes('p.m') || text.includes('palm')) techniques.add('palm-mute');
      if (text.includes('let ring')) techniques.add('let-ring');
      if (text.includes('vib')) techniques.add('vibrato');
      if (text.includes('gp:bend-')) techniques.add('bend');
      if (text.includes('gp:slide-')) techniques.add('slide');
      if (text.includes('gp:harmonic-')) techniques.add('harmonic');
      if (text.includes('gp:dead-note')) techniques.add('dead-note');
    }
  }
  if (note.getElementsByTagName('slide').length > 0) techniques.add('slide');
  if (note.getElementsByTagName('wavy-line').length > 0) techniques.add('vibrato');
  if ((stringValue < 1 || stringValue > 6 || fretValue < 0) && techniques.size === 0) return undefined;
  return {
    string: (stringValue >= 1 && stringValue <= 6 ? stringValue : 1) as 1 | 2 | 3 | 4 | 5 | 6,
    fret: Math.max(0, Math.min(24, fretValue)),
    techniques: [...techniques],
  };
}

function fractionFromOffset(offset: number, divisions: number) {
  const denominator = Math.max(divisions * 4, 1);
  return { timestampNum: offset, timestampDen: denominator };
}

function expectedMeasureDuration(beats: number, beatType: number, divisions: number) {
  return Math.round((beats * 4 * divisions) / beatType);
}

function directChildrenByTag(parent: XmlElement, tagName: string): XmlElement[] {
  const result: XmlElement[] = [];
  for (let i = 0; i < parent.childNodes.length; i++) {
    const child = parent.childNodes[i];
    if (child.nodeType === 1 && (child as XmlElement).tagName === tagName) {
      result.push(child as XmlElement);
    }
  }
  return result;
}

function firstElementChild(parent?: XmlElement | null): XmlElement | null {
  if (!parent) return null;
  for (let i = 0; i < parent.childNodes.length; i++) {
    const child = parent.childNodes[i];
    if (child.nodeType === 1) return child as XmlElement;
  }
  return null;
}

function readMetadata(doc: XmlDocument) {
  const title = readConcreteMetadataText(doc.getElementsByTagName('movement-title')[0]?.textContent)
    ?? readConcreteMetadataText(doc.getElementsByTagName('work-title')[0]?.textContent)
    ?? readConcreteMetadataText(doc.getElementsByTagName('credit-words')[0]?.textContent);
  const subtitle = readConcreteMetadataText(doc.getElementsByTagName('work-number')[0]?.textContent)
    ?? readConcreteMetadataText(doc.getElementsByTagName('credit-words')[1]?.textContent);

  let arranger: string | undefined;
  let composer: string | undefined;
  const creators = Array.from(doc.getElementsByTagName('creator'));
  for (const creator of creators) {
    const type = creator.getAttribute('type');
    if (type === 'arranger' && !arranger) arranger = readConcreteMetadataText(creator.textContent);
    if (type === 'composer' && !composer) composer = readConcreteMetadataText(creator.textContent);
  }

  return { title, subtitle, arranger, composer };
}

function buildMeasureAttributes(measure: XmlElement, measureNumber: number): MeasureAttributes[] {
  return directChildrenByTag(measure, 'attributes').map((attributesEl, index) => {
    const keyFifths = parseIntSafe(attributesEl.getElementsByTagName('fifths')[0]?.textContent, 0);
    const beats = parseIntSafe(attributesEl.getElementsByTagName('beats')[0]?.textContent, 0);
    const beatType = parseIntSafe(attributesEl.getElementsByTagName('beat-type')[0]?.textContent, 0);
    const hasTime = attributesEl.getElementsByTagName('time').length > 0;
    const hasKey = attributesEl.getElementsByTagName('key').length > 0;
    const clefs = Array.from(attributesEl.getElementsByTagName('clef')).map((clef, clefIndex) => ({
      staffIndex: parseIntSafe(clef.getAttribute('number'), clefIndex + 1),
      sign: clef.getElementsByTagName('sign')[0]?.textContent ?? undefined,
      line: parseIntSafe(clef.getElementsByTagName('line')[0]?.textContent, 0) || undefined,
    }));

    return {
      id: makeId('attr', measureNumber, index),
      divisions: parseIntSafe(attributesEl.getElementsByTagName('divisions')[0]?.textContent, 0) || undefined,
      keyFifths: hasKey ? keyFifths : undefined,
      time: hasTime ? { beats, beatType } : undefined,
      clefs,
    };
  });
}

function clampSwingRatio(value: number) {
  if (!Number.isFinite(value)) return undefined;
  return Math.max(0.01, Math.min(0.99, value));
}

function readSwingFromSound(sound: XmlElement): Pick<ScoreDocumentModel, 'swingRatio' | 'swingUnit'> | null {
  const swing = sound.getElementsByTagName('swing')[0] as XmlElement | undefined;
  if (!swing) return null;
  if (swing.getElementsByTagName('straight').length > 0) return { swingRatio: undefined, swingUnit: undefined };

  const first = parseIntSafe(swing.getElementsByTagName('first')[0]?.textContent, 0);
  const second = parseIntSafe(swing.getElementsByTagName('second')[0]?.textContent, 0);
  if (first <= 0 || second <= 0) return null;

  const rawSwingType = (swing.getElementsByTagName('swing-type')[0]?.textContent ?? 'eighth').trim();
  const swingUnit = rawSwingType === '16th' ? '16th' : 'eighth';
  return {
    swingRatio: clampSwingRatio(first / (first + second)),
    swingUnit,
  };
}

function readSwingPlayback(doc: XmlDocument): Pick<ScoreDocumentModel, 'swingRatio' | 'swingUnit'> {
  for (const sound of Array.from(doc.getElementsByTagName('sound'))) {
    const swing = readSwingFromSound(sound as XmlElement);
    if (swing) return swing;
  }
  return {};
}

function buildDirections(measure: XmlElement, measureNumber: number, divisions: number): DirectionNode[] {
  const directions = directChildrenByTag(measure, 'direction').map((direction, index): DirectionNode | null => {
    const directionType = direction.getElementsByTagName('direction-type')[0];
    const firstChild = firstElementChild(directionType);
    const kind = firstChild?.tagName ?? 'direction';
    const hasSwingPlayback = direction.getElementsByTagName('swing').length > 0;
    if (hasSwingPlayback && kind === 'words' && /\bswing\b/i.test(firstChild?.textContent ?? '')) {
      return null;
    }
    let value: string | undefined;
    let spanNumber: number | undefined;
    if (kind === 'dynamics') {
      const dynChild = firstElementChild(firstChild);
      value = dynChild?.tagName ?? undefined;
    } else if (kind === 'metronome') {
      value = direction.getElementsByTagName('per-minute')[0]?.textContent
        ?? direction.getElementsByTagName('sound')[0]?.getAttribute('tempo')
        ?? undefined;
    } else if (kind === 'wedge') {
      // value carries the MusicXML wedge type: crescendo, diminuendo, or stop.
      value = firstChild?.getAttribute('type') ?? undefined;
      spanNumber = parseIntSafe(firstChild?.getAttribute('number'), 0) || undefined;
    } else if (kind === 'octave-shift') {
      // Encode as "type:size" so both attributes survive the round-trip.
      const shiftType = firstChild?.getAttribute('type') ?? 'down';
      const shiftSize = firstChild?.getAttribute('size') ?? '8';
      value = `${shiftType}:${shiftSize}`;
      spanNumber = parseIntSafe(firstChild?.getAttribute('number'), 0) || undefined;
    } else {
      value = firstChild?.textContent ?? undefined;
    }
    const staffIndex = parseIntSafe(direction.getElementsByTagName('staff')[0]?.textContent, 0) || undefined;
    const offsetElement = direction.getElementsByTagName('offset')[0];
    const offset = parseIntSafe(offsetElement?.textContent, 0);
    const timestamp = offsetElement ? fractionFromOffset(offset, divisions) : null;
    return {
      id: makeId('dir', measureNumber, index),
      kind,
      value,
      number: spanNumber,
      placement: direction.getAttribute('placement') ?? undefined,
      measureNumber,
      staffIndex,
      timestampNum: timestamp?.timestampNum,
      timestampDen: timestamp?.timestampDen,
    };
  }).filter((direction): direction is DirectionNode => Boolean(direction));

  const harmonies = directChildrenByTag(measure, 'harmony').map((harmony, index) => {
    const rootStep = harmony.getElementsByTagName('root-step')[0]?.textContent ?? '';
    const rootAlter = harmony.getElementsByTagName('root-alter')[0]?.textContent === '1'
      ? '#'
      : harmony.getElementsByTagName('root-alter')[0]?.textContent === '-1'
        ? 'b'
        : '';
    const kindText = readHarmonyKindText(harmony);
    const bassStep = harmony.getElementsByTagName('bass-step')[0]?.textContent ?? '';
    const bassAlter = harmony.getElementsByTagName('bass-alter')[0]?.textContent === '1'
      ? '#'
      : harmony.getElementsByTagName('bass-alter')[0]?.textContent === '-1'
        ? 'b'
        : '';
    return {
      id: makeId('harmony', measureNumber, index),
      kind: 'harmony',
      value: `${rootStep}${rootAlter}${kindText}${bassStep ? `/${bassStep}${bassAlter}` : ''}`,
      measureNumber,
    };
  });

  return [...directions, ...harmonies];
}

function collectNotationSemantics(
  note: XmlElement,
  eventId: string,
  measureNumber: number,
  staffIndex: number,
  voiceId: number,
  collectors: SemanticCollectors,
  state: {
    openSlurs: Map<string, SlurSpan>;
    beamGroups: Map<string, BeamGroup>;
    tupletGroups: Map<string, TupletSpan>;
  },
) {
  const notations = note.getElementsByTagName('notations')[0];

  for (const lyric of Array.from(note.getElementsByTagName('lyric'))) {
    const text = lyric.getElementsByTagName('text')[0]?.textContent ?? '';
    if (!text) continue;
    const verseNumber = parseIntSafe(lyric.getAttribute('number'), 1) || 1;
    collectors.lyricLines.push({
      id: makeId('lyric', eventId, verseNumber),
      verseNumber,
      eventId,
      text,
      syllabic: (lyric.getElementsByTagName('syllabic')[0]?.textContent ?? undefined) as LyricLine['syllabic'],
    });
  }

  for (const slurEl of Array.from(notations?.getElementsByTagName('slur') ?? [])) {
    const number = parseIntSafe(slurEl.getAttribute('number'), 1) || 1;
    const type = slurEl.getAttribute('type') ?? 'start';
    const key = `${staffIndex}:${voiceId}:${number}`;
    if (type === 'start') {
      const span: SlurSpan = {
        id: makeId('slur', measureNumber, staffIndex, voiceId, number, eventId),
        number,
        startEventId: eventId,
        placement: slurEl.getAttribute('placement') ?? undefined,
      };
      state.openSlurs.set(key, span);
      collectors.slurs.push(span);
    } else if (type === 'stop') {
      const existing = state.openSlurs.get(key);
      if (existing) {
        existing.stopEventId = eventId;
        state.openSlurs.delete(key);
      } else {
        collectors.slurs.push({
          id: makeId('slur-stop', measureNumber, staffIndex, voiceId, number, eventId),
          number,
          stopEventId: eventId,
          placement: slurEl.getAttribute('placement') ?? undefined,
        });
      }
    }
  }

  for (const beamEl of Array.from(note.getElementsByTagName('beam'))) {
    const number = parseIntSafe(beamEl.getAttribute('number'), 1) || 1;
    const type = (beamEl.textContent ?? '').trim();
    const key = `${measureNumber}:${staffIndex}:${voiceId}:${number}`;
    let group = state.beamGroups.get(key);
    if (!group) {
      group = { id: makeId('beam', measureNumber, staffIndex, voiceId, number), number, eventIds: [] };
      state.beamGroups.set(key, group);
      collectors.beams.push(group);
    }
    if (!group.eventIds.includes(eventId)) group.eventIds.push(eventId);
    if (type === 'forward hook') group.hook = 'forward';
    if (type === 'backward hook') group.hook = 'backward';
    if (['end', 'forward hook', 'backward hook'].includes(type)) state.beamGroups.delete(key);
  }

  const timeModification = note.getElementsByTagName('time-modification')[0];
  const tupletEl = Array.from(notations?.getElementsByTagName('tuplet') ?? [])[0];
  if (timeModification || tupletEl) {
    const number = parseIntSafe(tupletEl?.getAttribute('number'), 1) || 1;
    const key = `${measureNumber}:${staffIndex}:${voiceId}:${number}`;
    let group = state.tupletGroups.get(key);
    if (!group) {
      group = {
        id: makeId('tuplet', measureNumber, staffIndex, voiceId, number),
        number,
        eventIds: [],
        actualNotes: parseIntSafe(timeModification?.getElementsByTagName('actual-notes')[0]?.textContent, 0) || undefined,
        normalNotes: parseIntSafe(timeModification?.getElementsByTagName('normal-notes')[0]?.textContent, 0) || undefined,
        bracket: tupletEl?.getAttribute('bracket') === 'yes' || undefined,
        showNumber: (tupletEl?.getAttribute('show-number') as TupletSpan['showNumber']) ?? undefined,
      };
      state.tupletGroups.set(key, group);
      collectors.tuplets.push(group);
    }
    if (!group.eventIds.includes(eventId)) group.eventIds.push(eventId);
    if ((tupletEl?.getAttribute('type') ?? '') === 'stop') state.tupletGroups.delete(key);
  }

  const grace = note.getElementsByTagName('grace')[0];
  if (grace) {
    collectors.graceNotes.push({
      id: makeId('grace', eventId),
      eventId,
      slash: grace.getAttribute('slash') === 'yes' || undefined,
    });
  }

  // Parse fermata
  const fermataEl = Array.from(notations?.childNodes ?? []).find(
    (child) => child.nodeType === 1 && (child as XmlElement).tagName === 'fermata',
  ) as XmlElement | undefined;
  if (fermataEl) {
    collectors.fermataEventIds.add(eventId);
  }

  // Parse tremolo
  const tremoloEl = Array.from(notations?.getElementsByTagName('tremolo') ?? [])[0];
  if (tremoloEl) {
    const lines = parseIntSafe(tremoloEl.textContent, 1) || 1;
    collectors.tremolos.push({
      id: makeId('tremolo', eventId),
      eventId,
      lines: (Math.min(Math.max(lines, 1), 3) as 1 | 2 | 3),
      type: (tremoloEl.getAttribute('type') ?? 'single') as 'single' | 'start' | 'stop',
    });
  }

  // Parse glissando
  const glissandoEl = Array.from(notations?.getElementsByTagName('glissando') ?? [])[0];
  if (glissandoEl) {
    const number = parseIntSafe(glissandoEl.getAttribute('number'), 1) || 1;
    const lineType = (glissandoEl.getAttribute('line-type') ?? undefined) as GlissandoLine['lineType'];
    const type = glissandoEl.getAttribute('type') ?? 'start';
    if (type === 'start') {
      collectors.glissandos.push({
        id: makeId('gliss', measureNumber, staffIndex, voiceId, number, eventId),
        number,
        startEventId: eventId,
        lineType,
        text: glissandoEl.textContent?.trim() || undefined,
      });
    } else {
      // Find existing glissando with same number to complete the span
      const existing = collectors.glissandos.find(
        (g) => g.number === number && !g.stopEventId,
      );
      if (existing) {
        existing.stopEventId = eventId;
      } else {
        collectors.glissandos.push({
          id: makeId('gliss-stop', eventId, number),
          number,
          stopEventId: eventId,
          lineType,
          text: glissandoEl.textContent?.trim() || undefined,
        });
      }
    }
  }

  // Parse arpeggio
  const arpeggiateEl = Array.from(notations?.getElementsByTagName('arpeggiate') ?? [])[0];
  if (arpeggiateEl) {
    collectors.arpeggios.push({
      id: makeId('arpeggio', eventId),
      eventId,
      direction: (arpeggiateEl.getAttribute('direction') ?? undefined) as ArpeggioMark['direction'],
      nonArpeggiate: arpeggiateEl.getAttribute('non-arpeggiate') === 'yes' || undefined,
    });
  }
}

function buildVoices(
  measure: XmlElement,
  partId: string,
  measureNumber: number,
  staffIndex: number,
  divisions: number,
  collectors: SemanticCollectors,
  expectedDuration?: number,
): VoiceNode[] {
  const eventsByVoice = new Map<number, TimedEvent[]>();
  const openSlurs = new Map<string, SlurSpan>();
  const beamGroups = new Map<string, BeamGroup>();
  const tupletGroups = new Map<string, TupletSpan>();
  let cursor = 0;

  const voiceEnd = (voiceId: number) => {
    const events = eventsByVoice.get(voiceId) ?? [];
    return events.reduce((end, event) => (
      event.isChord ? end : Math.max(end, event.timestampNum + event.durationDivisions)
    ), 0);
  };

  const addHiddenRest = (voiceId: number, start: number, end: number) => {
    if (end <= start) return;
    const { timestampNum, timestampDen } = fractionFromOffset(start, divisions);
    const durationDivisions = end - start;
    const duration = describeDuration(durationDivisions, divisions);
    const representableDuration = isRepresentableDuration(durationDivisions, divisions);
    const rest: TimedEvent = {
      id: makeId('event', partId, measureNumber, staffIndex, voiceId, 'hidden-rest', start, end),
      kind: 'rest',
      measureNumber,
      staffIndex,
      voiceId,
      timestampNum,
      timestampDen,
      durationDivisions,
      durationType: representableDuration ? duration.type : undefined,
      isDotted: representableDuration ? duration.dotted : undefined,
      isChord: false,
      hidden: true,
    };
    const existing = eventsByVoice.get(voiceId) ?? [];
    existing.push(rest);
    eventsByVoice.set(voiceId, existing);
  };

  const measureChildren = Array.from(measure.childNodes).filter((child): child is XmlElement => child.nodeType === 1);
  const shouldRepairCursorGaps = expectedDuration != null
    && measureChildren.some((element) => element.tagName === 'forward');
  for (const element of measureChildren) {
    if (element.tagName === 'backup') {
      cursor = Math.max(0, cursor - parseIntSafe(element.getElementsByTagName('duration')[0]?.textContent, 0));
      continue;
    }

    if (element.tagName === 'forward') {
      cursor += parseIntSafe(element.getElementsByTagName('duration')[0]?.textContent, 0);
      continue;
    }

    if (element.tagName !== 'note') continue;

    const note = element;
    const noteStaff = parseIntSafe(note.getElementsByTagName('staff')[0]?.textContent, 1);

    const voiceId = parseIntSafe(note.getElementsByTagName('voice')[0]?.textContent, 1);
    const rawDurationDivisions = parseIntSafe(note.getElementsByTagName('duration')[0]?.textContent, 0);
    const isChord = note.getElementsByTagName('chord').length > 0;
    const previousVoiceEvent = eventsByVoice.get(voiceId)?.[eventsByVoice.get(voiceId)!.length - 1];
    const currentOffset = shouldRepairCursorGaps
      ? (
          isChord
            ? (previousVoiceEvent?.timestampNum ?? cursor)
            : cursor
        )
      : (
          isChord
            ? (previousVoiceEvent?.timestampNum ?? voiceEnd(voiceId))
            : voiceEnd(voiceId)
        );

    if (noteStaff !== staffIndex) {
      if (shouldRepairCursorGaps && !isChord) cursor += rawDurationDivisions;
      continue;
    }

    if (expectedDuration != null && !isChord && currentOffset >= expectedDuration) {
      cursor += rawDurationDivisions;
      continue;
    }

    const durationDivisions = expectedDuration != null
      && currentOffset < expectedDuration
      && currentOffset + rawDurationDivisions > expectedDuration
      ? expectedDuration - currentOffset
      : rawDurationDivisions;
    if (shouldRepairCursorGaps && !isChord) {
      addHiddenRest(voiceId, voiceEnd(voiceId), Math.min(currentOffset, expectedDuration ?? currentOffset));
    }

    const { timestampNum, timestampDen } = fractionFromOffset(currentOffset, divisions);
    const repairedDuration = durationDivisions !== rawDurationDivisions
      ? describeDuration(durationDivisions, divisions)
      : null;
    const durationType = repairedDuration?.type ?? note.getElementsByTagName('type')[0]?.textContent ?? undefined;
    const noteheadText = (note.getElementsByTagName('notehead')[0]?.textContent ?? '').trim();
    const stemText = (note.getElementsByTagName('stem')[0]?.textContent ?? '').trim();
    const modeledStem = stemText === 'none' || stemText === 'up' || stemText === 'down' ? stemText : undefined;
    const guitar = readGuitarTechnical(note);
    const eventId = makeId('event', partId, measureNumber, staffIndex, voiceId, timestampNum, timestampDen, eventsByVoice.get(voiceId)?.length ?? 0);
    const notations = note.getElementsByTagName('notations')[0];
    const fermataEl = Array.from(notations?.childNodes ?? []).find(
      (child) => child.nodeType === 1 && (child as XmlElement).tagName === 'fermata',
    ) as XmlElement | undefined;
    const tiedStart = Array.from(notations?.getElementsByTagName('tied') ?? [])
      .find((tied) => tied.getAttribute('type') === 'start');
    const tieStart = Array.from(note.getElementsByTagName('tie')).some((tie) => tie.getAttribute('type') === 'start')
      || Boolean(tiedStart);
    const articulationInfo = readArticulationElements(note);
    const fermataPlacement = normalizeFermataPlacement(fermataEl);
    const articulationPlacements = {
      ...(articulationInfo.placements ?? {}),
      ...(fermataPlacement ? { fermata: fermataPlacement } : {}),
    };

    const baseEvent = {
      id: eventId,
      measureNumber,
      staffIndex,
      voiceId,
      timestampNum,
      timestampDen,
      durationDivisions,
      durationType,
      isDotted: repairedDuration?.dotted ?? (note.getElementsByTagName('dot').length > 0),
      isChord,
      hidden: note.getAttribute('print-object') === 'no' || undefined,
      notehead: noteheadText === 'slash' ? 'slash' : undefined,
      stem: modeledStem,
      articulations: articulationInfo.articulations,
      articulationPlacements: Object.keys(articulationPlacements).length > 0 ? articulationPlacements : undefined,
      tieStart,
      tiePlacement: tieStart
        ? normalizePlacement(tiedStart?.getAttribute('placement') ?? tiedStart?.getAttribute('orientation'))
        : undefined,
      lyrics: Array.from(note.getElementsByTagName('lyric')).map((lyric) => ({
        verseNumber: parseIntSafe(lyric.getAttribute('number'), 1) || 1,
        text: lyric.getElementsByTagName('text')[0]?.textContent ?? '',
        syllabic: (lyric.getElementsByTagName('syllabic')[0]?.textContent ?? undefined) as 'single' | 'begin' | 'middle' | 'end' | undefined,
      })).filter((lyric) => lyric.text),
      preservedXml: collectPreservedNoteXml(note, {
        omitSlashNotehead: noteheadText === 'slash',
        omitStem: modeledStem,
        omitGuitarTechnical: Boolean(guitar),
        omitGuitarSlide: Boolean(guitar?.techniques?.includes('slide')),
        omitGuitarVibrato: Boolean(guitar?.techniques?.includes('vibrato')),
      }),
    } as const;

    const pitch = note.getElementsByTagName('pitch')[0];
    const event: TimedEvent = pitch
      ? {
        ...baseEvent,
        kind: 'note',
        pitch: {
          step: pitch.getElementsByTagName('step')[0]?.textContent ?? 'C',
          alter: parseIntSafe(pitch.getElementsByTagName('alter')[0]?.textContent, 0),
          octave: parseIntSafe(pitch.getElementsByTagName('octave')[0]?.textContent, 4),
        },
        guitar,
      }
      : {
        ...baseEvent,
        kind: 'rest',
      };

    const existing = eventsByVoice.get(voiceId) ?? [];
    existing.push(event);
    eventsByVoice.set(voiceId, existing);

    collectNotationSemantics(note, eventId, measureNumber, staffIndex, voiceId, collectors, {
      openSlurs,
      beamGroups,
      tupletGroups,
    });

    if (!isChord) cursor += rawDurationDivisions;
  }

  if (shouldRepairCursorGaps) {
    for (const voiceId of eventsByVoice.keys()) {
      addHiddenRest(voiceId, voiceEnd(voiceId), expectedDuration!);
    }
  }

  return Array.from(eventsByVoice.entries()).map(([voiceId, events]) => {
    const eventsByTimestamp = new Map<string, string[]>();
    for (const event of events) {
      const key = `${event.timestampNum}/${event.timestampDen}`;
      const existing = eventsByTimestamp.get(key) ?? [];
      existing.push(event.id);
      eventsByTimestamp.set(key, existing);
    }

    for (const [timestamp, eventIds] of eventsByTimestamp.entries()) {
      const groupEvents = events.filter((event) => eventIds.includes(event.id));
      if (eventIds.length <= 1 && !groupEvents.some((event) => event.isChord)) continue;
      const [timestampNumText, timestampDenText] = timestamp.split('/');
      collectors.chordGroups.push({
        id: makeId('chord', partId, measureNumber, staffIndex, voiceId, timestamp),
        measureNumber,
        staffIndex,
        voiceId,
        timestampNum: parseIntSafe(timestampNumText, 0),
        timestampDen: parseIntSafe(timestampDenText, 1),
        eventIds,
      });
    }

    return {
      id: makeId('voice', measureNumber, staffIndex, voiceId),
      voiceId,
      events,
    };
  });
}

function buildStaffs(part: XmlElement, collectors: SemanticCollectors): StaffNode[] {
  const measures = Array.from(part.getElementsByTagName('measure'));
  const sourceMeasureNumbers = measures.map((measure, index) => parseIntSafe(measure.getAttribute('number'), index + 1));
  const hasImplicitZeroPickup = measures[0]?.getAttribute('implicit') === 'yes' && sourceMeasureNumbers[0] === 0;
  const explicitStaffCount = measures.reduce((maxStaff, measure) => {
    const staffValues = Array.from(measure.getElementsByTagName('staff')).map((staff) => parseIntSafe(staff.textContent, 1));
    return Math.max(maxStaff, ...staffValues, 1);
  }, 1);
  const effectiveTimingByMeasure = new Map<XmlElement, {
    divisions: number;
    time?: { beats: number; beatType: number };
  }>();
  let currentDivisions = 1;
  let currentTime: { beats: number; beatType: number } | undefined;
  for (const measure of measures) {
    const attributes = directChildrenByTag(measure, 'attributes');
    const explicitDivisions = attributes.reduce((value, attribute) => (
      parseIntSafe(attribute.getElementsByTagName('divisions')[0]?.textContent, 0) || value
    ), 0);
    if (explicitDivisions > 0) currentDivisions = explicitDivisions;
    for (const attribute of attributes) {
      const time = attribute.getElementsByTagName('time')[0];
      if (!time) continue;
      const beats = parseIntSafe(time.getElementsByTagName('beats')[0]?.textContent, 0);
      const beatType = parseIntSafe(time.getElementsByTagName('beat-type')[0]?.textContent, 0);
      if (beats > 0 && beatType > 0) {
        currentTime = { beats, beatType };
      }
    }
    effectiveTimingByMeasure.set(measure, { divisions: currentDivisions, time: currentTime });
  }

  return Array.from({ length: explicitStaffCount }, (_, index) => {
    const staffIndex = index + 1;
    const measureNodes: MeasureNode[] = measures.map((measure, measureIndex) => {
      const sourceMeasureNumber = sourceMeasureNumbers[measureIndex] ?? measureIndex + 1;
      const measureNumber = hasImplicitZeroPickup ? measureIndex + 1 : sourceMeasureNumber;
      const implicit = measure.getAttribute('implicit') === 'yes' || undefined;
      const timing = effectiveTimingByMeasure.get(measure);
      const divisions = timing?.divisions ?? 1;
      const expectedDuration = implicit || !timing?.time
        ? undefined
        : expectedMeasureDuration(timing.time.beats, timing.time.beatType, divisions);
      const print = measure.getElementsByTagName('print')[0];

      if (print?.getAttribute('new-system') === 'yes') {
        collectors.layoutHints.push({
          id: makeId('layout', part.getAttribute('id') ?? 'P?', staffIndex, measureNumber, 'newSystem'),
          scope: 'measure',
          measureNumber,
          partId: part.getAttribute('id') ?? undefined,
          staffIndex,
          kind: 'newSystem',
          value: true,
        });
      }
      if (print?.getAttribute('new-page') === 'yes') {
        collectors.layoutHints.push({
          id: makeId('layout', part.getAttribute('id') ?? 'P?', staffIndex, measureNumber, 'newPage'),
          scope: 'page',
          measureNumber,
          partId: part.getAttribute('id') ?? undefined,
          staffIndex,
          kind: 'newPage',
          value: true,
        });
      }

      const staffDistance = parseIntSafe(print?.getElementsByTagName('staff-distance')[0]?.textContent, 0);
      if (staffDistance > 0) {
        collectors.layoutHints.push({
          id: makeId('layout', part.getAttribute('id') ?? 'P?', staffIndex, measureNumber, 'staffSpacing'),
          scope: 'staff',
          measureNumber,
          partId: part.getAttribute('id') ?? undefined,
          staffIndex,
          kind: 'staffSpacing',
          value: staffDistance,
        });
      }

      return {
        id: makeId('measure', part.getAttribute('id') ?? 'P?', staffIndex, measureNumber),
        measureNumber,
        sourceMeasureNumber,
        implicit,
        voices: buildVoices(measure, part.getAttribute('id') ?? 'P?', measureNumber, staffIndex, divisions, collectors, expectedDuration),
        directions: buildDirections(measure, measureNumber, divisions).filter((direction) => !direction.staffIndex || direction.staffIndex === staffIndex),
        attributes: buildMeasureAttributes(measure, measureNumber),
        measureRepeat: (() => {
          const measureStyleEls = measure.getElementsByTagName('measure-style');
          if (measureStyleEls.length === 0) return undefined;
          const measureRepeatEl = measureStyleEls[0]?.getElementsByTagName('measure-repeat')[0];
          if (!measureRepeatEl) return undefined;
          const repeatCount = parseIntSafe(measureRepeatEl.textContent, 0);
          return repeatCount > 0 ? repeatCount : undefined;
        })(),
        print: {
          newSystem: print?.getAttribute('new-system') === 'yes' || undefined,
          newPage: print?.getAttribute('new-page') === 'yes' || undefined,
        },
        leftBarline: Array.from(measure.getElementsByTagName('barline')).find((barline) => barline.getAttribute('location') === 'left')
          ?.getElementsByTagName('repeat')[0]?.getAttribute('direction') === 'forward'
          ? 'repeat-start'
          : undefined,
        rightBarline: Array.from(measure.getElementsByTagName('barline')).find((barline) => barline.getAttribute('location') === 'right')
          ?.getElementsByTagName('repeat')[0]?.getAttribute('direction') === 'backward'
          ? 'repeat-end'
          : Array.from(measure.getElementsByTagName('barline')).find((barline) => barline.getAttribute('location') === 'right')
            ?.getElementsByTagName('repeat')[0]?.getAttribute('direction') === 'forward'
            ? 'repeat-start'
            : Array.from(measure.getElementsByTagName('barline')).find((barline) => barline.getAttribute('location') === 'right')
              ?.getElementsByTagName('bar-style')[0]?.textContent === 'light-light'
              ? 'double'
              : Array.from(measure.getElementsByTagName('barline')).find((barline) => barline.getAttribute('location') === 'right')
                ?.getElementsByTagName('bar-style')[0]?.textContent === 'light-heavy'
                ? 'final'
                : undefined,
        leftEnding: (() => {
          const leftBarlineEl = Array.from(measure.getElementsByTagName('barline'))
            .find((barline) => barline.getAttribute('location') === 'left');
          const endingEl = leftBarlineEl ? directChildrenByTag(leftBarlineEl as XmlElement, 'ending')[0] : undefined;
          return endingEl
            ? {
              // Normalize "1, 2" → "1,2" so multi-number endings are consistently formatted.
              number: (endingEl.getAttribute('number') ?? '').split(',').map((n) => n.trim()).join(','),
              type: (endingEl.getAttribute('type') ?? 'start') as 'start' | 'stop' | 'discontinue',
            }
            : undefined;
        })(),
        rightEnding: (() => {
          const rightBarlineEl = Array.from(measure.getElementsByTagName('barline'))
            .find((barline) => barline.getAttribute('location') === 'right');
          const endingEl = rightBarlineEl ? directChildrenByTag(rightBarlineEl as XmlElement, 'ending')[0] : undefined;
          return endingEl
            ? {
              number: (endingEl.getAttribute('number') ?? '').split(',').map((n) => n.trim()).join(','),
              type: (endingEl.getAttribute('type') ?? 'start') as 'start' | 'stop' | 'discontinue',
            }
            : undefined;
        })(),
      };
    });

    return {
      id: makeId('staff', part.getAttribute('id') ?? 'P?', staffIndex),
      staffIndex,
      measures: measureNodes,
    };
  });
}

function buildParts(doc: XmlDocument, collectors: SemanticCollectors): PartNode[] {
  const scoreParts = Array.from(doc.getElementsByTagName('score-part'));
  const parts = Array.from(doc.getElementsByTagName('part'));

  return parts.map((part) => {
    const sourcePartId = part.getAttribute('id') ?? 'P?';
    const scorePart = scoreParts.find((entry) => entry.getAttribute('id') === sourcePartId);
    const transpose = part.getElementsByTagName('transpose')[0];
    return {
      id: makeId('part', sourcePartId),
      sourcePartId,
      name: scorePart?.getElementsByTagName('part-name')[0]?.textContent ?? sourcePartId,
      abbreviation: scorePart?.getElementsByTagName('part-abbreviation')[0]?.textContent ?? undefined,
      instrumentName: scorePart?.getElementsByTagName('instrument-name')[0]?.textContent ?? undefined,
      chromaticTranspose: transpose ? parseIntSafe(transpose.getElementsByTagName('chromatic')[0]?.textContent, 0) || undefined : undefined,
      diatonicTranspose: transpose ? parseIntSafe(transpose.getElementsByTagName('diatonic')[0]?.textContent, 0) || undefined : undefined,
      staves: buildStaffs(part, collectors),
    };
  });
}

export function importMusicXmlToCore(xml: string): ScoreDocumentModel {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'application/xml');
  const metadata = readMetadata(doc);
  const collectors: SemanticCollectors = {
    slurs: [],
    beams: [],
    tuplets: [],
    chordGroups: [],
    graceNotes: [],
    lyricLines: [],
    layoutHints: [],
    tremolos: [],
    glissandos: [],
    arpeggios: [],
    fermataEventIds: new Set(),
  };
  const parts = buildParts(doc, collectors);
  const swingPlayback = readSwingPlayback(doc);

  const measureIds: Record<number, string[]> = {};
  const voiceIds: Record<string, string> = {};
  const eventIds: Record<string, string> = {};

  for (const part of parts) {
    for (const staff of part.staves) {
      for (const measure of staff.measures) {
        measureIds[measure.measureNumber] = [...(measureIds[measure.measureNumber] ?? []), measure.id];
        for (const voice of measure.voices) {
          voiceIds[`${part.sourcePartId}:${staff.staffIndex}:${measure.measureNumber}:${voice.voiceId}`] = voice.id;
          for (const event of voice.events) {
            eventIds[`${measure.measureNumber}:${staff.staffIndex}:${voice.voiceId}:${event.timestampNum}/${event.timestampDen}`] = event.id;
          }
        }
      }
    }
  }

  return {
    score: { id: 'score:root', parts },
    metadata,
    index: { measureIds, voiceIds, eventIds },
    slurs: collectors.slurs,
    beams: collectors.beams,
    tuplets: collectors.tuplets,
    chordGroups: collectors.chordGroups,
    graceNotes: collectors.graceNotes,
    lyricLines: collectors.lyricLines,
    layoutHints: collectors.layoutHints,
    tremolos: collectors.tremolos,
    glissandos: collectors.glissandos,
    arpeggios: collectors.arpeggios,
    fermataEventIds: collectors.fermataEventIds,
    swingRatio: swingPlayback.swingRatio,
    swingUnit: swingPlayback.swingUnit,
    revision: 1,
  };
}
