export interface TestCase {
  id: string;
  label: string;
  instruction: string;
  category?:
    | 'edit'
    | 'harmony'
    | 'analysis'
    | 'notation'
    | 'arrangement'
    | 'layout'
    | 'workflow'
    | 'structure'
    | 'practice'
    | 'lyrics';
  expect?: {
    workflow?: string;
    commandTypes?: string[];
    forbiddenCommandTypes?: string[];
    commandChecks?: Array<{
      type: string;
      field: string;
      equals?: string | number | boolean;
      includes?: string;
      oneOf?: Array<string | number | boolean>;
    }>;
    minCommands?: number;
    allowNoCommands?: boolean;
    requiresConfirmation?: boolean;
    confidence?: 'high' | 'medium' | 'low';
    minAmbiguities?: number;
    maxValidatorFindings?: number;
  };
}

export const BENCHMARK_SUITE: TestCase[] = [
  { id: 'remove_dynamics',      label: 'Remove dynamics',       instruction: 'Remove all dynamics markings (forte, piano, etc.)' },
  { id: 'remove_articulations', label: 'Remove articulations', instruction: 'Remove all articulations such as staccato and accents' },
  { id: 'remove_octave',        label: '8vb/8va entfernen',        instruction: 'Entferne alle Oktavierungen (8va und 8vb)' },
  { id: 'tempo_120',            label: 'Tempo → 120 BPM',          instruction: 'Setze das Tempo auf 120 BPM' },
  { id: 'key_d_major',          label: 'Key -> D major',           instruction: 'Change the key to D major' },
  { id: 'set_title',            label: 'Set title',                instruction: 'Change the title to "Benchmark"' },
  { id: 'remove_all',           label: 'Clean everything',         instruction: 'Remove all dynamics, articulations, and octave markings' },
];

/** Large musician-facing suite designed to differentiate Ollama model quality in the real chat pipeline. */
export const OLLAMA_MODEL_SUITE: TestCase[] = [
  {
    id: 'edit_multi_op_cleanup_key_tempo',
    label: 'Multi-op cleanup/key/tempo',
    instruction: 'Remove all dynamics and articulations, set the tempo to 90 BPM, and change the key to E-flat major',
    category: 'edit',
    expect: { commandTypes: ['setTempo', 'setKey', 'removeArticulations'], minCommands: 3 },
  },
  {
    id: 'harmony_progression_5_measures',
    label: 'Chord progression',
    instruction: 'Add chords: measure 1 G major, measure 2 E minor, measure 3 C major, measure 4 D major, measure 5 G major',
    category: 'harmony',
    expect: { commandTypes: ['addChords'], minCommands: 1 },
  },
  {
    id: 'edit_full_metadata_cleanup',
    label: 'Full metadata edit',
    instruction: 'Set the title to "Finale", tempo to 72, key to B-flat major, and remove all articulations and dynamics',
    category: 'edit',
    expect: { commandTypes: ['setTitle', 'setTempo', 'setKey', 'removeArticulations'], minCommands: 4 },
  },
  {
    id: 'edit_precise_tempo_title',
    label: 'Precise tempo + title',
    instruction: 'Change the tempo to exactly 132 BPM and set the title to "Allegro vivace"',
    category: 'edit',
    expect: { commandTypes: ['setTempo', 'setTitle'], minCommands: 2 },
  },
  {
    id: 'notation_deep_clean',
    label: 'Deep cleanup',
    instruction: 'Remove all dynamics, staccatos, accents, octave markings (8va and 8vb), and all repeat signs',
    category: 'notation',
    expect: { minCommands: 2 },
  },
  {
    id: 'harmony_chords_and_key',
    label: 'Chords + key',
    instruction: 'Change the key to A major and add chords: measure 1 A major, measure 2 D major, measure 3 E major, measure 4 A major',
    category: 'harmony',
    expect: { commandTypes: ['setKey', 'addChords'], minCommands: 2 },
  },
  {
    id: 'edit_exact_tempo_only',
    label: 'Exact tempo only',
    instruction: 'Set the tempo to exactly 108 BPM. Do not change anything else.',
    category: 'edit',
    expect: { commandTypes: ['setTempo'], minCommands: 1 },
  },
  {
    id: 'edit_title_subtitle_composer',
    label: 'Title/subtitle/composer',
    instruction: 'Set the title to "Nocturne Sketch", subtitle to "Version B", and composer to "nex-note benchmark".',
    category: 'edit',
    expect: { commandTypes: ['setTitle', 'setSubtitle', 'setComposer'], minCommands: 3 },
  },
  {
    id: 'edit_key_signature_only',
    label: 'Key signature only',
    instruction: 'Change only the key signature to F major. Do not transpose the notes.',
    category: 'edit',
    expect: { commandTypes: ['setKey'], minCommands: 1 },
  },
  {
    id: 'edit_transpose_to_key',
    label: 'Transpose to D major',
    instruction: 'Transpose the whole score to D major, including the written notes and the key signature.',
    category: 'edit',
    expect: { commandTypes: ['setKey', 'transposeDocumentChromatic'], minCommands: 2 },
  },
  {
    id: 'harmony_pop_progression',
    label: 'Pop progression',
    instruction: 'Add a simple pop chord progression: measure 1 C, measure 2 G, measure 3 A minor, measure 4 F.',
    category: 'harmony',
    expect: { commandTypes: ['addChords'], minCommands: 1 },
  },
  {
    id: 'harmony_jazz_turnaround',
    label: 'Jazz turnaround',
    instruction: 'Add jazz-style chords: measure 1 Cmaj7, measure 2 A7, measure 3 Dm7, measure 4 G7.',
    category: 'harmony',
    expect: { commandTypes: ['addChords'], minCommands: 1 },
  },
  {
    id: 'harmony_modal_minor',
    label: 'Minor reharmony',
    instruction: 'Make the harmony darker: change the key to D minor and add chords Dm, Bb, Gm, A7 over measures 1 to 4.',
    category: 'harmony',
    expect: { commandTypes: ['setKey', 'addChords'], minCommands: 2 },
  },
  {
    id: 'structure_time_signature',
    label: 'Time signature',
    instruction: 'Change the time signature to 3/4 starting at measure 1.',
    category: 'structure',
    expect: { workflow: 'structural-edit', commandTypes: ['setTimeSignature'], minCommands: 1 },
  },
  {
    id: 'structure_insert_measure',
    label: 'Insert measure',
    instruction: '/structure insert one empty measure after measure 4',
    category: 'structure',
    expect: { workflow: 'structural-edit', commandTypes: ['insertMeasureAfter'], minCommands: 1 },
  },
  {
    id: 'structure_repeat_signs',
    label: 'Repeat signs',
    instruction: '/structure add a start repeat at the beginning and an end repeat at measure 8',
    category: 'structure',
    expect: { workflow: 'structural-edit', minCommands: 2 },
  },
  {
    id: 'notation_repair_readability',
    label: 'Notation repair',
    instruction: '/repair improve notation readability: clean confusing accidentals, articulations, and notation clutter without changing the musical idea.',
    category: 'notation',
    expect: { workflow: 'notation-repair', allowNoCommands: true },
  },
  {
    id: 'notation_remove_accents',
    label: 'Remove accents',
    instruction: 'Remove accents and staccato markings, but keep slurs and dynamics.',
    category: 'notation',
    expect: { commandTypes: ['removeArticulations'], minCommands: 1 },
  },
  {
    id: 'notation_clear_markings',
    label: 'Clear markings',
    instruction: 'Remove dynamics and accents from the whole score.',
    category: 'notation',
    expect: { commandTypes: ['removeArticulations'], minCommands: 1 },
  },
  {
    id: 'analysis_feedback',
    label: 'Analysis + feedback',
    instruction: 'Analyze the current score and give short composition feedback: key, form, harmony, melody, rhythm, and one improvement.',
    category: 'analysis',
    expect: { workflow: 'analysis', allowNoCommands: true },
  },
  {
    id: 'analysis_playability',
    label: 'Playability check',
    instruction: 'Analyze whether the current piano part is playable and name the biggest technical risk.',
    category: 'analysis',
    expect: { workflow: 'analysis', allowNoCommands: true },
  },
  {
    id: 'technical_clarinet_playability',
    label: 'Clarinet playability',
    instruction: '/analyze assess the current line for B-flat clarinet: written range, awkward leaps, breathing risk, and one practical fix.',
    category: 'analysis',
    expect: { workflow: 'analysis', allowNoCommands: true, maxValidatorFindings: 0 },
  },
  {
    id: 'prof_technical_piano_span_voicing',
    label: 'Professor: piano span audit',
    instruction: '/analyze audit this as a piano professor: hand span, registral balance, hidden redistribution problems, and the single most urgent technical correction.',
    category: 'analysis',
    expect: { workflow: 'analysis', allowNoCommands: true, maxValidatorFindings: 0 },
  },
  {
    id: 'prof_technical_vocal_tessitura',
    label: 'Professor: vocal tessitura',
    instruction: '/analyze assess this melody for a lyric soprano: tessitura, passaggio pressure, breath shape, and one concrete rewrite suggestion.',
    category: 'analysis',
    expect: { workflow: 'analysis', allowNoCommands: true, maxValidatorFindings: 0 },
  },
  {
    id: 'prof_counterpoint_audit',
    label: 'Professor: counterpoint audit',
    instruction: '/analyze critique the current passage like a counterpoint professor: parallels, voice crossing, tendency-tone resolution, and phrase cadence strength.',
    category: 'analysis',
    expect: { workflow: 'analysis', allowNoCommands: true, maxValidatorFindings: 0 },
  },
  {
    id: 'prof_form_phrase_audit',
    label: 'Professor: phrase audit',
    instruction: '/analyze identify antecedent/consequent behavior, cadential weight, motivic repetition, and the weakest phrase-design decision.',
    category: 'analysis',
    expect: { workflow: 'analysis', allowNoCommands: true, maxValidatorFindings: 0 },
  },
  {
    id: 'analysis_harmony_only',
    label: 'Harmony analysis',
    instruction: '/analyze explain the current harmony and identify any unstable or missing cadence.',
    category: 'analysis',
    expect: { workflow: 'analysis', allowNoCommands: true },
  },
  {
    id: 'theory_cadence_secondary_dominant',
    label: 'Cadence + V/V',
    instruction: 'In C major, add a classical phrase harmony with a secondary dominant: measure 1 C, measure 2 D7, measure 3 G7, measure 4 C.',
    category: 'harmony',
    expect: {
      commandTypes: ['addChords'],
      commandChecks: [{ type: 'addChords', field: 'chords', includes: 'D7' }],
      minCommands: 1,
    },
  },
  {
    id: 'prof_theory_deceptive_cadence',
    label: 'Professor: deceptive cadence',
    instruction: 'Add a textbook deceptive cadence in C major: measure 1 C, measure 2 F, measure 3 G7, measure 4 A minor.',
    category: 'harmony',
    expect: {
      commandTypes: ['addChords'],
      commandChecks: [{ type: 'addChords', field: 'chords', includes: 'Am' }],
      minCommands: 1,
    },
  },
  {
    id: 'prof_theory_modal_mixture',
    label: 'Professor: modal mixture',
    instruction: 'Reharmonize measures 1-4 in C major using modal mixture: C, F minor, Ab major, G7.',
    category: 'harmony',
    expect: {
      commandTypes: ['addChords'],
      commandChecks: [
        { type: 'addChords', field: 'chords', includes: 'Fm' },
        { type: 'addChords', field: 'chords', includes: 'Ab' },
      ],
      minCommands: 1,
    },
  },
  {
    id: 'prof_theory_neapolitan_predominant',
    label: 'Professor: Neapolitan',
    instruction: 'In C minor, prepare a Neapolitan predominant: set the key to C minor and add chords Cm, Db, G7, Cm over measures 1-4.',
    category: 'harmony',
    expect: {
      commandTypes: ['setKey', 'addChords'],
      commandChecks: [{ type: 'addChords', field: 'chords', includes: 'Db' }],
      minCommands: 2,
    },
  },
  {
    id: 'prof_theory_augmented_sixth',
    label: 'Professor: augmented sixth',
    instruction: 'Add a late-Romantic cadence in C minor using the explicit chord labels Cm, Ger+6, G7, Cm in measures 1-4.',
    category: 'harmony',
    expect: {
      commandTypes: ['addChords'],
      commandChecks: [{ type: 'addChords', field: 'chords', includes: 'Ger+6' }],
      minCommands: 1,
    },
  },
  {
    id: 'prof_theory_pivot_modulation',
    label: 'Professor: pivot modulation',
    instruction: 'Modulate from C major to G major over four measures: C, Am, D7, G, and change the key signature to G major at measure 4.',
    category: 'harmony',
    expect: {
      commandTypes: ['setKey', 'addChords'],
      commandChecks: [{ type: 'addChords', field: 'chords', includes: 'D7' }],
      minCommands: 2,
    },
  },
  {
    id: 'prof_theory_tritone_substitution',
    label: 'Professor: tritone sub',
    instruction: 'Give measures 1-4 a jazz dominant chain with a tritone substitution: Cmaj7, A7, Db7, Cmaj7.',
    category: 'harmony',
    expect: {
      commandTypes: ['addChords'],
      commandChecks: [{ type: 'addChords', field: 'chords', includes: 'Db7' }],
      minCommands: 1,
    },
  },
  {
    id: 'prof_theory_pedal_point',
    label: 'Professor: pedal point',
    instruction: 'Add a tonic-pedal reharmonization over measures 1-4 with C, F/C, G/C, C chord symbols.',
    category: 'harmony',
    expect: {
      commandTypes: ['addChords'],
      commandChecks: [{ type: 'addChords', field: 'chords', includes: 'G/C' }],
      minCommands: 1,
    },
  },
  {
    id: 'practice_rehearsal_version',
    label: 'Practice version',
    instruction: '/practice create a rehearsal-friendly version with a slower tempo and rehearsal marks every four measures.',
    category: 'practice',
    expect: { workflow: 'practice-assist', minCommands: 2 },
  },
  {
    id: 'practice_roomy_layout',
    label: 'Roomy practice layout',
    instruction: 'Prepare a roomy practice version for rehearsal with clear spacing and a conservative tempo.',
    category: 'practice',
    expect: { workflow: 'practice-assist', minCommands: 1 },
  },
  {
    id: 'prof_practice_etude_marking',
    label: 'Professor: etude marking',
    instruction: '/practice turn this into a conservatory etude handout: slower tempo, rehearsal marks every four measures, and a roomy practice profile.',
    category: 'practice',
    expect: { workflow: 'practice-assist', minCommands: 2, requiresConfirmation: true },
  },
  {
    id: 'layout_system_break',
    label: 'System break',
    instruction: '/layout add a system break before measure 8',
    category: 'layout',
    expect: { workflow: 'layout-assist', commandTypes: ['setSystemBreak'], minCommands: 1 },
  },
  {
    id: 'layout_page_break',
    label: 'Page break',
    instruction: '/layout add a page break before measure 16',
    category: 'layout',
    expect: { workflow: 'layout-assist', commandTypes: ['setPageBreak'], minCommands: 1 },
  },
  {
    id: 'layout_cleanup',
    label: 'Layout cleanup',
    instruction: '/layout-cleanup tidy up the score layout',
    category: 'layout',
    expect: { workflow: 'layout-cleanup', allowNoCommands: true },
  },
  {
    id: 'lyrics_add_verse',
    label: 'Lyrics verse',
    instruction: '/lyrics add verse 2 text "la la la la" to the selected phrase',
    category: 'lyrics',
    expect: { workflow: 'lyrics', allowNoCommands: true },
  },
  {
    id: 'minimal_change_constraint',
    label: 'Minimal changes',
    instruction: 'Make only minimal changes to improve readability. Do not rewrite the music.',
    category: 'workflow',
    expect: { allowNoCommands: true },
  },
  {
    id: 'workflow_keep_melody_change_harmony',
    label: 'Keep melody',
    instruction: 'Keep the melody unchanged but replace the harmony with a warmer progression.',
    category: 'workflow',
    expect: { workflow: 'arrangement-assist', minCommands: 1 },
  },
  {
    id: 'composition_brief_missing',
    label: 'Composition brief needed',
    instruction: 'Schreibe eine achttaktige Melodie.',
    category: 'workflow',
    expect: {
      allowNoCommands: true,
      confidence: 'low',
      minAmbiguities: 2,
      forbiddenCommandTypes: ['insertNoteAt'],
    },
  },
  {
    id: 'prof_composition_period_dolce',
    label: 'Professor: period melody',
    instruction: 'Compose an original 8-bar classical period in C major for right-hand piano, moderato, dolce, with an antecedent half cadence and consequent authentic cadence.',
    category: 'workflow',
    expect: {
      commandTypes: ['insertNoteAt', 'setTempo', 'addExpressionText'],
      forbiddenCommandTypes: ['addChords'],
      minCommands: 8,
      requiresConfirmation: true,
    },
  },
  {
    id: 'prof_composition_motif_variation',
    label: 'Professor: motif variation',
    instruction: 'Compose a four-bar motivic variation from the cell C-D-E-G: use sequence, inversion hint, and varied rhythm rather than plain quarter notes.',
    category: 'workflow',
    expect: {
      commandTypes: ['insertNoteAt'],
      forbiddenCommandTypes: ['addChords'],
      minCommands: 6,
      requiresConfirmation: true,
    },
  },
  {
    id: 'prof_composition_modal_theme',
    label: 'Professor: modal theme',
    instruction: 'Compose a 6-bar D Dorian theme for flute at quarter=96, light articulation, mostly stepwise with one expressive leap.',
    category: 'workflow',
    expect: {
      commandTypes: ['insertNoteAt', 'setTempo', 'setKey'],
      minCommands: 6,
      requiresConfirmation: true,
    },
  },
  {
    id: 'prof_composition_bass_line',
    label: 'Professor: bass line',
    instruction: 'Write an original walking bass outline for measures 1-4 in C: target chord tones on strong beats and chromatic approach tones into each bar.',
    category: 'workflow',
    expect: {
      commandTypes: ['insertNoteAt'],
      minCommands: 6,
      requiresConfirmation: true,
    },
  },
  {
    id: 'workflow_explain_changes',
    label: 'Explain changes',
    instruction: 'Make a small improvement to the score and explain every change briefly.',
    category: 'workflow',
    expect: { allowNoCommands: true },
  },
  {
    id: 'inline_piano_arrangement',
    label: 'Inline piano arrangement',
    instruction: 'Arrangiere diese Melodie für Klavier: C4 D4 E4 G4 | E4 D4 C4. Add simple chords and a left-hand accompaniment.',
    category: 'arrangement',
    expect: { workflow: 'arrangement-assist', minCommands: 1 },
  },
  {
    id: 'arrangement_generalbass_three_voice',
    label: 'Generalbass 3 voices',
    instruction: '/arrange Mach aus der aktuellen Melodie einen dreistimmigen Generalbass-Satz mit sauberer Aussenstimmenfuehrung und ohne verdoppelte Leittoene.',
    category: 'arrangement',
    expect: {
      workflow: 'arrangement-assist',
      commandTypes: ['addChords', 'addExpressionText'],
      minCommands: 2,
      requiresConfirmation: true,
      maxValidatorFindings: 0,
    },
  },
  {
    id: 'prof_arrangement_chorale_repair',
    label: 'Professor: chorale repair',
    instruction: '/arrange Realize the current melody as a strict three-voice chorale phrase: no parallel fifths, resolve leading tones, keep soprano clear, and use conservative harmony.',
    category: 'arrangement',
    expect: {
      workflow: 'arrangement-assist',
      commandTypes: ['addChords', 'addExpressionText'],
      minCommands: 2,
      requiresConfirmation: true,
      maxValidatorFindings: 0,
    },
  },
  {
    id: 'prof_arrangement_jazz_close_ii_v_i',
    label: 'Professor: jazz close voicing',
    instruction: '/arrange Reharmonize the current idea as a close-voiced jazz ii-V-I with guide tones, compact upper voices, and a clear melody lead.',
    category: 'arrangement',
    expect: {
      workflow: 'arrangement-assist',
      commandTypes: ['addChords', 'addExpressionText'],
      minCommands: 2,
      requiresConfirmation: true,
      maxValidatorFindings: 0,
    },
  },
  {
    id: 'prof_arrangement_alberti_piano',
    label: 'Professor: Alberti piano',
    instruction: '/arrange Turn the current melody into a Classical piano texture with right-hand melody and left-hand Alberti-bass support; keep the harmony simple and playable.',
    category: 'arrangement',
    expect: {
      workflow: 'arrangement-assist',
      commandTypes: ['addChords', 'addExpressionText'],
      minCommands: 2,
      requiresConfirmation: true,
    },
  },
  {
    id: 'prof_arrangement_clarinet_transposition',
    label: 'Professor: clarinet arrangement',
    instruction: '/arrange arrange the current melody for B-flat clarinet with idiomatic range, written transposition, breath-aware phrasing, and simple harmonic support.',
    category: 'arrangement',
    expect: {
      workflow: 'arrangement-assist',
      commandTypes: ['addChords', 'addExpressionText', 'fitPartToInstrument'],
      commandChecks: [{ type: 'fitPartToInstrument', field: 'instrument', equals: 'clarinet-bb' }],
      minCommands: 3,
      requiresConfirmation: true,
    },
  },
  {
    id: 'prof_arrangement_countermelody',
    label: 'Professor: countermelody',
    instruction: '/arrange keep the main melody intact and add a restrained countermelody concept below it, avoiding contrary-motion cliches and preserving phrase breathing.',
    category: 'arrangement',
    expect: {
      workflow: 'arrangement-assist',
      commandTypes: ['addChords', 'addExpressionText'],
      minCommands: 2,
      requiresConfirmation: true,
    },
  },
  {
    id: 'prof_arrangement_reduce_texture',
    label: 'Professor: reduction',
    instruction: '/arrange reduce the current score into a rehearsal piano reduction: melody audible, bass functional, inner material thinned, no flashy reharmonization.',
    category: 'arrangement',
    expect: {
      workflow: 'arrangement-assist',
      commandTypes: ['addChords', 'addExpressionText'],
      minCommands: 2,
      requiresConfirmation: true,
    },
  },
  {
    id: 'arrangement_string_trio',
    label: 'String trio arrangement',
    instruction: '/arrange arrange the current musical idea for violin, cello, and piano with clear melody and simple support.',
    category: 'arrangement',
    expect: { workflow: 'arrangement-assist', minCommands: 1 },
  },
  {
    id: 'arrangement_beginner_piano',
    label: 'Beginner piano',
    instruction: '/arrange simplify the current score into a beginner-friendly piano version.',
    category: 'arrangement',
    expect: { workflow: 'arrangement-assist', minCommands: 1 },
  },
  {
    id: 'arrangement_cinematic',
    label: 'Cinematic version',
    instruction: '/arrange make the current idea more cinematic with richer harmony, stronger dynamics, and a fuller texture.',
    category: 'arrangement',
    expect: { workflow: 'arrangement-assist', minCommands: 1 },
  },
];
