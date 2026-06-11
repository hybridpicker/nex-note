export interface ScoreDocumentModel {
  score: ScoreNode;
  metadata: ScoreMetadata;
  index: ScoreIndex;
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
  swingRatio?: number; // e.g. 0.667 for triplet feel (first note's share of the swung pair)
  swingUnit?: 'eighth' | '16th';
  revision: number;
}

export interface ScoreMetadata {
  title?: string;
  subtitle?: string;
  arranger?: string;
  composer?: string;
}

export interface ScoreNode {
  id: string;
  parts: PartNode[];
}

export interface PartNode {
  id: string;
  sourcePartId: string;
  name: string;
  abbreviation?: string;
  instrumentName?: string;
  chromaticTranspose?: number;
  diatonicTranspose?: number;
  staves: StaffNode[];
}

export interface StaffNode {
  id: string;
  staffIndex: number;
  measures: MeasureNode[];
}

export interface EndingMark {
  number: string;
  type: 'start' | 'stop' | 'discontinue';
}

export interface MeasureNode {
  id: string;
  measureNumber: number;
  sourceMeasureNumber?: number | null;
  implicit?: boolean;
  voices: VoiceNode[];
  directions: DirectionNode[];
  attributes: MeasureAttributes[];
  print?: {
    newSystem?: boolean;
    newPage?: boolean;
  };
  leftBarline?: string;
  rightBarline?: string;
  leftEnding?: EndingMark;
  rightEnding?: EndingMark;
  measureRepeat?: number; // positive = repeat N previous measures (1 = % sign)
  multiMeasureRest?: boolean; // collapse into multi-measure rest
}

export interface VoiceNode {
  id: string;
  voiceId: number;
  events: TimedEvent[];
}

export type TimedEvent = NoteEvent | RestEvent;

export type GuitarTechniqueKind =
  | 'hammer-on'
  | 'hammer-on-stop'
  | 'pull-off'
  | 'pull-off-stop'
  | 'slide'
  | 'bend'
  | 'vibrato'
  | 'palm-mute'
  | 'let-ring'
  | 'dead-note'
  | 'harmonic'
  | 'pick-up'
  | 'pick-down';

export interface BaseTimedEvent {
  id: string;
  kind: 'note' | 'rest';
  measureNumber: number;
  staffIndex: number;
  voiceId: number;
  timestampNum: number;
  timestampDen: number;
  durationDivisions: number;
  durationType?: string;
  isDotted?: boolean;
  isChord: boolean;
  notehead?: 'slash';
  stem?: 'none' | 'up' | 'down';
  hidden?: boolean;
  articulations?: string[];
  tieStart?: boolean;
  lyrics?: Array<{
    verseNumber?: number;
    text: string;
    syllabic?: 'single' | 'begin' | 'middle' | 'end';
  }>;
  preservedXml?: {
    beforePitch?: string[];
    afterType?: string[];
    notationChildren?: string[];
  };
}

export interface NoteEvent extends BaseTimedEvent {
  kind: 'note';
  pitch: {
    step: string;
    alter: number;
    octave: number;
  };
  guitar?: {
    string: 1 | 2 | 3 | 4 | 5 | 6;
    fret: number;
    tuning?: string;
    techniques?: GuitarTechniqueKind[];
  };
}

export interface RestEvent extends BaseTimedEvent {
  kind: 'rest';
}

export interface DirectionNode {
  id: string;
  kind: string;
  value?: string;
  // Span-direction pairing number (used by wedge and octave-shift to match start/stop).
  number?: number;
  placement?: string;
  measureNumber: number;
  staffIndex?: number;
  timestampNum?: number;
  timestampDen?: number;
}

export interface MeasureAttributes {
  id: string;
  divisions?: number;
  keyFifths?: number;
  time?: {
    beats: number;
    beatType: number;
  };
  clefs: Array<{
    staffIndex: number;
    sign?: string;
    line?: number;
  }>;
}

export interface ScoreIndex {
  measureIds: Record<number, string[]>;
  voiceIds: Record<string, string>;
  eventIds: Record<string, string>;
}

export interface SlurSpan {
  id: string;
  number: number;
  startEventId?: string;
  stopEventId?: string;
  placement?: string;
}

export interface BeamGroup {
  id: string;
  number: number;
  eventIds: string[];
  hook?: 'forward' | 'backward';
}

export interface TupletSpan {
  id: string;
  number: number;
  eventIds: string[];
  actualNotes?: number;
  normalNotes?: number;
  bracket?: boolean;
  showNumber?: 'actual' | 'both' | 'none';
}

export interface ChordGroup {
  id: string;
  measureNumber: number;
  staffIndex: number;
  voiceId: number;
  timestampNum: number;
  timestampDen: number;
  eventIds: string[];
}

export interface GraceNoteLink {
  id: string;
  eventId: string;
  slash?: boolean;
}

export interface LyricLine {
  id: string;
  verseNumber: number;
  eventId: string;
  text: string;
  syllabic?: 'single' | 'begin' | 'middle' | 'end';
}

export interface LayoutHint {
  id: string;
  scope: 'measure' | 'staff' | 'system' | 'page' | 'part';
  measureNumber: number;
  partId?: string;
  staffIndex?: number;
  kind: 'newSystem' | 'newPage' | 'staffSpacing' | 'collisionPolicy';
  value: boolean | number | string;
}

export interface TremoloSpan {
  id: string;
  eventId: string;
  lines: 1 | 2 | 3;
  type: 'single' | 'start' | 'stop';
}

export interface GlissandoLine {
  id: string;
  number: number;
  startEventId?: string;
  stopEventId?: string;
  lineType?: 'solid' | 'dashed' | 'dotted' | 'wavy';
  text?: string;
}

export interface ArpeggioMark {
  id: string;
  eventId: string;
  direction?: 'up' | 'down';
  nonArpeggiate?: boolean;
}
