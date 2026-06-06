import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { DOMParser, type Element as XmlElement } from '@xmldom/xmldom';

import { importMusicXmlToCore } from '../src/musicxml-adapter/import/import-musicxml.ts';
import { exportCoreToMusicXml } from '../src/musicxml-adapter/export/export-core-to-musicxml.ts';

type StructuralFingerprint = {
  parts: number;
  measures: number;
  staves: number;
  notes: number;
  pitches: number;
  rests: number;
  ties: number;
  slurs: number;
  technical: number;
  strings: number;
  frets: number;
  bends: number;
  slides: number;
  harmonics: number;
  mutes: number;
  otherTechnical: number;
};

const TRACKED_KEYS: Array<keyof StructuralFingerprint> = [
  'parts',
  'measures',
  'staves',
  'notes',
  'pitches',
  'rests',
  'ties',
  'slurs',
  'technical',
  'strings',
  'frets',
  'bends',
  'slides',
  'harmonics',
  'mutes',
  'otherTechnical',
];

function loadFixture(name: string) {
  return readFileSync(path.join(process.cwd(), 'test', 'fixtures', 'roundtrip', name), 'utf8');
}

function parseMusicXml(xml: string) {
  return new DOMParser().parseFromString(xml, 'application/xml');
}

function directElementChildren(parent: XmlElement, tagName?: string) {
  return Array.from(parent.childNodes)
    .filter((child): child is XmlElement => child.nodeType === 1 && (!tagName || (child as XmlElement).tagName === tagName));
}

function countElements(parent: XmlElement | Document, tagName: string) {
  return parent.getElementsByTagName(tagName).length;
}

function staffCountForPart(part: XmlElement) {
  let maxStaff = 1;
  for (const staves of Array.from(part.getElementsByTagName('staves'))) {
    const parsed = Number.parseInt(staves.textContent ?? '', 10);
    if (Number.isFinite(parsed)) maxStaff = Math.max(maxStaff, parsed);
  }
  for (const staff of Array.from(part.getElementsByTagName('staff'))) {
    const parsed = Number.parseInt(staff.textContent ?? '', 10);
    if (Number.isFinite(parsed)) maxStaff = Math.max(maxStaff, parsed);
  }
  return maxStaff;
}

function structuralFingerprint(xml: string): StructuralFingerprint {
  const doc = parseMusicXml(xml);
  const parts = directElementChildren(doc.documentElement as XmlElement, 'part');
  const measures = parts.flatMap((part) => directElementChildren(part, 'measure'));

  return {
    parts: parts.length,
    measures: measures.length,
    staves: parts.reduce((sum, part) => sum + staffCountForPart(part), 0),
    notes: countElements(doc, 'note'),
    pitches: countElements(doc, 'pitch'),
    rests: countElements(doc, 'rest'),
    ties: countElements(doc, 'tie'),
    slurs: countElements(doc, 'slur'),
    technical: countElements(doc, 'technical'),
    strings: countElements(doc, 'string'),
    frets: countElements(doc, 'fret'),
    bends: countElements(doc, 'bend'),
    slides: countElements(doc, 'slide'),
    harmonics: countElements(doc, 'harmonic'),
    mutes: countElements(doc, 'mute'),
    otherTechnical: countElements(doc, 'other-technical'),
  };
}

function diffFingerprints(source: StructuralFingerprint, exported: StructuralFingerprint) {
  return TRACKED_KEYS
    .filter((key) => source[key] !== exported[key])
    .map((key) => ({
      key,
      source: source[key],
      exported: exported[key],
    }));
}

test('real-score roundtrip diff preserves structural MusicXML semantics', () => {
  const sourceXml = loadFixture('guitar-technique-roundtrip.musicxml');
  const exportedXml = exportCoreToMusicXml(sourceXml, importMusicXmlToCore(sourceXml));
  const source = structuralFingerprint(sourceXml);
  const exported = structuralFingerprint(exportedXml);
  const diff = diffFingerprints(source, exported);

  assert.deepEqual(diff, [], `roundtrip structural diff:\n${JSON.stringify({ source, exported, diff }, null, 2)}`);
});
