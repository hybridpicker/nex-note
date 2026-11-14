export type AiWorkflowKind =
  | 'general'
  | 'arrangement-assist'
  | 'cleanup'
  | 'notation-repair'
  | 'structural-edit'
  | 'lyrics'
  | 'analysis'
  | 'practice-assist'
  | 'midi-reconstruct'
  | 'layout-assist'
  | 'layout-cleanup';

export interface ResolvedAiWorkflow {
  kind: AiWorkflowKind;
  label: string;
  cleanedMessage: string;
  systemGuidance: string;
  preferredPlanPrefixes: string[];
}

const EXPLICIT_WORKFLOW_PREFIXES: Array<{ prefix: string; kind: AiWorkflowKind }> = [
  { prefix: '/arrange', kind: 'arrangement-assist' },
  { prefix: '/cleanup', kind: 'cleanup' },
  { prefix: '/repair', kind: 'notation-repair' },
  { prefix: '/structure', kind: 'structural-edit' },
  { prefix: '/lyrics', kind: 'lyrics' },
  { prefix: '/analyze', kind: 'analysis' },
  { prefix: '/practice', kind: 'practice-assist' },
  { prefix: '/midi-reconstruct', kind: 'midi-reconstruct' },
  { prefix: '/layout-cleanup', kind: 'layout-cleanup' },
  { prefix: '/layout', kind: 'layout-assist' },
];

const WORKFLOW_CONFIG: Record<AiWorkflowKind, Omit<ResolvedAiWorkflow, 'cleanedMessage'>> = {
  general: {
    kind: 'general',
    label: 'General edit',
    systemGuidance: [
      'Use the most direct semantic command batch for the requested edit.',
      'Prefer precise note/range targeting when selection context is available.',
    ].join(' '),
    preferredPlanPrefixes: ['Inspect context', 'Apply semantic edit'],
  },
  'arrangement-assist': {
    kind: 'arrangement-assist',
    label: 'Arrangement assistant',
    systemGuidance: [
      'This is an arrangement workflow.',
      'Use the existing melody in the score context, selected passage, or inline user text as the musical source.',
      'Prefer readable, idiomatic musician-facing results with practical defaults such as playable piano accompaniment when instrumentation is unspecified.',
      'Keep the melody clear and avoid blocking clarification questions unless the ambiguity materially changes the arrangement.',
      'If the command system cannot encode the full arrangement literally, still return the strongest supported musical edit batch and explain the arrangement direction concisely.',
    ].join(' '),
    preferredPlanPrefixes: ['Inspect melody source', 'Shape an idiomatic arrangement'],
  },
  cleanup: {
    kind: 'cleanup',
    label: 'Cleanup helper',
    systemGuidance: [
      'This is a cleanup workflow.',
      'Prefer conservative normalization edits that remove clutter or inconsistency without changing musical intent.',
      'If cleanup would remove expressive markings or touch many measures, keep the plan explicit so the preview step is understandable.',
    ].join(' '),
    preferredPlanPrefixes: ['Review clutter', 'Normalize notation'],
  },
  'notation-repair': {
    kind: 'notation-repair',
    label: 'Notation repair helper',
    systemGuidance: [
      'This is a notation-repair workflow.',
      'Prioritize commands that fix notation consistency, lyric continuity, repeats, tuplets, slurs, and other validator-facing issues.',
      'Prefer the smallest batch that resolves the concrete problem.',
    ].join(' '),
    preferredPlanPrefixes: ['Inspect issue', 'Repair notation'],
  },
  'structural-edit': {
    kind: 'structural-edit',
    label: 'Structural edit helper',
    systemGuidance: [
      'This is a structural editing workflow.',
      'Focus on measure, repeat, ending, key, time, clef, and part-structure commands.',
      'Structural edits should be described clearly in the plan because they often need confirmation.',
    ].join(' '),
    preferredPlanPrefixes: ['Inspect structure', 'Apply structural change'],
  },
  lyrics: {
    kind: 'lyrics',
    label: 'Lyrics helper',
    systemGuidance: [
      'This is a lyrics workflow.',
      'Prefer setLyricLine or addLyric commands and preserve verse numbering and syllabic continuity.',
      'If the exact note target is unclear, state the ambiguity instead of guessing.',
    ].join(' '),
    preferredPlanPrefixes: ['Inspect lyric target', 'Apply lyric edit'],
  },
  analysis: {
    kind: 'analysis',
    label: 'Musician analysis helper',
    systemGuidance: [
      'This is an analysis workflow.',
      'Prefer diagnosing range, tessitura, density, leaps, and notation risks over changing the score.',
      'If no score change is required, return an empty command list with a concise musician-facing explanation.',
    ].join(' '),
    preferredPlanPrefixes: ['Inspect musical scope', 'Summarize musician risks'],
  },
  'practice-assist': {
    kind: 'practice-assist',
    label: 'Practice assistant',
    systemGuidance: [
      'This is a practice workflow.',
      'Favor rehearsal-oriented suggestions such as rehearsal marks, slower tempo, transposed parts, and simplified passages.',
      'If the request is exploratory, return an empty command list plus a concrete practice recommendation.',
    ].join(' '),
    preferredPlanPrefixes: ['Inspect difficulty hotspots', 'Prepare practice-friendly changes'],
  },
  'midi-reconstruct': {
    kind: 'midi-reconstruct',
    label: 'MIDI reconstruction assistant',
    systemGuidance: [
      'This is a MIDI reconstruction workflow.',
      'MIDI does not preserve complete notation layout, so prefer conservative reconstruction that improves readability without rewriting the musical material.',
      'Use semantic metadata, layout, spacing, clef, tempo, and part-name commands when useful.',
      'Keep rhythm and voice reconstruction grounded in the converted score and MIDI import analysis.',
    ].join(' '),
    preferredPlanPrefixes: ['Analyze MIDI import', 'Clean notation structure', 'Optimize layout'],
  },
  'layout-assist': {
    kind: 'layout-assist',
    label: 'Layout assistant',
    systemGuidance: [
      'This is a layout-assistance workflow.',
      'Use only semantic layout commands such as setSystemBreak, setPageBreak, or setMeasureLayoutHint.',
      'Treat layout changes as presentation guidance, not hidden music changes.',
    ].join(' '),
    preferredPlanPrefixes: ['Inspect layout area', 'Apply layout hint'],
  },
  'layout-cleanup': {
    kind: 'layout-cleanup',
    label: 'Layout cleanup assistant',
    systemGuidance: [
      'This is a layout-cleanup workflow.',
      'Prefer cleaning up the score layout by normalizing system breaks, page breaks, and staff spacing hints.',
      'Keep the result previewable so the user can confirm the presentation changes before apply.',
    ].join(' '),
    preferredPlanPrefixes: ['Inspect current spacing', 'Prepare cleanup hints'],
  },
};

function inferWorkflowKind(message: string): AiWorkflowKind {
  const normalized = message.toLowerCase();

  if (
    /\b(compos(?:e|ing|ition)|write|draft|generate|create|komponier(?:e|en|t)?|schreib(?:e|en|t)?)\b/.test(normalized)
    && /\b(melody|melodie|period|response|variation|transformation|theme|phrase|motive|motiv|composition|capstone|fugato|miniature|modulation|study|counterpoint|cue|groove|layer|arc|leitmotif|klangfarbenmelodie|stück|stueck|piece)\b/.test(normalized)
    && !/\b(reharmoni[sz]e|reharmon(?:is(?:e|ing)|isieren)|chord symbols?|akkordsymbole?)\b/.test(normalized)
  ) return 'general';

  if (/\b(arrang(?:e|ement|ing|ed|iere|ieren|iert)|reharmoni[sz]e|reharmon(?:is(?:e|ing)|isieren)|accompan(?:iment|y)|begleit(?:e|en|et|ung)?|voic(?:e|ing)|satz|harmonis(?:e|ing|iere|ieren|iert))\b/.test(normalized)) return 'arrangement-assist';
  // Arranger vocabulary that names the result instead of the verb: a second voice, a counter-melody,
  // a four-part or piano setting. German umlauts sit outside `\b`, hence the lookarounds.
  if (/(?<![a-zäöüß])(second voice|zweite stimme|2\. stimme|gegenstimme|gegenmelodie|counter[- ]?melody|descant|four[- ]part|vierstimmig(?:e[nrs]?)?|dreistimmig(?:e[nrs]?)?|satb|chorsatz|klaviersatz|bläsersatz|blaesersatz|streichersatz|horn section|lead sheet voicing|voicings?)(?![a-zäöüß])/.test(normalized)) return 'arrangement-assist';
  if (/\b(lyric|lyrics|verse|silbe|text underlay|syllabic)\b/.test(normalized)) return 'lyrics';
  if (/\b(orchestrat(?:e|ion|ing)|reduction|reduce|mahler|strauss|hybrid orchestra|timbral blend|spatial audio|spatial production)\b/.test(normalized)) return 'arrangement-assist';
  if (/\b(schenker|roman numeral|forte|set[- ]class|chord[- ]scale|neo[- ]riemannian|plr|sync point|hit point|timecode|dialogue|tempo map|analy[sz]e|analyse|umfang|range|tessitura|playable|spielbar|singable|singbar)\b/.test(normalized)) return 'analysis';
  if (/\b(lachenmann|extended technique|aleatoric|contemporary notation|bow pressure|air sound|key click|scratch tone|sul ponticello|multiphonic)\b/.test(normalized)) return 'notation-repair';
  if (/\b(practice|probe|rehearsal|üben|ueben|exercise|study part)\b/.test(normalized)) return 'practice-assist';
  if (/\b(midi|mid)\b/.test(normalized) && /\b(reconstruct|import|cleanup|clean|notation|layout|quantiz|quantis|rekonstru|aufraeum|aufräum)\b/.test(normalized)) return 'midi-reconstruct';
  if (/\b(layout|spacing|staff spacing|system break|page break)\b/.test(normalized) && /\b(clean(?:\s*up)?|tidy|polish|organize|aufraeum|aufräum|ordn|sauber)\b/.test(normalized)) return 'layout-cleanup';
  if (/\b(layout|spacing|system break|page break|line break|staff spacing|collision|make room)\b/.test(normalized)) return 'layout-assist';
  if (/\b(repair|fix notation|cleanup notation|validator|continuity|dangling|broken slur|wrong ending)\b/.test(normalized)) return 'notation-repair';
  if (/\b(insert measure|delete measure|repeat|ending|volta|structure|time signature|clef|key signature|part name)\b/.test(normalized)) return 'structural-edit';
  if (/\b(clean up|cleanup|remove clutter|simplify markings|clear articulations|remove dynamics)\b/.test(normalized)) return 'cleanup';
  return 'general';
}

export function resolveAiWorkflow(message: string): ResolvedAiWorkflow {
  const trimmed = message.trim();
  const explicit = EXPLICIT_WORKFLOW_PREFIXES.find((entry) => trimmed.toLowerCase().startsWith(entry.prefix));
  const cleanedMessage = explicit ? trimmed.slice(explicit.prefix.length).trim() : trimmed;
  const kind = explicit?.kind ?? inferWorkflowKind(trimmed);
  const config = WORKFLOW_CONFIG[kind];
  return {
    ...config,
    cleanedMessage: cleanedMessage || trimmed,
  };
}

export function normalizeAiPlan(plan: string[] | undefined, workflow: ResolvedAiWorkflow) {
  const rawPlan = Array.isArray(plan)
    ? plan.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0).map((entry) => entry.trim())
    : [];

  if (rawPlan.length > 0) return rawPlan;
  return [...workflow.preferredPlanPrefixes];
}
