// All copy for the public landing page, in English and German.
// The `LandingCopy` type keeps both languages complete: a missing string is a
// type error, not a silent fallback.
import type { SiteLocale } from './locale';

export type DownloadCopy = {
  macLabel: string;
  macDetail: string;
  linuxLabel: string;
  linuxDetail: string;
  omarchyHint: string;
  otherOsNote: string;
  tryInBrowser: string;
  allDownloads: string;
  versionLabel: string;
  /** Shown instead of the download buttons while no Release can be downloaded. */
  comingSoon: string;
  comingSoonDetail: string;
  tryInBrowserDetail: string;
};

type Card = { title: string; text: string };
/** Pixel size of the image file; most screenshots are 1440×900 editor windows at 2×. */
type Shot = { src: string; title: string; text: string; alt: string; width?: number; height?: number };
const SCORE_CLOSEUP = { src: '/screenshots/score-closeup.png', width: 2646, height: 2142 } as const;
/** `aComingSoon` replaces the answer while no Release can be downloaded. */
type Faq = { q: string; a: string; aComingSoon?: string };

export type LandingCopy = {
  metaTitle: string;
  metaDescription: string;
  skipToContent: string;
  nav: { features: string; formats: string; privacy: string; faq: string; download: string };
  languageSwitchLabel: string;
  hero: { badge: string; title: string; lead: string };
  download: DownloadCopy;
  screenshots: { eyebrow: string; title: string; lead: string; items: Shot[] };
  features: { eyebrow: string; title: string; items: Card[] };
  formats: {
    eyebrow: string;
    title: string;
    lead: string;
    leadComingSoon: string;
    supportedTitle: string;
    supported: string[];
    experimentalTitle: string;
    experimental: string[];
  };
  privacy: { eyebrow: string; title: string; lead: string; points: Card[] };
  audience: { eyebrow: string; title: string; items: Card[] };
  faq: { eyebrow: string; title: string; items: Faq[] };
  footer: {
    tagline: string;
    changelog: string;
    openSource: string;
    licenseNote: string;
    reportBug: string;
    impressum: string;
    privacy: string;
  };
};

const en: LandingCopy = {
  metaTitle: 'Nex Note: music notation that stays on your computer',
  metaDescription:
    'Nex Note is a free, open-source music notation app for macOS and Linux. Write and edit scores, guitar tabs and lead sheets locally, with optional AI you bring yourself.',
  skipToContent: 'Skip to content',
  nav: { features: 'Features', formats: 'Formats', privacy: 'Privacy', faq: 'FAQ', download: 'Download' },
  languageSwitchLabel: 'Language',
  hero: {
    badge: 'Free Public Beta',
    title: 'Music notation that stays on your computer.',
    lead:
      'Nex Note is a desktop app for writing, cleaning up and arranging scores, guitar tabs and lead sheets. Your files live on your machine. AI is optional, off by default, and only ever uses a provider you connect yourself.',
  },
  download: {
    macLabel: 'Download for macOS',
    macDetail: 'Universal: Apple Silicon and Intel. macOS 13 Ventura or later.',
    linuxLabel: 'Download for Linux',
    linuxDetail: 'AppImage for x86_64.',
    omarchyHint: 'Omarchy / Arch:',
    otherOsNote: 'Nex Note runs on macOS and Linux. Windows is not available yet.',
    tryInBrowser: 'Try in browser',
    allDownloads: 'All downloads and checksums',
    versionLabel: 'Version',
    comingSoon: 'Public Beta – coming soon',
    comingSoonDetail: 'The desktop app for macOS and Linux is on its way. Until then, try the editor in your browser.',
    tryInBrowserDetail: 'Runs in your browser, with no install and no account.',
  },
  screenshots: {
    eyebrow: 'See it',
    title: 'A real score editor, not a demo.',
    lead: 'These screenshots show the app as it ships, with original demo scores.',
    items: [
      {
        ...SCORE_CLOSEUP,
        title: 'Score editor',
        text: 'Keyboard-first note input with dynamics, slurs, hairpins and multiple voices.',
        alt: 'Close-up of a two-staff piano score drawn by Nex Note, with dynamics, slurs and hairpins',
      },
      {
        src: '/screenshots/guitar-tab.png',
        title: 'Guitar notation and TAB',
        text: 'Standard notation and TAB stay in sync while you edit either staff.',
        alt: 'Guitar notation with a linked TAB staff in the Nex Note editor',
      },
      {
        src: '/screenshots/lead-sheet.png',
        title: 'Lead sheets',
        text: 'Chord symbols and lyrics, ready for rehearsal or lessons.',
        alt: 'Lead sheet with chord symbols and lyrics in the Nex Note editor',
      },
      {
        src: '/screenshots/ai-edit-preview.png',
        title: 'AI with preview',
        text: 'The assistant proposes a change and waits. Nothing is applied until you confirm.',
        alt: 'Nex Note AI assistant showing an arrangement preview with Apply and Cancel buttons',
      },
    ],
  },
  features: {
    eyebrow: 'Features',
    title: 'Everything you need for everyday notation work.',
    items: [
      { title: 'Fast note entry', text: 'Type notes with the keyboard, click them in with the mouse, play them on a MIDI keyboard or the on-screen piano.' },
      { title: 'Real notation', text: 'Chords, voices, ties, tuplets, grace notes, dynamics, articulations, repeats, lyrics and chord symbols.' },
      { title: 'Guitar-ready', text: 'Linked notation and TAB staves, plus a Guitar Pro importer for existing tab collections.' },
      { title: 'Playback', text: 'Listen to your score with sampled instruments and follow the playhead note by note.' },
      { title: 'Transpose and arrange', text: 'Transpose, respell, extract parts and prepare practice material in a few steps.' },
      { title: 'Bring your own AI', text: 'Optional help with cleanup and arranging from OpenAI, Claude, Gemini or a local Ollama model, always previewed first.' },
    ],
  },
  formats: {
    eyebrow: 'Formats',
    title: 'Honest about what works today.',
    lead: 'Nex Note is a Public Beta. Some paths are solid, others need extra software or a careful look at the result.',
    leadComingSoon: 'Nex Note is heading for its Public Beta. Some paths are solid, others need extra software or a careful look at the result.',
    supportedTitle: 'Supported',
    supported: ['MusicXML (.musicxml, .xml)', 'Compressed MusicXML (.mxl)', 'Nex Note projects (.nxn)', 'MIDI export and playback', 'PDF export'],
    experimentalTitle: 'Experimental or needs extra software',
    experimental: [
      'MuseScore files (.mscz) via MuseScore 4',
      'Guitar Pro importer',
      'MIDI import (reconstructed notation)',
      'ABC export',
      'PDF, photo and scan import (needs MuseScore and Audiveris)',
    ],
  },
  privacy: {
    eyebrow: 'Local-first',
    title: 'Bring your own AI. Or none at all.',
    lead: 'Nex Note works fully offline. AI is a tool you can switch on, not a service your scores are fed into.',
    points: [
      { title: 'AI is off by default', text: 'Nothing is sent to an AI provider until you connect one yourself.' },
      { title: 'Your scores stay on your computer', text: 'Files are opened and saved locally. There is no Nex Note cloud and no account.' },
      { title: 'Preview before apply', text: 'Every AI change is shown first. You decide whether it lands in your score.' },
      {
        title: 'Session Key in the Browser Preview',
        text: 'To try AI in the browser, paste a Session Key. It is not stored, and each request is relayed through nex-note.com to the provider you chose.',
      },
    ],
  },
  audience: {
    eyebrow: 'Who it is for',
    title: 'Made for people who work with music every day.',
    items: [
      { title: 'Music teachers', text: 'Prepare exercises, transpose for your students and print clean practice sheets.' },
      { title: 'Guitar teachers', text: 'Notation and TAB side by side, with Guitar Pro and MIDI files as a starting point.' },
      { title: 'Choirs, bands and small music schools', text: 'Keep your own arrangements and parts in order, without uploading them anywhere.' },
      { title: 'Arrangers', text: 'Clean up imports, write parts and try voicings, with AI help when you want it.' },
    ],
  },
  faq: {
    eyebrow: 'FAQ',
    title: 'Questions and answers',
    items: [
      {
        q: 'What are the system requirements?',
        a: 'macOS 13 Ventura or later on Apple Silicon or Intel (one universal download), or a 64-bit x86 Linux system for the AppImage. Importing MuseScore files, PDFs or photos needs MuseScore 4 and Audiveris installed separately.',
      },
      {
        q: 'Is Nex Note free?',
        a: 'Yes. The Public Beta is free to download and use, with no account and no sign-up. The source code is open under the AGPL-3.0.',
        aComingSoon: 'Yes. The Public Beta will be free to download and use, with no account and no sign-up. The source code will be published under the AGPL-3.0 with the Public Beta.',
      },
      {
        q: 'How do updates work?',
        a: 'The app asks before it checks for updates, and you can turn the Update Check off at any time. Nex Note sends no telemetry, usage statistics or crash reports.',
      },
      {
        q: 'Does it run on Linux and Omarchy?',
        a: 'Yes. Download the x86_64 AppImage, which keeps itself up to date, or on Omarchy and Arch install the package with the command shown under the download button.',
        aComingSoon: 'Linux arrives with the Public Beta: an x86_64 AppImage, and on Omarchy and Arch a package your package manager keeps up to date. Until then you can try the Browser Preview.',
      },
      {
        q: 'Is there a Windows version?',
        a: 'Not yet, and it is not planned for now. On Windows you can try the Browser Preview.',
      },
      {
        q: 'Which files may I use?',
        a: 'Only files you are allowed to process: scores you wrote, own, have a licence for, or that are in the public domain. Nex Note does not give you rights to copy, convert or share someone else’s music.',
      },
    ],
  },
  footer: {
    tagline: 'Music notation that stays on your computer.',
    changelog: 'Changelog',
    openSource: 'Open source on GitHub',
    licenseNote: 'Licensed under AGPL-3.0',
    reportBug: 'Report a bug',
    impressum: 'Legal notice',
    privacy: 'Privacy policy',
  },
};

const de: LandingCopy = {
  metaTitle: 'Nex Note: Notensatz, der auf deinem Rechner bleibt',
  metaDescription:
    'Nex Note ist eine kostenlose Open-Source-Notensatz-App für macOS und Linux. Partituren, Gitarren-Tabs und Leadsheets lokal schreiben und bearbeiten, mit optionaler KI deiner Wahl.',
  skipToContent: 'Zum Inhalt springen',
  nav: { features: 'Funktionen', formats: 'Formate', privacy: 'Datenschutz', faq: 'FAQ', download: 'Download' },
  languageSwitchLabel: 'Sprache',
  hero: {
    badge: 'Kostenlose Public Beta',
    title: 'Notensatz, der auf deinem Rechner bleibt.',
    lead:
      'Nex Note ist eine Desktop-App zum Schreiben, Aufräumen und Arrangieren von Partituren, Gitarren-Tabs und Leadsheets. Deine Dateien bleiben auf deinem Rechner. KI ist optional, standardmäßig aus und nutzt nur einen Anbieter, den du selbst verbindest.',
  },
  download: {
    macLabel: 'Für macOS laden',
    macDetail: 'Universal: Apple Silicon und Intel. Ab macOS 13 Ventura.',
    linuxLabel: 'Für Linux laden',
    linuxDetail: 'AppImage für x86_64.',
    omarchyHint: 'Omarchy / Arch:',
    otherOsNote: 'Nex Note läuft auf macOS und Linux. Windows gibt es noch nicht.',
    tryInBrowser: 'Im Browser ausprobieren',
    allDownloads: 'Alle Downloads und Prüfsummen',
    versionLabel: 'Version',
    comingSoon: 'Public Beta – bald verfügbar',
    comingSoonDetail: 'Die Desktop-App für macOS und Linux ist unterwegs. Bis dahin kannst du den Editor im Browser ausprobieren.',
    tryInBrowserDetail: 'Läuft im Browser, ohne Installation und ohne Konto.',
  },
  screenshots: {
    eyebrow: 'Ansehen',
    title: 'Ein echter Noteneditor, keine Demo.',
    lead: 'Die Screenshots zeigen die App so, wie sie ausgeliefert wird, mit eigenen Demo-Partituren.',
    items: [
      {
        ...SCORE_CLOSEUP,
        title: 'Noteneditor',
        text: 'Noteneingabe per Tastatur, mit Dynamik, Bögen, Gabeln und mehreren Stimmen.',
        alt: 'Nahaufnahme einer zweizeiligen Klavierpartitur aus Nex Note, mit Dynamik, Bögen und Gabeln',
      },
      {
        src: '/screenshots/guitar-tab.png',
        title: 'Gitarrennotation und TAB',
        text: 'Noten und TAB bleiben synchron, egal in welchem System du bearbeitest.',
        alt: 'Gitarrennotation mit verknüpftem TAB-System im Nex Note Editor',
      },
      {
        src: '/screenshots/lead-sheet.png',
        title: 'Leadsheets',
        text: 'Akkordsymbole und Liedtext, bereit für Probe oder Unterricht.',
        alt: 'Leadsheet mit Akkordsymbolen und Liedtext im Nex Note Editor',
      },
      {
        src: '/screenshots/ai-edit-preview.png',
        title: 'KI mit Vorschau',
        text: 'Der Assistent schlägt eine Änderung vor und wartet. Erst wenn du bestätigst, wird sie übernommen.',
        alt: 'Nex Note KI-Assistent mit Arrangement-Vorschau und den Schaltflächen Übernehmen und Abbrechen',
      },
    ],
  },
  features: {
    eyebrow: 'Funktionen',
    title: 'Alles für die tägliche Arbeit mit Noten.',
    items: [
      { title: 'Schnelle Noteneingabe', text: 'Noten per Tastatur tippen, mit der Maus setzen oder auf einem MIDI-Keyboard bzw. dem Bildschirmklavier spielen.' },
      { title: 'Echte Notation', text: 'Akkorde, Stimmen, Haltebögen, Triolen, Vorschläge, Dynamik, Artikulation, Wiederholungen, Liedtext und Akkordsymbole.' },
      { title: 'Für Gitarre gemacht', text: 'Verknüpfte Noten- und TAB-Systeme sowie ein Guitar-Pro-Import für bestehende Tab-Sammlungen.' },
      { title: 'Wiedergabe', text: 'Hör dir die Partitur mit gesampelten Instrumenten an und folge der Wiedergabe Note für Note.' },
      { title: 'Transponieren und arrangieren', text: 'Transponieren, enharmonisch umdeuten, Stimmen ausziehen und Übungsmaterial vorbereiten.' },
      { title: 'Deine eigene KI', text: 'Optionale Hilfe beim Aufräumen und Arrangieren mit OpenAI, Claude, Gemini oder einem lokalen Ollama-Modell, immer zuerst als Vorschau.' },
    ],
  },
  formats: {
    eyebrow: 'Formate',
    title: 'Ehrlich, was heute funktioniert.',
    lead: 'Nex Note ist eine Public Beta. Manche Wege sind stabil, andere brauchen Zusatzsoftware oder einen genauen Blick auf das Ergebnis.',
    leadComingSoon: 'Nex Note ist auf dem Weg zur Public Beta. Manche Wege sind stabil, andere brauchen Zusatzsoftware oder einen genauen Blick auf das Ergebnis.',
    supportedTitle: 'Unterstützt',
    supported: ['MusicXML (.musicxml, .xml)', 'Komprimiertes MusicXML (.mxl)', 'Nex-Note-Projekte (.nxn)', 'MIDI-Export und Wiedergabe', 'PDF-Export'],
    experimentalTitle: 'Experimentell oder mit Zusatzsoftware',
    experimental: [
      'MuseScore-Dateien (.mscz) über MuseScore 4',
      'Guitar-Pro-Import',
      'MIDI-Import (rekonstruierte Notation)',
      'ABC-Export',
      'Import von PDF, Fotos und Scans (braucht MuseScore und Audiveris)',
    ],
  },
  privacy: {
    eyebrow: 'Local-first',
    title: 'Deine eigene KI. Oder gar keine.',
    lead: 'Nex Note funktioniert komplett offline. KI ist ein Werkzeug, das du einschalten kannst, kein Dienst, an den deine Noten gehen.',
    points: [
      { title: 'KI ist standardmäßig aus', text: 'Nichts geht an einen KI-Anbieter, solange du nicht selbst einen verbindest.' },
      { title: 'Deine Noten bleiben auf deinem Rechner', text: 'Dateien werden lokal geöffnet und gespeichert. Es gibt keine Nex-Note-Cloud und kein Konto.' },
      { title: 'Erst Vorschau, dann übernehmen', text: 'Jede KI-Änderung wird zuerst angezeigt. Du entscheidest, ob sie in die Partitur kommt.' },
      {
        title: 'Session Key in der Browser Preview',
        text: 'Um KI im Browser zu testen, fügst du einen Session Key ein. Er wird nicht gespeichert; jede Anfrage wird über nex-note.com an den gewählten Anbieter weitergeleitet.',
      },
    ],
  },
  audience: {
    eyebrow: 'Für wen',
    title: 'Für Menschen, die täglich mit Musik arbeiten.',
    items: [
      { title: 'Musiklehrer:innen', text: 'Übungen vorbereiten, für Schüler:innen transponieren und saubere Übeblätter drucken.' },
      { title: 'Gitarrenlehrer:innen', text: 'Noten und TAB nebeneinander, mit Guitar-Pro- und MIDI-Dateien als Ausgangspunkt.' },
      { title: 'Chöre, Bands und kleine Musikschulen', text: 'Eigene Arrangements und Stimmen ordnen, ohne sie irgendwo hochzuladen.' },
      { title: 'Arrangeur:innen', text: 'Importe aufräumen, Stimmen schreiben und Voicings ausprobieren, mit KI-Hilfe, wenn du willst.' },
    ],
  },
  faq: {
    eyebrow: 'FAQ',
    title: 'Fragen und Antworten',
    items: [
      {
        q: 'Was sind die Systemvoraussetzungen?',
        a: 'macOS 13 Ventura oder neuer auf Apple Silicon oder Intel (ein gemeinsamer Download) oder ein 64-Bit-x86-Linux für das AppImage. Für den Import von MuseScore-Dateien, PDFs oder Fotos müssen MuseScore 4 und Audiveris separat installiert sein.',
      },
      {
        q: 'Ist Nex Note kostenlos?',
        a: 'Ja. Die Public Beta ist kostenlos, ohne Konto und ohne Anmeldung. Der Quellcode ist offen unter der AGPL-3.0.',
        aComingSoon: 'Ja. Die Public Beta wird kostenlos sein, ohne Konto und ohne Anmeldung. Der Quellcode wird mit der Public Beta unter der AGPL-3.0 veröffentlicht.',
      },
      {
        q: 'Wie funktionieren Updates?',
        a: 'Die App fragt, bevor sie nach Updates sucht, und du kannst die Update-Prüfung jederzeit abschalten. Nex Note sendet keine Telemetrie, keine Nutzungsstatistik und keine Absturzberichte.',
      },
      {
        q: 'Läuft es unter Linux und Omarchy?',
        a: 'Ja. Lade das x86_64-AppImage, das sich selbst aktuell hält, oder installiere unter Omarchy und Arch das Paket mit dem Befehl unter dem Download-Button.',
        aComingSoon: 'Linux kommt mit der Public Beta: ein x86_64-AppImage und unter Omarchy und Arch ein Paket, das dein Paketmanager aktuell hält. Bis dahin kannst du die Browser Preview ausprobieren.',
      },
      {
        q: 'Gibt es eine Windows-Version?',
        a: 'Noch nicht, und sie ist derzeit nicht geplant. Unter Windows kannst du die Browser Preview ausprobieren.',
      },
      {
        q: 'Welche Dateien darf ich verwenden?',
        a: 'Nur Dateien, die du rechtmäßig verarbeiten darfst: selbst geschriebene, eigene, lizenzierte oder gemeinfreie Noten. Nex Note gibt dir keine Rechte, fremde Musik zu kopieren, umzuwandeln oder weiterzugeben.',
      },
    ],
  },
  footer: {
    tagline: 'Notensatz, der auf deinem Rechner bleibt.',
    changelog: 'Changelog',
    openSource: 'Open Source auf GitHub',
    licenseNote: 'Lizenziert unter AGPL-3.0',
    reportBug: 'Fehler melden',
    impressum: 'Impressum',
    privacy: 'Datenschutz',
  },
};

export const LANDING_COPY: Record<SiteLocale, LandingCopy> = { en, de };
