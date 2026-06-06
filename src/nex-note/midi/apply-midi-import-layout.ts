import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import type { Document as XmlDocument } from '@xmldom/xmldom';
import type { MidiImportAnalysis } from '@/src/nex-note/midi/analyze-midi';

type XmlElement = ReturnType<XmlDocument['createElement']>;

export interface MidiImportLayoutResult {
  xml: string;
  systemBreaks: number[];
  pageBreaks: number[];
  staffSpacingMeasures: number[];
  profile: MidiImportAnalysis['profile'] | 'unknown';
}

function directChildrenByTag(parent: XmlElement, tagName: string): XmlElement[] {
  const result: XmlElement[] = [];
  for (let i = 0; i < parent.childNodes.length; i += 1) {
    const child = parent.childNodes[i];
    if (child.nodeType === 1 && (child as XmlElement).tagName === tagName) result.push(child as XmlElement);
  }
  return result;
}

function getOrCreateDirectChild(doc: XmlDocument, parent: XmlElement, tagName: string) {
  const existing = directChildrenByTag(parent, tagName)[0];
  if (existing) return existing;
  const next = doc.createElement(tagName);
  const firstMusicalChild = directChildrenByTag(parent, 'attributes')[0]
    ?? directChildrenByTag(parent, 'note')[0]
    ?? directChildrenByTag(parent, 'backup')[0]
    ?? directChildrenByTag(parent, 'forward')[0]
    ?? directChildrenByTag(parent, 'direction')[0];
  if (firstMusicalChild) parent.insertBefore(next, firstMusicalChild);
  else parent.appendChild(next);
  return next;
}

function getMeasureNumber(measure: XmlElement) {
  const parsed = Number.parseInt(measure.getAttribute('number') ?? '', 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function countDirectNotes(measure: XmlElement) {
  return directChildrenByTag(measure, 'note').length;
}

function upsertStaffDistance(doc: XmlDocument, print: XmlElement, value: number) {
  const existing = directChildrenByTag(print, 'staff-layout')[0] ?? doc.createElement('staff-layout');
  if (!existing.parentNode) print.appendChild(existing);
  const distance = directChildrenByTag(existing, 'staff-distance')[0] ?? doc.createElement('staff-distance');
  distance.textContent = String(value);
  if (!distance.parentNode) existing.appendChild(distance);
}

function layoutProfile(analysis?: MidiImportAnalysis | null) {
  const profile = analysis?.profile ?? 'unknown';
  if (profile === 'ensemble') return { systemInterval: 4, pageInterval: 20, staffDistance: 116, denseThreshold: 18 };
  if (profile === 'piano') return { systemInterval: 5, pageInterval: 25, staffDistance: 112, denseThreshold: 16 };
  if (profile === 'lead-sheet') return { systemInterval: 8, pageInterval: 40, staffDistance: 92, denseThreshold: 14 };
  return { systemInterval: 6, pageInterval: 30, staffDistance: 104, denseThreshold: 16 };
}

export function applyMidiImportLayout(xml: string, analysis?: MidiImportAnalysis | null): MidiImportLayoutResult {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const profile = layoutProfile(analysis);
  const measuresByNumber = new Map<number, XmlElement[]>();

  Array.from(doc.getElementsByTagName('measure')).forEach((measure) => {
    Array.from((measure as XmlElement).getElementsByTagName('print')).forEach((print) => {
      print.removeAttribute('new-system');
      print.removeAttribute('new-page');
    });
    const measureNumber = getMeasureNumber(measure as XmlElement);
    if (measureNumber == null) return;
    const existing = measuresByNumber.get(measureNumber) ?? [];
    existing.push(measure as XmlElement);
    measuresByNumber.set(measureNumber, existing);
  });

  const measureNumbers = Array.from(measuresByNumber.keys()).sort((a, b) => a - b);
  const systemBreaks: number[] = [];
  const pageBreaks: number[] = [];
  const staffSpacingMeasures: number[] = [];

  measureNumbers.forEach((measureNumber, index) => {
    if (index > 0 && index % profile.systemInterval === 0) systemBreaks.push(measureNumber);
    const dense = (measuresByNumber.get(measureNumber) ?? []).some((measure) => countDirectNotes(measure) >= profile.denseThreshold);
    if (dense) staffSpacingMeasures.push(measureNumber);
  });

  const spacingSet = new Set(staffSpacingMeasures.slice(0, (analysis?.noteCount ?? 0) > 4000 ? 160 : 320));
  const systemSet = new Set(systemBreaks);
  const pageSet = new Set(pageBreaks);

  measureNumbers.forEach((measureNumber) => {
    const shouldTouch = systemSet.has(measureNumber) || pageSet.has(measureNumber) || spacingSet.has(measureNumber);
    if (!shouldTouch) return;
    for (const measure of measuresByNumber.get(measureNumber) ?? []) {
      const print = getOrCreateDirectChild(doc, measure, 'print');
      if (systemSet.has(measureNumber)) print.setAttribute('new-system', 'yes');
      if (pageSet.has(measureNumber)) print.setAttribute('new-page', 'yes');
      if (spacingSet.has(measureNumber)) upsertStaffDistance(doc, print, profile.staffDistance);
    }
  });

  const serialized = new XMLSerializer().serializeToString(doc);
  return {
    xml: serialized.startsWith('<?xml') ? serialized : `<?xml version="1.0" encoding="UTF-8"?>\n${serialized}`,
    systemBreaks,
    pageBreaks,
    staffSpacingMeasures: Array.from(spacingSet),
    profile: analysis?.profile ?? 'unknown',
  };
}
