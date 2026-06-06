import type { TestCase } from '@/lib/benchmark-suite';
import type { BenchmarkPipelineResult } from '@/lib/benchmark-scoring';

export type AssistantTaskLevel = 'anfang' | 'mittel' | 'schwer' | 'richtig-schwer' | 'meisterklasse';

export interface AssistantCatalogTask extends TestCase {
  level: AssistantTaskLevel;
  sourceProfile: string;
  texture:
    | 'monophonic'
    | 'two-voice'
    | 'three-voice'
    | 'four-voice'
    | 'piano-two-staff'
    | 'lead-sheet'
    | 'ensemble'
    | 'polyphonic'
    | 'dense-score'
    | 'full-orchestra'
    | 'film-score'
    | 'hybrid-orchestra'
    | 'electronic'
    | 'rhythm-section'
    | 'big-band'
    | 'game-score';
  learningFocus: string;
  comparisonRubric: string[];
}

interface SourceProfile {
  id: string;
  title: string;
  texture: AssistantCatalogTask['texture'];
  description: string;
  chordTarget: string;
  advancedChord: string;
  instrument: 'flute' | 'violin' | 'clarinet-bb' | 'voice' | 'cello' | 'trumpet-bb' | 'alto-sax-eb';
}

interface TaskTemplate {
  id: string;
  label: string;
  category: NonNullable<TestCase['category']>;
  focus: string;
  instruction: (source: SourceProfile) => string;
  expect: (source: SourceProfile) => NonNullable<TestCase['expect']>;
  rubric: (source: SourceProfile) => string[];
}

const BEGINNER_SOURCES: SourceProfile[] = [
  { id: 'one-bar-stepwise-c', title: 'one-bar stepwise C melody', texture: 'monophonic', description: 'a one-bar C-major stepwise melody C-D-E-F', chordTarget: 'C', advancedChord: 'G7', instrument: 'flute' },
  { id: 'two-bar-folk-tune', title: 'two-bar folk tune', texture: 'monophonic', description: 'a two-bar folk-like tune with repeated notes and a simple cadence', chordTarget: 'G', advancedChord: 'D7', instrument: 'voice' },
  { id: 'four-bar-piano-sketch', title: 'four-bar piano sketch', texture: 'piano-two-staff', description: 'a small four-bar piano sketch with melody in the right hand', chordTarget: 'F', advancedChord: 'C7', instrument: 'clarinet-bb' },
  { id: 'lead-sheet-fragment', title: 'lead-sheet fragment', texture: 'lead-sheet', description: 'a lead-sheet fragment with a clear pickup into bar 1', chordTarget: 'Am', advancedChord: 'E7', instrument: 'trumpet-bb' },
  { id: 'recorder-class-melody', title: 'recorder class melody', texture: 'monophonic', description: 'a small school-recorder melody in mostly quarters', chordTarget: 'Dm', advancedChord: 'A7', instrument: 'flute' },
  { id: 'simple-left-hand-bass', title: 'simple left-hand bass', texture: 'two-voice', description: 'a melody with a very simple left-hand bass outline', chordTarget: 'Em', advancedChord: 'B7', instrument: 'cello' },
  { id: 'short-vocal-phrase', title: 'short vocal phrase', texture: 'monophonic', description: 'a short vocal phrase that needs breathing marks', chordTarget: 'Bb', advancedChord: 'F7', instrument: 'voice' },
  { id: 'beginner-duet', title: 'beginner two-part duet', texture: 'two-voice', description: 'a beginner duet with parallel rhythmic motion', chordTarget: 'D', advancedChord: 'A7', instrument: 'violin' },
  { id: 'tiny-minor-melody', title: 'tiny minor melody', texture: 'monophonic', description: 'a tiny A-minor melody with a weak final bar', chordTarget: 'Am', advancedChord: 'E7', instrument: 'alto-sax-eb' },
  { id: 'blank-starter-score', title: 'blank starter score', texture: 'piano-two-staff', description: 'a blank starter score intended for a simple first composition', chordTarget: 'C', advancedChord: 'G7', instrument: 'clarinet-bb' },
];

const MIDDLE_SOURCES: SourceProfile[] = [
  { id: 'period-theme-c', title: 'eight-bar period theme', texture: 'monophonic', description: 'an eight-bar C-major period theme with a half cadence and final cadence', chordTarget: 'G7', advancedChord: 'D7', instrument: 'flute' },
  { id: 'two-voice-invention', title: 'two-voice invention draft', texture: 'two-voice', description: 'a two-voice invention draft with imitation and a few exposed fifths', chordTarget: 'Dm7', advancedChord: 'A7', instrument: 'violin' },
  { id: 'choir-satb-fragment', title: 'SATB choir fragment', texture: 'four-voice', description: 'a short SATB fragment with close soprano and alto motion', chordTarget: 'F', advancedChord: 'C7', instrument: 'voice' },
  { id: 'piano-accompaniment-study', title: 'piano accompaniment study', texture: 'piano-two-staff', description: 'a melody over a broken-chord accompaniment pattern', chordTarget: 'Bb', advancedChord: 'F7', instrument: 'clarinet-bb' },
  { id: 'string-duo-phrase', title: 'string duo phrase', texture: 'two-voice', description: 'a violin-cello phrase with contrary motion opportunities', chordTarget: 'Gm', advancedChord: 'D7', instrument: 'cello' },
  { id: 'jazz-leadsheet-ii-v', title: 'jazz lead-sheet sketch', texture: 'lead-sheet', description: 'a lead-sheet sketch that invites a ii-V turnaround', chordTarget: 'Dm7', advancedChord: 'G7', instrument: 'trumpet-bb' },
  { id: 'modal-flute-line', title: 'modal flute line', texture: 'monophonic', description: 'a D-Dorian flute line with a narrow range and repeated motive', chordTarget: 'Dm', advancedChord: 'G', instrument: 'flute' },
  { id: 'three-part-school-satz', title: 'three-part school Satz', texture: 'three-voice', description: 'a three-part school Satz with a clear upper melody', chordTarget: 'C', advancedChord: 'G7', instrument: 'clarinet-bb' },
  { id: 'waltz-miniature', title: 'waltz miniature', texture: 'piano-two-staff', description: 'a short waltz miniature with melody and oom-pah-pah support', chordTarget: 'Eb', advancedChord: 'Bb7', instrument: 'alto-sax-eb' },
  { id: 'chorale-cadence', title: 'chorale cadence', texture: 'four-voice', description: 'a chorale cadence with tendency-tone pressure near the end', chordTarget: 'G', advancedChord: 'D7', instrument: 'voice' },
];

const HARD_SOURCES: SourceProfile[] = [
  { id: 'strict-chorale', title: 'strict chorale phrase', texture: 'four-voice', description: 'a strict chorale phrase with possible hidden parallels and a doubled tendency tone', chordTarget: 'C', advancedChord: 'Ger+6', instrument: 'voice' },
  { id: 'fugal-exposition', title: 'fugal exposition sketch', texture: 'polyphonic', description: 'a compact fugal exposition sketch with subject, answer, and countersubject', chordTarget: 'Gm', advancedChord: 'D7', instrument: 'violin' },
  { id: 'romantic-piano-period', title: 'Romantic piano period', texture: 'piano-two-staff', description: 'a Romantic piano period with chromatic inner-voice motion', chordTarget: 'Ab', advancedChord: 'Db', instrument: 'clarinet-bb' },
  { id: 'mixed-meter-theme', title: 'mixed-meter theme', texture: 'monophonic', description: 'a theme that shifts phrase accents against the notated meter', chordTarget: 'Em', advancedChord: 'B7', instrument: 'flute' },
  { id: 'string-trio-draft', title: 'string trio draft', texture: 'ensemble', description: 'a violin-viola-cello trio draft with crossing-risk in the middle register', chordTarget: 'D', advancedChord: 'A7', instrument: 'cello' },
  { id: 'jazz-ballad-voicing', title: 'jazz ballad voicing', texture: 'lead-sheet', description: 'a jazz ballad lead sheet needing close voicing and guide tones', chordTarget: 'Cmaj7', advancedChord: 'Db7', instrument: 'trumpet-bb' },
  { id: 'cantus-firmus', title: 'cantus firmus exercise', texture: 'two-voice', description: 'a cantus-firmus exercise with dissonance-treatment traps', chordTarget: 'F', advancedChord: 'C7', instrument: 'voice' },
  { id: 'orchestral-reduction', title: 'orchestral reduction sketch', texture: 'dense-score', description: 'a dense orchestral reduction sketch with too much inner material', chordTarget: 'Bb', advancedChord: 'F7', instrument: 'alto-sax-eb' },
  { id: 'late-classical-development', title: 'development fragment', texture: 'polyphonic', description: 'a late-Classical development fragment with sequence and modulation pressure', chordTarget: 'A', advancedChord: 'E7', instrument: 'violin' },
  { id: 'generalbass-realization', title: 'figured-bass realization', texture: 'three-voice', description: 'a figured-bass realization needing clean outer voices', chordTarget: 'G', advancedChord: 'D7', instrument: 'cello' },
];

const EXTREME_SOURCES: SourceProfile[] = [
  { id: 'chromatic-fugato', title: 'chromatic fugato', texture: 'polyphonic', description: 'a chromatic fugato with invertible-counterpoint implications', chordTarget: 'Cm', advancedChord: 'Ger+6', instrument: 'violin' },
  { id: 'dense-satb-modulation', title: 'dense SATB modulation', texture: 'four-voice', description: 'a dense SATB modulation through a pivot chord with exposed tendency tones', chordTarget: 'G', advancedChord: 'D7', instrument: 'voice' },
  { id: 'large-piano-reduction', title: 'large piano reduction', texture: 'dense-score', description: 'a large-score piano reduction with orchestral doublings and register congestion', chordTarget: 'Eb', advancedChord: 'Bb7', instrument: 'clarinet-bb' },
  { id: 'post-tonal-miniature', title: 'post-tonal miniature', texture: 'polyphonic', description: 'a post-tonal miniature where pitch-class identity matters more than functional cadence', chordTarget: 'F#dim', advancedChord: 'B7alt', instrument: 'flute' },
  { id: 'advanced-jazz-reharm', title: 'advanced jazz reharmonization', texture: 'lead-sheet', description: 'a lead sheet asking for backdoor dominants, tritone substitutes, and altered tensions', chordTarget: 'Cmaj7', advancedChord: 'Db7', instrument: 'trumpet-bb' },
  { id: 'four-voice-canon', title: 'four-voice canon', texture: 'four-voice', description: 'a four-voice canon with stretto and registral overlap', chordTarget: 'Am', advancedChord: 'E7', instrument: 'voice' },
  { id: 'polyrhythmic-piano', title: 'polyrhythmic piano study', texture: 'piano-two-staff', description: 'a piano study with 3-against-2 pressure and voicing hierarchy problems', chordTarget: 'Dm', advancedChord: 'A7', instrument: 'cello' },
  { id: 'micro-orchestration-sketch', title: 'micro-orchestration sketch', texture: 'ensemble', description: 'a chamber-orchestration sketch requiring color, balance, and playable registers', chordTarget: 'Bb', advancedChord: 'F7', instrument: 'alto-sax-eb' },
  { id: 'double-counterpoint-study', title: 'double counterpoint study', texture: 'two-voice', description: 'a double-counterpoint study meant to invert at the octave', chordTarget: 'Gm', advancedChord: 'D7', instrument: 'violin' },
  { id: 'capstone-variation-set', title: 'variation-set capstone', texture: 'dense-score', description: 'a variation-set capstone with motive, harmony, texture, and form all under review', chordTarget: 'C', advancedChord: 'Ger+6', instrument: 'clarinet-bb' },
];

function analysisExpect(): NonNullable<TestCase['expect']> {
  return { workflow: 'analysis', allowNoCommands: true, maxValidatorFindings: 0 };
}

function analysisAnnotationExpect(analysisType?: string): NonNullable<TestCase['expect']> {
  return {
    workflow: 'analysis',
    commandTypes: ['addAnalysisAnnotation'],
    commandChecks: analysisType ? [{ type: 'addAnalysisAnnotation', field: 'analysisType', equals: analysisType }] : undefined,
    minCommands: 1,
    maxValidatorFindings: 0,
  };
}

function syncPointExpect(workflow = 'analysis'): NonNullable<TestCase['expect']> {
  return {
    workflow,
    commandTypes: ['addSyncPoint'],
    minCommands: 1,
    requiresConfirmation: workflow === 'arrangement-assist' ? true : undefined,
    maxValidatorFindings: 0,
  };
}

function techniqueInstructionExpect(workflow = 'notation-repair'): NonNullable<TestCase['expect']> {
  return {
    workflow,
    commandTypes: ['addTechniqueInstruction'],
    minCommands: 1,
    requiresConfirmation: true,
    maxValidatorFindings: 0,
  };
}

function orchestrationNoteExpect(workflow = 'arrangement-assist'): NonNullable<TestCase['expect']> {
  return {
    workflow,
    commandTypes: ['addOrchestrationNote'],
    minCommands: 1,
    requiresConfirmation: true,
    maxValidatorFindings: 0,
  };
}

function harmonyExpect(chord: string, withKey = false): NonNullable<TestCase['expect']> {
  return {
    commandTypes: withKey ? ['setKey', 'addChords'] : ['addChords'],
    commandChecks: [{ type: 'addChords', field: 'chords', includes: chord }],
    minCommands: withKey ? 2 : 1,
  };
}

function compositionExpect(extra: string[] = []): NonNullable<TestCase['expect']> {
  return {
    commandTypes: ['insertNoteAt', ...extra],
    forbiddenCommandTypes: ['addChords'],
    minCommands: 6,
    requiresConfirmation: true,
  };
}

function arrangementExpect(source: SourceProfile, extraTypes: string[] = []): NonNullable<TestCase['expect']> {
  return {
    workflow: 'arrangement-assist',
    commandTypes: ['addChords', 'addExpressionText', ...extraTypes],
    commandChecks: extraTypes.includes('fitPartToInstrument')
      ? [{ type: 'fitPartToInstrument', field: 'instrument', equals: source.instrument }]
      : undefined,
    minCommands: 2 + extraTypes.length,
    requiresConfirmation: true,
    maxValidatorFindings: 0,
  };
}

const BEGINNER_TEMPLATES: TaskTemplate[] = [
  {
    id: 'read-score',
    label: 'Read the score',
    category: 'analysis',
    focus: 'basic score reading',
    instruction: (source) => `/analyze For ${source.description}, name key center, phrase length, range, and the easiest first improvement.`,
    expect: analysisExpect,
    rubric: () => ['Names key or tonal center', 'Mentions phrase/range', 'Gives one concrete improvement'],
  },
  {
    id: 'basic-chords',
    label: 'Add basic harmony',
    category: 'harmony',
    focus: 'diatonic triads',
    instruction: (source) => `Add beginner chord symbols to ${source.title}; include ${source.chordTarget} as the arrival chord.`,
    expect: (source) => harmonyExpect(source.chordTarget),
    rubric: (source) => [`Includes ${source.chordTarget}`, 'Uses addChords', 'Keeps harmony simple'],
  },
  {
    id: 'simple-melody',
    label: 'Write a simple melody',
    category: 'workflow',
    focus: 'short melodic writing',
    instruction: (source) => `Compose a simple four-bar melody inspired by ${source.description}, with clear contour and varied rhythm.`,
    expect: () => compositionExpect(['setKey']),
    rubric: () => ['Creates notes', 'Avoids only quarter notes', 'Keeps scope short'],
  },
  {
    id: 'easy-arrange',
    label: 'Easy arrangement',
    category: 'arrangement',
    focus: 'playable arrangement defaults',
    instruction: (source) => `/arrange Arrange ${source.description} for ${source.instrument} with clear melody, simple support, and practical expression.`,
    expect: (source) => arrangementExpect(source, ['fitPartToInstrument']),
    rubric: () => ['Keeps melody clear', 'Adds support chords/expression', 'Fits target instrument'],
  },
  {
    id: 'practice-version',
    label: 'Practice version',
    category: 'practice',
    focus: 'rehearsal preparation',
    instruction: (source) => `/practice Make ${source.title} into a beginner practice version with slower tempo and clear rehearsal layout.`,
    expect: () => ({ workflow: 'practice-assist', minCommands: 1, requiresConfirmation: true }),
    rubric: () => ['Slows or simplifies practice', 'Keeps edit previewable', 'Improves rehearsal clarity'],
  },
];

const MIDDLE_TEMPLATES: TaskTemplate[] = [
  {
    id: 'phrase-diagnosis',
    label: 'Phrase diagnosis',
    category: 'analysis',
    focus: 'phrase and cadence analysis',
    instruction: (source) => `/analyze Diagnose ${source.description}: antecedent/consequent shape, cadence strength, motivic repetition, and weakest measure.`,
    expect: analysisExpect,
    rubric: () => ['Discusses phrase shape', 'Identifies cadence quality', 'Names a weak spot'],
  },
  {
    id: 'secondary-dominant',
    label: 'Secondary dominant',
    category: 'harmony',
    focus: 'applied dominants',
    instruction: (source) => `Reharmonize ${source.title} with a clear applied dominant; include ${source.advancedChord} before the cadence.`,
    expect: (source) => harmonyExpect(source.advancedChord),
    rubric: (source) => [`Includes ${source.advancedChord}`, 'Explains applied dominant role', 'Keeps melody source intact'],
  },
  {
    id: 'period-compose',
    label: 'Compose a period',
    category: 'workflow',
    focus: 'period construction',
    instruction: (source) => `Compose an original eight-bar period based on ${source.description}, with antecedent/consequent balance and a clear final cadence.`,
    expect: () => compositionExpect(['setTempo', 'addExpressionText']),
    rubric: () => ['Writes an 8-bar idea', 'Has phrase contrast', 'Adds tempo/expression'],
  },
  {
    id: 'counterline-arrange',
    label: 'Counterline arrangement',
    category: 'arrangement',
    focus: 'secondary line below melody',
    instruction: (source) => `/arrange Keep the main melody in ${source.title} intact and add a restrained lower countermelody concept with clean phrase breathing.`,
    expect: () => orchestrationNoteExpect(),
    rubric: () => ['Preserves melody', 'Adds support/counterline concept', 'Avoids clutter'],
  },
  {
    id: 'notation-cleanup',
    label: 'Notation cleanup',
    category: 'notation',
    focus: 'readability repair',
    instruction: (source) => `/repair Clean up ${source.description}: remove notation clutter, clarify articulations, and preserve musical identity.`,
    expect: () => ({ workflow: 'notation-repair', allowNoCommands: true, maxValidatorFindings: 0 }),
    rubric: () => ['Conservative repair', 'No rewrite', 'Readable result'],
  },
];

const HARD_TEMPLATES: TaskTemplate[] = [
  {
    id: 'counterpoint-review',
    label: 'Counterpoint review',
    category: 'analysis',
    focus: 'counterpoint and voice leading',
    instruction: (source) => `/analyze Review ${source.description} for parallels, voice crossing, tendency-tone resolution, and structural cadence weight.`,
    expect: analysisExpect,
    rubric: () => ['Checks parallels', 'Checks crossing/range', 'Checks cadence/tendency tones'],
  },
  {
    id: 'chromatic-predominant',
    label: 'Chromatic predominant',
    category: 'harmony',
    focus: 'chromatic predominant harmony',
    instruction: (source) => `Give ${source.title} a chromatic predominant plan and include ${source.advancedChord} as the critical color chord.`,
    expect: (source) => harmonyExpect(source.advancedChord),
    rubric: (source) => [`Includes ${source.advancedChord}`, 'Has functional destination', 'Avoids random chromaticism'],
  },
  {
    id: 'modal-composition',
    label: 'Modal composition',
    category: 'workflow',
    focus: 'modal composition with constraint',
    instruction: (source) => `Compose a six-bar modal response to ${source.description}; keep one recurring motive, varied rhythm, and a deliberate high point.`,
    expect: () => compositionExpect(['setTempo', 'setKey']),
    rubric: () => ['Uses motive', 'Varies rhythm', 'Shapes a high point'],
  },
  {
    id: 'strict-three-voice',
    label: 'Strict three-voice realization',
    category: 'arrangement',
    focus: 'strict voicing repair',
    instruction: (source) => `/arrange Realize ${source.description} as a strict three-voice Satz: avoid parallel fifths/octaves, resolve tendency tones, and keep outer voices clear.`,
    expect: () => orchestrationNoteExpect(),
    rubric: () => ['Three-voice plan', 'No unresolved critic errors', 'Clear outer voices'],
  },
  {
    id: 'advanced-practice',
    label: 'Advanced practice edition',
    category: 'practice',
    focus: 'study edition',
    instruction: (source) => `/practice Build an advanced practice edition of ${source.title}: slower tempo, rehearsal marks, roomy spacing, and one hotspot-oriented plan.`,
    expect: () => ({ workflow: 'practice-assist', minCommands: 2, requiresConfirmation: true, maxValidatorFindings: 0 }),
    rubric: () => ['Tempo or profile changes', 'Marks structure', 'Identifies hotspots'],
  },
];

const EXTREME_TEMPLATES: TaskTemplate[] = [
  {
    id: 'professor-defense',
    label: 'Professor defense',
    category: 'analysis',
    focus: 'graduate-level critique',
    instruction: (source) => `/analyze Defend or reject ${source.description} like a composition jury: form, counterpoint, harmony, register, and the one fatal weakness.`,
    expect: analysisExpect,
    rubric: () => ['Judges form', 'Judges harmony/counterpoint', 'Names a fatal weakness'],
  },
  {
    id: 'capstone-reharm',
    label: 'Capstone reharmonization',
    category: 'harmony',
    focus: 'advanced reharmonization',
    instruction: (source) => `Create a capstone reharmonization for ${source.title}; include ${source.advancedChord}, a clear arrival, and no gratuitous chord labels.`,
    expect: (source) => harmonyExpect(source.advancedChord),
    rubric: (source) => [`Includes ${source.advancedChord}`, 'Has clear arrival', 'Avoids arbitrary labels'],
  },
  {
    id: 'capstone-compose',
    label: 'Capstone composition',
    category: 'workflow',
    focus: 'multi-constraint composition',
    instruction: (source) => `Compose a compact capstone variation from ${source.description}: motive transformation, registral plan, contrast, and a final cadence gesture.`,
    expect: () => compositionExpect(['setTempo', 'addExpressionText']),
    rubric: () => ['Transforms motive', 'Plans register', 'Creates contrast and cadence'],
  },
  {
    id: 'orchestration-reduction',
    label: 'Orchestration reduction',
    category: 'arrangement',
    focus: 'dense score reduction',
    instruction: (source) => `/arrange Reduce ${source.description} into a playable rehearsal score: melody audible, bass functional, inner voices thinned, and no loss of form.`,
    expect: () => orchestrationNoteExpect(),
    rubric: () => ['Playable reduction', 'Functional bass', 'Preserves form'],
  },
  {
    id: 'instrumental-transposition',
    label: 'Instrumental study part',
    category: 'practice',
    focus: 'idiomatic transposed study part',
    instruction: (source) => `/practice Prepare ${source.title} as a study part for ${source.instrument}: idiomatic range, written transposition where needed, breath/bow logic, and slower rehearsal tempo.`,
    expect: (source) => ({
      workflow: 'practice-assist',
      commandTypes: ['fitPartToInstrument', 'setTempo'],
      commandChecks: [{ type: 'fitPartToInstrument', field: 'instrument', equals: source.instrument }],
      minCommands: 2,
      requiresConfirmation: true,
      maxValidatorFindings: 0,
    }),
    rubric: () => ['Fits instrument', 'Handles transposition/range', 'Sets a study tempo'],
  },
];

type CatalogCategory = NonNullable<TestCase['category']>;

interface ExplicitCatalogTaskInput {
  id: string;
  label: string;
  level: AssistantTaskLevel;
  sourceProfile: string;
  texture: AssistantCatalogTask['texture'];
  category: CatalogCategory;
  focus: string;
  instruction: string;
  expect: NonNullable<TestCase['expect']>;
  rubric: string[];
}

function explicitTask(input: ExplicitCatalogTaskInput): AssistantCatalogTask {
  return {
    id: input.id,
    label: input.label,
    level: input.level,
    sourceProfile: input.sourceProfile,
    texture: input.texture,
    learningFocus: input.focus,
    instruction: input.instruction,
    category: input.category,
    expect: input.expect,
    comparisonRubric: input.rubric,
  };
}

function advancedHarmonyExpect(chord?: string): NonNullable<TestCase['expect']> {
  return chord
    ? harmonyExpect(chord)
    : { commandTypes: ['addChords'], minCommands: 1, requiresConfirmation: true };
}

function advancedArrangementExpect(extraTypes: string[] = []): NonNullable<TestCase['expect']> {
  return {
    workflow: 'arrangement-assist',
    commandTypes: ['addChords', 'addExpressionText', ...extraTypes],
    minCommands: 2 + extraTypes.length,
    requiresConfirmation: true,
    maxValidatorFindings: 0,
  };
}

function advancedPracticeExpect(extraTypes: string[] = []): NonNullable<TestCase['expect']> {
  return {
    workflow: 'practice-assist',
    commandTypes: ['setTempo', ...extraTypes],
    minCommands: 1 + extraTypes.length,
    requiresConfirmation: true,
    maxValidatorFindings: 0,
  };
}

function notationNoOpExpect(): NonNullable<TestCase['expect']> {
  return { workflow: 'notation-repair', allowNoCommands: true, maxValidatorFindings: 0 };
}

function arrangementSyncPointExpect(): NonNullable<TestCase['expect']> {
  return syncPointExpect('arrangement-assist');
}

const SUPPLEMENTAL_TASKS: AssistantCatalogTask[] = [
  explicitTask({
    id: 'mittel_51_odd-meter-groove_phrase-analysis',
    label: 'mittel 51: Odd-meter groove bridge',
    level: 'mittel',
    sourceProfile: 'berklee-odd-meter-bridge',
    texture: 'rhythm-section',
    category: 'analysis',
    focus: 'odd-meter groove literacy',
    instruction: '/analyze Diagnose a 7/8 rhythm-section bridge for grouping, backbeat illusion, bass ostinato, and drummer-readable cue points.',
    expect: analysisExpect(),
    rubric: ['Identifies grouping', 'Names groove function', 'Keeps rhythm-section perspective'],
  }),
  explicitTask({
    id: 'mittel_52_modal-interchange_basic-reharm',
    label: 'mittel 52: Modal interchange bridge',
    level: 'mittel',
    sourceProfile: 'berklee-modal-interchange',
    texture: 'lead-sheet',
    category: 'harmony',
    focus: 'modal interchange',
    instruction: 'Reharmonize a pop-jazz bridge with modal interchange; include Bb as the borrowed-color arrival chord.',
    expect: harmonyExpect('Bb'),
    rubric: ['Includes Bb', 'Explains borrowed color', 'Keeps phrase direction'],
  }),
  explicitTask({
    id: 'mittel_53_sync-point_basic-tempo-map',
    label: 'mittel 53: Sync-point tempo map',
    level: 'mittel',
    sourceProfile: 'berklee-basic-scoring-cue',
    texture: 'film-score',
    category: 'analysis',
    focus: 'basic media scoring timing',
    instruction: '/analyze Diagnose a short film cue for sync points, hit tolerance, barline placement, and phrase-friendly tempo mapping.',
    expect: syncPointExpect(),
    rubric: ['Names sync points', 'Discusses tempo map', 'Protects musical phrasing'],
  }),
  explicitTask({
    id: 'mittel_54_palestrina-vs-bach_style-diagnosis',
    label: 'mittel 54: Palestrina versus Bach',
    level: 'mittel',
    sourceProfile: 'mdw-style-comparison',
    texture: 'four-voice',
    category: 'analysis',
    focus: 'historical style distinction',
    instruction: '/analyze Compare a Palestrina-like modal passage with a Bach-like tonal passage: cadence grammar, dissonance treatment, imitation, and harmonic teleology.',
    expect: analysisExpect(),
    rubric: ['Separates modal and tonal grammar', 'Discusses dissonance', 'Names cadence behavior'],
  }),
  explicitTask({
    id: 'mittel_55_synth-counterline_arrange',
    label: 'mittel 55: Synth counterline arrangement',
    level: 'mittel',
    sourceProfile: 'berklee-synth-counterline',
    texture: 'electronic',
    category: 'arrangement',
    focus: 'production-aware counterline',
    instruction: '/arrange Add a restrained synth counterline concept beneath the main melody; keep filter motion, register, and rhythmic placement clear.',
    expect: orchestrationNoteExpect(),
    rubric: ['Adds counterline concept', 'Mentions sound design role', 'Keeps texture clear'],
  }),
  explicitTask({
    id: 'schwer_51_schenker-middleground_ursatz',
    label: 'schwer 51: Schenkerian middleground',
    level: 'schwer',
    sourceProfile: 'mdw-schenker-middleground',
    texture: 'piano-two-staff',
    category: 'analysis',
    focus: 'Schenkerian analysis',
    instruction: '/analyze Produce a Schenkerian diagnosis of a tonal period: Urlinie candidate, Bassbrechung, prolongations, middleground diminutions, and structural cadence.',
    expect: analysisAnnotationExpect('schenkerian'),
    rubric: ['Identifies Urlinie', 'Mentions prolongation', 'Connects cadence to structure'],
  }),
  explicitTask({
    id: 'schwer_52_coltrane-changes_reharm',
    label: 'schwer 52: Coltrane changes reharm',
    level: 'schwer',
    sourceProfile: 'berklee-coltrane-cycle',
    texture: 'lead-sheet',
    category: 'harmony',
    focus: 'advanced jazz reharmonization',
    instruction: 'Create a Coltrane Changes reharmonization plan for a ii-V-I phrase; include D7 as the cycle pivot before the cadence.',
    expect: harmonyExpect('D7'),
    rubric: ['Includes D7', 'Controls tonal centers', 'Preserves melody targets'],
  }),
  explicitTask({
    id: 'schwer_53_forte-set_theory',
    label: 'schwer 53: Forte set-class diagnosis',
    level: 'schwer',
    sourceProfile: 'mdw-set-class-study',
    texture: 'polyphonic',
    category: 'analysis',
    focus: 'pitch-class set theory',
    instruction: '/analyze Diagnose a post-tonal miniature using pitch-class set theory: prime form, Forte number, interval vector, invariance, and registral partitioning.',
    expect: analysisAnnotationExpect('forteSet'),
    rubric: ['Names set-class method', 'Discusses interval vector', 'Connects register to form'],
  }),
  explicitTask({
    id: 'schwer_54_dialogue-underscoring_arrange',
    label: 'schwer 54: Dialogue underscoring',
    level: 'schwer',
    sourceProfile: 'berklee-dialogue-cue',
    texture: 'film-score',
    category: 'arrangement',
    focus: 'dialogue-safe film scoring',
    instruction: '/arrange Thin an orchestral underscore under dialogue; preserve emotional subtext, avoid speech-frequency masking, and keep harmonic motion active.',
    expect: arrangementSyncPointExpect(),
    rubric: ['Protects dialogue', 'Keeps subtext', 'Uses arrangement commands'],
  }),
  explicitTask({
    id: 'schwer_55_dilla-feel_microrhythm',
    label: 'schwer 55: Dilla-feel microrhythm',
    level: 'schwer',
    sourceProfile: 'berklee-microrhythm',
    texture: 'rhythm-section',
    category: 'analysis',
    focus: 'microrhythm and groove analysis',
    instruction: '/analyze Diagnose a Dilla-feel groove: late snares, pushed hats, bass placement, swing asymmetry, grid deviation, and notational approximation.',
    expect: analysisExpect(),
    rubric: ['Discusses microtiming', 'Names rhythm-section placement', 'Avoids over-quantizing'],
  }),
  explicitTask({
    id: 'richtig-schwer_51_spectral-overtone_harmony',
    label: 'richtig-schwer 51: Spectral overtone harmony',
    level: 'richtig-schwer',
    sourceProfile: 'mdw-spectral-overtone',
    texture: 'full-orchestra',
    category: 'harmony',
    focus: 'spectral harmony',
    instruction: 'Create a spectral harmony plan derived from the overtone series of low C; include C as the structural spectral root chord.',
    expect: harmonyExpect('C'),
    rubric: ['Includes C as root', 'Mentions overtone derivation', 'Keeps plan structural'],
  }),
  explicitTask({
    id: 'richtig-schwer_52_lachenmann-notation_repair',
    label: 'richtig-schwer 52: Lachenmann-style notation',
    level: 'richtig-schwer',
    sourceProfile: 'mdw-extended-techniques',
    texture: 'ensemble',
    category: 'notation',
    focus: 'contemporary notation',
    instruction: '/repair Normalize contemporary notation with bow pressure, air sounds, key clicks, and noise components; preserve performability and extended-technique intent.',
    expect: techniqueInstructionExpect(),
    rubric: ['Preserves technique intent', 'Avoids over-standardizing', 'Keeps notation performable'],
  }),
  explicitTask({
    id: 'richtig-schwer_53_hybrid-orchestra_template',
    label: 'richtig-schwer 53: Hybrid orchestral template',
    level: 'richtig-schwer',
    sourceProfile: 'berklee-hybrid-template',
    texture: 'hybrid-orchestra',
    category: 'arrangement',
    focus: 'hybrid orchestration',
    instruction: '/arrange Design a hybrid orchestral texture combining strings, brass pulses, synth bass, and processed percussion; keep orchestration and mix space coherent.',
    expect: orchestrationNoteExpect(),
    rubric: ['Blends orchestra and production', 'Maintains hierarchy', 'Keeps previewable arrangement'],
  }),
  explicitTask({
    id: 'richtig-schwer_54_negative-harmony_reharm',
    label: 'richtig-schwer 54: Negative harmony reharm',
    level: 'richtig-schwer',
    sourceProfile: 'berklee-negative-harmony',
    texture: 'lead-sheet',
    category: 'harmony',
    focus: 'negative harmony',
    instruction: 'Reharmonize a diatonic phrase using negative harmony; include Eb as the mirrored-axis color chord.',
    expect: harmonyExpect('Eb'),
    rubric: ['Includes Eb', 'Explains axis color', 'Keeps phrase playable'],
  }),
  explicitTask({
    id: 'richtig-schwer_55_spatial-audio_orchestration',
    label: 'richtig-schwer 55: Spatial audio orchestration',
    level: 'richtig-schwer',
    sourceProfile: 'berklee-spatial-audio',
    texture: 'electronic',
    category: 'arrangement',
    focus: 'spatial production orchestration',
    instruction: '/arrange Create a spatial audio and panning concept for ensemble-electronic texture; include foreground hierarchy, depth, motion arcs, and mono-compatibility risk.',
    expect: orchestrationNoteExpect(),
    rubric: ['Plans spatial hierarchy', 'Mentions depth and motion', 'Keeps musical foreground clear'],
  }),
];

const MEISTERKLASSE_TASKS: AssistantCatalogTask[] = [
  explicitTask({ id: 'meisterklasse_01_palestrina-species_counterpoint-audit', label: 'meisterklasse 1: Palestrina species audit', level: 'meisterklasse', sourceProfile: 'mdw-palestrina-species', texture: 'four-voice', category: 'analysis', focus: 'strict Renaissance counterpoint', instruction: '/analyze Diagnose a strict 16th-century Palestrina-style four-voice passage for species treatment, prepared dissonance, melodic arch, modal final, and forbidden Bach-like harmonic teleology.', expect: analysisExpect(), rubric: ['Distinguishes Palestrina from Bach', 'Checks prepared dissonance', 'Names modal cadence logic'] }),
  explicitTask({ id: 'meisterklasse_02_palestrina-cantus_strict-completion', label: 'meisterklasse 2: Palestrina cantus completion', level: 'meisterklasse', sourceProfile: 'mdw-palestrina-cantus', texture: 'two-voice', category: 'workflow', focus: 'strict modal counterpoint', instruction: 'Compose a strict two-voice Palestrina counterpoint above a cantus firmus; prioritize consonant framework, controlled passing dissonance, singable contour, and modal cadence.', expect: compositionExpect(['setKey']), rubric: ['Creates notes', 'Keeps modal contour', 'Avoids tonal teleology'] }),
  explicitTask({ id: 'meisterklasse_03_bach-vs-palestrina_style-discrimination', label: 'meisterklasse 3: Bach versus Palestrina', level: 'meisterklasse', sourceProfile: 'mdw-style-discrimination', texture: 'polyphonic', category: 'analysis', focus: 'historical style discrimination', instruction: '/analyze Compare a Bach-like imitative passage and a Palestrina-like modal passage: identify harmonic rhythm, dissonance logic, motivic sequencing, and cadence grammar.', expect: analysisExpect(), rubric: ['Compares style grammars', 'Names cadence differences', 'Discusses sequence and dissonance'] }),
  explicitTask({ id: 'meisterklasse_04_schenker-ursatz_deep-structure', label: 'meisterklasse 4: Schenker Ursatz', level: 'meisterklasse', sourceProfile: 'mdw-schenker-ursatz', texture: 'piano-two-staff', category: 'analysis', focus: 'Schenkerian deep structure', instruction: '/analyze Produce a Schenkerian diagnosis of a tonal period: identify Urlinie candidate, Bassbrechung, prolongations, middleground diminutions, and weak spots in the structural cadence.', expect: analysisAnnotationExpect('schenkerian'), rubric: ['Identifies Urlinie', 'Mentions Bassbrechung', 'Connects foreground and cadence'] }),
  explicitTask({ id: 'meisterklasse_05_schenker-recomposition_structural-edit', label: 'meisterklasse 5: Schenker recomposition', level: 'meisterklasse', sourceProfile: 'mdw-schenker-recomposition', texture: 'piano-two-staff', category: 'arrangement', focus: 'structural recomposition', instruction: '/arrange Rewrite a phrase so the surface figuration better projects the intended Ursatz while preserving the foreground motive and keeping all voice-leading defensible.', expect: advancedArrangementExpect(), rubric: ['Preserves motive', 'Clarifies structure', 'Keeps voice-leading defensible'] }),
  explicitTask({ id: 'meisterklasse_06_neo-riemannian_chromatic-mapping', label: 'meisterklasse 6: Neo-Riemannian mapping', level: 'meisterklasse', sourceProfile: 'mdw-neo-riemannian', texture: 'four-voice', category: 'analysis', focus: 'neo-Riemannian theory', instruction: '/analyze Map a chromatic progression using neo-Riemannian transformations; identify parsimonious voice leading, PLR chains, hexatonic regions, and functional-tonal ambiguities.', expect: analysisAnnotationExpect('neoRiemannian'), rubric: ['Names PLR logic', 'Discusses parsimonious motion', 'Identifies ambiguity'] }),
  explicitTask({ id: 'meisterklasse_07_forte-set_prime-form', label: 'meisterklasse 7: Forte prime form', level: 'meisterklasse', sourceProfile: 'mdw-forte-set', texture: 'polyphonic', category: 'analysis', focus: 'pitch-class set theory', instruction: '/analyze Diagnose a post-tonal miniature using pitch-class set theory: derive prime forms, Forte numbers, interval vectors, invariance, and registral partitioning.', expect: analysisAnnotationExpect('forteSet'), rubric: ['Derives set-class logic', 'Mentions Forte number', 'Connects register and invariance'] }),
  explicitTask({ id: 'meisterklasse_08_set-class_compositional-response', label: 'meisterklasse 8: Set-class response', level: 'meisterklasse', sourceProfile: 'mdw-set-class-response', texture: 'polyphonic', category: 'workflow', focus: 'post-tonal composition', instruction: 'Compose a compact post-tonal response using one specified set class as the generative cell; include inversional relation, registral contrast, and non-tonal cadence substitute.', expect: compositionExpect(['setTempo', 'addExpressionText']), rubric: ['Creates notes', 'Uses registral contrast', 'Avoids tonal cadence dependency'] }),
  explicitTask({ id: 'meisterklasse_09_spectral-low-c_harmony-derivation', label: 'meisterklasse 9: Spectral low C harmony', level: 'meisterklasse', sourceProfile: 'mdw-spectral-low-c', texture: 'full-orchestra', category: 'harmony', focus: 'spectral harmony derivation', instruction: 'Create a spectral harmony plan derived from the overtone series of low C; include C as the structural spectral root chord, partial selection, orchestral spacing, beating risk, and a clear timbral arrival.', expect: harmonyExpect('C'), rubric: ['Includes C root', 'Mentions partial logic', 'Keeps orchestration risk visible'] }),
  explicitTask({ id: 'meisterklasse_10_spectral-orchestration_timbre-analysis', label: 'meisterklasse 10: Spectral orchestration analysis', level: 'meisterklasse', sourceProfile: 'mdw-spectral-orchestration', texture: 'full-orchestra', category: 'analysis', focus: 'spectral orchestration', instruction: '/analyze Diagnose an orchestral cluster based on a harmonic series: identify spectral root, partial density, register saturation, masking, and possible instrumental redistribution.', expect: orchestrationNoteExpect('analysis'), rubric: ['Identifies spectral root', 'Discusses masking', 'Proposes redistribution'] }),
  explicitTask({ id: 'meisterklasse_11_lachenmann-extended-techniques_notation-repair', label: 'meisterklasse 11: Lachenmann notation repair', level: 'meisterklasse', sourceProfile: 'mdw-lachenmann-techniques', texture: 'ensemble', category: 'notation', focus: 'extended-technique notation', instruction: '/repair Clean up a contemporary notation passage with bow pressure, air sounds, key clicks, and noise components; preserve performability and avoid over-standardizing the notation.', expect: techniqueInstructionExpect(), rubric: ['Preserves extended technique', 'Avoids over-standardizing', 'Keeps performability'] }),
  explicitTask({ id: 'meisterklasse_12_aleatoric-mobile-form_structure-analysis', label: 'meisterklasse 12: Aleatoric mobile form', level: 'meisterklasse', sourceProfile: 'mdw-aleatoric-mobile-form', texture: 'ensemble', category: 'analysis', focus: 'aleatoric structure', instruction: '/analyze Evaluate an aleatoric mobile-form score for cue logic, performer agency, temporal alignment, repeat cells, and notation clarity.', expect: techniqueInstructionExpect('analysis'), rubric: ['Explains performer agency', 'Checks cue logic', 'Discusses temporal alignment'] }),
  explicitTask({ id: 'meisterklasse_13_contemporary-technique_playability-audit', label: 'meisterklasse 13: Contemporary technique audit', level: 'meisterklasse', sourceProfile: 'mdw-contemporary-technique', texture: 'ensemble', category: 'analysis', focus: 'contemporary playability', instruction: '/analyze Review a chamber passage using multiphonics, sul ponticello, scratch tone, and slap tongue for idiomatic feasibility and notation precision.', expect: techniqueInstructionExpect('analysis'), rubric: ['Checks feasibility', 'Names techniques', 'Keeps notation precise'] }),
  explicitTask({ id: 'meisterklasse_14_mahler-reduction_density-control', label: 'meisterklasse 14: Mahler reduction', level: 'meisterklasse', sourceProfile: 'mdw-mahler-reduction', texture: 'dense-score', category: 'arrangement', focus: 'late-Romantic reduction', instruction: '/arrange Reduce a Mahler-level orchestral texture into playable piano rehearsal score; preserve line hierarchy, harmonic pillars, contrapuntal cues, and color-signaling annotations.', expect: orchestrationNoteExpect(), rubric: ['Preserves hierarchy', 'Keeps harmonic pillars', 'Produces playable reduction'] }),
  explicitTask({ id: 'meisterklasse_15_strauss-orchestration_color-blend', label: 'meisterklasse 15: Strauss color blend', level: 'meisterklasse', sourceProfile: 'mdw-strauss-orchestration', texture: 'full-orchestra', category: 'analysis', focus: 'high-end orchestration', instruction: '/analyze Diagnose a Strauss-like orchestral blend: doubling strategy, register fusion, brass/woodwind balance, string divisi density, and voice-leading through color.', expect: orchestrationNoteExpect('analysis'), rubric: ['Explains blending', 'Checks balance', 'Connects color to voice-leading'] }),
  explicitTask({ id: 'meisterklasse_16_orchestral-mixture_revoicing', label: 'meisterklasse 16: Orchestral mixture revoicing', level: 'meisterklasse', sourceProfile: 'mdw-klangfarbenmischung', texture: 'full-orchestra', category: 'arrangement', focus: 'orchestral color revoicing', instruction: '/arrange Revoice a dense late-Romantic orchestral sonority for clearer Klangfarbenmischung while preserving harmonic function, melodic prominence, and dramatic contour.', expect: advancedArrangementExpect(), rubric: ['Clarifies color mixture', 'Preserves function', 'Keeps melody prominent'] }),
  explicitTask({ id: 'meisterklasse_17_modal-renaissance_cadence-repair', label: 'meisterklasse 17: Renaissance cadence repair', level: 'meisterklasse', sourceProfile: 'mdw-renaissance-cadence', texture: 'four-voice', category: 'harmony', focus: 'modal cadence grammar', instruction: 'Give a modal cadence repair plan for a Renaissance-style motet fragment; include F as the modal final chord, avoid tonal dominant habits, and clarify clausula behavior.', expect: harmonyExpect('F'), rubric: ['Includes modal final', 'Avoids tonal dominant habits', 'Clarifies clausula'] }),
  explicitTask({ id: 'meisterklasse_18_fugue-exposition_subject-answer', label: 'meisterklasse 18: Fugue exposition', level: 'meisterklasse', sourceProfile: 'mdw-fugue-exposition', texture: 'polyphonic', category: 'analysis', focus: 'Bach-style polyphony', instruction: '/analyze Review a Bach-style fugue exposition for subject-answer relation, countersubject invertibility, episode sequence logic, and stretto potential.', expect: analysisExpect(), rubric: ['Checks subject-answer', 'Tests countersubject', 'Names stretto potential'] }),
  explicitTask({ id: 'meisterklasse_19_invertible-counterpoint_octave-test', label: 'meisterklasse 19: Invertible counterpoint', level: 'meisterklasse', sourceProfile: 'mdw-invertible-counterpoint', texture: 'two-voice', category: 'analysis', focus: 'double counterpoint', instruction: '/analyze Test a double-counterpoint study for invertibility at the octave and tenth; identify hidden parallels, registral traps, and dissonance-treatment failures.', expect: analysisExpect(), rubric: ['Tests invertibility', 'Finds hidden parallels', 'Names registral traps'] }),
  explicitTask({ id: 'meisterklasse_20_microtonal-notation_pitch-system', label: 'meisterklasse 20: Microtonal notation', level: 'meisterklasse', sourceProfile: 'mdw-microtonal-notation', texture: 'ensemble', category: 'notation', focus: 'microtonal notation repair', instruction: '/repair Normalize a microtonal contemporary notation passage using quarter-tone accidentals, fingering cues, and explanatory legends without changing the intended pitch system.', expect: techniqueInstructionExpect(), rubric: ['Preserves pitch system', 'Mentions quarter-tone notation', 'Keeps legends clear'] }),
  explicitTask({ id: 'meisterklasse_21_form-process_modernist-analysis', label: 'meisterklasse 21: Modernist form process', level: 'meisterklasse', sourceProfile: 'mdw-modernist-process', texture: 'dense-score', category: 'analysis', focus: 'modernist form analysis', instruction: '/analyze Analyze a modernist large-form excerpt for process, proportional rhythm, registral dramaturgy, motivic saturation, and structural silence.', expect: analysisAnnotationExpect('form'), rubric: ['Discusses process', 'Names registral dramaturgy', 'Accounts for silence'] }),
  explicitTask({ id: 'meisterklasse_22_klangfarbenmelodie_orchestration', label: 'meisterklasse 22: Klangfarbenmelodie', level: 'meisterklasse', sourceProfile: 'mdw-klangfarbenmelodie', texture: 'ensemble', category: 'workflow', focus: 'timbre-as-form composition', instruction: 'Compose a short Klangfarbenmelodie transformation of a chromatic line; distribute timbre as form, preserve pitch identity, and mark instrument handoffs clearly.', expect: compositionExpect(['setTempo', 'addExpressionText']), rubric: ['Creates notes', 'Marks handoffs', 'Treats timbre as form'] }),
  explicitTask({ id: 'meisterklasse_23_ligeti-micropolyphony_texture-analysis', label: 'meisterklasse 23: Ligeti micropolyphony', level: 'meisterklasse', sourceProfile: 'mdw-ligeti-micropolyphony', texture: 'dense-score', category: 'analysis', focus: 'micropolyphonic texture', instruction: '/analyze Diagnose a micropolyphonic texture for canonic density, rhythmic phase drift, cluster evolution, register compression, and perceptual foreground.', expect: analysisExpect(), rubric: ['Names canonic density', 'Discusses phase drift', 'Finds perceptual foreground'] }),
  explicitTask({ id: 'meisterklasse_24_second-viennese_row-logic', label: 'meisterklasse 24: Second Viennese row logic', level: 'meisterklasse', sourceProfile: 'mdw-row-logic', texture: 'polyphonic', category: 'analysis', focus: 'twelve-tone analysis', instruction: '/analyze Analyze a twelve-tone passage for row forms, partitioning, combinatorial implications, registral emphasis, and hidden tonal references.', expect: analysisExpect(), rubric: ['Identifies row logic', 'Discusses partitioning', 'Notes tonal residues'] }),
  explicitTask({ id: 'meisterklasse_25_advanced-chorale_jury-defense', label: 'meisterklasse 25: Advanced chorale jury', level: 'meisterklasse', sourceProfile: 'mdw-advanced-chorale', texture: 'four-voice', category: 'analysis', focus: 'advanced tonal jury critique', instruction: '/analyze Defend or reject an advanced chromatic chorale realization like an MDW jury: structural cadence, tendency tones, enharmonic logic, spacing, and stylistic legitimacy.', expect: analysisExpect(), rubric: ['Judges cadence', 'Checks tendency tones', 'Evaluates stylistic legitimacy'] }),
  explicitTask({ id: 'meisterklasse_26_coltrane-changes_reharm-plan', label: 'meisterklasse 26: Coltrane changes', level: 'meisterklasse', sourceProfile: 'berklee-coltrane-changes', texture: 'lead-sheet', category: 'harmony', focus: 'Coltrane-cycle reharmonization', instruction: 'Create a professional reharmonization using Coltrane Changes; include D7 as the cycle pivot, preserve melody targets, map tonal centers, and control voice-leading.', expect: harmonyExpect('D7'), rubric: ['Includes D7', 'Controls cycle logic', 'Preserves melody targets'] }),
  explicitTask({ id: 'meisterklasse_27_chord-scale_tension-audit', label: 'meisterklasse 27: Chord-scale tension audit', level: 'meisterklasse', sourceProfile: 'berklee-chord-scale', texture: 'lead-sheet', category: 'analysis', focus: 'chord-scale theory', instruction: '/analyze Diagnose a modern jazz lead sheet using chord-scale theory: available tensions, avoid notes, modal color, melodic fit, and improvisational consequences.', expect: analysisAnnotationExpect('chordScale'), rubric: ['Names tensions', 'Discusses avoid notes', 'Connects scales to melody'] }),
  explicitTask({ id: 'meisterklasse_28_negative-harmony_melodic-reharm', label: 'meisterklasse 28: Negative harmony', level: 'meisterklasse', sourceProfile: 'berklee-negative-harmony', texture: 'lead-sheet', category: 'harmony', focus: 'negative harmony', instruction: 'Reharmonize a diatonic phrase using negative harmony; include Eb as the mirrored-axis color chord, preserve phrase direction, and keep the result playable for rhythm section.', expect: harmonyExpect('Eb'), rubric: ['Includes Eb', 'Names mirror logic', 'Keeps rhythm-section playability'] }),
  explicitTask({ id: 'meisterklasse_29_constant-structure_planing', label: 'meisterklasse 29: Constant structure planing', level: 'meisterklasse', sourceProfile: 'berklee-constant-structure', texture: 'piano-two-staff', category: 'harmony', focus: 'constant-structure harmony', instruction: 'Create a constant-structure harmony plan for a modal vamp; include Gm7 as the planed color chord, bass independence, register strategy, and color continuity.', expect: harmonyExpect('Gm7'), rubric: ['Includes Gm7', 'Explains planing', 'Keeps bass independent'] }),
  explicitTask({ id: 'meisterklasse_30_modal-interchange_film-ballad', label: 'meisterklasse 30: Modal interchange film ballad', level: 'meisterklasse', sourceProfile: 'berklee-film-ballad', texture: 'lead-sheet', category: 'harmony', focus: 'cinematic modal interchange', instruction: 'Reharmonize a cinematic ballad using modal interchange; include Ab as the borrowed predominant color, emotional function, and a controlled final arrival.', expect: harmonyExpect('Ab'), rubric: ['Includes Ab', 'Connects color to emotion', 'Controls arrival'] }),
  explicitTask({ id: 'meisterklasse_31_sync-points_tempo-map', label: 'meisterklasse 31: Sync-point tempo map', level: 'meisterklasse', sourceProfile: 'berklee-sync-points', texture: 'film-score', category: 'analysis', focus: 'film scoring tempo mapping', instruction: '/analyze Build a tempo-map diagnosis for a scoring cue: sync points, hit tolerance, barline placement, rubato strategy, and musical phrasing under picture.', expect: syncPointExpect(), rubric: ['Names sync points', 'Discusses hit tolerance', 'Keeps phrasing musical'] }),
  explicitTask({ id: 'meisterklasse_32_dialogue-underscoring_density-control', label: 'meisterklasse 32: Dialogue underscoring', level: 'meisterklasse', sourceProfile: 'berklee-dialogue-underscoring', texture: 'film-score', category: 'arrangement', focus: 'dialogue-safe scoring', instruction: '/arrange Thin an orchestral underscore under dialogue; preserve emotional subtext, avoid masking speech frequencies, and keep harmonic motion psychologically active.', expect: arrangementSyncPointExpect(), rubric: ['Protects speech', 'Keeps subtext', 'Maintains harmonic motion'] }),
  explicitTask({ id: 'meisterklasse_33_leitmotif_transformation', label: 'meisterklasse 33: Leitmotif transformation', level: 'meisterklasse', sourceProfile: 'berklee-leitmotif', texture: 'film-score', category: 'workflow', focus: 'leitmotif transformation', instruction: 'Compose three transformations of a leitmotif: heroic statement, corrupted minor version, and subliminal psychological underscore with clear intervallic identity.', expect: compositionExpect(['setTempo', 'addExpressionText']), rubric: ['Creates notes', 'Transforms motive', 'Preserves interval identity'] }),
  explicitTask({ id: 'meisterklasse_34_mickey-mousing_vs_psychological', label: 'meisterklasse 34: Mickey-Mousing versus psychology', level: 'meisterklasse', sourceProfile: 'berklee-scoring-semantics', texture: 'film-score', category: 'analysis', focus: 'film scoring rhetoric', instruction: '/analyze Compare Mickey-Mousing and psychological scoring in a cue; identify gesture timing, narrative function, orchestration density, and emotional subtext.', expect: analysisExpect(), rubric: ['Compares scoring modes', 'Names timing logic', 'Identifies subtext'] }),
  explicitTask({ id: 'meisterklasse_35_hybrid-orchestral_template', label: 'meisterklasse 35: Hybrid orchestral template', level: 'meisterklasse', sourceProfile: 'berklee-hybrid-template', texture: 'hybrid-orchestra', category: 'arrangement', focus: 'hybrid orchestration template', instruction: '/arrange Design a hybrid orchestral texture combining strings, brass pulses, synth bass, and processed percussion; keep orchestration, mix space, and motivic role coherent.', expect: orchestrationNoteExpect(), rubric: ['Blends orchestral and electronic roles', 'Keeps mix space coherent', 'Uses previewable commands'] }),
  explicitTask({ id: 'meisterklasse_36_synth-counterpoint_sound-design', label: 'meisterklasse 36: Synth counterpoint', level: 'meisterklasse', sourceProfile: 'berklee-synth-counterpoint', texture: 'electronic', category: 'workflow', focus: 'sound design as counterpoint', instruction: 'Compose a contrapuntal synth layer where oscillator movement, filter automation, and envelope shape function as independent musical voices.', expect: compositionExpect(['setTempo', 'addExpressionText']), rubric: ['Creates notes', 'Treats automation as voice', 'Keeps contrapuntal role clear'] }),
  explicitTask({ id: 'meisterklasse_37_spatial-audio_orchestration-plan', label: 'meisterklasse 37: Spatial audio orchestration', level: 'meisterklasse', sourceProfile: 'berklee-spatial-audio', texture: 'electronic', category: 'arrangement', focus: 'spatial production', instruction: '/arrange Create a spatial audio and panning concept for an ensemble-electronic texture; include foreground hierarchy, motion arcs, depth, and mono-compatibility risk.', expect: orchestrationNoteExpect(), rubric: ['Plans depth', 'Defines hierarchy', 'Mentions mono risk'] }),
  explicitTask({ id: 'meisterklasse_38_dilla-feel_microrhythm-analysis', label: 'meisterklasse 38: Dilla-feel microrhythm', level: 'meisterklasse', sourceProfile: 'berklee-dilla-feel', texture: 'rhythm-section', category: 'analysis', focus: 'microrhythm', instruction: '/analyze Diagnose a Dilla-feel groove: late snares, pushed hats, bass placement, swing asymmetry, grid deviation, and notational approximation.', expect: analysisExpect(), rubric: ['Identifies microtiming', 'Discusses grid deviation', 'Avoids over-quantizing'] }),
  explicitTask({ id: 'meisterklasse_39_neo-soul-polyrhythm_groove-compose', label: 'meisterklasse 39: Neo-Soul polyrhythm', level: 'meisterklasse', sourceProfile: 'berklee-neo-soul-polyrhythm', texture: 'rhythm-section', category: 'workflow', focus: 'Neo-Soul groove composition', instruction: 'Compose a Neo-Soul/R&B groove using 3-over-4 keyboard comping, displaced bass anticipation, laid-back snare, and reharmonized minor color.', expect: compositionExpect(['setTempo', 'addExpressionText']), rubric: ['Creates groove notes', 'Uses polyrhythmic idea', 'Mentions laid-back feel'] }),
  explicitTask({ id: 'meisterklasse_40_odd-meter-groove_form-design', label: 'meisterklasse 40: Odd-meter groove', level: 'meisterklasse', sourceProfile: 'berklee-odd-meter-groove', texture: 'rhythm-section', category: 'workflow', focus: 'odd-meter groove composition', instruction: 'Compose an odd-meter groove in 11/8 or 13/8 with phrase logic, backbeat illusion, bass ostinato, and improvisation-friendly form.', expect: compositionExpect(['setTempo', 'addExpressionText']), rubric: ['Creates notes', 'Mentions odd-meter phrase logic', 'Keeps groove readable'] }),
  explicitTask({ id: 'meisterklasse_41_modern-big-band_voicing-audit', label: 'meisterklasse 41: Modern big-band audit', level: 'meisterklasse', sourceProfile: 'berklee-big-band-voicing', texture: 'big-band', category: 'analysis', focus: 'big-band voicing', instruction: '/analyze Diagnose a modern big-band voicing for drop-2/drop-4 logic, upper-structure triads, sax soli blend, brass range, and rhythm-section interaction.', expect: analysisExpect(), rubric: ['Checks voicing logic', 'Mentions brass range', 'Connects rhythm section'] }),
  explicitTask({ id: 'meisterklasse_42_advanced-jazz-orchestration_revoicing', label: 'meisterklasse 42: Advanced jazz orchestration', level: 'meisterklasse', sourceProfile: 'berklee-jazz-orchestra', texture: 'big-band', category: 'arrangement', focus: 'jazz orchestra revoicing', instruction: '/arrange Revoice a dense jazz orchestra passage with upper structures, guide-tone clarity, shout-chorus energy, and playable brass endurance.', expect: orchestrationNoteExpect(), rubric: ['Clarifies guide tones', 'Keeps brass playable', 'Preserves shout energy'] }),
  explicitTask({ id: 'meisterklasse_43_game-music_adaptive-loop', label: 'meisterklasse 43: Adaptive game loop', level: 'meisterklasse', sourceProfile: 'berklee-game-music-loop', texture: 'game-score', category: 'analysis', focus: 'adaptive game music', instruction: '/analyze Design an adaptive game-music loop with horizontal resequencing, vertical layering, combat intensity states, and seamless harmonic re-entry.', expect: analysisExpect(), rubric: ['Explains adaptive layers', 'Mentions re-entry', 'Connects states to music'] }),
  explicitTask({ id: 'meisterklasse_44_trailer-cue_hybrid-arc', label: 'meisterklasse 44: Trailer cue arc', level: 'meisterklasse', sourceProfile: 'berklee-trailer-cue', texture: 'hybrid-orchestra', category: 'workflow', focus: 'hybrid trailer composition', instruction: 'Compose a trailer cue arc: pulse intro, harmonic rise, braam impact, choir layer, percussion escalation, and final button without generic stock harmony.', expect: compositionExpect(['setTempo', 'addExpressionText']), rubric: ['Creates cue material', 'Shapes arc', 'Avoids generic harmony'] }),
  explicitTask({ id: 'meisterklasse_45_electronic-texture_form-analysis', label: 'meisterklasse 45: Electronic texture analysis', level: 'meisterklasse', sourceProfile: 'berklee-electronic-texture', texture: 'electronic', category: 'analysis', focus: 'electronic production analysis', instruction: '/analyze Analyze an electronic production texture for spectral density, sidechain motion, noise bands, stereo image, automation form, and harmonic implication.', expect: analysisAnnotationExpect('form'), rubric: ['Discusses spectral density', 'Mentions stereo image', 'Connects automation to form'] }),
  explicitTask({ id: 'meisterklasse_46_sound-design_as_harmony', label: 'meisterklasse 46: Sound design as harmony', level: 'meisterklasse', sourceProfile: 'berklee-sound-design-harmony', texture: 'electronic', category: 'harmony', focus: 'sound design harmony', instruction: 'Create a harmonic plan where sound-design layers imply chord function; include C as the sub-root, filtered partials, distortion spectra, and resonant formants.', expect: harmonyExpect('C'), rubric: ['Includes C sub-root', 'Connects spectra to function', 'Keeps sound design harmonic'] }),
  explicitTask({ id: 'meisterklasse_47_click-track_conductor-map', label: 'meisterklasse 47: Click-track conductor map', level: 'meisterklasse', sourceProfile: 'berklee-conductor-map', texture: 'film-score', category: 'practice', focus: 'scoring-session preparation', instruction: '/practice Prepare a conductor-friendly scoring-session map with streamers, punches, tempo changes, bar counts, and rehearsal priorities for live orchestra.', expect: advancedPracticeExpect(['addRehearsalMarksEvery']), rubric: ['Sets rehearsal tempo/map', 'Adds rehearsal structure', 'Mentions streamers or punches'] }),
  explicitTask({ id: 'meisterklasse_48_vocal-production_counterline', label: 'meisterklasse 48: Vocal production counterline', level: 'meisterklasse', sourceProfile: 'berklee-vocal-production', texture: 'electronic', category: 'arrangement', focus: 'production-aware vocal arrangement', instruction: '/arrange Add a production-aware vocal counterline using doubles, harmonizer color, formant-shifted response, and register-safe backing vocals.', expect: advancedArrangementExpect(), rubric: ['Adds counterline role', 'Mentions production color', 'Keeps register safe'] }),
  explicitTask({ id: 'meisterklasse_49_jazz-fusion_metric-modulation', label: 'meisterklasse 49: Jazz-fusion metric modulation', level: 'meisterklasse', sourceProfile: 'berklee-jazz-fusion', texture: 'rhythm-section', category: 'analysis', focus: 'metric modulation', instruction: '/analyze Diagnose a jazz-fusion passage with metric modulation, odd subdivisions, harmonic sequence, solo-section navigation, and drummer-readable cue points.', expect: syncPointExpect(), rubric: ['Explains modulation', 'Mentions drummer cues', 'Connects harmony and form'] }),
  explicitTask({ id: 'meisterklasse_50_final-capstone_mdw-berklee-synthesis', label: 'meisterklasse 50: MDW/Berklee capstone', level: 'meisterklasse', sourceProfile: 'mdw-berklee-capstone', texture: 'full-orchestra', category: 'workflow', focus: 'MDW/Berklee synthesis', instruction: 'Compose a capstone cue combining strict contrapuntal motive, spectral harmony, advanced jazz reharmonization, hybrid orchestration, sync points, and spatial production logic.', expect: compositionExpect(['setTempo', 'addExpressionText']), rubric: ['Creates cue material', 'Combines MDW and Berklee constraints', 'Keeps final result previewable'] }),
];

function buildLevelTasks(
  level: AssistantTaskLevel,
  sources: SourceProfile[],
  templates: TaskTemplate[],
): AssistantCatalogTask[] {
  return sources.flatMap((source, sourceIndex) => templates.map((template, templateIndex) => {
    const ordinal = sourceIndex * templates.length + templateIndex + 1;
    return {
      id: `${level}_${String(ordinal).padStart(2, '0')}_${source.id}_${template.id}`,
      label: `${level} ${ordinal}: ${template.label} - ${source.title}`,
      level,
      sourceProfile: source.id,
      texture: source.texture,
      learningFocus: template.focus,
      instruction: template.instruction(source),
      category: template.category,
      expect: template.expect(source),
      comparisonRubric: template.rubric(source),
    };
  }));
}

export const ASSISTANT_TASK_CATALOG: AssistantCatalogTask[] = [
  ...buildLevelTasks('anfang', BEGINNER_SOURCES, BEGINNER_TEMPLATES),
  ...buildLevelTasks('mittel', MIDDLE_SOURCES, MIDDLE_TEMPLATES),
  ...buildLevelTasks('schwer', HARD_SOURCES, HARD_TEMPLATES),
  ...buildLevelTasks('richtig-schwer', EXTREME_SOURCES, EXTREME_TEMPLATES),
  ...SUPPLEMENTAL_TASKS,
  ...MEISTERKLASSE_TASKS,
];

export function catalogTasksByLevel(level: AssistantTaskLevel) {
  return ASSISTANT_TASK_CATALOG.filter((task) => task.level === level);
}

function inferredWorkflow(task: AssistantCatalogTask) {
  if (task.expect?.workflow) return task.expect.workflow;
  if (task.category === 'analysis') return 'analysis';
  if (task.category === 'arrangement') return 'arrangement-assist';
  if (task.category === 'practice') return 'practice-assist';
  if (task.category === 'notation') return 'notation-repair';
  if (task.category === 'structure') return 'structural-edit';
  if (task.category === 'layout') return 'layout-assist';
  if (task.category === 'lyrics') return 'lyrics';
  return 'general';
}

function commandForType(type: string, task: AssistantCatalogTask) {
  const check = task.expect?.commandChecks?.find((entry) => entry.type === type);
  const checkedValue = check?.equals ?? check?.includes ?? check?.oneOf?.[0];
  if (type === 'addChords') return { type, chords: typeof checkedValue === 'string' ? `1:C,2:${checkedValue},3:G7,4:C` : '1:C,2:G,3:Am,4:F' };
  if (type === 'fitPartToInstrument') return { type, instrument: checkedValue ?? 'clarinet-bb', partId: 'P1' };
  if (type === 'setKey') return { type, fifths: 0 };
  if (type === 'setTempo') return { type, bpm: 96 };
  if (type === 'addExpressionText') return { type, measureNumber: 1, text: 'cantabile', placement: 'above' };
  if (type === 'addAnalysisAnnotation') return { type, analysisType: checkedValue ?? 'other', measureNumber: 1, text: 'Visible analytical annotation' };
  if (type === 'addTechniqueInstruction') return { type, instrument: 'violin', startMeasureNumber: 1, endMeasureNumber: 2, text: 'Visible extended-technique instruction' };
  if (type === 'addSyncPoint') return { type, measureNumber: 1, timestampNum: 0, timestampDen: 4, timecode: '00:00:01:00', label: 'sync point', scoringIntent: 'hit picture while preserving phrasing' };
  if (type === 'addOrchestrationNote') return { type, partId: 'P1', partName: 'Strings', startMeasureNumber: 1, endMeasureNumber: 4, instruction: 'Visible orchestration and timbral-blend note' };
  if (type === 'insertNoteAt') return { type, measureNumber: 1, staffIndex: 1, voiceId: 1, timestampNum: 0, timestampDen: 4, step: 'C', octave: 5, alter: 0, durationType: 'quarter' };
  if (type === 'removeArticulations') return { type };
  if (type === 'applyPracticeProfile') return { type, profile: 'rehearsal' };
  return { type };
}

export function buildExpectedCatalogAssistantResult(task: AssistantCatalogTask): BenchmarkPipelineResult {
  const expectedTypes = task.expect?.commandTypes ?? [];
  const minCommands = task.expect?.minCommands ?? (task.expect?.allowNoCommands ? 0 : expectedTypes.length);
  const commands = [...expectedTypes];
  while (commands.length < minCommands) {
    commands.push(commands[0] ?? (task.category === 'practice' ? 'setTempo' : 'addExpressionText'));
  }

  return {
    workflow: inferredWorkflow(task),
    commands: task.expect?.allowNoCommands ? [] : commands.map((type) => commandForType(type, task)),
    validatorFindings: [],
    ambiguities: Array.from({ length: task.expect?.minAmbiguities ?? 0 }, (_, index) => `catalog ambiguity ${index + 1}`),
    confidence: task.expect?.confidence ?? 'high',
    requiresConfirmation: task.expect?.requiresConfirmation ?? commands.length > 0,
  };
}
