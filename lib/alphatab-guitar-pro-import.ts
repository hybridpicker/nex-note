type AlphaTabScore = {
  title?: string;
  subTitle?: string;
  subtitle?: string;
  artist?: string;
  album?: string;
  music?: string;
  words?: string;
  copyright?: string;
  tracks?: AlphaTabTrack[];
  masterBars?: AlphaTabMasterBar[];
};

type AlphaTabTrack = {
  index?: number;
  name?: string;
  shortName?: string;
  isVisibleOnMultiTrack?: boolean;
  staves?: AlphaTabStaff[];
};

type AlphaTabStaff = {
  index?: number;
  isStringed?: boolean;
  showTablature?: boolean;
  showStandardNotation?: boolean;
  tuning?: number[];
  tuningName?: string;
  bars?: AlphaTabBar[];
};

type AlphaTabBar = {
  index?: number;
  voices?: AlphaTabVoice[];
};

type AlphaTabVoice = {
  index?: number;
  isEmpty?: boolean;
  isRestOnly?: boolean;
  beats?: AlphaTabBeat[];
};

type AlphaTabBeat = {
  index?: number;
  duration?: number;
  dots?: number;
  displayDuration?: number;
  displayStart?: number;
  graceType?: number;
  isRest?: boolean;
  notes?: AlphaTabNote[];
};

type BeamValue = 'begin' | 'continue' | 'end';
type BeatBeamAnnotations = Map<number, BeamValue>;
type HammerPullTechnique = 'hammer-on' | 'pull-off';
type HammerPullType = 'start' | 'stop';
type HammerPullAnnotation = {
  number: number;
  technique: HammerPullTechnique;
  type: HammerPullType;
};

type AlphaTabBendPoint = {
  offset?: number;
  value?: number;
};

type AlphaTabNote = {
  index?: number;
  fret?: number;
  string?: number;
  realValue?: number;
  isStringed?: boolean;
  isDead?: boolean;
  isPalmMute?: boolean;
  isLetRing?: boolean;
  isTieOrigin?: boolean;
  isTieDestination?: boolean;
  isHammerPullOrigin?: boolean;
  hasEffectSlur?: boolean;
  isEffectSlurOrigin?: boolean;
  hammerPullDestination?: AlphaTabNote | null;
  hammerPullOrigin?: AlphaTabNote | null;
  bendType?: number;
  bendStyle?: number;
  bendPoints?: AlphaTabBendPoint[] | null;
  maxBendPoint?: AlphaTabBendPoint | null;
  hasBend?: boolean;
  isContinuedBend?: boolean;
  slideInType?: number;
  slideOutType?: number;
  harmonicType?: number;
  harmonicValue?: number;
};

type AlphaTabMasterBar = {
  index?: number;
  timeSignatureNumerator?: number;
  timeSignatureDenominator?: number;
  tripletFeel?: number;
  isRepeatStart?: boolean;
  repeatCount?: number;
  isDoubleBar?: boolean;
};

const DIVISIONS = 960;
const DEFAULT_GUITAR_TUNING = [64, 59, 55, 50, 45, 40];
const GUITAR_PRO_STAFF_DISTANCE = 64;

const BEND_TYPE_NAMES: Record<number, string> = {
  0: 'None',
  1: 'Custom',
  2: 'Bend',
  3: 'Release',
  4: 'BendRelease',
  5: 'Hold',
  6: 'Prebend',
  7: 'PrebendBend',
  8: 'PrebendRelease',
};

const BEND_STYLE_NAMES: Record<number, string> = {
  0: 'Default',
  1: 'Gradual',
  2: 'Fast',
};

const SLIDE_IN_TYPE_NAMES: Record<number, string> = {
  0: 'None',
  1: 'IntoFromBelow',
  2: 'IntoFromAbove',
};

const SLIDE_OUT_TYPE_NAMES: Record<number, string> = {
  0: 'None',
  1: 'Shift',
  2: 'Legato',
  3: 'OutUp',
  4: 'OutDown',
  5: 'PickSlideDown',
  6: 'PickSlideUp',
};

const HARMONIC_TYPE_NAMES: Record<number, string> = {
  0: 'None',
  1: 'Natural',
  2: 'Artificial',
  3: 'Pinch',
  4: 'Tap',
  5: 'Semi',
  6: 'Feedback',
};

export async function convertGuitarProBufferToTabbedMusicXml(buffer: Buffer | Uint8Array) {
  const alphaTab = await import('@coderline/alphatab');
  const logger = alphaTab.Logger as { logLevel?: number } | undefined;
  const previousLogLevel = logger?.logLevel;
  if (logger && typeof alphaTab.LogLevel?.Error === 'number') logger.logLevel = alphaTab.LogLevel.Error;
  try {
    const score = alphaTab.importer.ScoreLoader.loadScoreFromBytes(new Uint8Array(buffer), new alphaTab.Settings());
    return scoreToTabbedMusicXml(score);
  } finally {
    if (logger && previousLogLevel != null) logger.logLevel = previousLogLevel;
  }
}

export function scoreToTabbedMusicXml(score: AlphaTabScore) {
  const tracks = (score.tracks ?? [])
    .filter((track) => track.isVisibleOnMultiTrack !== false)
    .map((track, index) => ({ track, id: `P${index + 1}` }))
    .filter(({ track }) => getPrimaryStringedStaff(track));

  if (tracks.length === 0) {
    throw new Error('Guitar Pro file did not contain a stringed TAB staff.');
  }

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<score-partwise version="3.1">',
    scoreDefaultsXml(),
    scoreCreditsXml(score),
    scoreWorkAndIdentification(score),
    '  <part-list>',
    ...tracks.map(({ track, id }) => scorePartXml(track, id)),
    '  </part-list>',
    ...tracks.map(({ track, id }) => partXml(track, id, score.masterBars ?? [])),
    '</score-partwise>',
  ].filter(Boolean).join('\n');
}

function getPrimaryStringedStaff(track: AlphaTabTrack) {
  return (track.staves ?? []).find((staff) => staff.isStringed || staff.showTablature || (staff.tuning?.length ?? 0) > 0);
}

function scoreWorkAndIdentification(score: AlphaTabScore) {
  const lines: string[] = [];
  if (score.title) {
    lines.push('  <work>');
    lines.push(`    <work-title>${escapeXml(score.title)}</work-title>`);
    lines.push('  </work>');
  }

  const creators = [
    ['composer', score.music],
    ['lyricist', score.words],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));

  if (creators.length || score.copyright) {
    lines.push('  <identification>');
    for (const [type, value] of creators) {
      lines.push(`    <creator type="${type}">${escapeXml(value)}</creator>`);
    }
    if (score.copyright) {
      lines.push(`    <rights>${escapeXml(score.copyright)}</rights>`);
    }
    lines.push('  </identification>');
  }

  return lines.join('\n');
}

function scoreDefaultsXml() {
  return [
    '  <defaults>',
    '    <scaling>',
    '      <millimeters>7.0</millimeters>',
    '      <tenths>40</tenths>',
    '    </scaling>',
    '    <page-layout>',
    '      <page-height>1683</page-height>',
    '      <page-width>1190</page-width>',
    '      <page-margins type="both">',
    '        <left-margin>70</left-margin>',
    '        <right-margin>50</right-margin>',
    '        <top-margin>55</top-margin>',
    '        <bottom-margin>55</bottom-margin>',
    '      </page-margins>',
    '    </page-layout>',
    '    <system-layout>',
    '      <system-margins>',
    '        <left-margin>0</left-margin>',
    '        <right-margin>0</right-margin>',
    '      </system-margins>',
    '      <system-distance>120</system-distance>',
    '      <top-system-distance>95</top-system-distance>',
    '    </system-layout>',
    '    <staff-layout>',
    `      <staff-distance>${GUITAR_PRO_STAFF_DISTANCE}</staff-distance>`,
    '    </staff-layout>',
    '  </defaults>',
  ].join('\n');
}

function scoreCreditsXml(score: AlphaTabScore) {
  const title = score.title?.trim();
  const subtitle = (score.subTitle || score.subtitle || score.artist)?.trim();
  const lines: string[] = [];
  if (title) {
    lines.push('  <credit page="1">');
    lines.push('    <credit-type>title</credit-type>');
    lines.push(`    <credit-words default-x="595" default-y="1580" justify="center" valign="top" font-size="28">${escapeXml(title)}</credit-words>`);
    lines.push('  </credit>');
  }
  if (subtitle) {
    lines.push('  <credit page="1">');
    lines.push('    <credit-type>subtitle</credit-type>');
    lines.push(`    <credit-words default-x="595" default-y="1515" justify="center" valign="top" font-size="14">${escapeXml(subtitle)}</credit-words>`);
    lines.push('  </credit>');
  }
  return lines.join('\n');
}

function scorePartXml(track: AlphaTabTrack, id: string) {
  const name = track.name || 'Guitar';
  const shortName = track.shortName || abbreviateTrackName(name);
  return [
    `    <score-part id="${id}">`,
    `      <part-name>${escapeXml(name)}</part-name>`,
    `      <part-abbreviation>${escapeXml(shortName)}</part-abbreviation>`,
    '      <score-instrument id="' + id + '-I1">',
    `        <instrument-name>${escapeXml(name)}</instrument-name>`,
    '      </score-instrument>',
    '      <midi-instrument id="' + id + '-I1">',
    '        <midi-channel>1</midi-channel>',
    '        <midi-program>25</midi-program>',
    '      </midi-instrument>',
    '    </score-part>',
  ].join('\n');
}

function partXml(track: AlphaTabTrack, id: string, masterBars: AlphaTabMasterBar[]) {
  const staff = getPrimaryStringedStaff(track);
  if (!staff) return '';

  const measures = staff.bars ?? [];
  const hammerPullAnnotations = computeHammerPullAnnotations(measures.flatMap((bar) => getPrimaryVoice(bar)?.beats ?? []));
  return [
    `  <part id="${id}">`,
    ...measures.map((bar, index) => measureXml(bar, masterBars[index], masterBars[index - 1], staff, index, hammerPullAnnotations)),
    '  </part>',
  ].join('\n');
}

function measureXml(
  bar: AlphaTabBar,
  masterBar: AlphaTabMasterBar | undefined,
  previousMasterBar: AlphaTabMasterBar | undefined,
  staff: AlphaTabStaff,
  index: number,
  hammerPullAnnotations: Map<AlphaTabNote, HammerPullAnnotation[]>,
) {
  const number = index + 1;
  const primaryVoice = getPrimaryVoice(bar);
  const beats = primaryVoice?.beats ?? [];
  const beamAnnotations = computeBeamAnnotations(beats, masterBar);
  const writtenDuration = beats
    .reduce((sum, beat) => sum + beatDurationTicks(beat), 0);
  const backupDuration = writtenDuration || measureDurationTicks(masterBar);

  const lines = [`    <measure number="${number}">`];
  lines.push(...measurePrint().map((line) => `      ${line}`));
  lines.push(...measureAttributes(masterBar, previousMasterBar, staff, index === 0).map((line) => `      ${line}`));
  lines.push(...measureSwingDirection(masterBar, previousMasterBar).map((line) => `      ${line}`));
  lines.push(...beats.flatMap((beat) => beatNotesXml(beat, staff, 1, 1, beamAnnotations.get(beat) ?? new Map(), hammerPullAnnotations)).map((line) => `      ${line}`));
  if (backupDuration > 0) {
    lines.push('      <backup>');
    lines.push(`        <duration>${backupDuration}</duration>`);
    lines.push('      </backup>');
  }
  lines.push(...beats.flatMap((beat) => beatNotesXml(beat, staff, 2, 5, new Map(), hammerPullAnnotations)).map((line) => `      ${line}`));
  if (masterBar?.isDoubleBar || masterBar?.repeatCount) {
    lines.push('      <barline location="right">');
    lines.push(`        <bar-style>${masterBar.isDoubleBar ? 'light-light' : 'regular'}</bar-style>`);
    if (masterBar.repeatCount) {
      lines.push(`        <repeat direction="backward" times="${masterBar.repeatCount}"/>`);
    }
    lines.push('      </barline>');
  }
  lines.push('    </measure>');
  return lines.join('\n');
}

function measurePrint() {
  return [
    '<print>',
    '  <staff-layout>',
    `    <staff-distance>${GUITAR_PRO_STAFF_DISTANCE}</staff-distance>`,
    '  </staff-layout>',
    '</print>',
  ];
}

function measureAttributes(
  masterBar: AlphaTabMasterBar | undefined,
  previousMasterBar: AlphaTabMasterBar | undefined,
  staff: AlphaTabStaff,
  includeStaticAttributes: boolean,
) {
  const lines = ['<attributes>'];
  lines.push(`  <divisions>${DIVISIONS}</divisions>`);
  if (masterBar && shouldWriteTimeSignature(masterBar, previousMasterBar)) {
    lines.push('  <time>');
    lines.push(`    <beats>${safePositiveInt(masterBar.timeSignatureNumerator, 4)}</beats>`);
    lines.push(`    <beat-type>${safePositiveInt(masterBar.timeSignatureDenominator, 4)}</beat-type>`);
    lines.push('  </time>');
  }
  if (includeStaticAttributes) {
    lines.push('  <staves>2</staves>');
    lines.push('  <staff-details number="2">');
    lines.push('    <staff-type>tab</staff-type>');
    lines.push(`    <staff-lines>${stringCount(staff)}</staff-lines>`);
    for (const tuning of staffTuningXml(staff)) lines.push(`    ${tuning}`);
    lines.push('  </staff-details>');
    lines.push('  <clef number="1">');
    lines.push('    <sign>G</sign>');
    lines.push('    <line>2</line>');
    lines.push('  </clef>');
    lines.push('  <clef number="2">');
    lines.push('    <sign>TAB</sign>');
    lines.push('    <line>5</line>');
    lines.push('  </clef>');
  }
  lines.push('</attributes>');
  return lines;
}

function shouldWriteTimeSignature(masterBar: AlphaTabMasterBar, previousMasterBar: AlphaTabMasterBar | undefined) {
  if (!previousMasterBar) return true;
  return safePositiveInt(masterBar.timeSignatureNumerator, 4) !== safePositiveInt(previousMasterBar.timeSignatureNumerator, 4)
    || safePositiveInt(masterBar.timeSignatureDenominator, 4) !== safePositiveInt(previousMasterBar.timeSignatureDenominator, 4);
}

function measureSwingDirection(masterBar: AlphaTabMasterBar | undefined, previousMasterBar: AlphaTabMasterBar | undefined) {
  const current = safeNonNegativeInt(masterBar?.tripletFeel, 0);
  const previous = safeNonNegativeInt(previousMasterBar?.tripletFeel, 0);
  if (current === previous) return [];
  if (current === 0) {
    return [
      '<direction directive="yes" placement="above">',
      '  <direction-type><words>Straight</words></direction-type>',
      '  <sound><swing><straight/></swing></sound>',
      '  <staff>1</staff>',
      '</direction>',
    ];
  }

  const swing = tripletFeelToSwing(current);
  if (!swing) return [];
  return [
    '<direction directive="yes" placement="above">',
    `  <direction-type><words>${swing.type === '16th' ? 'Swing 16ths' : 'Swing'}</words></direction-type>`,
    '  <sound>',
    '    <swing>',
    `      <first>${swing.first}</first>`,
    `      <second>${swing.second}</second>`,
    `      <swing-type>${swing.type}</swing-type>`,
    '    </swing>',
    '  </sound>',
    '  <staff>1</staff>',
    '</direction>',
  ];
}

function tripletFeelToSwing(tripletFeel: number) {
  switch (tripletFeel) {
    case 1: return { first: 2, second: 1, type: '16th' };
    case 2: return { first: 2, second: 1, type: 'eighth' };
    case 3: return { first: 3, second: 1, type: '16th' };
    case 4: return { first: 3, second: 1, type: 'eighth' };
    case 5: return { first: 1, second: 3, type: '16th' };
    case 6: return { first: 1, second: 3, type: 'eighth' };
    default: return null;
  }
}

function staffTuningXml(staff: AlphaTabStaff) {
  const tuning = normalizedTuning(staff);
  return tuning.slice().reverse().map((midi, index) => {
    const pitch = midiToPitch(midi);
    return [
      `<staff-tuning line="${index + 1}">`,
      `<tuning-step>${pitch.step}</tuning-step>`,
      pitch.alter ? `<tuning-alter>${pitch.alter}</tuning-alter>` : '',
      `<tuning-octave>${pitch.octave}</tuning-octave>`,
      '</staff-tuning>',
    ].filter(Boolean).join('');
  });
}

function getPrimaryVoice(bar: AlphaTabBar) {
  return (bar.voices ?? []).find((voice) => !voice.isEmpty && !voice.isRestOnly)
    ?? (bar.voices ?? []).find((voice) => !voice.isEmpty)
    ?? (bar.voices ?? [])[0];
}

function beatNotesXml(
  beat: AlphaTabBeat,
  staff: AlphaTabStaff,
  staffNumber: 1 | 2,
  voice: number,
  beams: BeatBeamAnnotations,
  hammerPullAnnotations: Map<AlphaTabNote, HammerPullAnnotation[]>,
) {
  const duration = beatDurationTicks(beat);
  const type = durationType(beat.duration);
  const notes = (beat.notes ?? []).filter((note) => isPlayableNote(note));

  if (beat.isRest || notes.length === 0) {
    return noteXml({ duration, type, staffNumber, voice, rest: true, dots: safeNonNegativeInt(beat.dots, 0), beams: new Map() });
  }

  return notes.flatMap((note, index) => noteXml({
    duration,
    type,
    staffNumber,
    voice,
    note,
    staff,
    grace: isGraceBeat(beat),
    chord: index > 0,
    dots: safeNonNegativeInt(beat.dots, 0),
    beams: index === 0 ? beams : new Map(),
    hammerPullAnnotations: hammerPullAnnotations.get(note) ?? [],
  }));
}

function noteXml(options: {
  duration: number;
  type: string;
  staffNumber: 1 | 2;
  voice: number;
  dots: number;
  rest?: boolean;
  chord?: boolean;
  grace?: boolean;
  note?: AlphaTabNote;
  staff?: AlphaTabStaff;
  beams: BeatBeamAnnotations;
  hammerPullAnnotations?: HammerPullAnnotation[];
}) {
  const lines = ['<note>'];
  if (options.chord) lines.push('  <chord/>');
  if (options.grace) lines.push('  <grace slash="yes"/>');
  if (options.rest || !options.note) {
    lines.push('  <rest/>');
  } else {
    const pitch = midiToPitch(safeNumber(options.note.realValue, 60));
    lines.push('  <pitch>');
    lines.push(`    <step>${pitch.step}</step>`);
    if (pitch.alter) lines.push(`    <alter>${pitch.alter}</alter>`);
    lines.push(`    <octave>${pitch.octave}</octave>`);
    lines.push('  </pitch>');
  }
  if (!options.grace) lines.push(`  <duration>${options.duration}</duration>`);
  lines.push(`  <voice>${options.voice}</voice>`);
  lines.push(`  <type>${options.type}</type>`);
  for (let i = 0; i < options.dots; i += 1) lines.push('  <dot/>');
  if (options.staffNumber === 2) lines.push('  <stem>none</stem>');
  for (const [level, value] of Array.from(options.beams.entries()).sort(([a], [b]) => a - b)) {
    lines.push(`  <beam number="${level}">${value}</beam>`);
  }
  if (options.note?.isTieDestination) lines.push('  <tie type="stop"/>');
  if (options.note?.isTieOrigin) lines.push('  <tie type="start"/>');
  const hammerPullAnnotations = options.hammerPullAnnotations ?? [];
  const technique = options.note ? collectGuitarProTechniqueData(options.note, options.grace) : null;
  if (options.note && (
    hammerPullAnnotations.length > 0
    || technique?.notationLines.length
    || (options.staffNumber === 2 && options.staff)
  )) {
    lines.push('  <notations>');
    if (options.staffNumber !== 2) {
      for (const annotation of hammerPullAnnotations) {
        lines.push(`    <slur number="${annotation.number}" type="${annotation.type}" placement="above"/>`);
      }
    }
    for (const line of technique?.notationLines ?? []) lines.push(`    ${line}`);
    if (options.note.isTieDestination) lines.push('    <tied type="stop"/>');
    if (options.note.isTieOrigin) lines.push('    <tied type="start"/>');
    if (options.staffNumber === 2 && options.staff) {
      lines.push('    <technical>');
      lines.push(`      <string>${musicXmlStringNumber(options.note, options.staff)}</string>`);
      lines.push(`      <fret>${safeNonNegativeInt(options.note.fret, 0)}</fret>`);
      for (const annotation of hammerPullAnnotations) {
        const label = annotation.technique === 'hammer-on' ? 'H' : 'P';
        lines.push(`      <${annotation.technique} number="${annotation.number}" type="${annotation.type}">${label}</${annotation.technique}>`);
      }
      for (const line of technique?.technicalLines ?? []) lines.push(`      ${line}`);
      lines.push('    </technical>');
    }
    lines.push('  </notations>');
  }
  lines.push(`  <staff>${options.staffNumber}</staff>`);
  lines.push('</note>');
  return lines;
}

function collectGuitarProTechniqueData(note: AlphaTabNote, isGrace?: boolean) {
  const notationLines: string[] = [];
  const technicalLines: string[] = [];
  const fallbackDetails: string[] = [];

  const bend = readBendData(note);
  if (bend) {
    technicalLines.push('<bend>');
    technicalLines.push(`  <bend-alter>${formatNumber(bend.alter)}</bend-alter>`);
    technicalLines.push('</bend>');
    fallbackDetails.push(`bend-type=${bend.typeName}`);
    if (bend.styleName !== 'Default') fallbackDetails.push(`bend-style=${bend.styleName}`);
    if (bend.points.length > 0) fallbackDetails.push(`bend-points=${bend.points.map((point) => `${point.offset}:${point.value}`).join(',')}`);
  }

  const slideInType = safeNonNegativeInt(note.slideInType, 0);
  const slideOutType = safeNonNegativeInt(note.slideOutType, 0);
  if (slideInType > 0) {
    notationLines.push('<slide type="stop"/>');
    fallbackDetails.push(`slide-in=${SLIDE_IN_TYPE_NAMES[slideInType] ?? `Unknown${slideInType}`}`);
  }
  if (slideOutType > 0) {
    notationLines.push('<slide type="start"/>');
    fallbackDetails.push(`slide-out=${SLIDE_OUT_TYPE_NAMES[slideOutType] ?? `Unknown${slideOutType}`}`);
  }

  if (note.isPalmMute) {
    technicalLines.push('<other-technical>p.m.</other-technical>');
    fallbackDetails.push('palm-mute=true');
  }
  if (note.isLetRing) {
    technicalLines.push('<other-technical>let ring</other-technical>');
    fallbackDetails.push('let-ring=true');
  }
  if (note.isDead) {
    technicalLines.push('<mute/>');
    fallbackDetails.push('dead-note=true');
  }

  const harmonicType = safeNonNegativeInt(note.harmonicType, 0);
  if (harmonicType > 0) {
    technicalLines.push('<harmonic>');
    technicalLines.push(harmonicType === 1 ? '  <natural/>' : '  <artificial/>');
    technicalLines.push('</harmonic>');
    fallbackDetails.push(`harmonic-type=${HARMONIC_TYPE_NAMES[harmonicType] ?? `Unknown${harmonicType}`}`);
    if (Number.isFinite(note.harmonicValue)) fallbackDetails.push(`harmonic-value=${formatNumber(Number(note.harmonicValue))}`);
  }

  if (isGrace) fallbackDetails.push('grace=true');

  for (const detail of fallbackDetails) {
    technicalLines.push(`<other-technical>gp:${escapeXml(detail)}</other-technical>`);
  }

  return { notationLines, technicalLines };
}

function readBendData(note: AlphaTabNote) {
  const type = safeNonNegativeInt(note.bendType, 0);
  const points = (note.bendPoints ?? [])
    .map((point) => ({
      offset: safeNonNegativeInt(point.offset, 0),
      value: safeNonNegativeInt(point.value, 0),
    }))
    .filter((point) => point.offset > 0 || point.value > 0);
  const maxPointValue = Math.max(
    safeNonNegativeInt(note.maxBendPoint?.value, 0),
    ...points.map((point) => point.value),
  );
  if (!note.hasBend && type === 0 && points.length === 0 && maxPointValue <= 0) return null;
  return {
    alter: Math.max(maxPointValue / 4, type > 0 ? 1 : 0.25),
    typeName: BEND_TYPE_NAMES[type] ?? `Unknown${type}`,
    styleName: BEND_STYLE_NAMES[safeNonNegativeInt(note.bendStyle, 0)] ?? `Unknown${note.bendStyle}`,
    points,
  };
}

function computeBeamAnnotations(beats: AlphaTabBeat[], masterBar?: AlphaTabMasterBar) {
  const annotations = new Map<AlphaTabBeat, BeatBeamAnnotations>();
  const beatUnitTicks = Math.max(1, Math.round(DIVISIONS * 4 / safePositiveInt(masterBar?.timeSignatureDenominator, 4)));
  for (const level of [1, 2, 3]) {
    const threshold = level === 1 ? 8 : level === 2 ? 16 : 32;
    const segments: AlphaTabBeat[][] = [];
    let current: AlphaTabBeat[] = [];
    let currentBeatUnit: number | null = null;
    let fallbackStart = 0;

    for (const beat of beats) {
      const start = typeof beat.displayStart === 'number' ? beat.displayStart : fallbackStart;
      fallbackStart = start + beatDurationTicks(beat);
      const beatUnit = Math.floor(start / beatUnitTicks);
      const canBeam = !beat.isRest
        && (beat.notes ?? []).some(isPlayableNote)
        && safePositiveInt(beat.duration, 4) >= threshold;
      if (canBeam && (currentBeatUnit == null || currentBeatUnit === beatUnit)) {
        current.push(beat);
        currentBeatUnit = beatUnit;
        continue;
      }
      if (current.length > 1) segments.push(current);
      current = canBeam ? [beat] : [];
      currentBeatUnit = canBeam ? beatUnit : null;
    }
    if (current.length > 1) segments.push(current);

    for (const segment of segments) {
      segment.forEach((beat, index) => {
        const entry = annotations.get(beat) ?? new Map<number, BeamValue>();
        entry.set(level, index === 0 ? 'begin' : index === segment.length - 1 ? 'end' : 'continue');
        annotations.set(beat, entry);
      });
    }
  }
  return annotations;
}

function computeHammerPullAnnotations(beats: AlphaTabBeat[]) {
  const annotations = new Map<AlphaTabNote, HammerPullAnnotation[]>();
  let number = 1;

  for (const beat of beats) {
    for (const note of beat.notes ?? []) {
      if (!isPlayableNote(note) || !note.hammerPullDestination) continue;
      const destination = note.hammerPullDestination;
      if (!isPlayableNote(destination)) continue;
      const technique: HammerPullTechnique = safeNonNegativeInt(destination.fret, 0) > safeNonNegativeInt(note.fret, 0)
        ? 'hammer-on'
        : 'pull-off';
      pushHammerPullAnnotation(annotations, note, { number, technique, type: 'start' });
      pushHammerPullAnnotation(annotations, destination, { number, technique, type: 'stop' });
      number += 1;
    }
  }

  return annotations;
}

function pushHammerPullAnnotation(
  annotations: Map<AlphaTabNote, HammerPullAnnotation[]>,
  note: AlphaTabNote,
  annotation: HammerPullAnnotation,
) {
  const existing = annotations.get(note) ?? [];
  existing.push(annotation);
  annotations.set(note, existing);
}

function isPlayableNote(note: AlphaTabNote) {
  return note.isStringed !== false && typeof note.realValue === 'number' && typeof note.fret === 'number' && typeof note.string === 'number';
}

function beatDurationTicks(beat: AlphaTabBeat) {
  if (isGraceBeat(beat)) return 0;
  const displayDuration = safePositiveInt(beat.displayDuration, 0);
  if (displayDuration > 0) return displayDuration;

  const base = Math.round((DIVISIONS * 4) / safePositiveInt(beat.duration, 4));
  let duration = base;
  let add = base;
  for (let i = 0; i < safeNonNegativeInt(beat.dots, 0); i += 1) {
    add /= 2;
    duration += add;
  }
  return Math.max(1, Math.round(duration));
}

function isGraceBeat(beat: AlphaTabBeat) {
  return safeNonNegativeInt(beat.graceType, 0) > 0;
}

function measureDurationTicks(masterBar: AlphaTabMasterBar | undefined) {
  const beats = safePositiveInt(masterBar?.timeSignatureNumerator, 4);
  const beatType = safePositiveInt(masterBar?.timeSignatureDenominator, 4);
  return Math.round(beats * DIVISIONS * (4 / beatType));
}

function durationType(duration: number | undefined) {
  switch (duration) {
    case 1: return 'whole';
    case 2: return 'half';
    case 4: return 'quarter';
    case 8: return 'eighth';
    case 16: return '16th';
    case 32: return '32nd';
    case 64: return '64th';
    case 128: return '128th';
    default: return 'quarter';
  }
}

function musicXmlStringNumber(note: AlphaTabNote, staff: AlphaTabStaff) {
  return Math.max(1, stringCount(staff) - safePositiveInt(note.string, 1) + 1);
}

function stringCount(staff: AlphaTabStaff) {
  return Math.max(1, normalizedTuning(staff).length);
}

function normalizedTuning(staff: AlphaTabStaff) {
  return (staff.tuning?.length ? staff.tuning : DEFAULT_GUITAR_TUNING).filter((midi) => Number.isFinite(midi));
}

function midiToPitch(midiValue: number) {
  const midi = Math.max(0, Math.round(midiValue));
  const pitchClass = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  const names = [
    ['C', 0],
    ['C', 1],
    ['D', 0],
    ['D', 1],
    ['E', 0],
    ['F', 0],
    ['F', 1],
    ['G', 0],
    ['G', 1],
    ['A', 0],
    ['A', 1],
    ['B', 0],
  ] as const;
  const [step, alter] = names[pitchClass];
  return { step, alter, octave };
}

function abbreviateTrackName(name: string) {
  return name.split(/\s+/).map((part) => part[0]).join('').slice(0, 6) || 'Gtr.';
}

function safeNumber(value: number | undefined, fallback: number) {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function safePositiveInt(value: number | undefined, fallback: number) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function safeNonNegativeInt(value: number | undefined, fallback: number) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function formatNumber(value: number) {
  if (!Number.isFinite(value)) return '0';
  return String(Math.round(value * 1000) / 1000);
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
