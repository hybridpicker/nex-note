// One-click arranging requests for the AI panel. Each preset is an ordinary chat message, so it goes
// through the same pipeline, preview and confirmation as a typed request and stays editable: the
// prompt lands in the input when the person holds Alt/Option while clicking.

export interface ArrangerPreset {
  id: string;
  label: { en: string; de: string };
  /** What the chip does, for the tooltip. */
  hint: { en: string; de: string };
  prompt: string;
}

export const ARRANGER_PRESETS: readonly ArrangerPreset[] = [
  {
    id: 'four-part',
    label: { en: 'Four-part setting', de: 'Vierstimmiger Satz' },
    hint: {
      en: 'Harmonize the melody in a classical four-part texture',
      de: 'Melodie klassisch vierstimmig aussetzen',
    },
    prompt: '/arrange Harmonize this melody in a classical four-part setting. Keep the melody on top and check voice leading.',
  },
  {
    id: 'jazz-voicing',
    label: { en: 'Jazz voicing', de: 'Jazz-Voicing' },
    hint: {
      en: 'Close-position jazz voicing under the melody, drop-2 where it helps',
      de: 'Enger Jazz-Satz unter der Melodie, Drop-2 wo sinnvoll',
    },
    prompt: '/arrange Voice this melody as a jazz close voicing, with drop-2 where the spacing gets too tight. Keep the melody on top.',
  },
  {
    id: 'figured-bass',
    label: { en: 'Figured bass', de: 'Generalbass' },
    hint: {
      en: 'Realize a generalbass accompaniment for the melody',
      de: 'Generalbass-Begleitung zur Melodie aussetzen',
    },
    prompt: '/arrange Realize a generalbass (figured bass) accompaniment for this melody.',
  },
  {
    id: 'reharmonize',
    label: { en: 'Reharmonize', de: 'Reharmonisieren' },
    hint: {
      en: 'New harmony for the passage, melody unchanged',
      de: 'Neue Harmonik für die Stelle, Melodie bleibt',
    },
    prompt: '/arrange Reharmonize this passage lightly and keep the melody unchanged.',
  },
  {
    id: 'piano-accompaniment',
    label: { en: 'Piano accompaniment', de: 'Klavierbegleitung' },
    hint: {
      en: 'Playable piano accompaniment for the melody',
      de: 'Spielbare Klavierbegleitung zur Melodie',
    },
    prompt: '/arrange Write a playable piano accompaniment for this melody.',
  },
  {
    id: 'chord-symbols',
    label: { en: 'Chord symbols', de: 'Akkordsymbole' },
    hint: {
      en: 'Add chord symbols that fit the melody',
      de: 'Passende Akkordsymbole über die Melodie setzen',
    },
    prompt: 'Add chord symbols that fit the melody, one or two per measure.',
  },
  {
    id: 'range-check',
    label: { en: 'Range check', de: 'Umfang prüfen' },
    hint: {
      en: 'Check whether every part is playable on its instrument',
      de: 'Prüfen, ob jede Stimme auf ihrem Instrument spielbar ist',
    },
    prompt: '/analyze Check the range and tessitura of every part and name the measures that are not playable on the instrument.',
  },
];

export function arrangerPresetText(preset: ArrangerPreset, locale: string): { label: string; hint: string } {
  const language = locale === 'de' ? 'de' : 'en';
  return { label: preset.label[language], hint: preset.hint[language] };
}
