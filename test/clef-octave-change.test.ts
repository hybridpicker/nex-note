import test from 'node:test';
import assert from 'node:assert/strict';
import { DOMParser } from '@xmldom/xmldom';

import { importMusicXmlToCore } from '../src/musicxml-adapter/import/import-musicxml.ts';
import { exportCoreToMusicXml } from '../src/musicxml-adapter/export/export-core-to-musicxml.ts';
import {
  diatonicPitchIndex,
  resolveClefAtMeasure,
  resolveStaffStepPitch,
  topLineDiatonicIndex,
} from '../src/score-input/staff-pitch.ts';

function tenorStaffXml(octaveChange: number | null) {
  const change = octaveChange == null ? '' : `<clef-octave-change>${octaveChange}</clef-octave-change>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list><score-part id="P1"><part-name>Tenor</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line>${change}</clef>
      </attributes>
      <note><rest measure="yes"/><duration>4</duration></note>
    </measure>
  </part>
</score-partwise>`;
}

test('treble clef with octave change -1 puts the top line on F4 (written G clef 8vb)', () => {
  assert.equal(
    topLineDiatonicIndex({ sign: 'G', line: 2, octaveChange: -1 }),
    diatonicPitchIndex('F', 4),
  );
});

test('bass clef with octave change +1 and -1 shift the top line by one octave', () => {
  assert.equal(
    topLineDiatonicIndex({ sign: 'F', line: 4, octaveChange: 1 }),
    diatonicPitchIndex('A', 4),
  );
  assert.equal(
    topLineDiatonicIndex({ sign: 'F', line: 4, octaveChange: -1 }),
    diatonicPitchIndex('A', 2),
  );
});

test('a click on the second space of a treble-8vb staff resolves an octave below plain treble', () => {
  const plain = resolveStaffStepPitch(3, { sign: 'G', line: 2 });
  const eightVb = resolveStaffStepPitch(3, { sign: 'G', line: 2, octaveChange: -1 });
  assert.equal(`${plain.step}${plain.octave}`, 'C5');
  assert.equal(`${eightVb.step}${eightVb.octave}`, 'C4');
});

test('importing a treble-8vb staff keeps the octave change on the resolved clef', () => {
  const document = importMusicXmlToCore(tenorStaffXml(-1));
  const clef = resolveClefAtMeasure(document, 1, 1);
  assert.equal(clef.sign, 'G');
  assert.equal(clef.octaveChange, -1);
});

test('treble-8vb survives a MusicXML export roundtrip', () => {
  const source = tenorStaffXml(-1);
  const xml = exportCoreToMusicXml(source, importMusicXmlToCore(source));
  const parsed = new DOMParser().parseFromString(xml, 'application/xml');
  const clef = parsed.getElementsByTagName('clef')[0]!;
  assert.equal(clef.getElementsByTagName('clef-octave-change')[0]?.textContent, '-1');
});

test('a plain treble clef exports without an octave-change element', () => {
  const source = tenorStaffXml(null);
  const xml = exportCoreToMusicXml(source, importMusicXmlToCore(source));
  const parsed = new DOMParser().parseFromString(xml, 'application/xml');
  assert.equal(parsed.getElementsByTagName('clef-octave-change').length, 0);
});
