import { DOMParser, XMLSerializer, type Document as XmlDocument, type Element as XmlElement } from '@xmldom/xmldom';

export const GUITAR_PRO_IMPORT_FIDELITY_PROMPT = [
  'Import Guitar Pro files as a visual and semantic score transcription, not as a notation-only reduction.',
  'Preserve the standard notation staves and every TAB staff exported by MuseScore.',
  'Do not remove TAB parts or TAB staff-details; string/fret information is essential source material.',
  'Preserve GP-only TAB techniques with native MusicXML technical nodes when possible and gp:* other-technical fallback payloads when not.',
  'Surface any gp:* fallback payloads as import warnings so users know the score kept downgraded semantics.',
  'The resulting MusicXML should look as close as possible to opening the same file in Guitar Pro.',
].join(' ');

export function normalizeConvertedMusicXml(xml: string, options: { preserveTabs?: boolean } = {}) {
  return options.preserveTabs ? ensureXmlHeader(xml) : stripTabParts(xml);
}

function directElementChildren(parent: XmlElement, tagName?: string) {
  return Array.from(parent.childNodes)
    .filter((child): child is XmlElement => child.nodeType === 1 && (!tagName || (child as XmlElement).tagName === tagName));
}

function getOrCreateDirectChild(doc: XmlDocument, parent: XmlElement, tagName: string) {
  const existing = directElementChildren(parent, tagName)[0];
  if (existing) return existing;
  const child = doc.createElement(tagName);
  parent.appendChild(child);
  return child;
}

function setTextElement(doc: XmlDocument, parent: XmlElement, tagName: string, value: string) {
  const child = getOrCreateDirectChild(doc, parent, tagName);
  child.textContent = value;
  return child;
}

function parsePositiveInt(value: string | null | undefined, fallback = 0) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function noteHasStringFret(note: XmlElement) {
  const technical = note.getElementsByTagName('technical')[0];
  return Boolean(
    technical?.getElementsByTagName('string')[0]?.textContent?.trim()
    && technical?.getElementsByTagName('fret')[0]?.textContent?.trim(),
  );
}

function getNoteStaff(note: XmlElement) {
  return parsePositiveInt(note.getElementsByTagName('staff')[0]?.textContent, 1);
}

function getPartMaxStaff(part: XmlElement) {
  const measures = directElementChildren(part, 'measure');
  let maxStaff = 1;
  for (const measure of measures) {
    const staves = parsePositiveInt(measure.getElementsByTagName('staves')[0]?.textContent, 0);
    maxStaff = Math.max(maxStaff, staves);
    for (const note of directElementChildren(measure, 'note')) {
      maxStaff = Math.max(maxStaff, getNoteStaff(note));
    }
    for (const staffDetails of Array.from(measure.getElementsByTagName('staff-details'))) {
      maxStaff = Math.max(maxStaff, parsePositiveInt(staffDetails.getAttribute('number'), 0));
    }
  }
  return maxStaff;
}

function hasChordMarker(note: XmlElement) {
  return directElementChildren(note, 'chord').length > 0;
}

function getMeasureDurationForStaff(measure: XmlElement, staffIndex: number) {
  return directElementChildren(measure, 'note')
    .filter((note) => getNoteStaff(note) === staffIndex && !hasChordMarker(note))
    .reduce((sum, note) => sum + parsePositiveInt(note.getElementsByTagName('duration')[0]?.textContent, 0), 0);
}

function insertAttributeChildBeforeNotes(measure: XmlElement, child: XmlElement) {
  const firstNote = directElementChildren(measure).find((element) => ['note', 'backup', 'forward'].includes(element.tagName));
  if (firstNote) {
    measure.insertBefore(child, firstNote);
    return;
  }
  measure.appendChild(child);
}

function getOrCreateMeasureAttributes(doc: XmlDocument, measure: XmlElement) {
  const existing = directElementChildren(measure, 'attributes')[0];
  if (existing) return existing;
  const attributes = doc.createElement('attributes');
  insertAttributeChildBeforeNotes(measure, attributes);
  return attributes;
}

function ensureTabStaffAttributes(doc: XmlDocument, measure: XmlElement, tabStaffNumber: number) {
  const attributes = getOrCreateMeasureAttributes(doc, measure);
  const staves = getOrCreateDirectChild(doc, attributes, 'staves');
  const currentStaves = parsePositiveInt(staves.textContent, 1);
  staves.textContent = String(Math.max(currentStaves, tabStaffNumber));

  const existingStaffDetails = Array.from(attributes.getElementsByTagName('staff-details'))
    .find((entry) => parsePositiveInt(entry.getAttribute('number'), 1) === tabStaffNumber);
  const staffDetails = existingStaffDetails ?? doc.createElement('staff-details');
  staffDetails.setAttribute('number', String(tabStaffNumber));
  setTextElement(doc, staffDetails, 'staff-type', 'tab');
  setTextElement(doc, staffDetails, 'staff-lines', '6');
  if (!existingStaffDetails) attributes.appendChild(staffDetails);

  const existingClef = Array.from(attributes.getElementsByTagName('clef'))
    .find((entry) => parsePositiveInt(entry.getAttribute('number'), 1) === tabStaffNumber);
  const clef = existingClef ?? doc.createElement('clef');
  clef.setAttribute('number', String(tabStaffNumber));
  setTextElement(doc, clef, 'sign', 'TAB');
  setTextElement(doc, clef, 'line', '5');
  if (!existingClef) attributes.appendChild(clef);
}

function setNoteStaff(doc: XmlDocument, note: XmlElement, staffIndex: number) {
  setTextElement(doc, note, 'staff', String(staffIndex));
}

function offsetNoteVoice(note: XmlElement, offset: number) {
  const voice = note.getElementsByTagName('voice')[0];
  if (!voice) return;
  voice.textContent = String(parsePositiveInt(voice.textContent, 1) + offset);
}

function appendTabCopiesForMeasure(doc: XmlDocument, measure: XmlElement, sourceStaffNumber: number, tabStaffNumber: number) {
  const tabSourceNotes = directElementChildren(measure, 'note')
    .filter((note) => getNoteStaff(note) === sourceStaffNumber && noteHasStringFret(note));
  if (tabSourceNotes.length === 0) return false;

  const backupDuration = getMeasureDurationForStaff(measure, sourceStaffNumber);
  if (backupDuration > 0) {
    const backup = doc.createElement('backup');
    setTextElement(doc, backup, 'duration', String(backupDuration));
    measure.appendChild(backup);
  }

  tabSourceNotes.forEach((note) => {
    const copy = note.cloneNode(true) as XmlElement;
    setNoteStaff(doc, copy, tabStaffNumber);
    offsetNoteVoice(copy, 4);
    measure.appendChild(copy);
  });
  return true;
}

export function ensureGuitarProTabStaves(xml: string) {
  try {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    let changed = false;

    for (const part of Array.from(doc.getElementsByTagName('part'))) {
      if (Array.from(part.getElementsByTagName('staff-type'))
        .some((staffType) => staffType.textContent?.trim().toLowerCase() === 'tab')) {
        continue;
      }

      const tabCandidateNotes = Array.from(part.getElementsByTagName('note')).filter(noteHasStringFret);
      if (tabCandidateNotes.length === 0) continue;

      const sourceStaffNumber = getNoteStaff(tabCandidateNotes[0]);
      const tabStaffNumber = Math.max(getPartMaxStaff(part) + 1, sourceStaffNumber + 1);
      let partChanged = false;

      for (const measure of directElementChildren(part, 'measure')) {
        ensureTabStaffAttributes(doc, measure, tabStaffNumber);
        partChanged = appendTabCopiesForMeasure(doc, measure, sourceStaffNumber, tabStaffNumber) || partChanged;
      }

      changed = changed || partChanged;
    }

    return changed ? ensureXmlHeader(new XMLSerializer().serializeToString(doc)) : xml;
  } catch {
    return xml;
  }
}

export function musicXmlHasTabStaff(xml: string) {
  try {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    return Array.from(doc.getElementsByTagName('staff-type'))
      .some((staffType) => staffType.textContent?.trim().toLowerCase() === 'tab');
  } catch {
    return false;
  }
}

export function collectGuitarProTechniqueFallbackWarnings(xml: string) {
  try {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const warnings = new Set<string>();
    for (const other of Array.from(doc.getElementsByTagName('other-technical'))) {
      const text = (other.textContent ?? '').trim();
      if (!text.startsWith('gp:')) continue;
      warnings.add(`Preserved Guitar Pro technique fallback: ${text.slice(3)}`);
    }
    return [...warnings].sort();
  } catch {
    return [];
  }
}

function ensureXmlHeader(xml: string) {
  if (xml.startsWith('<?xml')) return xml;
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + xml;
}

/**
 * Legacy renderer fallback: remove TAB-only parts when a source format is known
 * to create broken spacing in OSMD. Guitar Pro imports must not use this path.
 */
export function stripTabParts(xml: string): string {
  try {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const parts = Array.from(doc.getElementsByTagName('part'));

    const tabPartIds = new Set<string>();
    for (const part of parts) {
      const staffTypes = part.getElementsByTagName('staff-type');
      for (let i = 0; i < staffTypes.length; i++) {
        if (staffTypes[i].textContent?.trim().toLowerCase() === 'tab') {
          const id = part.getAttribute('id');
          if (id) tabPartIds.add(id);
          break;
        }
      }
    }

    if (tabPartIds.size === 0) return xml;

    for (const part of parts) {
      if (tabPartIds.has(part.getAttribute('id') ?? '')) {
        part.parentNode?.removeChild(part);
      }
    }

    const scoreParts = Array.from(doc.getElementsByTagName('score-part'));
    for (const scorePart of scoreParts) {
      if (tabPartIds.has(scorePart.getAttribute('id') ?? '')) {
        scorePart.parentNode?.removeChild(scorePart);
      }
    }

    return ensureXmlHeader(new XMLSerializer().serializeToString(doc));
  } catch {
    return xml;
  }
}
