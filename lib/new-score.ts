export interface InstrumentDefinition {
  id: string;
  name: string;
  shortName?: string;
  family: string;
  staves: number;
  clefs: Array<{ sign: 'G' | 'F' | 'C'; line: number }>;
  chromaticTranspose?: number;
  diatonicTranspose?: number;
}

export interface NewScoreTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  instrumentIds: string[];
}

export interface KeySignatureOption {
  id: string;
  label: string;
  mode: 'major' | 'minor';
  fifths: number;
}

export interface TempoSettings {
  bpm: number;
  beatUnit: 'whole' | 'half' | 'quarter' | 'eighth';
  showMarking: boolean;
}

export interface PickupSettings {
  enabled: boolean;
  beats: number;
  beatType: number;
}

export interface NewScoreDraft {
  instrumentIds: string[];
  title: string;
  subtitle: string;
  composer: string;
  lyricist: string;
  copyright: string;
  keySignatureId: string;
  timeBeats: number;
  timeBeatType: number;
  tempo: TempoSettings;
  measureCount: number;
  pickup: PickupSettings;
}

export const INSTRUMENT_DEFINITIONS: InstrumentDefinition[] = [
  { id: 'piano', name: 'Piano', shortName: 'Pno.', family: 'Keyboards', staves: 2, clefs: [{ sign: 'G', line: 2 }, { sign: 'F', line: 4 }] },
  { id: 'organ', name: 'Organ', shortName: 'Org.', family: 'Keyboards', staves: 2, clefs: [{ sign: 'G', line: 2 }, { sign: 'F', line: 4 }] },
  { id: 'harp', name: 'Harp', family: 'Keyboards', staves: 2, clefs: [{ sign: 'G', line: 2 }, { sign: 'F', line: 4 }] },
  { id: 'violin', name: 'Violin', shortName: 'Vln.', family: 'Strings', staves: 1, clefs: [{ sign: 'G', line: 2 }] },
  { id: 'viola', name: 'Viola', shortName: 'Vla.', family: 'Strings', staves: 1, clefs: [{ sign: 'C', line: 3 }] },
  { id: 'cello', name: 'Cello', shortName: 'Vc.', family: 'Strings', staves: 1, clefs: [{ sign: 'F', line: 4 }] },
  { id: 'double-bass', name: 'Double Bass', shortName: 'Db.', family: 'Strings', staves: 1, clefs: [{ sign: 'F', line: 4 }] },
  { id: 'flute', name: 'Flute', shortName: 'Fl.', family: 'Woodwinds', staves: 1, clefs: [{ sign: 'G', line: 2 }] },
  { id: 'oboe', name: 'Oboe', shortName: 'Ob.', family: 'Woodwinds', staves: 1, clefs: [{ sign: 'G', line: 2 }] },
  { id: 'clarinet-bb', name: 'Clarinet in Bb', shortName: 'Cl.', family: 'Woodwinds', staves: 1, clefs: [{ sign: 'G', line: 2 }], chromaticTranspose: 2, diatonicTranspose: 1 },
  { id: 'bassoon', name: 'Bassoon', shortName: 'Bsn.', family: 'Woodwinds', staves: 1, clefs: [{ sign: 'F', line: 4 }] },
  { id: 'sax-alto-eb', name: 'Alto Saxophone in Eb', shortName: 'A. Sax.', family: 'Woodwinds', staves: 1, clefs: [{ sign: 'G', line: 2 }], chromaticTranspose: 9, diatonicTranspose: 6 },
  { id: 'trumpet-bb', name: 'Trumpet in Bb', shortName: 'Tpt.', family: 'Brass', staves: 1, clefs: [{ sign: 'G', line: 2 }], chromaticTranspose: 2, diatonicTranspose: 1 },
  { id: 'horn-f', name: 'Horn in F', shortName: 'Hn.', family: 'Brass', staves: 1, clefs: [{ sign: 'G', line: 2 }], chromaticTranspose: 7, diatonicTranspose: 4 },
  { id: 'trombone', name: 'Trombone', shortName: 'Tbn.', family: 'Brass', staves: 1, clefs: [{ sign: 'F', line: 4 }] },
  { id: 'tuba', name: 'Tuba', family: 'Brass', staves: 1, clefs: [{ sign: 'F', line: 4 }] },
  { id: 'soprano', name: 'Soprano', shortName: 'S.', family: 'Voices', staves: 1, clefs: [{ sign: 'G', line: 2 }] },
  { id: 'alto', name: 'Alto', shortName: 'A.', family: 'Voices', staves: 1, clefs: [{ sign: 'G', line: 2 }] },
  { id: 'tenor', name: 'Tenor', shortName: 'T.', family: 'Voices', staves: 1, clefs: [{ sign: 'G', line: 2 }] },
  { id: 'bass', name: 'Bass', shortName: 'B.', family: 'Voices', staves: 1, clefs: [{ sign: 'F', line: 4 }] },
  { id: 'guitar', name: 'Guitar', shortName: 'Gtr.', family: 'Plucked', staves: 1, clefs: [{ sign: 'G', line: 2 }] },
];

export const NEW_SCORE_TEMPLATES: NewScoreTemplate[] = [
  { id: 'solo-piano', name: 'Solo Piano', category: 'Solo', description: 'Grand staff piano score.', instrumentIds: ['piano'] },
  { id: 'piano-voice', name: 'Voice + Piano', category: 'Solo', description: 'Lead vocal with piano accompaniment.', instrumentIds: ['soprano', 'piano'] },
  { id: 'string-quartet', name: 'String Quartet', category: 'Chamber', description: 'Violin I, Violin II, Viola, Cello.', instrumentIds: ['violin', 'violin', 'viola', 'cello'] },
  { id: 'piano-trio', name: 'Piano Trio', category: 'Chamber', description: 'Piano, Violin, and Cello.', instrumentIds: ['piano', 'violin', 'cello'] },
  { id: 'satb-choir', name: 'SATB Choir', category: 'Choir', description: 'Four-part mixed choir.', instrumentIds: ['soprano', 'alto', 'tenor', 'bass'] },
  { id: 'wind-quintet', name: 'Wind Quintet', category: 'Ensemble', description: 'Flute, Oboe, Clarinet, Horn, Bassoon.', instrumentIds: ['flute', 'oboe', 'clarinet-bb', 'horn-f', 'bassoon'] },
  { id: 'brass-quartet', name: 'Brass Quartet', category: 'Ensemble', description: 'Two trumpets, horn, trombone.', instrumentIds: ['trumpet-bb', 'trumpet-bb', 'horn-f', 'trombone'] },
  { id: 'jazz-combo', name: 'Jazz Combo', category: 'Band', description: 'Alto sax, trumpet, piano, bass, guitar.', instrumentIds: ['sax-alto-eb', 'trumpet-bb', 'piano', 'double-bass', 'guitar'] },
];

export const KEY_SIGNATURE_OPTIONS: KeySignatureOption[] = [
  { id: 'c-major', label: 'C major', mode: 'major', fifths: 0 },
  { id: 'g-major', label: 'G major', mode: 'major', fifths: 1 },
  { id: 'd-major', label: 'D major', mode: 'major', fifths: 2 },
  { id: 'a-major', label: 'A major', mode: 'major', fifths: 3 },
  { id: 'e-major', label: 'E major', mode: 'major', fifths: 4 },
  { id: 'b-major', label: 'B major', mode: 'major', fifths: 5 },
  { id: 'f-sharp-major', label: 'F# major', mode: 'major', fifths: 6 },
  { id: 'c-sharp-major', label: 'C# major', mode: 'major', fifths: 7 },
  { id: 'f-major', label: 'F major', mode: 'major', fifths: -1 },
  { id: 'b-flat-major', label: 'Bb major', mode: 'major', fifths: -2 },
  { id: 'e-flat-major', label: 'Eb major', mode: 'major', fifths: -3 },
  { id: 'a-flat-major', label: 'Ab major', mode: 'major', fifths: -4 },
  { id: 'd-flat-major', label: 'Db major', mode: 'major', fifths: -5 },
  { id: 'g-flat-major', label: 'Gb major', mode: 'major', fifths: -6 },
  { id: 'c-flat-major', label: 'Cb major', mode: 'major', fifths: -7 },
  { id: 'a-minor', label: 'A minor', mode: 'minor', fifths: 0 },
  { id: 'e-minor', label: 'E minor', mode: 'minor', fifths: 1 },
  { id: 'b-minor', label: 'B minor', mode: 'minor', fifths: 2 },
  { id: 'f-sharp-minor', label: 'F# minor', mode: 'minor', fifths: 3 },
  { id: 'c-sharp-minor', label: 'C# minor', mode: 'minor', fifths: 4 },
  { id: 'g-sharp-minor', label: 'G# minor', mode: 'minor', fifths: 5 },
  { id: 'd-sharp-minor', label: 'D# minor', mode: 'minor', fifths: 6 },
  { id: 'a-sharp-minor', label: 'A# minor', mode: 'minor', fifths: 7 },
  { id: 'd-minor', label: 'D minor', mode: 'minor', fifths: -1 },
  { id: 'g-minor', label: 'G minor', mode: 'minor', fifths: -2 },
  { id: 'c-minor', label: 'C minor', mode: 'minor', fifths: -3 },
  { id: 'f-minor', label: 'F minor', mode: 'minor', fifths: -4 },
  { id: 'b-flat-minor', label: 'Bb minor', mode: 'minor', fifths: -5 },
  { id: 'e-flat-minor', label: 'Eb minor', mode: 'minor', fifths: -6 },
  { id: 'a-flat-minor', label: 'Ab minor', mode: 'minor', fifths: -7 },
];

export const NEW_SCORE_FAMILIES = ['All', ...new Set(INSTRUMENT_DEFINITIONS.map((instrument) => instrument.family))];
export const TEMPLATE_CATEGORIES = [...new Set(NEW_SCORE_TEMPLATES.map((template) => template.category))];

export function createDefaultNewScoreDraft(): NewScoreDraft {
  return {
    instrumentIds: [],
    title: '',
    subtitle: '',
    composer: '',
    lyricist: '',
    copyright: '',
    keySignatureId: 'c-major',
    timeBeats: 4,
    timeBeatType: 4,
    tempo: {
      bpm: 120,
      beatUnit: 'quarter',
      showMarking: false,
    },
    measureCount: 32,
    pickup: {
      enabled: false,
      beats: 1,
      beatType: 4,
    },
  };
}

export function buildNewScoreFilename(title: string) {
  const trimmed = title.trim();
  if (!trimmed) return 'Untitled score.musicxml';
  const safe = trimmed.replace(/[\\/:*?"<>|]+/g, '').trim();
  return `${safe || 'Untitled score'}.musicxml`;
}

export function getInstrumentDefinition(id: string) {
  return INSTRUMENT_DEFINITIONS.find((instrument) => instrument.id === id) ?? null;
}

function escapeXml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function clampInteger(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function buildPartId(index: number) {
  return `P${index + 1}`;
}

function buildScoreInstrumentName(instrument: InstrumentDefinition, occurrence: number, totalOccurrences: number) {
  if (totalOccurrences <= 1) return instrument.name;
  return `${instrument.name} ${occurrence}`;
}

function beatUnitToDivisions(beatUnit: number, divisions: number) {
  return divisions * (4 / beatUnit);
}

function describeDuration(durationDivisions: number, divisions: number) {
  const quarter = divisions;
  const candidates = [
    { value: quarter * 4, type: 'whole', dotted: false },
    { value: quarter * 3, type: 'half', dotted: true },
    { value: quarter * 2, type: 'half', dotted: false },
    { value: Math.round(quarter * 1.5), type: 'quarter', dotted: true },
    { value: quarter, type: 'quarter', dotted: false },
    { value: Math.round(quarter * 0.75), type: 'eighth', dotted: true },
    { value: quarter / 2, type: 'eighth', dotted: false },
    { value: Math.round(quarter * 0.375), type: '16th', dotted: true },
    { value: quarter / 4, type: '16th', dotted: false },
  ];
  return candidates.find((candidate) => candidate.value === durationDivisions) ?? { type: 'quarter', dotted: false };
}

function buildRestXml(durationDivisions: number, divisions: number, staffIndex: number, fullMeasure: boolean) {
  const duration = describeDuration(durationDivisions, divisions);
  return [
    '<note>',
    '<rest/>',
    `<duration>${durationDivisions}</duration>`,
    '<voice>1</voice>',
    duration.type ? `<type>${duration.type}</type>` : '',
    duration.dotted ? '<dot/>' : '',
    `<staff>${staffIndex}</staff>`,
    '</note>',
  ].filter(Boolean).join('');
}

function buildMeasureXml(params: {
  measureNumber: number;
  implicit?: boolean;
  includeAttributes?: boolean;
  durationDivisions: number;
  fullMeasure: boolean;
  divisions: number;
  instrument: InstrumentDefinition;
  key: KeySignatureOption;
  timeBeats: number;
  timeBeatType: number;
  tempo?: TempoSettings;
}) {
  const {
    measureNumber,
    implicit = false,
    includeAttributes = false,
    durationDivisions,
    fullMeasure,
    divisions,
    instrument,
    key,
    timeBeats,
    timeBeatType,
    tempo,
  } = params;

  const attributes = includeAttributes
    ? [
      '<attributes>',
      `<divisions>${divisions}</divisions>`,
      `<key><fifths>${key.fifths}</fifths><mode>${key.mode}</mode></key>`,
      `<time><beats>${timeBeats}</beats><beat-type>${timeBeatType}</beat-type></time>`,
      instrument.staves > 1 ? `<staves>${instrument.staves}</staves>` : '',
      ...instrument.clefs.map((clef, index) => [
        `<clef${instrument.staves > 1 ? ` number="${index + 1}"` : ''}>`,
        `<sign>${clef.sign}</sign>`,
        `<line>${clef.line}</line>`,
        '</clef>',
      ].join('')),
      instrument.chromaticTranspose != null || instrument.diatonicTranspose != null
        ? [
          '<transpose>',
          instrument.diatonicTranspose != null ? `<diatonic>${instrument.diatonicTranspose}</diatonic>` : '',
          instrument.chromaticTranspose != null ? `<chromatic>${instrument.chromaticTranspose}</chromatic>` : '',
          '</transpose>',
        ].join('')
        : '',
      '</attributes>',
    ].filter(Boolean).join('')
    : '';

  const tempoDirection = tempo
    ? [
      '<direction placement="above">',
      tempo.showMarking
        ? [
          '<direction-type>',
          '<metronome parentheses="no">',
          `<beat-unit>${tempo.beatUnit}</beat-unit>`,
          `<per-minute>${tempo.bpm}</per-minute>`,
          '</metronome>',
          '</direction-type>',
        ].join('')
        : '',
      `<sound tempo="${tempo.bpm}"/>`,
      '<staff>1</staff>',
      '</direction>',
    ].join('')
    : '';

  const content: string[] = [attributes, tempoDirection].filter(Boolean);
  for (let staffIndex = 1; staffIndex <= instrument.staves; staffIndex += 1) {
    if (staffIndex > 1) {
      content.push(`<backup><duration>${durationDivisions}</duration></backup>`);
    }
    content.push(buildRestXml(durationDivisions, divisions, staffIndex, fullMeasure));
  }

  return `<measure number="${measureNumber}"${implicit ? ' implicit="yes"' : ''}>${content.join('')}</measure>`;
}

export function createNewScoreXml(draft: NewScoreDraft) {
  const key = KEY_SIGNATURE_OPTIONS.find((option) => option.id === draft.keySignatureId) ?? KEY_SIGNATURE_OPTIONS[0];
  const instruments = draft.instrumentIds
    .map((id) => getInstrumentDefinition(id))
    .filter((instrument): instrument is InstrumentDefinition => Boolean(instrument));
  if (instruments.length === 0) {
    throw new Error('At least one instrument is required to create a score.');
  }

  const timeBeats = clampInteger(draft.timeBeats, 1, 32);
  const timeBeatType = [1, 2, 4, 8, 16].includes(draft.timeBeatType) ? draft.timeBeatType : 4;
  const measureCount = clampInteger(draft.measureCount, 1, 256);
  const tempoBpm = clampInteger(draft.tempo.bpm, 20, 320);
  const divisions = 8;
  const fullMeasureDuration = Math.round(beatUnitToDivisions(timeBeatType, divisions) * timeBeats);
  const pickupBeats = clampInteger(draft.pickup.beats, 1, 32);
  const pickupBeatType = [1, 2, 4, 8, 16].includes(draft.pickup.beatType) ? draft.pickup.beatType : 4;
  const pickupDuration = Math.round(beatUnitToDivisions(pickupBeatType, divisions) * pickupBeats);
  const pickupEnabled = draft.pickup.enabled && pickupDuration > 0 && pickupDuration < fullMeasureDuration;
  const title = draft.title.trim();
  const subtitle = draft.subtitle.trim();
  const composer = draft.composer.trim();
  const lyricist = draft.lyricist.trim();
  const copyright = draft.copyright.trim();

  const partOccurrenceMap = new Map<string, number>();
  const partTotals = instruments.reduce<Record<string, number>>((acc, instrument) => {
    acc[instrument.id] = (acc[instrument.id] ?? 0) + 1;
    return acc;
  }, {});

  const partListXml = instruments.map((instrument, index) => {
    const nextOccurrence = (partOccurrenceMap.get(instrument.id) ?? 0) + 1;
    partOccurrenceMap.set(instrument.id, nextOccurrence);
    const partName = buildScoreInstrumentName(instrument, nextOccurrence, partTotals[instrument.id] ?? 1);
    const partId = buildPartId(index);
    return [
      `<score-part id="${partId}">`,
      `<part-name>${escapeXml(partName)}</part-name>`,
      instrument.shortName ? `<part-abbreviation>${escapeXml(instrument.shortName)}</part-abbreviation>` : '',
      `<score-instrument id="${partId}-I1"><instrument-name>${escapeXml(instrument.name)}</instrument-name></score-instrument>`,
      '</score-part>',
    ].filter(Boolean).join('');
  }).join('');

  partOccurrenceMap.clear();
  const partsXml = instruments.map((instrument, index) => {
    const nextOccurrence = (partOccurrenceMap.get(instrument.id) ?? 0) + 1;
    partOccurrenceMap.set(instrument.id, nextOccurrence);
    const partId = buildPartId(index);
    const measures: string[] = [];
    if (pickupEnabled) {
      measures.push(buildMeasureXml({
        measureNumber: 1,
        implicit: true,
        includeAttributes: true,
        durationDivisions: pickupDuration,
        fullMeasure: false,
        divisions,
        instrument,
        key,
        timeBeats,
        timeBeatType,
        tempo: {
          bpm: tempoBpm,
          beatUnit: draft.tempo.beatUnit,
          showMarking: draft.tempo.showMarking,
        },
      }));
    }

    for (let measureIndex = 0; measureIndex < measureCount; measureIndex += 1) {
      measures.push(buildMeasureXml({
        measureNumber: pickupEnabled ? measureIndex + 2 : measureIndex + 1,
        includeAttributes: !pickupEnabled && measureIndex === 0,
        durationDivisions: fullMeasureDuration,
        fullMeasure: true,
        divisions,
        instrument,
        key,
        timeBeats,
        timeBeatType,
        tempo: !pickupEnabled && measureIndex === 0
          ? {
            bpm: tempoBpm,
            beatUnit: draft.tempo.beatUnit,
            showMarking: draft.tempo.showMarking,
          }
          : undefined,
      }));
    }

    return `<part id="${partId}">${measures.join('')}</part>`;
  }).join('');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<score-partwise version="3.1">',
    title || subtitle
      ? [
        '<work>',
        title ? `<work-title>${escapeXml(title)}</work-title>` : '',
        subtitle ? `<work-number>${escapeXml(subtitle)}</work-number>` : '',
        '</work>',
      ].filter(Boolean).join('')
      : '',
    composer || lyricist || copyright
      ? [
        '<identification>',
        composer ? `<creator type="composer">${escapeXml(composer)}</creator>` : '',
        lyricist ? `<creator type="lyricist">${escapeXml(lyricist)}</creator>` : '',
        copyright ? `<rights>${escapeXml(copyright)}</rights>` : '',
        '</identification>',
      ].filter(Boolean).join('')
      : '',
    `<part-list>${partListXml}</part-list>`,
    partsXml,
    '</score-partwise>',
  ].filter(Boolean).join('');
}
