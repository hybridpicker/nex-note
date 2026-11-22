// Copy for the Impressum (legal notice) and Datenschutz (privacy policy) pages.
// German is the primary legal text; the English version is a translation.
import type { SiteLocale } from './locale';
import { LEGAL_CONTACT_EMAIL } from './legal-contact';

// Matches /etc/logrotate.d/nginx on the web host (daily, rotate 30), checked 2026-11-22.
export const SERVER_LOG_RETENTION: Record<SiteLocale, string> = {
  de: '30 Tagen',
  en: '30 days',
};

export const PRIVACY_POLICY_DATE: Record<SiteLocale, string> = {
  de: 'November 2026',
  en: 'November 2026',
};

export const CONTROLLER = {
  name: 'Lukas Schönsgibl, MA MAS',
  street: 'Jahnstraße 15a/39',
  city: '3100 St. Pölten',
  country: { de: 'Österreich', en: 'Austria' } as Record<SiteLocale, string>,
  email: LEGAL_CONTACT_EMAIL,
};

export const DSB_URL = 'https://www.dsb.gv.at';

export type LegalSection = { id: string; heading: string; paragraphs: string[]; list?: string[] };

export type ImpressumCopy = {
  metaTitle: string;
  title: string;
  lead: string;
  ownerHeading: string;
  contactHeading: string;
  emailLabel: string;
  purposeHeading: string;
  purpose: string;
  sourceHeading: string;
  source: string;
};

export type PrivacyCopy = {
  metaTitle: string;
  title: string;
  lead: string;
  controllerHeading: string;
  emailLabel: string;
  sections: LegalSection[];
  complaintPrefix: string;
  asOfLabel: string;
};

export const IMPRESSUM_COPY: Record<SiteLocale, ImpressumCopy> = {
  de: {
    metaTitle: 'Impressum | Nex Note',
    title: 'Impressum',
    lead: 'Offenlegung gemäß § 5 ECG und § 25 MedienG.',
    ownerHeading: 'Medieninhaber und Herausgeber',
    contactHeading: 'Kontakt',
    emailLabel: 'E-Mail',
    purposeHeading: 'Unternehmensgegenstand / Blattlinie',
    purpose: 'Information über die Musiknotations-Software Nex Note und deren Bereitstellung.',
    sourceHeading: 'Quellcode',
    source: 'Nex Note ist Open Source unter der GNU Affero General Public License v3.0 oder später. Name und Logo sind von der Lizenz ausgenommen.',
  },
  en: {
    metaTitle: 'Legal notice | Nex Note',
    title: 'Legal notice',
    lead: 'Disclosure under § 5 of the Austrian E-Commerce Act (ECG) and § 25 of the Austrian Media Act (MedienG).',
    ownerHeading: 'Media owner and publisher',
    contactHeading: 'Contact',
    emailLabel: 'Email',
    purposeHeading: 'Purpose of the website',
    purpose: 'Information about the music notation software Nex Note and its distribution.',
    sourceHeading: 'Source code',
    source: 'Nex Note is open source under the GNU Affero General Public License v3.0 or later. The name and logo are not covered by the licence.',
  },
};

function privacySections(locale: SiteLocale): LegalSection[] {
  const retention = SERVER_LOG_RETENTION[locale];
  if (locale === 'de') {
    return [
      {
        id: 'hosting',
        heading: '1. Hosting und Server-Logdateien',
        paragraphs: [
          'Diese Website wird von einem Server bei der Hetzner Online GmbH in Deutschland über den Webserver nginx ausgeliefert.',
          'Bei jedem Aufruf verarbeitet der Server technisch notwendige Daten in Logdateien: IP-Adresse, Zeitpunkt des Zugriffs, aufgerufene Adresse (URL), User-Agent (Browser und Betriebssystem) und Referrer (die zuvor besuchte Seite). Das dient dem sicheren und stabilen Betrieb der Website und der Abwehr von Angriffen.',
          `Rechtsgrundlage ist das berechtigte Interesse an einem sicheren Betrieb (Art. 6 Abs. 1 lit. f DSGVO). Die Logdateien werden nach ${retention} gelöscht.`,
        ],
      },
      {
        id: 'no-tracking',
        heading: '2. Keine Cookies, keine Analyse, kein Tracking',
        paragraphs: [
          'Diese Website setzt keine Cookies, verwendet keine Analyse- oder Tracking-Dienste und lädt keine externen Schriftarten oder Skripte von Drittanbietern.',
        ],
      },
      {
        id: 'downloads',
        heading: '3. Downloads und Update-Prüfung',
        paragraphs: [
          'Die Download-Schaltflächen verweisen auf GitHub. Beim Download und bei der optionalen Update-Prüfung der Desktop-App wird eine Verbindung zu GitHub (GitHub Inc., USA) aufgebaut; GitHub erhält dabei deine IP-Adresse und den User-Agent. GitHub ist unter dem EU-US Data Privacy Framework zertifiziert. Es gelten die Datenschutzbestimmungen von GitHub.',
          'Die Update-Prüfung fragt vorher um deine Zustimmung und kann in der App jederzeit abgeschaltet werden. Nex Note sendet keine Telemetrie, keine Nutzungsdaten und keine Absturzberichte.',
        ],
      },
      {
        id: 'browser-preview',
        heading: '4. Browser Preview',
        paragraphs: [
          'In der Browser Preview (/nex-note-app) bleiben deine Partituren in deinem Browser (lokaler Speicher des Browsers). Es wird nichts hochgeladen, solange du keine KI-Funktion verwendest.',
          'Für die Wiedergabe lädt die Browser Preview Instrumentenklänge zuerst von nex-note.com. Nur wenn das scheitert, lädt dein Browser sie von gleitz.github.io (GitHub Pages, GitHub Inc., USA); dabei erhält GitHub deine IP-Adresse und deinen User-Agent. Die Desktop-App bringt ihre Klänge mit und lädt keine nach.',
        ],
      },
      {
        id: 'session-key',
        heading: '5. KI mit Session Key in der Browser Preview',
        paragraphs: [
          'Wenn du in der Browser Preview einen Session Key einfügst und eine KI-Funktion nutzt, werden der Schlüssel und der Inhalt der Anfrage (deine Anweisung und die dafür nötigen Teile der Partitur) über nex-note.com an den von dir gewählten Anbieter weitergeleitet: Anthropic, OpenAI oder Google Gemini.',
          'nex-note.com hält Schlüssel und Inhalt nur für die Dauer der Anfrage im Arbeitsspeicher; sie werden weder gespeichert noch protokolliert. Für die Verarbeitung beim Anbieter gelten dessen Datenschutzbestimmungen. Ob und mit welchem Anbieter du KI nutzt, entscheidest du selbst.',
        ],
      },
      {
        id: 'desktop-app',
        heading: '6. Desktop-App',
        paragraphs: [
          'Die Desktop-App arbeitet lokal auf deinem Rechner. Daten gehen nur dann an einen KI-Anbieter, wenn du selbst einen verbindest und eine KI-Funktion nutzt. Gespeicherte Schlüssel werden im Schlüsselbund des Betriebssystems abgelegt.',
        ],
      },
      {
        id: 'rights',
        heading: '7. Deine Rechte',
        paragraphs: ['Du hast nach der DSGVO folgende Rechte in Bezug auf deine personenbezogenen Daten:'],
        list: [
          'Auskunft (Art. 15 DSGVO)',
          'Berichtigung (Art. 16 DSGVO)',
          'Löschung (Art. 17 DSGVO)',
          'Einschränkung der Verarbeitung (Art. 18 DSGVO)',
          'Datenübertragbarkeit (Art. 20 DSGVO)',
          'Widerspruch (Art. 21 DSGVO)',
        ],
      },
    ];
  }
  return [
    {
      id: 'hosting',
      heading: '1. Hosting and server log files',
      paragraphs: [
        'This website is served from a server at Hetzner Online GmbH in Germany using the nginx web server.',
        'For every request the server processes technically necessary data in log files: IP address, time of access, requested address (URL), user agent (browser and operating system) and referrer (the page you came from). This keeps the website secure and stable and helps fend off attacks.',
        `The legal basis is the legitimate interest in operating the website securely (Art. 6(1)(f) GDPR). Log files are deleted after ${retention}.`,
      ],
    },
    {
      id: 'no-tracking',
      heading: '2. No cookies, no analytics, no tracking',
      paragraphs: [
        'This website sets no cookies, uses no analytics or tracking services and loads no external fonts or third-party scripts.',
      ],
    },
    {
      id: 'downloads',
      heading: '3. Downloads and Update Check',
      paragraphs: [
        'The download buttons link to GitHub. When you download the app, and when the desktop app runs its optional Update Check, your device connects to GitHub (GitHub Inc., USA), which receives your IP address and user agent. GitHub is certified under the EU-US Data Privacy Framework. GitHub’s privacy statement applies.',
        'The Update Check asks for your consent first and can be turned off in the app at any time. Nex Note sends no telemetry, usage data or crash reports.',
      ],
    },
    {
      id: 'browser-preview',
      heading: '4. Browser Preview',
      paragraphs: [
        'In the Browser Preview (/nex-note-app) your scores stay in your browser (the browser’s local storage). Nothing is uploaded unless you use an AI feature.',
        'For playback the Browser Preview loads instrument sounds from nex-note.com first. Only if that fails does your browser load them from gleitz.github.io (GitHub Pages, GitHub Inc., USA), which then receives your IP address and user agent. The desktop app ships its sounds and loads none.',
      ],
    },
    {
      id: 'session-key',
      heading: '5. AI with a Session Key in the Browser Preview',
      paragraphs: [
        'If you paste a Session Key into the Browser Preview and use an AI feature, the key and the content of the request (your instruction and the parts of the score it needs) are relayed through nex-note.com to the provider you chose: Anthropic, OpenAI or Google Gemini.',
        'nex-note.com holds the key and the content in memory only for the duration of the request; they are neither stored nor logged. The provider’s own privacy terms apply to its processing. Whether you use AI, and with which provider, is your decision.',
      ],
    },
    {
      id: 'desktop-app',
      heading: '6. Desktop app',
      paragraphs: [
        'The desktop app works locally on your computer. Data goes to an AI provider only if you connect one yourself and use an AI feature. Stored keys are kept in the operating system’s keychain.',
      ],
    },
    {
      id: 'rights',
      heading: '7. Your rights',
      paragraphs: ['Under the GDPR you have the following rights regarding your personal data:'],
      list: [
        'Access (Art. 15 GDPR)',
        'Rectification (Art. 16 GDPR)',
        'Erasure (Art. 17 GDPR)',
        'Restriction of processing (Art. 18 GDPR)',
        'Data portability (Art. 20 GDPR)',
        'Objection (Art. 21 GDPR)',
      ],
    },
  ];
}

export const PRIVACY_COPY: Record<SiteLocale, PrivacyCopy> = {
  de: {
    metaTitle: 'Datenschutzerklärung | Nex Note',
    title: 'Datenschutzerklärung',
    lead: 'Diese Website und Nex Note verarbeiten so wenige Daten wie möglich. Hier steht, welche und warum.',
    controllerHeading: 'Verantwortlicher',
    emailLabel: 'E-Mail',
    sections: privacySections('de'),
    complaintPrefix: 'Zur Ausübung deiner Rechte genügt eine E-Mail an die oben genannte Adresse. Wenn du meinst, dass die Verarbeitung deiner Daten gegen das Datenschutzrecht verstößt, kannst du dich bei der österreichischen Datenschutzbehörde beschweren:',
    asOfLabel: 'Stand',
  },
  en: {
    metaTitle: 'Privacy policy | Nex Note',
    title: 'Privacy policy',
    lead: 'This website and Nex Note process as little data as possible. This page says which data and why.',
    controllerHeading: 'Controller',
    emailLabel: 'Email',
    sections: privacySections('en'),
    complaintPrefix: 'To exercise your rights, an email to the address above is enough. If you believe that the processing of your data violates data protection law, you can lodge a complaint with the Austrian Data Protection Authority (Datenschutzbehörde):',
    asOfLabel: 'Last updated',
  },
};
