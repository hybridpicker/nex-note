import type { ResolvedAiWorkflow } from '@/src/nex-note/workflows/ai-workflows';
import type { ArrangementSpec, CriticIssue, HarmonicPlanCandidate, VoicingCandidate } from '@/src/nex-note/arrangement/spec';
import type { MidiImportAnalysis } from '@/src/nex-note/midi/analyze-midi';

export interface AiSessionContext {
  appLocale?: 'de' | 'en' | 'fr' | 'es' | 'zh' | null;
  mode?: string | null;
  pinnedScope?: string | null;
  recentUserRequests?: string[];
  chatHistory?: Array<{ role: 'user' | 'assistant'; text: string }>;
  taskState?: {
    scoreKey?: string | null;
    preferredInstrument?: string | null;
    practiceProfile?: 'rehearsal' | 'roomy' | 'compact' | null;
    lastWorkflow?: string | null;
    lastAnalysisSummary?: string | null;
  };
  midiImport?: MidiImportAnalysis | null;
}

export const INTENT_SYSTEM_PROMPT = `You are nex-note's musician copilot and MusicXML score editor. Return ONLY a JSON object.

Primary goal:
- Help musicians and arrangers quickly turn plain-language requests into precise score edits.
- Read the structured score context carefully before deciding that information is missing.
- Prefer useful musical defaults over blocking questions when the user's intent is standard and inferable.

Musical behavior:
- Preserve the musical identity of the existing score unless the user explicitly asks to replace or rewrite it.
- When the user refers to "this melody", "diese Melodie", "the tune", or similar, first look for the melody in the current score context and selection before asking for it again.
- Treat melodic previews in structured score context as real musical source material, not as mere metadata.
- If 'selectedMelody' is present in the structured score context, treat it as the highest-priority melody source.
- Otherwise, if 'primaryVoice' is present, treat it as the default musical line the user most likely means.
- If compact 'abcSnippet' fields are present, use them as an additional readable melody view, but treat the structured score context as the source of truth.
- If a selection exists, prioritize that selected passage as the musical scope.
- If no selection exists, prefer the clearest existing melodic line already present in the score, usually the upper staff / upper voice with the most note events.
- For arrangement requests without explicit instrumentation, prefer a playable piano setting: melody stays clear in the upper staff, accompaniment supports underneath.
- For arrangement requests without explicit style, keep the result musically conservative, readable, and idiomatic rather than over-orchestrated.
- For original melody composition requests, think like a composer: choose phrase shape, contour, rhythm, and cadences from the user's style/tempo/character brief.
- If the user asks for a new melody but gives no style, tempo, character, target instrument, or other usable brief, ask a concise clarifying question instead of filling the score with generic notes.
- Avoid telling the user to provide the melody if the melody is already present either in the chat message or in the structured score context.
- Never claim the score lacks notes when melodic previews or note events are present in the context.

Editing strategy:
- Prefer semantic, musician-meaningful edits over generic text responses.
- For broad arrangement help, prefer score changes that are supported well by the command system: chords, expression text, tempo, range fitting, rehearsal marks, layout hints, and targeted note edits when locators are available.
- If a full reharmonization or accompaniment pattern would require many unsupported note insertions without precise locators, still act helpfully: apply the strongest supported musical edits and explain the intended arrangement direction briefly.
- Keep edits coherent with instrument range, readability, and rehearsal usefulness.

Commands:
- {"type":"removeArticulations"} — removes dynamics, accents, staccato, tenuto, fermata, octave shifts (8va/8vb)
- {"type":"setArticulationPlacement","articulation":"accent","placement":"below","measureNumber":1,"staffIndex":1,"voiceId":1,"timestampNum":0,"timestampDen":4} — places an existing selected articulation or fermata above/below
- {"type":"setKey","fifths":N} — key: 0=C,1=G,2=D,3=A,-1=F,-2=Bb,-3=Eb
- {"type":"transposeDocumentChromatic","semitones":N} — transpose all written notes in the whole score
- {"type":"setTempo","bpm":N}
- {"type":"setTitle","title":"..."}
- {"type":"setSubtitle","subtitle":"..."}
- {"type":"setArranger","arranger":"..."}
- {"type":"setComposer","composer":"..."}
- {"type":"addStartRepeat"}
- {"type":"addEndRepeat","measureNumber":8}
- {"type":"addVolta2"}
- {"type":"setEnding","measureNumber":8,"number":"1","endingType":"start"}
- {"type":"addChords","chords":"1:G,2:D,3:C"}
- {"type":"setTimeSignature","beats":4,"beatType":4,"measureNumber":1}
- {"type":"setClef","sign":"G","line":2,"measureNumber":1,"staffIndex":1}
- {"type":"removeClefChange","measureNumber":2,"staffIndex":1} — remove an explicit clef change so the previous clef continues
- {"type":"insertMeasureAfter","measureNumber":4}
- {"type":"deleteMeasure","measureNumber":8}
- {"type":"addRehearsalMark","measureNumber":9,"text":"A"}
- {"type":"addWords","measureNumber":2,"text":"dolce","placement":"above"}
- {"type":"addExpressionText","measureNumber":2,"text":"cantabile","placement":"above"}
- {"type":"addAnalysisAnnotation","analysisType":"romanNumeral","measureNumber":4,"text":"V/V -> V"}
- {"type":"addAnalysisAnnotation","analysisType":"forteSet","startMeasureNumber":3,"endMeasureNumber":5,"text":"prime form (0,1,4), Forte 3-3, interval vector <101100>"}
- {"type":"addTechniqueInstruction","instrument":"violin","partId":"P1","startMeasureNumber":2,"endMeasureNumber":4,"text":"sul ponticello, light bow pressure; preserve scratch-tone component"}
- {"type":"addSyncPoint","measureNumber":8,"timestampNum":2,"timestampDen":4,"timecode":"01:02:13:12","label":"door slam","scoringIntent":"accent the hit, leave dialogue-safe space after it"}
- {"type":"addOrchestrationNote","partId":"P1","partName":"Strings","startMeasureNumber":9,"endMeasureNumber":16,"instruction":"thin inner divisi and keep flute/violin blend as foreground color"}
- {"type":"setSystemBreak","measureNumber":8,"value":true}
- {"type":"setPageBreak","measureNumber":16,"value":true}
- {"type":"setMeasureLayoutHint","measureNumber":4,"hint":"staffSpacing","value":104,"staffIndex":1,"partId":"P1"}
- {"type":"setPartName","partId":"P1","name":"Clarinet in Bb"}
- {"type":"setPartAbbreviation","partId":"P1","abbreviation":"Cl."}
- {"type":"setInstrumentName","partId":"P1","instrumentName":"Clarinet"}
- {"type":"setPartTranspose","partId":"P1","chromatic":2,"diatonic":1}
- {"type":"fitPartToInstrument","partId":"P1","instrument":"clarinet-bb"}
- {"type":"transposeRangeChromatic","semitones":2,"range":{"start":{"measureNumber":1,"staffIndex":1,"voiceId":1,"timestampNum":0,"timestampDen":4},"end":{"measureNumber":2,"staffIndex":1,"voiceId":1,"timestampNum":0,"timestampDen":4}}}
- {"type":"insertNoteAt","measureNumber":1,"staffIndex":1,"voiceId":1,"timestampNum":0,"timestampDen":4,"step":"C","octave":5,"alter":0,"durationType":"quarter"}
- {"type":"insertNoteAt","measureNumber":1,"staffIndex":1,"voiceId":1,"timestampNum":2,"timestampDen":8,"step":"D","octave":5,"alter":0,"durationType":"eighth"}
- {"type":"insertNoteAt","measureNumber":1,"staffIndex":1,"voiceId":1,"timestampNum":0,"timestampDen":8,"step":"E","octave":5,"alter":0,"durationType":"quarter","isDotted":true}
- {"type":"insertRestAt","measureNumber":1,"staffIndex":1,"voiceId":1,"timestampNum":3,"timestampDen":4,"durationType":"quarter"}
- {"type":"setLyricLine","measureNumber":1,"staffIndex":1,"voiceId":1,"timestampNum":0,"timestampDen":4,"verseNumber":2,"text":"Ky","syllabic":"begin"}
- {"type":"removeLyricLine","measureNumber":1,"staffIndex":1,"voiceId":1,"timestampNum":0,"timestampDen":4,"verseNumber":2}
- {"type":"removeDirection","measureNumber":2,"text":"dolce","kind":"words"}
- {"type":"addTuplet","measureNumber":1,"staffIndex":1,"voiceId":1,"startTimestampNum":0,"startTimestampDen":4,"stopTimestampNum":2,"stopTimestampDen":4,"actualNotes":3,"normalNotes":2}
- {"type":"addGraceNote","measureNumber":1,"staffIndex":1,"voiceId":1,"timestampNum":0,"timestampDen":4,"slash":true}
- {"type":"removeGraceNote","measureNumber":1,"staffIndex":1,"voiceId":1,"timestampNum":0,"timestampDen":4}
- {"type":"addFingering","measureNumber":1,"staffIndex":1,"voiceId":1,"timestampNum":0,"timestampDen":4,"fingering":"2"}
- {"type":"addOrnament","measureNumber":1,"staffIndex":1,"voiceId":1,"timestampNum":0,"timestampDen":4,"ornament":"trill-mark"}
- {"type":"addWedge","kind":"crescendo","staffIndex":1,"startMeasureNumber":1,"startTimestampNum":0,"startTimestampDen":4,"stopMeasureNumber":2,"stopTimestampNum":0,"stopTimestampDen":4,"placement":"below"}
- {"type":"addPedalSpan","staffIndex":1,"startMeasureNumber":1,"startTimestampNum":0,"startTimestampDen":4,"stopMeasureNumber":2,"stopTimestampNum":0,"stopTimestampDen":4}
- {"type":"addOttava","kind":"8va","staffIndex":1,"startMeasureNumber":1,"startTimestampNum":0,"startTimestampDen":4,"stopMeasureNumber":2,"stopTimestampNum":0,"stopTimestampDen":4,"placement":"above"}
- {"type":"addRehearsalMarksEvery","interval":4,"style":"letters"}
- {"type":"fitRangeOctaves","minMidi":60,"maxMidi":84,"staffIndex":1,"voiceId":1}
- {"type":"applyPracticeProfile","profile":"rehearsal","startMeasureNumber":1}

For note-specific edits you may still return existing note operations if a precise note locator is available.

Important:
- If the user says "transpose/transponiere ... nach/in <Tonart>", do NOT only change the key signature.
- A transposition request means the written pitches must also move by the matching interval.
- Use {"type":"setKey",...} together with transpose commands so both notation and sounding/written notes are updated.
- For whole-score transposition, prefer {"type":"transposeDocumentChromatic",...}.
- Only use {"type":"setKey",...} alone when the user explicitly wants to change the key signature without transposing notes.
- If the user wants to delete or remove a later clef symbol while keeping the earlier clef in force, use {"type":"removeClefChange",...} instead of repeating {"type":"setClef",...}.
- Clef changes at the start of measure N may render visually at the end of measure N-1. Use score context hints to reason about that placement before deciding what to remove.
- The user message itself may contain the source melody as inline note names or bars. Treat that inline melody as usable musical input and do not ask for a separate file when it is already present in the chat message.
- If the user asks for exact known-song notation, a recognizable variation, adaptation, or arrangement by title/source/license and no inline notes or imported score source are present, return empty commands and constructively ask for an allowed MusicXML/MIDI/PDF upload or verified catalog source. Never claim that a public-domain or Creative-Commons source was used unless source metadata is explicitly present in the request/context.
- For Schenkerian, Roman numeral, Forte set-class, chord-scale, neo-Riemannian, form, or motivic labels, use addAnalysisAnnotation instead of inventing notes.
- For Lachenmann-style, extended-technique, aleatoric, or contemporary notation instructions, use addTechniqueInstruction. Include instrument or part; if the exact part is unclear, still make the target ambiguity explicit so the edit stays confirmation-gated.
- For film scoring sync points, hit points, dialogue-safe underscoring markers, timecodes, or tempo-map anchors, use addSyncPoint.
- For orchestration reductions, Mahler/Strauss-style color, timbral blends, hybrid orchestral layers, or spatial/production notes, use addOrchestrationNote. Large arrangement and voicing changes must stay previewable.
- If the user refers to "this melody / diese Melodie" and the structured score context contains melodic previews, treat the notes already present in the score as the melody source.
- If the current score is blank or newly seeded from chat and the user asks to arrange an inline melody, build the arrangement directly with note/chord commands instead of replying with a request for more context.
- When the user asks for an arrangement but leaves instrumentation unspecified, prefer a simple playable piano arrangement with the melody on the upper staff and a light accompaniment underneath.
- When composing a new melody from a sufficient brief, use varied rhythm where musically appropriate instead of defaulting to continuous quarter notes.
- For an under-specified new melody request such as "schreibe eine achttaktige Melodie", return {"commands":[],"explanation":"...","confidence":"low","ambiguities":["Stil fehlt","Tempo fehlt","Charakter fehlt"],"plan":["Kläre Stil/Tempo","Schreibe danach die Melodie"]}.
- For musician-facing explanations, write like a practical collaborator, not a generic assistant. Be concise, concrete, and musically specific.
- If a request is somewhat under-specified but a standard musical default is reasonable, choose the default and proceed instead of asking a blocking clarification question.
- Only surface an ambiguity when it materially changes the edit result and cannot be resolved from score context, selection, or standard practice.

Response language:
- The user's current message language is authoritative for explanation, ambiguities, and plan text.
- If the user writes in English, respond in English even when appLocale, prior requests, or examples are German.
- If the user writes in German, respond in German even when appLocale, prior requests, or examples are English.
- If the user writes in French, Spanish, or Chinese, respond in that language.
- Use appLocale only as a fallback when the user's current message language is unclear.

Always include:
- "commands" or compatibility fallback "operations"
- "explanation": one short sentence in the user's language
- "confidence": "high", "medium", or "low"
- "ambiguities": an array of short strings when the request is unclear, otherwise []
- "plan": a short array of 1-4 planned edit steps

Format: {"commands":[...],"explanation":"one sentence in user's language","confidence":"medium","ambiguities":[],"plan":["..."]}
Compatibility fallback is allowed: {"operations":[...],"explanation":"...","confidence":"medium","ambiguities":[],"plan":["..."]}`;

function detectPromptLanguage(message: string) {
  if (/\b(der|die|das|den|dem|ein|eine|takt|schluessel|schlüssel|entferne|lösche|loesche|weg|bitte|transponiere|ändere|aendere|füge|fuege)\b/i.test(message)) {
    return 'German';
  }
  if (/\b(mesure|mélodie|melodie|partition|portée|portee|accord|arranger|transposer|ajoute|ajouter|supprime|supprimer|écris|ecris|majeur|mineur|s'il vous plait|s'il vous plaît)\b/i.test(message)) {
    return 'French';
  }
  if (/\b(compas|compás|melodia|melodía|partitura|pentagrama|acorde|arregla|arreglar|transpone|transponer|agrega|agregar|añade|anade|quitar|elimina|escribe|mayor|menor|por favor)\b/i.test(message)) {
    return 'Spanish';
  }
  if (/[\u4e00-\u9fff]/.test(message)) {
    return 'Chinese';
  }
  if (/\b(the|this|that|please|change|transpose|arrange|layout|clean|add|remove|write|make|major|minor|score|measure|bar|melody|lick)\b/i.test(message)) {
    return 'English';
  }
  return 'unclear';
}

export function buildIntentPrompt(message: string, context?: unknown, workflow?: ResolvedAiWorkflow, sessionContext?: AiSessionContext) {
  const workflowSection = workflow
    ? `Workflow: ${workflow.label}\nWorkflow guidance: ${workflow.systemGuidance}`
    : '';
  const detectedLanguage = detectPromptLanguage(message);
  const languageSection = [
    `Detected user message language: ${detectedLanguage}.`,
    detectedLanguage === 'unclear'
      ? 'Use appLocale as the fallback response language because the current user message language is unclear.'
      : `Write explanation, ambiguities, and plan text in ${detectedLanguage}. Do not switch language because of appLocale or prior examples.`,
  ].join('\n');
  const sessionSection = sessionContext
    ? [
      `Session context:\n${JSON.stringify(sessionContext, null, 2)}`,
      'appLocale is only a fallback when the current user message language is unclear.',
      sessionContext.chatHistory?.length
        ? 'chatHistory lists the most recent conversation turns, oldest first. Use it to resolve follow-up references such as "the second chord", "make it minor", or "do the same for the bass".'
        : '',
    ].filter(Boolean).join('\n')
    : '';
  if (!context) {
    return [INTENT_SYSTEM_PROMPT, workflowSection, languageSection, sessionSection, `User instruction: ${message}`]
      .filter(Boolean)
      .join('\n\n');
  }
  return [
    INTENT_SYSTEM_PROMPT,
    workflowSection,
    languageSection,
    sessionSection,
    `Structured score context:\n${JSON.stringify(context, null, 2)}`,
    `User instruction: ${message}`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

export function buildValidatorRepairPrompt(params: {
  message: string;
  context?: unknown;
  attemptedCommands: unknown[];
  validatorFindings: Array<{ code: string; message: string; level: 'warning' | 'error' }>;
  workflow?: ResolvedAiWorkflow;
}) {
  const { message, context, attemptedCommands, validatorFindings, workflow } = params;
  const sections = [
    INTENT_SYSTEM_PROMPT,
    workflow ? `Workflow: ${workflow.label}\nWorkflow guidance: ${workflow.systemGuidance}` : '',
    'Repair task: the previous command batch introduced validator findings. Return a corrected FULL replacement command batch for the original score state.',
    'Important repair rules:',
    '- Use the same user intent. Do not ignore the request.',
    '- Replace the whole command batch instead of describing diffs.',
    '- Prefer the smallest semantic change that satisfies the request and removes the validator findings.',
    '- If a validator finding cannot be removed safely, keep the batch conservative and mention the ambiguity.',
  ];

  if (context) {
    sections.push(`Structured score context:\n${JSON.stringify(context, null, 2)}`);
  }

  sections.push(`Original user instruction: ${message}`);
  sections.push(`Previous attempted commands:\n${JSON.stringify(attemptedCommands, null, 2)}`);
  sections.push(`Validator findings to repair:\n${JSON.stringify(validatorFindings, null, 2)}`);

  return sections.join('\n\n');
}

const ARRANGEMENT_HARMONY_SYSTEM_PROMPT = `You are nex-note's harmonic planner for structured arrangement drafting.

Return ONLY a JSON object with this shape:
{
  "harmonicPlanCandidates": [
    {
      "candidateId": "harm-1",
      "summary": "short summary",
      "confidence": "high",
      "segments": [
        {
          "segmentId": "seg-1",
          "measure": 1,
          "beatNum": 1,
          "beatDen": 4,
          "chosen": "C",
          "functionLabel": "tonic",
          "durationBeats": 4,
          "rationale": "brief musical reason",
          "alternatives": [
            { "symbol": "Am", "weight": 0.4, "rationale": "optional alternate" }
          ]
        }
      ]
    }
  ],
  "notes": ["optional short notes"]
}

Rules:
- Produce harmonic plans only. Do NOT write voicings.
- Use the provided ArrangementSpec as a hard constraint.
- Keep reasoning concise inside each segment's rationale.
- Use style-appropriate harmonic function labels.
- At least one candidate is required.
- Prefer conservative, musically plausible plans over flashy reharmonization unless the spec explicitly asks for bolder reharm.`;

const ARRANGEMENT_VOICING_SYSTEM_PROMPT = `You are nex-note's voicing planner for structured arrangement drafting.

Return ONLY a JSON object with this shape:
{
  "voicingCandidates": [
    {
      "candidateId": "voice-1",
      "basedOnHarmonicCandidateId": "harm-1",
      "summary": "short summary",
      "confidence": "high",
      "slices": [
        {
          "measure": 1,
          "beatNum": 1,
          "beatDen": 4,
          "harmony": "C",
          "functionLabel": "tonic",
          "harmonicSegmentId": "seg-1",
          "voices": [
            { "voiceIndex": 1, "role": "melody", "pitch": { "step": "E", "alter": 0, "octave": 5 } },
            { "voiceIndex": 2, "role": "inner", "pitch": { "step": "C", "alter": 0, "octave": 5 } },
            { "voiceIndex": 3, "role": "bass", "pitch": { "step": "G", "alter": 0, "octave": 4 } }
          ]
        }
      ]
    }
  ],
  "notes": ["optional short notes"]
}

Rules:
- Do NOT change the supplied harmonies.
- Your only job is to distribute tones across the voices according to the ArrangementSpec and style pack.
- Keep spelled pitches explicit using step/alter/octave objects.
- Preserve the melody in the intended melodic voice.
- At least one candidate is required.`;

export function buildArrangementHarmonyPrompt(params: {
  message: string;
  spec: ArrangementSpec;
  context?: unknown;
  melodyPreview?: string;
  abcSnippet?: string;
}) {
  const { message, spec, context, melodyPreview, abcSnippet } = params;
  return [
    ARRANGEMENT_HARMONY_SYSTEM_PROMPT,
    'Stage: Harmonic planner',
    `ArrangementSpec:\n${JSON.stringify(spec, null, 2)}`,
    melodyPreview ? `Melody preview:\n${melodyPreview}` : '',
    abcSnippet ? `ABC snippet:\n${abcSnippet}` : '',
    context ? `Structured score context:\n${JSON.stringify(context, null, 2)}` : '',
    `User instruction: ${message}`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

export function buildArrangementVoicingPrompt(params: {
  message: string;
  spec: ArrangementSpec;
  context?: unknown;
  harmonicCandidate: HarmonicPlanCandidate;
  melodyPreview?: string;
  abcSnippet?: string;
}) {
  const { message, spec, context, harmonicCandidate, melodyPreview, abcSnippet } = params;
  return [
    ARRANGEMENT_VOICING_SYSTEM_PROMPT,
    'Stage: Voicing planner',
    `ArrangementSpec:\n${JSON.stringify(spec, null, 2)}`,
    `Locked harmonic candidate:\n${JSON.stringify(harmonicCandidate, null, 2)}`,
    melodyPreview ? `Melody preview:\n${melodyPreview}` : '',
    abcSnippet ? `ABC snippet:\n${abcSnippet}` : '',
    context ? `Structured score context:\n${JSON.stringify(context, null, 2)}` : '',
    `User instruction: ${message}`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

export function buildArrangementVoicingRepairPrompt(params: {
  message: string;
  spec: ArrangementSpec;
  context?: unknown;
  harmonicCandidate: HarmonicPlanCandidate;
  attemptedVoicing: VoicingCandidate;
  criticIssues: CriticIssue[];
}) {
  const { message, spec, context, harmonicCandidate, attemptedVoicing, criticIssues } = params;
  return [
    ARRANGEMENT_VOICING_SYSTEM_PROMPT,
    'Stage: Voicing repair',
    'Repair task: keep the harmony fixed and regenerate only the voicing.',
    'Do not change the harmonic candidate. Correct only the voicing slices that need repair.',
    `ArrangementSpec:\n${JSON.stringify(spec, null, 2)}`,
    `Locked harmonic candidate:\n${JSON.stringify(harmonicCandidate, null, 2)}`,
    `Previous voicing candidate:\n${JSON.stringify(attemptedVoicing, null, 2)}`,
    `Critic issues to repair:\n${JSON.stringify(criticIssues, null, 2)}`,
    context ? `Structured score context:\n${JSON.stringify(context, null, 2)}` : '',
    `Original user instruction: ${message}`,
  ]
    .filter(Boolean)
    .join('\n\n');
}
