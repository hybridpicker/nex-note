export type SupportedAppLocale = 'de' | 'en' | 'fr' | 'es' | 'zh' | null | undefined;
export type LocalResponseLanguage = 'de' | 'en';

const GERMAN_CUES = /\b(der|die|das|den|dem|ein|eine|einen|takt|schluessel|schlüssel|entferne|lösche|loesche|weg|bitte|transponiere|ändere|aendere|füge|fuege|partitur|stimme|system)\b|[äöüß]/i;
const ENGLISH_CUES = /\b(the|this|that|please|change|transpose|arrange|layout|clean|add|remove|write|make|major|minor|score|measure|bar|melody|lick)\b/i;
const FRENCH_CUES = /\b(mesure|mélodie|melodie|partition|portée|portee|accord|arranger|transposer|ajoute|ajouter|supprime|supprimer|écris|ecris|majeur|mineur|s'il vous plait|s'il vous plaît)\b/i;
const SPANISH_CUES = /\b(compas|compás|melodia|melodía|partitura|pentagrama|acorde|arregla|arreglar|transpone|transponer|agrega|agregar|añade|anade|quitar|elimina|escribe|mayor|menor|por favor)\b/i;
const CHINESE_CUES = /[\u4e00-\u9fff]/;

export function detectLocalResponseLanguage(message: string, appLocale?: SupportedAppLocale): LocalResponseLanguage {
  if (GERMAN_CUES.test(message)) return 'de';
  if (ENGLISH_CUES.test(message) || FRENCH_CUES.test(message) || SPANISH_CUES.test(message) || CHINESE_CUES.test(message)) return 'en';
  return appLocale === 'de' ? 'de' : 'en';
}

export function isLocalResponseGerman(message: string, appLocale?: SupportedAppLocale) {
  return detectLocalResponseLanguage(message, appLocale) === 'de';
}
