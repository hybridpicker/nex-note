import { DOMParser, XMLSerializer, type Document as XmlDocument } from '@xmldom/xmldom';
import { applyNoteEdit, findNoteElement } from '@/lib/note-editor';
import { isNoteEditCommand, type ScoreCommand, type ScoreDocumentSummary } from '@/src/shared/schemas/score-command';

type XmlEl = ReturnType<XmlDocument['createElement']>;

function serialize(doc: XmlDocument) {
  const serialized = new XMLSerializer().serializeToString(doc);
  return serialized.startsWith('<?xml') ? serialized : '<?xml version="1.0" encoding="UTF-8"?>\n' + serialized;
}

function getMeasure(doc: XmlDocument, measureNumber: number) {
  const measures = Array.from(doc.getElementsByTagName('measure'));
  return measures.find((measure) => parseInt(measure.getAttribute('number') ?? '0', 10) === measureNumber) ?? null;
}

function getMeasures(doc: XmlDocument, measureNumber: number) {
  return Array.from(doc.getElementsByTagName('measure'))
    .filter((measure) => parseInt(measure.getAttribute('number') ?? '0', 10) === measureNumber);
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

function getDivisions(doc: XmlDocument) {
  const divisions = doc.getElementsByTagName('divisions')[0];
  return parseInt(divisions?.textContent ?? '1', 10) || 1;
}

function findCreator(doc: XmlDocument, type: string) {
  return Array.from(doc.getElementsByTagName('creator')).find((entry) => entry.getAttribute('type') === type)?.textContent ?? undefined;
}

export function summarizeXmlScoreDocument(xml: string): ScoreDocumentSummary {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'application/xml');
  const title = doc.getElementsByTagName('movement-title')[0]?.textContent
    ?? doc.getElementsByTagName('work-title')[0]?.textContent
    ?? doc.getElementsByTagName('credit-words')[0]?.textContent
    ?? undefined;
  const subtitle = doc.getElementsByTagName('work-number')[0]?.textContent
    ?? doc.getElementsByTagName('credit-words')[1]?.textContent
    ?? undefined;
  const arranger = findCreator(doc, 'arranger');
  const composer = findCreator(doc, 'composer');
  const parts = Array.from(doc.getElementsByTagName('score-part')).map((part) => {
    const id = part.getAttribute('id') ?? '';
    const scoreInstrument = part.getElementsByTagName('score-instrument')[0];
    const measurePart = Array.from(doc.getElementsByTagName('part')).find((entry) => entry.getAttribute('id') === id);
    const transpose = measurePart?.getElementsByTagName('transpose')[0];
    return {
      id,
      name: part.getElementsByTagName('part-name')[0]?.textContent ?? id,
      abbreviation: part.getElementsByTagName('part-abbreviation')[0]?.textContent ?? undefined,
      instrumentName: scoreInstrument?.getElementsByTagName('instrument-name')[0]?.textContent ?? undefined,
      chromaticTranspose: transpose ? parseInt(transpose.getElementsByTagName('chromatic')[0]?.textContent ?? '0', 10) || 0 : undefined,
      diatonicTranspose: transpose ? parseInt(transpose.getElementsByTagName('diatonic')[0]?.textContent ?? '0', 10) || 0 : undefined,
    };
  });
  return { title, subtitle, arranger, composer, parts };
}

export function applyLegacyXmlScoreCommands(xml: string, commands: ScoreCommand[]): string {
  let currentXml = xml;

  for (const command of commands) {
    if (isNoteEditCommand(command)) {
      currentXml = applyNoteEdit(currentXml, command);
      continue;
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(currentXml, 'application/xml');

    switch (command.type) {
      case 'duplicateNote': duplicateNote(doc, command); break;
      case 'removeArticulations': removeArticulations(doc); break;
      case 'setKey': setKey(doc, command.fifths, command.measureNumber ?? 1); break;
      case 'transposeDocumentChromatic': transposeDocumentChromatically(doc, command.semitones); break;
      case 'setTempo': setTempo(doc, command.bpm); break;
      case 'setTitle': setTitle(doc, command.title); break;
      case 'setSubtitle': setSubtitle(doc, command.subtitle); break;
      case 'setArranger': setArranger(doc, command.arranger); break;
      case 'setComposer': setComposer(doc, command.composer); break;
      case 'addStartRepeat': addStartRepeat(doc, command.measureNumber ?? 1); break;
      case 'addEndRepeat': addEndRepeat(doc, command.measureNumber); break;
      case 'addVolta2': addVolta2(doc); break;
      case 'setEnding': setEnding(doc, command.measureNumber, command.number, command.endingType); break;
      case 'addChords': addChords(doc, command.chords); break;
      case 'setHarmonyAt': setHarmonyAt(doc, command); break;
      case 'setTimeSignature': setTimeSignature(doc, command.beats, command.beatType, command.measureNumber); break;
      case 'setClef': setClef(doc, command.sign, command.line, command.measureNumber, command.staffIndex); break;
      case 'removeClefChange': removeClefChange(doc, command.measureNumber, command.staffIndex); break;
      case 'insertMeasureAfter': insertMeasureAfter(doc, command.measureNumber); break;
      case 'deleteMeasure': deleteMeasure(doc, command.measureNumber); break;
      case 'addLyric': addLyric(doc, command); break;
      case 'removeLyricLine': removeLyricLine(doc, command); break;
      case 'addRehearsalMark': addRehearsalMark(doc, command.measureNumber, command.text); break;
      case 'addWords': addWords(doc, command.measureNumber, command.text, command.placement); break;
      case 'removeDirection': removeDirection(doc, command.measureNumber, command.text, command.staffIndex, command.kind); break;
      case 'setSystemBreak': setPrintBreak(doc, command.measureNumber, 'new-system', command.value ?? true); break;
      case 'setPageBreak': setPrintBreak(doc, command.measureNumber, 'new-page', command.value ?? true); break;
      case 'setPartName': setPartName(doc, command.partId, command.name); break;
      case 'setPartAbbreviation': setPartAbbreviation(doc, command.partId, command.abbreviation); break;
      case 'setInstrumentName': setInstrumentName(doc, command.partId, command.instrumentName); break;
      case 'setPartTranspose': setPartTranspose(doc, command.partId, command.chromatic, command.diatonic); break;
    }

    currentXml = serialize(doc);
  }

  return currentXml;
}

function removeArticulations(doc: XmlDocument) {
  const directions = Array.from(doc.getElementsByTagName('direction'));
  for (const dir of directions) {
    const dt = dir.getElementsByTagName('direction-type');
    for (let i = 0; i < dt.length; i++) {
      const hasDynamics = dt[i].getElementsByTagName('dynamics').length > 0;
      const hasOctave = dt[i].getElementsByTagName('octave-shift').length > 0;
      if (hasDynamics || hasOctave) {
        dir.parentNode?.removeChild(dir);
        break;
      }
    }
  }
  for (const tag of ['accent', 'staccato', 'staccatissimo', 'tenuto', 'strong-accent', 'fermata']) {
    const elements = Array.from(doc.getElementsByTagName(tag));
    for (const element of elements) element.parentNode?.removeChild(element);
  }
}

function setKey(doc: XmlDocument, fifths: number, measureNumber = 1) {
  const parts = Array.from(doc.getElementsByTagName('part'));
  const firstMeasures = parts
    .map((part) => Array.from(part.getElementsByTagName('measure')).find((measure) => parseInt(measure.getAttribute('number') ?? '0', 10) === measureNumber))
    .filter((measure): measure is XmlEl => Boolean(measure));

  const targets = firstMeasures.length > 0 ? firstMeasures : [getMeasure(doc, measureNumber) ?? doc.getElementsByTagName('measure')[0]].filter((measure): measure is XmlEl => Boolean(measure));
  targets.forEach((measure) => {
    const attributes = getOrCreateDirectChild(doc, measure, 'attributes');
    const key = getOrCreateDirectChild(doc, attributes, 'key');
    getOrCreateDirectChild(doc, key, 'fifths').textContent = String(fifths);
  });
}

function transposeDocumentChromatically(doc: XmlDocument, semitones: number) {
  const STEP_TO_SEMITONE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const SHARP_MAP: Array<{ step: string; alter: number }> = [
    { step: 'C', alter: 0 }, { step: 'C', alter: 1 }, { step: 'D', alter: 0 }, { step: 'D', alter: 1 },
    { step: 'E', alter: 0 }, { step: 'F', alter: 0 }, { step: 'F', alter: 1 }, { step: 'G', alter: 0 },
    { step: 'G', alter: 1 }, { step: 'A', alter: 0 }, { step: 'A', alter: 1 }, { step: 'B', alter: 0 },
  ];
  const FLAT_MAP: Array<{ step: string; alter: number }> = [
    { step: 'C', alter: 0 }, { step: 'D', alter: -1 }, { step: 'D', alter: 0 }, { step: 'E', alter: -1 },
    { step: 'E', alter: 0 }, { step: 'F', alter: 0 }, { step: 'G', alter: -1 }, { step: 'G', alter: 0 },
    { step: 'A', alter: -1 }, { step: 'A', alter: 0 }, { step: 'B', alter: -1 }, { step: 'B', alter: 0 },
  ];

  const preferFlats = Array.from(doc.getElementsByTagName('fifths')).some((entry) => (parseInt(entry.textContent ?? '0', 10) || 0) < 0);
  const noteElements = Array.from(doc.getElementsByTagName('note'));
  noteElements.forEach((note) => {
    const pitch = note.getElementsByTagName('pitch')[0];
    if (!pitch) return;
    const stepEl = pitch.getElementsByTagName('step')[0];
    const octaveEl = pitch.getElementsByTagName('octave')[0];
    const alterEl = pitch.getElementsByTagName('alter')[0];
    if (!stepEl || !octaveEl) return;

    const step = (stepEl.textContent ?? 'C').toUpperCase();
    const octave = parseInt(octaveEl.textContent ?? '4', 10) || 4;
    const alter = parseInt(alterEl?.textContent ?? '0', 10) || 0;
    const midi = (STEP_TO_SEMITONE[step] ?? 0) + alter + octave * 12;
    const nextMidi = midi + semitones;
    const nextOctave = Math.floor(nextMidi / 12);
    const chroma = ((nextMidi % 12) + 12) % 12;
    const mapped = (preferFlats ? FLAT_MAP : SHARP_MAP)[chroma];

    stepEl.textContent = mapped.step;
    octaveEl.textContent = String(nextOctave);
    if (mapped.alter !== 0) {
      if (alterEl) alterEl.textContent = String(mapped.alter);
      else {
        const createdAlter = doc.createElement('alter');
        createdAlter.textContent = String(mapped.alter);
        pitch.insertBefore(createdAlter, octaveEl);
      }
    } else if (alterEl) {
      pitch.removeChild(alterEl);
    }
  });

  const harmonyElements = Array.from(doc.getElementsByTagName('harmony'));
  harmonyElements.forEach((harmony) => {
    transposeHarmonyPitchNode(doc, harmony.getElementsByTagName('root')[0] as XmlEl | undefined, semitones, preferFlats);
    transposeHarmonyPitchNode(doc, harmony.getElementsByTagName('bass')[0] as XmlEl | undefined, semitones, preferFlats);
  });
}

function transposeHarmonyPitchNode(doc: XmlDocument, node: XmlEl | undefined, semitones: number, preferFlats: boolean) {
  if (!node) return;
  const stepTag = node.tagName === 'bass' ? 'bass-step' : 'root-step';
  const alterTag = node.tagName === 'bass' ? 'bass-alter' : 'root-alter';
  const stepEl = node.getElementsByTagName(stepTag)[0] as XmlEl | undefined;
  const alterEl = node.getElementsByTagName(alterTag)[0] as XmlEl | undefined;
  if (!stepEl) return;

  const STEP_TO_SEMITONE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const SHARP_MAP: Array<{ step: string; alter: number }> = [
    { step: 'C', alter: 0 }, { step: 'C', alter: 1 }, { step: 'D', alter: 0 }, { step: 'D', alter: 1 },
    { step: 'E', alter: 0 }, { step: 'F', alter: 0 }, { step: 'F', alter: 1 }, { step: 'G', alter: 0 },
    { step: 'G', alter: 1 }, { step: 'A', alter: 0 }, { step: 'A', alter: 1 }, { step: 'B', alter: 0 },
  ];
  const FLAT_MAP: Array<{ step: string; alter: number }> = [
    { step: 'C', alter: 0 }, { step: 'D', alter: -1 }, { step: 'D', alter: 0 }, { step: 'E', alter: -1 },
    { step: 'E', alter: 0 }, { step: 'F', alter: 0 }, { step: 'G', alter: -1 }, { step: 'G', alter: 0 },
    { step: 'A', alter: -1 }, { step: 'A', alter: 0 }, { step: 'B', alter: -1 }, { step: 'B', alter: 0 },
  ];

  const step = (stepEl.textContent ?? 'C').toUpperCase();
  const alter = parseInt(alterEl?.textContent ?? '0', 10) || 0;
  const midi = (STEP_TO_SEMITONE[step] ?? 0) + alter + 4 * 12;
  const nextMidi = midi + semitones;
  const chroma = ((nextMidi % 12) + 12) % 12;
  const mapped = (preferFlats ? FLAT_MAP : SHARP_MAP)[chroma];

  stepEl.textContent = mapped.step;
  if (mapped.alter !== 0) {
    if (alterEl) alterEl.textContent = String(mapped.alter);
    else {
      const createdAlter = doc.createElement(alterTag);
      createdAlter.textContent = String(mapped.alter);
      node.appendChild(createdAlter);
    }
  } else if (alterEl) {
    node.removeChild(alterEl);
  }
}

function setTempo(doc: XmlDocument, bpm: number) {
  const directions = Array.from(doc.getElementsByTagName('direction'));
  for (const dir of directions) {
    if (dir.getElementsByTagName('metronome').length > 0 || dir.getElementsByTagName('sound').length > 0) {
      const sound = dir.getElementsByTagName('sound')[0];
      if (sound?.getAttribute('tempo')) dir.parentNode?.removeChild(dir);
    }
  }
  const measure = getMeasure(doc, 1) ?? doc.getElementsByTagName('measure')[0];
  if (!measure) return;
  const firstNote = measure.getElementsByTagName('note')[0];
  const direction = doc.createElement('direction');
  direction.setAttribute('placement', 'above');
  const directionType = doc.createElement('direction-type');
  const metronome = doc.createElement('metronome');
  metronome.setAttribute('parentheses', 'no');
  const beatUnit = doc.createElement('beat-unit');
  beatUnit.textContent = 'quarter';
  const perMinute = doc.createElement('per-minute');
  perMinute.textContent = String(bpm);
  metronome.appendChild(beatUnit);
  metronome.appendChild(perMinute);
  directionType.appendChild(metronome);
  direction.appendChild(directionType);
  const sound = doc.createElement('sound');
  sound.setAttribute('tempo', String(bpm));
  direction.appendChild(sound);
  measure.insertBefore(direction, firstNote ?? null);
}

function setTitle(doc: XmlDocument, title: string) {
  const movementTitle = doc.getElementsByTagName('movement-title')[0];
  const workTitle = doc.getElementsByTagName('work-title')[0];
  const creditTitle = doc.getElementsByTagName('credit-words')[0];
  if (!title.trim()) {
    movementTitle?.parentNode?.removeChild(movementTitle);
    workTitle?.parentNode?.removeChild(workTitle);
    creditTitle?.parentNode?.removeChild(creditTitle);
    return;
  }
  if (workTitle) {
    workTitle.textContent = title;
    movementTitle?.parentNode?.removeChild(movementTitle);
    return;
  }
  let element = movementTitle;
  if (!element) {
    element = doc.createElement('movement-title');
    doc.documentElement?.insertBefore(element, doc.documentElement.firstChild);
  }
  element.textContent = title;
}

function setSubtitle(doc: XmlDocument, subtitle: string) {
  const work = doc.getElementsByTagName('work')[0];
  const workNumber = work?.getElementsByTagName('work-number')[0];
  const creditSubtitle = doc.getElementsByTagName('credit-words')[1];
  if (!subtitle.trim()) {
    workNumber?.parentNode?.removeChild(workNumber);
    creditSubtitle?.parentNode?.removeChild(creditSubtitle);
    return;
  }
  let ensuredWork = work;
  if (!ensuredWork) {
    ensuredWork = doc.createElement('work');
    doc.documentElement?.insertBefore(ensuredWork, doc.documentElement.firstChild);
  }
  getOrCreateDirectChild(doc, ensuredWork as XmlEl, 'work-number').textContent = subtitle;
}

function setCreator(doc: XmlDocument, type: 'arranger' | 'composer', value: string) {
  const root = doc.documentElement;
  if (!root) return;
  const identification = getOrCreateDirectChild(doc, root as XmlEl, 'identification');
  const creators = Array.from(identification.getElementsByTagName('creator'));
  let creator = creators.find((entry) => entry.getAttribute('type') === type);
  if (!value.trim()) {
    creator?.parentNode?.removeChild(creator);
    return;
  }
  if (!creator) {
    creator = doc.createElement('creator');
    creator.setAttribute('type', type);
    identification.appendChild(creator);
  }
  creator.textContent = value;
}

function setArranger(doc: XmlDocument, arranger: string) { setCreator(doc, 'arranger', arranger); }
function setComposer(doc: XmlDocument, composer: string) { setCreator(doc, 'composer', composer); }

function addStartRepeat(doc: XmlDocument, measureNumber = 1) {
  const measure = getMeasure(doc, measureNumber) ?? doc.getElementsByTagName('measure')[0];
  if (!measure) return;
  const barline = doc.createElement('barline');
  barline.setAttribute('location', 'left');
  const repeat = doc.createElement('repeat');
  repeat.setAttribute('direction', 'forward');
  barline.appendChild(repeat);
  measure.insertBefore(barline, measure.firstChild);
}

function addEndRepeat(doc: XmlDocument, measureNumber?: number) {
  const measures = Array.from(doc.getElementsByTagName('measure'));
  const measure = measureNumber ? getMeasure(doc, measureNumber) : measures[measures.length - 1];
  if (!measure) return;
  const existing = Array.from(measure.getElementsByTagName('barline')).find((entry) => entry.getAttribute('location') === 'right');
  const barline = existing ?? doc.createElement('barline');
  barline.setAttribute('location', 'right');
  const repeat = doc.createElement('repeat');
  repeat.setAttribute('direction', 'backward');
  barline.appendChild(repeat);
  if (!existing) measure.appendChild(barline);
}

function addVolta2(doc: XmlDocument) {
  const measure = getMeasure(doc, 1) ?? doc.getElementsByTagName('measure')[0];
  if (!measure) return;
  setEnding(doc, parseInt(measure.getAttribute('number') ?? '1', 10), '2', 'start');
}

function setEnding(doc: XmlDocument, measureNumber: number, number: string, endingType: 'start' | 'stop' | 'discontinue') {
  const measure = getMeasure(doc, measureNumber);
  if (!measure) return;
  const barline = doc.createElement('barline');
  barline.setAttribute('location', 'left');
  const ending = doc.createElement('ending');
  ending.setAttribute('number', number);
  ending.setAttribute('type', endingType);
  barline.appendChild(ending);
  measure.insertBefore(barline, measure.firstChild);
}

function addChords(doc: XmlDocument, chords: string) {
  const entries = chords.split(',').map((segment) => segment.trim()).filter(Boolean);
  for (const entry of entries) {
    const [measurePart, harmonyPart] = entry.split(':');
    const measureNumber = parseInt(measurePart, 10);
    const measure = getMeasure(doc, measureNumber);
    if (!measure || !harmonyPart) continue;
    Array.from(measure.childNodes)
      .filter((node): node is XmlEl => node.nodeType === 1 && (node as XmlEl).tagName === 'harmony')
      .forEach((harmony) => harmony.parentNode?.removeChild(harmony));
    const harmony = buildLegacyHarmonyElement(doc, harmonyPart.trim(), 0);
    const firstTimedElement = Array.from(measure.childNodes)
      .find((node): node is XmlEl => (
        node.nodeType === 1
        && ['note', 'backup', 'forward'].includes((node as XmlEl).tagName)
      ));
    measure.insertBefore(harmony, firstTimedElement ?? null);
  }
}

const LEGACY_HARMONY_KIND: Record<string, string> = {
  m: 'minor',
  min: 'minor',
  '-': 'minor',
  '7': 'dominant',
  m7: 'minor-seventh',
  min7: 'minor-seventh',
  '-7': 'minor-seventh',
  maj7: 'major-seventh',
  ma7: 'major-seventh',
  M7: 'major-seventh',
  dim: 'diminished',
  o: 'diminished',
  aug: 'augmented',
  '+': 'augmented',
  sus: 'suspended-fourth',
  sus4: 'suspended-fourth',
  sus2: 'suspended-second',
  m7b5: 'half-diminished',
};

const LEGACY_GERMAN_ROOTS: Record<string, { step: string; alter: number }> = {
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

function getDirectChildText(parent: XmlEl, tag: string) {
  for (let i = 0; i < parent.childNodes.length; i++) {
    const child = parent.childNodes[i] as XmlEl;
    if (child.nodeType === 1 && child.tagName === tag) return child.textContent ?? '';
  }
  return '';
}

function parseLegacyHarmonyRoot(value: string) {
  const compact = value.trim().replace(/\s+/g, '');
  const german = /^(Cis|Ces|Des|Dis|Eis|Ees|Es|Fis|Fes|Gis|Ges|Ais|Aes|As|H)(.*)$/i.exec(compact);
  if (german) {
    const root = LEGACY_GERMAN_ROOTS[german[1].toLowerCase()];
    return root ? { ...root, suffix: german[2] ?? '' } : null;
  }
  const english = /^([A-G])([#b]?)(.*)$/i.exec(compact);
  if (!english) return null;
  return {
    step: english[1].toUpperCase(),
    alter: english[2] === '#' ? 1 : english[2] === 'b' ? -1 : 0,
    suffix: english[3] ?? '',
  };
}

function appendHarmonyPitch(doc: XmlDocument, parent: XmlEl, prefix: 'root' | 'bass', step: string, alter: number) {
  const pitch = doc.createElement(prefix);
  const stepEl = doc.createElement(`${prefix}-step`);
  stepEl.textContent = step;
  pitch.appendChild(stepEl);
  if (alter !== 0) {
    const alterEl = doc.createElement(`${prefix}-alter`);
    alterEl.textContent = String(alter);
    pitch.appendChild(alterEl);
  }
  parent.appendChild(pitch);
}

function buildLegacyHarmonyElement(doc: XmlDocument, value: string, offset: number) {
  const [rootPart, bassPart] = value.split('/');
  const root = parseLegacyHarmonyRoot(rootPart);
  const harmony = doc.createElement('harmony');
  if (!root) {
    appendHarmonyPitch(doc, harmony, 'root', value.trim().charAt(0).toUpperCase() || 'C', 0);
  } else {
    appendHarmonyPitch(doc, harmony, 'root', root.step, root.alter);
    const suffix = root.suffix.trim();
    const kind = doc.createElement('kind');
    if (suffix) kind.setAttribute('text', suffix);
    kind.textContent = suffix ? LEGACY_HARMONY_KIND[suffix] ?? LEGACY_HARMONY_KIND[suffix.toLowerCase()] ?? 'other' : 'major';
    harmony.appendChild(kind);
  }
  const bass = bassPart ? parseLegacyHarmonyRoot(bassPart) : null;
  if (bass && !bass.suffix.trim()) appendHarmonyPitch(doc, harmony, 'bass', bass.step, bass.alter);
  if (offset !== 0) getOrCreateDirectChild(doc, harmony, 'offset').textContent = String(offset);
  return harmony;
}

function getHarmonyOffset(harmony: XmlEl) {
  return parseInt(getDirectChildText(harmony, 'offset') || '0', 10) || 0;
}

function getHarmonyStaff(harmony: XmlEl) {
  return parseInt(getDirectChildText(harmony, 'staff') || '1', 10) || 1;
}

function setHarmonyAt(doc: XmlDocument, command: Extract<ScoreCommand, { type: 'setHarmonyAt' }>) {
  const measures = getMeasures(doc, command.measureNumber);
  if (measures.length === 0) return;
  const targetStaff = 1;
  const divisions = getDivisions(doc);
  const offset = Math.round((command.timestampNum / Math.max(command.timestampDen, 1)) * divisions * 4);

  measures.forEach((measure) => {
    Array.from(measure.childNodes)
      .filter((node): node is XmlEl => node.nodeType === 1 && (node as XmlEl).tagName === 'harmony')
      .forEach((harmony) => {
        if (getHarmonyOffset(harmony) === offset && getHarmonyStaff(harmony) === targetStaff) {
          harmony.parentNode?.removeChild(harmony);
        }
      });

    const harmony = buildLegacyHarmonyElement(doc, command.value.trim(), offset);
    const firstTimedElement = Array.from(measure.childNodes)
      .find((node): node is XmlEl => (
        node.nodeType === 1
        && ['note', 'backup', 'forward'].includes((node as XmlEl).tagName)
      ));
    measure.insertBefore(harmony, firstTimedElement ?? null);
  });
}

function setTimeSignature(doc: XmlDocument, beats: number, beatType: number, measureNumber?: number) {
  const measure = measureNumber ? getMeasure(doc, measureNumber) : getMeasure(doc, 1) ?? doc.getElementsByTagName('measure')[0];
  if (!measure) return;
  const attributes = getOrCreateDirectChild(doc, measure as XmlEl, 'attributes');
  const time = getOrCreateDirectChild(doc, attributes, 'time');
  getOrCreateDirectChild(doc, time, 'beats').textContent = String(beats);
  getOrCreateDirectChild(doc, time, 'beat-type').textContent = String(beatType);
}

function setClef(doc: XmlDocument, sign: 'G' | 'F' | 'C', line: 1 | 2 | 3 | 4 | 5, measureNumber?: number, staffIndex?: number) {
  const measure = measureNumber ? getMeasure(doc, measureNumber) : getMeasure(doc, 1) ?? doc.getElementsByTagName('measure')[0];
  if (!measure) return;
  const attributes = getOrCreateDirectChild(doc, measure as XmlEl, 'attributes');
  const clef = getOrCreateDirectChild(doc, attributes, 'clef');
  if (staffIndex) clef.setAttribute('number', String(staffIndex));
  getOrCreateDirectChild(doc, clef, 'sign').textContent = sign;
  getOrCreateDirectChild(doc, clef, 'line').textContent = String(line);
}

function removeClefChange(doc: XmlDocument, measureNumber: number, staffIndex?: number) {
  const measure = getMeasure(doc, measureNumber);
  if (!measure) return;
  const attributesList = Array.from(measure.getElementsByTagName('attributes'));
  const targetStaff = staffIndex ?? 1;
  attributesList.forEach((attributes) => {
    const clefs = Array.from(attributes.childNodes)
      .filter((child): child is XmlEl => child.nodeType === 1 && (child as XmlEl).tagName === 'clef');
    clefs.forEach((clef) => {
      const clefStaff = parseInt(clef.getAttribute('number') ?? '1', 10) || 1;
      if (clefStaff === targetStaff) clef.parentNode?.removeChild(clef);
    });
  });
}

function insertMeasureAfter(doc: XmlDocument, measureNumber: number) {
  const parts = Array.from(doc.getElementsByTagName('part'));
  parts.forEach((part) => {
    const measures = Array.from(part.childNodes)
      .filter((node): node is XmlEl => node.nodeType === 1 && (node as XmlEl).tagName === 'measure');
    const index = measures.findIndex((measure) => parseInt(measure.getAttribute('number') ?? '0', 10) === measureNumber);
    const measure = index >= 0 ? measures[index] : null;
    if (!measure) return;

    const clone = measure.cloneNode(true) as XmlEl;
    Array.from(clone.childNodes)
      .filter((node): node is XmlEl => (
        node.nodeType === 1
        && ['note', 'backup', 'forward', 'harmony', 'direction', 'barline'].includes((node as XmlEl).tagName)
      ))
      .forEach((node) => node.parentNode?.removeChild(node));

    const nextSibling = measures[index + 1] ?? null;
    part.insertBefore(clone, nextSibling);

    Array.from(part.childNodes)
      .filter((node): node is XmlEl => node.nodeType === 1 && (node as XmlEl).tagName === 'measure')
      .forEach((entry, measureIndex) => {
        entry.setAttribute('number', String(measureIndex + 1));
      });
  });
}

function deleteMeasure(doc: XmlDocument, measureNumber: number) {
  const parts = Array.from(doc.getElementsByTagName('part'));
  for (const part of parts) {
    const measure = Array.from(part.getElementsByTagName('measure')).find((entry) => parseInt(entry.getAttribute('number') ?? '0', 10) === measureNumber);
    if (measure) measure.parentNode?.removeChild(measure);
  }
}

function addLyric(doc: XmlDocument, command: Extract<ScoreCommand, { type: 'addLyric' }>) {
  const note = findNoteElement(doc, command);
  if (!note) return;
  const lyric = doc.createElement('lyric');
  if (command.syllabic) {
    const syllabic = doc.createElement('syllabic');
    syllabic.textContent = command.syllabic;
    lyric.appendChild(syllabic);
  }
  const text = doc.createElement('text');
  text.textContent = command.text;
  lyric.appendChild(text);
  note.appendChild(lyric);
}

function removeLyricLine(doc: XmlDocument, command: Extract<ScoreCommand, { type: 'removeLyricLine' }>) {
  const note = findNoteElement(doc, command);
  if (!note) return;
  const lyrics = Array.from(note.getElementsByTagName('lyric'));
  const matching = lyrics.find((lyric) => {
    const verse = parseInt(lyric.getAttribute('number') ?? '1', 10) || 1;
    return verse === command.verseNumber;
  });
  if (matching?.parentNode) matching.parentNode.removeChild(matching);
}

function removeDirection(
  doc: XmlDocument,
  measureNumber: number,
  text: string,
  staffIndex?: number,
  kind?: string,
) {
  const measure = getMeasure(doc, measureNumber);
  if (!measure) return;
  const directions = Array.from(measure.getElementsByTagName('direction'));
  const matching = directions.find((direction) => {
    const directionType = direction.getElementsByTagName('direction-type')[0];
    const firstElement = Array.from(directionType?.childNodes ?? []).find((node) => node.nodeType === 1) as XmlEl | undefined;
    if (!firstElement) return false;
    const currentStaff = parseInt(direction.getElementsByTagName('staff')[0]?.textContent ?? '0', 10) || undefined;
    return firstElement.textContent === text
      && (kind ? firstElement.tagName === kind : true)
      && (staffIndex != null ? currentStaff === staffIndex : true);
  });
  if (matching?.parentNode) matching.parentNode.removeChild(matching);
}

function addRehearsalMark(doc: XmlDocument, measureNumber: number, text: string) {
  const measure = getMeasure(doc, measureNumber);
  if (!measure) return;
  const direction = doc.createElement('direction');
  direction.setAttribute('placement', 'above');
  const directionType = doc.createElement('direction-type');
  const rehearsal = doc.createElement('rehearsal');
  rehearsal.textContent = text;
  directionType.appendChild(rehearsal);
  direction.appendChild(directionType);
  measure.insertBefore(direction, measure.firstChild);
}

function addWords(doc: XmlDocument, measureNumber: number, text: string, placement: 'above' | 'below' = 'above') {
  const measure = getMeasure(doc, measureNumber);
  if (!measure) return;
  const direction = doc.createElement('direction');
  direction.setAttribute('placement', placement);
  const directionType = doc.createElement('direction-type');
  const words = doc.createElement('words');
  words.textContent = text;
  directionType.appendChild(words);
  direction.appendChild(directionType);
  measure.insertBefore(direction, measure.firstChild);
}

function setPrintBreak(doc: XmlDocument, measureNumber: number, attr: 'new-system' | 'new-page', value: boolean) {
  const measure = getMeasure(doc, measureNumber);
  if (!measure) return;
  const print = getOrCreateDirectChild(doc, measure as XmlEl, 'print');
  print.setAttribute(attr, value ? 'yes' : 'no');
}

function findScorePart(doc: XmlDocument, partId: string) {
  return Array.from(doc.getElementsByTagName('score-part')).find((entry) => entry.getAttribute('id') === partId) ?? null;
}

function setPartName(doc: XmlDocument, partId: string, name: string) {
  const scorePart = findScorePart(doc, partId);
  if (!scorePart) return;
  getOrCreateDirectChild(doc, scorePart as XmlEl, 'part-name').textContent = name;
}

function setPartAbbreviation(doc: XmlDocument, partId: string, abbreviation: string) {
  const scorePart = findScorePart(doc, partId);
  if (!scorePart) return;
  getOrCreateDirectChild(doc, scorePart as XmlEl, 'part-abbreviation').textContent = abbreviation;
}

function setInstrumentName(doc: XmlDocument, partId: string, instrumentName: string) {
  const scorePart = findScorePart(doc, partId);
  if (!scorePart) return;
  const scoreInstrument = getOrCreateDirectChild(doc, scorePart as XmlEl, 'score-instrument');
  if (!scoreInstrument.getAttribute('id')) scoreInstrument.setAttribute('id', `${partId}-I1`);
  getOrCreateDirectChild(doc, scoreInstrument, 'instrument-name').textContent = instrumentName;
}

function setPartTranspose(doc: XmlDocument, partId: string, chromatic: number, diatonic?: number) {
  const part = Array.from(doc.getElementsByTagName('part')).find((entry) => entry.getAttribute('id') === partId);
  const measure = part?.getElementsByTagName('measure')[0];
  if (!measure) return;
  const attributes = getOrCreateDirectChild(doc, measure as XmlEl, 'attributes');
  const transpose = getOrCreateDirectChild(doc, attributes, 'transpose');
  getOrCreateDirectChild(doc, transpose, 'chromatic').textContent = String(chromatic);
  if (diatonic != null) getOrCreateDirectChild(doc, transpose, 'diatonic').textContent = String(diatonic);
}

function duplicateNote(doc: XmlDocument, locator: Extract<ScoreCommand, { type: 'duplicateNote' }>) {
  const note = findNoteElement(doc, locator);
  if (!note?.parentNode) return;
  const clone = note.cloneNode(true);
  const duration = parseInt(note.getElementsByTagName('duration')[0]?.textContent ?? '0', 10);
  const divisions = getDivisions(doc);
  if (duration <= 0) return;
  const rest = doc.createElement('note');
  rest.appendChild(doc.createElement('rest'));
  const durationEl = doc.createElement('duration');
  durationEl.textContent = String(duration);
  rest.appendChild(durationEl);
  const voiceEl = doc.createElement('voice');
  voiceEl.textContent = String(locator.voiceId);
  rest.appendChild(voiceEl);
  const typeEl = doc.createElement('type');
  typeEl.textContent = note.getElementsByTagName('type')[0]?.textContent ?? (duration >= divisions * 4 ? 'whole' : 'quarter');
  rest.appendChild(typeEl);
  const staffEl = doc.createElement('staff');
  staffEl.textContent = String(locator.staffIndex);
  rest.appendChild(staffEl);
  if (note.nextSibling) {
    note.parentNode.insertBefore(clone, note.nextSibling);
    note.parentNode.insertBefore(rest, clone.nextSibling);
  } else {
    note.parentNode.appendChild(clone);
    note.parentNode.appendChild(rest);
  }
}
